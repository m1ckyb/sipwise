import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
if (!VAPID_PUBLIC_KEY) {
  console.error(
    '[SipWise] VITE_VAPID_PUBLIC_KEY is not set. Push notifications will not work. ' +
    'Add it to your .env file or GitHub Actions secrets.'
  );
}


// Helper to convert VAPID public key to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Check if push notifications are supported by the browser
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'showNotification' in ServiceWorkerRegistration.prototype
  );
}

// Request permission to send notifications
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    throw new Error('Notifications are not supported in this browser.');
  }
  return await Notification.requestPermission();
}

// Subscribe user to push notifications
export async function subscribeUserToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Push notifications are not configured. VAPID key is missing.');
  }

  const registration = await navigator.serviceWorker.ready;
  
  // Check if subscription already exists
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey,
    });
  }

  // Attempt to sync to Supabase
  await syncSubscriptionToSupabase(subscription);

  return subscription;
}

// Unsubscribe user from push notifications
export async function unsubscribeUserFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    // Delete from Supabase first
    await deleteSubscriptionFromSupabase(subscription.endpoint);
    // Unsubscribe on push server
    return await subscription.unsubscribe();
  }

  return false;
}

// Sync subscription to Supabase user_data or push_subscriptions table
export async function syncSubscriptionToSupabase(subscription: PushSubscription): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    // We attempt to save to a dedicated table called `push_subscriptions`.
    // If the table doesn't exist yet, this will error, but we catch it gracefully.
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        endpoint: subscription.endpoint,
        user_id: userId,
        subscription: subscription.toJSON(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'endpoint'
      });

    if (error) {
      console.warn('Could not sync push subscription to Supabase cloud. Make sure the `push_subscriptions` table exists.', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error syncing push subscription to Supabase:', err);
    return false;
  }
}

// Delete subscription from Supabase
export async function deleteSubscriptionFromSupabase(endpoint: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
      console.warn('Could not delete push subscription from Supabase:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error deleting push subscription from Supabase:', err);
    return false;
  }
}

// Trigger a test notification locally (immediately or delayed)
export async function triggerLocalTestNotification(delaySeconds: number = 0): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Notifications are not supported in this browser.');
  }

  if (Notification.permission !== 'granted') {
    throw new Error('Notification permission has not been granted.');
  }

  const trigger = async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('SipWise Test', {
      body: 'This is a test notification from your service worker!',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      vibrate: [100, 50, 100],
      data: { url: window.location.origin + '/' },
    } as NotificationOptions);
  };

  if (delaySeconds > 0) {
    setTimeout(trigger, delaySeconds * 1000);
  } else {
    await trigger();
  }
}
