/**
 * End of night (HANDOVER.md §8, Phase 2).
 *
 * Deliberately a placeholder: it lists every event flag and the seed. Phase 5
 * turns this into "what happened because of what you did and didn't notice";
 * right now its job is to prove the flags and the seed are all there.
 */
import { formatMinute } from '../core/Clock';
import type { NightState } from '../core/Night';
import { summarise } from '../core/Night';

export class NightSummary {
  readonly root = document.createElement('div');
  private readonly headline = document.createElement('div');
  private readonly log = document.createElement('ol');
  private readonly again = document.createElement('button');
  private shownFor: NightState | null = null;

  /** Set by main.ts: start a fresh night. */
  onReplay: ((sameSeed: boolean) => void) | null = null;

  constructor() {
    this.root.className = 'night-summary';
    this.root.hidden = true;

    const title = document.createElement('h2');
    title.textContent = 'LAST CALL';

    this.headline.className = 'summary-headline';
    this.log.className = 'summary-log';

    this.again.className = 'summary-button';
    this.again.textContent = 'Another night';
    this.again.addEventListener('click', () => this.onReplay?.(false));

    const replaySame = document.createElement('button');
    replaySame.className = 'summary-button ghost';
    replaySame.textContent = 'Replay this seed';
    replaySame.addEventListener('click', () => this.onReplay?.(true));

    const buttons = document.createElement('div');
    buttons.className = 'summary-buttons';
    buttons.append(this.again, replaySame);

    this.root.append(title, this.headline, this.log, buttons);
  }

  update(night: NightState | null): void {
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
