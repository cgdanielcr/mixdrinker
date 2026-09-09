/**
 * The night clock (HANDOVER.md §4).
 *
 * The sim thinks in game minutes; the loop hands it real milliseconds. This is
 * the only place that conversion lives, so pacing curves and patience can be
 * authored in minutes without anyone doing arithmetic at the call site.
 */
import { NIGHT } from '../tuning';

const LENGTH_MINUTES = NIGHT.CLOSE_MINUTE - NIGHT.OPEN_MINUTE;
const MINUTES_PER_REAL_SECOND = LENGTH_MINUTES / NIGHT.REAL_SECONDS;

export class Clock {
  /** Game minutes since the doors opened. */
  minute = 0;
  paused = false;

  /** Advance by real time. Returns the game minutes that actually elapsed. */
  advance(dtMs: number): number {
    if (this.paused || this.isOver) return 0;
    const minutes = (dtMs / 1000) * MINUTES_PER_REAL_SECOND;
    const remaining = LENGTH_MINUTES - this.minute;
    const stepped = Math.min(minutes, remaining);
    this.minute += stepped;
    return stepped;
  }

  get isOver(): boolean {
    return this.minute >= LENGTH_MINUTES;
  }

  /** 0..1 through the night, for the HUD bar. */
  get progress(): number {
    return Math.min(1, this.minute / LENGTH_MINUTES);
  }

  /** Wall-clock label, e.g. "23:14". */
  get label(): string {
    return formatMinute(this.minute);
  }

  reset(): void {
    this.minute = 0;
    this.paused = false;
  }
}

/** Game minutes past open → a 24-hour clock reading. */
export function formatMinute(minutesPastOpen: number): string {
  const absolute = Math.floor(NIGHT.OPEN_MINUTE + minutesPastOpen) % (24 * 60);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export const NIGHT_LENGTH_MINUTES = LENGTH_MINUTES;
export const GAME_MINUTES_PER_REAL_SECOND = MINUTES_PER_REAL_SECOND;
