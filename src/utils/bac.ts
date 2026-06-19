/**
 * Shared constants for BAC calculations and graph parameters.
 */

// Weight / gender constants
export const GENDER_CONSTANTS = {
  male: 0.68,
  female: 0.55,
} as const;

export const ETHANOL_DENSITY = 0.789; // g/ml

// Widmark formula coefficients (Watson body water constants)
const WATSON_COEFF_MALE_TBW = { intercept: 2.447, age: -0.09156, height: 0.1074, weight: 0.3362 };
const WATSON_COEFF_FEMALE_TBW = { intercept: -2.097, height: 0.1069, weight: 0.2466 };

// Sanity bounds for Widmark r factor
const R_MIN_MALE = 0.5;
const R_MAX_MALE = 0.9;
const R_MIN_FEMALE = 0.4;
const R_MAX_FEMALE = 0.8;

// Time constants (milliseconds)
export const GRAPH_INTERVAL_MS = 30 * 60_000;          // 30-minute graph step
export const PEAK_BAC_SAMPLE_MS = 15 * 60_000;          // 15-minute peak BAC sampling
export const SESSION_GAP_MS = 12 * 3_600_000;           // 12-hour session gap threshold
export const GRAPH_PRE_FIRST_DRINK_MS = 30 * 60_000;    // 30 mins before first drink
export const GRAPH_POST_SOBER_MS = 60 * 60_000;         // 1 hour after sober
export const GRAPH_NOW_BUFFER_MS = 30 * 60_000;         // 30-min buffer after now for dynamic graph
export const GRAPH_DYNAMICTHRESHOLD_MS = 4 * 3_600_000; // 4-hour window for extending graph end

// Drink & UI limits
export const DEFAULT_DRINK_LIMIT = 50;                  // max drinks returned by API
export const PRESET_NAME_MAX_LEN = 100;                 // preset name character limit
export const QUICK_DRINK_MIN = 350;                     // minimum ml for "quick drink" suggestion
export const QUICK_DRINK_DEFAULT_ABV = 5.0;             // default ABV percentage for quick drinks

// Profile defaults
export const DEFAULT_METABOLISM_RATE = 0.015;           // % BAC reduction per hour (average)
export const DEFAULT_DISPLAY_UNIT = '%' as const;        // default display unit

// Date / time formatting
const MS_PER_HOUR = 3_600_000;

export interface Drink {
  id: string;
  timestamp: number; // ms
  volume: number; // ml
  abv: number; // percentage (e.g. 5.0)
  name?: string;
  calories?: number; // calories in kcal
}

export interface Profile {
  weight: number; // kg
  gender: 'male' | 'female';
  metabolismRate: number; // BAC % reduction per hour, default ~0.015
  displayUnit: '%' | '‰';
  height: number; // cm
  age: number; // years
  quickDrink?: {
    name: string;
    volume: number;
    abv: number;
    calories?: number;
  };
}

/**
 * Estimates the calories of a drink (in kcal) based on its volume and ABV.
 * Uses a heuristic:
 * - Spirits (ABV >= 35%): Alcohol calories only (7 kcal/g)
 * - Wine (10% <= ABV < 35%): Alcohol calories * 1.2 (for residual sugar)
 * - Beer (ABV < 10%): Alcohol calories * 1.5 (for residual carbs)
 */
export function estimateCalories(volume: number, abv: number): number {
  const alcoholGrams = volume * (abv / 100) * ETHANOL_DENSITY;
  const alcoholCalories = alcoholGrams * 7;
  
  if (abv >= 35) {
    return Math.round(alcoholCalories);
  } else if (abv >= 10) {
    return Math.round(alcoholCalories * 1.2);
  } else {
    return Math.round(alcoholCalories * 1.5);
  }
}

export interface Session {
  id: string;
  drinks: Drink[];
  startTime: number;
  endTime: number;
  totalAlcoholGrams: number;
  peakBAC: number;
}

