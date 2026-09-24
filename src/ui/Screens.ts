/**
 * The screens either side of a night (HANDOVER.md §12):
 * title and seed entry, the between-nights shop, and the run summary.
 *
 * All DOM, all text, all deliberately plain. The bar is the game; these are
 * the doors on either side of it.
 */
import { RUN, SHOP } from '../tuning';
import { bar, ingredient, recipe } from '../sim/data';
import { buyableRecipes, rumourFor } from '../sim/run/Run';
import type { Run } from '../sim/run/Run';
import { bandFor } from '../sim/run/Reputation';
import { summaryLines } from '../sim/night/Summary';
import type { NightTotals } from '../sim/night/Summary';
import type { Meta } from '../core/Save';

function panel(className: string): HTMLDivElement {
  const root = document.createElement('div');
  root.className = `screen ${className}`;
  root.hidden = true;
  return root;
}

function button(label: string, primary = true): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = primary ? 'summary-button' : 'summary-button ghost';
  b.textContent = label;
  return b;
}

// ------------------------------------------------------------------- title

export class TitleScreen {
  readonly root = panel('title-screen');
  private readonly seedInput = document.createElement('input');
  private readonly continueButton = button('Continue the week', false);
  private readonly tutorialButton = button('Learn the ropes');
  private readonly startButton = button('Start a run', false);
  private readonly metaLine = document.createElement('p');

  onStart: ((seed: number | null) => void) | null = null;
  onContinue: (() => void) | null = null;
  onTutorial: (() => void) | null = null;

  constructor() {
    const title = document.createElement('h1');
    title.textContent = 'LAST CALL';

    const tagline = document.createElement('p');
    tagline.className = 'tagline';
    tagline.textContent = `Five nights behind the bar at ${bar('dive').name}.`;

    this.seedInput.type = 'text';
    this.seedInput.placeholder = 'seed (optional)';
    this.seedInput.className = 'seed-input';
    this.seedInput.inputMode = 'numeric';

    const start = this.startButton;
    this.tutorialButton.addEventListener('click', () => this.onTutorial?.());
    start.addEventListener('click', () => {
      const raw = Number(this.seedInput.value.trim());
      this.onStart?.(Number.isFinite(raw) && raw > 0 ? raw >>> 0 : null);
    });
    this.continueButton.addEventListener('click', () => this.onContinue?.());

    const buttons = document.createElement('div');
    buttons.className = 'summary-buttons';
    buttons.append(this.tutorialButton, start, this.continueButton);

    this.metaLine.className = 'tagline dim';

    this.root.append(title, tagline, this.seedInput, buttons, this.metaLine);
  }

  show(meta: Meta, hasSavedRun: boolean): void {
    this.root.hidden = false;
    this.continueButton.hidden = !hasSavedRun;
    // Whoever has never played gets the tutorial as the obvious first button.
    const firstTime = meta.runsPlayed === 0;
    this.tutorialButton.className = firstTime ? 'summary-button' : 'summary-button ghost';
    this.startButton.className = firstTime ? 'summary-button ghost' : 'summary-button';
    this.metaLine.textContent = meta.runsPlayed
      ? `${meta.runsPlayed} runs · ${meta.weeksFinished} weeks finished · ${meta.timesFired} times fired · best reputation ${Math.round(meta.bestReputation)}`
      : '';
  }

  hide(): void {
    this.root.hidden = true;
  }
}

// -------------------------------------------------------------------- shop

export class ShopScreen {
  readonly root = panel('shop-screen');
  private readonly headline = document.createElement('div');
  private readonly items = document.createElement('div');
  private readonly rumour = document.createElement('p');
  private run: Run | null = null;

  onBuy: ((what: 'restock' | 'supplies' | string) => void) | null = null;
  onNext: (() => void) | null = null;

  constructor() {
    const title = document.createElement('h2');
    title.textContent = 'BEFORE OPENING';

    this.headline.className = 'summary-headline';
    this.items.className = 'shop-items';
    this.rumour.className = 'tagline rumour';

    const next = button('Open the doors');
    next.addEventListener('click', () => this.onNext?.());

    const buttons = document.createElement('div');
    buttons.className = 'summary-buttons';
    buttons.append(next);

    this.root.append(title, this.headline, this.rumour, this.items, buttons);
  }

