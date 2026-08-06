import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import dataRoutes from './data.js';
import { db } from '../db.js';

vi.mock('../db.js', () => ({
  db: { query: vi.fn() },
}));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: any, next: any) => { c.set('userId', 'mock-user-id'); await next(); },
}));

const app = new Hono();
app.route('/api/v1/data', dataRoutes);

describe('Data Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/v1/data - returns user data', async () => {
    (db.query as any).mockResolvedValue({ rows: [{ profile: '{}', drinks: '[]', presets: '[]' }] });
    const res = await app.request('/api/v1/data');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('drinks');
  });
});
