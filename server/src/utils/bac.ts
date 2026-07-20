/**
 * BAC calculation utilities — ported from supabase/functions/_shared/bac.ts
 * and src/utils/bac.ts for use by the local backend server.
 */

export const GENDER_CONSTANTS = { male: 0.68, female: 0.55 } as const;
export const ETHANOL_DENSITY = 0.789;

const WATSON_COEFF_MALE_TBW = { intercept: 2.447, age: -0.09156, height: 0.1074, weight: 0.3362 };
const WATSON_COEFF_FEMALE_TBW = { intercept: -2.097, height: 0.1069, weight: 0.2466 };

const R_MIN_MALE = 0.5;
const R_MAX_MALE = 0.9;
const R_MIN_FEMALE = 0.4;
const R_MAX_FEMALE = 0.8;

export interface Drink {
  id: string;
  timestamp: number;
  volume: number;
  abv: number;
  name?: string;
  calories?: number;
}

export interface Profile {
  weight: number;
  gender: 'male' | 'female';
  metabolismRate: number;
  displayUnit: '%' | '‰';
  height: number;
  age: number;
}

export function estimateCalories(volume: number, abv: number): number {
  const alcoholGrams = volume * (abv / 100) * ETHANOL_DENSITY;
  const alcoholCalories = alcoholGrams * 7;
  if (abv >= 35) return Math.round(alcoholCalories);
  if (abv >= 10) return Math.round(alcoholCalories * 1.2);
  return Math.round(alcoholCalories * 1.5);
}

export function calculateWidmarkR(profile: Profile): number {
  const { weight, height, age, gender } = profile;
  if (gender === 'male') {
    const tbw = WATSON_COEFF_MALE_TBW.intercept
      + WATSON_COEFF_MALE_TBW.age * age
      + WATSON_COEFF_MALE_TBW.height * height
      + WATSON_COEFF_MALE_TBW.weight * weight;
    return Math.min(Math.max(tbw / (weight * 0.8), R_MIN_MALE), R_MAX_MALE);
  }
  const tbw = WATSON_COEFF_FEMALE_TBW.intercept
    + WATSON_COEFF_FEMALE_TBW.height * height
    + WATSON_COEFF_FEMALE_TBW.weight * weight;
  return Math.min(Math.max(tbw / (weight * 0.8), R_MIN_FEMALE), R_MAX_FEMALE);
}

export function calculateBAC(drinks: Drink[], profile: Profile, currentTime: number = Date.now()): number {
  if (drinks.length === 0) return 0;
  const pastDrinks = drinks.filter(d => d.timestamp <= currentTime);
  if (pastDrinks.length === 0) return 0;

  const sortedDrinks = [...pastDrinks].sort((a, b) => a.timestamp - b.timestamp);
  const weightInGrams = profile.weight * 1000;
  const r = calculateWidmarkR(profile);

  let currentBAC = 0;
  let lastTime = sortedDrinks[0].timestamp;

  for (const drink of sortedDrinks) {
    const hoursPassed = (drink.timestamp - lastTime) / 3_600_000;
    currentBAC -= profile.metabolismRate * hoursPassed;
    if (currentBAC < 0) currentBAC = 0;

    const alcoholGrams = drink.volume * (drink.abv / 100) * ETHANOL_DENSITY;
    currentBAC += (alcoholGrams / (weightInGrams * r)) * 100;
    lastTime = drink.timestamp;
  }

  const finalHoursPassed = (currentTime - lastTime) / 3_600_000;
  currentBAC -= profile.metabolismRate * finalHoursPassed;
  return Math.max(0, currentBAC);
}

export function calculateTimeToZero(drinks: Drink[], profile: Profile, currentTime: number = Date.now()): number {
  const currentBAC = calculateBAC(drinks, profile, currentTime);
  if (currentBAC <= 0) return 0;
  return currentBAC / profile.metabolismRate;
}
