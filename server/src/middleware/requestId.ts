import crypto from 'node:crypto';
import type { MiddlewareHandler } from 'hono/types';

export const requestId: MiddlewareHandler = async (c, next) => {
  const id = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId' as never, id);
  c.header('x-request-id', id);
  await next();
};
