import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';

const MetabolismPanel: React.FC = () => {
  const { profile, setProfile } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`form-section ${isOpen ? 'open' : 'collapsed'}`}>
      <button 
        type="button" 
        className="section-title-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="section-title">
          <span>⚡</span> Metabolism
        </div>
        <span className="chevron">▶</span>
      </button>
      <div className="section-content-wrapper">
        <div className="section-content">
          <div className="section-content-inner">
            <div className="form-group">
              <label htmlFor="metabolism-rate-input">Metabolism Rate ({profile.displayUnit}/hr)</label>
              <input 
                id="metabolism-rate-input"
                type="number" 
                name="metabolismRate" 
                step="0.001"
                min={profile.displayUnit === '‰' ? 0.05 : 0.005}
                max={profile.displayUnit === '‰' ? 0.40 : 0.040}
                value={profile.displayUnit === '‰' ? profile.metabolismRate * 10 : profile.metabolismRate} 
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setProfile({
                    ...profile,
                    metabolismRate: profile.displayUnit === '‰' ? val / 10 : val
                  });
                }} 
              />
              <p className="help-text">
                Standard average is {profile.displayUnit === '‰' ? '0.15' : '0.015'}. 
                Adjust if you know you metabolize faster or slower.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetabolismPanel;
