/**
 * The bar: three bands, the items on it, and the hand (HANDOVER.md §3).
 * Reads world state. Never writes it.
 */
import { Container, Graphics, Sprite, Text, TextStyle, TilingSprite } from 'pixi.js';
import { LAYOUT, SHAKE } from '../tuning';
import type { World } from '../core/World';
import type { NightState } from '../core/Night';
import { ItemView } from './ItemSprites';
import { LiquidRenderer } from './LiquidRenderer';
import { Hand } from './Hand';
import { CustomerLayer } from './CustomerSprites';
import { damp } from './Juice';
import { art, INK, type ArtKey } from './Art';

const CUSTOMER_BG = 0x141a20;
const COUNTER_BG = 0x3d2b1c;
const COUNTER_EDGE = 0x533a25;
const WORK_BG = 0x1b2229;
/** Beyond the stage edge, so screen shake never shows a seam. */
const BLEED = 40;

export class BarScene {
  /** Outer container; the inner one is what gets shaken. */
  readonly stage = new Container();
  private readonly shaken = new Container();
  private readonly items = new Container();
  private readonly views = new Map<string, ItemView>();
  private readonly liquids = new LiquidRenderer();
  private readonly hand = new Hand();
  private readonly customers = new CustomerLayer();
  private shakeAmount = 0;
  private shakePhase = 0;

  constructor(world: World) {
    const bands = new Container();
    const fallback = new Graphics();
    this.drawBands(fallback);
    bands.addChild(fallback, ...this.bandSprites());

    this.items.sortableChildren = true;
    for (const item of world.items) {
      const view = new ItemView(item);
      this.views.set(item.id, view);
      this.items.addChild(view.container);
    }

    this.shaken.addChild(
      bands,
      this.customers.container,
      this.liquids.container,
      this.items,
      this.hand.view,
    );
    this.shaken.addChild(this.bandLabels());
    const grain = this.grainOverlay();
    if (grain) this.shaken.addChild(grain);
    this.stage.addChild(this.shaken);
  }

  private drawBands(g: Graphics): void {
    const w = LAYOUT.WIDTH;
    const h = LAYOUT.HEIGHT;
    const customerH = h * LAYOUT.BAND_CUSTOMER;
    const counterH = h * LAYOUT.BAND_COUNTER;

    // Overdrawn a little past the edges so screen shake never shows a seam.
    g.rect(-40, -40, w + 80, customerH + 40).fill({ color: CUSTOMER_BG });
    g.rect(-40, customerH, w + 80, counterH).fill({ color: COUNTER_BG });
    g.rect(-40, customerH + counterH, w + 80, h - customerH - counterH + 40).fill({
      color: WORK_BG,
    });

    // The counter lip: the line the player pours across.
    g.rect(-40, customerH + counterH - 10, w + 80, 10).fill({ color: COUNTER_EDGE });
    g.rect(-40, customerH, w + 80, 4).fill({ color: 0x000000, alpha: 0.35 });
  }

  /** Painted bands over the flat fallback; any that failed to load leave it showing. */
  private bandSprites(): Sprite[] {
    const w = LAYOUT.WIDTH;
    const h = LAYOUT.HEIGHT;
    const customerH = h * LAYOUT.BAND_CUSTOMER;
    const counterH = h * LAYOUT.BAND_COUNTER;
    const bands: [ArtKey, number, number][] = [
      ['customerBand', -BLEED, customerH + BLEED],
      ['workArea', customerH + counterH, h - customerH - counterH + BLEED],
      // Last, so the counter's top lip sits over the wall behind it.
      ['counter', customerH, counterH],
    ];
    const sprites: Sprite[] = [];
    for (const [key, y, height] of bands) {
      const texture = art(key);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.position.set(-BLEED, y);
      sprite.setSize(w + BLEED * 2, height);
      sprites.push(sprite);
    }
    return sprites;
  }

  /** One print texture over everything, so code-drawn liquid matches the paint. */
  private grainOverlay(): TilingSprite | null {
    const texture = art('grain');
    if (!texture) return null;
    const grain = new TilingSprite({
      texture,
      width: LAYOUT.WIDTH + BLEED * 2,
      height: LAYOUT.HEIGHT + BLEED * 2,
    });
    grain.position.set(-BLEED, -BLEED);
    grain.alpha = 0.6;
    grain.eventMode = 'none';
    return grain;
  }

  private bandLabels(): Container {
    const base = {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: 16,
      fill: 0xffffff,
      letterSpacing: 3,
    };
    const style = new TextStyle(base);
    const inkStyle = new TextStyle({ ...base, fill: INK });
    const box = new Container();
    const onPaper = art('workArea') !== null;
    const entries: [string, number, boolean][] = [
      ['CUSTOMER BAND — PHASE 2', 24, false],
      ['COUNTER', LAYOUT.HEIGHT * LAYOUT.BAND_CUSTOMER + 16, false],
      ['WORK', LAYOUT.HEIGHT * (LAYOUT.BAND_CUSTOMER + LAYOUT.BAND_COUNTER) + 16, onPaper],
    ];
    for (const [text, y, ink] of entries) {
      const label = new Text({ text, style: ink ? inkStyle : style });
      label.position.set(24, y);
      label.alpha = 0.18;
      box.addChild(label);
    }
    return box;
  }

  update(world: World, night: NightState | null, dtSec: number): void {
    for (const item of world.items) {
      this.views.get(item.id)?.update(world, dtSec);
    }
    this.customers.update(world, night, dtSec);
    this.liquids.update(world, dtSec);
    this.hand.update(world, dtSec);

    // Working the shaker shakes the whole bar. The screen never freezes for
    // feedback (§9) — it just moves.
    this.shakeAmount = damp(this.shakeAmount, world.shakeIntensity, 22, dtSec);
    this.shakePhase += dtSec * 47;
    const amp = this.shakeAmount * SHAKE.SCREEN_SHAKE_PX;
    this.shaken.position.set(
      Math.sin(this.shakePhase) * amp,
      Math.cos(this.shakePhase * 1.7) * amp * 0.7,
    );
  }

  get particleCount(): number {
    return this.liquids.particleCount;
  }
}
