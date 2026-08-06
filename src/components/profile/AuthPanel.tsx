import { useState, type FormEvent } from 'react';
import { useAppContext } from '../../context/AppContext';
import { supabase } from '../../utils/supabase';
import { isLocalMode } from '../../utils/mode';
import { apiPost } from '../../utils/api';

function AuthPanel() {
  const { 
    user, lastSynced, isSyncing, pushError, signOut, pushToCloud, pullFromCloud, showToast 
  } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (isLocalMode) {
        const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
        await apiPost(endpoint, { email, password });
        // Reload user from /me so AppContext picks up the new user
        window.location.reload();
      } else {
        const { error } = authMode === 'login' 
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
        
        if (error) {
          setAuthError(
            authMode === 'login'
              ? 'Invalid email or password. Please try again.'
              : 'Could not create account. The email may already be registered.'
          );
          return;
        }
        showToast(
          authMode === 'login' ? 'Logged in successfully!' : 'Account created successfully!',
          'success'
        );
      }
    } catch {
      setAuthError('An unexpected error occurred. Please try again.');
    }
  };

  const handleSync = async () => {
    showToast('Syncing data...', 'info');
    await pushToCloud();
    try {
      await pullFromCloud();
      showToast('Sync complete!', 'success');
    } catch {
      showToast('Sync completed (push only, pull failed)', 'info');
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
          <span>☁️</span> {isLocalMode ? 'Account' : 'Cloud Sync'}
        </div>
        <span className="chevron">▶</span>
      </button>
      <div className="section-content-wrapper">
        <div className="section-content">
          <div className="section-content-inner">
            {!user ? (
              <div className="auth-container">
                <p className="help-text" style={{ marginBottom: '12px' }}>
                  {isLocalMode
                    ? 'Sign in to sync your data across devices.'
                    : 'Sync your data across devices using a free account.'}
                </p>
                <form onSubmit={handleAuth} className="auth-form">
                  <input 
                    type="email" 
                    placeholder="Email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                    aria-label="Email address"
                  />
                  <input 
                    type="password" 
                    placeholder="Password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required 
                    aria-label="Password"
                  />
                  {authError && <p className="error-text">{authError}</p>}
                  <button type="submit" className="btn btn-primary">
                    {authMode === 'login' ? 'Login' : 'Sign Up'}
                  </button>
                </form>
                <button 
                  className="text-btn" 
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                >
                  {authMode === 'login' ? 'Need an account? Sign Up' : 'Have an account? Login'}
                </button>
              </div>
            ) : (
              <div className="sync-status">
                <div className="status-row">
                  <span>Account:</span>
                  <strong>{user.email}</strong>
                </div>
                <div className="status-row">
                  <span>Last Synced:</span>
                  <span>{isSyncing ? 'Syncing...' : (lastSynced || 'Never')}</span>
                </div>
                {pushError && (
                  <div className="error-box" style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                    {pushError}
                  </div>
                )}
                <div className="sync-actions">
                  <button className="btn btn-secondary" onClick={handleSync} disabled={isSyncing}>
                    Sync Now
                  </button>
                  <button className="btn btn-outline" onClick={signOut}>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPanel;
