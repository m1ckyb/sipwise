import { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { Drink } from '../../utils/bac';
import { estimateCalories } from '../../utils/bac';

function PresetManager() {
  const { profile, setProfile, presets, removePreset, updatePreset } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [editingPresetName, setEditingPresetName] = useState<string | null>(null);
  const [tempPreset, setTempPreset] = useState<{ name: string; volume: number; abv: number; calories: number | '' } | null>(null);

  const startEditPreset = (preset: Omit<Drink, 'id' | 'timestamp'>) => {
    setEditingPresetName(preset.name || '');
    setTempPreset({ 
      name: preset.name || '', 
      volume: preset.volume, 
      abv: preset.abv,
      calories: preset.calories !== undefined ? preset.calories : ''
    });
  };

  const savePresetEdit = () => {
    if (editingPresetName && tempPreset) {
      const parsedCalories = tempPreset.calories !== '' ? Number(tempPreset.calories) : undefined;
      updatePreset(editingPresetName, {
        name: tempPreset.name,
        volume: tempPreset.volume,
        abv: tempPreset.abv,
        calories: parsedCalories
      });
      setEditingPresetName(null);
      setTempPreset(null);
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
          <span>🍹</span> Drink Presets
        </div>
        <span className="chevron">▶</span>
      </button>
      <div className="section-content-wrapper">
        <div className="section-content">
          <div className="section-content-inner">
            <div className="presets-list">
              {presets.length === 0 ? (
                <p className="help-text">No presets saved yet.</p>
              ) : (
                presets.map((preset, index) => (
                  <div key={index} className="preset-item">
                    {editingPresetName === preset.name ? (
                      <div className="preset-edit-form">
                        <input 
                          type="text" 
                          value={tempPreset?.name} 
                          onChange={e => setTempPreset({...tempPreset!, name: e.target.value})} 
                          placeholder="Name"
                          aria-label="Preset Name"
                        />
                        <div className="side-by-side">
                          <input 
                            type="number" 
                            value={tempPreset?.volume} 
                            onChange={e => setTempPreset({...tempPreset!, volume: Number(e.target.value)})} 
                            placeholder="ml"
                            aria-label="Volume in milliliters"
                          />
                          <input 
                            type="number" 
                            step="0.1"
                            value={tempPreset?.abv} 
                            onChange={e => setTempPreset({...tempPreset!, abv: Number(e.target.value)})} 
                            placeholder="%"
                            aria-label="Alcohol by volume percentage"
                          />
                          <input 
                            type="number" 
                            value={tempPreset?.calories} 
                            onChange={e => {
                              const val = e.target.value;
                              setTempPreset({...tempPreset!, calories: val === '' ? '' : Number(val)});
                            }} 
                            placeholder={`kcal (${tempPreset ? estimateCalories(tempPreset.volume, tempPreset.abv) : ''})`}
                            aria-label="Calories in kcal"
                          />
                        </div>
                        <div className="edit-actions">
                          <button className="btn btn-primary" onClick={savePresetEdit}>Save</button>
                          <button className="btn text-btn" onClick={() => setEditingPresetName(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="preset-info">
                          <strong>{preset.name}</strong>
                          <span>{preset.volume}ml • {preset.abv}%{preset.calories ? ` • ${preset.calories} kcal` : ''}</span>
                        </div>
                        <div className="preset-actions">
                          <button 
                            className="edit-preset-btn" 
                            onClick={() => startEditPreset(preset)}
                            title="Edit Preset"
                          >
                            ✎
                          </button>
                          <button 
                            className="remove-preset-btn" 
                            onClick={() => preset.name && removePreset(preset.name)}
                            title="Remove Preset"
                          >
                            ✕
                          </button>
                          <button
                            className="set-quick-drink-btn"
                            onClick={() => setProfile({ ...profile, quickDrink: { name: preset.name!, volume: preset.volume, abv: preset.abv, calories: preset.calories } })}
                            title={profile.quickDrink?.name === preset.name ? "Current Quick Drink" : "Set as Quick Drink"}
                          >
                            {profile.quickDrink?.name === preset.name ? '★' : '☆'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
            <p className="help-text">Manage your saved drink templates. You can always add more from the "Add Drink" menu.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresetManager;
