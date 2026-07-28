import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { calculateBAC, calculateTimeToZero, formatBAC, groupIntoSessions, estimateCalories } from '../utils/bac';
import BACGraph from './BACGraph';

function Dashboard({ onAddClick }: { onAddClick: () => void }) {
  const { drinks, profile, addDrink, user, pushToCloud, pullFromCloud, isSyncing, showToast, inventory, consumeFromInventory } = useAppContext();
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
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [drinks, profile]);

  const getStatusColor = useCallback((bac: number) => {
    if (bac === 0) return 'var(--safe)';
    if (bac < 0.05) return 'var(--warning)';
    return 'var(--danger)';
  }, []);

  const getStatusText = useCallback((bac: number) => {
    if (bac === 0) return 'Sober';
    if (bac < 0.05) return 'Below Limit';
    if (bac < 0.08) return 'Impaired';
    return 'Dangerous';
  }, []);

  const formatHours = useCallback((hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0 && m === 0) return 'Now';
    return `${h}h ${m}m`;
  }, []);

  const nextDrink = useMemo(() => {
    if (profile.quickDrink) return profile.quickDrink;
    if (drinks.length > 0) {
      const last = drinks[drinks.length - 1];
      return { volume: last.volume, abv: last.abv, name: last.name };
    }
    return null;
  }, [profile.quickDrink, drinks]);

  const futureDrinks = useMemo(() =>
    nextDrink
      ? [...drinks, { id: 'prediction', timestamp: now, volume: nextDrink.volume, abv: nextDrink.abv }]
      : null,
    [nextDrink, drinks, now]
  );

  const predictedBAC = useMemo(() =>
    futureDrinks ? calculateBAC(futureDrinks, profile, now) : null,
    [futureDrinks, profile, now]
  );

  const predictedTimeToZero = useMemo(() =>
    futureDrinks ? calculateTimeToZero(futureDrinks, profile, now) : null,
    [futureDrinks, profile, now]
  );

  const isActive = currentBAC > 0;

  const sessions = useMemo(() => groupIntoSessions(drinks, profile), [drinks, profile]);
  const currentSession = useMemo(() => sessions.length > 0 ? sessions[0] : null, [sessions]);

  const sessionTotalAlcohol = useMemo(() => currentSession ? currentSession.totalAlcoholGrams : 0, [currentSession]);
  const sessionStartTime = useMemo(() => currentSession ? currentSession.startTime : now, [currentSession, now]);

  const activeDrinks = useMemo(() => isActive && currentSession ? currentSession.drinks : [], [isActive, currentSession]);
  const totalAlcohol = useMemo(() => isActive && currentSession ? currentSession.totalAlcoholGrams : 0, [isActive, currentSession]);

  const totalCalories = useMemo(() =>
    activeDrinks.reduce((sum, d) =>
      sum + (d.calories !== undefined ? d.calories : estimateCalories(d.volume, d.abv)), 0),
    [activeDrinks]
  );

  const safetySoberTime = sessionStartTime + (sessionTotalAlcohol / 10) * 3600000;
  const standardSoberTime = now + timeToZero * 3600000;
  const isSafetyBufferRelevant = sessionTotalAlcohol > 0 && safetySoberTime > (standardSoberTime + 1800000);

  return (
    <div className="dashboard">
      <div className="profile-summary">
        <span>{profile.gender === 'male' ? '♂️' : '♀️'} {profile.gender}</span>
        <span>⚖️ {profile.weight}kg</span>
        <span>⚡ {profile.metabolismRate.toFixed(3)}%/hr</span>
        <button
          className="sync-btn"
          onClick={async () => {
            if (!user) {
              showToast('Sign in on the Profile page to enable cloud sync', 'error');
              return;
            }
            showToast('Syncing data...', 'info');
            await pushToCloud();
            try {
              await pullFromCloud();
              showToast('Sync complete!', 'success');
            } catch {
              showToast('Sync completed (push only, pull failed)', 'info');
            }
          }}
          disabled={isSyncing}
          title="Sync to cloud"
        >
          ⟳
        </button>
      </div>

      <div className="bac-display card" style={{ borderColor: getStatusColor(currentBAC), borderLeft: '4px solid' }}>
        <span className="label">
          Current BAC
          {nextDrink && predictedBAC !== null && (
            <span className="bac-predict">
              <span className="predict-icon">🛈</span>
              <span className="predict-tooltip">
                After 1 more {nextDrink.name || 'drink'}: {formatBAC(predictedBAC, profile.displayUnit)}{profile.displayUnit}
                {predictedTimeToZero !== null && <span className="predict-sober">Sober by {new Date(now + predictedTimeToZero * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
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
        {currentBAC === 0 && isSafetyBufferRelevant && (
          <p className="safety-text" style={{ marginTop: '8px', fontSize: '0.85rem', textAlign: 'center', color: '#ff9800' }}>
            Govt. guidelines suggest you might not be safe until <strong>{new Date(safetySoberTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
          </p>
        )}
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

        </>
      )}

      {isActive && isSafetyBufferRelevant && (
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

      <BACGraph drinks={currentSession ? currentSession.drinks : []} profile={profile} now={now} />

      <div className="action-buttons">
        <button className="add-drink-btn" onClick={onAddClick}>
          + Add Drink
        </button>
        {isActive && currentSession && currentSession.drinks.length > 0 && (
          <button className="quick-add-btn" onClick={() => {
            const lastDrink = currentSession.drinks[0];
            if (profile.appMode === 'inventory') {
              const matchedItem = inventory.find(item => item.name.trim().toLowerCase() === (lastDrink.name || '').trim().toLowerCase());
              if (matchedItem) {
                const success = consumeFromInventory(matchedItem.id, lastDrink.volume);
                if (!success) {
                  showToast(`Warning: Not enough stock for ${matchedItem.name}. Drink logged anyway!`, 'error');
                } else {
                  showToast(`Logged drink and deducted from ${matchedItem.name}`, 'success');
                }
              }
            }
            addDrink({
              timestamp: Date.now(),
              volume: lastDrink.volume,
              abv: lastDrink.abv,
              name: lastDrink.name,
              calories: lastDrink.calories,
            });
          }}>
            ↩ {currentSession.drinks[0].name || 'Last Drink'}
          </button>
        )}
        {profile.quickDrink && (
          <button className="quick-drink-btn" onClick={() => {
            if (profile.appMode === 'inventory') {
              const matchedItem = inventory.find(item => item.name.trim().toLowerCase() === (profile.quickDrink!.name || '').trim().toLowerCase());
              if (matchedItem) {
                const success = consumeFromInventory(matchedItem.id, profile.quickDrink!.volume);
                if (!success) {
                  showToast(`Warning: Not enough stock for ${matchedItem.name}. Drink logged anyway!`, 'error');
                } else {
                  showToast(`Logged drink and deducted from ${matchedItem.name}`, 'success');
                }
              }
            }
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

      <div className="legal-disclaimer" style={{ marginTop: 'var(--spacing-lg)', textAlign: 'center', opacity: 0.7, fontSize: '0.75rem', lineHeight: '1.4' }}>
        ⚠️ <strong>Disclaimer:</strong> BAC figures are mathematical estimations for informational purposes only. Physiological absorption varies by individual. Never use this app to determine your fitness to drive.
      </div>
    </div>
  );
}

export default Dashboard;
