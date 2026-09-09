/**
 * Juice: particles and easing helpers (HANDOVER.md §9).
 * Render-only. Nothing here decides anything about the game.
 */
import { Graphics } from 'pixi.js';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  color: number;
}

const GRAVITY = 2400;

export class Particles {
  readonly view = new Graphics();
  private readonly items: Particle[] = [];
  private readonly max: number;

  constructor(max = 220) {
    this.max = max;
  }

  /** A splash where the stream lands. `strength` scales with flow rate. */
  splash(x: number, y: number, strength: number, color: number): void {
    const count = Math.min(4, 1 + Math.floor(strength * 3));
    for (let i = 0; i < count; i++) {
      if (this.items.length >= this.max) break;
      // Render-side jitter only; sim randomness must be seeded (§8).
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const speed = 120 + Math.random() * 260 * strength;
      this.items.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3.5,
        life: 0.25 + Math.random() * 0.35,
        maxLife: 0.6,
        color,
      });
    }
  }

  update(dtSec: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i]!;
      p.life -= dtSec;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      p.vy += GRAVITY * dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
    }
  }

  draw(): void {
    const g = this.view;
    g.clear();
    for (const p of this.items) {
      const alpha = Math.min(1, p.life / p.maxLife);
      g.circle(p.x, p.y, p.radius).fill({ color: p.color, alpha: alpha * 0.85 });
    }
  }

  get count(): number {
    return this.items.length;
  }
}

/** Overshoot on arrival — the drop half of §9's anticipation/overshoot rule. */
export function easeOutBack(t: number, overshoot = 1.7): number {
  const c = overshoot + 1;
  const p = t - 1;
  return 1 + c * p * p * p + overshoot * p * p;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dtSec: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dtSec));
}

export function mixColors(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}
