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
import type { WorldItem } from '../core/World';
import { tiltAngleRad } from '../core/World';
import { damp, mixColors } from './Juice';

const GLASS_STROKE = 0xd8e6ef;
const GLASS_WALL = 7;
const BOTTLE_BODY = 0x2b3138;

const LABEL_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: 15,
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
    g.clear();

    if (item.kind === 'bottle') {
      const w = item.width;
      const h = item.height;
      const neckW = w * 0.34;
      const neckH = h * 0.3;
      const bodyH = h - neckH;
      const tint = item.ingredientId
        ? colorToNumber(ingredient(item.ingredientId).color)
        : 0x8899aa;

      // Body, shoulder, neck — one silhouette, read at a glance.
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
      this.label.style.fontSize = 12;
    } else {
      const w = item.width;
      const h = item.height;
      // Open-topped tumbler: two walls and a base, so it reads as a glass.
      g.roundRect(-w / 2, -h, GLASS_WALL, h, 3).fill({ color: GLASS_STROKE, alpha: 0.55 });
      g.roundRect(w / 2 - GLASS_WALL, -h, GLASS_WALL, h, 3).fill({
        color: GLASS_STROKE,
        alpha: 0.55,
      });
      g.roundRect(-w / 2, -GLASS_WALL, w, GLASS_WALL, 3).fill({ color: GLASS_STROKE, alpha: 0.55 });

      this.label.position.set(0, 22);
      this.label.style.fontSize = 13;
      this.label.alpha = 0.4;
    }
  }

  /** `tilt` only applies to the held item; everything else stands upright. */
  update(dtSec: number, tilt: number, held: boolean): void {
    const item = this.item;
    this.container.position.set(item.x, item.y);
    this.container.rotation = held ? tiltAngleRad(tilt) : 0;
    this.container.zIndex = held ? 100 : item.kind === 'glass' ? 10 : 1;

    // Sideways travel sloshes the surface. A cheap stand-in for the slosh
    // shader, which lands in the next slice.
    const dx = item.x - this.lastX;
    this.lastX = item.x;
    this.wobble = damp(this.wobble + dx * 0.05, 0, 6, dtSec);
    this.wobblePhase += dtSec * 12;

    const target = fillFraction(item.vessel);
    this.shownFill = damp(this.shownFill, target, FEEL.FILL_EASE * 60, dtSec);

    if (item.kind === 'bottle') this.drawBottleLiquid(tilt, held);
    else this.drawGlassLiquid();
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
      { color: tint, alpha: 0.75 },
    );
  }

  private drawGlassLiquid(): void {
    const item = this.item;
    const v = item.vessel;
    const g = this.liquid;
    const gloss = this.gloss;
    g.clear();
    gloss.clear();

    const innerW = item.width - GLASS_WALL * 2;
    const innerH = item.height - GLASS_WALL;
    const level = Math.max(0, Math.min(1, this.shownFill)) * innerH;
    if (level <= 0.5) return;

    const parts = layers(v);
    if (parts.length === 0) return;

    const totalMl = parts.reduce((sum, p) => sum + p.ml, 0);
    if (totalMl <= 0) return;

    const blended = colorToNumber(blendedColor(v));
    const left = -innerW / 2;
    const bottom = -GLASS_WALL;

    // Heaviest first, drawn from the bottom up. As `mixed` climbs, every band
    // is pulled toward the blended colour until they read as one.
    let y = bottom;
    const drawn = parts.slice(0, 3);
    const drawnMl = drawn.reduce((sum, p) => sum + p.ml, 0);

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
      const px = left + innerW * t;
      const py = surfaceY + Math.sin(this.wobblePhase + t * Math.PI * 2) * amp;
      points.push(px, py);
    }
    points.push(left + innerW, surfaceY + 6, left, surfaceY + 6);
    gloss.poly(points).fill({ color: 0xffffff, alpha: 0.22 });

    // Near the rim, the glass warns you before it overflows.
    if (this.shownFill > 0.9) {
      gloss
        .rect(left, -item.height + GLASS_WALL, innerW, 4)
        .fill({ color: 0xff5c5c, alpha: (this.shownFill - 0.9) * 8 });
    }
  }
}
