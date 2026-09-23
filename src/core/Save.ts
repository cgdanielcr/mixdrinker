/**
 * Persistence (HANDOVER.md §1): localStorage only, run state plus meta
 * unlocks. No backend, ever.
 *
 * Everything written here must survive a schema change without taking the
 * player's week with it, so loading is defensive: anything that does not parse
 * cleanly is discarded rather than half-applied.
 */
import { RUN } from '../tuning';
import type { Run } from '../sim/run/Run';

const RUN_KEY = 'lastcall.run.v1';
const META_KEY = 'lastcall.meta.v1';

export interface Meta {
  runsPlayed: number;
  bestReputation: number;
  weeksFinished: number;
  timesFired: number;
}

export function emptyMeta(): Meta {
  return { runsPlayed: 0, bestReputation: 0, weeksFinished: 0, timesFired: 0 };
}

/** localStorage throws in private windows and when storage is disabled. */
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do: the game is still perfectly playable unsaved.
  }
}

function clear(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function saveRun(run: Run): void {
  write(RUN_KEY, run);
}

export function clearRun(): void {
  clear(RUN_KEY);
}

/** A saved run, or null if there is nothing usable stored. */
export function loadRun(): Run | null {
  const data = read(RUN_KEY);
  if (!isObject(data)) return null;

  const run = data as Partial<Run>;
  if (
    typeof run.seed !== 'number' ||
    typeof run.barId !== 'string' ||
    typeof run.night !== 'number' ||
    typeof run.reputation !== 'number' ||
    typeof run.tips !== 'number' ||
    !isObject(run.stock)
  ) {
    return null;
  }
  if (run.night < 1 || run.night > RUN.NIGHTS) return null;
  // A finished run is history, not something to resume into.
  if (run.outcome !== 'running') return null;

  return {
    seed: run.seed,
    barId: run.barId,
    night: run.night,
    reputation: run.reputation,
    tips: run.tips,
    stock: run.stock as Record<string, number>,
    boughtRecipes: Array.isArray(run.boughtRecipes) ? run.boughtRecipes : [],
    runFlags: Array.isArray(run.runFlags) ? run.runFlags : [],
    nights: Array.isArray(run.nights) ? run.nights : [],
    outcome: 'running',
  };
}

export function loadMeta(): Meta {
  const data = read(META_KEY);
  if (!isObject(data)) return emptyMeta();
  const meta = data as Partial<Meta>;
  return {
    runsPlayed: numberOr(meta.runsPlayed, 0),
    bestReputation: numberOr(meta.bestReputation, 0),
    weeksFinished: numberOr(meta.weeksFinished, 0),
    timesFired: numberOr(meta.timesFired, 0),
  };
}

export function saveMeta(meta: Meta): void {
  write(META_KEY, meta);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
