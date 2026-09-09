/**
 * Seeded PRNG (HANDOVER.md §4, §8).
 *
 * Anything that decides *who or when* goes through here with the night seed.
 * `Math.random` is banned in src/sim and ESLint enforces it: generation has to
 * be reproducible from (seed, barId, night) so a night can be replayed, shared
 * and tested.
 */

export interface Rng {
  /** 0 <= n < 1 */
  next(): number;
  /** min <= n < max */
  range(min: number, max: number): number;
  /** min <= n <= max, integer */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Picks by relative weight. Zero and negative weights never come up. */
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
  /** A fresh stream derived from this one, so one system cannot desync another. */
  fork(salt: number): Rng;
}

/** mulberry32 — small, fast, and good enough for who walks in the door. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error('Rng.pick needs at least one item');
      return items[Math.floor(next() * items.length)]!;
    },
    weighted: (items) => {
      const usable = items.filter((entry) => entry.weight > 0);
      if (usable.length === 0) throw new Error('Rng.weighted needs a positive weight');
      const total = usable.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = next() * total;
      for (const entry of usable) {
        roll -= entry.weight;
        if (roll < 0) return entry.item;
      }
      return usable[usable.length - 1]!.item;
    },
    fork: (salt) => createRng((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0),
  };

  return rng;
}

/** A seed the player can read off a summary and type back in (§12). */
export function randomSeed(): number {
  // Not sim code: this is the one place a fresh seed is allowed to come from
  // the clock, because a new run has nothing to be reproducible from yet.
  return (Date.now() ^ (performance.now() * 1000)) >>> 0;
}
