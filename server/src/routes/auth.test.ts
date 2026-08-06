/**
 * Integration tests for /api/v1/auth routes.
 * DB and dependencies are mocked so no real database is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// --- Mock all side-effect modules before importing the routes ---
process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long!!';

vi.mock('../db.js', () => ({
  db: { query: vi.fn() },
}));
vi.mock('../middleware/rateLimit.js', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 1, max: 60, remaining: 59, resetAt: Date.now() + 60000 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('../utils/audit.js', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import authRoutes from './auth.js';
import { db } from '../db.js';
import { checkRateLimit } from '../middleware/rateLimit.js';

const mockDb = db as unknown as { query: ReturnType<typeof vi.fn> };
const mockRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

// Mount routes on a fresh app for each test
function buildApp() {
  const app = new Hono();
  app.route('/api/v1/auth', authRoutes);
  return app;
}

// Helper — make a typed JSON request
function jsonReq(app: Hono, method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return app.fetch(new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

// Shared valid credentials
const VALID_EMAIL = 'test@example.com';
const VALID_PASSWORD = 'Password1';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('POST /api/v1/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ allowed: true, count: 1, max: 10, remaining: 9, resetAt: Date.now() + 60000 });
  });

  it('returns 200 and a token on successful signup', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })                          // existing email check → not found
      .mockResolvedValueOnce({ rows: [{ id: USER_ID, email: VALID_EMAIL }] }); // insert user

    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/signup', {
      email: VALID_EMAIL,
      password: VALID_PASSWORD,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    const cookies = res.headers.get('set-cookie');
    expect(cookies).toMatch(/access_token=/);
    expect(cookies).toMatch(/refresh_token=/);
    expect(body.user.email).toBe(VALID_EMAIL);
  });

  it('returns 409 when email already exists', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: USER_ID }] }); // existing email found

    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/signup', {
      email: VALID_EMAIL,
      password: VALID_PASSWORD,
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already exists/i);
  });

  it('returns 400 on invalid email format', async () => {
    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/signup', {
      email: 'not-an-email',
      password: VALID_PASSWORD,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too weak (no uppercase)', async () => {
    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/signup', {
      email: VALID_EMAIL,
      password: 'nouppercase1',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/uppercase/i);
  });

  it('returns 400 when password is too weak (no digit)', async () => {
    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/signup', {
      email: VALID_EMAIL,
      password: 'NoDigitHere',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/digit/i);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, count: 11, max: 10, remaining: 0, resetAt: Date.now() + 60000 });

    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/signup', {
      email: VALID_EMAIL,
      password: VALID_PASSWORD,
    });
    expect(res.status).toBe(429);
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ allowed: true, count: 1, max: 15, remaining: 14, resetAt: Date.now() + 60000 });
  });

  it('returns 200 and a token on successful login', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash(VALID_PASSWORD, 4); // low rounds for speed in tests

    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: USER_ID, email: VALID_EMAIL, password_hash: hash }],
    });

    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/login', {
      email: VALID_EMAIL,
      password: VALID_PASSWORD,
    });

    expect(res.status).toBe(200);
    const cookies = res.headers.get('set-cookie');
    expect(cookies).toMatch(/access_token=/);
    expect(cookies).toMatch(/refresh_token=/);
  });

  it('returns 401 for wrong password', async () => {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('CorrectPass1', 4);

    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: USER_ID, email: VALID_EMAIL, password_hash: hash }],
    });

    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/login', {
      email: VALID_EMAIL,
      password: 'WrongPass1',
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 401 for unknown email', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no user found

    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/login', {
      email: 'unknown@example.com',
      password: VALID_PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing password', async () => {
    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/login', {
      email: VALID_EMAIL,
    });
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, count: 16, max: 15, remaining: 0, resetAt: Date.now() + 60000 });

    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/login', {
      email: VALID_EMAIL,
      password: VALID_PASSWORD,
    });
    expect(res.status).toBe(429);
  });
});

describe('GET /api/v1/auth/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns user data with a valid JWT', async () => {
    // Generate a real token using the middleware's signToken
    process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long!!';
    const { signAccessToken } = await import('../middleware/auth.js');
    const token = signAccessToken({ sub: USER_ID, email: VALID_EMAIL });

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })  // blacklist check → not blacklisted
      .mockResolvedValueOnce({ rows: [{ id: USER_ID, email: VALID_EMAIL }] }); // SELECT user

    const app = buildApp();
    const res = await jsonReq(app, 'GET', '/api/v1/auth/me', undefined, {
      Authorization: `Bearer ${token}`,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.email).toBe(VALID_EMAIL);
  });

  it('returns 401 with no Authorization header', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/v1/auth/me'));
    expect(res.status).toBe(401);
  });

  it('returns 401 with a tampered token', async () => {
    const app = buildApp();
    const res = await jsonReq(app, 'GET', '/api/v1/auth/me', undefined, {
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.tampered.signature',
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long!!';
  });

  it('blacklists the token and returns success', async () => {
    const { signAccessToken } = await import('../middleware/auth.js');
    const token = signAccessToken({ sub: USER_ID, email: VALID_EMAIL });

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })  // blacklist check in authMiddleware
      .mockResolvedValueOnce({ rows: [] }); // INSERT into blacklist

    const app = buildApp();
    const res = await jsonReq(app, 'POST', '/api/v1/auth/logout', undefined, {
      Authorization: `Bearer ${token}`,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Verify the INSERT was called with the token hash (not raw token)
    const blacklistCall = mockDb.query.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('sipwise_token_blacklist')
    );
    expect(blacklistCall).toBeDefined();
    // The stored value should be a SHA-256 hex string (64 chars), not the raw JWT
    expect(blacklistCall![1][0]).toHaveLength(64);
    expect(blacklistCall![1][0]).not.toContain('.');
  });

  it('returns 200 with no Authorization header (idempotent)', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/v1/auth/logout', { method: 'POST' }));
    expect(res.status).toBe(200);
  });
});
