import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import apiKeysRoutes from './apiKeys.js';
import { db } from '../db.js';

vi.mock('../db.js', () => ({
  db: { query: vi.fn() },
}));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: any, next: any) => { c.set('userId', 'mock-user-id'); await next(); },
}));

const app = new Hono();
app.route('/api/v1/keys', apiKeysRoutes);

describe('API Key Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/v1/keys - lists keys', async () => {
    (db.query as any).mockResolvedValue({ rows: [{ id: 'test-id', name: 'Test Key' }] });
    const res = await app.request('/api/v1/keys');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys).toBeDefined();
  });
});
