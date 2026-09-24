/**
 * Items on the bar. Vessels with painted art (Art.ts, ART_GLASSES.md) draw it
 * over their liquid; everything else is still placeholder Graphics: flat
 * shapes with readable silhouettes (HANDOVER.md §14).
 *
 * Reads world state, never writes it.
 */
import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import { FEEL, ICE, LAYOUT } from '../tuning';
import { blendedColor, colorToNumber, fillFraction, layers, liquidMl } from '../sim/liquid/Vessel';
import { ingredient } from '../sim/data';
import type { World, WorldItem } from '../core/World';
import { tiltAngleRad } from '../core/World';
import { damp, mixColors } from './Juice';
import { art, INK, silhouette, VESSEL_ART, type ArtKey, type VesselArt } from './Art';

/** Items resting below this line sit on the work band's paper, not the dark bar. */
const WORK_TOP = LAYOUT.HEIGHT * (LAYOUT.BAND_CUSTOMER + LAYOUT.BAND_COUNTER);
const GLASS_WALL = 7;
const BOTTLE_BODY = 0x2b3138;
const METAL = 0x9aa8b4;
const HIGHLIGHT = 0x7fd4a0;
/** Warm and loud: it has to beat everything else on the bar for attention. */
const GUIDE_COLOR = 0xffc857;

