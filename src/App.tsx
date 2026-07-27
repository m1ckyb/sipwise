import { useState, lazy, Suspense, useMemo } from 'react';
import NavBar from './components/NavBar';
import type { View } from './components/NavBar';
import Dashboard from './components/Dashboard';
import ReloadPrompt from './components/ReloadPrompt';
import { useAppContext } from './context/AppContext';
import type { Drink } from './utils/bac';

const History = lazy(() => import('./components/History'));
const ProfileSettings = lazy(() => import('./components/ProfileSettings'));
const DrinkLogger = lazy(() => import('./components/DrinkLogger'));
const InventoryManager = lazy(() => import('./components/InventoryManager'));

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isLoggerOpen, setIsLoggerOpen] = useState(false);
  const [editingDrink, setEditingDrink] = useState<Drink | undefined>(undefined);

  const openLogger = (drink?: Drink) => {
    setEditingDrink(drink);
    setIsLoggerOpen(true);
  };

  const closeLogger = () => {
    setIsLoggerOpen(false);
    setEditingDrink(undefined);
  };

  // Destructure toasts from context — must be inside App (the only component with AppProvider parent)
  const { toasts, profile, inventory } = useAppContext();

  const needsReplenish = useMemo(() => {
    if (profile.appMode !== 'inventory') return false;
    return inventory.some(item => {
      if (item.type === 'container') {
        return item.quantity === 0 && item.remainingVolume < 400;
      } else {
        return item.quantity < 4;
      }
    });
  }, [inventory, profile.appMode]);

  return (
    <>
      <header className="app-header">
        <h1>SipWise</h1>
      </header>

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      {needsReplenish && (
        <div 
          className="replenish-banner" 
          style={{
            background: 'rgba(244, 67, 54, 0.12)',
            border: '1px solid rgba(244, 67, 54, 0.25)',
            borderLeft: '4px solid var(--danger)',
            borderRadius: 'var(--border-radius)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            margin: '0 var(--spacing-md) var(--spacing-md) var(--spacing-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            fontSize: '0.9rem',
            color: '#ffc107',
            boxShadow: 'var(--shadow)',
          }}
        >
          <span>⚠️</span>
          <span>Drinks need replenishing soon! Some stock items are running low.</span>
        </div>
      )}

      <main>
        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', opacity: 0.7 }}>Loading view...</div>}>
          {currentView === 'dashboard' && (
            <Dashboard onAddClick={() => openLogger()} />
          )}
          {currentView === 'history' && <History onEditClick={openLogger} />}
          {currentView === 'inventory' && <InventoryManager />}
          {currentView === 'profile' && <ProfileSettings />}
          <DrinkLogger
            isOpen={isLoggerOpen}
            onClose={closeLogger}
            editDrink={editingDrink}
          />
        </Suspense>
      </main>

      <ReloadPrompt />

      <NavBar currentView={currentView} setView={setCurrentView} />
    </>
  );
}

export default App;
