/**
 * Vessel: volume + ingredient composition of any container (HANDOVER.md §5).
 * Pure. No rendering, no DOM, no randomness.
 */
import { COLOR, ICE, MIXING } from '../../tuning';
import { ingredient, vesselDef } from '../data';
import type { Vessel, VesselDef } from '../types';

export interface CreateVesselOptions {
  /** Pre-fill, e.g. a full bottle of tequila. */
  contents?: Record<string, number>;
  ice?: number;
  chilledC?: number;
}

export function createVessel(
  id: string,
  defOrKey: string | VesselDef,
  options: CreateVesselOptions = {},
): Vessel {
  const def = typeof defOrKey === 'string' ? vesselDef(defOrKey) : defOrKey;
  const v: Vessel = {
    id,
    kind: def.kind,
    capacityMl: def.capacityMl,
    contents: { ...(options.contents ?? {}) },
    ice: options.ice ?? 0,
    dilutionMl: 0,
    mixed: 0,
    shaken: false,
    stirred: false,
    chilledC: options.chilledC ?? MIXING.ROOM_TEMP_C,
    garnish: [],
    spilledMl: 0,
  };
  if (def.glassType) v.glassType = def.glassType;
  return v;
}

/** Liquid only — ingredients plus the water melted into them. */
export function liquidMl(v: Vessel): number {
  let total = v.dilutionMl;
  for (const ml of Object.values(v.contents)) total += ml;
  return total;
}

/** Liquid plus the volume the ice cubes displace. This is what fills the glass. */
export function occupiedMl(v: Vessel): number {
  return liquidMl(v) + v.ice * ICE.CUBE_ML;
}

export function capacityLeftMl(v: Vessel): number {
  return Math.max(0, v.capacityMl - occupiedMl(v));
}

export function fillFraction(v: Vessel): number {
  if (v.capacityMl <= 0) return 0;
  return Math.min(1, occupiedMl(v) / v.capacityMl);
}

export function isEmpty(v: Vessel): boolean {
  return liquidMl(v) <= 0 && v.ice <= 0;
}

/**
 * Add liquid, returning what actually went in and what overflowed.
 * Overflow is the caller's problem to render as a puddle; it is not added
 * to spilledMl here because a missed pour and an overflow are different events.
 */
export function addMl(
  v: Vessel,
  ingredientId: string,
  ml: number,
): { addedMl: number; overflowMl: number } {
  if (ml <= 0) return { addedMl: 0, overflowMl: 0 };
  const room = capacityLeftMl(v);
  const added = Math.min(ml, room);
  if (added > 0) {
    v.contents[ingredientId] = (v.contents[ingredientId] ?? 0) + added;
    // Anything poured in is un-mixing the drink a little.
    v.mixed = v.mixed * (1 - added / Math.max(liquidMl(v), 1));
  }
  return { addedMl: added, overflowMl: ml - added };
}

/**
 * Remove liquid proportionally across all contents (what actually leaves a
 * tilted vessel). Returns the composition that came out, so a pour can carry
 * the right mix into the destination.
 */
export function removeMl(
  v: Vessel,
  ml: number,
): { taken: Record<string, number>; totalMl: number } {
  const available = liquidMl(v);
  const take = Math.min(ml, available);
  const taken: Record<string, number> = {};
  if (take <= 0 || available <= 0) return { taken, totalMl: 0 };

  const share = take / available;
  for (const [id, amount] of Object.entries(v.contents)) {
    const portion = amount * share;
    if (portion > 0) {
      taken[id] = portion;
      v.contents[id] = amount - portion;
      if ((v.contents[id] ?? 0) <= 1e-9) delete v.contents[id];
    }
  }
  v.dilutionMl = Math.max(0, v.dilutionMl - v.dilutionMl * share);
  return { taken, totalMl: take };
}

/** Volume-weighted alcohol by volume of the current contents, 0..1. */
export function abvOf(v: Vessel): number {
  const total = liquidMl(v);
  if (total <= 0) return 0;
  let alcohol = 0;
  for (const [id, ml] of Object.entries(v.contents)) {
    alcohol += ml * ingredient(id).abv;
  }
  return alcohol / total;
}

export interface Layer {
  ingredientId: string;
  ml: number;
  color: string;
  opacity: number;
  density: number;
}

/**
 * Density-sorted layers, heaviest first (bottom of the glass).
 * The renderer draws at most three and blends the boundaries; as `mixed`
 * approaches 1 it collapses them into one band (HANDOVER.md §7).
 */
export function layers(v: Vessel): Layer[] {
  return Object.entries(v.contents)
    .filter(([, ml]) => ml > 0)
    .map(([id, ml]) => {
      const ing = ingredient(id);
      return {
        ingredientId: id,
        ml,
        color: ing.color,
        opacity: ing.opacity,
        density: ing.density,
      };
    })
    .sort((a, b) => b.density - a.density);
}

/**
 * Opacity-weighted blend of everything in the vessel, as #rrggbb.
 * A splash of cola dominates a glass of soda, which is what the eye expects.
 */
export function blendedColor(v: Vessel): string {
  const parts = layers(v);
  if (parts.length === 0) return '#000000';

  let r = 0;
  let g = 0;
  let b = 0;
  let weightSum = 0;
  for (const part of parts) {
    const weight = part.ml * Math.pow(part.opacity, COLOR.OPACITY_WEIGHT_EXP);
    const [pr, pg, pb] = hexToRgb(part.color);
    r += pr * weight;
    g += pg * weight;
    b += pb * weight;
    weightSum += weight;
  }
  if (weightSum <= 0) {
    // Everything present is effectively water-clear.
    return parts[0]?.color ?? '#ffffff';
  }
  return rgbToHex(r / weightSum, g / weightSum, b / weightSum);
}

/** Combined opacity of the mix, 0..1 — how much you can see through it. */
export function blendedOpacity(v: Vessel): number {
  const total = liquidMl(v);
  if (total <= 0) return 0;
  let sum = 0;
  for (const [id, ml] of Object.entries(v.contents)) {
    sum += ml * ingredient(id).opacity;
  }
  // Dilution water is clear.
  return Math.min(1, sum / total);
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Pixi wants 0xrrggbb. Kept here so render/ never parses colors itself. */
export function colorToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** Empty the vessel completely — the sink (HANDOVER.md §6). */
export function discard(v: Vessel): void {
  v.contents = {};
  v.ice = 0;
  v.dilutionMl = 0;
  v.mixed = 0;
  v.shaken = false;
  v.stirred = false;
  v.chilledC = MIXING.ROOM_TEMP_C;
  v.garnish = [];
  delete v.rim;
}
