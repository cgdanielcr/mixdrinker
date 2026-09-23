/**
 * The run loop (HANDOVER.md §12):
 *
 *   Title → Run → [ Night → summary → shop ] x5 → Run summary
 *
 * Owns the flow between screens so main.ts stays a bootstrap. The night itself
 * knows nothing about the week; this is what joins them.
 */
import { RUN, SHOP } from '../tuning';
import { bar } from '../sim/data';
import { discard } from '../sim/liquid/Vessel';
import { completeNight, createRun, menuFor, pourFromCellar } from '../sim/run/Run';
import type { Run } from '../sim/run/Run';
import { nightRecordFrom } from '../sim/night/Summary';
import type { NightTotals } from '../sim/night/Summary';
import { randomSeed } from '../sim/run/Rng';
import { createNight, nightTotals } from './Night';
import type { Game } from './Game';
import type { World } from './World';
import { ShopScreen } from '../ui/Screens';
import type { Meta } from './Save';
import { clearRun, loadMeta, loadRun, saveMeta, saveRun } from './Save';

export type Phase = 'title' | 'night' | 'nightOver' | 'shop' | 'runOver';

export class RunController {
  phase: Phase = 'title';
  run: Run | null = null;
  meta: Meta = loadMeta();
  /** Totals for the night just finished, for the summary screen. */
  lastTotals: NightTotals | null = null;

  private readonly game: Game;
  private readonly world: World;

  constructor(game: Game, world: World) {
    this.game = game;
    this.world = world;
  }

  hasSavedRun(): boolean {
    return loadRun() !== null;
  }

  // ------------------------------------------------------------------ flow

  startRun(seed: number | null): void {
    this.run = createRun(seed ?? randomSeed());
    this.meta.runsPlayed += 1;
    saveMeta(this.meta);
    saveRun(this.run);
    this.beginNight();
  }

  continueRun(): boolean {
    const saved = loadRun();
    if (!saved) return false;
    this.run = saved;
    this.beginNight();
    return true;
  }

  /** Open the doors on `run.night`. */
  beginNight(): void {
    const run = this.run;
    if (!run) return;
    const definition = bar(run.barId);

    this.resetBar(run);
    this.game.startNight(
      createNight(run.seed, definition, run.night, { menu: menuFor(run, definition) }),
    );
    this.phase = 'night';
  }

  /** Called once when the clock runs out. */
  finishNight(): void {
    const run = this.run;
    const night = this.game.night;
    if (!run || !night) return;

    const totals = nightTotals(night, run.night);
    this.lastTotals = totals;
    run.tips += totals.tips;

    const record = nightRecordFrom(totals, run.reputation);
    completeNight(run, record);

    this.meta.bestReputation = Math.max(this.meta.bestReputation, run.reputation);

    if (run.outcome === 'running') {
      saveRun(run);
      this.phase = 'nightOver';
      return;
    }

    // The week is over, one way or the other.
    if (run.outcome === 'fired') this.meta.timesFired += 1;
    else this.meta.weeksFinished += 1;
    saveMeta(this.meta);
    clearRun();
    this.phase = 'nightOver';
  }

  /** From the night summary: on to the shop, or to the run summary. */
  afterNightSummary(): void {
    this.phase = this.run && this.run.outcome === 'running' ? 'shop' : 'runOver';
  }

  toTitle(): void {
    this.phase = 'title';
    this.run = null;
    this.meta = loadMeta();
  }

  // ------------------------------------------------------------------ shop

  buy(what: string): void {
    const run = this.run;
    if (!run) return;
    const definition = bar(run.barId);

    if (what === 'restock') {
      const cost = ShopScreen.restockCost(run);
      if (cost <= 0 || run.tips < cost) return;
      run.tips -= cost;
      for (const id of definition.shelf) run.stock[id] = RUN.BOTTLE_ML * 3;
    } else if (what === 'supplies') {
      if (run.tips < SHOP.SUPPLIES_COST) return;
      run.tips -= SHOP.SUPPLIES_COST;
      if (!run.runFlags.includes('stocked_garnish')) run.runFlags.push('stocked_garnish');
    } else {
      // A recipe off the bar's locked list.
      if (run.boughtRecipes.includes(what)) return;
      if (!(definition.lockedMenu ?? []).includes(what)) return;
      if (run.tips < SHOP.RECIPE_COST) return;
      run.tips -= SHOP.RECIPE_COST;
      run.boughtRecipes.push(what);
    }
    saveRun(run);
  }

  // ------------------------------------------------------------- the bar

  /**
   * Reset the bar for a fresh night, filling the bottles from the cellar.
   * A bottle that runs dry mid-rush is a legitimate way to lose the night and
   * the main reason to spend tips (§12).
   */
  private resetBar(run: Run): void {
    for (const item of this.world.items) {
      discard(item.vessel);
      item.x = item.homeX;
      item.y = item.homeY;
      item.drinkSpillMl = 0;
      item.buildTimeSec = 0;

      if (item.ingredientId) {
        const filled = pourFromCellar(run, item.ingredientId);
        if (filled > 0) item.vessel.contents[item.ingredientId] = filled;
      }
    }
    this.world.heldId = null;
    this.world.tilt = 0;
    this.world.puddles.length = 0;
    this.world.bookOpen = false;
    this.world.rimProgress = 0;
    this.world.cutOffProgress = 0;
  }
}
