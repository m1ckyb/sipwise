import cron from 'node-cron';
import { db } from '../db.js';
import { calculateBAC, type Drink, type Profile } from '../utils/bac.js';
import { vapidConfigured, webpush } from '../utils/vapid.js';

async function checkAlerts() {
  if (!vapidConfigured) return;

  try {
    console.log('[SipWise Cron] Checking BAC levels for active users...');

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

    for (const user of users) {
      if (!user.profile || !user.drinks) continue;

      const profile: Profile = user.profile;
      const drinks: Drink[] = user.drinks;
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
            console.error(`Failed to send push to ${sub.endpoint}:`, err);
            if (err && typeof err === 'object' && 'statusCode' in err && (err as Record<string, unknown>).statusCode === 410) {
              await db.query('DELETE FROM sipwise_push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
            }
          }
        }

        await db.query('UPDATE sipwise_user_data SET is_sober = true WHERE id = $1', [user.id]);
      } else if (!isSoberNow && wasSober) {
        await db.query('UPDATE sipwise_user_data SET is_sober = false WHERE id = $1', [user.id]);
      }
    }

    if (alertsSent > 0) {
      console.log(`[SipWise Cron] Sent ${alertsSent} sober alerts.`);
    }
  } catch (err) {
    console.error('[SipWise Cron] Error checking alerts:', err);
  }
}

export function startCron() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', checkAlerts);
  console.log('[SipWise Cron] Sober alert checker scheduled (every 5 minutes).');
}
