import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Drink, Profile } from '../utils/bac';
import { supabase } from '../utils/supabase';
import type { User } from '@supabase/supabase-js';

interface AppContextType {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  drinks: Drink[];
  addDrink: (drink: Omit<Drink, 'id'>) => void;
  removeDrink: (id: string) => void;
  updateDrink: (id: string, updates: Partial<Drink>) => void;
  presets: Omit<Drink, 'id' | 'timestamp'>[];
  addPreset: (preset: Omit<Drink, 'id' | 'timestamp'>) => void;
  removePreset: (name: string) => void;
  updatePreset: (name: string, updates: Partial<Omit<Drink, 'id' | 'timestamp'>>) => void;
  clearHistory: () => void;
  importData: (data: { profile?: Profile; drinks?: Drink[]; presets?: Omit<Drink, 'id' | 'timestamp'>[] }) => void;
  user: User | null;
  lastSynced: string | null;
  isSyncing: boolean;
  pushError: string | null;
  signOut: () => Promise<void>;
  pullFromCloud: () => Promise<void>;
  storageWarning: string | null;
  toasts: ToastEntry[];
  showToast: (message: string, type?: ToastType) => void;
}

/** Types of toast notifications */
export type ToastType = 'success' | 'error' | 'info';

/** Single toast notification in the queue */
interface ToastEntry {
  id: number;
  message: string;
  type: ToastType;
}

const DEFAULT_PROFILE: Profile = {
  weight: 75,
  gender: 'male',
  metabolismRate: 0.015,
  displayUnit: '%',
  height: 175,
  age: 30,
};

const DEFAULT_PRESETS: Omit<Drink, 'id' | 'timestamp'>[] = [
  { name: 'Beer', volume: 330, abv: 5, calories: 137 },
  { name: 'Large Beer', volume: 500, abv: 5, calories: 207 },
  { name: 'Wine', volume: 150, abv: 12, calories: 119 },
  { name: 'Spirit', volume: 40, abv: 40, calories: 88 },
];

const AppContext = createContext<AppContextType | undefined>(undefined);

/** Safe localStorage write — warns on quota exceeded instead of silently failing */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.error('[SipWise] localStorage quota exceeded. Some data may not have been saved.', key);
    } else {
      throw e;
    }
  }
}

// Migration helper from alcoclone_* to sipwise_* localStorage keys
const migrateLocalStorageKeys = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const keys = ['profile', 'drinks', 'presets', 'last_synced', 'repaired_365'];
  keys.forEach(k => {
    const oldKey = `alcoclone_${k}`;
    const newKey = `sipwise_${k}`;
    try {
      const value = localStorage.getItem(oldKey);
      if (value && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, value);
        localStorage.removeItem(oldKey);
      }
    } catch (e) {
      console.warn('LocalStorage migration failed:', e);
    }
  });
};

