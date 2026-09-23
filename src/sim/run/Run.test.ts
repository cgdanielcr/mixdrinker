import { describe, expect, it } from 'vitest';
import { REP, RUN, SPECIALS } from '../../tuning';
import { bar, recipe, validateData } from '../data';
import { withSpecials, applicableSpecials, describeSpecials } from '../drinks/Specials';
import { nightRecordFrom, summaryLines, tallyFrom } from '../night/Summary';
import type { NightTotals } from '../night/Summary';
import { bandFor, emptyTally, reputationDelta } from './Reputation';
import { buyableRecipes, completeNight, createRun, isOver, menuFor, pourFromCellar } from './Run';

const dive = bar('dive');

function totals(over: Partial<NightTotals> = {}): NightTotals {
  return {
    night: 1,
    served: 0,
    tips: 0,
    walkouts: 0,
    sentBack: 0,
    turnedAway: 0,
    neverServed: 0,
    cutOffs: 0,
    badCutOffs: 0,
    servedWhileCutOff: 0,
    loved: 0,
    lovedDemandingSum: 0,
    leftHappy: 0,
    ...over,
  };
}

describe('data', () => {
  it('still validates with the locked menu and five pacing curves', () => {
    expect(() => validateData()).not.toThrow();
    expect(dive.pacing).toHaveLength(RUN.NIGHTS);
    expect(dive.lockedMenu?.length).toBeGreaterThan(0);
  });

  it('has a distinct curve per night, each busier than the last at its peak', () => {
    const peaks = dive.pacing.map((p) => Math.max(...p.curve.map(([, rate]) => rate)));
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]!).toBeGreaterThan(peaks[i - 1]!);
    }
  });
});

describe('createRun', () => {
  it('opens the week at full reputation with a full cellar', () => {
    const run = createRun(7);
    expect(run.night).toBe(1);
    expect(run.reputation).toBe(RUN.START_REPUTATION);
    expect(run.tips).toBe(0);
    expect(run.outcome).toBe('running');
    for (const id of dive.shelf) expect(run.stock[id]).toBeGreaterThan(0);
  });

  it('starts with only the bar menu, not the locked list', () => {
    const run = createRun(7);
    expect(menuFor(run, dive)).toEqual(dive.menu);
    expect(buyableRecipes(run, dive)).toEqual(dive.lockedMenu);
  });

  it('adds a bought recipe to tonight menu', () => {
    const run = createRun(7);
    const bought = buyableRecipes(run, dive)[0]!;
    run.boughtRecipes.push(bought);
    expect(menuFor(run, dive)).toContain(bought);
    expect(buyableRecipes(run, dive)).not.toContain(bought);
  });
});

describe('stock', () => {
  it('fills a bottle from the cellar and draws the cellar down', () => {
    const run = createRun(1);
    const before = run.stock['gin']!;
    const filled = pourFromCellar(run, 'gin');
    expect(filled).toBe(RUN.BOTTLE_ML);
    expect(run.stock['gin']).toBe(before - RUN.BOTTLE_ML);
  });

  it('gives what is left when the cellar is nearly out, then nothing', () => {
    const run = createRun(1);
    run.stock['gin'] = 120;
    expect(pourFromCellar(run, 'gin')).toBe(120);
    expect(run.stock['gin']).toBe(0);
    expect(pourFromCellar(run, 'gin')).toBe(0);
  });

  it('runs dry across a week if never restocked', () => {
    const run = createRun(1);
    let last = 0;
    for (let night = 0; night < RUN.NIGHTS; night++) last = pourFromCellar(run, 'gin');
    expect(last).toBe(0);
  });
});

describe('reputation', () => {
  it('an empty night moves nothing', () => {
    expect(reputationDelta(emptyTally())).toBe(0);
  });

  it('walkouts, send-backs and over-serving all cost', () => {
    expect(reputationDelta({ ...emptyTally(), walkouts: 3 })).toBeLessThan(0);
    expect(reputationDelta({ ...emptyTally(), sentBack: 2 })).toBeLessThan(0);
    expect(reputationDelta({ ...emptyTally(), servedWhileCutOff: 1 })).toBeLessThan(0);
  });

  it('over-serving is the single worst thing you can do', () => {
    expect(Math.abs(REP.SERVED_WHILE_CUT_OFF)).toBeGreaterThan(Math.abs(REP.WALKOUT));
    expect(Math.abs(REP.SERVED_WHILE_CUT_OFF)).toBeGreaterThan(Math.abs(REP.SENT_BACK));
  });

  it('great drinks and timely cut-offs pay it back', () => {
    expect(reputationDelta({ ...emptyTally(), loved: 4 })).toBeGreaterThan(0);
    expect(reputationDelta({ ...emptyTally(), goodCutOffs: 2 })).toBeGreaterThan(0);
  });

  it('pleasing a demanding customer is worth more than pleasing an easy one (§12)', () => {
    const easy = reputationDelta({ ...emptyTally(), loved: 1, lovedDemandingSum: 0.15 });
    const snob = reputationDelta({ ...emptyTally(), loved: 1, lovedDemandingSum: 0.95 });
    expect(snob).toBeGreaterThan(easy);
  });

  it('refusing someone who was fine costs you', () => {
    expect(reputationDelta({ ...emptyTally(), badCutOffs: 2 })).toBeLessThan(0);
  });

  it('bands read from thriving down to failing', () => {
    expect(bandFor(100)).toBe('thriving');
    expect(bandFor(50)).toBe('steady');
    expect(bandFor(25)).toBe('shaky');
    expect(bandFor(5)).toBe('failing');
  });

  it('explains itself, worst news first, with nothing zero listed', () => {
    const lines = summaryLines(totals({ walkouts: 4, loved: 2, sentBack: 1 }));
    expect(lines.length).toBe(3);
    expect(lines[0]!.delta).toBeLessThan(0);
    expect(lines[lines.length - 1]!.delta).toBeGreaterThan(0);
    expect(lines.some((l) => l.delta === 0)).toBe(false);
  });

  it('carries every countable event into the tally', () => {
    const tally = tallyFrom(totals({ walkouts: 1, cutOffs: 2, turnedAway: 3 }));
    expect(tally.walkouts).toBe(1);
    expect(tally.goodCutOffs).toBe(2);
    expect(tally.turnedAway).toBe(3);
  });
});

