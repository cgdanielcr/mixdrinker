import { describe, expect, it } from 'vitest';
import { EVAL, MIXING } from '../../tuning';
import { addIce, dilutionRatio, settleStep, shakeStep } from './Mixing';
import { addMl, createVessel, liquidMl } from './Vessel';

function loadedShaker(iceCubes = 4) {
  const shaker = createVessel('s', 'shaker');
  addMl(shaker, 'tequila_blanco', 50);
  addMl(shaker, 'triple_sec', 25);
  addMl(shaker, 'lime_juice', 25);
  shaker.ice = iceCubes;
  return shaker;
}

/** Shake at full intensity for `seconds`, at 60 Hz. */
function shakeFor(v: ReturnType<typeof loadedShaker>, seconds: number, intensity = 1) {
  const stepMs = 1000 / 60;
  for (let t = 0; t < seconds * 1000; t += stepMs) shakeStep(v, intensity, stepMs);
}

describe('shakeStep', () => {
  it('marks the vessel shaken and drives mixed toward 1', () => {
    const shaker = loadedShaker();
    expect(shaker.shaken).toBe(false);

    shakeFor(shaker, 1);

    expect(shaker.shaken).toBe(true);
    expect(shaker.mixed).toBeCloseTo(MIXING.SHAKE_MIX_PER_SEC, 1);
    expect(shaker.mixed).toBeLessThan(1);
  });

  it('never pushes mixed above 1', () => {
    const shaker = loadedShaker();
    shakeFor(shaker, 30);
    expect(shaker.mixed).toBe(1);
  });

  it('chills and dilutes when there is ice', () => {
    const shaker = loadedShaker();
    shakeFor(shaker, 2);

    expect(shaker.dilutionMl).toBeGreaterThan(0);
    expect(shaker.chilledC).toBeLessThan(MIXING.ROOM_TEMP_C);
    expect(shaker.ice).toBeLessThan(4);
  });

  it('does neither in a dry shake, which is how you get a warm drink', () => {
    const shaker = loadedShaker(0);
    shakeFor(shaker, 3);

    expect(shaker.mixed).toBeGreaterThan(0);
    expect(shaker.dilutionMl).toBe(0);
    expect(shaker.chilledC).toBe(MIXING.ROOM_TEMP_C);
  });

  it('scales with intensity, so a limp shake does less', () => {
    const hard = loadedShaker();
    const soft = loadedShaker();
    shakeFor(hard, 1, 1);
    shakeFor(soft, 1, 0.3);

    expect(soft.mixed).toBeLessThan(hard.mixed);
    expect(soft.dilutionMl).toBeLessThan(hard.dilutionMl);
  });

  it('ignores zero intensity and zero time', () => {
    const shaker = loadedShaker();
    shakeStep(shaker, 0, 100);
    shakeStep(shaker, 1, 0);
    expect(shaker.shaken).toBe(false);
    expect(shaker.mixed).toBe(0);
  });

  it('over-shaking crosses the over-diluted line; a correct shake does not', () => {
    const correct = loadedShaker();
    shakeFor(correct, 4);
    expect(correct.mixed).toBeGreaterThanOrEqual(EVAL.SHAKEN_MIXED_TARGET);
    expect(dilutionRatio(correct)).toBeLessThan(EVAL.OVER_DILUTION_RATIO);

    const overdone = loadedShaker(20);
    shakeFor(overdone, 15);
    expect(dilutionRatio(overdone)).toBeGreaterThan(EVAL.OVER_DILUTION_RATIO);
  });

  it('spills melt water rather than exceeding capacity', () => {
    const glass = createVessel('g', 'shot'); // 60 ml
    addMl(glass, 'gin', 40);
    glass.ice = 1; // 20 ml displaced -> full
    shakeStep(glass, 1, 1000);

    expect(liquidMl(glass) + glass.ice * 20).toBeLessThanOrEqual(60.000001);
    expect(glass.spilledMl).toBeGreaterThan(0);
  });
});

describe('settleStep', () => {
  it('keeps diluting a drink left standing on ice', () => {
    const glass = createVessel('g', 'rocks');
    addMl(glass, 'gin', 60);
    glass.ice = 3;
    glass.chilledC = 0;

    for (let t = 0; t < 60_000; t += 1000 / 60) settleStep(glass, 1000 / 60);

    expect(glass.dilutionMl).toBeGreaterThan(0);
    expect(glass.ice).toBeLessThan(3);
  });

  it('warms a drink with no ice back toward room temperature', () => {
    const glass = createVessel('g', 'coupe');
    addMl(glass, 'gin', 60);
    glass.chilledC = -2;

    for (let t = 0; t < 120_000; t += 1000 / 60) settleStep(glass, 1000 / 60);

    expect(glass.chilledC).toBe(MIXING.ROOM_TEMP_C);
    expect(glass.dilutionMl).toBe(0);
  });

  it('does nothing for a zero-length tick', () => {
    const glass = createVessel('g', 'rocks');
    addMl(glass, 'gin', 60);
    glass.ice = 3;
    settleStep(glass, 0);
    expect(glass.dilutionMl).toBe(0);
  });
});

describe('addIce', () => {
  it('adds a cube when there is room', () => {
    const glass = createVessel('g', 'rocks');
    expect(addIce(glass)).toBe(true);
    expect(glass.ice).toBe(1);
  });

  it('refuses when the vessel is too full to take one', () => {
    const glass = createVessel('g', 'shot');
    addMl(glass, 'gin', 55);
    expect(addIce(glass)).toBe(false);
    expect(glass.ice).toBe(0);
  });
});

describe('dilutionRatio', () => {
  it('is zero for a dry drink and rises with melt water', () => {
    const glass = createVessel('g', 'rocks');
    addMl(glass, 'gin', 75);
    expect(dilutionRatio(glass)).toBe(0);

    glass.dilutionMl = 25;
    expect(dilutionRatio(glass)).toBeCloseTo(0.25, 6);
  });

  it('is zero for an empty vessel', () => {
    expect(dilutionRatio(createVessel('g', 'rocks'))).toBe(0);
  });
});
