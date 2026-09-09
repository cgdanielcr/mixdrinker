/**
 * The bar: three bands, the items on it, and the hand (HANDOVER.md §3).
 * Reads world state. Never writes it.
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { LAYOUT } from '../tuning';
import type { World } from '../core/World';
import { ItemView } from './ItemSprites';
import { LiquidRenderer } from './LiquidRenderer';
import { Hand } from './Hand';

const CUSTOMER_BG = 0x141a20;
const COUNTER_BG = 0x3d2b1c;
const COUNTER_EDGE = 0x533a25;
const WORK_BG = 0x1b2229;

export class BarScene {
  readonly stage = new Container();
  private readonly items = new Container();
  private readonly views = new Map<string, ItemView>();
  private readonly liquids = new LiquidRenderer();
  private readonly hand = new Hand();

  constructor(world: World) {
    const bands = new Graphics();
    this.drawBands(bands);

    this.items.sortableChildren = true;
    for (const item of world.items) {
      const view = new ItemView(item);
      this.views.set(item.id, view);
      this.items.addChild(view.container);
    }

    this.stage.addChild(bands, this.liquids.container, this.items, this.hand.view);
    this.stage.addChild(this.bandLabels());
  }

  private drawBands(g: Graphics): void {
    const w = LAYOUT.WIDTH;
    const h = LAYOUT.HEIGHT;
    const customerH = h * LAYOUT.BAND_CUSTOMER;
    const counterH = h * LAYOUT.BAND_COUNTER;

    g.rect(0, 0, w, customerH).fill({ color: CUSTOMER_BG });
    g.rect(0, customerH, w, counterH).fill({ color: COUNTER_BG });
    g.rect(0, customerH + counterH, w, h - customerH - counterH).fill({ color: WORK_BG });

    // The counter lip: the line the player pours across.
    g.rect(0, customerH + counterH - 10, w, 10).fill({ color: COUNTER_EDGE });
    g.rect(0, customerH, w, 4).fill({ color: 0x000000, alpha: 0.35 });
  }

  private bandLabels(): Container {
    const style = new TextStyle({
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: 16,
      fill: 0xffffff,
      letterSpacing: 3,
    });
    const box = new Container();
    const entries: [string, number][] = [
      ['CUSTOMER BAND — PHASE 2', 24],
      ['COUNTER', LAYOUT.HEIGHT * LAYOUT.BAND_CUSTOMER + 16],
      ['WORK', LAYOUT.HEIGHT * (LAYOUT.BAND_CUSTOMER + LAYOUT.BAND_COUNTER) + 16],
    ];
    for (const [text, y] of entries) {
      const label = new Text({ text, style });
      label.position.set(24, y);
      label.alpha = 0.18;
      box.addChild(label);
    }
    return box;
  }

  update(world: World, dtSec: number): void {
    for (const item of world.items) {
      const view = this.views.get(item.id);
      if (!view) continue;
      const held = world.heldId === item.id;
      view.update(dtSec, held ? world.tilt : 0, held);
    }
    this.liquids.update(world, dtSec);
    this.hand.update(world, dtSec);
  }

  get particleCount(): number {
    return this.liquids.particleCount;
  }
}
