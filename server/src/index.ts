import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';

import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import pushRoutes from './routes/push.js';
import logsRoutes from './routes/logs.js';
import apiRoutes from './routes/api.js';
import apiKeysRoutes from './routes/apiKeys.js';
import { startCron } from './cron/checkAlerts.js';
import { db } from './db.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || ['http://localhost:8080'],
  credentials: true,
}));
app.use('*', bodyLimit({ maxSize: 1024 * 1024 })); // 1MB max request body

// Health check — verifies DB connectivity
app.get('/api/health', async (c) => {
  try {
    await db.query('SELECT 1');
    return c.json({ status: 'ok', db: 'ok', version: '0.1.25' });
  } catch (err) {
    console.error('[SipWise] Health check failed:', err);
    return c.json({ status: 'degraded', db: 'error', version: '0.1.25' }, 503);
  }
});

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/data', dataRoutes);
app.route('/api/push-subscriptions', pushRoutes);
app.route('/api/logs', logsRoutes);
app.route('/api/bac', apiRoutes);
app.route('/api/keys', apiKeysRoutes);

// 404 fallback
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('[SipWise] Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

const port = parseInt(process.env.PORT || '3000', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[SipWise] API server running on http://localhost:${info.port}`);
  startCron();
});
