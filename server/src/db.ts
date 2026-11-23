import pg from 'pg';
import { logger } from './utils/logger.js';

const maxPoolSize = parseInt(process.env.DB_POOL_MAX || '10', 10);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: maxPoolSize,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
  connect: () => pool.connect(),
  end: () => pool.end(),
};
