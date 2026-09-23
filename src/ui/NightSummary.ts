/**
 * End of night (HANDOVER.md §8, §12).
 *
 * What the night cost you and what it earned, then on to the shop. Phase 5
 * turns the log into "what happened because of what you did and didn't
 * notice"; the flags and the seed are already all here.
 */
import { formatMinute } from '../core/Clock';
import type { NightState } from '../core/Night';
import { summarise } from '../core/Night';
import type { NightTotals } from '../sim/night/Summary';
import { reputationRows } from './Screens';

export class NightSummary {
  readonly root = document.createElement('div');
  private readonly headline = document.createElement('div');
  private readonly reputation = document.createElement('div');
  private readonly log = document.createElement('ol');
  private readonly onward = document.createElement('button');
  private shownFor: NightState | null = null;

  /** Set by main.ts: move the run on to the shop or the run summary. */
  onContinue: (() => void) | null = null;

  constructor() {
    this.root.className = 'night-summary';
    this.root.hidden = true;

    const title = document.createElement('h2');
    title.textContent = 'LAST CALL';

    this.headline.className = 'summary-headline';
    this.reputation.className = 'rep-rows';
    this.log.className = 'summary-log';

    this.onward.className = 'summary-button';
    this.onward.textContent = 'Cash up';
    this.onward.addEventListener('click', () => this.onContinue?.());

    const buttons = document.createElement('div');
    buttons.className = 'summary-buttons';
    buttons.append(this.onward);

    this.root.append(title, this.headline, this.reputation, this.log, buttons);
  }

  update(night: NightState | null, totals: NightTotals | null): void {
    const show = night !== null && night.over;
    this.root.hidden = !show;
    if (!show || !night) {
      this.shownFor = null;
      return;
    }
    // Build it once, when the night ends, not every frame.
    if (this.shownFor === night) return;
    this.shownFor = night;

    this.headline.innerHTML = summarise(night)
      .map((line) => `<div>${line}</div>`)
      .join('');

    this.reputation.innerHTML = totals ? reputationRows(totals) : '';

    this.log.innerHTML = '';
    for (const event of night.events) {
      const item = document.createElement('li');
      item.className = `event ${event.kind}`;
      item.innerHTML =
        `<span class="event-time">${formatMinute(event.minute)}</span>` +
        `<span class="event-kind">${event.kind}</span>` +
        `<span class="event-text">${escapeHtml(event.text)}</span>`;
      this.log.append(item);
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