migrateLocalStorageKeys();

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(localStorage.getItem('sipwise_last_synced'));
  const [isSyncing, setIsSyncing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const [profile, setProfileState] = useState<Profile>(() => {
    const saved = localStorage.getItem('sipwise_profile');
    try {
      return saved ? JSON.parse(saved) : DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  });

  const [drinks, setDrinks] = useState<Drink[]>(() => {
    const saved = localStorage.getItem('sipwise_drinks');
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [presets, setPresets] = useState<Omit<Drink, 'id' | 'timestamp'>[]>(() => {
    const saved = localStorage.getItem('sipwise_presets');
    try {
      return saved ? JSON.parse(saved) : DEFAULT_PRESETS;
    } catch {
      return DEFAULT_PRESETS;
    }
  });

  useEffect(() => {
    safeSetItem('sipwise_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    safeSetItem('sipwise_drinks', JSON.stringify(drinks));
    // Warn if drink history is getting large (>500 entries)
    if (drinks.length > 500) {
      setStorageWarning(`You have ${drinks.length} drink entries. Consider exporting and clearing old history to keep the app running smoothly.`);
    } else {
      setStorageWarning(null);
    }
  }, [drinks]);

  useEffect(() => {
    safeSetItem('sipwise_presets', JSON.stringify(presets));
  }, [presets]);

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const pushToCloud = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('user_data')
        .upsert({
          id: user.id,
          profile,
          drinks,
          presets,
          updated_at: new Date().toISOString(),
        });
      
      if (!error) {
        const now = new Date().toLocaleString();
        setLastSynced(now);
        safeSetItem('sipwise_last_synced', now);
        setPushError(null);
      } else {
        setPushError(error.message || 'Failed to sync. Please try again.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPushError(`Push failed: ${message}. Please try again.`);
      console.error('Push to cloud failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [user, profile, drinks, presets]);

  const pullFromCloud = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('user_data')
        .select('*')
        .eq('id', user.id)
        .maybeSingle(); // Use maybeSingle to handle case where no data exists yet
      
      if (data && !error) {
        if (data.profile) setProfileState(data.profile);
        if (data.drinks) setDrinks(data.drinks);
        if (data.presets) setPresets(data.presets);
        const now = new Date().toLocaleString();
        setLastSynced(now);
        safeSetItem('sipwise_last_synced', now);
      }
    } catch (err) {
      console.error('Pull from cloud failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  // Initial pull on login
  useEffect(() => {
    if (user) {
      pullFromCloud();
    }
  }, [user, pullFromCloud]);

  // Auto-push on changes
  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        pushToCloud();
      }, 2000); // Debounce push
      return () => clearTimeout(timer);
    }
  }, [profile, drinks, presets, user, pushToCloud]);

  const setProfile = (newProfile: Profile) => setProfileState(newProfile);

  const addDrink = (drink: Omit<Drink, 'id'>) => {
    const newDrink: Drink = {
      ...drink,
      id: crypto.randomUUID(),
    };
    setDrinks(prev => [...prev, newDrink]);
  };

  const removeDrink = (id: string) => {
    setDrinks(prev => prev.filter(d => d.id !== id));
  };

  const updateDrink = (id: string, updates: Partial<Drink>) => {
    setDrinks(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const addPreset = (preset: Omit<Drink, 'id' | 'timestamp'>) => {
    setPresets(prev => [...prev, preset]);
  };

  const removePreset = (name: string) => {
    setPresets(prev => prev.filter(p => p.name !== name));
  };

  const updatePreset = (name: string, updates: Partial<Omit<Drink, 'id' | 'timestamp'>>) => {
    setPresets(prev => prev.map(p => p.name === name ? { ...p, ...updates } : p));
  };

  // One-time data repair for common errors (like 365ml DBL-Black)
  useEffect(() => {
    const hasRepaired = localStorage.getItem('sipwise_repaired_365');
    if (!hasRepaired && drinks.length > 0) {
      let repaired = false;
      const newDrinks = drinks.map(d => {
        if (d.name?.toLowerCase().includes('black') && d.volume === 365) {
          repaired = true;
          return { ...d, volume: 375 };
        }
        return d;
      });

      const newPresets = presets.map(p => {
        if (p.name?.toLowerCase().includes('black') && p.volume === 365) {
          repaired = true;
          return { ...p, volume: 375 };
        }
        return p;
      });

      if (repaired) {
        setDrinks(newDrinks);
        setPresets(newPresets);
      }
      localStorage.setItem('sipwise_repaired_365', 'true');
    }
  }, [drinks, presets]);

  // clearHistory just clears — confirmation is handled by the calling UI component
  const clearHistory = () => {
    setDrinks([]);
  };

  const importData = (data: { profile?: Profile; drinks?: Drink[]; presets?: Omit<Drink, 'id' | 'timestamp'>[] }) => {
    if (data.profile) setProfileState(data.profile);
    if (data.drinks) setDrinks(data.drinks);
    if (data.presets) setPresets(data.presets);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setLastSynced(null);
    localStorage.removeItem('sipwise_last_synced');
    setStorageWarning(null);
  };

  return (
    <AppContext.Provider value={{
      profile, setProfile,
      drinks, addDrink, removeDrink, updateDrink,
      presets, addPreset, removePreset, updatePreset,
      clearHistory,
      importData,
      user, lastSynced, isSyncing, pushError,
      signOut, pullFromCloud,
      storageWarning, toasts, showToast,
    }}>
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};
