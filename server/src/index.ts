import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { logger as honoLogger } from 'hono/logger';
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status'],
  buckets: [10, 50, 100, 500, 1000, 5000],
  registers: [register],
});

import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import pushRoutes from './routes/push.js';
import logsRoutes from './routes/logs.js';
import apiRoutes from './routes/api.js';
import apiKeysRoutes from './routes/apiKeys.js';
import { startCron, stopCron } from './cron/checkAlerts.js';
import { db } from './db.js';
import { logger } from './utils/logger.js';
import { requestId } from './middleware/requestId.js';
import { csrfProtection } from './middleware/csrf.js';

const app = new Hono();

// Middleware — order matters
app.use('*', requestId);

app.use('*', async (c, next) => {
  if (c.req.path === '/api/metrics' || c.req.path === '/api/health') return next();
  const start = performance.now();
  await next();
  const duration = performance.now() - start;
  const status = c.res.status;
  // Normalize routes to avoid explosion of metrics cardinality (e.g. /api/push-subscriptions/123 -> /api/push-subscriptions/:id)
  let route = c.req.path;
  if (route.startsWith('/api/keys/')) route = '/api/keys/:id';
  else if (route.startsWith('/api/push-subscriptions/')) route = '/api/push-subscriptions/:endpoint';
  
  httpRequestsTotal.inc({ method: c.req.method, route, status });
  httpRequestDurationMs.observe({ method: c.req.method, route, status }, duration);
});
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co; " +
    "img-src 'self' data:; " +
    "font-src 'self'; " +
    "frame-ancestors 'none';"
  );
  await next();
});
app.use('*', honoLogger());
app.use('*', cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || ['http://localhost:8080'],
  credentials: true,
}));
app.use('*', bodyLimit({ maxSize: 1024 * 1024 }));
app.use('*', csrfProtection);

// Health check — verifies DB connectivity
app.get('/api/health', async (c) => {
  try {
    await db.query('SELECT 1');
    return c.json({ status: 'ok', db: 'ok', version: '0.2.0-rc3' });
  } catch (err) {
    logger.error({ err }, 'Health check failed');
    return c.json({ status: 'degraded', db: 'error', version: '0.2.0-rc3' }, 503);
  }
});

app.get('/api/metrics', async (c) => {
  c.header('Content-Type', register.contentType);
  return c.body(await register.metrics());
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
  logger.error({ err }, 'Unhandled error');
  return c.json({ error: 'Internal server error' }, 500);
});

const port = parseInt(process.env.PORT || '3000', 10);

const server: ServerType = serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'SipWise API server started');
  startCron();
});

// Graceful shutdown
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully...');

  stopCron();

  server.close(() => {
    logger.info('HTTP server closed');
    db.end().then(() => {
      logger.info('Database pool closed');
      process.exit(0);
    }).catch((err) => {
      logger.error({ err }, 'Error closing database pool');
      process.exit(1);
    });
  });

  // Force shutdown after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception');
  process.exit(1);
});

