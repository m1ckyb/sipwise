import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken } from '../middleware/auth.js';

const auth = new Hono();

auth.post('/signup', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const existing = await db.query('SELECT id FROM sipwise_users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    'INSERT INTO sipwise_users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email.toLowerCase(), passwordHash],
  );
  const user = rows[0];

  // Create empty user_data row
  await db.query(
    'INSERT INTO sipwise_user_data (id, profile, drinks, presets) VALUES ($1, NULL, NULL, NULL)',
    [user.id],
  );

  const token = signToken({ sub: user.id, email: user.email });
  return c.json({ token, user: { id: user.id, email: user.email } });
});

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const { rows } = await db.query(
    'SELECT id, email, password_hash FROM sipwise_users WHERE email = $1',
    [email.toLowerCase()],
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

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
