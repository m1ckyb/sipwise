import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import type { Env } from '../types.js';

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url('Invalid push endpoint URL'),
  subscription: z.any(),
});

const push = new Hono<Env>();
push.use('*', authMiddleware);

push.get('/check/:endpoint', async (c) => {
  const userId = c.get('userId') as string;
  const endpoint = c.req.param('endpoint');
  const { rows } = await db.query(
    'SELECT endpoint FROM sipwise_push_subscriptions WHERE endpoint = $1 AND user_id = $2',
    [endpoint, userId],
  );
  return c.json({ synced: rows.length > 0 });
});

push.post('/', async (c) => {
  const userId = c.get('userId') as string;
  const parsed = PushSubscriptionSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const { endpoint, subscription } = parsed.data;

  await db.query(
    `INSERT INTO sipwise_push_subscriptions (endpoint, user_id, subscription, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       subscription = EXCLUDED.subscription,
       updated_at = now()`,
    [endpoint, userId, JSON.stringify(subscription)],
  );

  return c.json({ success: true });
});

push.delete('/:endpoint', async (c) => {
  const userId = c.get('userId') as string;
  const endpoint = decodeURIComponent(c.req.param('endpoint'));
  await db.query(
    'DELETE FROM sipwise_push_subscriptions WHERE endpoint = $1 AND user_id = $2',
    [endpoint, userId],
  );
  return c.json({ success: true });
});

export default push;
