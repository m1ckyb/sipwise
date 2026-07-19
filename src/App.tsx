import { useState, lazy, Suspense } from 'react';
import NavBar from './components/NavBar';
import type { View } from './components/NavBar';
import Dashboard from './components/Dashboard';
import ReloadPrompt from './components/ReloadPrompt';
import { useAppContext } from './context/AppContext';
import type { Drink } from './utils/bac';

const History = lazy(() => import('./components/History'));
const ProfileSettings = lazy(() => import('./components/ProfileSettings'));
const DrinkLogger = lazy(() => import('./components/DrinkLogger'));

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
  const { toasts } = useAppContext();

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

      <main>
        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', opacity: 0.7 }}>Loading view...</div>}>
          {currentView === 'dashboard' && (
            <Dashboard onAddClick={() => openLogger()} />
          )}
          {currentView === 'history' && <History onEditClick={openLogger} />}
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
