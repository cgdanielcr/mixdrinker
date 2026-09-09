import { describe, expect, it } from 'vitest';
import { ICE, MIXING } from '../../tuning';
import { validateData } from '../data';
import {
  abvOf,
  addMl,
  blendedColor,
  capacityLeftMl,
  createVessel,
  discard,
  fillFraction,
  hexToRgb,
  isEmpty,
  layers,
  liquidMl,
  occupiedMl,
  removeMl,
} from './Vessel';

describe('data files', () => {
  it('are internally consistent', () => {
    expect(() => validateData()).not.toThrow();
  });
});

describe('createVessel', () => {
  it('builds a glass from its data definition', () => {
    const glass = createVessel('g1', 'rocks');
    expect(glass.kind).toBe('glass');
    expect(glass.glassType).toBe('rocks');
    expect(glass.capacityMl).toBe(300);
    expect(isEmpty(glass)).toBe(true);
    expect(glass.chilledC).toBe(MIXING.ROOM_TEMP_C);
  });

  it('omits glassType for non-glass vessels', () => {
    const shaker = createVessel('s1', 'shaker');
    expect(shaker.glassType).toBeUndefined();
    expect(shaker.kind).toBe('shaker');
  });

  it('accepts a pre-filled bottle', () => {
    const bottle = createVessel('b1', 'bottle', { contents: { gin: 700 } });
    expect(liquidMl(bottle)).toBe(700);
    expect(isEmpty(bottle)).toBe(false);
  });
});

describe('volume accounting', () => {
  it('counts ice toward the space used but not toward liquid', () => {
    const glass = createVessel('g1', 'rocks');
    addMl(glass, 'gin', 50);
    glass.ice = 3;

    expect(liquidMl(glass)).toBe(50);
    expect(occupiedMl(glass)).toBe(50 + 3 * ICE.CUBE_ML);
    expect(capacityLeftMl(glass)).toBe(300 - 50 - 3 * ICE.CUBE_ML);
  });

  it('counts dilution as liquid', () => {
    const glass = createVessel('g1', 'rocks');
    addMl(glass, 'gin', 50);
    glass.dilutionMl = 10;
    expect(liquidMl(glass)).toBe(60);
  });

  it('reports a fill fraction that never exceeds 1', () => {
    const glass = createVessel('g1', 'shot');
    addMl(glass, 'gin', 30);
    expect(fillFraction(glass)).toBeCloseTo(0.5, 5);
    addMl(glass, 'gin', 999);
    expect(fillFraction(glass)).toBe(1);
  });
});

describe('addMl', () => {
  it('adds what fits and reports the rest as overflow', () => {
    const glass = createVessel('g1', 'shot'); // 60 ml
    const first = addMl(glass, 'tequila_blanco', 45);
    expect(first).toEqual({ addedMl: 45, overflowMl: 0 });

    const second = addMl(glass, 'tequila_blanco', 30);
    expect(second.addedMl).toBe(15);
    expect(second.overflowMl).toBe(15);
    expect(liquidMl(glass)).toBe(60);
  });

  it('ignores non-positive amounts', () => {
    const glass = createVessel('g1', 'rocks');
    expect(addMl(glass, 'gin', 0)).toEqual({ addedMl: 0, overflowMl: 0 });
    expect(addMl(glass, 'gin', -10)).toEqual({ addedMl: 0, overflowMl: 0 });
    expect(isEmpty(glass)).toBe(true);
  });

  it('un-mixes a drink that something new is poured into', () => {
    const glass = createVessel('g1', 'rocks');
    addMl(glass, 'gin', 50);
    glass.mixed = 1;
    addMl(glass, 'cola', 50);
    expect(glass.mixed).toBeLessThan(1);
    expect(glass.mixed).toBeGreaterThan(0);
  });
});

