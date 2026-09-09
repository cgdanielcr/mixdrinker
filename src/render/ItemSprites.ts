/**
 * Placeholder art: flat shapes with readable silhouettes (HANDOVER.md §14).
 * Bottles are told apart by colour and label text. No time spent on art.
 *
 * Reads world state, never writes it.
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { FEEL } from '../tuning';
import { blendedColor, colorToNumber, fillFraction, layers, liquidMl } from '../sim/liquid/Vessel';
import { ingredient } from '../sim/data';
import type { World, WorldItem } from '../core/World';
import { tiltAngleRad } from '../core/World';
import { damp, mixColors } from './Juice';

const GLASS_STROKE = 0xd8e6ef;
const GLASS_WALL = 7;
const BOTTLE_BODY = 0x2b3138;
const METAL = 0x9aa8b4;
const HIGHLIGHT = 0x7fd4a0;

const LABEL_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: 13,
  fontWeight: '700',
  fill: 0xf2f5f7,
  letterSpacing: 1,
});

export class ItemView {
  readonly container = new Container();
  private readonly body = new Graphics();
  private readonly liquid = new Graphics();
  private readonly gloss = new Graphics();
  private readonly label: Text;
  private readonly item: WorldItem;

  /** Visible fill chases the true volume so liquid never teleports (§9). */
  private shownFill = 0;
  private wobble = 0;
  private wobblePhase = 0;
  private lastX = 0;
  private highlight = 0;

  constructor(item: WorldItem) {
    this.item = item;
    this.lastX = item.x;

    this.label = new Text({ text: item.label, style: LABEL_STYLE });
    this.label.anchor.set(0.5);

    this.container.addChild(this.body, this.liquid, this.gloss, this.label);
    this.drawStatic();
  }

  private drawStatic(): void {
    const item = this.item;
    const g = this.body;
    const w = item.width;
    const h = item.height;
    g.clear();

    switch (item.kind) {
      case 'bottle': {
        const neckW = w * 0.34;
        const neckH = h * 0.3;
        const bodyH = h - neckH;
        const tint = item.ingredientId
          ? colorToNumber(ingredient(item.ingredientId).color)
          : 0x8899aa;

        g.roundRect(-w / 2, -bodyH, w, bodyH, 10).fill({ color: BOTTLE_BODY });
        g.poly([
          -w / 2,
          -bodyH,
          w / 2,
          -bodyH,
          neckW / 2,
          -bodyH - neckH * 0.45,
          -neckW / 2,
          -bodyH - neckH * 0.45,
        ]).fill({ color: BOTTLE_BODY });
        g.roundRect(-neckW / 2, -h, neckW, neckH * 0.6, 4).fill({ color: BOTTLE_BODY });
        // Colour band so the shelf reads as ten distinct bottles.
        g.roundRect(-w / 2 + 4, -bodyH * 0.62, w - 8, bodyH * 0.3, 5).fill({ color: tint });

        this.label.position.set(0, -bodyH * 0.24);
        this.label.style.fontSize = 11;
        break;
      }

      case 'shaker': {
        // A tin: tapered body with a cap, so it never reads as a glass.
        const capH = h * 0.22;
        g.poly([-w / 2, -h + capH, w / 2, -h + capH, w / 2 - 7, 0, -w / 2 + 7, 0]).fill({
          color: METAL,
        });
        g.roundRect(-w / 2 - 3, -h, w + 6, capH, 5).fill({ color: 0xb7c4ce });
        g.rect(-w / 2 + 8, -h + capH + 10, w - 16, 4).fill({ color: 0x7d8b97, alpha: 0.6 });
        this.label.position.set(0, 20);
        this.label.style.fontSize = 12;
        this.label.alpha = 0.45;
        break;
      }

      case 'jigger': {
        // Two cones back to back — the classic double jigger silhouette.
        g.poly([-w / 2, -h, w / 2, -h, w / 2 - 16, -h * 0.42, -w / 2 + 16, -h * 0.42]).fill({
          color: METAL,
        });
        g.poly([-w / 2 + 16, -h * 0.42, w / 2 - 16, -h * 0.42, w / 2 - 22, 0, -w / 2 + 22, 0]).fill(
          {
            color: 0x7d8b97,
          },
        );
        this.label.position.set(0, 20);
        this.label.style.fontSize = 12;
        this.label.alpha = 0.45;
        break;
      }

      case 'station':
        this.drawStation(g);
        break;

      case 'seat': {
        // The bit of counter a drink gets set down on. Deliberately faint:
        // the customer above it is the thing to look at, not the rectangle.
        g.roundRect(-w / 2, -h, w, h, 6).fill({ color: 0xffffff, alpha: 0.05 });
        g.roundRect(-w / 2, -h, w, h, 6).stroke({ width: 2, color: 0xffffff, alpha: 0.12 });
        this.label.position.set(0, 18);
        this.label.style.fontSize = 11;
        this.label.alpha = 0.25;
        break;
      }

      default: {
        // Open-topped tumbler: two walls and a base, so it reads as a glass.
        g.roundRect(-w / 2, -h, GLASS_WALL, h, 3).fill({ color: GLASS_STROKE, alpha: 0.55 });
        g.roundRect(w / 2 - GLASS_WALL, -h, GLASS_WALL, h, 3).fill({
          color: GLASS_STROKE,
          alpha: 0.55,
        });
        g.roundRect(-w / 2, -GLASS_WALL, w, GLASS_WALL, 3).fill({
          color: GLASS_STROKE,
          alpha: 0.55,
        });
        this.label.position.set(0, 22);
        this.label.style.fontSize = 12;
        this.label.alpha = 0.4;
      }
    }
  }

  private drawStation(g: Graphics): void {
    const item = this.item;
    const w = item.width;
    const h = item.height;

    switch (item.station) {
      case 'ice':
        g.roundRect(-w / 2, -h, w, h, 8).fill({ color: 0x35424d });
        g.roundRect(-w / 2 + 7, -h + 7, w - 14, h - 16, 6).fill({ color: 0x0f1519 });
        // A few cubes heaped in the bucket.
        for (const [cx, cy] of [
          [-24, -34],
          [0, -46],
          [24, -32],
          [-10, -18],
          [16, -16],
        ] as const) {
          g.roundRect(cx - 12, cy - 12, 24, 24, 4).fill({ color: 0xcfe8f5, alpha: 0.85 });
        }
        break;

      case 'salt':
        g.roundRect(-w / 2, -h, w, h, 6).fill({ color: 0xe9eef2 });
        g.roundRect(-w / 2 + 5, -h + 5, w - 10, h - 10, 4).fill({ color: 0xfbfdff });
        break;

      case 'garnish':
        g.roundRect(-w / 2, -h, w, h, 6).fill({ color: 0x35424d });
        for (const cx of [-32, 0, 32]) {
          g.circle(cx, -h + 16, 15).fill({ color: 0x9bd44a });
          g.circle(cx, -h + 16, 8).fill({ color: 0xd6ef9a });
        }
        break;

      case 'sink':
        g.roundRect(-w / 2, -h, w, h, 7).fill({ color: 0x2a343d });
        g.roundRect(-w / 2 + 8, -h + 8, w - 16, h - 14, 5).fill({ color: 0x11171b });
        g.circle(0, -h * 0.4, 9).fill({ color: 0x3d4a55 });
        break;

      case 'book':
        g.roundRect(-w / 2, -h, w, h, 5).fill({ color: 0x7d3b2e });
        g.roundRect(-w / 2 + 9, -h + 9, w - 18, h - 18, 3).fill({ color: 0xc9b391 });
        g.rect(-w / 2 + 4, -h, 7, h).fill({ color: 0x5d2b21 });
        break;
    }

    this.label.position.set(0, 22);
    this.label.style.fontSize = 12;
    this.label.alpha = 0.45;
  }

  update(world: World, dtSec: number): void {
    const item = this.item;
    const held = world.heldId === item.id;
    const tilt = held ? world.tilt : 0;

    this.container.position.set(item.x, item.y);
    this.container.rotation = held ? tiltAngleRad(tilt) : 0;
    this.container.zIndex = held
      ? 100
      : item.kind === 'station' || item.kind === 'seat'
        ? 5
        : item.kind === 'bottle'
          ? 1
          : 10;

    // Highlight a station the held vessel could actually use.
    const wants = world.hoveredTargetId === item.id ? 1 : 0;
    this.highlight = damp(this.highlight, wants, 16, dtSec);

    if (item.kind === 'station' || item.kind === 'seat') {
      this.drawStationOverlay(world);
      return;
    }

    // Sideways travel sloshes the surface. A cheap stand-in for the slosh
    // shader, which lands in the next slice.
    const dx = item.x - this.lastX;
    this.lastX = item.x;
    this.wobble = damp(this.wobble + dx * 0.05, 0, 6, dtSec);
    this.wobblePhase += dtSec * 12;

    this.shownFill = damp(this.shownFill, fillFraction(item.vessel), FEEL.FILL_EASE * 60, dtSec);

    if (item.kind === 'bottle') this.drawBottleLiquid(tilt, held);
    else this.drawVesselLiquid();
  }

  private drawStationOverlay(world: World): void {
    const g = this.gloss;
    const item = this.item;
    g.clear();
    if (this.highlight <= 0.01) return;

    g.roundRect(-item.width / 2 - 6, -item.height - 6, item.width + 12, item.height + 12, 9).stroke(
      {
        width: 3,
        color: HIGHLIGHT,
        alpha: this.highlight * 0.9,
      },
    );

    // The salt plate is a hold, so it shows how far along the rim is.
    if (item.station === 'salt' && world.rimProgress > 0) {
      const w = item.width * world.rimProgress;
      g.roundRect(-item.width / 2, -item.height - 16, w, 6, 3).fill({ color: HIGHLIGHT });
    }
  }

  private drawBottleLiquid(tilt: number, held: boolean): void {
    const item = this.item;
    const g = this.liquid;
    g.clear();
    if (liquidMl(item.vessel) <= 0) return;

    const w = item.width - 12;
    const bodyH = item.height * 0.7 - 10;
    const level = Math.max(0, Math.min(1, this.shownFill)) * bodyH;
    if (level <= 0.5) return;

    // §7.6: the liquid inside keeps its own horizon while the bottle rotates,
    // which is what makes the bottle read as full of something.
    const angle = held ? tiltAngleRad(tilt) : 0;
    const slant = Math.tan(-angle) * (w / 2);
    const clamped = Math.max(-level, Math.min(bodyH - level, slant));
    const tint = item.ingredientId ? colorToNumber(ingredient(item.ingredientId).color) : 0x99aabb;

    g.poly([-w / 2, -6, w / 2, -6, w / 2, -6 - level + clamped, -w / 2, -6 - level - clamped]).fill(
      {
        color: tint,
        alpha: 0.75,
      },
    );
  }

  private drawVesselLiquid(): void {
    const item = this.item;
    const v = item.vessel;
    const g = this.liquid;
    const gloss = this.gloss;
    g.clear();
    gloss.clear();

    const innerW = item.width - GLASS_WALL * 2;
    const innerH = item.height - GLASS_WALL;
    const left = -innerW / 2;
    const bottom = -GLASS_WALL;
    const level = Math.max(0, Math.min(1, this.shownFill)) * innerH;

    const parts = layers(v);
    const drawn = parts.slice(0, 3);
    const drawnMl = drawn.reduce((sum, p) => sum + p.ml, 0);

    if (level > 0.5 && drawnMl > 0) {
      const blended = colorToNumber(blendedColor(v));
      // Heaviest first, drawn from the bottom up. As `mixed` climbs, every band
      // is pulled toward the blended colour until they read as one.
      let y = bottom;
      for (const part of drawn) {
        const bandHeight = (part.ml / drawnMl) * level;
        const color = mixColors(colorToNumber(part.color), blended, v.mixed);
        const alpha = Math.max(0.4, Math.min(0.95, part.opacity + 0.25));
        g.rect(left, y - bandHeight, innerW, bandHeight + 1).fill({ color, alpha });
        y -= bandHeight;
      }

      // Meniscus: a lighter lip at the surface, wobbling with recent movement.
      const surfaceY = bottom - level;
      const amp = Math.min(6, Math.abs(this.wobble) * 40);
      const points: number[] = [];
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        points.push(
          left + innerW * t,
          surfaceY + Math.sin(this.wobblePhase + t * Math.PI * 2) * amp,
        );
      }
      points.push(left + innerW, surfaceY + 6, left, surfaceY + 6);
      gloss.poly(points).fill({ color: 0xffffff, alpha: 0.22 });
    }

    this.drawIce(gloss, innerW, bottom, level);

    // Salt rim: a white crust along the lip.
    if (v.rim) {
      gloss.rect(-item.width / 2 - 4, -item.height - 3, item.width + 8, 8).fill({
        color: v.rim === 'salt' ? 0xf4f8fb : 0xe6cf9a,
        alpha: 0.92,
      });
    }

    // Garnish: a wedge hooked over the rim.
    if (v.garnish.includes('lime_wedge')) {
      const gx = item.width / 2 - 6;
      const gy = -item.height - 6;
      gloss.circle(gx, gy, 14).fill({ color: 0x9bd44a });
      gloss.circle(gx, gy, 7).fill({ color: 0xd6ef9a });
    }

    // Near the rim, the glass warns you before it overflows.
    if (this.shownFill > 0.9) {
      gloss.rect(left, -item.height + GLASS_WALL, innerW, 4).fill({
        color: 0xff5c5c,
        alpha: (this.shownFill - 0.9) * 8,
      });
    }
  }

  /** Cubes stack from the bottom and sit at the surface once there is liquid. */
  private drawIce(g: Graphics, innerW: number, bottom: number, level: number): void {
    const cubes = Math.round(this.item.vessel.ice);
    if (cubes <= 0) return;

    const size = Math.min(26, innerW * 0.34);
    const perRow = Math.max(1, Math.floor(innerW / (size + 3)));
    for (let i = 0; i < Math.min(cubes, 9); i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const x = -innerW / 2 + 3 + col * (size + 3) + ((row % 2) * size) / 2;
      // Float at the surface when there is liquid, otherwise heap on the base.
      const restY = bottom - row * (size * 0.8) - size;
      const floatY = bottom - Math.max(level - size * 0.35, 0) - row * (size * 0.55) - size * 0.4;
      const y = level > size ? floatY : restY;
      g.roundRect(x, y, size, size, 4).fill({ color: 0xdff1fb, alpha: 0.62 });
      g.roundRect(x + 3, y + 3, size * 0.35, size * 0.35, 2).fill({
        color: 0xffffff,
        alpha: 0.45,
      });
    }
  }
}
