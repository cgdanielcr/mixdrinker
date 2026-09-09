import { describe, expect, it } from 'vitest';
import { EVAL } from '../../tuning';
import { recipe } from '../data';
import { addMl, createVessel } from '../liquid/Vessel';
import type { Vessel } from '../types';
import { evaluate, identify, presentIngredients } from './Evaluate';

/** A flawless Margarita: the baseline every fault test deviates from by one step. */
function perfectMargarita(): Vessel {
  const glass = createVessel('g', 'rocks');
  addMl(glass, 'tequila_blanco', 50);
  addMl(glass, 'triple_sec', 25);
  addMl(glass, 'lime_juice', 25);
  glass.ice = 3;
  glass.dilutionMl = 20;
  glass.mixed = 0.9;
  glass.shaken = true;
  glass.chilledC = 2;
  glass.rim = 'salt';
  glass.garnish = ['lime_wedge'];
  return glass;
}

function perfectSunrise(): Vessel {
  const glass = createVessel('g', 'highball');
  addMl(glass, 'tequila_blanco', 45);
  addMl(glass, 'orange_juice', 90);
  addMl(glass, 'grenadine', 15);
  glass.ice = 3;
  glass.mixed = 0.1;
  glass.chilledC = 4;
  return glass;
}

describe('perfect drink', () => {
  it('scores 100 with no fault tags', () => {
    const result = evaluate(perfectMargarita(), 'margarita');
    expect(result.recipeId).toBe('margarita');
    expect(result.score).toBe(100);
    expect(result.tags).toEqual([]);
  });

  it('scores 100 for a correctly layered Tequila Sunrise', () => {
    const result = evaluate(perfectSunrise(), 'tequila_sunrise');
    expect(result.score).toBe(100);
    expect(result.tags).toEqual([]);
  });

  it('reports time and spill without letting them touch the score (§5.5)', () => {
    const fast = evaluate(perfectMargarita(), 'margarita', { timeSec: 8, spilledMl: 0 });
    const slow = evaluate(perfectMargarita(), 'margarita', { timeSec: 90, spilledMl: 120 });

    expect(slow.score).toBe(fast.score);
    expect(slow.timeSec).toBe(90);
    expect(slow.spilledMl).toBe(120);
  });
});

describe('single faults', () => {
  const fault = (mutate: (v: Vessel) => void) => {
    const glass = perfectMargarita();
    mutate(glass);
    return evaluate(glass, 'margarita');
  };

  it('flags a missing ingredient', () => {
    const result = fault((v) => delete v.contents['triple_sec']);
    expect(result.tags).toContain('missing_triple_sec');
    expect(result.score).toBeLessThan(100);
  });

  it('flags an extra ingredient', () => {
    const result = fault((v) => addMl(v, 'cola', 30));
    expect(result.tags).toContain('extra_cola');
    expect(result.score).toBeLessThan(100);
  });

  it('flags a heavy pour as too much, and as too strong', () => {
    const result = fault((v) => addMl(v, 'tequila_blanco', 40));
    expect(result.tags).toContain('too_much_tequila_blanco');
    expect(result.tags).toContain('too_strong');
  });

  it('flags a short pour as too little, and as too weak', () => {
    const result = fault((v) => {
      v.contents['tequila_blanco'] = 15;
      v.contents['triple_sec'] = 8;
      v.contents['lime_juice'] = 8;
    });
    expect(result.tags).toContain('too_little_tequila_blanco');
    expect(result.tags).toContain('too_weak');
  });

  it('flags the wrong glass', () => {
    const result = fault((v) => {
      v.glassType = 'highball';
    });
    expect(result.tags).toContain('wrong_glass');
  });

  it('flags a missing salt rim', () => {
    const result = fault((v) => delete v.rim);
    expect(result.tags).toContain('no_salt');
  });

  it('flags a missing garnish', () => {
    const result = fault((v) => {
      v.garnish = [];
    });
    expect(result.tags).toContain('no_lime_wedge');
  });

  it('flags a drink that was never shaken', () => {
    const result = fault((v) => {
      v.shaken = false;
      v.mixed = 0;
    });
    expect(result.tags).toContain('not_shaken');
  });

  it('flags an under-shaken drink but scores it above an unshaken one', () => {
    const under = fault((v) => {
      v.mixed = 0.3;
    });
    const none = fault((v) => {
      v.shaken = false;
      v.mixed = 0;
    });
    expect(under.tags).toContain('under_shaken');
    expect(under.score).toBeGreaterThan(none.score);
  });

  it('flags a warm drink', () => {
    const result = fault((v) => {
      v.chilledC = 18;
    });
    expect(result.tags).toContain('warm');
  });

  it('flags a missing-ice drink', () => {
    const result = fault((v) => {
      v.ice = 0;
    });
    expect(result.tags).toContain('no_ice');
  });

  it('flags an over-diluted drink', () => {
    const result = fault((v) => {
      v.dilutionMl = 200;
    });
    expect(result.tags).toContain('over_diluted');
  });

  it('flags a shaken Tequila Sunrise as losing its layers', () => {
    const glass = perfectSunrise();
    glass.mixed = 1;
    const result = evaluate(glass, 'tequila_sunrise');
    expect(result.tags).toContain('layers_lost');
    expect(result.score).toBeLessThan(100);
  });

  it('flags a shaken Martini as shaken, not stirred', () => {
    const glass = createVessel('g', 'coupe');
    addMl(glass, 'gin', 60);
    addMl(glass, 'dry_vermouth', 10);
    glass.shaken = true;
    glass.mixed = 1;
    glass.chilledC = 0;

    const result = evaluate(glass, 'martini');
    expect(result.tags).toContain('shaken_not_stirred');
  });

  it('flags an unwanted rim on a drink that asks for none', () => {
    const glass = createVessel('g', 'highball');
    addMl(glass, 'gin', 50);
    addMl(glass, 'soda', 150);
    glass.ice = 3;
    glass.chilledC = 4;
    glass.garnish = ['lime_wedge'];
    glass.rim = 'salt';

    expect(evaluate(glass, 'gin_tonic').tags).toContain('unwanted_rim');
  });
});

