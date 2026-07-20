import { db } from '../db.js';

export async function checkRateLimit(
  key: string,
  maxRequests = 60,
  windowSeconds = 60,
): Promise<{ allowed: boolean; count: number; max: number }> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  // Purge expired entries (batch cleanup)
  await db.query('DELETE FROM sipwise_rate_limits WHERE window_start < $1', [windowStart]);

  // Increment or insert — if the window expired, reset count to 1
  const { rows } = await db.query(
    `INSERT INTO sipwise_rate_limits (key, request_count, window_start)
     VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       request_count = CASE
         WHEN sipwise_rate_limits.window_start < $2 THEN 1
         ELSE sipwise_rate_limits.request_count + 1
       END,
       window_start = CASE
         WHEN sipwise_rate_limits.window_start < $2 THEN now()
         ELSE sipwise_rate_limits.window_start
       END
     RETURNING request_count`,
    [key, windowStart],
  );

  const count: number = rows[0].request_count;
  return { allowed: count <= maxRequests, count, max: maxRequests };
}
