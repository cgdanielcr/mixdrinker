/**
 * Evaluate: vessel vs recipe -> DrinkResult (HANDOVER.md §5).
 *
 * Deliberately NOT here: how a customer reacts. A demanding sober customer
 * sends back a 72; a friendly drunk one thanks you for it. That lives in
 * Reactions.ts (Phase 2). This module only judges the liquid.
 */
import { EVAL } from '../../tuning';
import { RECIPE_LIST, recipe as getRecipe } from '../data';
import { dilutionRatio } from '../liquid/Mixing';
import { liquidMl } from '../liquid/Vessel';
import type { DrinkResult, Recipe, Vessel } from '../types';

export interface EvaluateOptions {
  /** Seconds from first pour to serve. Reported as a tag, never scored (§5.5). */
  timeSec?: number;
  /** Spill accumulated while making *this* drink. */
  spilledMl?: number;
}

/** The ingredients actually present, ignoring residue. */
export function presentIngredients(v: Vessel): string[] {
  return Object.entries(v.contents)
    .filter(([, ml]) => ml > EVAL.TRACE_ML)
    .map(([id]) => id);
}

/**
 * Step 1 of §5: nearest recipe by ingredient set (Jaccard on ids), then by
 * proportions. Returns null when nothing is close enough.
 */
export function identify(v: Vessel, candidates: readonly Recipe[] = RECIPE_LIST): Recipe | null {
  const present = new Set(presentIngredients(v));
  if (present.size === 0) return null;

  let best: Recipe | null = null;
  let bestJaccard = 0;
  let bestProportionError = Infinity;

  for (const candidate of candidates) {
    const wanted = new Set(candidate.ingredients.map((i) => i.id));
    let intersection = 0;
    for (const id of present) if (wanted.has(id)) intersection++;
    const union = present.size + wanted.size - intersection;
    const jaccard = union === 0 ? 0 : intersection / union;
    const proportionError = proportionDistance(v, candidate);

    if (jaccard > bestJaccard || (jaccard === bestJaccard && proportionError < bestProportionError)) {
      best = candidate;
      bestJaccard = jaccard;
      bestProportionError = proportionError;
    }
  }

  return bestJaccard >= EVAL.IDENTIFY_MIN_JACCARD ? best : null;
}

/** Mean absolute difference between poured and intended ratios, 0..1. */
function proportionDistance(v: Vessel, r: Recipe): number {
  const total = liquidMl(v);
  const recipeTotal = r.ingredients.reduce((sum, i) => sum + i.ml, 0);
  if (total <= 0 || recipeTotal <= 0) return Infinity;

  const ids = new Set([...Object.keys(v.contents), ...r.ingredients.map((i) => i.id)]);
  let error = 0;
  for (const id of ids) {
    const actual = (v.contents[id] ?? 0) / total;
    const target = (r.ingredients.find((i) => i.id === id)?.ml ?? 0) / recipeTotal;
    error += Math.abs(actual - target);
  }
  return error / ids.size;
}

export function evaluate(
  v: Vessel,
  target?: Recipe | string,
  options: EvaluateOptions = {},
): DrinkResult {
  const timeSec = options.timeSec ?? 0;
  const spilledMl = options.spilledMl ?? v.spilledMl;

  const resolved =
    typeof target === 'string' ? getRecipe(target) : (target ?? identify(v) ?? undefined);

  if (!resolved) {
    return { recipeId: null, score: 0, tags: ['unidentifiable'], timeSec, spilledMl };
  }

  const tags: string[] = [];
  const weights = { ...EVAL.DEFAULT_WEIGHTS, ...(resolved.weights ?? {}) };

  const components: { score: number; weight: number }[] = [];
  const push = (score: number, weight: number) => {
    if (weight > 0) components.push({ score, weight });
  };

  push(scoreIngredients(v, resolved, tags), weights.ingredients);
  push(scoreMethod(v, resolved, tags), weights.method);
  push(scoreGlass(v, resolved, tags), weights.glass);
  push(scoreRim(v, resolved, tags), weights.rim);
  push(scoreGarnish(v, resolved, tags), weights.garnish);
  push(scoreIce(v, resolved, tags), weights.ice);
  push(scoreTemperature(v, tags), EVAL.TEMPERATURE_WEIGHT);

  const weightSum = components.reduce((sum, c) => sum + c.weight, 0);
  let score =
    weightSum === 0 ? 0 : components.reduce((sum, c) => sum + c.score * c.weight, 0) / weightSum;

  // §5.4: the dilution window. Over-diluted is a whole-drink fault, not a
  // component fault, so it multiplies rather than averaging away.
  if (dilutionRatio(v) > EVAL.OVER_DILUTION_RATIO) {
    tags.push('over_diluted');
    score *= EVAL.OVER_DILUTION_PENALTY;
  }

  return {
    recipeId: resolved.id,
    score: Math.round(clamp01(score) * 100),
    tags,
    timeSec,
    spilledMl,
  };
}

