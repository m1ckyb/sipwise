import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error: unknown) {
      console.log('SW registration error', error);
    },
  });

  // Periodically check for SW updates so the reload prompt appears promptly
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const check = () => {
      navigator.serviceWorker.getRegistration().then(r => {
        if (r) r.update();
      });
    };
    const interval = setInterval(check, 60 * 60 * 1000); // every hour
    return () => clearInterval(interval);
  }, []);

  // Also check when page regains focus (user switches back to the tab)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then(r => {
          if (r) r.update();
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="reload-prompt-container">
      <div className="reload-prompt-toast">
        <div className="reload-prompt-message">
          {offlineReady 
            ? <span>App ready to work offline</span>
            : <span>New content available, click on reload button to update.</span>
          }
        </div>
        <div className="reload-prompt-buttons">
          {needRefresh && (
            <button className="btn btn-primary" onClick={() => updateServiceWorker(true)}>
              Reload
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => close()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReloadPrompt;
