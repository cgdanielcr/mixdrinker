/**
 * Painted art (ART.md). Loaded once before the scene is built.
 *
 * Files live in src/assets/art and are imported, not served from public/, so
 * Vite hashes them for Pages and inlines them for the one-file build.
 *
 * Every entry is optional: a texture that fails to load stays null and the
 * renderer falls back to its placeholder Graphics. Art can land piecemeal.
 */
import { Assets, Texture } from 'pixi.js';
import customerBand from '../assets/art/customer_band.jpg';
import counter from '../assets/art/counter.jpg';
import workArea from '../assets/art/work_area.jpg';
import grain from '../assets/art/grain.png';
import recipeCard from '../assets/art/recipe_card.png';
import serveSpot from '../assets/art/serve_spot.png';
import glassRocks from '../assets/art/glass_rocks.png';
import glassCoupe from '../assets/art/glass_coupe.png';
import glassHighball from '../assets/art/glass_highball.png';
import glassShot from '../assets/art/glass_shot.png';
import toolShaker from '../assets/art/tool_shaker.png';
import toolShakerCap from '../assets/art/tool_shaker_cap.png';
import toolMixingGlass from '../assets/art/tool_mixing_glass.png';
import toolJigger from '../assets/art/tool_jigger.png';
import toolBarSpoon from '../assets/art/tool_bar_spoon.png';
import bottleTequilaBlanco from '../assets/art/bottle_tequila_blanco.png';
import bottleGin from '../assets/art/bottle_gin.png';
import bottleTripleSec from '../assets/art/bottle_triple_sec.png';
import bottleDryVermouth from '../assets/art/bottle_dry_vermouth.png';
import bottleLimeJuice from '../assets/art/bottle_lime_juice.png';
import bottleOrangeJuice from '../assets/art/bottle_orange_juice.png';
import bottleSimpleSyrup from '../assets/art/bottle_simple_syrup.png';
import bottleGrenadine from '../assets/art/bottle_grenadine.png';
import bottleSoda from '../assets/art/bottle_soda.png';
import bottleCola from '../assets/art/bottle_cola.png';

const SOURCES = {
  customerBand,
  counter,
  workArea,
  grain,
  recipeCard,
  serveSpot,
  glassRocks,
  glassCoupe,
  glassHighball,
  glassShot,
  toolShaker,
  toolShakerCap,
  toolMixingGlass,
  toolJigger,
  toolBarSpoon,
  bottle_tequila_blanco: bottleTequilaBlanco,
  bottle_gin: bottleGin,
  bottle_triple_sec: bottleTripleSec,
  bottle_dry_vermouth: bottleDryVermouth,
  bottle_lime_juice: bottleLimeJuice,
  bottle_orange_juice: bottleOrangeJuice,
  bottle_simple_syrup: bottleSimpleSyrup,
  bottle_grenadine: bottleGrenadine,
  bottle_soda: bottleSoda,
  bottle_cola: bottleCola,
} as const;

export type ArtKey = keyof typeof SOURCES;

/** Ink on paper: text and strokes that sit on the cream work band. */
export const INK = 0x1d1a17;

/**
 * Where liquid sits inside a painted vessel (ART_GLASSES.md), measured by hand
 * from the art. Fractions of the vessel sprite, 0 = top / left edge.
 */
export interface VesselArt {
  /** Share of the item's height the vessel sprite takes; the rest is for a cap. */
  bodyH?: number;
  /** A lid drawn over the body's rim. Width as a share of the item's width. */
  cap?: { key: ArtKey; width: number; overlapPx: number };
  /** Stands in the vessel; swirls while stirring. Display size in px. */
  spoon?: { key: ArtKey; width: number; height: number };
  /**
   * Opaque metal: no see-through walls, so the liquid shows as its surface in
   * the top opening instead. Ellipse centre and radii as sprite fractions.
   */
  opening?: { cy: number; rx: number; ry: number };
  key: ArtKey;
  /** Inner floor: where the liquid starts. Below it is solid base. */
  floor: number;
  /** Where the liquid stops: just under the rim's near edge. */
  rim: number;
  /** Width of the liquid block. Wider than the cavity is fine; the walls cover it. */
  innerW: number;
}

