import { db } from '../db.js';
import { logger } from './logger.js';

export async function logAuditEvent(
  userId: string,
  action: string,
  details?: Record<string, unknown>,
  ipAddress?: string,
) {
  try {
    await db.query(
      'INSERT INTO sipwise_audit_trail (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
      [userId, action, details ? JSON.stringify(details) : null, ipAddress ?? null],
    );
  } catch (err) {
    logger.error({ err, userId, action }, 'Failed to write audit trail');
  }
}
