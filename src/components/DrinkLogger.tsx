import { useState, type FormEvent } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Drink } from '../utils/bac';
import { estimateCalories } from '../utils/bac';

interface DrinkLoggerProps {
  isOpen: boolean;
  onClose: () => void;
  editDrink?: Drink; // Pass this to enter edit mode
}

function DrinkLogger({ isOpen, onClose, editDrink }: DrinkLoggerProps) {
  const { presets, addDrink, addPreset, updateDrink, inventory, consumeFromInventory, profile, showToast } = useAppContext();
  const isEditing = !!editDrink;
  
  const isInventoryMode = profile.appMode === 'inventory';
  const hasStock = inventory && inventory.length > 0;
  
  // Decide active tab: default to stock if in inventory mode and has inventory, else custom
  const [activeTab, setActiveTab] = useState<'stock' | 'custom'>(
    isInventoryMode && hasStock && !isEditing ? 'stock' : 'custom'
  );
  
  const [isCustom, setIsCustom] = useState(isEditing);
  
  // Stock selection state
  const [selectedItemId, setSelectedItemId] = useState<string>(() => {
    return hasStock ? inventory[0].id : '';
  });
  
  // Selected item reference
  const selectedItem = inventory.find(item => item.id === selectedItemId) || (hasStock ? inventory[0] : null);
  
  const [stockVolume, setStockVolume] = useState<number | ''>(() => {
    if (!selectedItem) return 40;
    return selectedItem.type === 'container' ? 40 : selectedItem.unitVolume;
  });
  
  const [customDrink, setCustomDrink] = useState<{ name: string; volume: number; abv: number; calories: number | '' }>(() =>
    isEditing ? {
      name: editDrink.name || '',
      volume: editDrink.volume,
      abv: editDrink.abv,
      calories: editDrink.calories !== undefined ? editDrink.calories : ''
    } : { name: '', volume: 330, abv: 5, calories: '' }
  );
  
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [timestamp, setTimestamp] = useState(() => isEditing ? editDrink.timestamp : Date.now());

  if (!isOpen) return null;
  const formKey = isEditing ? editDrink!.id : 'new';

  // Helper to format Date for datetime-local input
  const toLocalISO = (ts: number) => {
    const date = new Date(ts);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().slice(0, 16);
  };

  const setOffset = (minutes: number) => {
    setTimestamp(Date.now() - minutes * 60 * 1000);
  };

  const handleAddPreset = (preset: Omit<Drink, 'id' | 'timestamp'>) => {
    if (isInventoryMode) {
      const matchedItem = inventory.find(item => item.name.trim().toLowerCase() === (preset.name || '').trim().toLowerCase());
      if (matchedItem) {
        const success = consumeFromInventory(matchedItem.id, preset.volume);
        if (!success) {
          showToast(`Warning: Not enough stock for ${matchedItem.name}. Drink logged anyway!`, 'error');
        } else {
          showToast(`Logged drink and deducted from ${matchedItem.name}`, 'success');
        }
      }
    }
    addDrink({ ...preset, timestamp });
    onClose();
  };

  const handleCustomizePreset = (preset: Omit<Drink, 'id' | 'timestamp'>) => {
    setIsCustom(true);
    setCustomDrink({
      name: preset.name || '',
      volume: preset.volume,
      abv: preset.abv,
      calories: preset.calories !== undefined ? preset.calories : ''
    });
  };

  const handleAddCustom = (e: FormEvent) => {
    e.preventDefault();
    const parsedCalories = customDrink.calories !== '' ? Number(customDrink.calories) : undefined;
    const finalDrink = {
      name: customDrink.name,
      volume: customDrink.volume,
      abv: customDrink.abv,
      calories: parsedCalories
    };
    if (editDrink) {
      updateDrink(editDrink.id, { ...finalDrink, timestamp });
    } else {
      if (isInventoryMode) {
        const matchedItem = inventory.find(item => item.name.trim().toLowerCase() === (finalDrink.name || '').trim().toLowerCase());
        if (matchedItem) {
          const success = consumeFromInventory(matchedItem.id, finalDrink.volume);
          if (!success) {
            showToast(`Warning: Not enough stock for ${matchedItem.name}. Drink logged anyway!`, 'error');
          } else {
            showToast(`Logged drink and deducted from ${matchedItem.name}`, 'success');
          }
        }
      }
      addDrink({ ...finalDrink, timestamp });
      if (saveAsPreset) {
        addPreset(finalDrink);
      }
    }
    setIsCustom(false);
    setSaveAsPreset(false);
    onClose();
  };

  const handleAddFromStock = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !stockVolume) return;

    const volume = Number(stockVolume);
    
    // Attempt stock deduction
    const success = consumeFromInventory(selectedItem.id, volume);
    
    if (!success) {
      showToast(`Warning: Not enough stock for ${selectedItem.name}. Drink logged anyway!`, 'error');
    } else {
      showToast(`Logged drink and deducted from ${selectedItem.name}`, 'success');
    }

    // Log the drink
    const finalCalories = selectedItem.calories 
      ? Math.round((selectedItem.calories * volume) / selectedItem.unitVolume) 
      : estimateCalories(volume, selectedItem.abv);

    addDrink({
      name: selectedItem.name,
      volume,
      abv: selectedItem.abv,
      calories: finalCalories,
      timestamp
    });

    onClose();
  };

  const handleInventorySelectChange = (id: string) => {
    setSelectedItemId(id);
    const item = inventory.find(i => i.id === id);
    if (item) {
      setStockVolume(item.type === 'container' ? 40 : item.unitVolume);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="drink-logger-title">
      <div className="modal-content card" key={formKey}>
        <h2 id="drink-logger-title">{editDrink ? 'Edit Drink' : 'Add Drink'}</h2>

        <div className="time-selector">
          <label>Time of Consumption</label>
          <div className="quick-offsets">
            <button type="button" onClick={() => setTimestamp(Date.now())}>Now</button>
            <button type="button" onClick={() => setOffset(30)}>-30m</button>
            <button type="button" onClick={() => setOffset(60)}>-1h</button>
            <button type="button" onClick={() => setOffset(120)}>-2h</button>
          </div>
          <input 
            type="datetime-local" 
            value={toLocalISO(timestamp)} 
            onChange={e => setTimestamp(new Date(e.target.value).getTime())}
          />
        </div>

        {isInventoryMode && !isEditing && (
          <div className="tab-buttons" style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
            <button 
              type="button" 
              className={activeTab === 'stock' ? 'primary-btn' : ''} 
              style={{ flex: 1, opacity: activeTab === 'stock' ? 1 : 0.6 }}
              onClick={() => setActiveTab('stock')}
              disabled={!hasStock}
            >
              From Stock
            </button>
            <button 
              type="button" 
              className={activeTab === 'custom' ? 'primary-btn' : ''} 
              style={{ flex: 1, opacity: activeTab === 'custom' ? 1 : 0.6 }}
              onClick={() => setActiveTab('custom')}
            >
              Presets & Custom
            </button>
          </div>
        )}
        
        {activeTab === 'stock' && hasStock && !isEditing ? (
          <form onSubmit={handleAddFromStock} className="custom-form">
            <div className="form-group">
              <label htmlFor="logger-stock-item">Select Stock Item</label>
              <div className="select-wrapper">
                <select 
                  id="logger-stock-item"
                  value={selectedItemId}
                  onChange={e => handleInventorySelectChange(e.target.value)}
                >
                  {inventory.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.quantity} {item.type === 'container' ? 'bottles' : 'units'} left)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedItem && (
              <div className="card" style={{ background: 'rgba(255,255,255,0.02)', padding: 'var(--spacing-sm)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                  <strong>ABV:</strong> {selectedItem.abv}% • <strong>Unit:</strong> {selectedItem.unitVolume}ml
                </p>
                {selectedItem.type === 'container' && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', opacity: 0.8 }}>
                    Current bottle: {selectedItem.remainingVolume}ml left ({(selectedItem.remainingVolume / (profile.shotSize ?? 30)).toFixed(1).replace(/\.0$/, '')} shots)
                  </p>
                )}
              </div>
            )}

            {selectedItem && selectedItem.type === 'container' ? (
              <div className="form-group">
                <label>Volume to Consume (ml)</label>
                <div className="quick-offsets" style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <button type="button" onClick={() => setStockVolume(profile.shotSize ?? 30)}>Single Shot ({profile.shotSize ?? 30}ml)</button>
                  <button type="button" onClick={() => setStockVolume(45)}>Shot/Nip (45ml)</button>
                  <button type="button" onClick={() => setStockVolume(150)}>Glass (150ml)</button>
                  <button type="button" onClick={() => setStockVolume(selectedItem.unitVolume)}>Full Bottle ({selectedItem.unitVolume}ml)</button>
                </div>
                <input 
                  type="number"
                  min="1"
                  max="5000"
                  value={stockVolume}
                  onChange={e => setStockVolume(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                />
              </div>
            ) : (
              selectedItem && (
                <div className="form-group">
                  <label>Volume to Consume (ml)</label>
                  <div className="quick-offsets" style={{ marginBottom: 'var(--spacing-sm)' }}>
                    <button type="button" onClick={() => setStockVolume(selectedItem.unitVolume)}>1 Unit ({selectedItem.unitVolume}ml)</button>
                    <button type="button" onClick={() => setStockVolume(selectedItem.unitVolume * 2)}>2 Units ({selectedItem.unitVolume * 2}ml)</button>
                  </div>
                  <input 
                    type="number"
                    min="1"
                    max="5000"
                    value={stockVolume}
                    onChange={e => setStockVolume(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  />
                </div>
              )
            )}

            <div className="form-actions" style={{ marginTop: 'var(--spacing-md)' }}>
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary-btn">Log & Deduct</button>
            </div>
          </form>
        ) : (
          <>
            {!isCustom ? (
              <div className="presets-grid">
                {presets.map((p, i) => (
                  <div key={i} className="preset-row">
                    <button type="button" className="preset-btn" onClick={() => handleAddPreset(p)}>
                      <strong>{p.name}</strong>
                      <span>{p.volume}ml • {p.abv}%{p.calories ? ` • ${p.calories} kcal` : ''}</span>
                    </button>
                    <button 
                      type="button" 
                      className="preset-edit-btn" 
                      onClick={() => handleCustomizePreset(p)}
                      title="Customize before logging"
                    >
                      ✎
                    </button>
                  </div>
                ))}
                <button type="button" className="preset-btn-standalone" onClick={() => setIsCustom(true)}>
                  Custom...
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddCustom} className="custom-form">
                <div className="form-group">
                  <label htmlFor="custom-drink-name">Name</label>
                  <input 
                    id="custom-drink-name"
                    type="text" 
                    maxLength={200}
                    value={customDrink.name} 
                    onChange={e => setCustomDrink({...customDrink, name: e.target.value})} 
                    placeholder="e.g. Cocktail"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="custom-drink-volume">Volume (ml)</label>
                  <input 
                    id="custom-drink-volume"
                    type="number" 
                    min="1"
                    max="5000"
                    value={customDrink.volume} 
                    onChange={e => setCustomDrink({...customDrink, volume: Number(e.target.value)})} 
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="custom-drink-abv">ABV (%)</label>
                  <input 
                    id="custom-drink-abv"
                    type="number" 
                    step="0.1"
                    min="0"
                    max="100"
                    value={customDrink.abv} 
                    onChange={e => setCustomDrink({...customDrink, abv: Number(e.target.value)})} 
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="custom-drink-calories">Calories (kcal)</label>
                  <input 
                    id="custom-drink-calories"
                    type="number" 
                    min="0"
                    max="5000"
                    value={customDrink.calories} 
                    onChange={e => {
                      const val = e.target.value;
                      setCustomDrink({ ...customDrink, calories: val === '' ? '' : Number(val) });
                    }} 
                    placeholder={`e.g. ${estimateCalories(customDrink.volume, customDrink.abv)} (estimated)`}
                  />
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label" htmlFor="save-preset-checkbox">
                    <input 
                      id="save-preset-checkbox"
                      type="checkbox" 
                      checked={saveAsPreset} 
                      onChange={e => setSaveAsPreset(e.target.checked)} 
                    />
                    Save as preset for future use
                  </label>
                </div>
                <div className="form-actions">
                  <button type="button" onClick={() => editDrink ? onClose() : setIsCustom(false)}>
                    {editDrink ? 'Cancel' : 'Back'}
                  </button>
                  <button type="submit" className="primary-btn">
                    {editDrink ? 'Save Changes' : 'Add Drink'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
        
        {!editDrink && <button className="close-btn" onClick={onClose}>Close</button>}
      </div>
    </div>
  );
};

export default DrinkLogger;
