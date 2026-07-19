import { useRef, useState, type ChangeEvent } from 'react';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../utils/supabase';
import type { Drink, Profile } from '../../utils/bac';
import ConfirmModal from '../ConfirmModal';

function DataManagerPanel() {
  const { profile, drinks, presets, importData, user, showToast } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  const [pickSourceModal, setPickSourceModal] = useState(false);

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ open: true, title, message, onConfirm });
  };
  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, open: false }));

  const handleExport = () => {
    const data = {
      profile,
      drinks,
      presets,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sipwise-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Data exported successfully!', 'success');
  };

  const handleBackupFromCloud = async () => {
    if (!user) {
      showToast('Sign in on the Profile page to access cloud data.', 'error');
      return;
    }
    showToast('Downloading cloud backup...', 'info');
    try {
      const { data, error } = await supabase
        .from('user_data')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        showToast('No cloud data found for your account.', 'error');
        return;
      }

      const backup = {
        profile: data.profile,
        drinks: data.drinks,
        presets: data.presets,
        exportDate: new Date().toISOString(),
        version: '1.0',
        source: 'cloud',
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sipwise-cloud-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Cloud backup downloaded successfully!', 'success');
    } catch (err) {
      console.error('Cloud backup failed:', err);
      showToast('Failed to download cloud backup. Please try again.', 'error');
    }
  };

  const restoreData = (source: string, payload: { profile?: Profile; drinks?: Drink[]; presets?: Omit<Drink, 'id' | 'timestamp'>[] }) => {
    const sourceDrinks: Drink[] = payload.drinks ?? [];
    const sourcePresets: Omit<Drink, 'id' | 'timestamp'>[] = payload.presets ?? [];
    const sourceProfile: Profile | undefined = payload.profile;

    const localDrinkIds = new Set(drinks.map(d => d.id));
    const localPresetNames = new Set(presets.map(p => p.name));

    const missingDrinks = sourceDrinks.filter(d => !localDrinkIds.has(d.id));
    const missingPresets = sourcePresets.filter(p => !localPresetNames.has(p.name));

    if (!missingDrinks.length && !missingPresets.length && !sourceProfile) {
      showToast(`All ${source} data is already present locally.`, 'success');
      return;
    }

    const merged = {
      profile: sourceProfile,
      drinks: [...drinks, ...missingDrinks],
      presets: [...presets, ...missingPresets],
    };

    showConfirm(
      `Restore from ${source}`,
      missingDrinks.length > 0 || missingPresets.length > 0
        ? `Found ${missingDrinks.length} missing drink(s) and ${missingPresets.length} missing preset(s) in ${source}. Restore them?`
        : `${source} has profile data. Restore it?`,
      () => {
        importData(merged);
        showToast(`${source} data restored successfully!`, 'success');
      }
    );
  };

  const handleRestoreFromCloud = async () => {
    setPickSourceModal(false);
    if (!user) {
      showToast('Sign in on the Profile page to access cloud data.', 'error');
      return;
    }
    showToast('Restoring from cloud...', 'info');
    try {
      const { data, error } = await supabase
        .from('user_data')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        showToast('No cloud data found for your account.', 'error');
        return;
      }

      restoreData('cloud', data);
    } catch (err) {
      console.error('Cloud restore failed:', err);
      showToast('Failed to restore from cloud. Please try again.', 'error');
    }
  };

  const handleRestoreFromFileClick = () => {
    setPickSourceModal(false);
    restoreFileInputRef.current?.click();
  };

  const handleRestoreFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!validateRestoreData(parsed)) {
          showToast('Invalid backup file: data failed validation. Please use a valid SipWise export.', 'error');
          return;
        }

        restoreData('file', parsed);
      } catch {
        showToast('Invalid backup file. Please make sure it is a valid JSON file exported from SipWise.', 'error');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  function validateRestoreData(data: unknown): data is Parameters<typeof importData>[0] {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;

    if (d.profile !== undefined) {
      if (typeof d.profile !== 'object' || d.profile === null) return false;
      const p = d.profile as Record<string, unknown>;
      if (!Number.isFinite(p.weight) || (p.weight as number) < 20 || (p.weight as number) > 400) return false;
      if (p.gender !== 'male' && p.gender !== 'female') return false;
      if (!Number.isFinite(p.height) || (p.height as number) < 50 || (p.height as number) > 300) return false;
      if (!Number.isFinite(p.age) || (p.age as number) < 1 || (p.age as number) > 130) return false;
      if (!Number.isFinite(p.metabolismRate) || (p.metabolismRate as number) < 0.001 || (p.metabolismRate as number) > 0.5) return false;
    }

    if (d.drinks !== undefined) {
      if (!Array.isArray(d.drinks)) return false;
      if (d.drinks.length > 10000) return false;
      for (const drink of d.drinks) {
        if (typeof drink !== 'object' || drink === null) return false;
        const dr = drink as Record<string, unknown>;
        if (!Number.isFinite(dr.volume) || (dr.volume as number) < 0 || (dr.volume as number) > 5000) return false;
        if (!Number.isFinite(dr.abv) || (dr.abv as number) < 0 || (dr.abv as number) > 100) return false;
        if (!Number.isFinite(dr.timestamp) || (dr.timestamp as number) <= 0) return false;
      }
    }

    if (d.presets !== undefined) {
      if (!Array.isArray(d.presets)) return false;
      if (d.presets.length > 100) return false;
      for (const preset of d.presets) {
        if (typeof preset !== 'object' || preset === null) return false;
        const pr = preset as Record<string, unknown>;
        if (!Number.isFinite(pr.volume) || (pr.volume as number) < 0 || (pr.volume as number) > 5000) return false;
        if (!Number.isFinite(pr.abv) || (pr.abv as number) < 0 || (pr.abv as number) > 100) return false;
      }
    }

    return true;
  }

  return (
    <div className={`form-section ${isOpen ? 'open' : 'collapsed'}`}>
      <ConfirmModal
        isOpen={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Yes, continue"
        danger={true}
        onConfirm={() => { confirmModal.onConfirm(); closeConfirm(); }}
        onCancel={closeConfirm}
      />

      <button 
        type="button" 
        className="section-title-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="section-title">
          <span>💾</span> Data Management
        </div>
        <span className="chevron">▶</span>
      </button>
      <div className="section-content-wrapper">
        <div className="section-content">
          <div className="section-content-inner">
            <div className="data-buttons">
              <button className="btn btn-secondary" onClick={handleExport}>
                Export Data
              </button>
              <button className="btn btn-secondary" onClick={handleBackupFromCloud}>
                Backup from Cloud
              </button>
              <button className="btn btn-secondary" onClick={() => setPickSourceModal(true)}>
                Restore Data
              </button>
              <input 
                type="file" 
                ref={restoreFileInputRef} 
                style={{ display: 'none' }} 
                accept=".json"
                onChange={handleRestoreFileChange}
                aria-label="Upload Backup JSON File for Restore"
              />
            </div>

            {pickSourceModal && (
              <div className="restore-source-overlay" onClick={() => setPickSourceModal(false)}>
                <div className="restore-source-modal" onClick={e => e.stopPropagation()}>
                  <span className="restore-source-title">Restore from…</span>
                  <div className="restore-source-buttons">
                    <button className="btn btn-secondary" onClick={handleRestoreFromCloud}>
                      ☁️ Cloud
                    </button>
                    <button className="btn btn-secondary" onClick={handleRestoreFromFileClick}>
                      📁 File
                    </button>
                  </div>
                  <button className="btn btn-ghost" onClick={() => setPickSourceModal(false)}>Cancel</button>
                </div>
              </div>
            )}

            <p className="help-text">Export your data, download a cloud backup, or restore missing entries from the cloud or a file.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataManagerPanel;
