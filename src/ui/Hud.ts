/**
 * The HUD (HANDOVER.md §4): the clock, the tips, and how the night is going.
 * DOM overlay, because it is text.
 */
import type { Clock } from '../core/Clock';
import type { NightState } from '../core/Night';

export class Hud {
  readonly root = document.createElement('div');
  private readonly time = document.createElement('span');
  private readonly tips = document.createElement('span');
  private readonly served = document.createElement('span');
  private readonly bar = document.createElement('div');
  private readonly fill = document.createElement('div');

  constructor() {
    this.root.className = 'hud';
    this.root.hidden = true;

    this.time.className = 'hud-time';
    this.tips.className = 'hud-stat';
    this.served.className = 'hud-stat';

    this.bar.className = 'hud-bar';
    this.fill.className = 'hud-bar-fill';
    this.bar.append(this.fill);

    const row = document.createElement('div');
    row.className = 'hud-row';
    row.append(this.time, this.served, this.tips);

    this.root.append(row, this.bar);
  }

  update(clock: Clock, night: NightState | null): void {
    this.root.hidden = night === null;
    if (!night) return;

    this.time.textContent = clock.label;
    this.tips.textContent = `${night.tips} tips`;
    this.served.textContent = `${night.served} served`;
    this.fill.style.width = `${(clock.progress * 100).toFixed(1)}%`;
    // Last call reads as urgent without needing a separate warning.
    this.root.classList.toggle('closing', clock.progress > 0.85);
  }
}
