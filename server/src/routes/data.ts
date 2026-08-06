import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { encryptData, decryptData, DecryptionError } from '../utils/crypto.js';
import type { Env } from '../types.js';

const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  abv: z.number().min(0).max(100),
  type: z.enum(['container', 'individual']),
  unitVolume: z.number().positive(),
  quantity: z.number().nonnegative(),
  remainingVolume: z.number().nonnegative(),
  calories: z.number().nonnegative().optional(),
  bottles: z.array(z.number().positive()).optional(),
  activeContainerVolume: z.number().positive().optional(),
});

const ProfileSchema = z.object({
  weight: z.number().positive(),
  gender: z.enum(['male', 'female']),
  metabolismRate: z.number().positive(),
  displayUnit: z.enum(['%', '‰']),
  height: z.number().positive(),
  age: z.number().positive(),
  absorptionModel: z.enum(['instant', 'physiological']).optional(),
  appMode: z.enum(['normal', 'inventory']).optional(),
  quickDrink: z.object({
    name: z.string().max(200),
    volume: z.number().positive(),
    abv: z.number().min(0).max(100),
    calories: z.number().nonnegative().optional(),
  }).optional(),
  inventory: z.array(InventoryItemSchema).optional(),
  shotSize: z.number().positive().optional(),
});

const DrinkSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.number().positive(),
  volume: z.number().positive(),
  abv: z.number().min(0).max(100),
  name: z.string().max(200).optional(),
  calories: z.number().nonnegative().optional(),
});

const PresetSchema = z.object({
  name: z.string().max(200),
  volume: z.number().positive(),
  abv: z.number().min(0).max(100),
  calories: z.number().nonnegative().optional(),
});

const PutDataSchema = z.object({
  profile: ProfileSchema.optional(),
  drinks: z.array(DrinkSchema).optional(),
  presets: z.array(PresetSchema).optional(),
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
  
  try {
    const decryptedData = {
      profile: decryptData(rows[0].profile, userId),
      drinks: decryptData(rows[0].drinks, userId),
      presets: decryptData(rows[0].presets, userId),
      is_sober: rows[0].is_sober,
      updated_at: rows[0].updated_at,
    };
    return c.json(decryptedData);
  } catch (err) {
    if (err instanceof DecryptionError) {
      return c.json({
        error: 'Your data could not be decrypted. This may be caused by a server configuration change. Please contact support — your data is still stored safely.',
        code: 'DECRYPTION_FAILED',
      }, 422);
    }
    throw err;
  }
});

data.put('/', async (c) => {
  const userId = c.get('userId') as string;
  const parsed = PutDataSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const body = parsed.data;

  const encryptedProfile = body.profile !== undefined ? encryptData(body.profile, userId) : undefined;
  const encryptedDrinks = body.drinks !== undefined ? encryptData(body.drinks, userId) : undefined;
  const encryptedPresets = body.presets !== undefined ? encryptData(body.presets, userId) : undefined;

  await db.query(
    `INSERT INTO sipwise_user_data (id, profile, drinks, presets, is_sober, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET
       profile = COALESCE(EXCLUDED.profile, sipwise_user_data.profile),
       drinks = COALESCE(EXCLUDED.drinks, sipwise_user_data.drinks),
       presets = COALESCE(EXCLUDED.presets, sipwise_user_data.presets),
       is_sober = COALESCE(EXCLUDED.is_sober, sipwise_user_data.is_sober),
       updated_at = now()`,
    [
      userId,
      encryptedProfile ? JSON.stringify(encryptedProfile) : null,
      encryptedDrinks ? JSON.stringify(encryptedDrinks) : null,
      encryptedPresets ? JSON.stringify(encryptedPresets) : null,
      body.is_sober !== undefined ? body.is_sober : null
    ],
  );

  return c.json({ success: true });
});

export default data;
