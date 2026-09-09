/**
 * The jigger: exact but slow (HANDOVER.md §6).
 *
 * Free-pouring is fast and needs skill; the jigger needs none but costs you a
 * second vessel and a second motion. That trade is the whole point of having
 * both, so the jigger must be genuinely exact — it stops dead on its marks.
 */
import { JIGGER } from '../../tuning';

/** The next measuring mark above `currentMl`, or null once past the last one. */
export function nextStopMl(currentMl: number): number | null {
  for (const stop of JIGGER.STOPS_ML) {
    // A hair of tolerance, so floating point never leaves you a mark short.
    if (stop > currentMl + 1e-6) return stop;
  }
  return null;
}

export interface JiggerFill {
  /** ml that actually goes in before the mark stops it. */
  acceptedMl: number;
  /** ml that had nowhere to go and lands on the counter. */
  rejectedMl: number;
  /** True when this fill landed exactly on a mark. */
  stopped: boolean;
}

/**
 * Pour `incomingMl` into a jigger already holding `currentMl`.
 * Fills to the next mark and refuses the rest — keep pouring and it spills,
 * which is the cost of not letting go in time.
 */
export function fillToStop(currentMl: number, incomingMl: number): JiggerFill {
  if (incomingMl <= 0) return { acceptedMl: 0, rejectedMl: 0, stopped: false };

  const stop = nextStopMl(currentMl);
  if (stop === null) {
    return { acceptedMl: 0, rejectedMl: incomingMl, stopped: true };
  }

  const room = stop - currentMl;
  if (incomingMl <= room) {
    return {
      acceptedMl: incomingMl,
      rejectedMl: 0,
      stopped: Math.abs(room - incomingMl) < 1e-6,
    };
  }
  return { acceptedMl: room, rejectedMl: incomingMl - room, stopped: true };
}
