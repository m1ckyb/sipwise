import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import { calculateBAC, calculateTimeToZero, estimateCalories, Profile, Drink } from "../_shared/bac.ts"

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.length > 0
    ? (allowedOrigins.includes(origin) ? origin : allowedOrigins[0])
    : '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-idempotency-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
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

    // 1. Verify API key via key_hash
    const { data: apiKeyData } = await supabase
      .from('api_keys')
      .select('id, user_id')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (!apiKeyData) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Update last_used_at
    await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKeyData.id);

    const userId = apiKeyData.user_id;

    // In-database Rate Limiter check (60 req/min per key/user)
    const rateLimitKey = `rate_limit:${userId}`;
    const { data: rateLimitResult, error: rateLimitError } = await supabase.rpc('check_rate_limit', {
      p_key: rateLimitKey,
      p_max_requests: 60,
      p_window_seconds: 60
    });

    if (rateLimitError) {
      console.error('Rate limit RPC failed:', rateLimitError);
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 }
      );
    }

    if (rateLimitResult && rateLimitResult.allowed === false) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Rate limit exceeded (60 req/min).' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

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

    const profile: Profile | null = userData.profile;
    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not initialized. Please complete setup in frontend first.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    const drinks: Drink[] = Array.isArray(userData.drinks) ? userData.drinks : [];

    const now = Date.now();
    const idempotencyKey = req.method === 'POST' ? req.headers.get('x-idempotency-key') : null;

    // ----------------------------------------------------
    // POST REQUEST: Add a drink (with Idempotency Key support)
    // ----------------------------------------------------
    if (req.method === 'POST') {
      if (idempotencyKey) {
        const { data: existingKey } = await supabase
          .from('idempotency_keys')
          .select('response_body')
          .eq('key', idempotencyKey)
          .eq('user_id', userId)
          .maybeSingle();

        if (existingKey?.response_body) {
          return new Response(
            JSON.stringify(existingKey.response_body),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      let body;
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
      }

      if (body.action === 'add_drink') {
        const volume = Number(body.volume);
        const abv = Number(body.abv);
        const parsedTs = body.timestamp !== undefined ? new Date(body.timestamp).getTime() : now;
        const parsedCalories = body.calories !== undefined ? Number(body.calories) : undefined;
        const drinkName = typeof body.name === 'string' && body.name.trim()
          ? body.name.trim().slice(0, 200)
          : 'API Drink';

        if (!Number.isFinite(volume) || volume <= 0 || volume > 10000) {
          return new Response(JSON.stringify({ error: 'Volume must be a positive number (<= 10000 ml)' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }
        if (!Number.isFinite(abv) || abv < 0 || abv > 100) {
          return new Response(JSON.stringify({ error: 'ABV must be between 0 and 100' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }
        if (!Number.isFinite(parsedTs)) {
          return new Response(JSON.stringify({ error: 'Invalid timestamp' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }
        if (parsedCalories !== undefined && (!Number.isFinite(parsedCalories) || parsedCalories < 0)) {
          return new Response(JSON.stringify({ error: 'Calories must be a non-negative number' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }

        const newDrink: Drink = {
          id: crypto.randomUUID(),
          timestamp: parsedTs,
          volume,
          abv,
          name: drinkName,
          calories: parsedCalories
        };

        drinks.push(newDrink);

        const updatedBac = calculateBAC(drinks, profile, now);
        const { error: updateError } = await supabase
          .from('user_data')
          .update({ drinks, is_sober: updatedBac <= 0, updated_at: new Date().toISOString() })
          .eq('id', userId);

        if (updateError) {
          throw updateError;
        }
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

    // Clamp limit to [1, 200]
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 1), 200);

    const payload = {
      current_bac: parseFloat(currentBac.toFixed(4)),
      time_to_zero_hours: parseFloat(timeToZero.toFixed(2)),
      is_sober: currentBac <= 0,
      recent_drinks_24h_count: recentDrinks24h.length,
      last_drink_time: parsedDrinks.length > 0 ? new Date(parsedDrinks[0].timestamp).toISOString() : null,
      unit: profile.displayUnit || '%',
      app_mode: (profile as unknown as Record<string, unknown>).appMode || 'normal',
      inventory: (profile as unknown as Record<string, unknown>).inventory || [],
      drinks: parsedDrinks.slice(0, limit).map(d => ({
        ...d,
        calories: d.calories !== undefined ? d.calories : estimateCalories(d.volume, d.abv),
        timestamp_iso: new Date(d.timestamp).toISOString()
      }))
    };

    if (idempotencyKey) {
      await supabase
        .from('idempotency_keys')
        .upsert({ key: idempotencyKey, user_id: userId, response_body: payload }, { onConflict: 'key', ignoreDuplicates: true });
    }

    return new Response(
      JSON.stringify(payload),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Edge API unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})
