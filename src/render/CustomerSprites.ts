/**
 * Customers in the top band: a figure, what they asked for, and how long they
 * are prepared to keep waiting (HANDOVER.md §3).
 *
 * Reads night state. Never writes it.
 *
 * The order bubble is drawn in Pixi rather than the DOM overlay §4 sketches.
 * These are one or two words pinned to a figure that moves, wobbles and
 * leaves; keeping them in the scene graph avoids syncing DOM positions to the
 * letterboxed stage transform every frame. Phase 4's timed dialogue choices
 * are a different problem and can still be DOM.
 */
import { Container, Graphics, NineSliceSprite, Sprite, Text, TextStyle } from 'pixi.js';
import { INTOX, LAYOUT } from '../tuning';
import { recipe } from '../sim/data';
import { describeSpecials } from '../sim/drinks/Specials';
import { visibleDrunkenness } from '../sim/customers/Intoxication';
import { isImpatient } from '../sim/customers/Patience';
import type { NightState, SeatedCustomer } from '../core/Night';
import type { World } from '../core/World';
import { itemById } from '../core/World';
import { damp, mixColors } from './Juice';
import { art, customerLooks, type CustomerLook } from './Art';

const BAND_BOTTOM = LAYOUT.HEIGHT * LAYOUT.BAND_CUSTOMER;
const CALM = 0x6f8fa6;
const URGENT = 0xd8574b;

/** Painted customers: bust height in px, standing on the counter's top edge. */
const FIGURE_H = 210;
/** Painted patience gauge, and where its tube sits as fractions of the frame. */
const METER = {
  y: 32,
  width: 130,
  height: 30,
  tubeLeft: 0.212,
  tubeRight: 0.94,
  tubeTop: 0.335,
  tubeBottom: 0.702,
};
/** Colours matched to the painted gauge. */
const TUBE_EMPTY = 0xf3e9cf;
const CALM_ART = 0x2f7582;
const URGENT_ART = 0xc2472c;
/** Height of the bubble's tail, below the balloon, in px. */
const BUBBLE_TAIL = 20;

const ORDER_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: 22,
  fontWeight: '700',
  fill: 0x1b2229,
});

const NAME_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, Consolas, monospace',
  fontSize: 14,
  fill: 0xc8d6e0,
  letterSpacing: 1,
});

/** One customer's figure, bubble and patience bar. */
class CustomerView {
  readonly container = new Container();
  private readonly body = new Graphics();
  private readonly bubble = new Graphics();
  private readonly meter = new Graphics();
  private readonly order: Text;
  private readonly name: Text;
  /** Painted art, when loaded. Each is null and falls back to Graphics. */
  private readonly look: CustomerLook | null;
  private readonly figure: Sprite | null = null;
  private readonly frame: Sprite | null = null;
  private readonly bubbleArt: NineSliceSprite | null = null;
  private wobble = 0;
  private shownPatience = 1;
  private alpha = 0;

  constructor(customerId: string) {
    this.order = new Text({ text: '', style: ORDER_STYLE });
    this.order.anchor.set(0.5);
    this.name = new Text({ text: '', style: NAME_STYLE });
    this.name.anchor.set(0.5);
    this.container.addChild(this.body);

    // Same customer, same face, all night: the look is a hash of their id.
    const looks = customerLooks();
    this.look = looks.length > 0 ? (looks[hash(customerId) % looks.length] ?? null) : null;
    if (this.look) {
      const figure = new Sprite(this.look.neutral);
      figure.anchor.set(0.5, 1);
      figure.setSize((FIGURE_H * figure.texture.width) / figure.texture.height, FIGURE_H);
      // Bottom edge on the counter's top edge: they stand behind the bar.
      figure.y = 26;
      this.figure = figure;
      this.container.addChild(figure);
    }

    const frameTexture = art('uiPatienceFrame');
    if (frameTexture) {
      const frame = new Sprite(frameTexture);
      frame.anchor.set(0.5, 0);
      frame.setSize(METER.width, METER.height);
      frame.y = METER.y;
      this.frame = frame;
      this.container.addChild(frame);
    }

    const bubbleTexture = art('uiBubble');
    if (bubbleTexture) {
      // Slices in texture pixels (2x): the tail lives in the left column, so
      // only the plain middle of the balloon stretches.
      const bubble = new NineSliceSprite({
        texture: bubbleTexture,
        leftWidth: 112,
        topHeight: 50,
        rightWidth: 82,
        bottomHeight: 82,
      });
      bubble.scale.set(0.5);
      bubble.visible = false;
      this.bubbleArt = bubble;
      this.container.addChild(bubble);
    }

    this.container.addChild(this.meter, this.bubble, this.order, this.name);
  }

  update(customer: SeatedCustomer, x: number, dtSec: number): void {
    const leaving = customer.phase === 'leaving';
    this.alpha = damp(this.alpha, leaving ? 0 : 1, 6, dtSec);
    this.container.alpha = this.alpha;
    this.container.visible = this.alpha > 0.02;
    if (!this.container.visible) return;

    // Drunk customers sway. It is the tell that they have had enough, and it
    // is readable before the number is.
    const drunk = visibleDrunkenness(customer);
    this.wobble += dtSec * (1.4 + drunk * 3);
    const sway = Math.sin(this.wobble) * drunk * 9;
    this.container.position.set(x + sway, BAND_BOTTOM - 26);
    this.container.rotation = (sway / 260) * drunk;

    this.shownPatience = damp(this.shownPatience, customer.patience, 8, dtSec);
    this.draw(customer);
  }

