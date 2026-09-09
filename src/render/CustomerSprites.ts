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
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { INTOX, LAYOUT } from '../tuning';
import { recipe } from '../sim/data';
import { visibleDrunkenness } from '../sim/customers/Intoxication';
import { isImpatient } from '../sim/customers/Patience';
import type { NightState, SeatedCustomer } from '../core/Night';
import type { World } from '../core/World';
import { itemById } from '../core/World';
import { damp, mixColors } from './Juice';

const BAND_BOTTOM = LAYOUT.HEIGHT * LAYOUT.BAND_CUSTOMER;
const CALM = 0x6f8fa6;
const URGENT = 0xd8574b;

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
  private readonly order: Text;
  private readonly name: Text;
  private wobble = 0;
  private shownPatience = 1;
  private alpha = 0;

  constructor() {
    this.order = new Text({ text: '', style: ORDER_STYLE });
    this.order.anchor.set(0.5);
    this.name = new Text({ text: '', style: NAME_STYLE });
    this.name.anchor.set(0.5);
    this.container.addChild(this.body, this.bubble, this.order, this.name);
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
    const skin = 0xd6a97f;
    const shirt = mixColors(0x46586a, 0x7a4a4a, customer.personality.demanding);

    // Shoulders and head: a readable silhouette, nothing more (§14).
    g.roundRect(-46, -96, 92, 96, 18).fill({ color: shirt });
    g.circle(0, -118, 34).fill({ color: skin });

    // Over the cut-off line they get a flushed face — the visual tell that
    // pairs with the sway, so it is never a hidden number (§10).
    if (customer.bac >= INTOX.DRUNK) {
      const flush = Math.min(1, (customer.bac - INTOX.DRUNK) / (INTOX.CUT_OFF - INTOX.DRUNK));
      g.circle(-15, -112, 8).fill({ color: 0xe07a6a, alpha: 0.35 + flush * 0.4 });
      g.circle(15, -112, 8).fill({ color: 0xe07a6a, alpha: 0.35 + flush * 0.4 });
    }

    // Patience bar, on the counter side so it reads with the serving spot.
    const width = 92;
    g.roundRect(-width / 2, 10, width, 9, 4).fill({ color: 0x000000, alpha: 0.45 });
    g.roundRect(-width / 2, 10, width * this.shownPatience, 9, 4).fill({
      color: urgent ? URGENT : CALM,
    });

    this.name.text = customer.name;
    this.name.position.set(0, 34);

    this.drawBubble(customer);
  }

  private drawBubble(customer: SeatedCustomer): void {
    const g = this.bubble;
    g.clear();
    this.order.text = '';

    // Once they have a drink there is nothing to ask for.
    if (!customer.order || customer.phase !== 'waiting') return;

    this.order.text = recipe(customer.order.recipeId).name;
    const width = Math.max(120, this.order.width + 34);
    const height = 46;
    const top = -232;

    g.roundRect(-width / 2, top, width, height, 10).fill({ color: 0xf2f5f7 });
    g.poly([-10, top + height, 10, top + height, 0, top + height + 14]).fill({ color: 0xf2f5f7 });
    this.order.position.set(0, top + height / 2);
  }
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
        view = new CustomerView();
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
