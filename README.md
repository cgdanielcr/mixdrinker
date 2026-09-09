# Last Call

A 2D browser bartender roguelite. Pick a bar, work a week of randomly generated
nights; the bar's reputation is your HP. Three things compete for the player:
hands (mix drinks), brain (remember orders), attention (listen to customers).

Design and technical handover: **[HANDOVER.md](HANDOVER.md)**.
Per-session brief: **[CLAUDE.md](CLAUDE.md)**. Tuning history: **[DEVLOG.md](DEVLOG.md)**.

## Status

**Phase 1 — drink prototype.** Pouring and mixing have to feel good before
anything else gets built. No customers, dialogue or scoring UI yet.

Working now: the whole Margarita, start to finish. Pick up and put down, free-pour
with a tilt ramp, measure with a jigger that stops on its marks, add ice, shake,
strain, salt a rim, garnish, and dump it in the sink. Liquid renders as
density-sorted layers with a stream, splash, spills and overflow. The recipe book
opens on the bar and the game keeps running behind it.

## Running it

Needs Node 22+.

```bash
npm install
npm run dev
```

Click a bottle, glass, shaker or jigger to pick it up. Tap to put it down, or press
and hold over a vessel to pour. Carry a vessel to a station and tap for ice, lime or
the sink; hold on the salt plate to rim it. Hold the shaker and move fast to shake.
`R` opens the recipe book, `M` mutes, `D` hides the debug panel.

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
