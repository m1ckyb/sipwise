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
  type?: 'access' | 'refresh';
  exp?: number;
  jti?: string;
}

import { db } from '../db.js';

/** Derives a stable, non-reversible identifier for a JWT — safe to store in the DB. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign({ sub: payload.sub, email: payload.email, type: 'access' }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m',
    jwtid: crypto.randomUUID(),
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ sub: payload.sub, email: payload.email, type: 'refresh' }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
    jwtid: crypto.randomUUID(),
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
}

export async function authMiddleware(c: Context<Env>, next: Next) {
  const authHeader = c.req.header('Authorization');
  let token = getCookie(c, 'access_token');

  // Fallback for API clients using Bearer tokens (or tests)
  if (!token && authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    return c.json({ error: 'Missing or invalid token' }, 401);
  }

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  if (payload.type && payload.type !== 'access') {
    return c.json({ error: 'Invalid token type' }, 401);
  }

  // Check if token hash is blacklisted (only after signature is validated)
  const tokenHash = hashToken(token);
  const { rows } = await db.query(
    'SELECT 1 FROM sipwise_token_blacklist WHERE token_hash = $1',
    [tokenHash]
  );
  if (rows.length > 0) {
    return c.json({ error: 'Token is revoked' }, 401);
  }

  c.set('userId', payload.sub);
  await next();
}
