interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, RateLimitEntry>();

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.windowStart > 120_000) {
      buckets.delete(key);
    }
  }
}

const CLEANUP_INTERVAL = 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL);
  }
}

export function checkRateLimit(
  key: string,
  maxRequests = 60,
  windowSeconds = 60,
): { allowed: boolean; count: number; max: number } {
  ensureCleanup();

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const entry = buckets.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, count: 1, max: maxRequests };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, count: entry.count, max: maxRequests };
  }

  entry.count++;
  return { allowed: true, count: entry.count, max: maxRequests };
}
