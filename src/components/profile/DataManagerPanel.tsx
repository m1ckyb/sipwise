import { useRef, useState, type ChangeEvent } from 'react';
import { useAppContext } from '../../context/AppContext';
import ConfirmModal from '../ConfirmModal';

function DataManagerPanel() {
  const { profile, drinks, presets, importData, showToast } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

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

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  /** Validate the shape and value ranges of an import payload */
  function validateImportData(data: unknown): data is Parameters<typeof importData>[0] {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;

    if (d.profile !== undefined) {
      const p = d.profile as Record<string, unknown>;
      if (typeof p.weight !== 'number' || p.weight < 20 || p.weight > 400) return false;
      if (p.gender !== 'male' && p.gender !== 'female') return false;
      if (typeof p.height !== 'number' || p.height < 50 || p.height > 300) return false;
      if (typeof p.age !== 'number' || p.age < 1 || p.age > 130) return false;
      if (typeof p.metabolismRate !== 'number' || p.metabolismRate < 0.001 || p.metabolismRate > 0.5) return false;
    }

    if (d.drinks !== undefined) {
      if (!Array.isArray(d.drinks)) return false;
      if (d.drinks.length > 10000) return false; // Reject unreasonably large payloads
      for (const drink of d.drinks) {
        if (typeof drink !== 'object' || drink === null) return false;
        const dr = drink as Record<string, unknown>;
        if (typeof dr.volume !== 'number' || dr.volume < 0 || dr.volume > 5000) return false;
        if (typeof dr.abv !== 'number' || dr.abv < 0 || dr.abv > 100) return false;
        if (typeof dr.timestamp !== 'number') return false;
      }
    }

    if (d.presets !== undefined) {
      if (!Array.isArray(d.presets)) return false;
      if (d.presets.length > 100) return false;
    }

    return true;
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!validateImportData(parsed)) {
          showToast('Invalid backup file: data failed validation. Please use a valid SipWise export.', 'error');
          return;
        }

        showConfirm(
          'Import Data',
          'This will overwrite your current profile, drinks, and presets. Are you sure?',
          () => {
            importData(parsed);
            showToast('Data imported successfully!', 'success');
          }
        );
      } catch {
        showToast('Invalid backup file. Please make sure it is a valid JSON file exported from SipWise.', 'error');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

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
              <button className="btn btn-secondary" onClick={handleImportClick}>
                Import Data
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".json"
                onChange={handleFileChange}
                aria-label="Upload Backup JSON File"
              />
            </div>
            <p className="help-text">Backup your data to a JSON file or restore from a previous backup.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataManagerPanel;
