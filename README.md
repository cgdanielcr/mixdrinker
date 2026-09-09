# Last Call

A 2D browser bartender roguelite. Pick a bar, work a week of randomly generated
nights; the bar's reputation is your HP. Three things compete for the player:
hands (mix drinks), brain (remember orders), attention (listen to customers).

Design and technical handover: **[HANDOVER.md](HANDOVER.md)**.
Per-session brief: **[CLAUDE.md](CLAUDE.md)**. Tuning history: **[DEVLOG.md](DEVLOG.md)**.

## Status

**Phase 2 — customers.** The full loop runs: customers arrive on a seeded
schedule, sit, order, lose patience, and react to what you hand them.

Working now: free-pour or measure with a jigger, ice, shake, strain, salt a
rim, garnish, sink, and the recipe book. Then serve it — carry the glass to a
seat and hand it over. Drinks are scored by the liquid and judged by the
person: a demanding customer sends back a 72 that a drunk one thanks you for.
Tips, intoxication, walkouts, a night clock, and an end-of-night summary
listing every event and the seed.

Not yet: reputation and the run loop (Phase 3), dialogue (Phase 4), named
regulars and incidents (Phase 5).

## Running it

Needs Node 22+.

```bash
npm install
npm run dev
```

Click a bottle, glass, shaker or jigger to pick it up. Tap to put it down, or press
and hold over a vessel to pour. Carry a vessel to a station and tap for ice, lime or
the sink; hold on the salt plate to rim it. Hold the shaker and move fast to shake.
Carry a finished drink to a seat and tap to hand it over.
`R` opens the recipe book, `M` mutes, `D` hides the debug panel.

Add `?seed=1234` to the URL to replay a specific night. The seed is printed on
the end-of-night summary.

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
