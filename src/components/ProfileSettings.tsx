import React from 'react';
import { useAppContext } from '../context/AppContext';
import pkg from '../../package.json';
import BodyMetricsForm from './profile/BodyMetricsForm';
import MetabolismPanel from './profile/MetabolismPanel';
import PresetManager from './profile/PresetManager';
import AuthPanel from './profile/AuthPanel';
import PushNotificationsPanel from './profile/PushNotificationsPanel';
import DataManagerPanel from './profile/DataManagerPanel';

const ProfileSettings: React.FC = () => {
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
        <PresetManager />
        <AuthPanel />
        <PushNotificationsPanel />
        <DataManagerPanel />
      </div>

      <div className="version-info" style={{ textAlign: 'center', marginTop: 'var(--spacing-lg)', opacity: 0.5, fontSize: '0.8rem' }}>
        SipWise v{pkg.version}
      </div>
    </div>
  );
};

export default ProfileSettings;
