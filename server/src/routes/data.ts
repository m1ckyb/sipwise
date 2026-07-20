import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import type { Env } from '../types.js';

const PutDataSchema = z.object({
  profile: z.any().optional(),
  drinks: z.any().optional(),
  presets: z.any().optional(),
  is_sober: z.boolean().optional(),
});

const data = new Hono<Env>();
data.use('*', authMiddleware);

data.get('/', async (c) => {
  const userId = c.get('userId') as string;
  const { rows } = await db.query(
    'SELECT profile, drinks, presets, is_sober, updated_at FROM sipwise_user_data WHERE id = $1',
    [userId],
  );
  if (rows.length === 0) return c.json({ error: 'No data found' }, 404);
  return c.json(rows[0]);
});

data.put('/', async (c) => {
  const userId = c.get('userId') as string;
  const parsed = PutDataSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const body = parsed.data;

  await db.query(
    `INSERT INTO sipwise_user_data (id, profile, drinks, presets, is_sober, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET
       profile = COALESCE(EXCLUDED.profile, sipwise_user_data.profile),
       drinks = COALESCE(EXCLUDED.drinks, sipwise_user_data.drinks),
       presets = COALESCE(EXCLUDED.presets, sipwise_user_data.presets),
       is_sober = COALESCE(EXCLUDED.is_sober, sipwise_user_data.is_sober),
       updated_at = now()`,
    [userId, body.profile ?? null, body.drinks ?? null, body.presets ?? null, body.is_sober ?? true],
  );

  return c.json({ success: true });
});

export default data;
