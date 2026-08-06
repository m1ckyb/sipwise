import { lazy, Suspense } from 'react';
import { useAppContext } from '../context/AppContext';
import pkg from '../../package.json';
import AppModePanel from './profile/AppModePanel';
import BodyMetricsForm from './profile/BodyMetricsForm';
import MetabolismPanel from './profile/MetabolismPanel';
import PresetManager from './profile/PresetManager';

const AuthPanel = lazy(() => import('./profile/AuthPanel'));
const PushNotificationsPanel = lazy(() => import('./profile/PushNotificationsPanel'));
const DataManagerPanel = lazy(() => import('./profile/DataManagerPanel'));

function ProfileSettings() {
  const { storageWarning } = useAppContext();

  return (
    <div className="profile-settings">
      <div className="settings-header">
        <h2>Personal Profile</h2>
        <p>Correct weight and gender are essential for accurate BAC estimation using the Widmark formula.</p>
      </div>

      {storageWarning && (
        <div className="storage-warning-banner" role="alert">
          ⚠️ {storageWarning}
        </div>
      )}
      
      <div className="card settings-card">
        <BodyMetricsForm />
        <MetabolismPanel />
        <AppModePanel />
        <PresetManager />
        <Suspense fallback={<div className="panel-loading" style={{ padding: '1rem', opacity: 0.6 }}>Loading settings...</div>}>
          <AuthPanel />
          <PushNotificationsPanel />
          <DataManagerPanel />
        </Suspense>
      </div>

      <div className="version-info" style={{ textAlign: 'center', marginTop: 'var(--spacing-lg)', opacity: 0.5, fontSize: '0.8rem' }}>
        SipWise v{pkg.version} <br />
        <a href="/tos.html" style={{ color: 'inherit' }} target="_blank">Terms of Service</a> | <a href="/privacy.html" style={{ color: 'inherit' }} target="_blank">Privacy Policy</a>
      </div>
    </div>
  );
};

export default ProfileSettings;
