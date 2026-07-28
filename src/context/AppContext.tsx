import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { calculateBAC, calculateTimeToZero, type Drink, type Profile, type InventoryItem } from '../utils/bac';
import { supabase } from '../utils/supabase';
import type { User } from '@supabase/supabase-js';
import { isLocalMode } from '../utils/mode';
import { apiGet, apiPut, clearToken } from '../utils/api';

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
  inventory: InventoryItem[];
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'remainingVolume'>) => void;
  removeInventoryItem: (id: string) => void;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void;
  consumeFromInventory: (id: string, volume: number) => boolean;
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

/** Merge local and cloud drink arrays: union by id, local wins for matching ids */
function mergeDrinkArrays(local: Drink[], cloud: Drink[]): Drink[] {
  const map = new Map<string, Drink>();
  for (const d of cloud) map.set(d.id, d);
  for (const d of local) map.set(d.id, d);
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/** Merge local and cloud preset arrays: union by name, local wins for matching names */
function mergePresetArrays(local: Omit<Drink, 'id' | 'timestamp'>[], cloud: Omit<Drink, 'id' | 'timestamp'>[]): Omit<Drink, 'id' | 'timestamp'>[] {
  const map = new Map<string, Omit<Drink, 'id' | 'timestamp'>>();
  for (const p of cloud) map.set(p.name ?? '', p);
  for (const p of local) map.set(p.name ?? '', p);
  return [...map.values()];
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
  const initialPullDone = useRef(false);

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

  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('sipwise_inventory');
    try {
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    const profileSaved = localStorage.getItem('sipwise_profile');
    try {
      if (profileSaved) {
        const p = JSON.parse(profileSaved);
        if (p.inventory) return p.inventory;
      }
    } catch { /* ignore */ }
    return [];
  });

  const profileRef = useRef(profile);
  const drinksRef = useRef(drinks);
  const presetsRef = useRef(presets);
  const inventoryRef = useRef(inventory);
  const skipNextPushRef = useRef(false);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    drinksRef.current = drinks;
  }, [drinks]);

  useEffect(() => {
    presetsRef.current = presets;
  }, [presets]);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

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
      if (isLocalMode) {
        await apiPut('/api/data', {
          profile: profileRef.current,
          drinks: drinksRef.current,
          presets: presetsRef.current,
        });
      } else {
        const currentBAC = calculateBAC(drinksRef.current, profileRef.current);
        const isSober = currentBAC === 0;

        const payload = {
          id: user.id,
          profile: profileRef.current,
          drinks: drinksRef.current,
          presets: presetsRef.current,
          is_sober: isSober,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('user_data')
          .upsert(payload);

        if (error) {
          setPushError(error.message || 'Failed to sync. Please try again.');
          return;
        }
      }
      const now = new Date().toLocaleString();
      setLastSynced(now);
      safeSetItem('sipwise_last_synced', now);
      setPushError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPushError(`Push failed: ${message}. Please try again.`);
      console.error('Push to cloud failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  const pullFromCloud = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      let data: { profile?: Profile; drinks?: Drink[]; presets?: Omit<Drink, 'id' | 'timestamp'>[] } | null = null;

      if (isLocalMode) {
        const resp = await apiGet<{ profile?: Profile; drinks?: Drink[]; presets?: Omit<Drink, 'id' | 'timestamp'>[] }>('/api/data');
        data = resp;
      } else {
        const { data: cloudData, error } = await supabase
          .from('user_data')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          setPushError(error.message || 'Failed to pull from cloud.');
          throw new Error(error.message || 'Failed to pull from cloud.');
        }
        data = cloudData;
      }

      if (data && typeof data === 'object') {
        let changed = false;
        if (data.profile && typeof data.profile === 'object' && JSON.stringify(data.profile) !== JSON.stringify(profileRef.current)) {
          setProfileState(data.profile);
          if ('inventory' in data.profile && Array.isArray(data.profile.inventory)) {
            setInventory(data.profile.inventory);
          } else {
            setInventory([]);
          }
          changed = true;
        }

        const validCloudDrinks = Array.isArray(data.drinks) ? data.drinks : null;
        // On initial pull (when initialPullDone is false), merge local & cloud so pre-login offline drinks aren't lost.
        // On subsequent pulls, cloud state is authoritative.
        const mergedDrinks = !initialPullDone.current && validCloudDrinks
          ? mergeDrinkArrays(drinksRef.current, validCloudDrinks)
          : (validCloudDrinks ?? drinksRef.current);

        if (JSON.stringify(mergedDrinks) !== JSON.stringify(drinksRef.current)) {
          setDrinks(mergedDrinks);
          changed = true;
        }

        const validCloudPresets = Array.isArray(data.presets) ? data.presets : null;
        const mergedPresets = !initialPullDone.current && validCloudPresets
          ? mergePresetArrays(presetsRef.current, validCloudPresets)
          : (validCloudPresets ?? presetsRef.current);

        if (JSON.stringify(mergedPresets) !== JSON.stringify(presetsRef.current)) {
          setPresets(mergedPresets);
          changed = true;
        }

        if (changed) {
          skipNextPushRef.current = true;
        }

        // If local state contained drinks/presets not yet saved to cloud during initial pull, push merged result
        if (!initialPullDone.current && data.drinks && mergedDrinks.length > data.drinks.length) {
          await pushToCloud();
        }
      } else {
        await pushToCloud();
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
  }, [user, pushToCloud]);

  const setProfile = useCallback((newProfile: Profile) => setProfileState(newProfile), []);
  const addDrink = useCallback((drink: Omit<Drink, 'id'>) => {
    const newDrink: Drink = { ...drink, id: crypto.randomUUID() };
    setDrinks(prev => [...prev, newDrink]);
  }, []);
  const recreditToInventory = useCallback((name: string, volume: number) => {
    setInventory(prev => {
      let isFound = false;
      const next = prev.map(item => {
        if (item.name.trim().toLowerCase() !== name.trim().toLowerCase()) return item;
        isFound = true;
        
        if (item.type === 'individual') {
          const unitsToRecredit = Math.max(1, Math.round(volume / item.unitVolume));
          return { ...item, quantity: item.quantity + unitsToRecredit };
        } else {
          let currentRemaining = item.remainingVolume + volume;
          let currentQty = item.quantity;
          
          while (currentRemaining > item.unitVolume) {
            currentQty += 1;
            currentRemaining -= item.unitVolume;
          }
          
          return {
            ...item,
            quantity: currentQty,
            remainingVolume: currentRemaining
          };
        }
      });
      
      if (isFound) {
        safeSetItem('sipwise_inventory', JSON.stringify(next));
        setProfileState(p => {
          const updated = { ...p, inventory: next };
          safeSetItem('sipwise_profile', JSON.stringify(updated));
          return updated;
        });
      }
      return next;
    });
  }, []);

  const removeDrink = useCallback((id: string) => {
    setDrinks(prev => {
      const drinkToRemove = prev.find(d => d.id === id);
      if (drinkToRemove && drinkToRemove.name && profileRef.current.appMode === 'inventory') {
        recreditToInventory(drinkToRemove.name, drinkToRemove.volume);
      }
      return prev.filter(d => d.id !== id);
    });
    showToast('Drink deleted', 'info');
  }, [showToast, recreditToInventory]);
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
  const addInventoryItem = useCallback((item: Omit<InventoryItem, 'id' | 'remainingVolume'>) => {
    const newItem: InventoryItem = {
      ...item,
      id: crypto.randomUUID(),
      remainingVolume: item.unitVolume,
    };
    setInventory(prev => {
      const next = [...prev, newItem];
      safeSetItem('sipwise_inventory', JSON.stringify(next));
      setProfileState(p => {
        const updated = { ...p, inventory: next };
        safeSetItem('sipwise_profile', JSON.stringify(updated));
        return updated;
      });
      return next;
    });
  }, []);
  const removeInventoryItem = useCallback((id: string) => {
    setInventory(prev => {
      const next = prev.filter(item => item.id !== id);
      safeSetItem('sipwise_inventory', JSON.stringify(next));
      setProfileState(p => {
        const updated = { ...p, inventory: next };
        safeSetItem('sipwise_profile', JSON.stringify(updated));
        return updated;
      });
      return next;
    });
  }, []);
  const updateInventoryItem = useCallback((id: string, updates: Partial<InventoryItem>) => {
    setInventory(prev => {
      const next = prev.map(item => {
        if (item.id !== id) return item;
        const updatedItem = { ...item, ...updates };
        if (updates.unitVolume !== undefined || updates.type !== undefined) {
          updatedItem.remainingVolume = Math.min(updatedItem.remainingVolume, updatedItem.unitVolume);
        }
        return updatedItem;
      });
      safeSetItem('sipwise_inventory', JSON.stringify(next));
      setProfileState(p => {
        const updated = { ...p, inventory: next };
        safeSetItem('sipwise_profile', JSON.stringify(updated));
        return updated;
      });
      return next;
    });
  }, []);
  const consumeFromInventory = useCallback((id: string, volume: number): boolean => {
    let success = false;
    setInventory(prev => {
      let isFound = false;
      const next = prev.map(item => {
        if (item.id !== id) return item;
        isFound = true;
        
        if (item.type === 'individual') {
          const unitsToDeduct = Math.max(1, Math.round(volume / item.unitVolume));
          if (item.quantity >= unitsToDeduct) {
            success = true;
            return { ...item, quantity: item.quantity - unitsToDeduct };
          }
          return item;
        } else {
          let remainingToDeduct = volume;
          let currentQty = item.quantity;
          let currentRemaining = item.remainingVolume;
          
          if (currentRemaining === item.unitVolume && currentQty > 0) {
            currentQty -= 1;
          }
          
          if (currentRemaining >= remainingToDeduct) {
            currentRemaining -= remainingToDeduct;
            remainingToDeduct = 0;
          } else {
            remainingToDeduct -= currentRemaining;
            currentRemaining = 0;
          }
          
          while (remainingToDeduct > 0 && currentQty > 0) {
            currentQty -= 1;
            currentRemaining = item.unitVolume;
            if (currentRemaining >= remainingToDeduct) {
              currentRemaining -= remainingToDeduct;
              remainingToDeduct = 0;
            } else {
              remainingToDeduct -= currentRemaining;
              currentRemaining = 0;
            }
          }
          
          if (remainingToDeduct === 0 || (item.quantity > 0 && currentQty >= 0)) {
            success = true;
            return {
              ...item,
              quantity: currentQty,
              remainingVolume: currentRemaining
            };
          }
          return item;
        }
      });
      
      if (success && isFound) {
        safeSetItem('sipwise_inventory', JSON.stringify(next));
        setProfileState(p => {
          const updated = { ...p, inventory: next };
          safeSetItem('sipwise_profile', JSON.stringify(updated));
          return updated;
        });
      }
      return next;
    });
    return success;
  }, []);
  const clearHistory = useCallback(() => {
    setDrinks([]);
    showToast('Drink history cleared', 'info');
  }, [showToast]);
  const importData = useCallback((data: { profile?: Profile; drinks?: Drink[]; presets?: Omit<Drink, 'id' | 'timestamp'>[] }) => {
    if (data.profile) {
      setProfileState(data.profile);
      if (data.profile.inventory) {
        setInventory(data.profile.inventory);
      }
    }
    if (data.drinks) setDrinks(data.drinks);
    if (data.presets) setPresets(data.presets);
  }, []);
  const signOut = useCallback(async () => {
    if (isLocalMode) {
      clearToken();
    } else {
      await supabase.auth.signOut();
    }
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
    if (isLocalMode) {
      // Local mode: check for existing JWT token
      const token = localStorage.getItem('sipwise_api_token');
      if (token) {
        apiGet<{ user: { id: string; email: string } }>('/api/auth/me')
          .then(({ user: u }) => setUser(u as unknown as User))
          .catch(() => { clearToken(); });
      }
      return;
    }

    // Supabase mode
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

  // Pull from cloud on mount or fresh login — single effect to avoid races
  useEffect(() => {
    if (!user || initialPullDone.current) return;
    initialPullDone.current = true;
    pendingSyncRef.current = false;
    pullFromCloud();
  }, [user, pullFromCloud]);

  // Auto-push on data changes with pull-after-push for multi-device convergence
  const pushToCloudRef = useRef(pushToCloud);
  const pullFromCloudRef = useRef(pullFromCloud);
  useEffect(() => {
    pushToCloudRef.current = pushToCloud;
  });
  useEffect(() => {
    pullFromCloudRef.current = pullFromCloud;
  });

  useEffect(() => {
    if (!user || !initialPullDone.current) return;
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        await pushToCloudRef.current();
        // Pull after push to bring in any other devices' data
        await pullFromCloudRef.current();
      } catch {
        // Errors are handled within push/pull themselves (sets pushError)
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, drinks, presets]);

  // Schedule local sober notification whenever drinks or profile changes
  const soberTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (soberTimerRef.current) {
      clearTimeout(soberTimerRef.current);
      soberTimerRef.current = null;
    }

    if (drinks.length === 0) return;

    const currentBAC = calculateBAC(drinks, profile);
    const timeToZero = calculateTimeToZero(drinks, profile);
    const mostRecentDrinkTime = Math.max(
      ...drinks.map(d => (typeof d.timestamp === 'string' ? new Date(d.timestamp).getTime() : d.timestamp))
    );

    const lastNotifiedSession = Number(localStorage.getItem('sipwise_last_sober_notified_time') || 0);

    const triggerAlert = async () => {
      try {
        localStorage.setItem('sipwise_last_sober_notified_time', String(Date.now()));
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification('Sober Alert! 🎉', {
            body: 'Your estimated BAC is now back to 0.00%. You are sober!',
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            vibrate: [100, 50, 100],
            data: { url: window.location.origin + '/' },
          } as NotificationOptions);
        } else if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Sober Alert! 🎉', {
            body: 'Your estimated BAC is now back to 0.00%. You are sober!',
            icon: '/favicon.svg',
          });
        }
        showToast('Sober Alert! Your estimated BAC is back to 0.00%. 🎉', 'success');
      } catch (e) {
        console.error('Failed to trigger local sober notification:', e);
      }
    };

    // 1. If BAC is 0, but user had drinks within the last 24h that haven't been notified yet:
    const isRecentDrink = (Date.now() - mostRecentDrinkTime) < 24 * 3600000;
    if (currentBAC === 0 && isRecentDrink && mostRecentDrinkTime > lastNotifiedSession) {
      triggerAlert();
      return;
    }

    // 2. If BAC > 0, schedule timer for remaining time until BAC is 0
    if (currentBAC > 0 && timeToZero > 0) {
      const soberTimeMs = Date.now() + timeToZero * 3600000;
      const delayMs = Math.max(0, soberTimeMs - Date.now());

      if (delayMs > 0 && 'Notification' in window && Notification.permission === 'granted') {
        soberTimerRef.current = setTimeout(async () => {
          const latestBAC = calculateBAC(drinksRef.current, profileRef.current);
          if (latestBAC === 0) {
            triggerAlert();
          }
        }, delayMs);
      }
    }

    return () => {
      if (soberTimerRef.current) {
        clearTimeout(soberTimerRef.current);
      }
    };
  }, [drinks, profile, showToast]);

  const contextValue = useMemo(() => ({
    profile, setProfile,
    drinks, addDrink, removeDrink, updateDrink,
    presets, addPreset, removePreset, updatePreset,
    inventory, addInventoryItem, removeInventoryItem, updateInventoryItem, consumeFromInventory,
    clearHistory,
    importData,
    user, lastSynced, isSyncing, pushError,
    signOut, pullFromCloud, pushToCloud,
    storageWarning, toasts, showToast,
  }), [profile, setProfile, drinks, addDrink, removeDrink, updateDrink,
      presets, addPreset, removePreset, updatePreset,
      inventory, addInventoryItem, removeInventoryItem, updateInventoryItem, consumeFromInventory,
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
