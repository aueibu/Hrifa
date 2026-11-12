import { describe, expect, it } from 'vitest';
import {
  adaptiveSubdivision,
  barLabelStep,
  gridDensity,
  gridLevel,
  LABEL_DIGIT_PIXELS,
  LABEL_PADDING_PIXELS,
  MIN_LINE_GAP,
  type GridMeter,
} from './gridDensity';

const METERS: GridMeter[] = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 7, denominator: 8 },
  { numerator: 5, denominator: 4 },
  { numerator: 2, denominator: 2 },
  { numerator: 1, denominator: 4 },
];
// Automatic, then 1/32, 1/16, 1/8, 1/4, 1/2, 1/1 and a triplet.
const UNITS = [undefined, 0.125, 0.25, 0.5, 1, 2, 4, 1 / 3];
// 192 px per quarter down to a quarter of a pixel, geometrically.
const ZOOMS = Array.from({ length: 61 }, (_, index) => 192 * (0.25 / 192) ** (index / 60));
const BAR_LIMIT = 72_000;

const barQuarters = (meter: GridMeter) => (meter.numerator * 4) / meter.denominator;
const rank = (level: ReturnType<typeof gridLevel>) =>
  ({ subdivision: 0, beat: 1, bar: 2 })[level.kind] * 100 + Math.log2(level.barStride);

describe('gridLevel', () => {
  it('coarsens monotonically as the zoom goes out, for every meter and grid unit', () => {
    METERS.forEach((meter) => {
      UNITS.forEach((unit) => {
        let previousRank = -1;
        let previousSpacing = 0;
        ZOOMS.forEach((zoom) => {
          const level = gridLevel(meter, unit, zoom);
          expect(rank(level)).toBeGreaterThanOrEqual(previousRank);
          expect(level.spacing).toBeGreaterThanOrEqual(previousSpacing - 1e-9);
          // The finest level that keeps lines apart: never closer than the minimum gap.
          expect(level.spacing * zoom).toBeGreaterThanOrEqual(MIN_LINE_GAP - 1e-6);
          previousRank = rank(level);
          previousSpacing = level.spacing;
        });
      });
    });
  });

  it('reads 4/4 at 1, 2, 4, 8 and 16 bars as the view goes far out', () => {
    const meter = { numerator: 4, denominator: 4 };
    const stride = (zoom: number) => gridLevel(meter, undefined, zoom).barStride;
    expect(gridLevel(meter, undefined, 112).kind).toBe('subdivision');
    expect(gridLevel(meter, undefined, 64)).toMatchObject({ kind: 'subdivision', spacing: 0.5 });
    expect(gridLevel(meter, undefined, 40).kind).toBe('beat');
    expect(gridLevel(meter, undefined, 8)).toMatchObject({ kind: 'bar', barStride: 1 });
    expect(stride(2)).toBe(2);
    expect(stride(1)).toBe(4);
    expect(stride(0.5)).toBe(8);
    expect(stride(0.25)).toBe(16);
  });

  it('keeps the selected unit while it has room, and the beat when the unit is not finer', () => {
    const meter = { numerator: 4, denominator: 4 };
    expect(gridLevel(meter, 0.25, 64)).toMatchObject({ kind: 'subdivision', spacing: 0.25 });
    expect(gridLevel(meter, 0.125, 64).kind).toBe('beat');
    expect(gridLevel(meter, 4, 64).kind).toBe('beat');
  });

  it('adaptiveSubdivision follows the same gap as the automatic level', () => {
    expect(adaptiveSubdivision(192)).toBe(0.25);
    expect(adaptiveSubdivision(112)).toBe(0.25);
    expect(adaptiveSubdivision(64)).toBe(0.5);
    expect(adaptiveSubdivision(56)).toBe(0.5);
    expect(adaptiveSubdivision(30)).toBe(1);
  });
});

