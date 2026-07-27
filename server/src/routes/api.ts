import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db.js';
import { checkRateLimit } from '../middleware/rateLimit.js';
import { calculateBAC, calculateTimeToZero, estimateCalories, type Drink, type Profile } from '../utils/bac.js';
import type { Env } from '../types.js';

const api = new Hono<Env>();

function corsHeaders(origin: string | null | undefined) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowedOrigins.length > 0
    ? (origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0])
    : origin || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-api-key, x-idempotency-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

api.options('*', (c) => {
  const origin = c.req.header('origin');
  return new Response('ok', { headers: corsHeaders(origin) });
});

async function authenticateApiKey(c: Request): Promise<{ userId: string; keyId: string } | null> {
  const apiKey = c.headers.get('x-api-key');
  if (!apiKey) return null;

  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const { rows } = await db.query(
    'SELECT id, user_id FROM sipwise_api_keys WHERE key_hash = $1',
    [keyHash],
  );
  if (rows.length === 0) return null;

  db.query('UPDATE sipwise_api_keys SET last_used_at = now() WHERE id = $1', [rows[0].id])
    .catch(err => {
      console.error('[SipWise] Failed to update api key last_used_at:', err);
    });

  return { userId: rows[0].user_id, keyId: rows[0].id };
}

api.get('/bac', async (c) => {
  const origin = c.req.header('origin');
  const headers = corsHeaders(origin);

  const auth = await authenticateApiKey(c.req.raw);
  if (!auth) {
    return c.json({ error: 'Invalid API key' }, 401, headers);
  }

  const rateLimitResult = await checkRateLimit(`rate_limit:${auth.userId}`);
  if (!rateLimitResult.allowed) {
    return c.json({ error: 'Too many requests. Rate limit exceeded (60 req/min).' }, 429, headers);
  }

  const { rows } = await db.query(
    'SELECT profile, drinks FROM sipwise_user_data WHERE id = $1',
    [auth.userId],
  );
  if (rows.length === 0) {
    return c.json({ error: 'User data not found' }, 404, headers);
  }

  const profile: Profile = rows[0].profile;
  const drinks: Drink[] = rows[0].drinks || [];
  const now = Date.now();

  const parsedDrinks = drinks.map(d => ({
    ...d,
    timestamp: typeof d.timestamp === 'string' ? new Date(d.timestamp).getTime() : d.timestamp,
  }));

  const currentBac = calculateBAC(parsedDrinks, profile, now);
  const timeToZero = calculateTimeToZero(parsedDrinks, profile, now);

  parsedDrinks.sort((a, b) => b.timestamp - a.timestamp);
  const recentDrinks24h = parsedDrinks.filter(d => (now - d.timestamp) < 24 * 3_600_000);

  const url = new URL(c.req.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  return c.json({
    current_bac: parseFloat(currentBac.toFixed(4)),
    time_to_zero_hours: parseFloat(timeToZero.toFixed(2)),
    is_sober: currentBac <= 0,
    recent_drinks_24h_count: recentDrinks24h.length,
    last_drink_time: parsedDrinks.length > 0 ? new Date(parsedDrinks[0].timestamp).toISOString() : null,
    unit: profile.displayUnit || '%',
    drinks: parsedDrinks.slice(0, limit).map(d => ({
      ...d,
      calories: d.calories ?? estimateCalories(d.volume, d.abv),
      timestamp_iso: new Date(d.timestamp).toISOString(),
    })),
  }, 200, headers);
});

const AddDrinkSchema = z.object({
  action: z.literal('add_drink'),
  volume: z.number().positive('Volume must be positive'),
  abv: z.number().min(0).max(100, 'ABV must be 0-100'),
  name: z.string().max(200).optional(),
  timestamp: z.string().datetime().optional(),
  calories: z.number().nonnegative().optional(),
});

api.post('/bac', async (c) => {
  const origin = c.req.header('origin');
  const headers = corsHeaders(origin);

  const auth = await authenticateApiKey(c.req.raw);
  if (!auth) {
    return c.json({ error: 'Invalid API key' }, 401, headers);
  }

  const rateLimitResult = await checkRateLimit(`rate_limit:${auth.userId}`);
  if (!rateLimitResult.allowed) {
    return c.json({ error: 'Too many requests. Rate limit exceeded (60 req/min).' }, 429, headers);
  }

  const parsed = AddDrinkSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400, headers);
  }
  const body = parsed.data;

  // Idempotency check
  const idempotencyKey = c.req.header('x-idempotency-key');
  if (idempotencyKey) {
    const { rows: existing } = await db.query(
      'SELECT response_body FROM sipwise_idempotency_keys WHERE key = $1 AND user_id = $2',
      [idempotencyKey, auth.userId],
    );
    if (existing.length > 0 && existing[0].response_body) {
      return c.json(existing[0].response_body, { headers });
    }
  }

  const { rows } = await db.query('SELECT drinks, profile FROM sipwise_user_data WHERE id = $1', [auth.userId]);
  if (rows.length === 0) {
    return c.json({ error: 'User data not found' }, 404, headers);
  }

  const drinks: Drink[] = rows[0].drinks || [];
  const now = Date.now();

  const newDrink: Drink = {
    id: crypto.randomUUID(),
    timestamp: body.timestamp ? new Date(body.timestamp).getTime() : now,
    volume: body.volume,
    abv: body.abv,
    name: body.name || 'API Drink',
    calories: body.calories,
  };

  drinks.push(newDrink);

  await db.query(
    'UPDATE sipwise_user_data SET drinks = $1, updated_at = now() WHERE id = $2',
    [JSON.stringify(drinks), auth.userId],
  );

  const profile: Profile = rows[0].profile;
  const currentBac = calculateBAC(drinks, profile, now);
  const timeToZero = calculateTimeToZero(drinks, profile, now);

  const responsePayload = {
    current_bac: parseFloat(currentBac.toFixed(4)),
    time_to_zero_hours: parseFloat(timeToZero.toFixed(2)),
    is_sober: currentBac <= 0,
    recent_drinks_24h_count: drinks.filter(d => (now - d.timestamp) < 24 * 3_600_000).length,
    last_drink_time: new Date(newDrink.timestamp).toISOString(),
    added_drink: {
      ...newDrink,
      calories: newDrink.calories ?? estimateCalories(newDrink.volume, newDrink.abv),
      timestamp_iso: new Date(newDrink.timestamp).toISOString(),
    },
  };

  if (idempotencyKey) {
    db.query(
      'INSERT INTO sipwise_idempotency_keys (key, user_id, response_body) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
      [idempotencyKey, auth.userId, JSON.stringify(responsePayload)],
    ).catch(err => {
      console.error('[SipWise] Failed to save idempotency key response:', err);
    });
  }

  return c.json(responsePayload, { headers });
});

export default api;
