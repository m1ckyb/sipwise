import type { Context } from 'hono';
import { db } from '../db.js';
import { getConnInfo } from '@hono/node-server/conninfo';

export function getClientIp(c: Context): string {
  const xRealIp = c.req.header('x-real-ip');
  if (xRealIp && process.env.TRUST_PROXY === 'true') {
    return xRealIp;
  }
  
  try {
    const connInfo = getConnInfo(c);
    if (connInfo.remote.address) {
      return connInfo.remote.address;
    }
  } catch {
    /* ignore */
  }
  
  return xRealIp || c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'anon';
}

export async function checkRateLimit(
  key: string,
  maxRequests = 60,
  windowSeconds = 60,
): Promise<{ allowed: boolean; count: number; max: number }> {
  const now = new Date();
  const windowStartLimit = new Date(now.getTime() - windowSeconds * 1000);

  try {
    // 1. Clean up expired keys from the table to prevent infinite table growth
    await db.query('DELETE FROM sipwise_rate_limits WHERE window_start < $1', [windowStartLimit.toISOString()]);

    // 2. Perform atomic increment/upsert query
    const { rows } = await db.query(
      `INSERT INTO sipwise_rate_limits (key, request_count, window_start)
       VALUES ($1, 1, $2)
       ON CONFLICT (key) DO UPDATE SET
         request_count = CASE 
           WHEN sipwise_rate_limits.window_start < $2 THEN 1
           ELSE sipwise_rate_limits.request_count + 1
         END,
         window_start = CASE
           WHEN sipwise_rate_limits.window_start < $2 THEN $2
           ELSE sipwise_rate_limits.window_start
         END
       RETURNING request_count`,
      [key, now.toISOString()],
    );

    const count = rows[0]?.request_count || 1;
    return { allowed: count <= maxRequests, count, max: maxRequests };
  } catch {
    // Fall back to in-memory rate limiter if database is offline or query fails
    return checkRateLimitInMemory(key, maxRequests, windowSeconds);
  }
}

// In-Memory Fallback Implementation
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const memoryStore = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function purgeExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [k, entry] of memoryStore.entries()) {
    if (entry.resetAt <= now) {
      memoryStore.delete(k);
    }
  }
}

function checkRateLimitInMemory(
  key: string,
  maxRequests = 60,
  windowSeconds = 60,
): { allowed: boolean; count: number; max: number } {
  purgeExpiredEntries();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt <= now) {
    const newEntry = { count: 1, resetAt: now + windowMs };
    memoryStore.set(key, newEntry);
    return { allowed: true, count: 1, max: maxRequests };
  }

  entry.count += 1;
  return { allowed: entry.count <= maxRequests, count: entry.count, max: maxRequests };
}
