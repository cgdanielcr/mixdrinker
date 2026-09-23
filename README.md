# Last Call

A 2D browser bartender roguelite. Pick a bar, work a week of randomly generated
nights; the bar's reputation is your HP. Three things compete for the player:
hands (mix drinks), brain (remember orders), attention (listen to customers).

Design and technical handover: **[HANDOVER.md](HANDOVER.md)**.
Per-session brief: **[CLAUDE.md](CLAUDE.md)**. Tuning history: **[DEVLOG.md](DEVLOG.md)**.

## Status

**Phase 3 — pressure and the run.** A week at one bar: five nights, reputation
as HP, fired at zero.

Working now: build a drink by hand (free-pour or jigger, ice, shake or stir,
strain, salt a rim, garnish, sink), then serve it to one of five seats before
they walk out. Customers order second rounds, ask for it without salt or as a
double, and get visibly drunk — refuse them in time and it pays; serve them
anyway and it costs. Between nights, tips buy stock and new recipes. Bottles
run dry. The week is saved to localStorage and reproducible from its seed.

Not yet: dialogue and named regulars (Phase 4), incidents, a second bar and
meta-unlocks (Phase 5).

## Running it

Needs Node 22+.

```bash
npm install
npm run dev
```

Click a bottle, glass, shaker or jigger to pick it up. Tap to put it down, or press
and hold over a vessel to pour. Carry a vessel to a station and tap for ice, lime or
the sink; hold on the salt plate to rim it. Hold the shaker and move fast to shake.
Carry a finished drink to a seat and tap to hand it over. Hold on an occupied
seat with empty hands to refuse someone service.
`R` opens the recipe book, `M` mutes, `D` hides the debug panel.

Add `?seed=1234` to the URL to start a week on that seed, or type one on the
title screen. The seed is printed on every summary.

```bash
npm test     # vitest — the sim layer
npm run lint
npm run build
```

## Layout

- `src/sim/` — pure game logic. No Pixi imports, no `Math.random`, fully tested.
  Both rules are enforced by ESLint, not just by convention.
- `src/core/` — state, fixed-timestep loop, input, world geometry.
- `src/render/` — Pixi. Reads state, never writes it.
- `src/ui/` — DOM overlay for text-heavy UI.
- `data/` — ingredients, recipes, glassware. Gameplay numbers live here or in
  `src/tuning.ts`.

## Licence

Third-party credits and licences: [CREDITS.md](CREDITS.md).
