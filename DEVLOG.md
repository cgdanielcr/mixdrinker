# DEVLOG

Tuning history and feel observations. Newest first.
Format per session: what was tried, what felt good, what didn't, numbers that changed.

---

## 2026-09-09 — Session 3: Phase 2, customers and the night

Seeded arrivals, seats, order bubbles, patience, serve-by-drag, reactions,
intoxication, tips, a night clock and an end-of-night summary. The drink model
finally has a reason to exist.

**The loop closes.** Made a Margarita, carried it to a waiting customer, handed
it over: _"Perfect. Thank you." 97/100, 6 tip_ — patience restored 0.52 → 1,
phase → drinking, BAC 0.0298. Served them cola instead and it came back: no
tip, `wrong_drink` + `sent_back` flags, patience penalty, still waiting.

### Shape of it

- **Rng.ts** (mulberry32) now exists and the ESLint ban on `Math.random` in
  `src/sim` finally has something to point at. Streams are forked per system so
  adding a system later cannot shift who walks in the door.
- **NightGenerator** walks the night a minute at a time accumulating expected
  arrivals off the bar's pacing curve. Deterministic from
  `(seed, barId, night)`; `?seed=4242` in the URL replays a night exactly, and
  the summary prints the seed (§12, shareable for free).
- **Reactions.ts** is where §5 insists it must be — outside `Evaluate`. The
  same 72 is `poor` to a snob and `fine` to easy company; a customer at the
  cut-off line forgives about 26 points.
- **Serving reuses the station gesture** from session 2: carry the glass to the
  seat's spot and tap. One rule for ice, salt, lime, sink and customers.

### Two bugs worth recording

1. **`[hidden]` did nothing.** `.night-summary { display: flex }` outranks the
   `hidden` attribute, so the end-of-night overlay sat on top of the entire
   night, invisible-but-covering. Added a global
   `[hidden] { display: none !important }`. This would have hit every future
   overlay — worth knowing before Phase 4 puts dialogue on screen.
2. **Seats ran off under the debug panel.** The third seat sat at x=1550, which
   the panel covers at common window sizes. Span pulled 1180 → 1000.

### Numbers set this session, all first guesses

`NIGHT.REAL_SECONDS 540` (21:00→02:00 in 9 real minutes, so 1 real second ≈ 33
game seconds) · `PATIENCE.WAIT_MINUTES 14` · `INTOX.CUT_OFF 0.14` ·
`REACTION.LOVED 85 / FINE 62 / POOR 40` · `TIPS.BASE 3`.

An unattended night on seed 4242 draws **52 arrivals** and ends 41 walkouts, 10
turned away. Playing it properly (serving correct drinks on sight) gives 43
served, 291 tips, 4 walkouts. So the ceiling and the floor are far apart, which
is what we want — but **whether the middle is playable is exactly the thing I
cannot test.** Three seats and a 14-minute patience window is a guess.

### Deliberately not built

Reputation, the run, the shop, the water and cut-off verbs — all Phase 3 per
§8. Named regulars and Ink are Phase 4. The summary is the placeholder §8 asks
for: every event flag, timestamped, plus the seed.

### Order bubbles are Pixi, not DOM

§4 sketches `ui/Bubbles.ts` as part of the DOM overlay. These are one or two
words pinned to a figure that sways, moves and leaves, so they live in the
scene graph instead — no syncing DOM positions to the letterboxed stage
transform every frame. Phase 4's timed dialogue choices are a different problem
and can still be DOM.

---

## 2026-09-09 — Session 2: the rest of the Phase 1 verbs

Ice, shake, strain, jigger, salt rim, garnish, sink and the recipe book. The
Margarita now goes from empty glass to finished drink without leaving the game.

**The headline: a full Margarita, built entirely through the game's own input
— free-poured, iced, shaken, rimmed, garnished, strained — scores 100 with no
fault tags.** Measured 49.9 / 25.2 / 25.2 against a 50 / 25 / 25 recipe.

### Two real bugs the end-to-end run exposed