describe('removeMl', () => {
  it('takes liquid proportionally across every ingredient', () => {
    const shaker = createVessel('s1', 'shaker');
    addMl(shaker, 'tequila_blanco', 50);
    addMl(shaker, 'lime_juice', 25);
    addMl(shaker, 'triple_sec', 25);

    const { taken, totalMl } = removeMl(shaker, 50);

    expect(totalMl).toBe(50);
    expect(taken['tequila_blanco']).toBeCloseTo(25, 6);
    expect(taken['lime_juice']).toBeCloseTo(12.5, 6);
    expect(taken['triple_sec']).toBeCloseTo(12.5, 6);
    expect(liquidMl(shaker)).toBeCloseTo(50, 6);
  });

  it('cannot take more than is there', () => {
    const glass = createVessel('g1', 'rocks');
    addMl(glass, 'gin', 20);
    const { totalMl } = removeMl(glass, 100);
    expect(totalMl).toBe(20);
    expect(isEmpty(glass)).toBe(true);
    expect(glass.contents['gin']).toBeUndefined();
  });

  it('takes dilution water along with the ingredients', () => {
    const glass = createVessel('g1', 'rocks');
    addMl(glass, 'gin', 50);
    glass.dilutionMl = 50;
    removeMl(glass, 50);
    expect(glass.dilutionMl).toBeCloseTo(25, 6);
  });
});

describe('layers', () => {
  it('sorts heaviest first so grenadine sits at the bottom', () => {
    const glass = createVessel('g1', 'highball');
    addMl(glass, 'tequila_blanco', 45);
    addMl(glass, 'orange_juice', 90);
    addMl(glass, 'grenadine', 15);

    const ordered = layers(glass).map((l) => l.ingredientId);
    expect(ordered).toEqual(['grenadine', 'orange_juice', 'tequila_blanco']);
  });

  it('is empty for an empty vessel', () => {
    expect(layers(createVessel('g1', 'rocks'))).toEqual([]);
  });
});

describe('blendedColor', () => {
  it('lets an opaque ingredient dominate a clear one', () => {
    const glass = createVessel('g1', 'highball');
    addMl(glass, 'soda', 150);
    addMl(glass, 'cola', 30);

    const [r, g, b] = hexToRgb(blendedColor(glass));
    // Cola is dark and nearly opaque; soda is clear. The mix must read as cola.
    expect(r).toBeLessThan(120);
    expect(g).toBeLessThan(100);
    expect(b).toBeLessThan(100);
  });

  it('returns a well-formed hex colour', () => {
    const glass = createVessel('g1', 'rocks');
    addMl(glass, 'orange_juice', 90);
    expect(blendedColor(glass)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('abvOf', () => {
  it('is volume-weighted and drops as the drink is lengthened', () => {
    const glass = createVessel('g1', 'highball');
    addMl(glass, 'gin', 50); // 40% abv
    expect(abvOf(glass)).toBeCloseTo(0.4, 6);

    addMl(glass, 'soda', 150);
    expect(abvOf(glass)).toBeCloseTo((50 * 0.4) / 200, 6);
  });

  it('is zero for an empty vessel', () => {
    expect(abvOf(createVessel('g1', 'rocks'))).toBe(0);
  });
});

describe('discard', () => {
  it('resets everything the sink should reset', () => {
    const glass = createVessel('g1', 'rocks');
    addMl(glass, 'gin', 50);
    glass.ice = 3;
    glass.dilutionMl = 10;
    glass.mixed = 1;
    glass.shaken = true;
    glass.rim = 'salt';
    glass.garnish = ['lime_wedge'];

    discard(glass);

    expect(isEmpty(glass)).toBe(true);
    expect(glass.mixed).toBe(0);
    expect(glass.shaken).toBe(false);
    expect(glass.rim).toBeUndefined();
    expect(glass.garnish).toEqual([]);
    expect(glass.chilledC).toBe(MIXING.ROOM_TEMP_C);
  });
});
