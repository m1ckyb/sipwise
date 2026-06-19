import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const ReloadPrompt: React.FC = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      console.log('SW Registered: ', r);
    },
    onRegisterError(error: Error | any) {
      console.log('SW registration error', error);
    },
  });

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
