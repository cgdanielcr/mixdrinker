/**
 * Reputation: the bar's HP (HANDOVER.md §12).
 *
 * It drains from walkouts, sent-back drinks and serving someone who should
 * have been cut off. It recovers from excellent drinks — more so from the
 * customers who are hardest to please — and from cutting someone off in time.
 *
 * Kept separate from the night runtime so the whole week can be balanced by
 * reading one table, and simulated without a browser.
 */
import { REP } from '../../tuning';

/** Everything in a night that moves the needle. */
export interface ReputationTally {
  walkouts: number;
  sentBack: number;
  neverServed: number;
  leftHappy: number;
  /** Drinks a customer loved, and the sum of their `demanding` values. */
  loved: number;
  lovedDemandingSum: number;
  goodCutOffs: number;
  badCutOffs: number;
  servedWhileCutOff: number;
  turnedAway: number;
}

export function emptyTally(): ReputationTally {
  return {
    walkouts: 0,
    sentBack: 0,
    neverServed: 0,
    leftHappy: 0,
    loved: 0,
    lovedDemandingSum: 0,
    goodCutOffs: 0,
    badCutOffs: 0,
    servedWhileCutOff: 0,
    turnedAway: 0,
  };
}

/** The night's reputation change. Negative is bad news. */
export function reputationDelta(tally: ReputationTally): number {
  return (
    tally.walkouts * REP.WALKOUT +
    tally.sentBack * REP.SENT_BACK +
    tally.neverServed * REP.NEVER_SERVED +
    tally.servedWhileCutOff * REP.SERVED_WHILE_CUT_OFF +
    tally.turnedAway * REP.TURNED_AWAY +
    tally.leftHappy * REP.LEFT_HAPPY +
    tally.loved * REP.LOVED +
    tally.lovedDemandingSum * REP.LOVED_DEMANDING_BONUS +
    tally.goodCutOffs * REP.GOOD_CUT_OFF +
    tally.badCutOffs * REP.BAD_CUT_OFF
  );
}

/** Broken down for the summary, so a bad night explains itself. */
export function reputationBreakdown(tally: ReputationTally): { label: string; delta: number }[] {
  const rows: { label: string; delta: number }[] = [
    { label: 'walked out', delta: tally.walkouts * REP.WALKOUT },
    { label: 'sent back', delta: tally.sentBack * REP.SENT_BACK },
    { label: 'never served', delta: tally.neverServed * REP.NEVER_SERVED },
    { label: 'served past the line', delta: tally.servedWhileCutOff * REP.SERVED_WHILE_CUT_OFF },
    { label: 'turned away', delta: tally.turnedAway * REP.TURNED_AWAY },
    { label: 'left happy', delta: tally.leftHappy * REP.LEFT_HAPPY },
    {
      label: 'drinks they loved',
      delta: tally.loved * REP.LOVED + tally.lovedDemandingSum * REP.LOVED_DEMANDING_BONUS,
    },
    { label: 'cut off in time', delta: tally.goodCutOffs * REP.GOOD_CUT_OFF },
    { label: 'refused unfairly', delta: tally.badCutOffs * REP.BAD_CUT_OFF },
  ];
  return rows.filter((row) => Math.abs(row.delta) > 0.001);
}

export type ReputationBand = 'thriving' | 'steady' | 'shaky' | 'failing';

export function bandFor(reputation: number): ReputationBand {
  if (reputation >= 75) return 'thriving';
  if (reputation >= 45) return 'steady';
  if (reputation >= 20) return 'shaky';
  return 'failing';
}