describe('barLabelStep', () => {
  it('grows monotonically as the zoom goes out and is a power of two', () => {
    METERS.forEach((meter) => {
      let previous = 0;
      ZOOMS.forEach((zoom) => {
        const step = barLabelStep(meter, zoom, BAR_LIMIT * barQuarters(meter));
        expect(step).toBeGreaterThanOrEqual(previous);
        expect(Math.log2(step) % 1).toBe(0);
        previous = step;
      });
    });
  });

  it('never lets two numbers touch, 5-digit bar numbers included', () => {
    METERS.forEach((meter) => {
      const bar = barQuarters(meter);
      ZOOMS.forEach((zoom) => {
        const step = barLabelStep(meter, zoom, BAR_LIMIT * bar);
        const width = String(BAR_LIMIT).length * LABEL_DIGIT_PIXELS + LABEL_PADDING_PIXELS;
        expect(step * bar * zoom).toBeGreaterThanOrEqual(width - 1e-6);
      });
    });
  });

  it('is sized for the timeline, so it does not change while scrolling', () => {
    const meter = { numerator: 4, denominator: 4 };
    // 99 bars needs two digits, 72000 needs five.
    expect(barLabelStep(meter, 3, 99 * 4)).toBeLessThan(barLabelStep(meter, 3, 72_000 * 4));
  });
});

