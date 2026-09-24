# ART.md — Asset spec

Target look: the mockup (screen-print / riso, cream paper, limited palette).
All sizes are in the game's logical 1920×1080 space. Tick items off as they land.

## Ground rules

- **Format:** PNG-32 with transparency, delivered at **2× the listed size**.
- **Anchor:** bottom-centre for anything that stands on a surface. ~4 px padding
  around each sprite. No baked drop shadows — code draws them.
- **Paint flat.** One tileable grain texture (`fx/grain.png`) is overlaid on the
  whole scene, so code-drawn liquids and particles get the same print look.
- **Palette:** sample from the mockup and record the hexes below. Code reuses
  them for liquids, bars and UI.
- **Drop zone:** put raw exports in `art/` (git-ignored), any name. They get
  cropped, resized and compressed into `src/assets/art/`, which is what the game
  imports and what gets committed. Imported rather than served from `public/` so
  the one-file build can inline them.
- **No fake transparency.** Export real alpha. A checkerboard painted into the
  pixels (the first `counter` export had one) has to be cropped out by hand.
- **Aspect ratio matters more than pixel size.** Match the listed proportions;
  backgrounds are stretched to fit their band.

### Palette

| Role | Hex |
|---|---|
| Paper cream | |
| Ink black | |
| Brick red | |
| Teal | |
| Mustard | |
| Olive | |
| Bottle green | |

## Vessels

See [ART_GLASSES.md](ART_GLASSES.md). One image per glass or tool; the game
computes the liquid clip from it.

## 1. Backgrounds and texture — priority 1

- [x] `bg/customer_band.png` — 1920×378. Dark textured wall behind customers.
- [x] `bg/counter.png` — 1920×216. Wood counter, horizontal grain, darker top lip.
- [x] `bg/work_area.png` — 1920×486. Cream paper. No dividers or labels (code draws them).
- [x] `fx/grain.png` — 512×512, **tileable**, grey grain/halftone on transparent.
- [x] `counter/serve_spot.png` — 132×26. Outlined rectangle; tinted by code on hover.
- [x] `counter/recipe_card.png` — 104×130. Opens the recipe book.

## 2. Glassware and tools — priority 2

**Superseded by [ART_GLASSES.md](ART_GLASSES.md):** one image per vessel, no
separate back/front/mask layers. The list below is kept for ticking off.

- [x] `glass/rocks` — delivered square; hit box is now 110×110.
- [x] `glass/coupe` — hit box now 120×112.
- [x] `glass/highball` — 84×178.
- [x] `glass/shot` — 50×60. Loaded; not on the bar yet.
- [x] `tool/shaker` — body + cap in a 92×196 box.
- [x] `tool/mixing_glass` — hit box now 95×150; bar spoon stands in it.
- [x] `tool/jigger` — opaque metal; hit box now 71×100.

## 3. Bottles — priority 1 (58×168 each, single sprite)

Opaque body in the ingredient's colour, label lettered in. **Neck centred, mouth
at exact top-centre** — the cursor is the mouth while pouring.
Decision: opaque bottles drop the in-bottle liquid level currently drawn.

- [ ] `bottle/tequila_blanco.png`
- [ ] `bottle/gin.png`
- [ ] `bottle/triple_sec.png`
- [ ] `bottle/dry_vermouth.png`
- [ ] `bottle/lime_juice.png`
- [ ] `bottle/orange_juice.png`
- [ ] `bottle/simple_syrup.png`
- [ ] `bottle/grenadine.png`
- [ ] `bottle/soda.png`
- [ ] `bottle/cola.png`

## 4. Stations and garnish — priority 4

- [ ] `station/ice_bin.png` — 124×96
- [ ] `station/ice_cube_1..3.png` — ~22×22, 2–3 variants
- [ ] `station/salt_dish.png` — 116×34
- [ ] `station/lime_tray.png` — 116×44
- [ ] `station/sink.png` — 152×74 (not in the mockup; sits after the lime)
- [ ] `garnish/lime_wedge.png` — ~34×24, sits on a rim
- [ ] `garnish/salt_rim_rocks.png`, `_coupe.png`, `_highball.png` — glass width × ~12

## 5. Customers — priority 3

Head and shoulders, ~**240×260**, cut off at the counter line. Three expression
files each; only the face changes: `_neutral`, `_impatient`, `_happy`.
Keep cheeks in a consistent spot (code tints them when drunk). Sway and
fade-out are code.

| Archetype | In-game label | Read |
|---|---|---|
| `regular` | Regular | Neutral, relaxed |
| `hurried` | Someone in a hurry | Leaning forward, watch/lanyard |
| `snob` | Knows their drinks | Sharp collar, raised chin |
| `easy` | Easy company | Open, smiling |
| `lightweight` | Lightweight | Young, slight |
| `hardcase` | Hard case | Broad, heavy jacket |

- [ ] `customer/regular_{neutral,impatient,happy}.png`
- [ ] `customer/hurried_{neutral,impatient,happy}.png`
- [ ] `customer/snob_{neutral,impatient,happy}.png`
- [ ] `customer/easy_{neutral,impatient,happy}.png`
- [ ] `customer/lightweight_{neutral,impatient,happy}.png`
- [ ] `customer/hardcase_{neutral,impatient,happy}.png`
- [ ] `customer/empty_seat.png` — halftone silhouette, same size

## 6. UI — priority 4

- [ ] `ui/bubble.png` — order bubble as a **9-slice**, ~120×60, tail bottom-centre,
      corners and tail within a 16 px margin.
- [ ] `ui/patience_frame.png` — 92×12 pill outline; fill is code.
- [ ] `ui/hand_open.png`, `ui/hand_grab.png` — optional cursor, ~48×48.
- [ ] Font choice — free (OFL) condensed display face, e.g. Bebas Neue or Oswald.
      Add to `CREDITS.md`.

## Stays in code

Liquids, pour streams, splashes, bubbles, fill wobble, highlight rings, progress
bars, HUD text, hotkey numbers, item labels, shadows.

## Integration notes

- Missing assets fall back to the current placeholder Graphics, so art can land
  in batches without breaking the game.
- Every third-party asset (fonts included) goes in `CREDITS.md` with its licence.
