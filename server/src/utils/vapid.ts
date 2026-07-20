import webpush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL || 'mailto:admin@localhost';

export const vapidConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (vapidConfigured) {
  webpush.setVapidDetails(VAPID_CONTACT_EMAIL, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  console.log('[SipWise] VAPID keys loaded — push notifications enabled.');
} else {
  console.warn('[SipWise] VAPID keys not set — push notifications disabled.');
}

export { webpush };
