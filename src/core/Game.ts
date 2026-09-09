/**
 * Game: owns state, runs systems at a fixed 60 Hz tick, renders at rAF
 * (HANDOVER.md §4). Rendering reads this state and never writes it.
 */
import { FEEL } from '../tuning';
import { pourStep, stepTilt } from '../sim/liquid/Pour';
import { fillFraction, isEmpty, liquidMl } from '../sim/liquid/Vessel';
import { settleStep } from '../sim/liquid/Mixing';
import type { Input } from './Input';
import type { World, WorldItem } from './World';
import { baseForMouthAt, bottleMouth, heldItem, itemById, resolveStream } from './World';

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_MS = 250;

export class Game {
  readonly world: World;
  private readonly input: Input;
  private accumulator = 0;
  /**
   * The press that picked an item up must not also pour with it, so it is
   * consumed. Pouring and putting down need a fresh press.
   */
  private pressConsumed = false;
  /** The glass we were last pouring into, so a drifting stream is still its mess. */
  private lastTargetId: string | null = null;

  constructor(world: World, input: Input) {
    this.world = world;
    this.input = input;
  }

  /** Advance by real elapsed time, in fixed steps. */
  advance(elapsedMs: number): void {
    this.accumulator += Math.min(elapsedMs, MAX_CATCHUP_MS);
    while (this.accumulator >= TICK_MS) {
      this.tick(TICK_MS);
      this.accumulator -= TICK_MS;
    }
  }

  private tick(dtMs: number): void {
    this.input.update(dtMs);
    this.world.cursor.x = this.input.pointer.x;
    this.world.cursor.y = this.input.pointer.y;
    this.handleGrab();
    this.moveHeldItem(dtMs);
    this.handlePour(dtMs);
    this.settleDrinks(dtMs);
    this.fadePuddles(dtMs);
  }

  private handleGrab(): void {
    const world = this.world;
    const p = this.input.pointer;

    if (p.pressed) {
      if (world.heldId === null) {
        const item = this.itemUnder(p.x, p.y);
        if (item) {
          world.heldId = item.id;
          this.pressConsumed = true;
        }
      } else {
        this.pressConsumed = false;
      }
    }

    // A short press while holding something puts it down; a long one pours.
    if (p.released && world.heldId !== null && !this.pressConsumed) {
      if (p.lastPressMs <= FEEL.TAP_MS) this.putDown();
    }
    if (p.released) this.pressConsumed = false;
  }

  private putDown(): void {
    const item = heldItem(this.world);
    if (!item) return;
    // Snap back to its spot rather than leaving the bar a mess of stray glasses.
    item.x = item.homeX;
    item.y = item.homeY;
    this.world.heldId = null;
    this.world.tilt = 0;
  }

  private moveHeldItem(dtMs: number): void {
    const item = heldItem(this.world);
    if (!item) return;
    const p = this.input.pointer;
    // The cursor is the mouth, not the base: you aim the stream, and the body
    // swings around your wrist as the tilt ramps.
    const base = baseForMouthAt(p, item.height, this.world.tilt);
    // Held items lag the cursor by a frame or two (§9). Frame-rate independent.
    const k = 1 - Math.pow(1 - FEEL.HAND_LAG, dtMs / TICK_MS);
    item.x += (base.x - item.x) * k;
    item.y += (base.y - item.y) * k;
  }

  private handlePour(dtMs: number): void {
    const world = this.world;
    const item = heldItem(world);
    const p = this.input.pointer;

    const wantsToPour =
      item !== null &&
      p.down &&
      !this.pressConsumed &&
      p.heldMs > FEEL.TAP_MS &&
      !isEmpty(item.vessel);

    world.tilt = stepTilt(world.tilt, wantsToPour, dtMs);

    if (!item || world.tilt <= 0) {
      world.flow = 0;
      world.impact = null;
      world.pourTargetId = null;
      world.missing = false;
      world.overflowing = false;
      return;
    }

    const mouth = bottleMouth(item, world.tilt);
    const { target, impact } = resolveStream(world, mouth, world.tilt, item);

    world.impact = impact;
    world.pourTargetId = target?.id ?? null;
    if (target) this.lastTargetId = target.id;

    const wasEmpty = target ? isEmpty(target.vessel) : false;
    const result = pourStep(item.vessel, target?.vessel ?? null, world.tilt, dtMs);

    world.flow = result.pouredMl / (dtMs / 1000);
    world.missing = result.pouredMl > 0 && target === null;
    world.overflowing = result.spilledMl > 0 && target !== null;

    if (target && wasEmpty && result.transferredMl > 0) {
      // A fresh drink in this glass: its build time and mess start now.
      target.drinkSpillMl = 0;
      target.buildTimeSec = 0;
    }

    if (result.spilledMl > 0) {
      // A stream that drifts off the glass is still that drink's waste.
      const blame = itemById(world, target?.id ?? this.lastTargetId);
      if (blame) blame.drinkSpillMl += result.spilledMl;
      this.addPuddle(impact.x, target ? target.y : impact.y, result.spilledMl);
    }
  }

  private settleDrinks(dtMs: number): void {
    for (const item of this.world.items) {
      if (item.kind !== 'glass') continue;
      if (liquidMl(item.vessel) <= 0) continue;
      item.buildTimeSec += dtMs / 1000;
      settleStep(item.vessel, dtMs);
    }
  }

  private addPuddle(x: number, y: number, ml: number): void {
    const near = this.world.puddles.find((p) => Math.abs(p.x - x) < 55 && Math.abs(p.y - y) < 40);
    if (near) {
      near.ml += ml;
      return;
    }
    this.world.puddles.push({ x, y, ml });
    // Keep the counter from accumulating unbounded geometry.
    if (this.world.puddles.length > 24) this.world.puddles.shift();
  }

  private fadePuddles(dtMs: number): void {
    // Puddles dry slowly, so a messy pour stays visible long enough to sting.
    const dry = 0.35 * (dtMs / 1000);
    for (const puddle of this.world.puddles) puddle.ml = Math.max(0, puddle.ml - dry);
    this.world.puddles = this.world.puddles.filter((p) => p.ml > 0.5);
  }

  private itemUnder(x: number, y: number): WorldItem | null {
    // When items overlap — a bottle left standing over a glass — take the one
    // whose centre is nearest the pointer, not whichever happens to be last in
    // the array. Array order picks up the glass you were pouring into.
    let best: WorldItem | null = null;
    let bestDistance = Infinity;

    for (const item of this.world.items) {
      const halfWidth = item.width / 2 + 8;
      const inside =
        x >= item.x - halfWidth &&
        x <= item.x + halfWidth &&
        y <= item.y &&
        y >= item.y - item.height;
      if (!inside) continue;

      const distance = Math.abs(x - item.x);
      if (distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    return best;
  }
}

/** 0..1 — how close the target glass is to its rim. Drives pitch and warnings. */
export function targetFullness(world: World): number {
  const target = itemById(world, world.pourTargetId);
  return target ? fillFraction(target.vessel) : 0;
}
