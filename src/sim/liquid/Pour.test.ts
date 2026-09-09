import { describe, expect, it } from 'vitest';
import { POUR } from '../../tuning';
import { flowRate, holdMsForMl, pourStep, stepTilt, tailMl } from './Pour';
import { createVessel, liquidMl } from './Vessel';

/** Drive a full press-and-release at 60 Hz and report what ended up where. */
function pourFor(holdMs: number, opts: { missAfterMs?: number } = {}) {
  const bottle = createVessel('b', 'bottle', { contents: { tequila_blanco: 700 } });
  const glass = createVessel('g', 'rocks');
  const stepMs = 1000 / 60;

  let tilt = 0;
  let elapsed = 0;
  let spilled = 0;

  // Hold, then keep ticking until the tilt has eased all the way back.
  while (elapsed < holdMs || tilt > 0) {
    const holding = elapsed < holdMs;
    tilt = stepTilt(tilt, holding, stepMs);
    const missing = opts.missAfterMs !== undefined && elapsed >= opts.missAfterMs;
    const result = pourStep(bottle, missing ? null : glass, tilt, stepMs);
    spilled += result.spilledMl;
    elapsed += stepMs;
  }

  return { bottle, glass, spilled, inGlass: liquidMl(glass) };
}

describe('stepTilt', () => {
  it('ramps to full tilt over TILT_RAMP_MS while held', () => {
    expect(stepTilt(0, true, POUR.TILT_RAMP_MS / 2)).toBeCloseTo(0.5, 6);
    expect(stepTilt(0, true, POUR.TILT_RAMP_MS)).toBe(1);
  });

  it('does not overshoot in either direction', () => {
    expect(stepTilt(0.9, true, 10_000)).toBe(1);
    expect(stepTilt(0.1, false, 10_000)).toBe(0);
  });

  it('releases faster than it ramps, so stopping feels crisp', () => {
    expect(POUR.TILT_RELEASE_MS).toBeLessThan(POUR.TILT_RAMP_MS);
    const rampedIn100 = stepTilt(0, true, 100);
    const releasedIn100 = 1 - stepTilt(1, false, 100);
    expect(releasedIn100).toBeGreaterThan(rampedIn100);
  });
});

describe('flowRate', () => {
  it('reaches the tuned maximum at full tilt', () => {
    expect(flowRate(1)).toBeCloseTo(POUR.MAX_FLOW_ML_PER_SEC, 6);
  });

  it('is a dribble at low tilt, which is where fine control lives', () => {
    // A power curve means half tilt gives well under half flow.
    expect(flowRate(0.5)).toBeLessThan(POUR.MAX_FLOW_ML_PER_SEC * 0.4);
    expect(flowRate(0.5)).toBeGreaterThan(0);
  });

  it('produces nothing below the minimum flow threshold', () => {
    expect(flowRate(0)).toBe(0);
    expect(flowRate(0.01)).toBe(0);
  });

  it('increases monotonically with tilt', () => {
    let previous = -1;
    for (let t = 0.2; t <= 1; t += 0.05) {
      const flow = flowRate(t);
      expect(flow).toBeGreaterThan(previous);
      previous = flow;
    }
  });
});

describe('free-pour calibration (HANDOVER.md §6)', () => {
  it('delivers 45 ml in roughly a 0.6 second hold', () => {
    const holdMs = holdMsForMl(45);
    expect(holdMs).toBeGreaterThan(450);
    expect(holdMs).toBeLessThan(800);
  });

  it('is learnable: the same hold gives the same volume every time', () => {
    const a = pourFor(600).inGlass;
    const b = pourFor(600).inGlass;
    expect(a).toBeCloseTo(b, 9);
  });

  it('rewards a longer hold with proportionally more liquid past the ramp', () => {
    const short = pourFor(600).inGlass;
    const long = pourFor(1600).inGlass;
    // Past the ramp the flow is flat, so the extra second is ~MAX_FLOW ml.
    expect(long - short).toBeCloseTo(POUR.MAX_FLOW_ML_PER_SEC, 0);
  });

  it('keeps pouring briefly after release, which the player has to learn', () => {
    expect(tailMl(1)).toBeGreaterThan(1);
    expect(tailMl(1)).toBeLessThan(15);
    expect(tailMl(0)).toBe(0);
  });
});

