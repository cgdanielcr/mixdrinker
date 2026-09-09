/**
 * Intoxication (HANDOVER.md §5, §8).
 *
 * Blood alcohol rises with the alcohol actually drunk and falls with time.
 * It matters in three places: drunk customers forgive worse drinks, serving
 * someone past CUT_OFF is a mistake the game will punish (Phase 3, §12), and
 * Phase 5's incidents key off it.
 */
import { INTOX } from '../../tuning';
import type { Customer, Vessel } from '../types';
import { abvOf, liquidMl } from '../liquid/Vessel';

/** ml of pure alcohol in a vessel. */
export function alcoholMl(vessel: Vessel): number {
  return liquidMl(vessel) * abvOf(vessel);
}

/**
 * Drink it. Tolerance divides the effect, so the hard case can take three
 * doubles and the lightweight cannot.
 */
export function drink(customer: Customer, vessel: Vessel): number {
  const tolerance = Math.max(0.2, customer.personality.tolerance);
  const delta = (alcoholMl(vessel) * INTOX.BAC_PER_ML_ALCOHOL) / tolerance;
  customer.bac = Math.max(0, customer.bac + delta);
  customer.drinksHad += 1;
  return delta;
}

/** Burn off alcohol over `minutes` of game time. */
export function metabolise(customer: Customer, minutes: number): void {
  if (minutes <= 0) return;
  customer.bac = Math.max(0, customer.bac - INTOX.DECAY_PER_MINUTE * minutes);
}

export type Drunkenness = 'sober' | 'tipsy' | 'drunk' | 'cut_off';

export function drunkenness(customer: Customer): Drunkenness {
  if (customer.bac >= INTOX.CUT_OFF) return 'cut_off';
  if (customer.bac >= INTOX.DRUNK) return 'drunk';
  if (customer.bac >= INTOX.TIPSY) return 'tipsy';
  return 'sober';
}

/** They should not be served again. Phase 3 turns this into a real decision. */
export function shouldBeCutOff(customer: Customer): boolean {
  return customer.bac >= INTOX.CUT_OFF;
}

/** 0..1 for the renderer: how much they wobble. */
export function visibleDrunkenness(customer: Customer): number {
  return Math.min(1, customer.bac / INTOX.CUT_OFF);
}
