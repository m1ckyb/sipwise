import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db.js';
import type { Env } from '../types.js';

const LogSchema = z.object({
  error_message: z.string().min(1),
  stack_trace: z.string().optional(),
  source: z.string().optional(),
  context: z.any().optional(),
});

const logs = new Hono<Env>();

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

  const parsed = LogSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const { error_message, stack_trace, source, context } = parsed.data;

  await db.query(
    'INSERT INTO sipwise_error_logs (user_id, error_message, stack_trace, source, context) VALUES ($1, $2, $3, $4, $5)',
    [userId, error_message, stack_trace ?? null, source ?? 'frontend', context ? JSON.stringify(context) : null],
  );

  return c.json({ success: true });
});

export default logs;
