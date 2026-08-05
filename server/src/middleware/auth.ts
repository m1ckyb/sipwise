import type { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import type { Env } from '../types.js';

if (!process.env.JWT_SECRET) {
  console.error('[SipWise] FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('[SipWise] FATAL: JWT_SECRET must be at least 32 characters. Refusing to start.');
  process.exit(1);
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export interface JwtPayload {
  sub: string;
  email: string;
}

import { db } from '../db.js';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function authMiddleware(c: Context<Env>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    c.set('userId', payload.sub);

    // Check if token is blacklisted only after signature is validated
    const { rows } = await db.query(
      'SELECT 1 FROM sipwise_token_blacklist WHERE token = $1',
      [token]
    );
    if (rows.length > 0) {
      return c.json({ error: 'Token is revoked' }, 401);
    }

    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
