# Last Call

A 2D browser bartender roguelite. Pick a bar, work a week of randomly generated
nights; the bar's reputation is your HP. Three things compete for the player:
hands (mix drinks), brain (remember orders), attention (listen to customers).

Design and technical handover: **[HANDOVER.md](HANDOVER.md)**.
Per-session brief: **[CLAUDE.md](CLAUDE.md)**. Tuning history: **[DEVLOG.md](DEVLOG.md)**.

## Status

**Phase 1 — drink prototype.** Pouring and mixing have to feel good before
anything else gets built. No customers, dialogue or scoring UI yet.

Working now: pick up and put down, free-pour with a tilt ramp, liquid fill with
density-sorted layers, stream and splash, spills and overflow, synthesised pour
audio, and a debug panel that evaluates the drink in the glass.

## Running it

Needs Node 22+.

```bash
npm install
npm run dev
```

Click a bottle or glass to pick it up. Tap to put it down, or press and hold
over a glass to pour. `M` mutes, `D` hides the debug panel.

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
