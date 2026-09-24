# ART_GLASSES.md — Glassware and tools

Replaces the three-layer (`_back` / `_front` / `_mask`) plan in `ART.md` §2.
Three separate drawings of the same glass never line up to the pixel, so each
vessel is now **one image**. I derive everything else from it.

## How the game uses your image

```
  1. liquid (code)      a flat-topped block of colour, rising as you pour
  2. clipped to         the glass's outer silhouette  ← I compute this from your image
  3. your glass on top  walls, rim and base cover the liquid's edges;
                        the empty inside lets the liquid show through
```

So the image is **the finished, empty glass, drawn with a see-through inside**.
The liquid appears through the empty middle, and your walls, rim and base hide
its edges. Ice, garnish, salt rims and the liquid itself are all drawn by code.

---

## Hard rules — an image that breaks one of these won't work

1. **Real transparency.** Background alpha = 0. No black fill, no white fill,
   no painted checkerboard.
2. **Inside of the glass is empty.** Alpha = 0 wherever liquid should show.
   No liquid, no ice, no tint or haze across the inside. Haze would sit on top
   of every drink and wash out its colour.
3. **Closed outline.** The outer edge of the glass is one continuous, fully
   opaque line. No gaps, no broken or distressed spots along the *outer* edge.
   I compute the liquid's clip shape by filling everything inside that outline;
   a gap makes it leak out to the whole image.
4. **One glass per file.** No text, no labels, no filenames written in the
   image, no second copy.
5. **No shadow, no table, no reflection** under the glass. The bottom of the
   glass is the bottom of the drawing.
6. **Symmetric, upright, facing front.** Left half mirrors right half (small
   highlight differences are fine). No spout, no handle, no lean.

## Drawing guidance

- **View:** straight on with a slight top-down angle, so the rim reads as an
  ellipse. Rim ellipse height ≈ **10–12 % of the glass width**, the same for every
  vessel so they look like one set.
- **Flat bottom.** The base's lowest edge is a horizontal line; the glass sits
  on the shelf there.
- **Thin walls.** The less wall, the more drink you see. Side walls **≤ 8 %** of
  the glass width each. A heavy base is fine (rocks, mixing glass), up to
  **15 %** of the height.
- **Highlights inside the glass:** allowed, but keep them as a few thin,
  opaque streaks near the walls, covering **under 10 %** of the inside. They
  draw over the liquid.
- **Line weight:** outline ≈ **3 px at display size**, i.e. ~12 px at the 4×
  delivery size below. Same weight on every vessel.
- **Light from the upper left** on every vessel.
- **Palette:** ink-black outline, cream highlights, halftone/grain on the walls
  only (not the empty inside). Metal tools use cool grey walls with crisp
  highlights so they read as steel next to the glasses.
- **Exception: opaque metal is allowed.** The jigger was delivered solid, as
  real jiggers are. The game then shows the drink as its surface inside the
  top opening, growing as it fills. That works for small cups you look down
  into; a tall opaque vessel would hide its level, so keep glass-bodied ones
  see-through.

## Size and format

- **PNG-32, transparent.** Deliver at **4× display size** (table below).
  Bigger is fine if the proportions hold; I scale down.
- **Proportions matter** more than pixel size. Stay within **±10 %** of the
  listed aspect ratio. If a glass wants different proportions, that's OK; say
  so and I'll resize its hit box to match.
- **Padding:** about 4 % empty space on every side.
- **Files:** drop them in `art/` with these names (flat, no subfolders).

## The vessels

| File | Display size | Deliver at (4×) | Aspect w:h | Notes |
|---|---|---|---|---|
| `glass_rocks.png` | 100×116 | 400×464 | 0.86 | Short tumbler, heavy base. |
| `glass_coupe.png` | 126×112 | 504×448 | 1.13 | Shallow wide bowl, thin stem, round foot. Liquid fills the bowl only. |
| `glass_highball.png` | 84×178 | 336×712 | 0.47 | Tall and straight, thin base. |
| `glass_shot.png` | 50×60 | 200×240 | 0.83 | Low priority, not yet on the bar. |
| `tool_shaker.png` | 92×153 | 368×612 | 0.60 | Shaker **body only**, open top, slight taper toward the base. |
| `tool_shaker_cap.png` | 98×43 | 392×172 | 2.28 | The cap on its own: a short, slightly wider lid that fits over the body's rim. Opaque (no liquid shows in it). |
| `tool_mixing_glass.png` | 104×150 | 416×600 | 0.69 | Heavy straight-sided glass, thick base, **no spout**, no spoon in it. |
| `tool_bar_spoon.png` | 20×170 | 80×680 | 0.12 | Long twisted handle, small bowl at the bottom. Opaque, single sprite. |
| `tool_jigger.png` | 84×80 | 336×320 | 1.05 | Double cone, joined at a narrow waist. Only the **top cup** holds liquid. Cone ratio ~ top 55 % / bottom 45 % of the height. |

## What I do with each file

- Crop to content, scale to display size ×2 for sharpness.
- Build the clip shape by filling the closed outline.
- Measure two lines by hand per vessel: the **inner floor** (where the liquid
  starts: top of a heavy base, bottom of the coupe bowl, jigger waist) and the
  **rim**. Liquid fills between them. You don't need to mark these.
- Check each file for: transparent background, empty inside, closed outline.
  Anything that fails, I'll tell you what and where.

## Order

1. `glass_rocks.png` — first, alone. I wire it up and send a screenshot with a
   drink in it before you draw the rest.
2. Coupe, highball, mixing glass.
3. Shaker body + cap, jigger, bar spoon.
4. Shot glass.

The middle panel of the earlier `glassrocks.png` ("front") already looks close to
this spec. Re-exported alone, without the filename text, it may just work.
