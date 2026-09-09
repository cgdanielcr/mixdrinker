# DEVLOG

Tuning history and feel observations. Newest first.
Format per session: what was tried, what felt good, what didn't, numbers that changed.

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

| press | ml   |
|-------|------|
| 300ms | 1.9  |
| 450ms | 12.4 |
| 600ms | 28.9 |
| 700ms | 38.9 |
| **750ms** | **43.9** |
| 800ms | 48.9 |
| 900ms | 58.9 |
| 1200ms| 88.9 |

Past the ramp it is exactly **10 ml per 100 ms**, which is §6's spec. Repeatable
to the millilitre across runs, so the skill is learnable rather than random.

**Open tension with §6.** The spec asks for both "10 ml per 100 ms after the
ramp" *and* "a 45 ml pour is a ~0.6 s hold". Those cannot both be true once
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
Specifically unverified: whether the pour actually *feels* good, whether the
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
