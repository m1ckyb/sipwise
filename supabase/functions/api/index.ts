import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import { calculateBAC, calculateTimeToZero, estimateCalories, Profile, Drink } from "../_shared/bac.ts"

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '*';
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.length > 0 ? (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]) : origin;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SUPABASE_DB_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing x-api-key header' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Hash the incoming key with SHA-256 for secure lookup
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // 1. Verify API key via key_hash (or fallback to key for backwards compatibility)
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('id, user_id')
      .or(`key_hash.eq.${keyHash},key.eq.${apiKey}`)
      .single();

    if (apiKeyError || !apiKeyData) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Update last_used_at asynchronously
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKeyData.id).then();

    const userId = apiKeyData.user_id;

    // 2. Fetch user data
    const { data: userData, error: userError } = await supabase
      .from('user_data')
      .select('profile, drinks')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: 'User data not found' }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const profile: Profile = userData.profile;
    const drinks: Drink[] = userData.drinks || [];
    
    const now = Date.now();

    // ----------------------------------------------------
    // POST REQUEST: Add a drink
    // ----------------------------------------------------
    if (req.method === 'POST') {
      let body;
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      if (body.action === 'add_drink') {
        const { volume, abv, name, timestamp } = body;
        
        if (volume === undefined || abv === undefined) {
          return new Response(JSON.stringify({ error: 'Missing volume or abv' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }

        const newDrink: Drink = {
          id: crypto.randomUUID(),
          timestamp: timestamp ? new Date(timestamp).getTime() : now,
          volume: Number(volume),
          abv: Number(abv),
          name: name || 'API Drink',
          calories: body.calories !== undefined ? Number(body.calories) : undefined
        };

        drinks.push(newDrink);

        // Update database
        const { error: updateError } = await supabase
          .from('user_data')
          .update({ drinks })
          .eq('id', userId);

        if (updateError) {
          throw updateError;
        }

        // Return updated BAC immediately
      } else {
        return new Response(JSON.stringify({ error: 'Unknown action' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }
    }

    // ----------------------------------------------------
    // GET (or post-update) REQUEST: Return current status
    // ----------------------------------------------------
    
    // Parse drinks timestamps
    const parsedDrinks = drinks.map(d => ({
        ...d,
        timestamp: typeof d.timestamp === 'string' ? new Date(d.timestamp).getTime() : d.timestamp
    }));

    // Calculate current BAC and Time to Zero
    const currentBac = calculateBAC(parsedDrinks, profile, now);
    const timeToZero = calculateTimeToZero(parsedDrinks, profile, now);

    // Sort drinks descending by time
    parsedDrinks.sort((a, b) => b.timestamp - a.timestamp);

    const recentDrinks24h = parsedDrinks.filter(d => (now - d.timestamp) < 24 * 60 * 60 * 1000);

    // Limit returned drinks to 50 to prevent huge payloads, or rely on URL query param `limit`
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const payload = {
      current_bac: parseFloat(currentBac.toFixed(4)),
      time_to_zero_hours: parseFloat(timeToZero.toFixed(2)),
      is_sober: currentBac <= 0,
      recent_drinks_24h_count: recentDrinks24h.length,
      last_drink_time: parsedDrinks.length > 0 ? new Date(parsedDrinks[0].timestamp).toISOString() : null,
      unit: profile.displayUnit || '%',
      drinks: parsedDrinks.slice(0, limit).map(d => ({
        ...d,
        calories: d.calories !== undefined ? d.calories : estimateCalories(d.volume, d.abv),
        timestamp_iso: new Date(d.timestamp).toISOString()
      }))
    };

    return new Response(
      JSON.stringify(payload),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})
