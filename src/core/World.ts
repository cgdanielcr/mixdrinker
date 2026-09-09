/**
 * The world: what is on the bar, and where. Plain state, no Pixi.
 * Geometry lives here because "did the stream hit the glass?" is a gameplay
 * question (HANDOVER.md §6), not a rendering one.
 */
import { LAYOUT, POUR } from '../tuning';
import { createVessel } from '../sim/liquid/Vessel';
import type { Vessel } from '../sim/types';

export type ItemKind = 'bottle' | 'glass' | 'shaker' | 'jigger' | 'station';

/**
 * Stations act on whatever you are carrying. §6 has you drag ice *to* the
 * glass but the glass *to* the salt plate; unifying on "bring the vessel to
 * the station" means one rule to learn instead of two, and it is what a
 * bartender's hands actually do. The walk is a real cost during a rush, which
 * is the point.
 */
export type StationKind = 'ice' | 'salt' | 'garnish' | 'sink' | 'book';

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
  station?: StationKind;
  /** Spill accumulated while making the drink currently in this vessel. */
  drinkSpillMl: number;
  /** Seconds since the first liquid went into this vessel. */
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
  /** ml/sec leaving the held vessel this tick — drives audio and stream width. */
  flow: number;
  /** Where the pointer is, in logical pixels. The hand follows this. */
  cursor: { x: number; y: number };
  /** True while liquid is going somewhere it should not. */
  missing: boolean;
  overflowing: boolean;
  /** The station under the cursor, when the held vessel could use it. */
  hoveredStationId: string | null;
  /** 0..1 while pressing a glass onto the salt plate. */
  rimProgress: number;
  /** 0..1 — how hard the shaker is being worked this tick. */
  shakeIntensity: number;
  /** The jigger just hit a measuring mark and stopped taking liquid. */
  jiggerStopped: boolean;
  bookOpen: boolean;
}

const BOTTLE_ROW_Y = 1035;
const TOOL_ROW_Y = 790;

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

const VESSELS: {
  key: string;
  kind: ItemKind;
  label: string;
  width: number;
  height: number;
  x: number;
}[] = [
  { key: 'rocks', kind: 'glass', label: 'ROCKS', width: 104, height: 116, x: 130 },
  { key: 'rocks', kind: 'glass', label: 'ROCKS', width: 104, height: 116, x: 268 },
  { key: 'coupe', kind: 'glass', label: 'COUPE', width: 132, height: 112, x: 424 },
  { key: 'highball', kind: 'glass', label: 'HIGHBALL', width: 86, height: 178, x: 572 },
  { key: 'shaker', kind: 'shaker', label: 'SHAKER', width: 96, height: 196, x: 710 },
  { key: 'jigger', kind: 'jigger', label: 'JIGGER', width: 84, height: 80, x: 846 },
];

const STATIONS: {
  station: StationKind;
  label: string;
  width: number;
  height: number;
  x: number;
  y?: number;
}[] = [
  { station: 'ice', label: 'ICE', width: 124, height: 96, x: 986 },
  { station: 'salt', label: 'SALT', width: 116, height: 34, x: 1130 },
  { station: 'garnish', label: 'LIME', width: 116, height: 44, x: 1268 },
  { station: 'sink', label: 'SINK', width: 152, height: 74, x: 1414 },
  // The book lives on the counter, not the work band: it is the one thing
  // you reach for mid-service, and the right of the work band is covered by
  // the debug panel at common window sizes.
  { station: 'book', label: 'RECIPES', width: 104, height: 130, x: 150, y: 588 },
];

