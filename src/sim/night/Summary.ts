/**
 * End-of-night summary (HANDOVER.md §4, §8).
 *
 * Turns the night's event flags into the numbers the run needs and the lines
 * the player reads. Phase 5 replaces the lines with "what happened because of
 * what you did and didn't notice"; the shape is already here.
 */
import type { ReputationTally } from '../run/Reputation';
import { reputationBreakdown, reputationDelta } from '../run/Reputation';
import type { NightRecord } from '../run/Run';

export interface NightTotals {
  night: number;
  served: number;
  tips: number;
  walkouts: number;
  sentBack: number;
  turnedAway: number;
  neverServed: number;
  cutOffs: number;
  badCutOffs: number;
  servedWhileCutOff: number;
  loved: number;
  lovedDemandingSum: number;
  leftHappy: number;
}

export function tallyFrom(totals: NightTotals): ReputationTally {
  return {
    walkouts: totals.walkouts,
    sentBack: totals.sentBack,
    neverServed: totals.neverServed,
    leftHappy: totals.leftHappy,
    loved: totals.loved,
    lovedDemandingSum: totals.lovedDemandingSum,
    goodCutOffs: totals.cutOffs,
    badCutOffs: totals.badCutOffs,
    servedWhileCutOff: totals.servedWhileCutOff,
    turnedAway: totals.turnedAway,
  };
}

export function nightRecordFrom(totals: NightTotals, reputationBefore: number): NightRecord {
  const delta = reputationDelta(tallyFrom(totals));
  return {
    night: totals.night,
    served: totals.served,
    tips: totals.tips,
    walkouts: totals.walkouts,
    sentBack: totals.sentBack,
    turnedAway: totals.turnedAway,
    cutOffs: totals.cutOffs,
    servedWhileCutOff: totals.servedWhileCutOff,
    reputationDelta: Math.round(delta * 10) / 10,
    reputationAfter: Math.max(0, Math.min(100, reputationBefore + delta)),
  };
}

/** Lines for the summary screen, worst news first. */
export function summaryLines(totals: NightTotals): { label: string; delta: number }[] {
  return reputationBreakdown(tallyFrom(totals)).sort((a, b) => a.delta - b.delta);
}
