import { Hono } from 'hono';
import { db } from '../db.js';

const logs = new Hono();

logs.post('/', async (c) => {
  const authHeader = c.req.header('Authorization');
  let userId: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { verifyToken } = await import('../middleware/auth.js');
      const payload = verifyToken(authHeader.slice(7));
      userId = payload.sub;
    } catch {
      // Token invalid — still allow anonymous error logs
    }
  }

  const { error_message, stack_trace, source, context } = await c.req.json<{
    error_message: string;
    stack_trace?: string;
    source?: string;
    context?: unknown;
  }>();

  if (!error_message) {
    return c.json({ error: 'error_message is required' }, 400);
  }

  await db.query(
    'INSERT INTO sipwise_error_logs (user_id, error_message, stack_trace, source, context) VALUES ($1, $2, $3, $4, $5)',
    [userId, error_message, stack_trace ?? null, source ?? 'frontend', context ? JSON.stringify(context) : null],
  );

  return c.json({ success: true });
});

export default logs;
