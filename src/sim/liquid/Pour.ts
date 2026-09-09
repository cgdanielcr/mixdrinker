/**
 * Pour: tilt → flow rate → transfer between vessels / spill (HANDOVER.md §5).
 *
 * This module is the feel of the game. The shape that matters:
 * tilt ramps *while held* rather than snapping, and flow is a power curve of
 * tilt, so the first part of the tilt is a controllable dribble and the top
 * end is a real gush. That gap is where the 45 ml free-pour skill lives.
 */
import { POUR } from '../../tuning';
import type { Vessel } from '../types';
import { addMl, capacityLeftMl, liquidMl, removeMl } from './Vessel';

/** 0..1. Rises toward 1 while the pointer is held, falls back on release. */
export function stepTilt(tilt: number, holding: boolean, dtMs: number): number {
  const rate = holding ? dtMs / POUR.TILT_RAMP_MS : -(dtMs / POUR.TILT_RELEASE_MS);
  return clamp01(tilt + rate);
}

/** ml per second at a given tilt. Below MIN_FLOW the bottle only beads. */
export function flowRate(tilt: number): number {
  const t = clamp01(tilt);
  if (t <= 0) return 0;
  const flow = POUR.MAX_FLOW_ML_PER_SEC * Math.pow(t, POUR.TILT_CURVE_EXP);
  return flow < POUR.MIN_FLOW_ML_PER_SEC ? 0 : flow;
}

export interface PourStepResult {
  /** ml that landed in the destination. */
  transferredMl: number;
  /** ml wasted — missed the vessel entirely, or overflowed it. */
  spilledMl: number;
  /** ml that actually left the source this step. */
  pouredMl: number;
}

/**
 * Advance one pour by `dtMs`.
 *
 * `dst === null` means the stream is not intersecting a vessel mouth: the whole
 * flow becomes spill and lands on the counter as a puddle (§6).
 *
 * Waste accrues on the *source* vessel's `spilledMl`. The caller keeps a
 * per-drink spill total for `DrinkResult` — a bottle's lifetime mess and one
 * drink's mess are different numbers.
 */
export function pourStep(
  src: Vessel,
  dst: Vessel | null,
  tilt: number,
  dtMs: number,
): PourStepResult {
  const empty: PourStepResult = { transferredMl: 0, spilledMl: 0, pouredMl: 0 };
  if (dtMs <= 0) return empty;

  const flow = flowRate(tilt);
  if (flow <= 0) return empty;
  if (liquidMl(src) <= 0) return empty;
  if (src === dst) return empty;

  const wanted = flow * (dtMs / 1000);
  const { taken, dilutionMl, totalMl: pouredMl } = removeMl(src, wanted);
  if (pouredMl <= 0) return empty;

  if (dst === null) {
    src.spilledMl += pouredMl;
    return { transferredMl: 0, spilledMl: pouredMl, pouredMl };
  }

  const beforeMl = liquidMl(dst);
  const dstMixedBefore = dst.mixed;

  let transferredMl = 0;
  let spilledMl = 0;
  // Pour the composition that came out, ingredient by ingredient, so a
  // half-mixed shaker carries its actual mix into the glass.
  for (const [id, ml] of Object.entries(taken)) {
    const { addedMl, overflowMl } = addMl(dst, id, ml);
    transferredMl += addedMl;
    spilledMl += overflowMl;
  }

  // Melt water travels with the drink. Without this, straining a badly
  // over-diluted shaker into a glass would quietly wash the fault away.
  if (dilutionMl > 0) {
    const room = capacityLeftMl(dst);
    const added = Math.min(dilutionMl, room);
    dst.dilutionMl += added;
    transferredMl += added;
    spilledMl += dilutionMl - added;
  }

  if (spilledMl > 0) src.spilledMl += spilledMl;

  if (transferredMl > 0) {
    /*
     * These belong to the *liquid*, not the vessel, so they cross with it.
     * A Margarita shaken in the tin and strained into a glass is a shaken
     * Margarita; the glass has no idea what happened to it otherwise.
     * (Glass type, rim, garnish and ice stay with the vessel.)
     */
    dst.shaken = dst.shaken || src.shaken;
    dst.stirred = dst.stirred || src.stirred;
    dst.mixed =
      beforeMl > 0
        ? (dstMixedBefore * beforeMl + src.mixed * transferredMl) / (beforeMl + transferredMl)
        : src.mixed;
    // Liquid arriving warm from a bottle pulls a chilled glass back up.
    dst.chilledC =
      beforeMl > 0
        ? (dst.chilledC * beforeMl + src.chilledC * transferredMl) / (beforeMl + transferredMl)
        : src.chilledC;
  }

  return { transferredMl, spilledMl, pouredMl };
}

/**
 * How long the pointer must be held to deliver `targetMl`, accounting for the
 * ramp up and the tail after release. Used by tests to keep the §6 calibration
 * honest ("a 45 ml pour is a ~0.6 s hold") and by the debug panel.
 */
export function holdMsForMl(targetMl: number, stepMs = 1): number {
  let poured = 0;
  let tilt = 0;
  let heldMs = 0;

  while (poured < targetMl && heldMs < 60_000) {
    tilt = stepTilt(tilt, true, stepMs);
    poured += flowRate(tilt) * (stepMs / 1000);
    heldMs += stepMs;
    if (poured + tailMl(tilt, stepMs) >= targetMl) break;
  }
  return heldMs;
}

/** ml that still comes out after release, while the tilt eases back to zero. */
export function tailMl(tilt: number, stepMs = 1): number {
  let t = tilt;
  let ml = 0;
  while (t > 0) {
    t = stepTilt(t, false, stepMs);
    ml += flowRate(t) * (stepMs / 1000);
  }
  return ml;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
