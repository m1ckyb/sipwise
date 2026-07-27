import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.js';
import { signToken, authMiddleware, verifyToken } from '../middleware/auth.js';
import { checkRateLimit, getClientIp } from '../middleware/rateLimit.js';
import { logAuditEvent } from '../utils/audit.js';
import { logger } from '../utils/logger.js';
import type { Env } from '../types.js';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

const SignupSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/[0-9]/, 'Password must include at least one digit'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const auth = new Hono<Env>();

auth.post('/signup', async (c) => {
  const ip = getClientIp(c);
  const rateLimitResult = await checkRateLimit(`rate_limit_signup:${ip}`, 10, 60);
  if (!rateLimitResult.allowed) {
    return c.json({ error: 'Too many signup attempts. Please try again later.' }, 429);
  }

  const parsed = SignupSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const { email, password } = parsed.data;

  const existing = await db.query('SELECT id FROM sipwise_users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Single atomic CTE query creating user and user_data in one transaction
  const { rows } = await db.query(
    `WITH new_user AS (
       INSERT INTO sipwise_users (email, password_hash) VALUES ($1, $2)
       RETURNING id, email
     ),
     new_data AS (
       INSERT INTO sipwise_user_data (id, profile, drinks, presets)
       SELECT id, NULL, NULL, NULL FROM new_user
     )
     SELECT id, email FROM new_user`,
    [email.toLowerCase(), passwordHash],
  );
  const user = rows[0];

  await logAuditEvent(user.id, 'signup', { email: user.email }, c.req.header('x-forwarded-for') || undefined);

  const token = signToken({ sub: user.id, email: user.email });
  return c.json({ token, user: { id: user.id, email: user.email } });
});

auth.post('/login', async (c) => {
  const ip = getClientIp(c);
  const rateLimitResult = await checkRateLimit(`rate_limit_login:${ip}`, 15, 60);
  if (!rateLimitResult.allowed) {
    return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
  }

  const parsed = LoginSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }
  const { email, password } = parsed.data;

  const { rows } = await db.query(
    'SELECT id, email, password_hash FROM sipwise_users WHERE email = $1',
    [email.toLowerCase()],
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    logger.warn({ email: email.toLowerCase() }, 'Failed login attempt');
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  await logAuditEvent(user.id, 'login', { email: user.email }, c.req.header('x-forwarded-for') || undefined);

  const token = signToken({ sub: user.id, email: user.email });
  return c.json({ token, user: { id: user.id, email: user.email } });
});

auth.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const { rows } = await db.query('SELECT id, email FROM sipwise_users WHERE id = $1', [userId]);
  if (rows.length === 0) return c.json({ error: 'User not found' }, 404);
  return c.json({ user: rows[0] });
});

auth.post('/logout', authMiddleware, async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = verifyToken(token);
      const expiresAt = new Date((decoded as unknown as { exp: number }).exp * 1000);
      await db.query(
        'INSERT INTO sipwise_token_blacklist (token, expires_at) VALUES ($1, $2) ON CONFLICT (token) DO NOTHING',
        [token, expiresAt.toISOString()]
      );
      const userId = c.get('userId') as string;
      await logAuditEvent(userId, 'logout', { token_prefix: token.slice(0, 10) });
    } catch {
      // Decode or query failed — proceed anyway
    }
  }
  return c.json({ success: true });
});

export default auth;
