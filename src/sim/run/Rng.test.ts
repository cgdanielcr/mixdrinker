import { describe, expect, it } from 'vitest';
import { createRng } from './Rng';

describe('createRng', () => {
  it('is deterministic: the same seed replays the same night', () => {
    const a = Array.from({ length: 50 }, () => createRng(12345).next());
    const b = Array.from({ length: 50 }, () => createRng(12345).next());
    expect(a).toEqual(b);

    const one = createRng(999);
    const two = createRng(999);
    expect(Array.from({ length: 50 }, () => one.next())).toEqual(
      Array.from({ length: 50 }, () => two.next()),
    );
  });

  it('gives different streams for different seeds', () => {
    const a = Array.from({ length: 20 }, () => createRng(1).next());
    const b = Array.from({ length: 20 }, () => createRng(2).next());
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('is roughly uniform, so pacing curves are not skewed', () => {
    const rng = createRng(42);
    const buckets = new Array(10).fill(0);
    const draws = 20000;
    for (let i = 0; i < draws; i++) buckets[Math.floor(rng.next() * 10)]++;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(draws / 10 - draws / 40);
      expect(count).toBeLessThan(draws / 10 + draws / 40);
    }
  });
});

describe('range and int', () => {
  it('keeps range inside its bounds', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const n = rng.range(5, 9);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThan(9);
    }
  });

  it('produces inclusive integers and can reach both ends', () => {
    const rng = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = rng.int(1, 4);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('chance', () => {
  it('never fires at 0 and always fires at 1', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('fires about as often as asked', () => {
    const rng = createRng(8);
    let hits = 0;
    for (let i = 0; i < 10000; i++) if (rng.chance(0.25)) hits++;
    expect(hits / 10000).toBeCloseTo(0.25, 1);
  });
});

describe('pick', () => {
  it('only ever returns a member of the list', () => {
    const rng = createRng(21);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 500; i++) expect(items).toContain(rng.pick(items));
  });

  it('reaches every member', () => {
    const rng = createRng(22);
    const items = ['a', 'b', 'c'];
    const seen = new Set(Array.from({ length: 300 }, () => rng.pick(items)));
    expect(seen.size).toBe(3);
  });

  it('refuses an empty list rather than returning undefined', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });
});

describe('weighted', () => {
  it('respects the weights', () => {
    const rng = createRng(31);
    const counts: Record<string, number> = { common: 0, rare: 0 };
    for (let i = 0; i < 10000; i++) {
      const picked = rng.weighted([
        { item: 'common', weight: 9 },
        { item: 'rare', weight: 1 },
      ]);
      counts[picked] = (counts[picked] ?? 0) + 1;
    }
    expect((counts['common'] ?? 0) / 10000).toBeCloseTo(0.9, 1);
  });

  it('never returns a zero-weighted entry', () => {
    const rng = createRng(32);
    for (let i = 0; i < 1000; i++) {
      expect(
        rng.weighted([
          { item: 'yes', weight: 1 },
          { item: 'never', weight: 0 },
        ]),
      ).toBe('yes');
    }
  });

  it('throws when nothing has a usable weight', () => {
    expect(() => createRng(1).weighted([{ item: 'x', weight: 0 }])).toThrow();
  });
});

describe('fork', () => {
  it('gives independent streams, so one system cannot desync another', () => {
    const parent = createRng(100);
    const arrivals = parent.fork(1);
    const orders = parent.fork(2);
    const a = Array.from({ length: 20 }, () => arrivals.next());
    const b = Array.from({ length: 20 }, () => orders.next());
    expect(a).not.toEqual(b);
  });

  it('is itself deterministic', () => {
    const a = createRng(100).fork(7);
    const b = createRng(100).fork(7);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(
      Array.from({ length: 20 }, () => b.next()),
    );
  });

  it('does not consume the parent stream', () => {
    const parent = createRng(55);
    const before = parent.next();
    const other = createRng(55);
    other.fork(3);
    expect(other.next()).toBe(before);
  });
});