describe('tolerances', () => {
  const withTequila = (ml: number) => {
    const glass = perfectMargarita();
    glass.contents['tequila_blanco'] = ml;
    return evaluate(glass, 'margarita');
  };

  it('gives full marks anywhere inside the tolerance band', () => {
    // Margarita tequila is 50 ml +/- 8 ml.
    expect(withTequila(50).score).toBe(100);
    expect(withTequila(58).score).toBe(100);
    expect(withTequila(42).score).toBe(100);
    expect(withTequila(58).tags).not.toContain('too_much_tequila_blanco');
  });

  it('starts penalising just outside it', () => {
    const justOut = withTequila(59);
    expect(justOut.score).toBeLessThan(100);
    expect(justOut.tags).toContain('too_much_tequila_blanco');
  });

  it('degrades gradually rather than falling off a cliff', () => {
    const scores = [59, 64, 70, 76].map((ml) => withTequila(ml).score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThan(scores[i - 1]!);
    }
  });

  it('bottoms out at TOLERANCE_ZERO_AT tolerances and stays there', () => {
    // 50 + 3 * 8 = 74 ml is the zero point for that ingredient.
    const atZero = withTequila(74).score;
    const wayPast = withTequila(140).score;
    expect(wayPast).toBeLessThanOrEqual(atZero);
    expect(wayPast).toBeGreaterThanOrEqual(0);
  });
});

describe('identify', () => {
  it('recognises a drink from its ingredients alone', () => {
    expect(identify(perfectMargarita())?.id).toBe('margarita');
    expect(identify(perfectSunrise())?.id).toBe('tequila_sunrise');
  });

  it('returns null for an empty vessel', () => {
    expect(identify(createVessel('g', 'rocks'))).toBeNull();
  });

  it('returns null for a combination that is nothing in particular', () => {
    const glass = createVessel('g', 'rocks');
    addMl(glass, 'cola', 60);
    addMl(glass, 'grenadine', 40);
    addMl(glass, 'simple_syrup', 40);
    expect(identify(glass)).toBeNull();
  });

  it('ignores residue below the trace threshold', () => {
    const glass = perfectMargarita();
    glass.contents['cola'] = EVAL.TRACE_ML / 2;
    expect(presentIngredients(glass)).not.toContain('cola');
    expect(identify(glass)?.id).toBe('margarita');
  });

  it('separates the two gin drinks by their mixers', () => {
    const gt = createVessel('g', 'highball');
    addMl(gt, 'gin', 50);
    addMl(gt, 'soda', 150);
    expect(identify(gt)?.id).toBe('gin_tonic');

    const martini = createVessel('g', 'coupe');
    addMl(martini, 'gin', 60);
    addMl(martini, 'dry_vermouth', 10);
    expect(identify(martini)?.id).toBe('martini');
  });
});

describe('unidentifiable drinks', () => {
  it('score zero and say so', () => {
    const glass = createVessel('g', 'rocks');
    addMl(glass, 'cola', 60);
    addMl(glass, 'grenadine', 40);
    addMl(glass, 'simple_syrup', 40);

    const result = evaluate(glass);
    expect(result.recipeId).toBeNull();
    expect(result.score).toBe(0);
    expect(result.tags).toEqual(['unidentifiable']);
  });

  it('are still judged harshly against a recipe the customer actually asked for', () => {
    const glass = createVessel('g', 'rocks');
    addMl(glass, 'cola', 200);

    const result = evaluate(glass, 'margarita');
    expect(result.recipeId).toBe('margarita');
    expect(result.score).toBeLessThan(30);
    expect(result.tags).toContain('extra_cola');
  });

  it('an empty glass is unidentifiable', () => {
    expect(evaluate(createVessel('g', 'rocks')).recipeId).toBeNull();
  });
});

describe('weighting', () => {
  it('respects a recipe that weights its ingredients above its trimmings', () => {
    const margarita = recipe('margarita');
    expect(margarita.weights?.ingredients).toBeGreaterThan(margarita.weights?.garnish ?? 0);

    const noGarnish = perfectMargarita();
    noGarnish.garnish = [];
    const badPours = perfectMargarita();
    badPours.contents['tequila_blanco'] = 100;
    badPours.contents['triple_sec'] = 5;

    expect(evaluate(badPours, 'margarita').score).toBeLessThan(
      evaluate(noGarnish, 'margarita').score,
    );
  });

  it('never returns a score outside 0..100', () => {
    const wrecked = createVessel('g', 'shot');
    addMl(wrecked, 'cola', 55);
    wrecked.shaken = true;
    wrecked.dilutionMl = 5;

    const result = evaluate(wrecked, 'margarita');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
