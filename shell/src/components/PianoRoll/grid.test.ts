import { describe, expect, it } from 'vitest';
import { gridWindow, rollGridLines } from './grid';
import { gridDensity } from './gridDensity';
import type { PianoRollGridLine, PianoRollGridSource } from './model';

const FOUR_FOUR = { numerator: 4, denominator: 4 };
const LONGEST = 4 * 72_000;

/** A density-deciding source for 4/4 that records what it was asked for. */
function density(gridUnit?: number) {
  const asked: Array<[number, number, number]> = [];
  const source: PianoRollGridSource = (from, to, pixelsPerQuarter, extent) => {
    asked.push([from, to, extent]);
    return gridDensity({ meter: FOUR_FOUR, gridUnit, pixelsPerQuarter, from, to, extent });
  };
  return { source, asked };
}

describe('rollGridLines with a source', () => {
  it('asks only for the window and returns a bounded number of lines at every zoom', () => {
    for (const zoom of [0.25, 1, 4, 16, 48, 64, 112, 192]) {
      for (const share of [0, 0.5, 0.99]) {
        const { source, asked } = density(0.25);
        const window = gridWindow(share * LONGEST * zoom, 1200, zoom, LONGEST);
        const lines = rollGridLines(source, 0.25, LONGEST, zoom, window);
        expect(lines.length).toBeLessThan(800);
        expect(asked).toHaveLength(1);
        expect(asked[0][1] - asked[0][0]).toBeLessThanOrEqual((1200 / zoom) * 3 + 1e-6);
        expect(asked[0][2]).toBe(LONGEST);
        expect(lines.every((line) => line.at >= window.from - 1e-6 && line.at <= window.to)).toBe(
          true
        );
      }
    }
  });

  it('draws what the source returns and adds no subdivision of its own', () => {
    const lines = rollGridLines(
      () => [
        { at: 0, kind: 'bar', label: '1' },
        { at: 4, kind: 'bar' },
      ],
      0.25,
      64,
      192,
      { from: 0, to: 64 }
    );
    expect(lines.map((line) => line.at)).toEqual([0, 4]);
    expect(lines.every((line) => !line.subdivision)).toBe(true);
  });

  it('keeps the source subdivision flag and sorts the lines', () => {
    const { source } = density(0.5);
    const lines = rollGridLines(source, 0.5, 64, 64, { from: 0, to: 16 });
    const positions = lines.map((line) => line.at);
    expect(positions).toEqual([...new Set(positions)].sort((a, b) => a - b));
    expect(lines.find((line) => line.at === 4)).toMatchObject({ kind: 'bar', subdivision: false });
    expect(lines.find((line) => line.at === 0.5)).toMatchObject({ subdivision: true });
  });

  it('windows cover a view that has not been measured yet', () => {
    expect(gridWindow(0, 0, 64, 1_000_000)).toEqual({ from: 0, to: (1200 / 64) * 2 });
  });
});

describe('rollGridLines with an array (Mixer, Melodicization)', () => {
  const given: PianoRollGridLine[] = [
    { at: 0, kind: 'bar', label: '1' },
    { at: 4, kind: 'bar', label: '2' },
    { at: 100, kind: 'bar', label: '26' },
  ];

  it('keeps every line it was given, as before', () => {
    const lines = rollGridLines(given, undefined, 8, 64);
    expect(lines.map((line) => line.at)).toContain(100);
    expect(lines.find((line) => line.at === 100)).toMatchObject({ kind: 'bar', label: '26' });
  });

  it('is never windowed: a window (or a scrollLeft of 0 with a native scroller) trims nothing', () => {
    // 60 quarters at 64 px with a 500 px view that scrolls natively; the owner's scrollLeft stays 0.
    const whole = rollGridLines([], undefined, 60, 64);
    const windowed = rollGridLines([], undefined, 60, 64, gridWindow(0, 500, 64, 60));
    expect(windowed).toEqual(whole);
    // Every half-quarter subdivision out to the end is there, including past two view widths.
    expect(whole.map((line) => line.at)).toContain(60);
    expect(whole.filter((line) => line.subdivision)).toHaveLength(121);
    expect(whole.at(-1)!.at).toBe(60);
  });

  it('draws the subdivision of the selected unit out to the end', () => {
    const lines = rollGridLines(given, 0.25, 16, 64);
    expect(lines.filter((line) => line.subdivision).length).toBeGreaterThan(50);
  });
});
