/**
 * Core data models (HANDOVER.md §5). Plain and serializable.
 * These schemas are locked: additive changes only, ask before breaking them.
 */

export type IngredientCategory =
  'spirit' | 'liqueur' | 'juice' | 'syrup' | 'mixer' | 'bitters' | 'other';

export interface Ingredient {
  id: string;
  name: string;
  /** Hex, used for liquid tinting. */
  color: string;
  /** 0..1, drives the layering look. */
  opacity: number;
  /** 0..1, drives intoxication. */
  abv: number;
  /** Drives layer order — grenadine sinks, spirits float. */
  density: number;
  category: IngredientCategory;
}

export type GlassType = 'rocks' | 'coupe' | 'highball' | 'shot' | 'martini';

export type VesselKind = 'bottle' | 'glass' | 'shaker' | 'mixing_glass' | 'jigger';

/** The one model everything mixes through. */
export interface Vessel {
  id: string;
  kind: VesselKind;
  glassType?: GlassType;
  capacityMl: number;
  /** ingredientId → ml */
  contents: Record<string, number>;
  /** cubes */
  ice: number;
  /** from shaking / stirring / ice melt */
  dilutionMl: number;
  /** 0..1 — how homogeneous */
  mixed: number;
  shaken: boolean;
  stirred: boolean;
  chilledC: number;
  rim?: 'salt' | 'sugar';
  garnish: string[];
  /** accumulated waste */
  spilledMl: number;
}

export type Method = 'shake' | 'stir' | 'build';

export type IceSpec = 'cubes' | 'none' | 'crushed';

export type WeightKey = 'ingredients' | 'method' | 'glass' | 'rim' | 'garnish' | 'ice';

export interface RecipeIngredient {
  id: string;
  ml: number;
  toleranceMl: number;
}

export interface Recipe {
  id: string;
  name: string;
  glass: GlassType;
  ingredients: RecipeIngredient[];
  method: Method;
  ice: IceSpec;
  rim?: 'salt' | 'sugar';
  garnish?: string[];
  serveWithIce: boolean;
  /**
   * Additive to §5: the drink is meant to stay layered (Tequila Sunrise).
   * High `mixed` costs marks even when the method was correct.
   */
  unmixed?: boolean;
  weights?: Partial<Record<WeightKey, number>>;
}

export interface DrinkResult {
  /** null = unidentifiable */
  recipeId: string | null;
  /** 0..100 */
  score: number;
  /** e.g. "too_strong", "no_salt", "wrong_glass", "warm", "over_diluted" */
  tags: string[];
  timeSec: number;
  spilledMl: number;
}

export interface VesselDef {
  name: string;
  kind: VesselKind;
  glassType?: GlassType;
  capacityMl: number;
}