Both were invisible to the unit tests because both live in the seam _between_
vessels, and both are now locked down by tests.

1. **Straining destroyed the drink's history.** `shaken`, `stirred` and `mixed`
   lived on the shaker and did not cross into the glass, so a properly shaken
   Margarita arrived tagged `not_shaken` and scored 86. Worse, the melt water
   was silently deleted on transfer — meaning straining _laundered an
   over-diluted drink clean_, destroying the whole dilution window from §5.4.
   These properties belong to the **liquid**, so they now travel with it,
   blended by volume. Glass type, rim, garnish and ice stay with the vessel.

2. **The jigger measured nothing.** It filled to 30, then immediately carried
   on to 45 and 60 in the same pour, because each tick simply looked for the
   next mark above the current level. It now latches: one press gives exactly
   one measure, and you must release and press again for the next. Verified
   exact — 1 press = 30.00ml, 2 = 45.00, 3 = 60.00, and a 3-second press still
   stops at 30.

Widening the jigger 64 → 84px cut waste per measure from **10.4ml to 0.4ml**.
The stream arcs as the tilt ramps, and the original target was so narrow the
stream walked off it before the mark was reached.

### Adapted away from the spec, deliberately

- **Stations act on the vessel you are carrying.** §6 has you drag ice _to_ the
  glass but carry the glass _to_ the salt plate. Unifying on "bring the vessel
  to the station" is one rule instead of two, and the walk is a real cost
  during a rush — which is the point. Tap for ice, lime and sink; hold on the
  salt plate to rim.
- **Shaking and pouring share one gesture.** Hold the shaker and move fast and
  you are shaking; hold it steady over a glass and you are straining. No mode
  switch, no cap to unscrew, and it matches what your arm is doing. Above
  `SHAKE.SUPPRESS_POUR_ABOVE` the tilt stops producing flow.
- **The recipe book sits on the counter**, not the work band — it is the one
  thing you reach for mid-service, and the right-hand end of the work band is
  covered by the debug panel at common window sizes.

### Known friction, not yet resolved

Tapping to put a vessel down _while the cursor is over a station_ uses the
station again instead of releasing. Correct by the rules, but it surprised me
every time in testing. Worth watching in a real playtest before changing.

### Still unverified

Same caveat as session 1, and it still matters most: **this has been driven by
automation, never by a person.** The shake gesture in particular is tuned
entirely by numbers (`SHAKE.MIN_SPEED` 700, `FULL_SPEED` 2600 px/sec) and has
never been felt. Nor have any of the new sounds been heard.

---

## 2026-09-09 — Session 1: scaffold, sim core, first pour

Executed `HANDOVER.md` §14's "First session" in full. Repo had only the two spec
documents; everything below is new.

### Environment

Node was not installed on the dev machine. Installed Node 22+ LTS
(`winget install OpenJS.NodeJS.LTS`, now v24.19.0 at `C:\Program Files\nodejs`).
**Note for a fresh session:** a shell opened before that install will not have
`node` on PATH — open a new terminal, or prefix with the full path.

Stack pinned deliberately: **TypeScript 5.9**, not 7.x. `typescript-eslint@8`
declares `typescript >=4.8.4 <6.1.0`, so TS 7 breaks linting outright. Revisit
when typescript-eslint supports it. Vite 8 / Vitest 5 / Pixi 8.20 / ESLint 10.

`inkjs` and `howler` are **not installed yet**. Ink is Phase 4. Howler had
nothing to play this session — see Audio below.

### Pour calibration (the number that matters)

Measured by driving the fixed-timestep loop directly (no rAF, so no frame-rate
noise), pouring tequila into a rocks glass. Press duration → ml in glass:

| press     | ml       |
| --------- | -------- |
| 300ms     | 1.9      |
| 450ms     | 12.4     |
| 600ms     | 28.9     |
| 700ms     | 38.9     |
| **750ms** | **43.9** |
| 800ms     | 48.9     |
| 900ms     | 58.9     |
| 1200ms    | 88.9     |

