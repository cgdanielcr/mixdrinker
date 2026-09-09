/**
 * Game: owns state, runs systems at a fixed 60 Hz tick, renders at rAF
 * (HANDOVER.md §4). Rendering reads this state and never writes it.
 */
import { FEEL, ICE as ICE_TUNING, SHAKE, STATION } from '../tuning';
import { pourStep, stepTilt } from '../sim/liquid/Pour';
import { fillToStop } from '../sim/liquid/Jigger';
import {
  addMl,
  capacityLeftMl,
  discard,
  fillFraction,
  isEmpty,
  liquidMl,
} from '../sim/liquid/Vessel';
import { addIce, settleStep, shakeStep } from '../sim/liquid/Mixing';
import { Clock } from './Clock';
import { customerAtSeat, endNight, serveDrink, stepNight } from './Night';
import type { NightState, SeatedCustomer } from './Night';
import type { Input } from './Input';
import type { World, WorldItem } from './World';
import {
  baseForMouthAt,
  bottleMouth,
  heldItem,
  isCarryable,
  itemById,
  resolveStream,
} from './World';

const TICK_MS = 1000 / 60;
const MAX_CATCHUP_MS = 250;

/** Things the renderer and audio want to react to the moment they happen. */
export type GameEvent =
  | { type: 'ice'; x: number; y: number }
  | { type: 'rimmed'; x: number; y: number }
  | { type: 'garnished'; x: number; y: number }
  | { type: 'discarded'; x: number; y: number }
  | { type: 'jiggerStop'; x: number; y: number }
  | { type: 'pickup' }
  | { type: 'putdown' }
  | { type: 'rejected'; x: number; y: number }
  | { type: 'served'; verdict: string; seat: number; x: number; y: number }
  | { type: 'nightOver' };

export class Game {
  readonly world: World;
  /** Drained each frame by main.ts. One-shot feedback, not state. */
  readonly events: GameEvent[] = [];

  readonly clock = new Clock();
  /** Null until a night is started, so Phase 1 sandbox play still works. */
  night: NightState | null = null;

  private readonly input: Input;
  private accumulator = 0;
  /**
   * The press that picked an item up must not also pour with it, so it is
   * consumed. Pouring and putting down need a fresh press.
   */
  private pressConsumed = false;
  /** The vessel we were last pouring into, so a drifting stream is still its mess. */
  private lastTargetId: string | null = null;
  private iceCooldownMs = 0;
  /**
   * The jigger stopped this pour dead on a mark. Held until the player lets go,
   * so one press gives exactly one measure — otherwise the pour would just walk
   * up through 30, 45 and 60 and the jigger would measure nothing.
   */
  private pourLatched = false;

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
    this.iceCooldownMs = Math.max(0, this.iceCooldownMs - dtMs);

