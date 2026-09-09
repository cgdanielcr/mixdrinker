/**
 * Every gameplay number lives here or in data/ (HANDOVER.md §4).
 * No magic numbers in systems. Change values here, log the change in DEVLOG.md.
 */

export const POUR = {
  /**
   * §6: a full tilt pours ~10 ml per 100 ms *after* the ramp, so a 45 ml pour
   * is a ~0.6 s hold and the player can learn it with their body.
   */
  MAX_FLOW_ML_PER_SEC: 100,
  /** Hold time to reach full tilt. The ramp is what stops this feeling like a slider. */
  TILT_RAMP_MS: 350,
  /** Release is faster than the ramp so stopping a pour feels crisp, not mushy. */
  TILT_RELEASE_MS: 160,
  /**
   * flow = MAX_FLOW * tilt^EXP. >1 means the first part of the tilt is a slow
   * dribble, which is where fine control (and the 45 ml skill) lives.
   */
  TILT_CURVE_EXP: 1.7,
  /** Below this the bottle only beads at the mouth; no measurable transfer. */
  MIN_FLOW_ML_PER_SEC: 2,
  /**
   * How far the bottle leans at full tilt. Past ~75 degrees it reads as
   * upending the bottle rather than pouring from it, and the body swings far
   * enough to cover the glass you are aiming at.
   */
  MAX_TILT_DEG: 72,
} as const;

export const JIGGER = {
  /** §6: the jigger is exact but slow. It stops hard at these marks. */
  STOPS_ML: [30, 45, 60],
} as const;

export const STATION = {
  /** How long a glass has to be pressed into the salt to take a rim. */
  RIM_MS: 550,
  /** Cubes added per tap on the ice bucket. */
  ICE_PER_TAP: 1,
  /** Cooldown so one press does not dump the whole bucket in. */
  ICE_COOLDOWN_MS: 130,
} as const;

export const SHAKE = {
  /**
   * Pointer speed (logical px/sec) where shaking starts to register, and where
   * it counts as full effort. The player's arm is the input (§6).
   */
  MIN_SPEED: 700,
  FULL_SPEED: 2600,
  /**
   * A shaker being worked hard is not also pouring. Above this intensity the
   * tilt stops producing flow, which is what lets one gesture do both jobs.
   */
  SUPPRESS_POUR_ABOVE: 0.12,
  /** Screen shake amplitude in logical px at full intensity. */
  SCREEN_SHAKE_PX: 7,
} as const;

export const ICE = {
  /** Volume one cube displaces in a vessel. */
  CUBE_ML: 20,
  /** Cubes melted per second while shaking. */
  MELT_PER_SEC_SHAKING: 0.18,
  /** Cubes melted per second while a drink just sits there. */
  MELT_PER_SEC_SETTLING: 0.012,
} as const;

export const MIXING = {
  /** How fast `mixed` climbs at full shake intensity. */
  SHAKE_MIX_PER_SEC: 0.9,
  /** Dilution added per second of full-intensity shaking (requires ice). */
  SHAKE_DILUTION_ML_PER_SEC: 4.5,
  /** Chill rate while shaking with ice, °C per second. */
  SHAKE_CHILL_C_PER_SEC: 9,
  /** Dilution per second for a drink sitting on ice. */
  SETTLE_DILUTION_ML_PER_SEC: 0.35,
  /** Chill rate for a drink sitting on ice, °C per second. */
  SETTLE_CHILL_C_PER_SEC: 0.8,
  /** Warming rate with no ice present, °C per second. */
  WARM_C_PER_SEC: 0.25,
  /** Room temperature, and the floor a chilled drink approaches. */
  ROOM_TEMP_C: 20,
  ICE_TEMP_C: -3,
} as const;

export const COLOR = {
  /**
   * Tint weight is ml * opacity^EXP. Absorption is not linear in concentration
   * (Beer-Lambert): a splash of cola has to dominate a glass of soda the way it
   * does in a real glass, so opaque ingredients pull superlinearly.
   */
  OPACITY_WEIGHT_EXP: 2,
} as const;

export const EVAL = {
  /** Contents below this are treated as residue, not an ingredient. */
  TRACE_ML: 1,
  /** Below this Jaccard similarity the drink is unidentifiable (recipeId = null). */
  IDENTIFY_MIN_JACCARD: 0.5,
  /**
   * An ingredient scores full marks within 1x tolerance and zero at this many
   * tolerances out. Between, it falls off linearly.
   */
  TOLERANCE_ZERO_AT: 3,
  /** A shaken drink must reach this `mixed` to count as properly shaken. */
  SHAKEN_MIXED_TARGET: 0.75,
  /** A recipe marked `unmixed` (layered) starts losing marks past this `mixed`. */
  LAYERED_MIXED_MAX: 0.35,
  /** dilutionMl / totalMl above this earns the `over_diluted` tag. */
  OVER_DILUTION_RATIO: 0.28,
  /** Score multiplier applied once when over-diluted. */
  OVER_DILUTION_PENALTY: 0.85,
  /** Served above this temperature earns the `warm` tag. */
  SERVE_CHILLED_MAX_C: 8,
  /** Component weights when a recipe does not override them. */
  DEFAULT_WEIGHTS: {
    ingredients: 5,
    method: 2,
    glass: 2,
    rim: 1,
    garnish: 1,
    ice: 1,
  },
  /** Temperature is scored but not overridable per recipe (see HANDOVER.md §5.3). */
  TEMPERATURE_WEIGHT: 1,
} as const;

export const LAYOUT = {
  /** Fixed 16:9 logical resolution, scaled to fit (HANDOVER.md §3). */
  WIDTH: 1920,
  HEIGHT: 1080,
  /** Three horizontal bands, as fractions of height. */
  BAND_CUSTOMER: 0.35,
  BAND_COUNTER: 0.2,
  BAND_WORK: 0.45,
} as const;

export const FEEL = {
  /** Held items lag the cursor by a frame or two (HANDOVER.md §9). */
  HAND_LAG: 0.35,
  /** Degrees of lean per pixel-per-frame of travel, clamped. */
  HAND_LEAN_PER_SPEED: 0.35,
  HAND_LEAN_MAX_DEG: 18,
  /** A press shorter than this is a tap (put down); longer starts a pour. */
  TAP_MS: 150,
  /** Visible fill level chases the true volume instead of teleporting (§9). */
  FILL_EASE: 0.22,
} as const;
