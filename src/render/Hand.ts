/**
 * The cursor is the bartender's hand (HANDOVER.md §3).
 * It lags the pointer and leans in the direction of travel (§9).
 */
import { Container, Graphics } from 'pixi.js';
import { FEEL } from '../tuning';
import type { World } from '../core/World';
import { damp } from './Juice';

export class Hand {
  readonly view = new Container();
  private readonly graphic = new Graphics();
  private x = 0;
  private y = 0;
  private lean = 0;

  constructor() {
    this.view.addChild(this.graphic);
    this.view.zIndex = 200;
  }

  update(world: World, dtSec: number): void {
    const { x: targetX, y: targetY } = world.cursor;

    const previousX = this.x;
    this.x = damp(this.x, targetX, 26, dtSec);
    this.y = damp(this.y, targetY, 26, dtSec);

    // Lean toward travel, clamped, so fast moves read as momentum.
    const speed = dtSec > 0 ? (this.x - previousX) / dtSec : 0;
    const targetLean = clamp(
      speed * 0.0006 * FEEL.HAND_LEAN_PER_SPEED * 60,
      -FEEL.HAND_LEAN_MAX_DEG,
      FEEL.HAND_LEAN_MAX_DEG,
    );
    this.lean = damp(this.lean, targetLean, 14, dtSec);

    this.view.position.set(this.x, this.y);
    this.view.rotation = (this.lean * Math.PI) / 180;

    const holding = world.heldId !== null;
    const g = this.graphic;
    g.clear();

    if (holding) {
      // A closed fist behind whatever is being held.
      g.roundRect(-17, -14, 34, 30, 12).fill({ color: 0xd6a97f, alpha: 0.95 });
      g.roundRect(-6, 12, 12, 22, 6).fill({ color: 0xc2966e, alpha: 0.9 });
    } else {
      // An open hand, plus a ring showing what the pointer will grab.
      g.circle(0, 0, 15).fill({ color: 0xd6a97f, alpha: 0.9 });
      g.circle(0, 0, 24).stroke({ width: 2, color: 0xffffff, alpha: 0.22 });
      g.roundRect(-5, 12, 10, 20, 5).fill({ color: 0xc2966e, alpha: 0.85 });
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}
