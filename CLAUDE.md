# CLAUDE.md — Last Call

Read `HANDOVER.md` first. It contains the locked design and technical decisions. This file is the short version you carry into every session.

## What this is

2D browser bartender roguelite. Pick a bar, work a week of randomly generated nights; the bar's reputation is your HP. Three things compete for the player: hands (mix drinks), brain (remember orders), attention (listen to customers). The tension between them is the game.

Randomness decides who shows up and when (seeded `Rng.ts`, never `Math.random` in sim). Authored Ink decides what they say. Incident templates decide what happens between people. Never mix the three.

## Stack (locked)

Vite · TypeScript strict · PixiJS 8 · inkjs · Howler · Vitest · ESLint/Prettier.
No Three.js, no physics engine, no fluid simulation, no React in the game layer, no state library.

**Budget is €0.** Free/MIT dependencies only (check license before adding). No backend, no analytics, no paid assets or tools. Hosting: GitHub Pages / itch.io. Every third-party asset goes in `CREDITS.md` with its license. See `HANDOVER.md` §13.

## Structure

- `src/sim/` — pure game logic. No Pixi imports. Every module has tests.
- `src/render/` — Pixi. Reads state, never writes it. No gameplay logic.
- `src/ui/` — DOM overlay for text-heavy UI.
- `data/` — recipes, ingredients, customers, nights, `.ink` dialogue. All gameplay numbers live here or in `src/tuning.ts`.

## Current phase

Phase 1: drink prototype. Goal: pouring and mixing must feel great. See `HANDOVER.md` §7 for scope and acceptance criteria. Do not build customer, dialogue, or scoring UI until Phase 1 acceptance criteria pass.

## How to work

- Vertical slices. One feature, playable, tested, committed.
- For any feel-related feature: short plan + acceptance test → implement → run `npm run dev` → report what you observed.
- Decide yourself: naming, file layout, tuning values, easing, placeholder art.
- Ask before: changing a locked decision, adding a dependency, breaking a data schema.
- Log tuning changes and feel observations in `DEVLOG.md`.
- The author's Claude plan has usage limits: keep each session one self-contained slice with a clear stop, and leave `DEVLOG.md` in a state that a fresh session can pick up without re-reading the codebase.
- Placeholder art only. Flat shapes, readable silhouettes.

## Commands

```
npm run dev      # game
npm test         # vitest
npm run lint
npm run ink      # compile data/dialogue/*.ink → .ink.json (Phase 4)
```
