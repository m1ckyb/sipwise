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
  const { presets, addDrink, addPreset, updateDrink } = useAppContext();
  const isEditing = !!editDrink;
  const [isCustom, setIsCustom] = useState(isEditing);
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
      addDrink({ ...finalDrink, timestamp });
      if (saveAsPreset) {
        addPreset(finalDrink);
      }
    }
    setIsCustom(false);
    setSaveAsPreset(false);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content card" key={formKey}>
        <h2>{editDrink ? 'Edit Drink' : 'Add Drink'}</h2>

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
        
        {!editDrink && <button className="close-btn" onClick={onClose}>Close</button>}
      </div>
    </div>
  );
};

export default DrinkLogger;