describe('gridDensity', () => {
  const windowOf = (zoom: number, scrollBars: number, meter: GridMeter, width = 1200) => {
    const bar = barQuarters(meter);
    const from = scrollBars * bar - width / zoom;
    return { from: Math.max(0, from), to: scrollBars * bar + (2 * width) / zoom };
  };

  it('returns a bounded count over a zoom sweep, at the start, the middle and the end', () => {
    METERS.forEach((meter) => {
      const extent = BAR_LIMIT * barQuarters(meter);
      UNITS.forEach((unit) => {
        ZOOMS.forEach((zoom) => {
          [0, 36_000, 71_990].forEach((scrollBars) => {
            const window = windowOf(zoom, scrollBars, meter);
            const lines = gridDensity({
              meter,
              gridUnit: unit,
              pixelsPerQuarter: zoom,
              ...window,
              extent,
            });
            const pixels = (Math.min(window.to, extent) - window.from) * zoom;
            expect(lines.length).toBeLessThanOrEqual((2 * pixels) / MIN_LINE_GAP + 4);
            expect(lines.length).toBeLessThanOrEqual(600);
          });
        });
      });
    });
  });

  it('is sorted, without duplicates, inside the window, with each bar line on a bar', () => {
    const meter = { numerator: 3, denominator: 4 };
    [64, 12, 3, 0.5].forEach((zoom) => {
      const window = windowOf(zoom, 500, meter);
      const lines = gridDensity({
        meter,
        gridUnit: 0.25,
        pixelsPerQuarter: zoom,
        ...window,
        extent: 100_000 * 3,
      });
      const positions = lines.map((line) => line.at);
      expect(positions).toEqual([...new Set(positions)].sort((a, b) => a - b));
      expect(positions.every((at) => at >= window.from - 1e-6 && at <= window.to + 1e-6)).toBe(
        true
      );
      lines
        .filter((line) => line.kind === 'bar')
        .forEach((line) => expect((line.at / 3) % 1).toBeCloseTo(0, 6));
    });
  });

  it('draws bars and beats with dotted subdivisions only at the finest levels', () => {
    const meter = { numerator: 4, denominator: 4 };
    const at = (zoom: number, unit?: number) =>
      gridDensity({
        meter,
        gridUnit: unit,
        pixelsPerQuarter: zoom,
        from: 0,
        to: 8,
        extent: 100,
      });
    const fine = at(64, 0.25);
    expect(fine.find((line) => line.at === 0.25)).toMatchObject({ subdivision: true });
    expect(fine.find((line) => line.at === 1)).toMatchObject({ kind: 'beat', subdivision: false });
    expect(fine.find((line) => line.at === 4)).toMatchObject({ kind: 'bar', subdivision: false });
    const beats = at(32);
    expect(beats.some((line) => line.subdivision)).toBe(false);
    expect(beats.map((line) => line.at)).toContain(1);
    const bars = at(4);
    expect(bars.every((line) => line.kind === 'bar')).toBe(true);
  });

  it('puts bar numbers on bars 1 + k * step, bar 1 included, and nowhere else', () => {
    const meter = { numerator: 4, denominator: 4 };
    ZOOMS.forEach((zoom) => {
      const extent = BAR_LIMIT * 4;
      const step = barLabelStep(meter, zoom, extent);
      const lines = gridDensity({
        meter,
        pixelsPerQuarter: zoom,
        from: 0,
        to: 1200 / zoom,
        extent,
      });
      const labelled = lines.filter((line) => line.label !== undefined);
      expect(labelled[0]).toMatchObject({ at: 0, label: '1' });
      labelled.forEach((line) => {
        expect(line.kind).toBe('bar');
        expect((Number(line.label) - 1) % step).toBe(0);
      });
      // Every bar that should carry a number in the window does.
      lines
        .filter((line) => line.kind === 'bar' && Math.round(line.at / 4) % step === 0)
        .forEach((line) => expect(line.label).toBeDefined());
    });
  });

  it('prints no two labels closer than a label is wide, down to 5 digits at the far end', () => {
    METERS.forEach((meter) => {
      const bar = barQuarters(meter);
      const extent = BAR_LIMIT * bar;
      ZOOMS.forEach((zoom) => {
        const window = windowOf(zoom, 55_041, meter);
        const lines = gridDensity({ meter, pixelsPerQuarter: zoom, ...window, extent });
        const labelled = lines.filter((line) => line.label !== undefined);
        const width = 5 * LABEL_DIGIT_PIXELS + LABEL_PADDING_PIXELS;
        labelled.slice(1).forEach((line, index) => {
          expect((line.at - labelled[index].at) * zoom).toBeGreaterThanOrEqual(width - 1e-6);
        });
      });
    });
  });

  it('reads like 55041 ... 55105 far out in 4/4', () => {
    const meter = { numerator: 4, denominator: 4 };
    const extent = BAR_LIMIT * 4;
    const zoom = 1; // a bar is 4 px: labels every 16 bars
    const lines = gridDensity({
      meter,
      pixelsPerQuarter: zoom,
      from: 55_040 * 4,
      to: 55_105 * 4 + 4,
      extent,
    });
    const labels = lines.filter((line) => line.label).map((line) => line.label);
    expect(labels[0]).toBe('55041');
    expect(labels).toContain('55105');
    expect(labels.every((label) => (Number(label) - 1) % 16 === 0)).toBe(true);
  });

  it('thins labels independently of lines: every bar drawn, every second numbered', () => {
    const meter = { numerator: 4, denominator: 4 };
    // 12 px per quarter: bars 48 px apart (lines at every bar), a 5-digit number needs 56.
    const lines = gridDensity({
      meter,
      pixelsPerQuarter: 12,
      from: 0,
      to: 40,
      extent: BAR_LIMIT * 4,
    });
    const bars = lines.filter((line) => line.kind === 'bar');
    expect(bars.map((line) => line.at)).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);
    expect(bars.map((line) => line.label)).toEqual([
      '1',
      undefined,
      '3',
      undefined,
      '5',
      undefined,
      '7',
      undefined,
      '9',
      undefined,
      '11',
    ]);
  });

  it('draws nothing for an empty or reversed window and stops at the timeline end', () => {
    const meter = { numerator: 4, denominator: 4 };
    expect(gridDensity({ meter, pixelsPerQuarter: 64, from: 10, to: 5, extent: 100 })).toEqual([]);
    const lines = gridDensity({ meter, pixelsPerQuarter: 64, from: 0, to: 1000, extent: 8 });
    expect(Math.max(...lines.map((line) => line.at))).toBeLessThanOrEqual(8);
  });
});
