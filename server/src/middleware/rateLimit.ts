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
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}

export async function checkRateLimit(
  key: string,
  maxRequests = 60,
  windowSeconds = 60,
): Promise<{ allowed: boolean; count: number; max: number }> {
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

