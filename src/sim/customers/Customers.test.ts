import { describe, expect, it } from 'vitest';
import { INTOX, PATIENCE, REACTION, TIPS } from '../../tuning';
import { validateData } from '../data';
import { addMl, createVessel } from '../liquid/Vessel';
import type { Customer, DrinkResult } from '../types';
import { createCustomer, hasGivenUp, waitedMinutes } from './Customer';
import { applyPatienceDelta, drainPatience, drainPerMinute, isImpatient } from './Patience';
import { alcoholMl, drink, drunkenness, metabolise, shouldBeCutOff } from './Intoxication';
import { adjustedScore, react, tipFor, verdictFor } from './Reactions';

function customer(defId = 'walkin_regular', recipeId = 'margarita'): Customer {
  return createCustomer({ id: 'c1', defId, seat: 0, minute: 0, order: { recipeId } });
}

function result(over: Partial<DrinkResult> = {}): DrinkResult {
  return { recipeId: 'margarita', score: 100, tags: [], timeSec: 0, spilledMl: 0, ...over };
}

describe('customer data', () => {
  it('is internally consistent, including bars and archetypes', () => {
    expect(() => validateData()).not.toThrow();
  });

  it('builds a customer from its archetype', () => {
    const c = customer('walkin_snob');
    expect(c.name).toBe('Knows their drinks');
    expect(c.personality.demanding).toBeGreaterThan(0.9);
    expect(c.patience).toBe(1);
    expect(c.bac).toBe(0);
    expect(c.order?.recipeId).toBe('margarita');
  });
});

describe('patience', () => {
  it('empties in about WAIT_MINUTES for an average customer', () => {
    const c = customer();
    drainPatience(c, PATIENCE.WAIT_MINUTES);
    expect(c.patience).toBeCloseTo(0, 5);
  });

  it('runs out faster for someone in a hurry and slower for easy company', () => {
    const hurried = customer('walkin_hurried');
    const easy = customer('walkin_easy');
    drainPatience(hurried, 6);
    drainPatience(easy, 6);
    expect(hurried.patience).toBeLessThan(easy.patience);
  });

  it('barely drains once they have a drink in hand', () => {
    const waiting = customer();
    const drinking = customer();
    drinking.phase = 'drinking';
    expect(drainPerMinute(drinking)).toBeLessThan(drainPerMinute(waiting) * 0.5);
  });

  it('never goes below zero or above one', () => {
    const c = customer();
    drainPatience(c, 10_000);
    expect(c.patience).toBe(0);
    applyPatienceDelta(c, 5);
    expect(c.patience).toBe(1);
  });

  it('stops draining once they are leaving', () => {
    const c = customer();
    c.phase = 'leaving';
    drainPatience(c, 50);
    expect(c.patience).toBe(1);
  });

  it('lets one good drink pull someone back from the brink (§10)', () => {
    const c = customer();
    drainPatience(c, PATIENCE.WAIT_MINUTES * 0.85);
    expect(isImpatient(c)).toBe(true);
    applyPatienceDelta(c, PATIENCE.RESTORE_ON_GREAT);
    expect(isImpatient(c)).toBe(false);
  });

  it('reports having given up only once the bar is empty', () => {
    const c = customer();
    expect(hasGivenUp(c)).toBe(false);
    drainPatience(c, 1000);
    expect(hasGivenUp(c)).toBe(true);
  });

  it('tracks how long they have waited on the current order', () => {
    const c = customer();
    c.orderedAtMinute = 10;
    expect(waitedMinutes(c, 17)).toBe(7);
    expect(waitedMinutes(c, 4)).toBe(0);
  });
});

describe('intoxication', () => {
  const margaritaGlass = () => {
    const glass = createVessel('g', 'rocks');
    addMl(glass, 'tequila_blanco', 50); // 40% abv
    addMl(glass, 'triple_sec', 25); // 30%
    addMl(glass, 'lime_juice', 25); // 0%
    return glass;
  };

  it('counts only the alcohol actually in the glass', () => {
    expect(alcoholMl(margaritaGlass())).toBeCloseTo(50 * 0.4 + 25 * 0.3, 5);
    expect(alcoholMl(createVessel('g', 'rocks'))).toBe(0);
  });

  it('raises blood alcohol and counts the drink', () => {
    const c = customer();
    drink(c, margaritaGlass());
    expect(c.bac).toBeGreaterThan(0);
    expect(c.drinksHad).toBe(1);
  });

  it('hits a lightweight harder than a hard case', () => {
    const light = customer('walkin_lightweight');
    const hard = customer('walkin_hardcase');
    drink(light, margaritaGlass());
    drink(hard, margaritaGlass());
    expect(light.bac).toBeGreaterThan(hard.bac * 2);
  });

  it('burns off over time and never goes negative', () => {
    const c = customer();
    drink(c, margaritaGlass());
    const peak = c.bac;
    metabolise(c, 30);
    expect(c.bac).toBeLessThan(peak);
    metabolise(c, 100_000);
    expect(c.bac).toBe(0);
  });

  it('walks up through the drunkenness bands as the drinks land', () => {
    const c = customer('walkin_lightweight');
    expect(drunkenness(c)).toBe('sober');
    const seen = new Set([drunkenness(c)]);
    for (let i = 0; i < 8; i++) {
      drink(c, margaritaGlass());
      seen.add(drunkenness(c));
    }
    expect(seen.has('tipsy')).toBe(true);
    expect(seen.has('drunk')).toBe(true);
    expect(drunkenness(c)).toBe('cut_off');
    expect(shouldBeCutOff(c)).toBe(true);
  });

  it('leaves a sober customer well clear of the cut-off line', () => {
    const c = customer();
    drink(c, margaritaGlass());
    expect(c.bac).toBeLessThan(INTOX.TIPSY);
    expect(shouldBeCutOff(c)).toBe(false);
  });
});

