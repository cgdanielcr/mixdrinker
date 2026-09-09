# LAST CALL — Browser Bartender Game

## Technical & Design Handover for Claude Code

Working title: **Last Call** (rename freely). Read this whole document before writing any code.

---

## 0. One paragraph

A 2D browser **roguelite**. You pick a bar and work a week of nights there. Each night is randomly generated (who shows up, when, what mood they're in), but the people are authored. You mix drinks with your hands (tactile pouring, shaking, garnishing), keep a growing number of customers served and calm, and listen to what they tell you, because the story only rewards people who were paying attention. Each night starts calm and becomes deliberately overwhelming. When a night ends you get a summary of what happened because of what you did and didn't notice. The bar's reputation is your health; lose it and the run ends. Between runs you unlock bars, recipes, and regulars.

**Budget: €0.** Every tool, library, asset, and hosting choice in this document is free. See §13.

The player is always doing three things at once:

- **Hands** — make the drink.
- **Brain** — remember who wanted what.
- **Attention** — listen to what people are saying.

Every design or technical question is answered by: _does this make those three compete harder while staying fun?_

Reference games to study before starting: **VA-11 Hall-A** (bartending + narrative, but no physicality — we add that), **Cook, Serve, Delicious!** (attention overload done right), **Papers, Please** (desk-as-game, ephemeral information, night-end consequences).

---

## 1. Locked decisions

These are decided. Do not relitigate them without a demonstrated reason.

| Question         | Decision                                                                                           | Why                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2D or 3D         | **2D**                                                                                             | Liquid is cheap and controllable in 2D; art production survivable; physicality is proven in 2D. |
| Camera           | **Fixed, straight-on, three bands** (see §3)                                                       | No camera logic; all attention is on the same screen.                                           |
| Liquid           | **Faked**: visual stream + volume/color model in glass + slosh shader                              | 90% of feel for 5% of cost.                                                                     |
| Physics engine   | **None in Phase 1**                                                                                | Ice/garnish are tweened. Reconsider only in Phase 3 if needed.                                  |
| Pour control     | Drag bottle over glass, **hold to tilt**, tilt ramps while held, flow follows tilt                 | Free-pour vs jigger creates the hands-skill tension.                                            |
| Recipe knowledge | **Physical recipe book on the bar** that costs time/attention to open                              | Onboarding without a tutorial wall; memorization becomes earned.                                |
| Dialogue         | **Ephemeral speech bubbles**, timed choices, **no conversation log**                               | Missing things is the point.                                                                    |
| Narrative format | **Ink** via `inkjs`                                                                                | Variables, callbacks, tags, hot-reloadable text, separate from code.                            |
| Score            | **Tips**                                                                                           | Simple, thematic, composes drink quality + speed + rapport.                                     |
| Session          | **Night ≈ 8–10 min**, ends with summary                                                            | Papers-Please-shaped loop.                                                                      |
| Run              | **One week (5 nights) at one bar**; bar **reputation is HP**; tips are in-run currency             | Standard roguelite grammar (run / HP / currency / meta). See §12.                               |
| Randomness       | **Random cast and schedule, authored people, systemic incidents**; seeded RNG per night            | Random who/when; authored what they say; systems decide what happens.                           |
| Bars             | **Data files** (menu, shelf, clientele pool, pacing, modifiers), unlocked via meta                 | Bars are the "character select."                                                                |
| Persistence      | `localStorage` only: run state + meta-unlocks. **No backend, ever.**                               | Free, and enough.                                                                               |
| Budget           | **€0** beyond the author's existing Claude plan                                                    | See §13 for the rules that follow.                                                              |
| Renderer         | **PixiJS v8**                                                                                      | WebGL 2D with easy custom shaders (for liquid slosh).                                           |
| UI               | **DOM overlay** for text-heavy UI (dialogue choices, recipe book, night summary); Pixi for the bar | Text in canvas is a pain.                                                                       |
| Language/tooling | **TypeScript strict, Vite, Vitest, ESLint, Prettier**                                              | Standard.                                                                                       |
| Audio            | **Howler.js**                                                                                      | Pouring _sounds_ are half the feel.                                                             |

Explicitly rejected: Three.js, any 3D physics library, any real fluid simulation, ECS frameworks, React for the game layer.

---

## 2. Tech stack

```
vite + typescript (strict)
pixi.js ^8
inkjs
howler
vitest (unit), playwright (smoke later)
eslint + prettier
```

No state-management library. Game state is a plain object tree owned by a `Game` class, mutated only by systems in a fixed-timestep loop. Rendering reads state; it never writes it.

Target: desktop browser, mouse. Design input so touch is possible later (single pointer, no hover-dependence), but do not build for it in Phase 1.

---

## 3. Screen layout

Fixed 16:9 logical resolution (1920×1080 logical, scaled to fit). Three horizontal bands:

```
┌─────────────────────────────────────────────────────┐
│  CUSTOMER BAND  — faces, speech bubbles, patience    │  ~35%
├─────────────────────────────────────────────────────┤
│  COUNTER BAND   — serving spots (one per seat),      │  ~20%
│                   drinks in progress, spills          │
├─────────────────────────────────────────────────────┤
│  WORK BAND      — bottles, glasses, shaker, jigger,  │  ~45%
│                   ice, garnish, salt, recipe book     │
└─────────────────────────────────────────────────────┘
```

Seats: 3 in Phase 2, up to 5 later. Each seat has a serving spot on the counter. Serving = drag a glass onto a seat's spot.

The cursor is the bartender's hand. Whatever you're holding follows the cursor.

---

## 4. Architecture

```
src/
  main.ts                 — bootstrap, resize, loop
  core/
    Game.ts               — owns state, runs systems at fixed 60Hz tick, renders at rAF
    Clock.ts              — night clock (game minutes), pause
    Input.ts              — pointer abstraction (down/move/up, held item)
    Events.ts             — typed event bus (drinkServed, customerLeft, dialogueLine…)
    Save.ts               — localStorage persistence
  sim/                    — pure logic, no Pixi imports, fully unit-tested
    liquid/
      Vessel.ts           — volume + ingredient composition of any container
      Pour.ts             — tilt → flow rate → transfer between vessels / spill
      Mixing.ts           — stir/shake state, dilution, temperature
    drinks/
      Recipe.ts           — recipe schema + loader
      Evaluate.ts         — vessel vs recipe → DrinkResult (score, tags)
    customers/
      Customer.ts         — state model
      Patience.ts, Intoxication.ts, Reactions.ts
      Spawner.ts          — night script → arrivals
    dialogue/
      InkRunner.ts        — wraps inkjs, exposes lines/choices/variables to sim
    night/
      NightGenerator.ts   — seed + bar + run state → cast, arrival schedule, beats
      Incidents.ts        — incident templates: trigger conditions over customer state
      Summary.ts          — end-of-night event flags → summary text
    run/
      Run.ts              — week state: night index, reputation, tips, stock, seed
      Meta.ts             — cross-run unlocks (bars, recipes, regulars, perks)
      Rng.ts              — seeded PRNG (mulberry32 or similar); never use Math.random in sim
  render/                 — Pixi. Reads state. Never mutates it.
    BarScene.ts
    LiquidRenderer.ts     — glass fill, layers, slosh shader, stream, splash
    ItemSprites.ts
    CustomerSprites.ts
    Juice.ts              — tweens, screen effects, particle helpers
  ui/                     — DOM overlay
    Bubbles.ts, Choices.ts, RecipeBook.ts, NightSummary.ts, Hud.ts
  audio/
    Sfx.ts                — pour loop with pitch by flow rate, glug, ice clink, shaker
data/
  recipes/*.json
  ingredients.json
  customers/*.json       (named regulars + walk-in archetypes)
  bars/*.json            (menu, shelf, clientele pool, pacing, modifiers)
  incidents/*.json       (trigger templates)
  dialogue/*.ink         (compiled to .ink.json at build; one file per named customer)
```

Rules:

- `sim/` has zero rendering dependencies and is where the tests live.
- Every gameplay number lives in `data/` or a `tuning.ts` constants file. No magic numbers in systems.
- The loop is fixed-timestep for sim, variable for render, with interpolation for held items.

---

## 5. Core data models

Sketches, not final. Keep them plain and serializable.

```ts
// ingredients.json
interface Ingredient {
  id: string;            // "tequila_blanco"
  name: string;
  color: string;         // hex, used for liquid tinting
  opacity: number;       // 0..1, for layering look
  abv: number;           // 0..1, drives intoxication
  density: number;       // for optional layering (grenadine sinks)
  category: "spirit" | "liqueur" | "juice" | "syrup" | "mixer" | "bitters" | "other";
}

// The one model everything mixes through.
interface Vessel {
  id: string;
  kind: "bottle" | "glass" | "shaker" | "mixing_glass" | "jigger";
  glassType?: "rocks" | "coupe" | "highball" | "shot" | "martini";
  capacityMl: number;
  contents: Record<string, number>;   // ingredientId → ml
  ice: number;                         // cubes
  dilutionMl: number;                  // from shaking/stirring/ice melt
  mixed: number;                       // 0..1 — how homogeneous
  shaken: boolean; stirred: boolean;
  chilledC: number;
  rim?: "salt" | "sugar";
  garnish: string[];
  spilledMl: number;                   // accumulated waste
}

// recipes/margarita.json
interface Recipe {
  id: string; name: string;
  glass: "rocks" | "coupe" | ...;
  ingredients: { id: string; ml: number; toleranceMl: number }[];
  method: "shake" | "stir" | "build";
  ice: "cubes" | "none" | "crushed";
  rim?: "salt";
  garnish?: string[];
  serveWithIce: boolean;
  weights?: Partial<Record<"ingredients"|"method"|"glass"|"rim"|"garnish"|"ice", number>>;
}

interface DrinkResult {
  recipeId: string | null;    // null = unidentifiable
  score: number;              // 0..100
  tags: string[];             // "too_strong", "no_salt", "wrong_glass", "warm", "over_diluted"
  timeSec: number;
  spilledMl: number;
}

interface Customer {
  id: string;                  // "marta" for named, "walkin_04" for generic
  seat: number | null;
  personality: { patience: number; demanding: number; talkative: number; tolerance: number };
  order: { recipeId: string; special?: string[] } | null;   // special: ["no_salt"]
  patience: number;            // 0..1, drains over time, refilled by good service
  bac: number;                 // rises with abv*ml, decays over time
  mood: number;                // -1..1
  drinksHad: number;
  storyState: Record<string, unknown>;   // mirrored from Ink variables
  flags: Set<string>;          // "cut_off", "was_rude", "knows_about_brother"
}

// bars/dive.json
interface Bar {
  id: string; name: string;
  menu: string[];                       // recipe ids on the house menu
  shelf: string[];                      // ingredient ids physically present
  seats: number;
  clientele: { customerId: string; weight: number }[];   // regulars + archetypes
  pacing: { night: number; curve: [minute: number, arrivalsPerMin: number][] }[];
  modifiers: Record<string, number>;    // patienceMul, tipMul, toleranceMul, fightChance…
  unlockedBy?: string;                  // meta condition
}

// A named customer's authored arc, split into beats.
// customers/marta.json
interface CustomerDef {
  id: string; name: string; archetype: boolean;
  personality: Customer["personality"];
  beats: {
    knot: string;                       // Ink knot name
    requires: string[];                 // flags that must be set  (run or meta scope)
    forbids: string[];                  // flags that must not be set
    value: number;                      // generator picks the highest-value eligible beat
    once: boolean;
  }[];
}

// incidents/fight.json
interface IncidentTemplate {
  id: string;
  requires: {
    presentCount?: number;
    anyCustomer?: { bacMin?: number; flags?: string[] };
    pair?: { flagsA: string[]; flagsB: string[] };       // two customers with a relationship
    minuteMin?: number;
  };
  chancePerMinute: number;
  effects: { reputation: number; flags: string[]; endsNight?: boolean };
  summaryKey: string;
}

interface Run {
  seed: number; barId: string;
  night: number;                         // 1..5
  reputation: number;                    // 0..100, HP
  tips: number;                          // in-run currency
  stock: Record<string, number>;         // ingredient ml remaining (bottles run dry)
  runFlags: Set<string>;                 // story state for this week
  nightLog: NightSummary[];
}

interface Meta {
  unlockedBars: string[]; unlockedRecipes: string[]; metRegulars: string[];
  perks: string[]; runsPlayed: number; endingsSeen: string[];
}
```

### Drink evaluation (sketch)

1. Identify nearest recipe by ingredient set (Jaccard on ids, then by proportions). If nothing is close, `recipeId = null`.
2. For each recipe ingredient: penalty ∝ |actual − target| / tolerance, clamped. Missing = full penalty. Extra ingredient = penalty.
3. Method, glass, rim, garnish, ice, temperature: binary checks with per-recipe weights.
4. Dilution window: shaking too long or letting it sit on ice too long → `over_diluted`.
5. Spillage and time are reported as tags, and feed tips separately (not the drink score).

Score → customer reaction is _not_ in Evaluate. Reactions live in `Reactions.ts` and depend on the customer: a demanding sober customer sends back a 72; a friendly drunk one thanks you for it.

---

## 6. Interaction verbs (full list, for scoping)

Phase 1 verbs are marked ★.

- ★ **Pick up / put down** anything (click, hold, release).
- ★ **Pour** — hold bottle over vessel; pointer-hold tilts; flow rate ramps with tilt; release to stop. Stream must intersect the vessel mouth or it spills onto the counter (visible puddle, `spilledMl`).
- ★ **Jigger** — pour into jigger; it stops at 30/45/60ml marks (exact but slow). Tip jigger into vessel.
- ★ **Add ice** — drag from ice bucket, drop into vessel (tweened arc, clink).
- ★ **Shake** — pick up loaded shaker, hold and move pointer rapidly; shake meter fills; audio + screen shake. Under-shaken = unmixed and warm; over-shaken = over-diluted.
- ★ **Strain/pour out** — shaker → glass is a pour.
- ★ **Rim** — drag glass onto salt plate and press (hold).
- ★ **Garnish** — drag lime wedge etc. onto glass.
- ★ **Discard** — drop vessel into sink (resets, costs time).
- ★ **Recipe book** — click to open; covers ~40% of the screen; game keeps running.
- Stir (Phase 3), crushed ice, layering, float, muddle (later, if ever).
- Serve (Phase 2), Water / Food / Cut off (Phase 2–3), talk (Phase 4).

Free-pour counting: a real bartender counts "one-two-three-four" ≈ 30ml at a steady pour. Tune the ramp so that a full tilt pours ~10 ml per 100ms _after_ the ramp, making a 45ml pour a ~0.6s hold. The player should be able to learn this with their body.

---

## 7. Phase 1 — Drink prototype (the only thing to build first)

Goal, in the author's words: **make pouring and mixing feel fucking good.**

### Scope

- Work band and counter band only. No customers.
- Ingredients: tequila, triple sec, lime juice, simple syrup, gin, vermouth, soda, cola, orange juice, grenadine. (10 is enough to test color mixing and layering.)
- Vessels: 2 rocks glasses, 1 coupe, 1 highball, shaker, jigger, ice bucket, salt plate, lime wedges, sink.
- Recipes: Margarita, Gin & Tonic, Tequila Sunrise (layering test), Martini (stir/shake-free-ish; stir may be faked as "swirl" in Phase 1).
- A debug panel (DOM) showing the held vessel's `contents`, `mixed`, `dilution`, plus a "Evaluate against: [recipe]" dropdown that prints the `DrinkResult`.
- Audio: pour loop (pitch and volume scale with flow), glug at bottle mouth, splash on impact, ice clink, shaker rattle, salt crunch.

### Liquid rendering approach (do this, in this order)

1. **Glass fill**: a masked rectangle/polygon per glass, height = volume / capacity. Color = opacity-weighted mix of contents. When `mixed < 1`, render up to 3 density-sorted layers with soft gradient boundaries; as `mixed → 1` collapse to one color.
2. **Meniscus and slosh**: a small fragment shader on the fill that displaces the top edge with a damped sine driven by the vessel's recent velocity. Ice cubes are sprites floating at the surface, bobbing.
3. **Stream**: a tapered quad from bottle mouth to impact point, width ∝ flow, slight gravity curve, animated UV scroll. Tinted with the pouring ingredient's color.
4. **Impact**: a few particles, a brief ripple on the surface, the surface level rises with a slight overshoot easing.
5. **Spill**: if the stream misses, a puddle sprite grows on the counter. Overflow: surface reaches the rim, foams, puddle grows around the glass base.
6. **Bottle tilt**: the bottle sprite rotates around its base; liquid inside the bottle (visible for clear bottles) follows an opposite-tilt fill so it "reads" as liquid.

Only if this feels dead after tuning: try a **2D particle stream** (≈100–300 particles, simple gravity + spring toward stream center, rendered as a metaball-ish blur). Do **not** attempt SPH/PBF or any real fluid solver.

### Acceptance criteria — Phase 1 is done when

- [ ] A person who has never seen the game can make a Margarita with the recipe book open in under 90 seconds, with no text instructions besides the book.
- [ ] Free-pouring 45ml ±5ml is learnable with practice (test: 5 pours in a row after 3 minutes of play).
- [ ] Pouring has audible and visible feedback on: start, steady flow, stop, impact, near-full, overflow, miss.
- [ ] You can mess up in at least four visibly different ways (spill, overfill, wrong glass, under-shaken) and each is legible without the debug panel.
- [ ] Layering visibly works for Tequila Sunrise and disappears when shaken.
- [ ] `Evaluate` has unit tests for: perfect drink, each single fault, unidentifiable drink, tolerances.
- [ ] Stable 60fps on a mid-range laptop with 6 vessels on screen, one pouring.
- [ ] Recording a 20-second clip of someone pouring makes _you_ want to play it.

### Explicitly out of scope for Phase 1

Customers, time pressure, scoring UI, tips, dialogue, saving, menus, art polish beyond readable placeholders.

---

## 8. Phases 2–5 (summary; detailed specs written when each phase starts)

**Phase 2 — Customers.** Seats, arrivals from a _seeded_ generator (walk-in archetypes only), order bubble, patience bar, serve-by-drag, reaction from `DrinkResult × personality × bac`, intoxication rising per drink and decaying per game-minute, tips, customer leaves. Verbs: serve, water. End condition: night clock runs out → placeholder summary listing every event flag and the seed.

**Phase 3 — Pressure and the run.** Pacing curves per bar per night (calm → rush → last call). Multiple simultaneous orders, second rounds, reorder-while-you're-shaking, special requests ("no salt", "make it a double"). Verbs: cut off, food. Stir as a real technique. Then the **run loop**: bar select (one bar), five nights, reputation as HP, tips spent between nights on a tiny shop (restock, garnish, recipe), fired-at-zero, run summary. Tuning goal: "I have too much going on" around minute 6 of night 3, and the player still wants night 4.

**Phase 4 — Dialogue.** Ink runner. Customers speak in timed bubbles while you work; choices appear for N seconds with a visible timer; silence is a choice. Ink variables record what was said; callback questions check them. Consequences write customer flags and patience/mood, not scores. Two named regulars with 3–4 beats each, drawn by the generator. Ink hot reload while the game runs; this phase must make authoring frictionless because content is the bottleneck.

**Phase 5 — Narrative and meta.** Incident templates (fight, hookup, drunk driver, walkout, someone who shouldn't have been served) triggered by state combinations; night and run summaries read from flags; a second bar; meta-unlocks (bars, recipes, regulars, one starting perk); 4–6 named regulars total. Multiple endings emerge from incidents × story flags, not from a scripted ending list.

**Roguelite rule for all phases:** anything that decides _who or when_ uses `Rng.ts` with the night seed. Anything that decides _what they say_ is authored in Ink and gated by flags. Anything that decides _what happens between people_ is an incident template evaluated by the sim. Never mix the three.

---

## 9. The "juice" checklist

Go through this for every interaction, every phase.

- Every action has a sound, and the sound varies with intensity.
- Every state change has an anticipation frame and an overshoot (ease-out-back for drops, ease-in for pickups).
- Liquids never teleport: levels animate.
- Held items lag the cursor by 1–2 frames with a slight rotation in the direction of travel.
- Mistakes are louder and more visible than successes.
- The screen never freezes for feedback. The bar keeps running.

---

## 10. Risks and how we de-risk them

| Risk                                                | Mitigation                                                                                                                                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pouring feels like a slider with graphics           | Phase 1 acceptance criteria; particle-stream fallback; don't start Phase 2 until §7 passes.                                                                                                                                |
| Overload tips from fun into frustration             | Pacing lives in `nights/*.json`, tuned by playtesting, never hardcoded. Patience drains slower than it feels. Always let the player recover with one good drink.                                                           |
| Ephemeral dialogue feels unfair                     | Bubbles dwell long enough to read twice; important lines get a subtle audio cue _and_ a visual tell (customer leans in); the callback question offers "I'm sorry, remind me?" as a branch with a rapport cost, not a fail. |
| Narrative content volume                            | Ink hot reload; generic walk-ins reuse a small pool of ambient lines; named characters are few (3–5 for a first release).                                                                                                  |
| Scope creep in physics                              | Physics engine is banned until a specific interaction demonstrably needs it.                                                                                                                                               |
| Browser performance                                 | Sim is cheap; rendering is the cost. Budget: ≤ 200 draw calls, one shader for all liquid fills.                                                                                                                            |
| Random nights feel like a slot machine, not a story | Beats are authored and gated; the generator seats people, it doesn't write them. Every named regular has a beat available on every night they appear.                                                                      |
| Runs feel samey across bars                         | Bars differ in _verbs and constraints_ (shelf, menu, seats, modifiers), not only numbers. A dive bar with no shaker is a different game from a hotel bar with eight liqueurs.                                              |
| Meta-progression becomes grind                      | Unlocks are mostly _content_ (a new regular, a new bar), not stat boosts. One perk slot, never more.                                                                                                                       |

---

## 12. Roguelite structure

```
Title → Bar select (unlocked bars) → Run
  Run = 5 nights at that bar, seed fixed at run start
    Night n:
      NightGenerator(seed, bar, run state) →
        cast (regulars from clientele pool with an eligible beat + walk-in archetypes),
        arrival schedule (bar pacing curve for night n),
        incident templates armed for this night
      Play (8–10 min)
      Night summary: drinks, tips, incidents, story lines you caught / missed, seed
      Reputation delta applied. Reputation ≤ 0 → fired → Run summary
    Between nights: shop (tips → restock, garnish, one recipe), one line of rumor about tomorrow
  Run summary: week outcome, endings reached, meta-unlocks earned
Meta: unlocked bars, recipes, regulars met, endings seen, one perk
```

Reputation (HP) drains from: walkouts, sent-back drinks, incidents, serving someone visibly drunk. It recovers from: excellent drinks to demanding customers, resolved incidents (you cut someone off in time), regulars leaving happy. Target: a competent player finishes the week around 40–60 reputation on the first bar; night 4–5 of the second bar is where good players start getting fired.

Stock matters: bottles hold a finite amount per night; running dry mid-rush is a legitimate way to lose reputation and a reason to spend tips.

Generation is deterministic from `(seed, barId, night, runFlags)`. Same inputs, same cast. Show the seed on the summary and allow entering one on bar select (debug and shareability for free).

---

## 13. Zero-budget rules

The author will spend nothing beyond their existing Claude plan. This is a constraint, not a preference. Concretely:

- **Libraries:** MIT/BSD/Apache only. Current stack qualifies: Vite, TypeScript, PixiJS, inkjs, Howler, Vitest. Before adding _any_ dependency, check the license and that it has no paid tier we'd need.
- **Hosting:** GitHub Pages (via GitHub Actions, free for public repos) or itch.io (free, supports HTML5 uploads, has a built-in audience). Both. No custom domain.
- **No backend, no analytics, no accounts, no cloud saves.** `localStorage` only. If a feature needs a server, it's out.
- **Art:** self-made placeholder shapes in Phase 1–3. Later: **Kenney.nl** (CC0), OpenGameArt (CC0/CC-BY only, credit in-game), or self-drawn in **LibreSprite**, **Piskel**, **Krita**, or **Inkscape** (all free). Aseprite is paid; don't assume it.
- **Audio:** generate with **jsfxr / ChipTone** (free) or directly with Web Audio; **Freesound** CC0 only. No paid packs.
- **Fonts:** Google Fonts (OFL) only, self-hosted in `public/fonts`.
- **License log:** `CREDITS.md` lists every third-party asset with source URL and license. If it isn't in the log, it doesn't ship.
- **Ink compiler:** `inkjs` bundles a JS compiler; no need for Inky (which is free anyway).
- **Claude usage:** the author's plan has usage limits. Plan each Claude Code session as one self-contained vertical slice with a clear stopping point, and keep `DEVLOG.md` and `CLAUDE.md` current so a new session needs no re-orientation. Don't burn budget on exploratory refactors.

---

## 14. Working agreement for Claude Code

- Work in **phases and vertical slices**. Do not build Phase 2 scaffolding "while you're there."
- Before implementing a feel-related feature, write a one-paragraph plan and the acceptance test. After, run the game (`npm run dev`) and describe what you observed, not what you intended.
- **Decide yourself**: file structure, naming, tuning constants, placeholder art, which easing to use.
- **Ask first**: anything that changes a locked decision in §1, adds a dependency, or changes the data schemas in §5 in a non-additive way.
- Every `sim/` module ships with Vitest tests. Renderer code is exempt from unit tests but must not contain gameplay logic.
- Placeholder art: flat-shaded shapes with readable silhouettes. Bottles are distinguishable by color and label text. Do not spend time on art.
- Keep a `DEVLOG.md`: date, what was tried, what felt good, what didn't, numbers that changed. This is the only place tuning history lives.
- Commit small, message in the imperative, one feature per commit.

### First session

1. Scaffold: Vite + TS strict + Pixi 8 + Vitest + ESLint/Prettier. `npm run dev` shows the three bands with placeholder rectangles and a cursor-following "hand."
2. Implement `Vessel`, `Pour`, `Mixing`, `Evaluate` in `sim/` with tests, driven by `data/ingredients.json` and `data/recipes/`.
3. Pick-up / put-down / pour (bottle → rocks glass) with glass fill rendering and the pour sound. Stop there and report what it feels like.

---

## 15. Open questions for the author (not blocking Phase 1)

1. Tone: grounded contemporary bar, or slightly stylized/noir? Affects art direction and Ink voice, not code.
2. Real cocktail names and recipes, or invented ones? Real is more satisfying to learn and there's no IP issue with recipes.
3. Alcohol consequences (drunk driving ending): how dark are we willing to go? This sets the ceiling for Phase 5 events.
4. Is there a "you" — does the bartender have a backstory the customers can pull on — or is the player a blank?
5. Run length: 5 nights ≈ 45 min per run. If you want runs closer to 20–25 min, make it 3 nights. Decide before Phase 3.
6. Public or private GitHub repo? Public gets free Pages hosting and CI minutes; private means itch.io only.
