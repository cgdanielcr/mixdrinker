/**
 * Typed access to data/. Loaders validate shape at import so a bad JSON edit
 * fails loudly at startup instead of producing a silently wrong drink.
 */
import ingredientsJson from '../../data/ingredients.json';
import vesselsJson from '../../data/vessels.json';
import margarita from '../../data/recipes/margarita.json';
import ginTonic from '../../data/recipes/gin_tonic.json';
import tequilaSunrise from '../../data/recipes/tequila_sunrise.json';
import martini from '../../data/recipes/martini.json';
import archetypesJson from '../../data/customers/archetypes.json';
import diveBar from '../../data/bars/dive.json';

import type { Bar, CustomerDef, Ingredient, Recipe, VesselDef } from './types';

export const INGREDIENTS: Readonly<Record<string, Ingredient>> = ingredientsJson as Record<
  string,
  Ingredient
>;

export const VESSEL_DEFS: Readonly<Record<string, VesselDef>> = vesselsJson as Record<
  string,
  VesselDef
>;

export const RECIPES: Readonly<Record<string, Recipe>> = Object.freeze(
  Object.fromEntries(
    ([margarita, ginTonic, tequilaSunrise, martini] as Recipe[]).map((r) => [r.id, r]),
  ),
);

export const RECIPE_LIST: readonly Recipe[] = Object.values(RECIPES);

export const CUSTOMER_DEFS: Readonly<Record<string, CustomerDef>> = archetypesJson as Record<
  string,
  CustomerDef
>;

export const BARS: Readonly<Record<string, Bar>> = Object.freeze(
  Object.fromEntries(([diveBar] as unknown as Bar[]).map((b) => [b.id, b])),
);

export function customerDef(id: string): CustomerDef {
  const found = CUSTOMER_DEFS[id];
  if (!found) throw new Error(`Unknown customer: ${id}`);
  return found;
}

export function bar(id: string): Bar {
  const found = BARS[id];
  if (!found) throw new Error(`Unknown bar: ${id}`);
  return found;
}

export function ingredient(id: string): Ingredient {
  const found = INGREDIENTS[id];
  if (!found) throw new Error(`Unknown ingredient: ${id}`);
  return found;
}

export function recipe(id: string): Recipe {
  const found = RECIPES[id];
  if (!found) throw new Error(`Unknown recipe: ${id}`);
  return found;
}

export function vesselDef(id: string): VesselDef {
  const found = VESSEL_DEFS[id];
  if (!found) throw new Error(`Unknown vessel: ${id}`);
  return found;
}

/** Every recipe must only reference ingredients that exist on the shelf. */
export function validateData(): void {
  for (const r of RECIPE_LIST) {
    for (const ri of r.ingredients) {
      if (!INGREDIENTS[ri.id]) {
        throw new Error(`Recipe "${r.id}" references unknown ingredient "${ri.id}"`);
      }
      if (ri.ml <= 0) throw new Error(`Recipe "${r.id}" ingredient "${ri.id}" has ml <= 0`);
      if (ri.toleranceMl <= 0) {
        throw new Error(`Recipe "${r.id}" ingredient "${ri.id}" has toleranceMl <= 0`);
      }
    }
  }
  for (const [id, def] of Object.entries(CUSTOMER_DEFS)) {
    if (id !== def.id) throw new Error(`Customer key "${id}" does not match its id "${def.id}"`);
  }
  for (const b of Object.values(BARS)) {
    for (const recipeId of b.menu) {
      if (!RECIPES[recipeId]) throw new Error(`Bar "${b.id}" menus unknown recipe "${recipeId}"`);
    }
    for (const ingredientId of b.shelf) {
      if (!INGREDIENTS[ingredientId]) {
        throw new Error(`Bar "${b.id}" shelves unknown ingredient "${ingredientId}"`);
      }
    }
    for (const entry of b.clientele) {
      if (!CUSTOMER_DEFS[entry.customerId]) {
        throw new Error(`Bar "${b.id}" lists unknown customer "${entry.customerId}"`);
      }
    }
    if (b.pacing.length === 0) throw new Error(`Bar "${b.id}" has no pacing curve`);
  }
  for (const [id, ing] of Object.entries(INGREDIENTS)) {
    if (id !== ing.id) throw new Error(`Ingredient key "${id}" does not match its id "${ing.id}"`);
    if (!/^#[0-9a-fA-F]{6}$/.test(ing.color)) {
      throw new Error(`Ingredient "${id}" has a malformed color: ${ing.color}`);
    }
  }
}
