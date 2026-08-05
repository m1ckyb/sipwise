import cron from 'node-cron';
import { db } from '../db.js';
import { calculateBAC, type Drink, type Profile } from '../utils/bac.js';
import { decryptData } from '../utils/crypto.js';
import { vapidConfigured, webpush } from '../utils/vapid.js';
import { logger } from '../utils/logger.js';

const scheduledTasks: cron.ScheduledTask[] = [];

const CHECK_ALERTS_LOCK_ID = 8675309;

async function checkAlerts() {
  if (!vapidConfigured) return;

  try {
    const lockResult = await db.query('SELECT pg_try_advisory_lock($1) as acquired', [CHECK_ALERTS_LOCK_ID]);
    if (!lockResult.rows[0]?.acquired) {
      logger.debug('Another instance is currently checking alerts; skipping.');
      return;
    }

    try {
      logger.info('Checking BAC levels for active users');

      const { rows: subscriptions } = await db.query(
        'SELECT user_id, subscription, endpoint FROM sipwise_push_subscriptions',
      );

      if (subscriptions.length === 0) return;

      const userIds = [...new Set(subscriptions.map(s => s.user_id).filter(Boolean))];
      if (userIds.length === 0) return;

      const { rows: users } = await db.query(
        'SELECT id, profile, drinks, is_sober FROM sipwise_user_data WHERE id = ANY($1)',
        [userIds],
      );

      let alertsSent = 0;
      const soberIds: string[] = [];
      const activeIds: string[] = [];

      for (const user of users) {
        if (!user.profile || !user.drinks) continue;

        const profile = decryptData(user.profile, user.id) as Profile | null;
        const drinks = (decryptData(user.drinks, user.id) as Drink[]) || [];

        if (!profile) continue;

        const currentBAC = calculateBAC(drinks, profile);
        const wasSober = user.is_sober ?? true;
        const isSoberNow = currentBAC === 0;

        if (isSoberNow && !wasSober) {
          const userSubs = subscriptions.filter(s => s.user_id === user.id);

          for (const sub of userSubs) {
            try {
              await webpush.sendNotification(
                sub.subscription,
                JSON.stringify({
                  title: 'Sober Alert!',
                  body: 'Your estimated BAC is now back to 0.00%. You are sober!',
                }),
              );
              alertsSent++;
            } catch (err: unknown) {
              logger.error({ err, endpoint: sub.endpoint }, 'Failed to send push notification');
              if (err && typeof err === 'object' && 'statusCode' in err && (err as Record<string, unknown>).statusCode === 410) {
                await db.query('DELETE FROM sipwise_push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
              }
            }
          }

          soberIds.push(user.id);
        } else if (!isSoberNow && wasSober) {
          activeIds.push(user.id);
        }
      }

      if (soberIds.length > 0) {
        await db.query('UPDATE sipwise_user_data SET is_sober = true, updated_at = now() WHERE id = ANY($1)', [soberIds]);
      }
      if (activeIds.length > 0) {
        await db.query('UPDATE sipwise_user_data SET is_sober = false, updated_at = now() WHERE id = ANY($1)', [activeIds]);
      }

      if (alertsSent > 0) {
        logger.info({ alertsSent }, 'Sent sober alerts');
      }
    } finally {
      await db.query('SELECT pg_advisory_unlock($1)', [CHECK_ALERTS_LOCK_ID]).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, 'Error checking alerts');
  }
}

async function cleanupIdempotencyKeys() {
  try {
    const { rowCount } = await db.query(
      "DELETE FROM sipwise_idempotency_keys WHERE created_at < now() - interval '7 days'",
    );
    if (rowCount && rowCount > 0) {
      logger.info({ deleted: rowCount }, 'Cleaned up expired idempotency keys');
    }
  } catch (err) {
    logger.error({ err }, 'Error cleaning up idempotency keys');
  }
}

async function cleanupRateLimitEntries() {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM sipwise_rate_limits WHERE window_start < now() - interval \'2 hours\'',
    );
    if (rowCount && rowCount > 0) {
      logger.info({ deleted: rowCount }, 'Cleaned up stale rate limit entries');
    }
  } catch (err) {
    logger.error({ err }, 'Error cleaning up rate limit entries');
  }
}

export function startCron() {
  scheduledTasks.push(cron.schedule('*/5 * * * *', checkAlerts));
  scheduledTasks.push(cron.schedule('0 3 * * *', cleanupIdempotencyKeys));
  scheduledTasks.push(cron.schedule('0 * * * *', cleanupRateLimitEntries));

  logger.info('Cron jobs scheduled (alerts/5min, idempotency/daily, rate limits/hourly)');
}

export function stopCron() {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;
}
