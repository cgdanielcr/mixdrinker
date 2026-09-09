/**
 * The world: what is on the bar, and where. Plain state, no Pixi.
 * Geometry lives here because "did the stream hit the glass?" is a gameplay
 * question (HANDOVER.md §6), not a rendering one.
 */
import { LAYOUT, POUR } from '../tuning';
import { createVessel } from '../sim/liquid/Vessel';
import type { Vessel } from '../sim/types';

export type ItemKind = 'bottle' | 'glass';

export interface WorldItem {
  id: string;
  kind: ItemKind;
  vessel: Vessel;
  /** Base of the item, in logical pixels. Sprites are anchored bottom-centre. */
  x: number;
  y: number;
  /** Where it lives when it is put back down. */
  homeX: number;
  homeY: number;
  width: number;
  height: number;
  label: string;
  /** For bottles: the single ingredient this bottle holds, for tinting. */
  ingredientId?: string;
  /** Spill accumulated while making the drink currently in this glass. */
  drinkSpillMl: number;
  /** Seconds since the first liquid went into this glass. */
  buildTimeSec: number;
}

export interface Puddle {
  x: number;
  y: number;
  ml: number;
}

export interface World {
  items: WorldItem[];
  puddles: Puddle[];
  heldId: string | null;
  /** 0..1, ramps while the pointer is held (Pour.stepTilt). */
  tilt: number;
  /** Set each tick: the item the stream is currently landing in, if any. */
  pourTargetId: string | null;
  /** Where the stream is landing right now, for the renderer. */
  impact: { x: number; y: number } | null;
  /** ml/sec leaving the held bottle this tick — drives audio and stream width. */
  flow: number;
  /** Where the pointer is, in logical pixels. The hand follows this. */
  cursor: { x: number; y: number };
  /** True while liquid is going somewhere it should not. */
  missing: boolean;
  overflowing: boolean;
}

const BOTTLE_SHELF_Y = 1010;
const GLASS_ROW_Y = 690;

/** Bottles left to right, in the order a bartender would reach for them. */
const SHELF: { id: string; label: string }[] = [
  { id: 'tequila_blanco', label: 'TEQUILA' },
  { id: 'gin', label: 'GIN' },
  { id: 'triple_sec', label: 'TRIPLE SEC' },
  { id: 'dry_vermouth', label: 'VERMOUTH' },
  { id: 'lime_juice', label: 'LIME' },
  { id: 'orange_juice', label: 'ORANGE' },
  { id: 'simple_syrup', label: 'SYRUP' },
  { id: 'grenadine', label: 'GRENADINE' },
  { id: 'soda', label: 'SODA' },
  { id: 'cola', label: 'COLA' },
];

const GLASSWARE: { key: string; label: string; width: number; height: number }[] = [
  { key: 'rocks', label: 'ROCKS', width: 104, height: 116 },
  { key: 'rocks', label: 'ROCKS', width: 104, height: 116 },
  { key: 'coupe', label: 'COUPE', width: 132, height: 112 },
  { key: 'highball', label: 'HIGHBALL', width: 86, height: 178 },
];

export function createWorld(): World {
  const items: WorldItem[] = [];

  const bottleWidth = 58;
  const bottleHeight = 168;
  // Leaves room on the right for the debug panel at smaller window sizes.
  const shelfSpan = LAYOUT.WIDTH - 520;
  const gap = shelfSpan / (SHELF.length - 1);

  SHELF.forEach((entry, i) => {
    const x = 130 + i * gap;
    items.push({
      id: `bottle_${entry.id}`,
      kind: 'bottle',
      vessel: createVessel(`bottle_${entry.id}`, 'bottle', { contents: { [entry.id]: 700 } }),
      x,
      y: BOTTLE_SHELF_Y,
      homeX: x,
      homeY: BOTTLE_SHELF_Y,
      width: bottleWidth,
      height: bottleHeight,
      label: entry.label,
      ingredientId: entry.id,
      drinkSpillMl: 0,
      buildTimeSec: 0,
    });
  });

  const glassSpan = 700;
  const glassGap = glassSpan / (GLASSWARE.length - 1);
  GLASSWARE.forEach((entry, i) => {
    const x = 610 + i * glassGap;
    items.push({
      id: `glass_${i}`,
      kind: 'glass',
      vessel: createVessel(`glass_${i}`, entry.key),
      x,
      y: GLASS_ROW_Y,
      homeX: x,
      homeY: GLASS_ROW_Y,
      width: entry.width,
      height: entry.height,
      label: entry.label,
      drinkSpillMl: 0,
      buildTimeSec: 0,
    });
  });

  return {
    items,
    puddles: [],
    heldId: null,
    tilt: 0,
    pourTargetId: null,
    impact: null,
    flow: 0,
    cursor: { x: LAYOUT.WIDTH / 2, y: LAYOUT.HEIGHT / 2 },
    missing: false,
    overflowing: false,
  };
}

