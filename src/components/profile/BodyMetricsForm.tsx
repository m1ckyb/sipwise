import { useState, type ChangeEvent } from 'react';
import { useAppContext } from '../../context/AppContext';
import { calculateWidmarkR } from '../../utils/bac';

function BodyMetricsForm() {
  const { profile, setProfile } = useAppContext();
  const [isOpen, setIsOpen] = useState(true);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'weight' || name === 'height' || name === 'age') {
      const numVal = Number(value);
      if (!Number.isFinite(numVal) || numVal <= 0) return;
      let clamped = numVal;
      if (name === 'weight') clamped = Math.max(20, Math.min(400, numVal));
      if (name === 'height') clamped = Math.max(50, Math.min(250, numVal));
      if (name === 'age') clamped = Math.max(1, Math.min(120, numVal));
      setProfile({ ...profile, [name]: clamped });
    } else {
      setProfile({ ...profile, [name]: value });
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
          <span>👤</span> Body Metrics
        </div>
        <span className="chevron">▶</span>
      </button>
      <div className="section-content-wrapper">
        <div className="section-content">
          <div className="section-content-inner">
            <div className="form-group">
              <label htmlFor="body-metric-gender">Gender</label>
              <div className="select-wrapper">
                <select 
                  id="body-metric-gender"
                  name="gender" 
                  value={profile.gender} 
                  onChange={handleChange}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <p className="help-text">Biological sex affects the body water ratio (r) used in calculations.</p>
            </div>

            <div className="form-group">
              <label htmlFor="body-metric-weight">Weight (kg)</label>
              <input 
                id="body-metric-weight"
                type="number" 
                name="weight" 
                min="30"
                max="300"
                value={profile.weight} 
                onChange={handleChange} 
              />
              <p className="help-text">Alcohol concentration is inversely proportional to body weight.</p>
            </div>

            <div className="form-group">
              <label htmlFor="body-metric-height">Height (cm)</label>
              <input 
                id="body-metric-height"
                type="number" 
                name="height" 
                min="50"
                max="250"
                value={profile.height} 
                onChange={handleChange} 
              />
            </div>

            <div className="form-group">
              <label htmlFor="body-metric-age">Age (years)</label>
              <input 
                id="body-metric-age"
                type="number" 
                name="age" 
                min="1"
                max="120"
                value={profile.age} 
                onChange={handleChange} 
              />
              <p className="help-text">Height and Age are used by the Watson formula to calculate your body water ratio (r) more accurately.</p>
            </div>

            <div className="info-box">
              <span className="label">Current Body Water Ratio (r)</span>
              <strong className="r-value">{calculateWidmarkR(profile).toFixed(3)}</strong>
            </div>

            <div className="form-group">
              <label htmlFor="body-metric-displayUnit">Display Unit</label>
              <div className="select-wrapper">
                <select 
                  id="body-metric-displayUnit"
                  name="displayUnit" 
                  value={profile.displayUnit} 
                  onChange={handleChange}
                >
                  <option value="%">% (Percentage, e.g. 0.050%)</option>
                  <option value="‰">‰ (Per Mille, e.g. 0.50‰)</option>
                </select>
              </div>
              <p className="help-text">Choose how BAC values are displayed throughout the app.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BodyMetricsForm;
