import { getCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
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

/** Derives a stable, non-reversible identifier for a JWT — safe to store in the DB. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function authMiddleware(c: Context<Env>, next: Next) {
  // Allow API key fallback for the /bac endpoint if present
  const authHeader = c.req.header('Authorization');
  let token = getCookie(c, 'access_token');

  // Fallback for API clients using Bearer tokens (or tests)
  if (!token && authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    return c.json({ error: 'Missing or invalid token' }, 401);
  }

  try {
    const payload = verifyToken(token);
    c.set('userId', payload.sub);

    // Check if token hash is blacklisted (only after signature is validated)
    const tokenHash = hashToken(token);
    const { rows } = await db.query(
      'SELECT 1 FROM sipwise_token_blacklist WHERE token_hash = $1',
      [tokenHash]
    );
    if (rows.length > 0) {
      return c.json({ error: 'Token is revoked' }, 401);
    }

    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
