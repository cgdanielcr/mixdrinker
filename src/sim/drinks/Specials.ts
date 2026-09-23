/**
 * Special requests (HANDOVER.md §8, Phase 3): "no salt", "make it a double".
 *
 * A special does not change the drink they ordered — it changes what counts as
 * that drink for this one person. So it produces a modified Recipe and hands it
 * to the ordinary Evaluate, rather than adding cases to the scoring.
 */
import { SPECIALS } from '../../tuning';
import { ingredient } from '../data';
import type { Recipe } from '../types';

export type SpecialId = 'no_salt' | 'double' | 'no_ice' | 'extra_lime';

export const SPECIAL_LABELS: Record<SpecialId, string> = {
  no_salt: 'no salt',
  double: 'make it a double',
  no_ice: 'no ice',
  extra_lime: 'extra lime',
};

/** Which specials make sense for a given drink. Asking for no salt on a G&T is noise. */
export function applicableSpecials(recipe: Recipe): SpecialId[] {
  const out: SpecialId[] = [];
  if (recipe.rim) out.push('no_salt');
  if (recipe.ingredients.some((i) => ingredient(i.id).abv > 0)) out.push('double');
  if (recipe.serveWithIce) out.push('no_ice');
  if (recipe.ingredients.some((i) => i.id === 'lime_juice')) out.push('extra_lime');
  return out;
}

/**
 * The recipe as this customer wants it. Returns the original object untouched
 * when there is nothing to change, so the common path allocates nothing.
 */
export function withSpecials(recipe: Recipe, specials: readonly string[] | undefined): Recipe {
  if (!specials || specials.length === 0) return recipe;

  let modified: Recipe = { ...recipe, ingredients: recipe.ingredients.map((i) => ({ ...i })) };

  for (const special of specials) {
    switch (special as SpecialId) {
      case 'no_salt':
        delete modified.rim;
        break;

      case 'double':
        // Doubles double the booze, not the mixers — a double G&T is more gin,
        // not more tonic.
        modified.ingredients = modified.ingredients.map((i) =>
          ingredient(i.id).abv > 0
            ? {
                ...i,
                ml: i.ml * SPECIALS.DOUBLE_MULTIPLIER,
                toleranceMl: i.toleranceMl * SPECIALS.DOUBLE_MULTIPLIER,
              }
            : i,
        );
        break;

      case 'no_ice':
        modified = { ...modified, serveWithIce: false, ice: 'none' };
        break;

      case 'extra_lime':
        modified.ingredients = modified.ingredients.map((i) =>
          i.id === 'lime_juice' ? { ...i, ml: i.ml * 1.6, toleranceMl: i.toleranceMl * 1.4 } : i,
        );
        break;
    }
  }

  return modified;
}

/** How the order reads in the bubble. */
export function describeSpecials(specials: readonly string[] | undefined): string {
  if (!specials || specials.length === 0) return '';
  return specials.map((s) => SPECIAL_LABELS[s as SpecialId] ?? s).join(', ');
}
