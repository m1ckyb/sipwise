import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db.js';
import { checkRateLimit, getClientIp } from '../middleware/rateLimit.js';
import type { Env } from '../types.js';

const LogSchema = z.object({
  error_message: z.string().min(1).max(500, 'Error message exceeds max length'),
  stack_trace: z.string().max(4096, 'Stack trace exceeds max length').optional(),
  source: z.string().max(50, 'Source name exceeds max length').optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

const logs = new Hono<Env>();

function sanitizeObject(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('key') ||
      lowerKey.includes('auth') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('credential') ||
      lowerKey.includes('email')
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function sanitizeString(str: string): string {
  return str
    .replace(/bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(password|token|key|secret|auth|credential|email)["'\s]*[:=]["'\s]*([a-zA-Z0-9\-._~+/]+)/gi, '$1="[REDACTED]"');
}

logs.post('/', async (c) => {
  const ip = getClientIp(c);
  const rateLimitResult = await checkRateLimit(`rate_limit_logs:${ip}`, 30, 60);
  if (!rateLimitResult.allowed) {
    c.header('X-RateLimit-Limit', rateLimitResult.max.toString());
    c.header('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    c.header('Retry-After', Math.ceil(Math.max(0, rateLimitResult.resetAt - Date.now()) / 1000).toString());
    return c.json({ error: 'Too many log submissions. Rate limit exceeded.' }, 429);
  }

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

  const sanitizedMessage = sanitizeString(error_message);
  const sanitizedStackTrace = stack_trace ? sanitizeString(stack_trace) : null;
  const sanitizedContext = context ? sanitizeObject(context) : null;

  await db.query(
    'INSERT INTO sipwise_error_logs (user_id, error_message, stack_trace, source, context) VALUES ($1, $2, $3, $4, $5)',
    [
      userId,
      sanitizedMessage,
      sanitizedStackTrace,
      source ?? 'frontend',
      sanitizedContext ? JSON.stringify(sanitizedContext) : null
    ],
  );

  return c.json({ success: true });
});

export default logs;

