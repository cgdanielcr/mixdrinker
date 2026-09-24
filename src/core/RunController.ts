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
import { Tutorial } from './Tutorial';
import type { TutorialView } from './Tutorial';
import type { Game } from './Game';
import type { World } from './World';
import { bottleTemperature } from './World';
import { ShopScreen } from '../ui/Screens';
import type { Meta } from './Save';
import { clearRun, loadMeta, loadRun, saveMeta, saveRun } from './Save';

export type Phase = 'title' | 'tutorial' | 'night' | 'nightOver' | 'shop' | 'runOver';

export class RunController {
  phase: Phase = 'title';
  run: Run | null = null;
  meta: Meta = loadMeta();
  /** Totals for the night just finished, for the summary screen. */
  lastTotals: NightTotals | null = null;

  /** The guided lessons, while they are running. */
  tutorial: Tutorial | null = null;
  /** Drinks handed over during the tutorial — how serve steps know they are done. */
  tutorialServes = 0;
  /** What the last customer made of the last tutorial drink, shown as feedback. */
  lastTutorialServe: { verdict: string; line: string; score: number } | null = null;

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

  /**
   * `startNight` is a playtesting shortcut: the pressure §8 cares about lives
   * on night 3, and nobody should have to play 27 minutes to reach it. It
   * skips straight there with a full reputation and a full cellar, so what you
   * are testing is that night's pacing rather than a fiction about the two
   * before it.
   */
  startRun(seed: number | null, startNight = 1): void {
    this.run = createRun(seed ?? randomSeed());
    this.run.night = Math.max(1, Math.min(RUN.NIGHTS, Math.floor(startNight)));
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

  // -------------------------------------------------------------- tutorial

  /**
   * One drink at a time, easiest first, with no clock and nobody walking out.
   * Written because the first playtest was, rightly, "too much, too fast".
   */
  startTutorial(): void {
    const definition = bar('dive');
    // A throwaway run, only so the bar can be filled; it is never saved.
    this.resetBar(createRun(1));
    const night = createNight(1, definition, 1);
    night.plan.arrivals = [];
    this.game.startNight(night);
    // The clock never moves: patience never drains and nobody leaves.
    this.game.clock.paused = true;
    this.game.allowCutOff = false;

    this.tutorial = new Tutorial();
    this.tutorialServes = 0;
    this.lastTutorialServe = null;
    this.phase = 'tutorial';
  }

  /** Called every frame while the tutorial is up. */
  updateTutorial(): TutorialView | null {
    const tutorial = this.tutorial;
    const night = this.game.night;
    if (!tutorial || !night) return null;

    tutorial.update({ world: this.world, night, serves: this.tutorialServes });
    const view = tutorial.view();

    this.world.guide.highlightId = view.finished ? null : view.highlight;
    this.world.guide.target =
      view.finished || !view.target
        ? null
        : { vesselId: view.target.vessel, totalMl: view.target.totalMl, label: view.target.label };
    return view;
  }

  /** A drink was handed over while the tutorial was running. */
  noteTutorialServe(verdict: string, line: string, score: number): void {
    this.tutorialServes += 1;
    this.lastTutorialServe = { verdict, line, score };
  }

  skipTutorialStep(): void {
    this.tutorial?.skip();
  }

  /** Leave the tutorial, straight into a real week or back to the title. */
  endTutorial(startRun: boolean): void {
    this.tutorial = null;
    this.world.guide.highlightId = null;
    this.world.guide.target = null;
    this.game.clock.paused = false;
    this.game.allowCutOff = true;
    if (startRun) this.startRun(null);
    else this.toTitle();
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
        // discard() puts everything at room temperature; mixers go back in the fridge.
        item.vessel.chilledC = bottleTemperature(item.ingredientId);
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