function scoreIngredients(v: Vessel, r: Recipe, tags: string[]): number {
  const scores: number[] = [];

  for (const wanted of r.ingredients) {
    const actual = v.contents[wanted.id] ?? 0;
    if (actual <= EVAL.TRACE_ML) {
      tags.push('missing_' + wanted.id);
      scores.push(0);
      continue;
    }
    const diff = actual - wanted.ml;
    const tolerances = Math.abs(diff) / wanted.toleranceMl;
    scores.push(toleranceScore(tolerances));

    if (tolerances > 1) {
      tags.push((diff > 0 ? 'too_much_' : 'too_little_') + wanted.id);
    }
  }

  // Extras count against the drink as if they were a missed ingredient.
  const wantedIds = new Set(r.ingredients.map((i) => i.id));
  for (const id of presentIngredients(v)) {
    if (!wantedIds.has(id)) {
      tags.push('extra_' + id);
      scores.push(0);
    }
  }

  // A drink noticeably stronger or weaker than intended reads as one fault
  // to the drinker, whatever the individual pours were.
  const strength = strengthRatio(v, r);
  if (strength > 1.2) tags.push('too_strong');
  else if (strength > 0 && strength < 0.8) tags.push('too_weak');

  return scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Full marks within one tolerance, zero at TOLERANCE_ZERO_AT, linear between. */
function toleranceScore(tolerances: number): number {
  if (tolerances <= 1) return 1;
  const span = EVAL.TOLERANCE_ZERO_AT - 1;
  return clamp01(1 - (tolerances - 1) / span);
}

/** Poured volume of the recipe's own ingredients vs what it asked for. */
function strengthRatio(v: Vessel, r: Recipe): number {
  let target = 0;
  let actual = 0;
  for (const wanted of r.ingredients) {
    target += wanted.ml;
    actual += v.contents[wanted.id] ?? 0;
  }
  return target <= 0 ? 0 : actual / target;
}

function scoreMethod(v: Vessel, r: Recipe, tags: string[]): number {
  switch (r.method) {
    case 'shake': {
      if (!v.shaken) {
        tags.push('not_shaken');
        return 0;
      }
      const ratio = v.mixed / EVAL.SHAKEN_MIXED_TARGET;
      if (ratio < 1) tags.push('under_shaken');
      return clamp01(ratio);
    }
    case 'stir': {
      if (v.shaken) {
        tags.push('shaken_not_stirred');
        return 0;
      }
      if (!v.stirred) {
        tags.push('not_stirred');
        return 0;
      }
      return 1;
    }
    case 'build': {
      if (v.shaken) {
        tags.push('should_not_be_shaken');
        return 0;
      }
      // A layered drink loses its point once it homogenises (Tequila Sunrise).
      if (r.unmixed && v.mixed > EVAL.LAYERED_MIXED_MAX) {
        tags.push('layers_lost');
        return clamp01(1 - (v.mixed - EVAL.LAYERED_MIXED_MAX) / (1 - EVAL.LAYERED_MIXED_MAX));
      }
      return 1;
    }
  }
}

function scoreGlass(v: Vessel, r: Recipe, tags: string[]): number {
  if (v.glassType === r.glass) return 1;
  tags.push('wrong_glass');
  return 0;
}

function scoreRim(v: Vessel, r: Recipe, tags: string[]): number {
  if (r.rim) {
    if (v.rim === r.rim) return 1;
    tags.push(v.rim ? 'wrong_rim' : 'no_' + r.rim);
    return 0;
  }
  if (v.rim) {
    tags.push('unwanted_rim');
    return 0;
  }
  return 1;
}

function scoreGarnish(v: Vessel, r: Recipe, tags: string[]): number {
  const wanted = new Set(r.garnish ?? []);
  const actual = new Set(v.garnish);
  const missing = [...wanted].filter((g) => !actual.has(g));
  const extra = [...actual].filter((g) => !wanted.has(g));

  for (const g of missing) tags.push('no_' + g);
  for (const g of extra) tags.push('unwanted_' + g);

  if (wanted.size === 0) return extra.length === 0 ? 1 : 0;
  return clamp01(1 - (missing.length + extra.length) / wanted.size);
}

function scoreIce(v: Vessel, r: Recipe, tags: string[]): number {
  const hasIce = v.ice > 0;
  if (r.serveWithIce === hasIce) return 1;
  tags.push(hasIce ? 'unwanted_ice' : 'no_ice');
  return 0;
}

function scoreTemperature(v: Vessel, tags: string[]): number {
  if (v.chilledC <= EVAL.SERVE_CHILLED_MAX_C) return 1;
  tags.push('warm');
  // A drink at room temperature scores zero; one just above the line is close.
  const over = v.chilledC - EVAL.SERVE_CHILLED_MAX_C;
  const span = Math.max(1, 20 - EVAL.SERVE_CHILLED_MAX_C);
  return clamp01(1 - over / span);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
