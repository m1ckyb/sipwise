import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono, Context, Next } from 'hono';
import dataRoutes from './data.js';
import { db } from '../db.js';

vi.mock('../db.js', () => ({
  db: { query: vi.fn() },
}));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: Context, next: Next) => { c.set('userId', 'mock-user-id'); await next(); },
}));

const app = new Hono();
app.route('/api/v1/data', dataRoutes);

describe('Data Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/v1/data - returns user data', async () => {
    (db.query as import('vitest').Mock).mockResolvedValue({ rows: [{ profile: '{}', drinks: '[]', presets: '[]' }] });
    const res = await app.request('/api/v1/data');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('drinks');
  });
});