/** Keyed by glass type, or by vessel kind for tools. */
export const VESSEL_ART: Readonly<Record<string, VesselArt>> = {
  rocks: { key: 'glassRocks', floor: 0.794, rim: 0.134, innerW: 0.66 },
  // The bowl's curve comes from the silhouette mask; floor is the bowl's bottom.
  coupe: { key: 'glassCoupe', floor: 0.418, rim: 0.165, innerW: 0.9 },
  highball: { key: 'glassHighball', floor: 0.782, rim: 0.08, innerW: 0.66 },
  shot: { key: 'glassShot', floor: 0.703, rim: 0.176, innerW: 0.66 },
  mixing_glass: {
    key: 'toolMixingGlass',
    floor: 0.729,
    rim: 0.101,
    innerW: 0.66,
    spoon: { key: 'toolBarSpoon', width: 23, height: 170 },
  },
  shaker: {
    key: 'toolShaker',
    floor: 0.803,
    rim: 0.108,
    innerW: 0.66,
    bodyH: 0.786,
    cap: { key: 'toolShakerCap', width: 1.03, overlapPx: 14 },
  },
  jigger: {
    key: 'toolJigger',
    floor: 0.54,
    rim: 0.1,
    innerW: 0.8,
    opening: { cy: 0.063, rx: 0.443, ry: 0.037 },
  },
};

/** Below this alpha a pixel counts as empty when tracing a glass's outline. */
const EMPTY_ALPHA = 40;

const loaded: Partial<Record<ArtKey, Texture>> = {};
const silhouettes: Partial<Record<ArtKey, Texture>> = {};

export async function loadArt(): Promise<void> {
  await Promise.all(
    (Object.keys(SOURCES) as ArtKey[]).map(async (key) => {
      try {
        loaded[key] = await Assets.load<Texture>(SOURCES[key]);
      } catch (err) {
        console.warn(`art: ${key} failed to load, using placeholder`, err);
      }
    }),
  );
  for (const spec of Object.values(VESSEL_ART)) {
    if (spec.opening) continue;
    const texture = loaded[spec.key];
    const mask = texture ? silhouetteOf(texture, spec) : null;
    if (mask) silhouettes[spec.key] = mask;
  }
}

/**
 * The glass's outer silhouette as a white mask: every pixel the outside can't
 * reach through empty space. Computed rather than painted, so it matches the
 * art by construction. Null if the outline leaks (ART_GLASSES.md rule 3).
 */
function silhouetteOf(texture: Texture, spec: VesselArt): Texture | null {
  const w = texture.source.pixelWidth;
  const h = texture.source.pixelHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(texture.source.resource as CanvasImageSource, 0, 0);
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  // Flood the outside in from the border through empty pixels.
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const reach = (i: number): void => {
    if (outside[i] || (px[i * 4 + 3] ?? 0) >= EMPTY_ALPHA) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    reach(x);
    reach((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    reach(y * w);
    reach(y * w + w - 1);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    if (x > 0) reach(i - 1);
    if (x < w - 1) reach(i + 1);
    if (i >= w) reach(i - w);
    if (i < w * (h - 1)) reach(i + w);
  }

  // A gap in the outline lets the flood into the cavity, and the drink would
  // vanish. Better to fall back to an unclipped block than to lose it.
  const probe = Math.floor(((spec.floor + spec.rim) / 2) * h) * w + Math.floor(w / 2);
  if (outside[probe]) {
    console.warn(`art: ${spec.key} outline is not closed; liquid will not be clipped`);
    return null;
  }

  for (let i = 0; i < w * h; i++) {
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
    px[i * 4 + 3] = outside[i] ? 0 : 255;
  }
  ctx.putImageData(image, 0, 0);
  return Texture.from(canvas);
}

export function silhouette(key: ArtKey): Texture | null {
  return silhouettes[key] ?? null;
}

/** Painted bottle for an ingredient, if there is one. */
export function bottleArt(ingredientId: string): Texture | null {
  const key = `bottle_${ingredientId}`;
  return key in SOURCES ? art(key as ArtKey) : null;
}

export function art(key: ArtKey): Texture | null {
  return loaded[key] ?? null;
}
