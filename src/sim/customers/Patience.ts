/**
 * Patience (HANDOVER.md §5, §10).
 *
 * The risk this module manages: overload tipping from fun into frustration.
 * §10's rule is that patience drains slower than it feels, and that one good
 * drink can always pull someone back. Both live here, not in the renderer.
 */
import { PATIENCE } from '../../tuning';
import type { Customer, Verdict } from '../types';
import { clamp01 } from './Customer';

/**
 * Fraction of a full patience bar lost per game minute.
 * Waiting for a drink burns it; having one in hand barely does.
 */
export function drainPerMinute(customer: Customer): number {
  const base = 1 / (PATIENCE.WAIT_MINUTES * Math.max(0.2, customer.personality.patience));
  return customer.phase === 'drinking' ? base * PATIENCE.DRINKING_DRAIN_SCALE : base;
}

/** Advance one customer's patience by `minutes` of game time. */
export function drainPatience(customer: Customer, minutes: number): void {
  if (minutes <= 0) return;
  if (customer.phase === 'leaving') return;
  customer.patience = clamp01(customer.patience - drainPerMinute(customer) * minutes);
}

/**
 * What a served drink does to their patience.
 * A great drink resets most of the bar; a rejected one costs more.
 */
export function patienceDeltaFor(verdict: Verdict): number {
  switch (verdict) {
    case 'loved':
      return PATIENCE.RESTORE_ON_GREAT;
    case 'fine':
      return PATIENCE.RESTORE_ON_FINE;
    case 'poor':
      return 0;
    case 'rejected':
      return -PATIENCE.PENALTY_ON_REJECT;
  }
}

export function applyPatienceDelta(customer: Customer, delta: number): void {
  customer.patience = clamp01(customer.patience + delta);
}

/** True while the bar should be showing as urgent. */
export function isImpatient(customer: Customer): boolean {
  return customer.patience < 0.35;
}
