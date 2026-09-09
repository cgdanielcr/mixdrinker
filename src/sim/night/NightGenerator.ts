/**
 * NightGenerator (HANDOVER.md §4, §8, §12).
 *
 * seed + bar + night → who shows up, when, and what they ask for.
 *
 * §8's rule for every phase: anything deciding *who or when* uses the seeded
 * Rng. The generator seats people; it does not write them. Generation is
 * deterministic from (seed, barId, night) so a night can be replayed from the
 * number printed on the summary.
 */
import { NIGHT } from '../../tuning';
import { createRng } from '../run/Rng';
import type { Bar, NightPlan, PlannedArrival } from '../types';

/** Arrivals per game minute at `minute` past open, interpolated from the curve. */
export function arrivalRateAt(curve: readonly [number, number][], minute: number): number {
  if (curve.length === 0) return 0;
  const first = curve[0]!;
  if (minute <= first[0]) return first[1];

  for (let i = 1; i < curve.length; i++) {
    const previous = curve[i - 1]!;
    const current = curve[i]!;
    if (minute <= current[0]) {
      const span = current[0] - previous[0];
      if (span <= 0) return current[1];
      const t = (minute - previous[0]) / span;
      return previous[1] + (current[1] - previous[1]) * t;
    }
  }
  return curve[curve.length - 1]![1];
}

function curveFor(bar: Bar, night: number): readonly [number, number][] {
  const exact = bar.pacing.find((entry) => entry.night === night);
  if (exact) return exact.curve;
  // Later nights reuse the last authored curve until §8's Phase 3 tunes them.
  return bar.pacing[bar.pacing.length - 1]?.curve ?? [];
}

export function generateNight(seed: number, bar: Bar, night: number): NightPlan {
  // Separate streams, so adding a system later cannot shift who walks in.
  const root = createRng(seed ^ (night * 0x9e3779b1));
  const arrivalRng = root.fork(1);
  const castRng = root.fork(2);
  const orderRng = root.fork(3);

  const curve = curveFor(bar, night);
  const lengthMinutes = NIGHT.CLOSE_MINUTE - NIGHT.OPEN_MINUTE;
  const arrivals: PlannedArrival[] = [];

  // Walk the night a minute at a time, accumulating expected arrivals. This is
  // stable under curve edits in a way that sampling gaps is not.
  let pending = 0;
  for (let minute = 0; minute < lengthMinutes; minute++) {
    pending += arrivalRateAt(curve, minute);
    while (pending >= 1) {
      pending -= 1;
      arrivals.push({
        // Jitter inside the minute, so arrivals do not land on a metronome.
        atMinute: minute + arrivalRng.next(),
        defId: castRng.weighted(
          bar.clientele.map((entry) => ({ item: entry.customerId, weight: entry.weight })),
        ),
        recipeId: orderRng.pick(bar.menu),
      });
    }
  }

  arrivals.sort((a, b) => a.atMinute - b.atMinute);
  return { seed, barId: bar.id, night, arrivals };
}

/** Arrivals due between two game minutes past open. Half-open: (from, to]. */
export function arrivalsBetween(
  plan: NightPlan,
  fromMinute: number,
  toMinute: number,
): PlannedArrival[] {
  return plan.arrivals.filter((a) => a.atMinute > fromMinute && a.atMinute <= toMinute);
}
