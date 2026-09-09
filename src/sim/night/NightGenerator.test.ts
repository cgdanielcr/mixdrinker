import { describe, expect, it } from 'vitest';
import { NIGHT } from '../../tuning';
import { CUSTOMER_DEFS, RECIPES, bar } from '../data';
import { arrivalRateAt, arrivalsBetween, generateNight } from './NightGenerator';

const dive = bar('dive');
const NIGHT_LENGTH = NIGHT.CLOSE_MINUTE - NIGHT.OPEN_MINUTE;

describe('arrivalRateAt', () => {
  const curve: [number, number][] = [
    [0, 0],
    [10, 1],
    [20, 0.5],
  ];

  it('reads the curve at its control points', () => {
    expect(arrivalRateAt(curve, 0)).toBe(0);
    expect(arrivalRateAt(curve, 10)).toBe(1);
    expect(arrivalRateAt(curve, 20)).toBe(0.5);
  });

  it('interpolates between them', () => {
    expect(arrivalRateAt(curve, 5)).toBeCloseTo(0.5, 6);
    expect(arrivalRateAt(curve, 15)).toBeCloseTo(0.75, 6);
  });

  it('holds flat outside the curve rather than extrapolating to nonsense', () => {
    expect(arrivalRateAt(curve, -50)).toBe(0);
    expect(arrivalRateAt(curve, 9999)).toBe(0.5);
  });

  it('copes with an empty curve', () => {
    expect(arrivalRateAt([], 5)).toBe(0);
  });
});

describe('generateNight', () => {
  it('is deterministic: the same seed replays the same night (§12)', () => {
    const a = generateNight(4242, dive, 1);
    const b = generateNight(4242, dive, 1);
    expect(a.arrivals).toEqual(b.arrivals);
  });

  it('gives a different night for a different seed', () => {
    const a = generateNight(1, dive, 1);
    const b = generateNight(2, dive, 1);
    expect(a.arrivals).not.toEqual(b.arrivals);
  });

  it('gives a different night for a different night number on the same seed', () => {
    const a = generateNight(77, dive, 1);
    const b = generateNight(77, dive, 2);
    expect(a.arrivals).not.toEqual(b.arrivals);
  });

  it('only ever seats people the bar actually knows', () => {
    const plan = generateNight(9, dive, 1);
    const clientele = new Set(dive.clientele.map((entry) => entry.customerId));
    for (const arrival of plan.arrivals) {
      expect(clientele.has(arrival.defId)).toBe(true);
      expect(CUSTOMER_DEFS[arrival.defId]).toBeDefined();
    }
  });

  it('only ever orders from the bar menu', () => {
    const plan = generateNight(10, dive, 1);
    for (const arrival of plan.arrivals) {
      expect(dive.menu).toContain(arrival.recipeId);
      expect(RECIPES[arrival.recipeId]).toBeDefined();
    }
  });

  it('keeps every arrival inside the night and in order', () => {
    const plan = generateNight(11, dive, 1);
    expect(plan.arrivals.length).toBeGreaterThan(0);
    for (let i = 0; i < plan.arrivals.length; i++) {
      const arrival = plan.arrivals[i]!;
      expect(arrival.atMinute).toBeGreaterThanOrEqual(0);
      expect(arrival.atMinute).toBeLessThan(NIGHT_LENGTH);
      if (i > 0) expect(arrival.atMinute).toBeGreaterThanOrEqual(plan.arrivals[i - 1]!.atMinute);
    }
  });

  it('records what it was generated from, so the summary can print it', () => {
    const plan = generateNight(1234, dive, 3);
    expect(plan).toMatchObject({ seed: 1234, barId: 'dive', night: 3 });
  });

  it('follows the pacing curve: the rush is busier than opening or last call', () => {
    // Average across seeds so this tests the curve, not one lucky night.
    const early: number[] = [];
    const rush: number[] = [];
    const late: number[] = [];
    for (let seed = 0; seed < 40; seed++) {
      const { arrivals } = generateNight(seed, dive, 1);
      early.push(arrivals.filter((a) => a.atMinute < 60).length);
      rush.push(arrivals.filter((a) => a.atMinute >= 190 && a.atMinute < 250).length);
      late.push(arrivals.filter((a) => a.atMinute >= 280).length);
    }
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

    expect(mean(rush)).toBeGreaterThan(mean(early));
    expect(mean(rush)).toBeGreaterThan(mean(late));
  });

  it('produces a workable number of customers for a night', () => {
    for (let seed = 0; seed < 20; seed++) {
      const count = generateNight(seed, dive, 1).arrivals.length;
      expect(count).toBeGreaterThan(20);
      expect(count).toBeLessThan(90);
    }
  });

  it('reuses the last authored curve for nights it has no pacing for', () => {
    expect(() => generateNight(5, dive, 99)).not.toThrow();
    expect(generateNight(5, dive, 99).arrivals.length).toBeGreaterThan(0);
  });
});

describe('arrivalsBetween', () => {
  const plan = generateNight(2026, dive, 1);

  it('returns everyone due in the window, once', () => {
    const seen = new Set<number>();
    let total = 0;
    for (let m = 0; m < NIGHT_LENGTH; m++) {
      for (const arrival of arrivalsBetween(plan, m, m + 1)) {
        expect(seen.has(arrival.atMinute)).toBe(false);
        seen.add(arrival.atMinute);
        total++;
      }
    }
    expect(total).toBe(plan.arrivals.length);
  });

  it('is half-open, so nobody arrives twice on a tick boundary', () => {
    const first = plan.arrivals[0]!;
    expect(arrivalsBetween(plan, 0, first.atMinute)).toContain(first);
    expect(arrivalsBetween(plan, first.atMinute, NIGHT_LENGTH)).not.toContain(first);
  });

  it('returns nothing for an empty window', () => {
    expect(arrivalsBetween(plan, 50, 50)).toEqual([]);
  });
});
