import { describe, it, expect } from 'vitest';
import { 
  calculateWidmarkR, 
  calculateBAC, 
  calculateTimeToZero, 
  groupIntoSessions,
  estimateCalories
} from './bac';
import type { Drink, Profile } from './bac';

describe('BAC Calculation Utility Tests', () => {
  const maleProfile: Profile = {
    gender: 'male',
    weight: 80, // kg
    height: 180, // cm
    age: 25, // years
    metabolismRate: 0.015,
    displayUnit: '%'
  };

  const femaleProfile: Profile = {
    gender: 'female',
    weight: 60, // kg
    height: 165, // cm
    age: 25, // years
    metabolismRate: 0.015,
    displayUnit: '%'
  };

  describe('calculateWidmarkR', () => {
    it('should calculate Watson TBW and return Widmark r within male bounds (0.5 to 0.9)', () => {
      const r = calculateWidmarkR(maleProfile);
      expect(r).toBeGreaterThanOrEqual(0.5);
      expect(r).toBeLessThanOrEqual(0.9);
      // Expected: intercept + age*25 + height*180 + weight*80 -> 2.447 - 0.09156*25 + 0.1074*180 + 0.3362*80 = 2.447 - 2.289 + 19.332 + 26.896 = 46.386
      // r = 46.386 / (80 * 0.8) = 46.386 / 64 = ~0.7248
      expect(r).toBeCloseTo(0.725, 3);
    });

    it('should calculate Watson TBW and return Widmark r within female bounds (0.4 to 0.8)', () => {
      const r = calculateWidmarkR(femaleProfile);
      expect(r).toBeGreaterThanOrEqual(0.4);
      expect(r).toBeLessThanOrEqual(0.8);
      // Expected: intercept + height*165 + weight*60 -> -2.097 + 0.1069*165 + 0.2466*60 = -2.097 + 17.6385 + 14.796 = 30.3375
      // r = 30.3375 / (60 * 0.8) = 30.3375 / 48 = ~0.6320
      expect(r).toBeCloseTo(0.632, 3);
    });
  });

  describe('estimateCalories', () => {
    it('should estimate beer calories using 1.5x alcohol calories heuristic', () => {
      // 500ml beer @ 5% -> 19.725g alcohol -> 138.075 alcohol calories -> *1.5 = 207.1125 -> 207 kcal
      expect(estimateCalories(500, 5)).toBe(207);
    });

    it('should estimate wine calories using 1.2x alcohol calories heuristic', () => {
      // 150ml wine @ 12% -> 14.202g alcohol -> 99.414 alcohol calories -> *1.2 = 119.2968 -> 119 kcal
      expect(estimateCalories(150, 12)).toBe(119);
    });

    it('should estimate spirit calories using 1.0x alcohol calories heuristic', () => {
      // 40ml spirit @ 40% -> 12.624g alcohol -> 88.368 alcohol calories -> 88 kcal
      expect(estimateCalories(40, 40)).toBe(88);
    });
  });

  describe('calculateBAC', () => {
    it('should return 0 when no drinks are provided', () => {
      expect(calculateBAC([], maleProfile)).toBe(0);
    });

    it('should return 0 if drinks are in the future', () => {
      const now = Date.now();
      const futureDrinks: Drink[] = [
        { id: '1', timestamp: now + 100000, volume: 500, abv: 5 }
      ];
      expect(calculateBAC(futureDrinks, maleProfile, now)).toBe(0);
    });

    it('should calculate BAC correctly right after a drink (instant absorption)', () => {
      const now = Date.now();
      const drinks: Drink[] = [
        { id: '1', timestamp: now, volume: 500, abv: 5 } // 500ml of 5% beer -> 25ml ethanol -> ~19.725g alcohol
      ];
      // male weight = 80kg, r = 0.7248
      // addedBAC = (19.725 / (80000 * 0.7248)) * 100 = 19.725 / 57984 * 100 = ~0.034%
      const bac = calculateBAC(drinks, maleProfile, now);
      expect(bac).toBeCloseTo(0.034, 3);
    });

    it('should metabolize BAC over time', () => {
      const now = Date.now();
      const drinks: Drink[] = [
        { id: '1', timestamp: now - 3600000, volume: 500, abv: 5 } // 1 hour ago
      ];
      // Initial BAC: ~0.034017%
      // After 1 hour, minus metabolism (0.015% / hr)
      // Expected BAC: ~0.034017 - 0.015 = ~0.019%
      const bac = calculateBAC(drinks, maleProfile, now);
      expect(bac).toBeCloseTo(0.019, 3);
    });

    it('should not go below 0 BAC', () => {
      const now = Date.now();
      const drinks: Drink[] = [
        { id: '1', timestamp: now - 10 * 3600000, volume: 500, abv: 5 } // 10 hours ago
      ];
      const bac = calculateBAC(drinks, maleProfile, now);
      expect(bac).toBe(0);
    });
  });

  describe('calculateTimeToZero', () => {
    it('should return 0 if BAC is 0', () => {
      expect(calculateTimeToZero([], maleProfile)).toBe(0);
    });

    it('should return correct hours to reach 0 BAC', () => {
      const now = Date.now();
      const drinks: Drink[] = [
        { id: '1', timestamp: now, volume: 500, abv: 5 } // Initial BAC: ~0.034017%
      ];
      // Time to zero = 0.034017 / 0.015 = ~2.268 hours
      const hours = calculateTimeToZero(drinks, maleProfile, now);
      expect(hours).toBeCloseTo(2.268, 3);
    });
  });

  describe('groupIntoSessions', () => {
    it('should return empty list when no drinks', () => {
      expect(groupIntoSessions([], maleProfile)).toEqual([]);
    });

    it('should group drinks within 12 hours into one session', () => {
      const now = Date.now();
      const drinks: Drink[] = [
        { id: '1', timestamp: now - 2 * 3600000, volume: 330, abv: 5 },
        { id: '2', timestamp: now, volume: 330, abv: 5 }
      ];
      const sessions = groupIntoSessions(drinks, maleProfile);
      expect(sessions.length).toBe(1);
      expect(sessions[0].drinks.length).toBe(2);
    });

    it('should split drinks separated by more than 12 hours into separate sessions', () => {
      const now = Date.now();
      const drinks: Drink[] = [
        { id: '1', timestamp: now - 15 * 3600000, volume: 330, abv: 5 },
        { id: '2', timestamp: now, volume: 330, abv: 5 }
      ];
      const sessions = groupIntoSessions(drinks, maleProfile);
      expect(sessions.length).toBe(2);
      expect(sessions[0].drinks.length).toBe(1); // Sorted newest session first
      expect(sessions[1].drinks.length).toBe(1);
    });
  });
});
