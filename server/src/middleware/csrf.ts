import type { MiddlewareHandler } from 'hono/types';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export const csrfProtection: MiddlewareHandler = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return next();
  }

  if (allowedOrigins.length === 0) return next();

  const origin = c.req.header('origin');
  const referer = c.req.header('referer');

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (!allowedOrigins.includes(originUrl.origin)) {
        return c.json({ error: 'CSRF validation failed: invalid origin' }, 403);
      }
    } catch {
      return c.json({ error: 'CSRF validation failed: malformed origin' }, 403);
    }
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (!allowedOrigins.includes(refererUrl.origin)) {
        return c.json({ error: 'CSRF validation failed: invalid referer' }, 403);
      }
    } catch {
      return c.json({ error: 'CSRF validation failed: malformed referer' }, 403);
    }
  }

  await next();
};
