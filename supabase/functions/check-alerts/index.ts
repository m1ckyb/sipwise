import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import webpush from "npm:web-push@3.6.6"
import { calculateBAC } from "../_shared/bac.ts"

const VAPID_PUBLIC_KEY = Deno.env.get('VITE_VAPID_PUBLIC_KEY') || Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

serve(async (req) => {
  // Prevent unauthorized access, assuming this is invoked by pg_cron or Supabase Scheduled Functions
  // You might want to verify an auth header here in a real production environment.
  
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

  // Get unique user IDs
  const userIds = [...new Set(subscriptionsData.map(sub => sub.user_id).filter(Boolean))];
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
    console.log(`Processing user: ${user.id}`);
    if (!user.profile || !user.drinks) {
      console.log(`Skipping user ${user.id}: Missing profile or drinks.`);
      continue;
    }

    const currentBAC = calculateBAC(user.drinks, user.profile);
    const wasSober = user.is_sober ?? true;
    const isSoberNow = currentBAC === 0;

    console.log(`User ${user.id} -> currentBAC: ${currentBAC}, wasSober: ${wasSober}, isSoberNow: ${isSoberNow}`);

    // State transition: user became sober
    if (isSoberNow && !wasSober) {
      console.log(`User ${user.id} just became sober! Sending alert...`);
      
      const userSubs = subscriptionsData.filter(sub => sub.user_id === user.id);
      
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
          console.log(`Successfully sent push to endpoint: ${sub.endpoint}`);
        } catch (err: any) {
          console.error(`Failed to send notification to ${sub.endpoint}:`, err);
          // If the subscription is gone, we could delete it from the DB
          if (err.statusCode === 410) {
            console.log(`Subscription expired (410). Deleting from DB.`);
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
        }
      }

      // Update state to sober
      await supabase.from('user_data').update({ is_sober: true }).eq('id', user.id);
    } 
    // State transition: user started drinking
    else if (!isSoberNow && wasSober) {
      console.log(`User ${user.id} started drinking. Updating state to not sober.`);
      await supabase.from('user_data').update({ is_sober: false }).eq('id', user.id);
    } else {
      console.log(`User ${user.id} unchanged. (isSoberNow: ${isSoberNow}, wasSober: ${wasSober})`);
    }
    
    // Optional: BAC Reminders (e.g., "Don't forget to log your drinks! Your last drink was 2 hours ago.")
    // Can be added here based on logic.
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: `Checked ${usersData.length} users. Sent ${alertsSent} alerts.` 
  }), { 
    headers: { "Content-Type": "application/json" } 
  });
})