export function calculateWidmarkR(profile: Profile): number {
  const { weight, height, age, gender } = profile;

  if (gender === 'male') {
    // Watson Formula (Male)
    const tbw = WATSON_COEFF_MALE_TBW.intercept + 
                (WATSON_COEFF_MALE_TBW.age * age) + 
                (WATSON_COEFF_MALE_TBW.height * height) + 
                (WATSON_COEFF_MALE_TBW.weight * weight);
    const r = tbw / (weight * 0.8);
    // Sanity check: r for men is usually between 0.60 and 0.80
    return Math.min(Math.max(r, R_MIN_MALE), R_MAX_MALE);
  } else {
    // Watson Formula (Female)
    const tbw = WATSON_COEFF_FEMALE_TBW.intercept + 
                (WATSON_COEFF_FEMALE_TBW.height * height) + 
                (WATSON_COEFF_FEMALE_TBW.weight * weight);
    const r = tbw / (weight * 0.8);
    // Sanity check: r for women is usually between 0.45 and 0.70
    return Math.min(Math.max(r, R_MIN_FEMALE), R_MAX_FEMALE);
  }
}

/**
 * Calculates current BAC based on Widmark formula.
 * BAC = (Alcohol in grams / (Weight in grams * r)) * 100 - (Metabolism * hours)
 * 
 * Note: This implementation assumes instant absorption for simplicity, 
 * which is common for basic BAC trackers.
 */
export function calculateBAC(drinks: Drink[], profile: Profile, currentTime: number = Date.now()): number {
  if (drinks.length === 0) return 0;

  // Filter drinks that haven't happened yet
  const pastDrinks = drinks.filter(d => d.timestamp <= currentTime);
  if (pastDrinks.length === 0) return 0;

  // Sort drinks chronologically
  const sortedDrinks = [...pastDrinks].sort((a, b) => a.timestamp - b.timestamp);

  const weightInGrams = profile.weight * 1000;
  const r = calculateWidmarkR(profile);

  let currentBAC = 0;
  let lastTime = sortedDrinks[0].timestamp;

  for (const drink of sortedDrinks) {
    // 1. Calculate hours since the last event (drink)
    const hoursPassed = (drink.timestamp - lastTime) / (1000 * 60 * 60);
    
    // 2. Subtract metabolized BAC since the last event
    currentBAC -= profile.metabolismRate * hoursPassed;
    if (currentBAC < 0) currentBAC = 0;

    // 3. Add the contribution of the new drink
    const alcoholGrams = drink.volume * (drink.abv / 100) * ETHANOL_DENSITY;
    const addedBAC = (alcoholGrams / (weightInGrams * r)) * 100;
    currentBAC += addedBAC;

    // 4. Update the tracker time
    lastTime = drink.timestamp;
  }

  // 5. Final metabolism from the last drink to the current time
  const finalHoursPassed = (currentTime - lastTime) / (1000 * 60 * 60);
  currentBAC -= profile.metabolismRate * finalHoursPassed;

  return Math.max(0, currentBAC);
}

/**
 * Calculates time until BAC reaches zero in hours.
 */
export function calculateTimeToZero(drinks: Drink[], profile: Profile, currentTime: number = Date.now()): number {
  const currentBAC = calculateBAC(drinks, profile, currentTime);
  if (currentBAC <= 0) return 0;

  return currentBAC / profile.metabolismRate;
}

/**
 * Generates data points for a BAC graph.
 */