  private draw(customer: SeatedCustomer): void {
    const g = this.body;
    g.clear();

    const urgent = isImpatient(customer);
    // Over the cut-off line they get a flushed face — the visual tell that
    // pairs with the sway, so it is never a hidden number (§10).
    const flush =
      customer.bac >= INTOX.DRUNK
        ? Math.min(1, (customer.bac - INTOX.DRUNK) / (INTOX.CUT_OFF - INTOX.DRUNK))
        : -1;

    if (this.figure && this.look) {
      this.figure.texture =
        customer.phase === 'drinking'
          ? this.look.happy
          : urgent
            ? this.look.impatient
            : this.look.neutral;
      // The painted cheeks are already rosy, so drunk warms the whole figure.
      this.figure.tint = flush >= 0 ? mixColors(0xffffff, 0xffa08c, 0.25 + flush * 0.4) : 0xffffff;
    } else {
      const skin = 0xd6a97f;
      const shirt = mixColors(0x46586a, 0x7a4a4a, customer.personality.demanding);
      // Shoulders and head: a readable silhouette, nothing more (§14).
      g.roundRect(-46, -96, 92, 96, 18).fill({ color: shirt });
      g.circle(0, -118, 34).fill({ color: skin });
      if (flush >= 0) {
        g.circle(-15, -112, 8).fill({ color: 0xe07a6a, alpha: 0.35 + flush * 0.4 });
        g.circle(15, -112, 8).fill({ color: 0xe07a6a, alpha: 0.35 + flush * 0.4 });
      }
    }

    // Patience, on the counter side so it reads with the serving spot.
    this.drawMeter(urgent);

    this.name.text = customer.name;
    this.name.position.set(0, this.frame ? METER.y + METER.height + 12 : 34);

    this.drawBubble(customer);
  }

  private drawMeter(urgent: boolean): void {
    const g = this.meter;
    g.clear();
    if (!this.frame) {
      const width = 92;
      g.roundRect(-width / 2, 10, width, 9, 4).fill({ color: 0x000000, alpha: 0.45 });
      g.roundRect(-width / 2, 10, width * this.shownPatience, 9, 4).fill({
        color: urgent ? URGENT : CALM,
      });
      return;
    }
    // The frame's tube has a fill painted in; cover it, then draw the real one.
    const left = -METER.width / 2 + METER.width * METER.tubeLeft;
    const width = METER.width * (METER.tubeRight - METER.tubeLeft);
    const top = METER.y + METER.height * METER.tubeTop;
    const height = METER.height * (METER.tubeBottom - METER.tubeTop);
    g.roundRect(left, top, width, height, height / 2).fill({ color: TUBE_EMPTY });
    const filled = Math.max(0, Math.min(1, this.shownPatience)) * width;
    if (filled > 1) {
      g.roundRect(left, top, filled, height, Math.min(height / 2, filled / 2)).fill({
        color: urgent ? URGENT_ART : CALM_ART,
      });
    }
  }

  private drawBubble(customer: SeatedCustomer): void {
    const g = this.bubble;
    g.clear();
    this.order.text = '';
    if (this.bubbleArt) this.bubbleArt.visible = false;

    // Once they have a drink there is nothing to ask for.
    if (!customer.order || customer.phase !== 'waiting') return;

    // The special is the part you have to actually listen for (§8, Phase 3).
    const aside = describeSpecials(customer.order.special);
    this.order.text =
      recipe(customer.order.recipeId).name +
      (aside
        ? `
${aside}`
        : '');

    if (this.bubbleArt) {
      const width = Math.max(150, this.order.width + 56);
      const height = aside ? 102 : 78;
      // Tail tip just above the head, balloon opening to the right.
      const left = -28;
      const top = -FIGURE_H + 26 + 10 - height;
      this.bubbleArt.position.set(left, top);
      this.bubbleArt.width = width * 2;
      this.bubbleArt.height = height * 2;
      this.bubbleArt.visible = true;
      this.order.position.set(left + width / 2 + 6, top + (height - BUBBLE_TAIL) / 2);
      return;
    }

    const width = Math.max(120, this.order.width + 34);
    const height = aside ? 70 : 46;
    const top = -232;

    g.roundRect(-width / 2, top, width, height, 10).fill({ color: 0xf2f5f7 });
    g.poly([-10, top + height, 10, top + height, 0, top + height + 14]).fill({ color: 0xf2f5f7 });
    this.order.position.set(0, top + height / 2);
  }
}

/** Small stable string hash, so a customer keeps one look. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export class CustomerLayer {
  readonly container = new Container();
  private readonly views = new Map<string, CustomerView>();

  update(world: World, night: NightState | null, dtSec: number): void {
    if (!night) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;

    const alive = new Set<string>();
    for (const customer of night.customers) {
      alive.add(customer.id);
      let view = this.views.get(customer.id);
      if (!view) {
        view = new CustomerView(customer.id);
        this.views.set(customer.id, view);
        this.container.addChild(view.container);
      }
      const seat = itemById(world, `seat_${customer.seat ?? 0}`);
      view.update(customer, seat?.homeX ?? LAYOUT.WIDTH / 2, dtSec);
    }

    // Anyone gone from the night state is gone from the bar.
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      this.container.removeChild(view.container);
      view.container.destroy({ children: true });
      this.views.delete(id);
    }
  }
}
