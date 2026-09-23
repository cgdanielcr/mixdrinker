/**
 * The HUD (HANDOVER.md §4): the clock, the tips, and how the night is going.
 * DOM overlay, because it is text.
 */
import { RUN } from '../tuning';
import { bandFor } from '../sim/run/Reputation';
import type { Run } from '../sim/run/Run';
import type { Clock } from '../core/Clock';
import type { NightState } from '../core/Night';

export class Hud {
  readonly root = document.createElement('div');
  private readonly time = document.createElement('span');
  private readonly tips = document.createElement('span');
  private readonly served = document.createElement('span');
  private readonly night = document.createElement('span');
  private readonly reputation = document.createElement('span');
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

    this.night.className = 'hud-stat';
    this.reputation.className = 'hud-stat rep';

    const row = document.createElement('div');
    row.className = 'hud-row';
    row.append(this.time, this.night, this.served, this.tips, this.reputation);

    this.root.append(row, this.bar);
  }

  update(clock: Clock, night: NightState | null, run: Run | null): void {
    this.root.hidden = night === null || night.over;
    if (!night || night.over) return;

    this.time.textContent = clock.label;
    this.tips.textContent = `${night.tips} tips`;
    this.served.textContent = `${night.served} served`;
    this.fill.style.width = `${(clock.progress * 100).toFixed(1)}%`;
    // Last call reads as urgent without needing a separate warning.
    this.root.classList.toggle('closing', clock.progress > 0.85);

    if (run) {
      // Reputation is the bar's HP (§12), so it belongs next to the clock.
      this.night.textContent = `night ${run.night}/${RUN.NIGHTS}`;
      this.reputation.textContent = `${Math.round(run.reputation)} rep`;
      this.reputation.className = `hud-stat rep ${bandFor(run.reputation)}`;
    } else {
      this.night.textContent = '';
      this.reputation.textContent = '';
    }
  }
}
