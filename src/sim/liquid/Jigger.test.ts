import { describe, expect, it } from 'vitest';
import { JIGGER } from '../../tuning';
import { fillToStop, nextStopMl } from './Jigger';

describe('nextStopMl', () => {
  it('finds the next mark above the current level', () => {
    expect(nextStopMl(0)).toBe(30);
    expect(nextStopMl(29.9)).toBe(30);
    expect(nextStopMl(30)).toBe(45);
    expect(nextStopMl(45)).toBe(60);
  });

  it('returns null once the jigger is at its last mark', () => {
    expect(nextStopMl(60)).toBeNull();
    expect(nextStopMl(90)).toBeNull();
  });

  it('is not fooled by floating point just under a mark', () => {
    expect(nextStopMl(30 - 1e-9)).toBe(45);
  });
});

describe('fillToStop', () => {
  it('accepts a pour that does not reach the mark', () => {
    expect(fillToStop(0, 12)).toEqual({ acceptedMl: 12, rejectedMl: 0, stopped: false });
  });

  it('stops dead on the mark and refuses the rest', () => {
    const result = fillToStop(0, 50);
    expect(result.acceptedMl).toBe(30);
    expect(result.rejectedMl).toBe(20);
    expect(result.stopped).toBe(true);
  });

  it('reports a stop when a pour lands exactly on the mark', () => {
    expect(fillToStop(20, 10)).toEqual({ acceptedMl: 10, rejectedMl: 0, stopped: true });
  });

  it('steps up through every mark in turn', () => {
    let level = 0;
    const reached: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { acceptedMl } = fillToStop(level, 500);
      level += acceptedMl;
      reached.push(level);
    }
    expect(reached).toEqual([...JIGGER.STOPS_ML]);
  });

  it('takes nothing once full, and spills it all', () => {
    expect(fillToStop(60, 25)).toEqual({ acceptedMl: 0, rejectedMl: 25, stopped: true });
  });

  it('ignores a non-positive pour', () => {
    expect(fillToStop(0, 0)).toEqual({ acceptedMl: 0, rejectedMl: 0, stopped: false });
    expect(fillToStop(0, -5)).toEqual({ acceptedMl: 0, rejectedMl: 0, stopped: false });
  });

  it('never accepts more than the mark allows, at any pour size', () => {
    for (const incoming of [1, 7, 13.3, 60, 200]) {
      const { acceptedMl } = fillToStop(31, incoming);
      expect(31 + acceptedMl).toBeLessThanOrEqual(45 + 1e-6);
    }
  });
});