describe('the run', () => {
  it('advances night by night while reputation holds', () => {
    const run = createRun(3);
    for (let night = 1; night < RUN.NIGHTS; night++) {
      completeNight(run, nightRecordFrom(totals({ night, loved: 3 }), run.reputation));
      expect(run.outcome).toBe('running');
      expect(run.night).toBe(night + 1);
    }
  });

  it('finishes the week after the last night', () => {
    const run = createRun(3);
    for (let night = 1; night <= RUN.NIGHTS; night++) {
      completeNight(run, nightRecordFrom(totals({ night, loved: 2 }), run.reputation));
    }
    expect(run.outcome).toBe('finished');
    expect(isOver(run)).toBe(true);
    expect(run.nights).toHaveLength(RUN.NIGHTS);
  });

  it('fires you the moment reputation hits zero (§12)', () => {
    const run = createRun(3);
    completeNight(run, nightRecordFrom(totals({ night: 1, walkouts: 400 }), run.reputation));
    expect(run.reputation).toBe(0);
    expect(run.outcome).toBe('fired');
    expect(isOver(run)).toBe(true);
  });

  it('never lets reputation exceed the maximum however good the night', () => {
    const run = createRun(3);
    completeNight(run, nightRecordFrom(totals({ night: 1, loved: 500 }), run.reputation));
    expect(run.reputation).toBeLessThanOrEqual(RUN.MAX_REPUTATION);
  });

  it('records each night for the run summary', () => {
    const run = createRun(3);
    completeNight(run, nightRecordFrom(totals({ night: 1, served: 12, tips: 40 }), run.reputation));
    expect(run.nights[0]).toMatchObject({ night: 1, served: 12, tips: 40 });
    expect(typeof run.nights[0]!.reputationDelta).toBe('number');
  });
});

describe('special requests', () => {
  const margarita = recipe('margarita');
  const ginTonic = recipe('gin_tonic');

  it('only offers specials that make sense for the drink', () => {
    expect(applicableSpecials(margarita)).toContain('no_salt');
    expect(applicableSpecials(ginTonic)).not.toContain('no_salt');
    expect(applicableSpecials(ginTonic)).toContain('double');
  });

  it('leaves the recipe alone when nothing was asked for', () => {
    expect(withSpecials(margarita, undefined)).toBe(margarita);
    expect(withSpecials(margarita, [])).toBe(margarita);
  });

  it('"no salt" removes the rim without touching anything else', () => {
    const modified = withSpecials(margarita, ['no_salt']);
    expect(modified.rim).toBeUndefined();
    expect(margarita.rim).toBe('salt');
    expect(modified.ingredients).toEqual(margarita.ingredients);
  });

  it('"double" doubles the booze and leaves the mixers alone', () => {
    const modified = withSpecials(ginTonic, ['double']);
    const gin = modified.ingredients.find((i) => i.id === 'gin')!;
    const soda = modified.ingredients.find((i) => i.id === 'soda')!;
    expect(gin.ml).toBe(50 * SPECIALS.DOUBLE_MULTIPLIER);
    expect(soda.ml).toBe(150);
  });

  it('widens the tolerance with the measure, so a double is not harder to hit', () => {
    const original = ginTonic.ingredients.find((i) => i.id === 'gin')!;
    const doubled = withSpecials(ginTonic, ['double']).ingredients.find((i) => i.id === 'gin')!;
    expect(doubled.toleranceMl / doubled.ml).toBeCloseTo(original.toleranceMl / original.ml, 6);
  });

  it('"no ice" changes what serving it right means', () => {
    const modified = withSpecials(margarita, ['no_ice']);
    expect(modified.serveWithIce).toBe(false);
    expect(margarita.serveWithIce).toBe(true);
  });

  it('never mutates the original recipe', () => {
    const before = JSON.stringify(margarita);
    withSpecials(margarita, ['no_salt', 'double', 'no_ice', 'extra_lime']);
    expect(JSON.stringify(margarita)).toBe(before);
  });

  it('reads back as something a person would say', () => {
    expect(describeSpecials(['no_salt'])).toBe('no salt');
    expect(describeSpecials(['double'])).toBe('make it a double');
    expect(describeSpecials([])).toBe('');
  });
});