const GUIDE_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: 18,
  fontWeight: '700',
  fill: 0xffc857,
  stroke: { color: 0x0b0e11, width: 4 },
});

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
  /** Teaching aids drawn over everything: the "touch this" ring and the fill line. */
  private readonly guide = new Graphics();
  private readonly guideLabel: Text;
  private guidePulse = 0;
  private onPaper = false;
  private hasArt = false;
  /** Painted glass: drawn over the liquid, which it clips and frames. */
  private readonly glassArt: VesselArt | null;
  private spoon: Sprite | null = null;
  private spoonRestX = 0;
  private spoonPhase = 0;
  private stir = 0;

  constructor(item: WorldItem) {
    this.item = item;
    this.lastX = item.x;

    // Own copy: labels set their own size and ink, which would leak through a shared style.
    this.label = new Text({ text: item.label, style: LABEL_STYLE.clone() });
    this.label.anchor.set(0.5);

    this.guideLabel = new Text({ text: '', style: GUIDE_STYLE });
    // Under the glass, centred. Beside it, the label ran into the next vessel;
    // above it, the bottle you are pouring from hides it.
    this.guideLabel.anchor.set(0.5, 0);
    this.guideLabel.visible = false;

    const painted = this.paintedSprite();
    if (painted) this.container.addChild(painted);
    const spec =
      item.kind === 'bottle' ? undefined : VESSEL_ART[item.vessel.glassType ?? item.kind];
    const glassTexture = spec ? art(spec.key) : null;
    this.glassArt = spec && glassTexture ? spec : null;
    // Dark ink on the painted paper; the old pale strokes vanish against it.
    this.onPaper = art('workArea') !== null && item.homeY > WORK_TOP;
    // Bottle labels sit on the dark bottle body, not the paper.
    const inkLabel = this.onPaper && item.kind !== 'bottle';
    if (inkLabel) this.label.style.fill = INK;
    this.container.addChild(this.body);
    if (this.glassArt && glassTexture) this.addVesselArt(this.glassArt, glassTexture);
    else this.container.addChild(this.liquid);
    this.container.addChild(this.gloss, this.label, this.guide, this.guideLabel);
    this.drawStatic();
    // Faint white read as a soft glow on the dark bar; faint ink just looks grey.
    if (inkLabel) this.label.alpha = Math.min(0.8, this.label.alpha * 1.8);
  }

  /** Painted sprite for this item, bottom-centre anchored like the Graphics. */
  private paintedSprite(): Sprite | null {
    const key: ArtKey | null =
      this.item.kind === 'seat' ? 'serveSpot' : this.item.station === 'book' ? 'recipeCard' : null;
    const texture = key ? art(key) : null;
    if (!texture) return null;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 1);
    // Fit the hit box's height and keep the painting's proportions.
    const scale = this.item.height / texture.height;
    sprite.scale.set(this.item.kind === 'seat' ? this.item.width / texture.width : scale);
    this.hasArt = true;
    return sprite;
  }

  /**
   * Layer order, back to front: spoon, liquid, glass (which clips the liquid
   * to its silhouette), cap. Opaque tins flip liquid and glass: the drink is
   * drawn into the opening on top.
   */
  private addVesselArt(spec: VesselArt, texture: Texture): void {
    const item = this.item;
    const bodyH = item.height * (spec.bodyH ?? 1);

    const spoonTexture = spec.spoon ? art(spec.spoon.key) : null;
    if (spec.spoon && spoonTexture) {
      const spoon = new Sprite(spoonTexture);
      spoon.anchor.set(0.5, 1);
      spoon.setSize(spec.spoon.width, spec.spoon.height);
      // Resting on the floor, leaning on the far wall.
      spoon.y = -(1 - spec.floor) * bodyH - 2;
      this.spoonRestX = item.width * spec.innerW * 0.22;
      this.spoon = spoon;
      this.container.addChild(spoon);
    }

    const glass = this.fitted(texture, bodyH);
    if (spec.opening) {
      this.container.addChild(glass, this.liquid);
    } else {
      this.container.addChild(this.liquid, glass);
      const mask = silhouette(spec.key);
      if (mask) {
        const maskSprite = this.fitted(mask, bodyH);
        this.container.addChild(maskSprite);
        this.liquid.mask = maskSprite;
      }
    }

    const capTexture = spec.cap ? art(spec.cap.key) : null;
    if (spec.cap && capTexture) {
      const cap = new Sprite(capTexture);
      cap.anchor.set(0.5, 1);
      const width = item.width * spec.cap.width;
      cap.setSize(width, (width * capTexture.height) / capTexture.width);
      cap.y = -bodyH + spec.cap.overlapPx;
      this.container.addChild(cap);
    }
  }

  /** A sprite of this item's width, bottom-centre anchored like the Graphics. */
  private fitted(texture: Texture, height = this.item.height): Sprite {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 1);
    sprite.setSize(this.item.width, height);
    return sprite;
  }

  /** The space liquid fills, in item-local coordinates (y up is negative). */
  private cavity(): { innerW: number; innerH: number; bottom: number } {
    const { width, height } = this.item;
    const spec = this.glassArt;
    if (spec) {
      const spriteH = height * (spec.bodyH ?? 1);
      return {
        innerW: width * spec.innerW,
        innerH: (spec.floor - spec.rim) * spriteH,
        bottom: -(1 - spec.floor) * spriteH,
      };
    }
    return { innerW: width - GLASS_WALL * 2, innerH: height - GLASS_WALL, bottom: -GLASS_WALL };
  }

  private get glassStroke(): number {
    return this.onPaper ? INK : 0xd8e6ef;
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
        if (this.glassArt) {
          this.label.position.set(0, 20);
          this.label.style.fontSize = 12;
          this.label.alpha = 0.45;
          break;
        }
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
        if (this.glassArt) {
          this.label.position.set(0, 20);
          this.label.style.fontSize = 12;
          this.label.alpha = 0.45;
          break;
        }
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
        if (!this.hasArt) {
          g.roundRect(-w / 2, -h, w, h, 6).fill({ color: 0xffffff, alpha: 0.05 });
          g.roundRect(-w / 2, -h, w, h, 6).stroke({ width: 2, color: 0xffffff, alpha: 0.12 });
        }
        this.label.position.set(0, 18);
        this.label.style.fontSize = 11;
        this.label.alpha = 0.25;
        break;
      }

      default: {
        this.label.position.set(0, 22);
        this.label.style.fontSize = 12;
        this.label.alpha = 0.4;
        if (this.glassArt) break;
        // Open-topped tumbler: two walls and a base, so it reads as a glass.
        g.roundRect(-w / 2, -h, GLASS_WALL, h, 3).fill({ color: this.glassStroke, alpha: 0.55 });
        g.roundRect(w / 2 - GLASS_WALL, -h, GLASS_WALL, h, 3).fill({
          color: this.glassStroke,
          alpha: 0.55,
        });
        g.roundRect(-w / 2, -GLASS_WALL, w, GLASS_WALL, 3).fill({
          color: this.glassStroke,
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
        if (this.hasArt) break;
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

    this.animateSpoon(world, held, dtSec);

    // Highlight a station the held vessel could actually use.
    const wants = world.hoveredTargetId === item.id ? 1 : 0;
    this.highlight = damp(this.highlight, wants, 16, dtSec);

    this.drawGuide(world, dtSec);

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

    // Both holds show their progress: salting a rim, and refusing service.
    const progress =
      item.station === 'salt' ? world.rimProgress : item.kind === 'seat' ? world.cutOffProgress : 0;
    if (progress > 0) {
      g.roundRect(-item.width / 2, -item.height - 16, item.width * progress, 6, 3).fill({
        // Refusing someone is not a friendly action; it should not look like one.
        color: item.kind === 'seat' ? 0xd8574b : HIGHLIGHT,
      });
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

  /** The spoon swirls while you stir, and settles back against the wall. */
  private animateSpoon(world: World, held: boolean, dtSec: number): void {
    if (!this.spoon) return;
    const target = held && world.stirring ? world.shakeIntensity : 0;
    this.stir = damp(this.stir, target, 10, dtSec);
    this.spoonPhase += dtSec * (3 + this.stir * 9);
    const swirl = Math.sin(this.spoonPhase) * this.stir;
    const reach = this.cavity().innerW * 0.3;
    this.spoon.x = this.spoonRestX * (1 - this.stir) + swirl * reach;
    this.spoon.rotation = 0.12 * (1 - this.stir) + swirl * 0.15;
  }

  /**
   * Opaque tin: the drink is the surface seen in the top opening. The cup is a
   * cone, so the surface widens and rises as it fills; that is the level cue.
   */
  private drawOpeningLiquid(o: NonNullable<VesselArt['opening']>): void {
    const fill = Math.max(0, Math.min(1, this.shownFill));
    if (fill <= 0.01 || liquidMl(this.item.vessel) <= 0) return;
    const { width, height } = this.item;
    // Linear, not the cone's true cube root: that filled the opening by a
    // quarter full and left nothing to read between 15 and 60 ml.
    const s = 0.3 + 0.7 * fill;
    const rx = o.rx * width * s;
    const ry = o.ry * height * s;
    const cy = -height + o.cy * height + (1 - s) * o.ry * height * 0.8;
    const color = colorToNumber(blendedColor(this.item.vessel));
    this.liquid.ellipse(0, cy, rx, ry).fill({ color, alpha: 0.95 });
    this.gloss.ellipse(-rx * 0.3, cy - ry * 0.3, rx * 0.35, ry * 0.3).fill({
      color: 0xffffff,
      alpha: 0.25,
    });
    if (fill > 0.9) {
      this.gloss.ellipse(0, cy, rx, ry).stroke({
        width: 2.5,
        color: 0xff5c5c,
        alpha: (fill - 0.9) * 8,
      });
    }
  }

  private drawVesselLiquid(): void {
    const item = this.item;
    const v = item.vessel;
    const g = this.liquid;
    const gloss = this.gloss;
    g.clear();
    gloss.clear();
    if (this.glassArt?.opening) {
      this.drawOpeningLiquid(this.glassArt.opening);
      return;
    }

    const { innerW, innerH, bottom } = this.cavity();
    const left = -innerW / 2;
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
      // On the liquid layer, so the glass's silhouette clips it and its walls
      // cover it: drawn on top, the line ran across a coupe's walls.
      g.poly(points).fill({ color: 0xffffff, alpha: 0.22 });
      // Clear spirits vanish against the cream paper. An inked surface line
      // keeps the fill level readable, which is the thing you are pouring to.
      if (this.onPaper) {
        g.poly(points.slice(0, (steps + 1) * 2), false).stroke({
          width: 2.5,
          color: INK,
          alpha: 0.6,
        });
      }
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
      gloss.rect(left, bottom - innerH, innerW, 4).fill({
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
  /**
   * The tutorial's two aids. A ring that breathes around the one thing to touch
   * next, and a fill line on the glass: "pour about half a second" produced a
   * Margarita scoring 57 when followed faithfully, "pour to the line" does not.
   */
  private drawGuide(world: World, dtSec: number): void {
    const g = this.guide;
    const item = this.item;
    g.clear();
    this.guideLabel.visible = false;

    const pointed = world.guide.highlightId === item.id;
    const target = world.guide.target?.vesselId === item.id ? world.guide.target : null;
    if (!pointed && !target) return;

    this.guidePulse += dtSec * 4;

    if (pointed) {
      const breathe = 0.5 + 0.5 * Math.sin(this.guidePulse);
      const pad = 12 + breathe * 6;
      g.roundRect(
        -item.width / 2 - pad,
        -item.height - pad,
        item.width + pad * 2,
        item.height + pad * 2,
        14,
      ).stroke({
        width: 4,
        color: GUIDE_COLOR,
        alpha: 0.45 + breathe * 0.5,
      });
    }

    if (target) {
      const v = item.vessel;
      const { innerW, innerH, bottom } = this.cavity();
      // Ice takes up room in the glass, so the line sits where the surface will be.
      const occupied = target.totalMl + v.ice * ICE.CUBE_ML;
      const level = Math.min(1, occupied / v.capacityMl) * innerH;
      const y = bottom - level;

      // Dashed, so it reads as a guide and never as liquid.
      for (let x = -innerW / 2 - 8; x < innerW / 2 + 8; x += 14) {
        g.rect(x, y - 2, 8, 4).fill({ color: GUIDE_COLOR, alpha: 0.95 });
      }
      g.poly([innerW / 2 + 10, y, innerW / 2 + 22, y - 8, innerW / 2 + 22, y + 8]).fill({
        color: GUIDE_COLOR,
      });

      const now = Math.round(Object.values(v.contents).reduce((a, b) => a + b, 0));
      this.guideLabel.text = `${target.label} to the line: ${now} / ${target.totalMl} ml`;
      this.guideLabel.position.set(0, 40);
      this.guideLabel.visible = true;
    }
  }
}
