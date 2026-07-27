import { memo } from 'react';
import { useAppContext } from '../context/AppContext';

export type View = 'dashboard' | 'history' | 'inventory' | 'profile';

interface NavBarProps {
  currentView: View;
  setView: (view: View) => void;
}

const NavBar = memo(function NavBar({ currentView, setView }: NavBarProps) {
  const { profile } = useAppContext();
  const showInventory = profile.appMode === 'inventory';

  return (
    <nav className="navbar">
      <button 
        className={currentView === 'dashboard' ? 'active' : ''} 
        onClick={() => setView('dashboard')}
      >
        Dashboard
      </button>
      {showInventory && (
        <button 
          className={currentView === 'inventory' ? 'active' : ''} 
          onClick={() => setView('inventory')}
        >
          Inventory
        </button>
      )}
      <button 
        className={currentView === 'history' ? 'active' : ''} 
        onClick={() => setView('history')}
      >
        History
      </button>
      <button 
        className={currentView === 'profile' ? 'active' : ''} 
        onClick={() => setView('profile')}
      >
        Profile
      </button>
    </nav>
  );
});

export default NavBar;
