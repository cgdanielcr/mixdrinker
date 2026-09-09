/**
 * Mixing: shake state, dilution, temperature (HANDOVER.md §5).
 *
 * Under-shaken leaves a drink unmixed and warm; over-shaken leaves it
 * over-diluted. Both windows come from tuning.ts so they can be playtested.
 */
import { ICE, MIXING } from '../../tuning';
import type { Vessel } from '../types';
import { capacityLeftMl } from './Vessel';

/**
 * One tick of shaking. `intensity` is 0..1, driven by how fast the pointer is
 * actually moving — the player's arm is the input (§6).
 */
export function shakeStep(v: Vessel, intensity: number, dtMs: number): void {
  const i = clamp01(intensity);
  if (i <= 0 || dtMs <= 0) return;
  const dt = dtMs / 1000;

  v.shaken = true;
  v.mixed = clamp01(v.mixed + MIXING.SHAKE_MIX_PER_SEC * i * dt);

  if (v.ice > 0) {
    // Ice is what actually chills and dilutes. A dry shake does neither.
    addDilution(v, MIXING.SHAKE_DILUTION_ML_PER_SEC * i * dt);
    v.ice = Math.max(0, v.ice - ICE.MELT_PER_SEC_SHAKING * i * dt);
    v.chilledC = approach(v.chilledC, MIXING.ICE_TEMP_C, MIXING.SHAKE_CHILL_C_PER_SEC * i * dt);
  }
}

/** One tick of a drink just sitting there — on ice it keeps diluting (§5.4). */
export function settleStep(v: Vessel, dtMs: number): void {
  if (dtMs <= 0) return;
  const dt = dtMs / 1000;

  if (v.ice > 0) {
    addDilution(v, MIXING.SETTLE_DILUTION_ML_PER_SEC * dt);
    v.ice = Math.max(0, v.ice - ICE.MELT_PER_SEC_SETTLING * dt);
    v.chilledC = approach(v.chilledC, MIXING.ICE_TEMP_C, MIXING.SETTLE_CHILL_C_PER_SEC * dt);
  } else {
    v.chilledC = approach(v.chilledC, MIXING.ROOM_TEMP_C, MIXING.WARM_C_PER_SEC * dt);
  }
}

/** Drop a cube in. Returns false if there is no room for it. */
export function addIce(v: Vessel, cubes = 1): boolean {
  if (capacityLeftMl(v) < ICE.CUBE_ML * cubes) return false;
  v.ice += cubes;
  return true;
}

/** dilutionMl / total liquid, 0..1. Drives the `over_diluted` tag. */
export function dilutionRatio(v: Vessel): number {
  let total = v.dilutionMl;
  for (const ml of Object.values(v.contents)) total += ml;
  return total <= 0 ? 0 : v.dilutionMl / total;
}

/** Melt water needs somewhere to go; a full glass overflows as it dilutes. */
function addDilution(v: Vessel, ml: number): void {
  const room = capacityLeftMl(v);
  const added = Math.min(ml, room);
  if (added > 0) v.dilutionMl += added;
  if (ml > added) v.spilledMl += ml - added;
}

function approach(current: number, target: number, maxStep: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
