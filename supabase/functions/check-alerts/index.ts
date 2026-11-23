import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import webpush from "npm:web-push@3.6.6"
import { calculateBAC } from "../_shared/bac.ts"

const VAPID_PUBLIC_KEY = Deno.env.get('VITE_VAPID_PUBLIC_KEY') || Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_CONTACT_EMAIL = Deno.env.get('VAPID_CONTACT_EMAIL') || 'mailto:support@sipwise.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_CONTACT_EMAIL,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i] ^ bb[i];
  }
  return diff === 0;
}

serve(async (req: Request) => {
  // Prevent unauthorized access: require CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY (fail closed)
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!cronSecret && !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured: missing CRON_SECRET" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const authHeader = req.headers.get('authorization') || '';
  const customCronHeader = req.headers.get('x-cron-secret') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const isAuthorized =
    Boolean(cronSecret && ((customCronHeader && timingSafeEqualStr(customCronHeader, cronSecret)) || (token && timingSafeEqualStr(token, cronSecret)))) ||
    Boolean(serviceRoleKey && token && timingSafeEqualStr(token, serviceRoleKey));

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized access" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured." }), { status: 500 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("Checking BAC levels for active users...");

  // Fetch users with push subscriptions
  const { data: subscriptionsData, error: subError } = await supabase
    .from('push_subscriptions')
    .select('user_id, subscription, endpoint');

  if (subError || !subscriptionsData) {
    console.error("Error fetching subscriptions:", subError);
    return new Response(JSON.stringify({ error: "Error fetching subscriptions" }), { status: 500 });
  }

  console.log(`Found ${subscriptionsData.length} push subscriptions.`);

  const subsByUser = new Map<string, typeof subscriptionsData>();
  for (const sub of subscriptionsData) {
    if (!sub.user_id) continue;
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  }
  const userIds = [...subsByUser.keys()];
  console.log(`Unique users with subscriptions: ${userIds.length}`);

  if (userIds.length === 0) {
    return new Response(JSON.stringify({ message: "No users with push subscriptions." }), { status: 200 });
  }

  // Fetch user_data for these users
  const { data: usersData, error: userError } = await supabase
    .from('user_data')
    .select('id, profile, drinks, is_sober')
    .in('id', userIds);

  if (userError || !usersData) {
    console.error("Error fetching user data:", userError);
    return new Response(JSON.stringify({ error: "Error fetching user data" }), { status: 500 });
  }

  console.log(`Fetched user_data for ${usersData.length} users.`);

  let alertsSent = 0;

  for (const user of usersData) {
    if (!user.profile || !user.drinks) continue;

    // Normalize drink timestamps (convert string ISO dates to milliseconds timestamp)
    const rawDrinks = Array.isArray(user.drinks) ? user.drinks : [];
    const normalizedDrinks = rawDrinks.map((d: { id?: string; timestamp?: number | string; volume?: number; abv?: number; name?: string }) => ({
      ...d,
      timestamp: typeof d.timestamp === 'string' ? new Date(d.timestamp).getTime() : Number(d.timestamp || 0)
    }));

    const currentBAC = calculateBAC(normalizedDrinks, user.profile);
    const wasSober = user.is_sober ?? true;
    const isSoberNow = currentBAC === 0;

    let mostRecentDrinkTime = 0;
    for (const d of normalizedDrinks) {
      if (d.timestamp > mostRecentDrinkTime) mostRecentDrinkTime = d.timestamp;
    }
    const hasRecentDrink = (Date.now() - mostRecentDrinkTime) < 24 * 3600000;

    // State transition: user became sober (or was drinking within 24h but is_sober wasn't flipped to false yet)
    if (isSoberNow && (!wasSober || (hasRecentDrink && user.is_sober === null))) {
      const userSubs = subsByUser.get(user.id) ?? [];
      let deliveredOrGone = false;

      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            sub.subscription,
            JSON.stringify({
              title: 'Sober Alert! 🎉',
              body: 'Your estimated BAC is now back to 0.00%. You are sober!'
            })
          );
          alertsSent++;
          deliveredOrGone = true;
        } catch (err: unknown) {
          console.error(`Failed to send notification:`, err);
          const statusCode = err && typeof err === 'object' && 'statusCode' in err
            ? (err as Record<string, unknown>).statusCode
            : undefined;
          if (statusCode === 410 || statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            deliveredOrGone = true;
          }
        }
      }

      if (deliveredOrGone || userSubs.length === 0) {
        await supabase.from('user_data').update({ is_sober: true, updated_at: new Date().toISOString() }).eq('id', user.id);
      }
    }
    // State transition: user started drinking
    else if (!isSoberNow && wasSober) {
      await supabase.from('user_data').update({ is_sober: false, updated_at: new Date().toISOString() }).eq('id', user.id);
    }
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: `Checked ${usersData.length} users. Sent ${alertsSent} alerts.` 
  }), { 
    headers: { "Content-Type": "application/json" } 
  });
})
