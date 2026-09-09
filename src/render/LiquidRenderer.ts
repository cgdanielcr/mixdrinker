/**
 * The stream, the impact and the mess (HANDOVER.md §7, steps 3-5).
 * Glass fill lives in ItemSprites; this is everything between the bottle
 * mouth and the surface.
 */
import { Container, Graphics } from 'pixi.js';
import { POUR } from '../tuning';
import { blendedColor, colorToNumber } from '../sim/liquid/Vessel';
import { ingredient } from '../sim/data';
import type { World } from '../core/World';
import { bottleMouth, heldItem, itemById } from '../core/World';
import { Particles } from './Juice';

export class LiquidRenderer {
  readonly container = new Container();
  private readonly stream = new Graphics();
  private readonly puddles = new Graphics();
  private readonly particles = new Particles();
  private scroll = 0;

  constructor() {
    // Puddles sit under everything; the stream and splash sit over the glass.
    this.container.addChild(this.puddles, this.stream, this.particles.view);
  }

  update(world: World, dtSec: number): void {
    this.scroll = (this.scroll + dtSec * 6) % 1;
    this.drawPuddles(world);
    this.drawStream(world, dtSec);
    this.particles.update(dtSec);
    this.particles.draw();
  }

  private streamColor(world: World): number {
    const held = heldItem(world);
    if (!held) return 0xaac4d4;
    if (held.ingredientId) return colorToNumber(ingredient(held.ingredientId).color);
    return colorToNumber(blendedColor(held.vessel));
  }

  private drawStream(world: World, dtSec: number): void {
    const g = this.stream;
    g.clear();

    const held = heldItem(world);
    if (!held || world.flow <= 0 || !world.impact) return;

    const mouth = bottleMouth(held, world.tilt);
    const impact = world.impact;
    const color = this.streamColor(world);

    // Width tracks flow: a dribble is a thread, a full tilt is a rope.
    const flowNorm = Math.min(1, world.flow / POUR.MAX_FLOW_ML_PER_SEC);
    const topWidth = 3 + flowNorm * 9;
    const bottomWidth = topWidth * 0.72;

    const steps = 14;
    const leftEdge: number[] = [];
    const rightEdge: number[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = mouth.y + (impact.y - mouth.y) * t;
      // Matches World.streamXAt: the arc the sim is actually using to aim.
      const x = mouth.x + (impact.x - mouth.x) * Math.sqrt(t);
      const halfWidth = (topWidth + (bottomWidth - topWidth) * t) / 2;
      leftEdge.push(x - halfWidth, y);
      rightEdge.unshift(x + halfWidth, y);
    }

    g.poly([...leftEdge, ...rightEdge]).fill({ color, alpha: 0.9 });

    // Scrolling highlights so the stream reads as moving, not as a static quad.
    for (let i = 0; i < 3; i++) {
      const t = (this.scroll + i / 3) % 1;
      const y = mouth.y + (impact.y - mouth.y) * t;
      const x = mouth.x + (impact.x - mouth.x) * Math.sqrt(t);
      const halfWidth = (topWidth + (bottomWidth - topWidth) * t) / 2;
      g.ellipse(x, y, halfWidth * 0.5, 7).fill({ color: 0xffffff, alpha: 0.18 });
    }

    // Glug at the bottle mouth, splash at the impact.
    g.circle(mouth.x, mouth.y, topWidth * 0.8).fill({ color, alpha: 0.75 });

    const target = itemById(world, world.pourTargetId);
    if (world.missing) {
      // A miss splatters flat and wide, and reads as wrong immediately.
      g.ellipse(impact.x, impact.y, 26 + flowNorm * 22, 7).fill({ color, alpha: 0.4 });
    } else if (target) {
      g.ellipse(impact.x, impact.y, 12 + flowNorm * 10, 5).fill({ color: 0xffffff, alpha: 0.3 });
    }

    if (dtSec > 0) this.particles.splash(impact.x, impact.y, flowNorm, color);
  }

  private drawPuddles(world: World): void {
    const g = this.puddles;
    g.clear();
    for (const puddle of world.puddles) {
      const radius = Math.min(90, 12 + Math.sqrt(puddle.ml) * 7);
      g.ellipse(puddle.x, puddle.y, radius, radius * 0.28).fill({
        color: 0x6d5b3f,
        alpha: Math.min(0.55, 0.18 + puddle.ml / 160),
      });
      g.ellipse(puddle.x, puddle.y - 2, radius * 0.6, radius * 0.16).fill({
        color: 0xffffff,
        alpha: 0.08,
      });
    }
  }

  get particleCount(): number {
    return this.particles.count;
  }
}
