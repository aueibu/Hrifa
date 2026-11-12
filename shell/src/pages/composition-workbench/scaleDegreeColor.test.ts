import { markerColorNames } from '../../theme/markers';
import { degreeHueName, scaleDegree, scaleDegreeColor } from './scaleDegreeColor';

describe('scaleDegree', () => {
  it('counts from C and repeats every octave', () => {
    expect(scaleDegree(0, 12)).toBe(0);
    expect(scaleDegree(6000, 12)).toBe(0);
    expect(scaleDegree(6700, 12)).toBe(7);
    expect(scaleDegree(7200, 12)).toBe(0);
    expect(scaleDegree(12700, 12)).toBe(7);
  });

  it('wraps at the EDO and is edo-aware', () => {
    expect(scaleDegree(1200, 19)).toBe(0);
    expect(scaleDegree(600, 24)).toBe(12);
    expect(scaleDegree(700, 19)).toBe(11);
    expect(scaleDegree(1190, 12)).toBe(0);
    expect(scaleDegree(1150, 31)).toBe(30);
  });

  it('rounds microtonal and negative pitches consistently, never negative or -0', () => {
    expect(scaleDegree(6049, 12)).toBe(0);
    expect(scaleDegree(6051, 12)).toBe(1);
    expect(scaleDegree(-100, 12)).toBe(11);
    expect(scaleDegree(-1200, 12)).toBe(0);
    expect(Object.is(scaleDegree(-30, 12), 0)).toBe(true);
    expect(scaleDegree(-6000, 12)).toBe(scaleDegree(6000, 12));
    for (const cents of [-12345, -50, -1, 49, 4950, 123456]) {
      const degree = scaleDegree(cents, 17);
      expect(degree).toBeGreaterThanOrEqual(0);
      expect(degree).toBeLessThan(17);
    }
  });

  it('falls back to 12 for a bad EDO', () => {
    expect(scaleDegree(700, 0)).toBe(7);
    expect(scaleDegree(700, 2.5)).toBe(7);
  });
});

describe('degree hues', () => {
  const warm = new Set(['red', 'orange', 'yellow', 'pink']);
  const twelve = Array.from({ length: 12 }, (_, degree) => degreeHueName(degree, 12));

  it('gives every degree of 12-EDO a distinct theme hue, in the interleaved order', () => {
    expect(new Set(twelve).size).toBe(12);
    expect(twelve.every((name) => markerColorNames.includes(name))).toBe(true);
    expect(twelve).toEqual([
      'yellow',
      'teal',
      'grape',
      'indigo',
      'green',
      'orange',
      'cyan',
      'red',
      'lime',
      'blue',
      'pink',
      'violet',
    ]);
  });

  it('keeps the human-pinned anchors', () => {
    expect(twelve[0]).toBe('yellow');
    expect(twelve[1]).toBe('teal');
    expect(twelve[4]).toBe('green');
    expect(twelve[5]).toBe('orange');
    expect(twelve[9]).toBe('blue');
    expect(twelve[10]).toBe('pink');
    expect(twelve[11]).toBe('violet');
  });

  it('never gives neighbouring pitch classes the same hue, nor two warm hues', () => {
    for (let degree = 0; degree < 12; degree += 1) {
      const here = twelve[degree];
      const next = twelve[(degree + 1) % 12];
      expect(here).not.toBe(next);
      expect(warm.has(here) && warm.has(next)).toBe(false);
    }
  });

  it('keeps neighbours distinct for other EDOs, across the octave too', () => {
    for (const edo of [5, 7, 10, 13, 17, 19, 22, 24, 25, 31, 37, 53]) {
      const names = Array.from({ length: edo }, (_, degree) => degreeHueName(degree, edo));
      for (let degree = 0; degree < edo; degree += 1) {
        expect(names[degree]).not.toBe(names[(degree + 1) % edo]);
      }
    }
  });

  it('spreads the hues over fewer degrees and cycles all 12 over more', () => {
    const seven = Array.from({ length: 7 }, (_, degree) => degreeHueName(degree, 7));
    expect(new Set(seven).size).toBe(7);
    const nineteen = Array.from({ length: 19 }, (_, degree) => degreeHueName(degree, 19));
    expect(new Set(nineteen).size).toBe(12);
    expect(degreeHueName(0, 19)).toBe('yellow');
    expect(degreeHueName(12, 19)).toBe('yellow');
  });

  it('colours a pitch with the theme role of its degree, octave-repeating', () => {
    expect(scaleDegreeColor(6000, 12)).toBe('var(--mark-yellow)');
    expect(scaleDegreeColor(7200, 12)).toBe(scaleDegreeColor(6000, 12));
    expect(scaleDegreeColor(6100, 12)).toBe('var(--mark-teal)');
    expect(scaleDegreeColor(6700, 12)).toBe('var(--mark-red)');
    expect(scaleDegreeColor(6400, 12)).toBe('var(--mark-green)');
    expect(scaleDegreeColor(6000, 12)).not.toMatch(/#/);
  });
});