describe('pourStep', () => {
  it('moves liquid from the bottle into the glass', () => {
    const { bottle, glass, inGlass, spilled } = pourFor(600);
    expect(inGlass).toBeGreaterThan(0);
    expect(liquidMl(bottle)).toBeCloseTo(700 - inGlass, 6);
    expect(spilled).toBe(0);
    expect(glass.spilledMl).toBe(0);
  });

  it('spills everything when the stream misses the vessel', () => {
    const { bottle, inGlass, spilled } = pourFor(600, { missAfterMs: 0 });
    expect(inGlass).toBe(0);
    expect(spilled).toBeGreaterThan(0);
    expect(bottle.spilledMl).toBeCloseTo(spilled, 6);
  });

  it('splits the pour when the stream drifts off mid-pour', () => {
    const { inGlass, spilled } = pourFor(900, { missAfterMs: 500 });
    expect(inGlass).toBeGreaterThan(0);
    expect(spilled).toBeGreaterThan(0);
  });

  it('overflows rather than silently capping a full glass', () => {
    const bottle = createVessel('b', 'bottle', { contents: { cola: 700 } });
    const glass = createVessel('g', 'shot'); // 60 ml
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const r = pourStep(bottle, glass, 1, 1000 / 60);
      total += r.spilledMl;
    }
    expect(liquidMl(glass)).toBe(60);
    expect(total).toBeGreaterThan(0);
    expect(bottle.spilledMl).toBeCloseTo(total, 6);
  });

  it('carries the source composition into the destination', () => {
    const shaker = createVessel('s', 'shaker');
    shaker.contents = { tequila_blanco: 50, lime_juice: 25, triple_sec: 25 };
    const glass = createVessel('g', 'rocks');

    for (let i = 0; i < 60; i++) pourStep(shaker, glass, 1, 1000 / 60);

    const total = liquidMl(glass);
    expect(total).toBeGreaterThan(0);
    expect((glass.contents['tequila_blanco'] ?? 0) / total).toBeCloseTo(0.5, 3);
    expect((glass.contents['lime_juice'] ?? 0) / total).toBeCloseTo(0.25, 3);
  });

  it('warms a chilled glass with room-temperature liquid', () => {
    const bottle = createVessel('b', 'bottle', { contents: { cola: 700 }, chilledC: 20 });
    const glass = createVessel('g', 'rocks', { contents: { gin: 50 }, chilledC: -2 });

    for (let i = 0; i < 60; i++) pourStep(bottle, glass, 1, 1000 / 60);

    expect(glass.chilledC).toBeGreaterThan(-2);
    expect(glass.chilledC).toBeLessThan(20);
  });

  it('does nothing without tilt, from an empty source, or into itself', () => {
    const bottle = createVessel('b', 'bottle', { contents: { gin: 700 } });
    const glass = createVessel('g', 'rocks');
    const nothing = { transferredMl: 0, spilledMl: 0, pouredMl: 0 };

    expect(pourStep(bottle, glass, 0, 16)).toEqual(nothing);
    expect(pourStep(bottle, glass, 1, 0)).toEqual(nothing);
    expect(pourStep(bottle, bottle, 1, 16)).toEqual(nothing);
    expect(pourStep(createVessel('e', 'bottle'), glass, 1, 16)).toEqual(nothing);
  });

  it('runs a bottle dry instead of pouring liquid it does not have', () => {
    const bottle = createVessel('b', 'bottle', { contents: { gin: 30 } });
    const glass = createVessel('g', 'rocks');
    for (let i = 0; i < 120; i++) pourStep(bottle, glass, 1, 1000 / 60);

    expect(liquidMl(bottle)).toBe(0);
    expect(liquidMl(glass)).toBeCloseTo(30, 6);
  });
});
