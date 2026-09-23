/**
 * The run: one week at one bar (HANDOVER.md §12).
 *
 * Seed is fixed at run start, so the whole week is reproducible from the number
 * on the summary. Reputation is the bar's HP; tips are the in-run currency and
 * buy stock and recipes between nights.
 */
import { RUN } from '../../tuning';
import { bar } from '../data';
import type { Bar } from '../types';

export interface Run {
  seed: number;
  barId: string;
  /** 1..RUN.NIGHTS */
  night: number;
  /** 0..100, the bar's HP. */
  reputation: number;
  /** In-run currency. */
  tips: number;
  /** ingredientId → ml left in the cellar, refilled into bottles each night. */
  stock: Record<string, number>;
  /** Recipes bought this run, on top of the bar's own menu. */
  boughtRecipes: string[];
  /** Story state for the week. */
  runFlags: string[];
  /** One line per night played. */
  nights: NightRecord[];
  outcome: 'running' | 'finished' | 'fired';
}

export interface NightRecord {
  night: number;
  served: number;
  tips: number;
  walkouts: number;
  sentBack: number;
  turnedAway: number;
  cutOffs: number;
  servedWhileCutOff: number;
  reputationDelta: number;
  reputationAfter: number;
}

export function createRun(seed: number, barId = 'dive'): Run {
  const definition = bar(barId);
  return {
    seed,
    barId,
    night: 1,
    reputation: RUN.START_REPUTATION,
    tips: 0,
    // A full cellar to open the week. Running dry mid-rush is a legitimate way
    // to lose the night, and a reason to spend tips (§12).
    stock: Object.fromEntries(definition.shelf.map((id) => [id, RUN.BOTTLE_ML * 3])),
    boughtRecipes: [],
    runFlags: [],
    nights: [],
    outcome: 'running',
  };
}

/** Everything the customers can order tonight. */
export function menuFor(run: Run, definition: Bar): string[] {
  return [...definition.menu, ...run.boughtRecipes];
}

/** What each bottle gets filled to tonight, limited by what is in the cellar. */
export function pourFromCellar(run: Run, ingredientId: string): number {
  const available = run.stock[ingredientId] ?? 0;
  const filled = Math.min(RUN.BOTTLE_ML, available);
  run.stock[ingredientId] = available - filled;
  return filled;
}

/** Recipes on the bar's locked list that have not been bought yet. */
export function buyableRecipes(run: Run, definition: Bar): string[] {
  const locked = definition.lockedMenu ?? [];
  return locked.filter((id) => !run.boughtRecipes.includes(id));
}

export function isOver(run: Run): boolean {
  return run.outcome !== 'running';
}

/** Apply a finished night and decide whether the run continues. */
export function completeNight(run: Run, record: NightRecord): void {
  run.nights.push(record);
  run.reputation = Math.max(0, Math.min(RUN.MAX_REPUTATION, record.reputationAfter));

  if (run.reputation <= 0) {
    run.outcome = 'fired';
    return;
  }
  if (run.night >= RUN.NIGHTS) {
    run.outcome = 'finished';
    return;
  }
  run.night += 1;
}

/** One line of rumour about tomorrow (§12), from the pacing that is coming. */
export function rumourFor(run: Run): string {
  switch (run.night) {
    case 2:
      return 'Word is tomorrow will be busier than tonight.';
    case 3:
      return 'There is a match on tomorrow. It will be a long one.';
    case 4:
      return 'Payday. They will be three deep at the bar.';
    case 5:
      return 'Last night of the week. Everyone is coming.';
    default:
      return 'Quiet, so far.';
  }
}
