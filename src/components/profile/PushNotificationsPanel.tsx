import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../utils/supabase';
import { 
  isPushSupported, 
  requestNotificationPermission, 
  subscribeUserToPush, 
  unsubscribeUserFromPush, 
  triggerLocalTestNotification,
  syncSubscriptionToSupabase
} from '../../utils/notifications';

const PushNotificationsPanel: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionEndpoint, setSubscriptionEndpoint] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'local' | 'error' | null>(null);
  const [testNotificationTimer, setTestNotificationTimer] = useState<number | null>(null);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(0);

  useEffect(() => {
    const checkSupportAndState = async () => {
      const supported = isPushSupported();
      setPushSupported(supported);
      
      if (supported) {
        setNotificationPermission(Notification.permission);
        
        try {
          const registration = await navigator.serviceWorker.ready;
          const sub = await registration.pushManager.getSubscription();
          setIsSubscribed(!!sub);
          if (sub) {
            setSubscriptionEndpoint(sub.endpoint);
            if (user) {
              const { data, error } = await supabase
                .from('push_subscriptions')
                .select('*')
                .eq('endpoint', sub.endpoint)
                .maybeSingle();
              if (data && !error) {
                setSyncStatus('synced');
              } else {
                setSyncStatus('local');
              }
            } else {
              setSyncStatus('local');
            }
          }
        } catch (err) {
          console.error('Error checking push subscription state:', err);
        }
      }
    };
    
    checkSupportAndState();
  }, [user]);

  const handleToggleNotifications = async () => {
    try {
      if (isSubscribed) {
        const success = await unsubscribeUserFromPush();
        if (success) {
          setIsSubscribed(false);
          setSubscriptionEndpoint(null);
          setSyncStatus(null);
          showToast('Successfully unsubscribed from push notifications.', 'success');
        } else {
          showToast('Failed to unsubscribe from push notifications. Please try again.', 'error');
        }
      } else {
        const perm = await requestNotificationPermission();
        setNotificationPermission(perm);
        if (perm === 'granted') {
          const sub = await subscribeUserToPush();
          if (sub) {
            setIsSubscribed(true);
            setSubscriptionEndpoint(sub.endpoint);
            const synced = await syncSubscriptionToSupabase(sub);
            setSyncStatus(synced ? 'synced' : 'local');
            showToast('Successfully subscribed to push notifications!', 'success');
          } else {
            showToast('Failed to subscribe to push notifications. Please try again.', 'error');
          }
        } else {
          showToast('Notification permission denied. Please enable notifications in your browser settings.', 'error');
        }
      }
    } catch (err: any) {
      console.error('Notification toggle error:', err);
      showToast(`Something went wrong with push notifications: ${err.message || err}`, 'error');
    }
  };

  const handleSendTestNotification = async (delay: number) => {
    try {
      if (delay > 0) {
        setTimerSecondsLeft(delay);
        setTestNotificationTimer(delay);
        const interval = setInterval(() => {
          setTimerSecondsLeft((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              setTestNotificationTimer(null);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        await triggerLocalTestNotification(delay);
        showToast(`Test notification scheduled in ${delay} seconds. Make sure to minimize the app.`, 'info');
      } else {
        await triggerLocalTestNotification(0);
      }
    } catch (err) {
      console.error('Test notification error:', err);
      showToast('Failed to send test notification. Please check that notifications are enabled.', 'error');
    }
  };

  return (
    <div className={`form-section ${isOpen ? 'open' : 'collapsed'}`}>
      <button 
        type="button" 
        className="section-title-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="section-title">
          <span>🔔</span> Push Notifications
        </div>
        <span className="chevron">▶</span>
      </button>
      <div className="section-content-wrapper">
        <div className="section-content">
          <div className="section-content-inner">
            {!pushSupported ? (
              <div className="notifications-alert error-box">
                <strong>Push Notifications are not supported in this browser.</strong>
                <p className="help-text">
                  On iOS, you must first add this app to your Home Screen to enable Push Notifications.
                </p>
              </div>
            ) : (
              <div className="notifications-container">
                <div className="notification-status-row">
                  <div className="status-info">
                    <span className="label">Status</span>
                    <strong>
                      {notificationPermission === 'denied' 
                        ? '🚫 Blocked (Permission Denied)' 
                        : isSubscribed 
                        ? '✅ Enabled' 
                        : '💤 Disabled'}
                    </strong>
                    {isSubscribed && syncStatus && (
                      <span className={`sync-badge ${syncStatus}`}>
                        {syncStatus === 'synced' ? '☁️ Synced to Cloud' : '💻 Local Only'}
                      </span>
                    )}
                  </div>
                  
                  <button 
                    type="button"
                    className={`btn ${isSubscribed ? 'btn-outline' : 'btn-primary'}`}
                    onClick={handleToggleNotifications}
                    disabled={notificationPermission === 'denied'}
                    style={isSubscribed ? { borderColor: 'var(--error)', color: 'var(--error)', flex: 'none' } : { flex: 'none' }}
                  >
                    {isSubscribed ? 'Disable' : 'Enable'}
                  </button>
                </div>

                {notificationPermission === 'denied' && (
                  <p className="help-text error-text" style={{ marginTop: '8px' }}>
                    Please reset notification permissions in your browser settings to enable notifications.
                  </p>
                )}

                {isSubscribed && (
                  <div className="notification-details">
                    <div className="details-group">
                      <span className="label">Device Subscription Endpoint</span>
                      <code className="endpoint-box">{subscriptionEndpoint || 'Loading...'}</code>
                    </div>
                    
                    <div className="test-notification-section">
                      <span className="label">Test Notification</span>
                      <p className="help-text">Verify notifications work. Click the delayed option and minimize the app or lock your screen.</p>
                      <div className="test-buttons">
                        <button 
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleSendTestNotification(0)}
                          disabled={testNotificationTimer !== null}
                        >
                          Send Now
                        </button>
                        <button 
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleSendTestNotification(5)}
                          disabled={testNotificationTimer !== null}
                        >
                          {testNotificationTimer !== null 
                            ? `Sending in ${timerSecondsLeft}s...` 
                            : 'Send in 5 Seconds'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PushNotificationsPanel;