export function generateBACGraphData(drinks: Drink[], profile: Profile, now: number = Date.now()): { time: number; label: string; bac: number }[] {
  if (drinks.length === 0) return [];

  const sortedDrinks = [...drinks].sort((a, b) => a.timestamp - b.timestamp);
  const startTime = sortedDrinks[0].timestamp;
  
  const lastDrinkTime = sortedDrinks[sortedDrinks.length - 1].timestamp;
  const timeToZeroFromLast = calculateTimeToZero(drinks, profile, lastDrinkTime);
  let endTime = lastDrinkTime + (timeToZeroFromLast * MS_PER_HOUR);

  const timeToZeroFromNow = calculateTimeToZero(drinks, profile, now);
  if (now + (timeToZeroFromNow * MS_PER_HOUR) > endTime) {
    endTime = now + (timeToZeroFromNow * MS_PER_HOUR);
  }

  // Buffer before and after
  const graphStart = startTime - GRAPH_PRE_FIRST_DRINK_MS;
  let graphEnd = endTime + GRAPH_POST_SOBER_MS;

  // Only extend to 'now' if 'now' is within 4 hours of the graph end
  if (now > startTime && now < graphEnd + GRAPH_DYNAMICTHRESHOLD_MS) {
    graphEnd = Math.max(graphEnd, now + GRAPH_NOW_BUFFER_MS);
  }

  const data: { time: number; label: string; bac: number }[] = [];
  const step = GRAPH_INTERVAL_MS; // 30 minute intervals

  for (let t = graphStart; t <= graphEnd; t += step) {
    const bac = calculateBAC(drinks, profile, t);
    data.push({
      time: t,
      label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      bac: parseFloat(bac.toFixed(4))
    });
    
    // Ensure we include 'now' specifically if it's within the graph bounds
    if (t < now && t + step > now && now <= graphEnd) {
      const currentBac = calculateBAC(drinks, profile, now);
      data.push({
        time: now,
        label: 'Now',
        bac: parseFloat(currentBac.toFixed(4))
      });
    }
  }

  return data;
}

/**
 * Groups drinks into logical sessions based on a 12-hour gap threshold.
 */
export function groupIntoSessions(drinks: Drink[], profile: Profile): Session[] {
  if (drinks.length === 0) return [];

  const sortedDrinks = [...drinks].sort((a, b) => a.timestamp - b.timestamp);
  const sessions: Session[] = [];
  let currentSessionDrinks: Drink[] = [sortedDrinks[0]];

  for (let i = 1; i < sortedDrinks.length; i++) {
    const prevDrink = sortedDrinks[i - 1];
    const currentDrink = sortedDrinks[i];
    const gap = currentDrink.timestamp - prevDrink.timestamp;

    if (gap > SESSION_GAP_MS) {
      // Gap > 12 hours, start new session
      sessions.push(createSessionObject(currentSessionDrinks, profile));
      currentSessionDrinks = [currentDrink];
    } else {
      currentSessionDrinks.push(currentDrink);
    }
  }

  sessions.push(createSessionObject(currentSessionDrinks, profile));
  
  // Return sessions sorted newest first
  return sessions.sort((a, b) => b.startTime - a.startTime);
}

function createSessionObject(drinks: Drink[], profile: Profile): Session {
  const totalAlcoholGrams = drinks.reduce((sum, d) => sum + (d.volume * (d.abv / 100) * ETHANOL_DENSITY), 0);
  
  // Calculate Peak BAC during this specific session
  let peakBAC = 0;
  const startTime = drinks[0].timestamp;
  const lastDrinkTime = drinks[drinks.length - 1].timestamp;
  const endTime = lastDrinkTime + (calculateTimeToZero(drinks, profile, lastDrinkTime) * MS_PER_HOUR);

  // Sample BAC every 15 mins to find peak
  for (let t = startTime; t <= endTime; t += PEAK_BAC_SAMPLE_MS) {
    const bac = calculateBAC(drinks, profile, t);
    if (bac > peakBAC) peakBAC = bac;
  }

  return {
    id: `session-${startTime}`,
    drinks: [...drinks].sort((a, b) => b.timestamp - a.timestamp),
    startTime,
    endTime,
    totalAlcoholGrams,
    peakBAC
  };
}

/**
 * Formats BAC to a standard display based on unit.
 */
export function formatBAC(bac: number, unit: '%' | '‰' = '%'): string {
  if (unit === '‰') {
    return (bac * 10).toFixed(2);
  }
  return bac.toFixed(3);
}
