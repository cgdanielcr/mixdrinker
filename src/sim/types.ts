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

// ---------------------------------------------------------------- customers

export interface Personality {
  /** Multiplier on how long they will wait. */
  patience: number;
  /** 0..1 — how harshly they mark a drink. */
  demanding: number;
  /** 0..1 — reserved for Phase 4 dialogue. */
  talkative: number;
  /** Multiplier on how well they hold their drink. */
  tolerance: number;
}

export interface CustomerDef {
  id: string;
  name: string;
  archetype: boolean;
  personality: Personality;
}

export interface Order {
  recipeId: string;
  /** e.g. ["no_salt"] — Phase 3. */
  special?: string[];
}

export type CustomerPhase = 'arriving' | 'ordering' | 'waiting' | 'drinking' | 'leaving';

export interface Customer {
  id: string;
  defId: string;
  name: string;
  seat: number | null;
  personality: Personality;
  order: Order | null;
  /** 0..1, drains over time, refilled by good service. */
  patience: number;
  /** Rises with abv*ml, decays over time. */
  bac: number;
  /** -1..1 */
  mood: number;
  drinksHad: number;
  phase: CustomerPhase;
  /** Game minute they sat down, and when the current order was placed. */
  arrivedAtMinute: number;
  orderedAtMinute: number;
  storyState: Record<string, unknown>;
  flags: Set<string>;
}

export type Verdict = 'loved' | 'fine' | 'poor' | 'rejected';

export interface Reaction {
  verdict: Verdict;
  /** What the customer says, briefly. */
  line: string;
  tip: number;
  patienceDelta: number;
  moodDelta: number;
  flags: string[];
  /** The score after this customer's own adjustment, for the debug panel. */
  adjustedScore: number;
}

export interface Bar {
  id: string;
  name: string;
  menu: string[];
  shelf: string[];
  seats: number;
  clientele: { customerId: string; weight: number }[];
  pacing: { night: number; curve: [number, number][] }[];
  modifiers: Record<string, number>;
  unlockedBy?: string;
}

/** One planned arrival, decided up front by the seeded generator. */
export interface PlannedArrival {
  /** Game minute they walk in. */
  atMinute: number;
  defId: string;
  recipeId: string;
}

export interface NightPlan {
  seed: number;
  barId: string;
  night: number;
  arrivals: PlannedArrival[];
}

/** Anything worth reporting at the end of the night (§8). */
export interface NightEvent {
  minute: number;
  kind: string;
  text: string;
}