  show(run: Run): void {
    this.run = run;
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** Cost to top the cellar back up to a full week's worth. */
  static restockCost(run: Run): number {
    const definition = bar(run.barId);
    const missing = definition.shelf.reduce((total, id) => {
      const full = RUN.BOTTLE_ML * 3;
      return total + Math.max(0, full - (run.stock[id] ?? 0));
    }, 0);
    return Math.ceil((missing / 100) * SHOP.RESTOCK_PER_100ML);
  }

  private render(): void {
    const run = this.run;
    if (!run) return;
    const definition = bar(run.barId);

    this.headline.innerHTML =
      `<div>Night ${run.night} of ${RUN.NIGHTS} · reputation ${Math.round(run.reputation)}</div>` +
      `<div><b>${run.tips}</b> in tips to spend</div>`;
    this.rumour.textContent = rumourFor(run);

    this.items.innerHTML = '';

    const restock = ShopScreen.restockCost(run);
    this.items.append(
      this.row(
        'Restock the shelf',
        lowStockLine(run),
        restock,
        restock === 0 || run.tips < restock,
        'restock',
      ),
    );

    this.items.append(
      this.row(
        'Salt and limes',
        'Enough garnish and salt to see the night out.',
        SHOP.SUPPLIES_COST,
        run.tips < SHOP.SUPPLIES_COST,
        'supplies',
      ),
    );

    for (const recipeId of buyableRecipes(run, definition)) {
      const r = recipe(recipeId);
      this.items.append(
        this.row(
          `Learn the ${r.name}`,
          `Adds it to the menu for the rest of the week. ${r.ingredients.map((i) => ingredient(i.id).name).join(', ')}.`,
          SHOP.RECIPE_COST,
          run.tips < SHOP.RECIPE_COST,
          recipeId,
        ),
      );
    }
  }

  private row(
    title: string,
    description: string,
    cost: number,
    disabled: boolean,
    id: string,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'shop-item';

    const text = document.createElement('div');
    text.innerHTML = `<b>${title}</b><br><span class="dim">${description}</span>`;

    const buy = button(cost === 0 ? 'nothing needed' : `${cost}`, false);
    buy.disabled = disabled;
    buy.addEventListener('click', () => {
      this.onBuy?.(id);
      this.render();
    });

    row.append(text, buy);
    return row;
  }
}

function lowStockLine(run: Run): string {
  const definition = bar(run.barId);
  const low = definition.shelf
    .filter((id) => (run.stock[id] ?? 0) < RUN.BOTTLE_ML)
    .map((id) => ingredient(id).name);
  if (low.length === 0) return 'The cellar is full.';
  return `Running low: ${low.join(', ')}.`;
}

// ------------------------------------------------------------- run summary

export class RunSummaryScreen {
  readonly root = panel('run-screen');
  private readonly headline = document.createElement('div');
  private readonly table = document.createElement('div');

  onRestart: (() => void) | null = null;

  constructor() {
    const title = document.createElement('h2');
    title.textContent = 'THE WEEK';

    this.headline.className = 'summary-headline';
    this.table.className = 'run-table';

    const again = button('Start another run');
    again.addEventListener('click', () => this.onRestart?.());

    const buttons = document.createElement('div');
    buttons.className = 'summary-buttons';
    buttons.append(again);

    this.root.append(title, this.headline, this.table, buttons);
  }

  show(run: Run): void {
    this.root.hidden = false;

    const fired = run.outcome === 'fired';
    const totalTips = run.nights.reduce((sum, n) => sum + n.tips, 0);
    this.headline.innerHTML =
      `<div class="verdict ${fired ? 'bad' : 'good'}">${
        fired ? `Fired after night ${run.nights.length}.` : 'You made it to the end of the week.'
      }</div>` +
      `<div>Reputation ${Math.round(run.reputation)} · ${bandFor(run.reputation)}</div>` +
      `<div>${totalTips} in tips across ${run.nights.length} night${run.nights.length === 1 ? '' : 's'}</div>` +
      `<div class="dim">Seed ${run.seed} · ${bar(run.barId).name}</div>`;

    this.table.innerHTML =
      '<div class="run-row head"><span>night</span><span>served</span><span>tips</span>' +
      '<span>walkouts</span><span>rep</span></div>' +
      run.nights
        .map(
          (n) =>
            `<div class="run-row"><span>${n.night}</span><span>${n.served}</span>` +
            `<span>${n.tips}</span><span>${n.walkouts}</span>` +
            `<span class="${n.reputationDelta < 0 ? 'bad' : 'good'}">${
              n.reputationDelta > 0 ? '+' : ''
            }${n.reputationDelta.toFixed(1)}</span></div>`,
        )
        .join('');
  }

  hide(): void {
    this.root.hidden = true;
  }
}

/** The reputation breakdown that goes on the end-of-night screen. */
export function reputationRows(totals: NightTotals): string {
  const rows = summaryLines(totals);
  if (rows.length === 0) return '<div class="dim">A night with nothing to report.</div>';
  return rows
    .map(
      (row) =>
        `<div class="rep-row"><span>${row.label}</span>` +
        `<span class="${row.delta < 0 ? 'bad' : 'good'}">${row.delta > 0 ? '+' : ''}${row.delta.toFixed(1)}</span></div>`,
    )
    .join('');
}
