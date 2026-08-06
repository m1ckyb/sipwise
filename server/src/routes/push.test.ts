import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import pushRoutes from './push.js';
import { db } from '../db.js';

vi.mock('../db.js', () => ({
  db: { query: vi.fn() },
}));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: any, next: any) => { c.set('userId', 'mock-user-id'); await next(); },
}));

const app = new Hono();
app.route('/api/v1/push', pushRoutes);

describe('Push Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/v1/push/check/:endpoint - checks push subscription', async () => {
    (db.query as any).mockResolvedValue({ rows: [{ endpoint: 'test-endpoint' }] });
    const res = await app.request('/api/v1/push/check/test-endpoint');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(true);
  });
});
