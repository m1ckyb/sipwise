import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { calculateBAC, calculateTimeToZero, formatBAC, groupIntoSessions, estimateCalories } from '../utils/bac';
import BACGraph from './BACGraph';

const Dashboard: React.FC<{ onAddClick: () => void }> = ({ onAddClick }) => {
  const { drinks, profile, addDrink } = useAppContext();
  const [currentBAC, setCurrentBAC] = useState(0);
  const [timeToZero, setTimeToZero] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      setCurrentBAC(calculateBAC(drinks, profile, currentTime));
      setTimeToZero(calculateTimeToZero(drinks, profile, currentTime));
    };

    update();
    const interval = setInterval(update, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [drinks, profile]);

  const getStatusColor = (bac: number) => {
    if (bac === 0) return 'var(--safe)';
    if (bac < 0.05) return 'var(--warning)';
    return 'var(--danger)';
  };

  const getStatusText = (bac: number) => {
    if (bac === 0) return 'Sober';
    if (bac < 0.05) return 'Below Limit';
    if (bac < 0.08) return 'Impaired';
    return 'Dangerous';
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0 && m === 0) return 'Now';
    return `${h}h ${m}m`;
  };

  const getNextDrink = (): { volume: number; abv: number; name?: string } | null => {
    if (profile.quickDrink) {
      return profile.quickDrink;
    }
    if (drinks.length > 0) {
      const last = drinks[drinks.length - 1];
      return { volume: last.volume, abv: last.abv, name: last.name };
    }
    return null;
  };

  const nextDrink = getNextDrink();
  const futureDrinks = nextDrink
    ? [...drinks, { id: 'prediction', timestamp: now, volume: nextDrink.volume, abv: nextDrink.abv }]
    : null;
  const predictedBAC = futureDrinks ? calculateBAC(futureDrinks, profile, now) : null;
  const predictedTimeToZero = futureDrinks ? calculateTimeToZero(futureDrinks, profile, now) : null;

  const isActive = currentBAC > 0;
  const sessions = groupIntoSessions(drinks, profile);
  const currentSession = sessions.length > 0 ? sessions[0] : null;

  const activeDrinks = isActive && currentSession ? currentSession.drinks : [];
  const totalAlcohol = isActive && currentSession ? currentSession.totalAlcoholGrams : 0;
  const firstDrinkTime = isActive && currentSession ? currentSession.startTime : now;
  const totalCalories = activeDrinks.reduce((sum, d) => {
    return sum + (d.calories !== undefined ? d.calories : estimateCalories(d.volume, d.abv));
  }, 0);

  // Safety rule: 1 standard drink (10g) per hour from the first drink
  const safetySoberTime = firstDrinkTime + (totalAlcohol / 10) * 3600000;
  const standardSoberTime = now + timeToZero * 3600000;
  const isSafetyBufferRelevant = isActive && totalAlcohol > 0 && safetySoberTime > (standardSoberTime + 1800000); // 30 min diff threshold

  return (
    <div className="dashboard">
      <div className="profile-summary">
        <span>{profile.gender === 'male' ? '♂️' : '♀️'} {profile.gender}</span>
        <span>⚖️ {profile.weight}kg</span>
        <span>⚡ {profile.metabolismRate.toFixed(3)}%/hr</span>
      </div>

      <div className="bac-display card" style={{ borderColor: getStatusColor(currentBAC), borderLeft: '4px solid' }}>
        <span className="label">
          Current BAC
          {nextDrink && predictedBAC !== null && (
            <span className="bac-predict">
              <span className="predict-icon">🛈</span>
              <span className="predict-tooltip">
                After 1 more {nextDrink.name || 'drink'}: {formatBAC(predictedBAC, profile.displayUnit)}{profile.displayUnit}
                {predictedTimeToZero !== null && <span className="predict-sober">Sober: {formatHours(predictedTimeToZero)}</span>}
              </span>
            </span>
          )}
        </span>
        <h1 className="bac-value" style={{ color: getStatusColor(currentBAC) }}>
          {formatBAC(currentBAC, profile.displayUnit)}{profile.displayUnit}
        </h1>
        <div className="status-badge" style={{ backgroundColor: getStatusColor(currentBAC) }}>
          {getStatusText(currentBAC)}
        </div>
      </div>

      {isActive && (
        <>
          <div className="info-grid">
            <div className="card info-card">
              <span className="label">Time to Sober</span>
              <h3>{formatHours(timeToZero)}</h3>
            </div>
            <div className="card info-card">
              <span className="label">Active Drinks</span>
              <h3>
                {activeDrinks.length} 
                <small style={{ fontSize: '0.8rem', opacity: 0.7, fontWeight: 'normal', display: 'block', marginTop: '4px' }}>
                  ({(totalAlcohol / 10).toFixed(1)} standard)
                </small>
              </h3>
            </div>
          </div>

          <div className="card info-card" style={{ marginTop: 'var(--spacing-md)' }}>
            <span className="label">Total Alcohol & Calories</span>
            <h3>
              {totalAlcohol.toFixed(1)}g
              <small style={{ fontSize: '1rem', opacity: 0.7, fontWeight: 'normal', display: 'block', marginTop: '4px' }}>
                Est. {totalCalories} kcal
              </small>
            </h3>
            <p className="help-text" style={{ fontSize: '0.9rem', marginTop: '4px', opacity: 0.8 }}>
              You should be sober by <strong>{new Date(standardSoberTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
            </p>
          </div>

          {isSafetyBufferRelevant && (
            <div className="card safety-card">
              <span className="label safety-label">⚠️ Safety Buffer (1 Drink/Hr Rule)</span>
              <p className="safety-text">
                Govt. guidelines suggest you might not be safe until <strong>{new Date(safetySoberTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
              </p>
              <p className="help-text safety-help">
                The "1 standard drink per hour" rule is a safer, more conservative estimate for larger body weights.
              </p>
            </div>
          )}
        </>
      )}

      <BACGraph drinks={currentSession ? currentSession.drinks : []} profile={profile} now={now} />

      <div className="action-buttons">
        <button className="add-drink-btn" onClick={onAddClick}>
          + Add Drink
        </button>
        {profile.quickDrink && (
          <button className="quick-drink-btn" onClick={() => {
            addDrink({
              timestamp: Date.now(),
              volume: profile.quickDrink!.volume,
              abv: profile.quickDrink!.abv,
              name: profile.quickDrink!.name,
              calories: profile.quickDrink!.calories
            });
          }}>
            ⚡ Quick {profile.quickDrink.name}
          </button>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
