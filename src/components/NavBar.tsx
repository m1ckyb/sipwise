import React from 'react';

export type View = 'dashboard' | 'history' | 'profile';

interface NavBarProps {
  currentView: View;
  setView: (view: View) => void;
}

const NavBar: React.FC<NavBarProps> = ({ currentView, setView }) => {
  return (
    <nav className="navbar">
      <button 
        className={currentView === 'dashboard' ? 'active' : ''} 
        onClick={() => setView('dashboard')}
      >
        Dashboard
      </button>
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
};

export default NavBar;
