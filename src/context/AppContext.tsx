import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
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
  pushToCloud: () => Promise<void>;
  storageWarning: string | null;
  toasts: ToastEntry[];
  showToast: (message: string, type?: ToastType) => void;
}

/** Apply the 365→375ml data repair to drinks/presets arrays */
function applyVolumeRepair<T extends { name?: string; volume: number }>(items: T[]): T[] {
  let changed = false;
  const result = items.map(d => {
    if (d.name?.toLowerCase().includes('black') && d.volume === 365) {
      changed = true;
      return { ...d, volume: 375 };
    }
    return d;
  });
  return changed ? result : items;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(localStorage.getItem('sipwise_last_synced'));
  const [isSyncing, setIsSyncing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const pendingSyncRef = useRef(false);

  const [profile, setProfileState] = useState<Profile>(() => {
    const saved = localStorage.getItem('sipwise_profile');
    try {
      return saved ? JSON.parse(saved) : DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  });

  // Apply 365→375ml repair inside initializer
  const [drinks, setDrinks] = useState<Drink[]>(() => {
    const saved = localStorage.getItem('sipwise_drinks');
    try {
      if (saved) {
        const parsed: Drink[] = JSON.parse(saved);
        return applyVolumeRepair(parsed);
      }
    } catch { /* ignore */ }
    return [];
  });

  const [presets, setPresets] = useState<Omit<Drink, 'id' | 'timestamp'>[]>(() => {
    const saved = localStorage.getItem('sipwise_presets');
    try {
      if (saved) {
        const parsed = JSON.parse(saved);
        return applyVolumeRepair(parsed);
      }
    } catch { /* ignore */ }
    return DEFAULT_PRESETS;
  });

  // Derive storage warning from drinks length (declared after drinks)
  const storageWarning = useMemo(() => {
    if (drinks.length > 500) {
      return `You have ${drinks.length} drink entries. Consider exporting and clearing old history to keep the app running smoothly.`;
    }
    return null;
  }, [drinks.length]);

  // Mark repair flag once on mount
  useEffect(() => {
    const hasRepaired = localStorage.getItem('sipwise_repaired_365');
    if (!hasRepaired) {
      localStorage.setItem('sipwise_repaired_365', 'true');
    }
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
        .maybeSingle();

      if (error) {
        setPushError(error.message || 'Failed to pull from cloud.');
        throw new Error(error.message || 'Failed to pull from cloud.');
      }

      if (data) {
        if (data.profile) setProfileState(data.profile);
        if (data.drinks) setDrinks(data.drinks);
        if (data.presets) setPresets(data.presets);
      }
      const now = new Date().toLocaleString();
      setLastSynced(now);
      safeSetItem('sipwise_last_synced', now);
      setPushError(null);
    } catch (err) {
      console.error('Pull from cloud failed:', err);
      if (err instanceof Error) {
        setPushError(err.message);
      }
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  const setProfile = useCallback((newProfile: Profile) => setProfileState(newProfile), []);
  const addDrink = useCallback((drink: Omit<Drink, 'id'>) => {
    const newDrink: Drink = { ...drink, id: crypto.randomUUID() };
    setDrinks(prev => [...prev, newDrink]);
  }, []);
  const removeDrink = useCallback((id: string) => setDrinks(prev => prev.filter(d => d.id !== id)), []);
  const updateDrink = useCallback((id: string, updates: Partial<Drink>) => {
    setDrinks(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);
  const addPreset = useCallback((preset: Omit<Drink, 'id' | 'timestamp'>) => {
    setPresets(prev => [...prev, preset]);
  }, []);
  const removePreset = useCallback((name: string) => setPresets(prev => prev.filter(p => p.name !== name)), []);
  const updatePreset = useCallback((name: string, updates: Partial<Omit<Drink, 'id' | 'timestamp'>>) => {
    setPresets(prev => prev.map(p => p.name === name ? { ...p, ...updates } : p));
  }, []);
  const clearHistory = useCallback(() => setDrinks([]), []);
  const importData = useCallback((data: { profile?: Profile; drinks?: Drink[]; presets?: Omit<Drink, 'id' | 'timestamp'>[] }) => {
    if (data.profile) setProfileState(data.profile);
    if (data.drinks) setDrinks(data.drinks);
    if (data.presets) setPresets(data.presets);
  }, []);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setLastSynced(null);
    localStorage.removeItem('sipwise_last_synced');
  }, []);

  // =============================================
  // Side effects
  // =============================================

  useEffect(() => {
    safeSetItem('sipwise_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    safeSetItem('sipwise_drinks', JSON.stringify(drinks));
  }, [drinks]);

  useEffect(() => {
    safeSetItem('sipwise_presets', JSON.stringify(presets));
  }, [presets]);

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'SIGNED_IN') {
        pendingSyncRef.current = true;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Pull from cloud on fresh login, then push any local changes
  useEffect(() => {
    if (pendingSyncRef.current && user) {
      pendingSyncRef.current = false;
      pullFromCloud().finally(() => pushToCloud());
    }
  }, [user, pullFromCloud, pushToCloud]);

  // Auto-push on data changes only, not on user login
  const pushToCloudRef = useRef(pushToCloud);
  useEffect(() => {
    pushToCloudRef.current = pushToCloud;
  });

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      pushToCloudRef.current();
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, drinks, presets]);

  const contextValue = useMemo(() => ({
    profile, setProfile,
    drinks, addDrink, removeDrink, updateDrink,
    presets, addPreset, removePreset, updatePreset,
    clearHistory,
    importData,
    user, lastSynced, isSyncing, pushError,
    signOut, pullFromCloud, pushToCloud,
    storageWarning, toasts, showToast,
  }), [profile, setProfile, drinks, addDrink, removeDrink, updateDrink,
      presets, addPreset, removePreset, updatePreset,
      clearHistory, importData,
      user, lastSynced, isSyncing, pushError, storageWarning, toasts,
      showToast, pullFromCloud, pushToCloud, signOut]);

  return (
    <AppContext.Provider value={contextValue}>
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