export function createWorld(): World {
  const items: WorldItem[] = [];

  const shelfSpan = 1100;
  const gap = shelfSpan / (SHELF.length - 1);

  SHELF.forEach((entry, i) => {
    const x = 115 + i * gap;
    items.push({
      id: `bottle_${entry.id}`,
      kind: 'bottle',
      vessel: createVessel(`bottle_${entry.id}`, 'bottle', { contents: { [entry.id]: 700 } }),
      x,
      y: BOTTLE_ROW_Y,
      homeX: x,
      homeY: BOTTLE_ROW_Y,
      width: 58,
      height: 168,
      label: entry.label,
      ingredientId: entry.id,
      drinkSpillMl: 0,
      buildTimeSec: 0,
    });
  });

  VESSELS.forEach((spot, i) => {
    items.push({
      id: `vessel_${i}`,
      kind: spot.kind,
      vessel: createVessel(`vessel_${i}`, spot.key),
      x: spot.x,
      y: TOOL_ROW_Y,
      homeX: spot.x,
      homeY: TOOL_ROW_Y,
      width: spot.width,
      height: spot.height,
      label: spot.label,
      drinkSpillMl: 0,
      buildTimeSec: 0,
    });
  });

  for (const spot of STATIONS) {
    items.push({
      id: `station_${spot.station}`,
      kind: 'station',
      // Stations never hold liquid; the vessel keeps the item shape uniform.
      vessel: createVessel(`station_${spot.station}`, 'jigger'),
      x: spot.x,
      y: spot.y ?? TOOL_ROW_Y,
      homeX: spot.x,
      homeY: spot.y ?? TOOL_ROW_Y,
      width: spot.width,
      height: spot.height,
      label: spot.label,
      station: spot.station,
      drinkSpillMl: 0,
      buildTimeSec: 0,
    });
  }

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
    hoveredStationId: null,
    rimProgress: 0,
    shakeIntensity: 0,
    jiggerStopped: false,
    bookOpen: false,
  };
}

export function itemById(world: World, id: string | null): WorldItem | null {
  if (!id) return null;
  return world.items.find((i) => i.id === id) ?? null;
}

export function heldItem(world: World): WorldItem | null {
  return itemById(world, world.heldId);
}

/** Anything that can be picked up and poured from. */
export function isCarryable(item: WorldItem): boolean {
  return item.kind !== 'station';
}

/** Anything liquid can land in. Bottles have necks, so they are not targets. */
export function isPourTarget(item: WorldItem): boolean {
  return item.kind === 'glass' || item.kind === 'shaker' || item.kind === 'jigger';
}

/** Where liquid leaves the held vessel. */
export function bottleMouth(item: WorldItem, tilt: number): { x: number; y: number } {
  const angle = tiltAngleRad(tilt);
  return {
    x: item.x + Math.sin(angle) * item.height,
    y: item.y - Math.cos(angle) * item.height,
  };
}

/** Radians the vessel leans at a given tilt. Positive leans right. */
export function tiltAngleRad(tilt: number): number {
  return (tilt * POUR.MAX_TILT_DEG * Math.PI) / 180;
}

/**
 * Where the item's base has to sit for its mouth to land on `target`.
 *
 * The player aims with the cursor, so the cursor *is* the mouth: the body
 * swings around it as the tilt ramps, the way a wrist works. Pivoting the
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

/** Top of a vessel — where liquid has to land to go in. */
export function rimY(item: WorldItem): number {
  return item.y - item.height;
}

/**
 * Where a stream leaving `from` lands, and in which vessel (if any).
 * The stream arcs in the direction the bottle is leaning, so aiming a heavy
 * pour is genuinely harder than aiming a dribble.
 */
export function resolveStream(
  world: World,
  from: { x: number; y: number },
  tilt: number,
  exclude: WorldItem | null,
): { target: WorldItem | null; impact: { x: number; y: number } } {
  let best: WorldItem | null = null;
  let bestRim = Infinity;

  for (const vessel of world.items) {
    if (!isPourTarget(vessel) || vessel === exclude) continue;
    const rim = rimY(vessel);
    if (rim <= from.y) continue;
    const landing = streamXAt(from, tilt, rim);
    if (Math.abs(landing - vessel.x) <= vessel.width / 2 && rim < bestRim) {
      best = vessel;
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
  return from.x + Math.sin(tiltAngleRad(tilt)) * Math.sqrt(drop) * 3.4;
}