Past the ramp it is exactly **10 ml per 100 ms**, which is §6's spec. Repeatable
to the millilitre across runs, so the skill is learnable rather than random.

**Open tension with §6.** The spec asks for both "10 ml per 100 ms after the
ramp" _and_ "a 45 ml pour is a ~0.6 s hold". Those cannot both be true once
there is a tilt ramp and a tap dead zone: 45 ml is a **0.75 s press**, of which
~0.6 s is actual pouring and 0.15 s is the tap window before the tilt starts.
Kept the flow rate (it is the muscle-memory number, the "one-two-three-four"
count) and let the press be longer. Lowering `FEEL.TAP_MS` from 150 is the lever
if 0.75 s feels sluggish in the hand — **needs a human playtest to settle.**

### Changed during the session, because running it exposed problems

- **Bottle pivot.** Originally the bottle rotated about its base, per §7.6. At
  the spec'd tilt this swung the mouth ~160 px sideways, so the stream landed
  nowhere near the cursor and aiming was guesswork. Now **the cursor is the
  mouth**: the body swings around it as the tilt ramps, like a wrist. The bottle
  still visibly rotates about its base; the base is what moves.
- `POUR.MAX_TILT_DEG` **105 → 72**. Past ~75° it reads as upending the bottle,
  and the body covers the glass you are aiming at.
- **Colour blending** weights each ingredient `ml * opacity^2`, not
  `ml * opacity`. Linear weighting rendered 30 ml of cola in 150 ml of soda as
  grey; absorption is superlinear in concentration and the eye expects a splash
  of something opaque to dominate. New constant `COLOR.OPACITY_WEIGHT_EXP = 2`.
- **Pickup with overlapping items** now takes the item whose centre is nearest
  the pointer. Array order meant a bottle left standing over a glass would grab
  the glass.
- **Scale-to-fit bug.** `app.renderer.width` is already in logical pixels;
  dividing it by `resolution` shrank the whole scene into a corner. Use
  `app.screen`, which is the same space `Input` maps into.
- Bottle shelf narrowed (`LAYOUT.WIDTH - 520`) so the debug panel does not cover
  the last two bottles at smaller window sizes. **D** now collapses the panel.

### Audio

The continuous pour is **synthesised with Web Audio** (bandpass-filtered noise),
not played from a sample. Pitch and gain track flow rate, and the bandpass
centre rises with the target's fill level — so a glass approaching its rim is
audible before it is visible, which is the "near-full" cue in §7's acceptance
list. A miss loses the resonance and goes flat and wide; an overflow adds a low
burble, so mistakes are louder than successes (§9).

This keeps the asset budget at zero (§13). Howler remains the locked choice for
one-shot samples once there are files to play.

### What is NOT verified

Everything above was verified by automation. **Nobody has played this yet.**
Specifically unverified: whether the pour actually _feels_ good, whether the
audio sounds right (never heard), and stable 60 fps with six vessels on screen.
The §7 acceptance criteria that need a human — the 90-second Margarita, five
45 ml pours in a row, "does a 20-second clip make you want to play it" — are all
still open.

### Not built this session (Phase 1, later slices)

Ice, shake, jigger, rim, garnish, sink, the recipe book, and the slosh shader.
The glass surface currently wobbles via a Graphics polygon as a stand-in.

### Numbers set this session

All in `src/tuning.ts`. Starting values, none playtested:
`MAX_FLOW_ML_PER_SEC 100` · `TILT_RAMP_MS 350` · `TILT_RELEASE_MS 160` ·
`TILT_CURVE_EXP 1.7` · `MAX_TILT_DEG 72` · `TAP_MS 150` · `HAND_LAG 0.35` ·
`FILL_EASE 0.22` · `OPACITY_WEIGHT_EXP 2`.

### Next session starts here

1. Play it and settle `TAP_MS` / `TILT_RAMP_MS` by hand. Record five 45 ml
   attempts in this log.
2. Ice, shake and the shaker → glass strain, which unlocks the Margarita end to
   end and the first real `Evaluate` run on a drink a human made.
3. Then rim, garnish, sink, recipe book.