export function itemById(world: World, id: string | null): WorldItem | null {
  if (!id) return null;
  return world.items.find((i) => i.id === id) ?? null;
}

export function heldItem(world: World): WorldItem | null {
  return itemById(world, world.heldId);
}

/** Bottles rotate about their base when tilted; this is where the mouth ends up. */
export function bottleMouth(item: WorldItem, tilt: number): { x: number; y: number } {
  const angle = tiltAngleRad(tilt);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  // The mouth sits at (0, -height) from the base before rotation.
  return {
    x: item.x + sin * item.height,
    y: item.y - cos * item.height,
  };
}

/** Radians the bottle leans at a given tilt. Positive leans right. */
export function tiltAngleRad(tilt: number): number {
  return (tilt * POUR.MAX_TILT_DEG * Math.PI) / 180;
}

/**
 * Where the item's base has to sit for its mouth to land on `target`.
 *
 * The player aims with the cursor, so the cursor *is* the mouth: the bottle
 * body swings around it as the tilt ramps, the way a wrist works. Pivoting the
 * other way round (mouth swinging away from a fixed base) puts the stream a
 * glass-width off target at full tilt and makes aiming guesswork.
 */
export function baseForMouthAt(
  target: { x: number; y: number },
  height: number,
  tilt: number,
): { x: number; y: number } {
  const angle = tiltAngleRad(tilt);
  return {
    x: target.x - Math.sin(angle) * height,
    y: target.y + Math.cos(angle) * height,
  };
}

/** Top of a glass — where liquid has to land to go in. */
export function rimY(item: WorldItem): number {
  return item.y - item.height;
}

/**
 * Where a stream leaving `from` lands, and in which glass (if any).
 * The stream arcs slightly in the direction the bottle is leaning, so aiming
 * a heavy pour is genuinely harder than aiming a dribble.
 */
export function resolveStream(
  world: World,
  from: { x: number; y: number },
  tilt: number,
  exclude: WorldItem | null,
): { target: WorldItem | null; impact: { x: number; y: number } } {
  const candidates = world.items.filter(
    (i) => i.kind === 'glass' && i !== exclude && rimY(i) > from.y,
  );

  let best: WorldItem | null = null;
  let bestRim = Infinity;

  for (const glass of candidates) {
    const rim = rimY(glass);
    const landing = streamXAt(from, tilt, rim);
    const halfMouth = glass.width / 2;
    if (Math.abs(landing - glass.x) <= halfMouth && rim < bestRim) {
      best = glass;
      bestRim = rim;
    }
  }

  if (best) {
    return { target: best, impact: { x: streamXAt(from, tilt, bestRim), y: bestRim } };
  }

  // Nothing caught it: it lands on the counter.
  const counterY = LAYOUT.HEIGHT * (LAYOUT.BAND_CUSTOMER + LAYOUT.BAND_COUNTER);
  const floorY = Math.max(counterY, from.y + 1);
  return { target: null, impact: { x: streamXAt(from, tilt, floorY), y: floorY } };
}

/** Horizontal position of the stream when it has fallen to `y`. */
export function streamXAt(from: { x: number; y: number }, tilt: number, y: number): number {
  const drop = Math.max(0, y - from.y);
  // Liquid leaves a tilted bottle with some sideways speed; it arcs as it falls.
  const lean = Math.sin(tiltAngleRad(tilt));
  return from.x + lean * Math.sqrt(drop) * 3.4;
}
