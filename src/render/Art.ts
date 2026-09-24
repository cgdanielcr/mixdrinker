/**
 * Painted art (ART.md). Loaded once before the scene is built.
 *
 * Files live in src/assets/art and are imported, not served from public/, so
 * Vite hashes them for Pages and inlines them for the one-file build.
 *
 * Every entry is optional: a texture that fails to load stays null and the
 * renderer falls back to its placeholder Graphics. Art can land piecemeal.
 */
import { Assets, type Texture } from 'pixi.js';
import customerBand from '../assets/art/customer_band.jpg';
import counter from '../assets/art/counter.jpg';
import workArea from '../assets/art/work_area.jpg';
import grain from '../assets/art/grain.png';
import recipeCard from '../assets/art/recipe_card.png';
import serveSpot from '../assets/art/serve_spot.png';

const SOURCES = {
  customerBand,
  counter,
  workArea,
  grain,
  recipeCard,
  serveSpot,
} as const;

export type ArtKey = keyof typeof SOURCES;

/** Ink on paper: text and strokes that sit on the cream work band. */
export const INK = 0x1d1a17;

const loaded: Partial<Record<ArtKey, Texture>> = {};

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
}

export function art(key: ArtKey): Texture | null {
  return loaded[key] ?? null;
}
