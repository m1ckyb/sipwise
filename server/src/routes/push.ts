import { Hono } from 'hono';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const push = new Hono();
push.use('*', authMiddleware);

push.get('/check/:endpoint', async (c) => {
  const endpoint = c.req.param('endpoint');
  const { rows } = await db.query(
    'SELECT endpoint FROM sipwise_push_subscriptions WHERE endpoint = $1',
    [endpoint],
  );
  return c.json({ synced: rows.length > 0 });
});

push.post('/', async (c) => {
  const userId = c.get('userId') as string;
  const { endpoint, subscription } = await c.req.json<{
    endpoint: string;
    subscription: unknown;
  }>();

  if (!endpoint || !subscription) {
    return c.json({ error: 'endpoint and subscription are required' }, 400);
  }

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
  const endpoint = decodeURIComponent(c.req.param('endpoint'));
  await db.query('DELETE FROM sipwise_push_subscriptions WHERE endpoint = $1', [endpoint]);
  return c.json({ success: true });
});

export default push;
