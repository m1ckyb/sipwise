import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const apiKeys = new Hono();
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
  const { name } = await c.req.json<{ name: string }>();

  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  // Generate a random API key
  const rawKey = `sw_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);

  const { rows } = await db.query(
    'INSERT INTO sipwise_api_keys (user_id, name, key_hash, key_prefix) VALUES ($1, $2, $3, $4) RETURNING id, name, key_prefix, created_at',
    [userId, name, keyHash, keyPrefix],
  );

  // Return the raw key ONCE — it cannot be retrieved again
  return c.json({ key: rawKey, record: rows[0] });
});

apiKeys.delete('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const keyId = c.req.param('id');
  await db.query('DELETE FROM sipwise_api_keys WHERE id = $1 AND user_id = $2', [keyId, userId]);
  return c.json({ success: true });
});

export default apiKeys;
