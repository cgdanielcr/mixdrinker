/**
 * Reactions (HANDOVER.md §5).
 *
 * §5 is explicit that this is *not* Evaluate's job: "a demanding sober customer
 * sends back a 72; a friendly drunk one thanks you for it." Evaluate judges the
 * liquid. This judges the person drinking it.
 */
import { PATIENCE, REACTION, TIPS } from '../../tuning';
import type { Customer, DrinkResult, Reaction, Verdict } from '../types';
import { waitedMinutes } from './Customer';
import { patienceDeltaFor } from './Patience';
import { drunkenness } from './Intoxication';
import { INTOX } from '../../tuning';

/**
 * How this particular customer scores this particular drink.
 * Demanding people mark down; drink makes people generous.
 */
export function adjustedScore(customer: Customer, result: DrinkResult): number {
  // Serving something that is not what they asked for is its own failure. No
  // amount of craft on the wrong drink makes it the right drink.
  const wrongDrink = customer.order !== null && result.recipeId !== customer.order.recipeId;
  const base = wrongDrink ? Math.min(result.score, REACTION.WRONG_DRINK_CEILING) : result.score;

  const strictness = customer.personality.demanding * REACTION.DEMANDING_PENALTY;
  const forgiveness = Math.min(1, customer.bac / INTOX.CUT_OFF) * REACTION.DRUNK_FORGIVENESS;

  return Math.max(0, Math.min(100, base - strictness + forgiveness));
}

export function verdictFor(score: number): Verdict {
  if (score >= REACTION.LOVED) return 'loved';
  if (score >= REACTION.FINE) return 'fine';
  if (score >= REACTION.POOR) return 'poor';
  return 'rejected';
}

/** What they leave on the bar. Quality, promptness and mood, times the bar. */
export function tipFor(
  customer: Customer,
  verdict: Verdict,
  score: number,
  minute: number,
  tipMultiplier = 1,
): number {
  if (verdict === 'rejected') return TIPS.REJECTED;

  const quality = score / 100;
  let tip = TIPS.BASE * (1 + (quality - 0.5) * TIPS.QUALITY_SWING);

  if (waitedMinutes(customer, minute) <= PATIENCE.PROMPT_MINUTES) tip += TIPS.PROMPT_BONUS;
  tip *= 1 + customer.mood * (TIPS.MOOD_SWING - 1);
  tip *= tipMultiplier;

  return Math.max(0, Math.round(tip));
}

const LINES: Record<Verdict, string[]> = {
  loved: ['Now that is a drink.', "That's the one.", 'Perfect. Thank you.'],
  fine: ['Thanks.', 'That works.', 'Good, cheers.'],
  poor: ['Hm. Alright.', "It's... fine.", "That's not quite it."],
  rejected: ['This is wrong.', 'I cannot drink this.', 'Send it back.'],
};

/** Deterministic line choice: same drink, same customer, same words. */
function lineFor(verdict: Verdict, customer: Customer): string {
  const options = LINES[verdict];
  // Index off stable customer state rather than randomness, so a replayed
  // night says exactly the same things.
  const index = (customer.drinksHad + customer.id.length) % options.length;
  return options[index]!;
}

/**
 * The whole reaction: verdict, what they say, what they tip, and what it does
 * to their patience and mood. Callers apply the deltas; this decides them.
 */
export function react(
  customer: Customer,
  result: DrinkResult,
  minute: number,
  tipMultiplier = 1,
): Reaction {
  const score = adjustedScore(customer, result);
  const verdict = verdictFor(score);
  const flags: string[] = [];

  if (customer.order && result.recipeId !== customer.order.recipeId) flags.push('wrong_drink');
  if (verdict === 'rejected') flags.push('sent_back');
  if (verdict === 'loved') flags.push('delighted');
  if (drunkenness(customer) === 'cut_off') flags.push('served_while_cut_off');

  const moodDelta =
    verdict === 'loved' ? 0.4 : verdict === 'fine' ? 0.15 : verdict === 'poor' ? -0.2 : -0.5;

  return {
    verdict,
    line: lineFor(verdict, customer),
    tip: tipFor(customer, verdict, score, minute, tipMultiplier),
    patienceDelta: patienceDeltaFor(verdict),
    moodDelta,
    flags,
    adjustedScore: Math.round(score),
  };
}
