import { Hono } from 'hono';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { logAuditEvent } from '../utils/audit.js';
import type { Env } from '../types.js';

const CreateKeySchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100),
});

const apiKeys = new Hono<Env>();
apiKeys.use('*', authMiddleware);

apiKeys.get('/', async (c) => {
  const userId = c.get('userId') as string;
  const { rows } = await db.query(
    'SELECT id, name, key_prefix, created_at, last_used_at FROM sipwise_api_keys WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return c.json({ keys: rows });
});

apiKeys.post('/', async (c) => {
  const userId = c.get('userId') as string;
  const parsed = CreateKeySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const { name } = parsed.data;

  const rawKey = `sw_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);

  const { rows } = await db.query(
    'INSERT INTO sipwise_api_keys (user_id, name, key_hash, key_prefix) VALUES ($1, $2, $3, $4) RETURNING id, name, key_prefix, created_at',
    [userId, name, keyHash, keyPrefix],
  );

  await logAuditEvent(userId, 'api_key_created', { name, key_id: rows[0].id });

  return c.json({ key: rawKey, record: rows[0] });
});

apiKeys.delete('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const keyId = c.req.param('id');

  const { rows } = await db.query(
    'SELECT id, name FROM sipwise_api_keys WHERE id = $1 AND user_id = $2',
    [keyId, userId],
  );

  await db.query('DELETE FROM sipwise_api_keys WHERE id = $1 AND user_id = $2', [keyId, userId]);

  if (rows.length > 0) {
    await logAuditEvent(userId, 'api_key_deleted', { key_id: keyId, name: rows[0].name });
  }

  return c.json({ success: true });
});

export default apiKeys;