describe('reactions', () => {
  it('is the customer, not the drink, that decides (§5)', () => {
    // The same 72 lands differently depending on who is drinking it.
    const drinkResult = result({ score: 72 });
    const snob = customer('walkin_snob');
    const easy = customer('walkin_easy');

    expect(adjustedScore(snob, drinkResult)).toBeLessThan(adjustedScore(easy, drinkResult));
    expect(verdictFor(adjustedScore(snob, drinkResult))).toBe('poor');
    expect(verdictFor(adjustedScore(easy, drinkResult))).toBe('fine');
  });

  it('a friendly drunk thanks you for a drink a sober one would reject', () => {
    const sober = customer('walkin_regular');
    const drunk = customer('walkin_regular');
    drunk.bac = INTOX.CUT_OFF;

    const mediocre = result({ score: 55 });
    expect(adjustedScore(drunk, mediocre)).toBeGreaterThan(adjustedScore(sober, mediocre));
  });

  it('caps the wrong drink however well it was made', () => {
    const c = customer('walkin_regular', 'margarita');
    const perfectButWrong = result({ recipeId: 'martini', score: 100 });

    const reaction = react(c, perfectButWrong, 0);
    expect(reaction.adjustedScore).toBeLessThanOrEqual(REACTION.WRONG_DRINK_CEILING);
    expect(reaction.verdict).toBe('rejected');
    expect(reaction.flags).toContain('wrong_drink');
  });

  it('maps scores onto verdicts at the tuned thresholds', () => {
    expect(verdictFor(REACTION.LOVED)).toBe('loved');
    expect(verdictFor(REACTION.LOVED - 1)).toBe('fine');
    expect(verdictFor(REACTION.FINE)).toBe('fine');
    expect(verdictFor(REACTION.FINE - 1)).toBe('poor');
    expect(verdictFor(REACTION.POOR)).toBe('poor');
    expect(verdictFor(REACTION.POOR - 1)).toBe('rejected');
  });

  it('restores patience for a good drink and takes it for a bad one', () => {
    const c = customer('walkin_easy');
    expect(react(c, result({ score: 100 }), 0).patienceDelta).toBeGreaterThan(0);
    expect(react(c, result({ score: 5 }), 0).patienceDelta).toBeLessThan(0);
  });

  it('pays nothing for a drink that was sent back', () => {
    const c = customer('walkin_snob');
    const reaction = react(c, result({ score: 10 }), 0);
    expect(reaction.verdict).toBe('rejected');
    expect(reaction.tip).toBe(TIPS.REJECTED);
  });

  it('tips more for a better drink, and more again for a prompt one', () => {
    const c = customer('walkin_regular');
    const great = tipFor(c, 'loved', 100, 0);
    const okay = tipFor(c, 'fine', 65, 0);
    expect(great).toBeGreaterThan(okay);

    const prompt = tipFor(c, 'loved', 100, PATIENCE.PROMPT_MINUTES);
    const slow = tipFor(c, 'loved', 100, PATIENCE.PROMPT_MINUTES + 20);
    expect(prompt).toBeGreaterThan(slow);
  });

  it('applies the bar tip modifier', () => {
    const c = customer();
    expect(tipFor(c, 'loved', 100, 0, 2)).toBeGreaterThan(tipFor(c, 'loved', 100, 0, 1));
  });

  it('flags serving someone who should have been cut off', () => {
    const c = customer();
    c.bac = INTOX.CUT_OFF + 0.02;
    expect(react(c, result(), 0).flags).toContain('served_while_cut_off');
  });

  it('says the same thing for the same drink on a replayed night', () => {
    const a = react(customer(), result({ score: 95 }), 0);
    const b = react(customer(), result({ score: 95 }), 0);
    expect(a.line).toBe(b.line);
    expect(a.tip).toBe(b.tip);
  });

  it('never returns a negative tip, however sour the mood', () => {
    const c = customer();
    c.mood = -1;
    for (const score of [0, 30, 60, 90, 100]) {
      expect(tipFor(c, 'fine', score, 99)).toBeGreaterThanOrEqual(0);
    }
  });
});
