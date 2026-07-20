import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.js';
import { signToken } from '../middleware/auth.js';
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
  const { rows } = await db.query(
    'INSERT INTO sipwise_users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email.toLowerCase(), passwordHash],
  );
  const user = rows[0];

  await db.query(
    'INSERT INTO sipwise_user_data (id, profile, drinks, presets) VALUES ($1, NULL, NULL, NULL)',
    [user.id],
  );

  await logAuditEvent(user.id, 'signup', { email: user.email }, c.req.header('x-forwarded-for') || undefined);

  const token = signToken({ sub: user.id, email: user.email });
  return c.json({ token, user: { id: user.id, email: user.email } });
});

auth.post('/login', async (c) => {
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

auth.get('/me', async (c) => {
  const userId = c.get('userId') as string;
  const { rows } = await db.query('SELECT id, email FROM sipwise_users WHERE id = $1', [userId]);
  if (rows.length === 0) return c.json({ error: 'User not found' }, 404);
  return c.json({ user: rows[0] });
});

export default auth;