    this.updateHoveredStation();
    this.handleGrab();
    this.moveHeldItem(dtMs);
    this.handleShake(dtMs);
    this.handleRim(dtMs);
    this.handlePour(dtMs);
    this.advanceNight(dtMs);
    this.settleDrinks(dtMs);
    this.fadePuddles(dtMs);
  }

  // ---------------------------------------------------------------- stations

  private updateHoveredStation(): void {
    const held = heldItem(this.world);
    const under = this.itemUnder(this.input.pointer.x, this.input.pointer.y);
    this.world.hoveredTargetId = under && this.canUse(under, held) ? under.id : null;
  }

  /** Whether tapping `target` while carrying `held` would actually do anything. */
  private canUse(target: WorldItem, held: WorldItem | null): boolean {
    if (target.kind === 'seat') {
      // Only worth highlighting if there is someone there wanting a drink and
      // you are carrying something to give them.
      if (!held || liquidMl(held.vessel) <= 0) return false;
      const customer = this.customerAt(target);
      return customer !== null && customer.phase !== 'leaving';
    }
    if (target.kind !== 'station') return false;
    // The book is the one station you use empty-handed.
    return target.station === 'book' ? held === null : held !== null;
  }

  private customerAt(seat: WorldItem): SeatedCustomer | null {
    if (seat.seatIndex === undefined || !this.night) return null;
    return customerAtSeat(this.night, seat.seatIndex);
  }

  private useStation(station: WorldItem): void {
    const world = this.world;
    const held = heldItem(world);

    if (station.kind === 'seat') {
      this.serve(station);
      return;
    }

    if (station.station === 'book') {
      world.bookOpen = !world.bookOpen;
      return;
    }
    if (!held) return;

    switch (station.station) {
      case 'ice': {
        if (this.iceCooldownMs > 0) return;
        this.iceCooldownMs = STATION.ICE_COOLDOWN_MS;
        if (capacityLeftMl(held.vessel) < ICE_TUNING.CUBE_ML) {
          this.events.push({ type: 'rejected', x: held.x, y: held.y - held.height });
          return;
        }
        if (addIce(held.vessel, STATION.ICE_PER_TAP)) {
          this.events.push({ type: 'ice', x: held.x, y: held.y - held.height });
        }
        break;
      }
      case 'garnish': {
        if (held.vessel.garnish.includes('lime_wedge')) return;
        held.vessel.garnish.push('lime_wedge');
        this.events.push({ type: 'garnished', x: held.x, y: held.y - held.height });
        break;
      }
      case 'sink': {
        discard(held.vessel);
        held.drinkSpillMl = 0;
        held.buildTimeSec = 0;
        this.events.push({ type: 'discarded', x: station.x, y: station.y - station.height });
        break;
      }
      case 'salt':
        // Salt is a hold, not a tap — see handleRim.
        break;
    }
  }

  /**
   * Hand the drink over (§3: serving is dragging a glass to a seat's spot).
   * The glass empties whatever they think of it — a sent-back drink is gone.
   */
  private serve(seat: WorldItem): void {
    const held = heldItem(this.world);
    const customer = this.customerAt(seat);
    if (!held || !customer || !this.night) return;

    const outcome = serveDrink(
      this.night,
      customer,
      held.vessel,
      held.drinkSpillMl,
      held.buildTimeSec,
    );
    if (!outcome) return;

    held.drinkSpillMl = 0;
    held.buildTimeSec = 0;
    this.events.push({
      type: 'served',
      verdict: outcome.reaction.verdict,
      seat: seat.seatIndex ?? 0,
      x: seat.x,
      y: seat.y - 40,
    });
  }

  /** §6: drag the glass onto the salt plate and press. */
  private handleRim(dtMs: number): void {
    const world = this.world;
    const station = itemById(world, world.hoveredTargetId);
    const held = heldItem(world);
    const p = this.input.pointer;

    const rimming = station?.station === 'salt' && held !== null && p.down && !this.pressConsumed;

    if (!rimming) {
      world.rimProgress = 0;
      return;
    }

    if (held.vessel.rim === 'salt') {
      world.rimProgress = 1;
      return;
    }

    world.rimProgress = Math.min(1, world.rimProgress + dtMs / STATION.RIM_MS);
    if (world.rimProgress >= 1) {
      held.vessel.rim = 'salt';
      this.events.push({ type: 'rimmed', x: held.x, y: held.y - held.height });
    }
  }

  // ------------------------------------------------------------------- hands

  private handleGrab(): void {
    const world = this.world;
    const p = this.input.pointer;

    if (p.pressed) {
      if (world.heldId === null) {
        const item = this.itemUnder(p.x, p.y);
        if (item && isCarryable(item)) {
          world.heldId = item.id;
          this.pressConsumed = true;
          this.events.push({ type: 'pickup' });
        } else if (item?.station === 'book') {
          this.useStation(item);
          this.pressConsumed = true;
        }
      } else {
        this.pressConsumed = false;
      }
    }

    // A short press while holding something: use the station under it, or put
    // it down. A long press pours, shakes, or rims.
    if (p.released && world.heldId !== null && !this.pressConsumed) {
      const station = itemById(world, world.hoveredTargetId);
      if (station && station.station !== 'salt') {
        this.useStation(station);
      } else if (!station && p.lastPressMs <= FEEL.TAP_MS) {
        this.putDown();
      }
    }
    if (p.released) this.pressConsumed = false;
    if (p.released) this.pourLatched = false;
  }

  private putDown(): void {
    const item = heldItem(this.world);
    if (!item) return;
    // Snap back to its spot rather than leaving the bar a mess of stray glasses.
    item.x = item.homeX;
    item.y = item.homeY;
    this.world.heldId = null;
    this.world.tilt = 0;
    this.events.push({ type: 'putdown' });
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

  /**
   * Shaking and pouring share one gesture: hold the shaker and move fast and
   * you are shaking; hold it steady over a glass and you are straining. No
   * mode switch, and it matches what your arm is actually doing.
   */
  private handleShake(dtMs: number): void {
    const world = this.world;
    const item = heldItem(world);
    const p = this.input.pointer;

    if (!item || item.kind !== 'shaker' || !p.down || this.pressConsumed) {
      world.shakeIntensity = 0;
      return;
    }

    const span = SHAKE.FULL_SPEED - SHAKE.MIN_SPEED;
    const intensity = Math.max(0, Math.min(1, (p.speed - SHAKE.MIN_SPEED) / span));
    world.shakeIntensity = intensity;
    if (intensity > 0) shakeStep(item.vessel, intensity, dtMs);
  }

  // -------------------------------------------------------------------- pour

  private handlePour(dtMs: number): void {
    const world = this.world;
    const item = heldItem(world);
    const p = this.input.pointer;

    const busyElsewhere =
      world.shakeIntensity > SHAKE.SUPPRESS_POUR_ABOVE || world.hoveredTargetId !== null;

    const wantsToPour =
      item !== null &&
      p.down &&
      !this.pressConsumed &&
      p.heldMs > FEEL.TAP_MS &&
      !this.pourLatched &&
      !busyElsewhere &&
      !isEmpty(item.vessel);

    world.tilt = stepTilt(world.tilt, wantsToPour, dtMs);

    if (!item || world.tilt <= 0) {
      world.flow = 0;
      world.impact = null;
      world.pourTargetId = null;
      world.missing = false;
      world.overflowing = false;
      world.jiggerStopped = false;
      return;
    }

    const mouth = bottleMouth(item, world.tilt);
    const { target, impact } = resolveStream(world, mouth, world.tilt, item);

    world.impact = impact;
    world.pourTargetId = target?.id ?? null;
    if (target) this.lastTargetId = target.id;

    const wasEmpty = target ? isEmpty(target.vessel) : false;
    const result = this.transfer(item, target, dtMs);

    world.flow = result.pouredMl / (dtMs / 1000);
    world.missing = result.pouredMl > 0 && target === null;
    world.overflowing = result.spilledMl > 0 && target !== null;

    if (target && wasEmpty && result.transferredMl > 0) {
      // A fresh drink in this vessel: its build time and mess start now.
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

  /**
   * Move liquid for one tick. The jigger is the exception: it stops dead on
   * its measuring marks, and anything still coming out goes on the counter.
   */
  private transfer(
    source: WorldItem,
    target: WorldItem | null,
    dtMs: number,
  ): { transferredMl: number; spilledMl: number; pouredMl: number } {
    const world = this.world;

    if (!target || target.kind !== 'jigger') {
      world.jiggerStopped = false;
      return pourStep(source.vessel, target?.vessel ?? null, world.tilt, dtMs);
    }

    // Read the mix before pouring: draining the last of a bottle would
    // otherwise leave nothing to work out the composition from.
    const composition = proportionsOf(source.vessel.contents);

    // Pour into nothing first, so the source empties at the same rate either
    // way, then decide how much the jigger is willing to accept.
    const held = liquidMl(target.vessel);
    const out = pourStep(source.vessel, null, world.tilt, dtMs);
    if (out.pouredMl <= 0) return out;

    // pourStep charged that to the source's spill; the jigger may yet take it.
    source.vessel.spilledMl -= out.pouredMl;

    const fill = fillToStop(held, out.pouredMl);
    for (const [id, share] of Object.entries(composition)) {
      if (fill.acceptedMl > 0) addMl(target.vessel, id, share * fill.acceptedMl);
    }
    if (fill.stopped) {
      // Hard stop on the mark: exact, but it costs you a second press.
      if (!world.jiggerStopped) {
        this.events.push({ type: 'jiggerStop', x: target.x, y: target.y - target.height });
      }
      this.pourLatched = true;
      world.tilt = 0;
    }
    world.jiggerStopped = fill.stopped;

    if (fill.rejectedMl > 0) source.vessel.spilledMl += fill.rejectedMl;

    return {
      transferredMl: fill.acceptedMl,
      spilledMl: fill.rejectedMl,
      pouredMl: out.pouredMl,
    };
  }

  private advanceNight(dtMs: number): void {
    if (!this.night || this.night.over) return;
    const minutes = this.clock.advance(dtMs);
    stepNight(this.night, minutes);
    if (this.clock.isOver) {
      endNight(this.night);
      this.events.push({ type: 'nightOver' });
    }
  }

  /** Start a night. Phase 1 sandbox play is just never calling this. */
  startNight(night: NightState): void {
    this.night = night;
    this.clock.reset();
  }

  private settleDrinks(dtMs: number): void {
    for (const item of this.world.items) {
      if (item.kind === 'bottle' || item.kind === 'station') continue;
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
      if (this.world.heldId === item.id) continue;
      const halfWidth = item.width / 2 + 8;
      const inside =
        x >= item.x - halfWidth &&
        x <= item.x + halfWidth &&
        y <= item.y + 10 &&
        y >= item.y - item.height - 10;
      if (!inside) continue;

      const distance = Math.abs(x - item.x);
      if (distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    return best;
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }
}

/** Each ingredient's share of the whole, 0..1, summing to 1. */
function proportionsOf(contents: Record<string, number>): Record<string, number> {
  const sum = Object.values(contents).reduce((a, b) => a + b, 0);
  if (sum <= 0) return {};
  const out: Record<string, number> = {};
  for (const [id, ml] of Object.entries(contents)) out[id] = ml / sum;
  return out;
}

/** 0..1 — how close the target vessel is to its rim. Drives pitch and warnings. */
export function targetFullness(world: World): number {
  const target = itemById(world, world.pourTargetId);
  return target ? fillFraction(target.vessel) : 0;
}
