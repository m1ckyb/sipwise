import { useState } from 'react';
import { useAppContext } from '../../context/AppContext';

function AppModePanel() {
  const { profile, setProfile } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);

  const currentMode = profile.appMode || 'normal';

  const handleModeChange = (mode: 'normal' | 'inventory') => {
    setProfile({ ...profile, appMode: mode });
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
          <span>⚙️</span> App Mode
        </div>
        <span className="chevron">▶</span>
      </button>
      <div className="section-content-wrapper">
        <div className="section-content">
          <div className="section-content-inner">
            <div className="form-group">
              <label>Select Operation Mode</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
                <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--border-radius)', cursor: 'pointer', background: currentMode === 'normal' ? 'rgba(3,218,198,0.05)' : 'transparent' }}>
                  <input
                    type="radio"
                    name="appMode"
                    value="normal"
                    checked={currentMode === 'normal'}
                    onChange={() => handleModeChange('normal')}
                    style={{ width: 'auto' }}
                  />
                  <div>
                    <strong>Standard Logger Only</strong>
                    <p className="help-text" style={{ margin: 0 }}>Simply log the drinks you consume. Ideal for quick and easy tracking.</p>
                  </div>
                </label>
                <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-sm)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--border-radius)', cursor: 'pointer', background: currentMode === 'inventory' ? 'rgba(3,218,198,0.05)' : 'transparent' }}>
                  <input
                    type="radio"
                    name="appMode"
                    value="inventory"
                    checked={currentMode === 'inventory'}
                    onChange={() => handleModeChange('inventory')}
                    style={{ width: 'auto' }}
                  />
                  <div>
                    <strong>Inventory Stock Mode</strong>
                    <p className="help-text" style={{ margin: 0 }}>Manage a digital alcohol inventory/stock and automatically deduct drinks as you consume them.</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppModePanel;
