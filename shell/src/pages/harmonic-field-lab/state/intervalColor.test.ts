import { describe, expect, it } from 'vitest';
import {
  MONZO_PRIMES,
  parseInterval,
  zeroMonzo,
  type MonzoExps,
  type Note,
} from '../../../lib/harmonic-field';
import {
  FIXED_BOUNDS,
  REL_COLOR_DEFAULT,
  SHADE_STEPS,
  complexityPosition,
  edoError,
  signedEdoError,
  fitBounds,
  foldOctave,
  INTERVAL_CLASSES,
  errorStripPosition,
  intervalClassTints,
  largestPrimeOf,
  legendBounds,
  legendMarkOf,
  legendNumber,
  shadeBarColors,
  strongEndOf,
  metricValue,
  monzoCellNotes,
  monzoCellTints,
  primeColor,
  sanitizeRelColor,
  tintOf,
  type TintContext,
} from './intervalColor';
import { signedErrorTile } from './tileColors';

/** Which end is strong, in the test's words (Simple strong or Complex strong). */
type Strong = 'simple' | 'complex';

const n = (t: string): Note => {
  const r = parseInterval(t);
  if (!r) {
    throw new Error(t);
  }
  return r;
};
const monzo = (e: Partial<Record<number, number>>): MonzoExps => ({ ...zeroMonzo(), ...e });
const ctx = (
  metric: TintContext['metric'],
  strong: Strong = 'simple',
  scheme: TintContext['scheme'] = 'dark',
  bounds: TintContext['bounds'] = null,
  look: TintContext['look'] = 'tinted'
): TintContext => ({
  metric,
  // intervalIntensity: `strong` = Simple strong, `faint` = Complex strong
  intensity: strong === 'simple' ? 'strong' : 'faint',
  scheme,
  look,
  outline: false,
  repC: 1200,
  bounds,
});
/** The ramp step of a shaded tint (`var(--rx-violet-N)`). */
const stepOf = (t: ReturnType<typeof tintOf>): number =>
  Number(/-(\d+)\)$/.exec(t?.fill ?? '')?.[1]);

describe('settings', () => {
  it('absent or damaged reads as Prime, Fixed (Monzo: Exact) in every view', () => {
    for (const raw of [undefined, null, 5, 'x', [], {}, { metric: 'nope', range: 3, octave: {} }]) {
      expect(sanitizeRelColor(raw)).toEqual(REL_COLOR_DEFAULT);
    }
    expect(REL_COLOR_DEFAULT).toEqual({
      rings: { metric: 'prime', range: 'fixed' },
      near: { metric: 'prime', range: 'fixed' },
      monzo: { metric: 'prime', range: 'fixed', octave: 'exact' },
    });
  });
  it('keeps each valid field on its own, per view', () => {
    expect(
      sanitizeRelColor({
        rings: { metric: 'roughness', range: 'fit' },
        near: { metric: 'off', range: 'bad' },
        monzo: { metric: 'tenney', octave: 'reduced' },
      })
    ).toEqual({
      rings: { metric: 'roughness', range: 'fit' },
      near: { metric: 'off', range: 'fixed' },
      monzo: { metric: 'tenney', range: 'fixed', octave: 'reduced' },
    });
  });
  it('the old flat shape is read into all three views', () => {
    const v = sanitizeRelColor({ metric: 'odd', range: 'fit', octave: 'reduced' });
    expect(v.rings).toEqual({ metric: 'odd', range: 'fit' });
    expect(v.near).toEqual({ metric: 'odd', range: 'fit' });
    expect(v.monzo).toEqual({ metric: 'odd', range: 'fit', octave: 'reduced' });
  });
});

describe('metric values (D4 to D10)', () => {
  it('Tenney is log2(n x d)', () => {
    expect(metricValue('tenney', n('3/2'))).toBeCloseTo(2.585, 2);
    expect(metricValue('tenney', n('5/4'))).toBeCloseTo(4.322, 2);
    expect(metricValue('tenney', n('7/4'))).toBeCloseTo(4.807, 2);
    expect(metricValue('tenney', n('81/80'))).toBeCloseTo(12.66, 2);
  });
  it('odd limit is the larger odd part', () => {
    expect([n('3/2'), n('5/4'), n('7/4'), n('81/80')].map((x) => metricValue('odd', x))).toEqual([
      3, 5, 7, 81,
    ]);
  });
  it('error is the distance in cents to the nearest 12-EDO step', () => {
    expect(edoError(n('3/2').c)).toBeCloseTo(1.955, 2);
    expect(edoError(n('5/4').c)).toBeCloseTo(13.69, 1);
    expect(edoError(n('7/4').c)).toBeCloseTo(31.17, 1);
    expect(edoError(n('81/80').c)).toBeCloseTo(21.51, 1);
  });
  it('the largest prime of 81/80 is 5, like 5/4; the octave has no odd prime', () => {
    expect(largestPrimeOf(n('81/80'))).toBe(5);
    expect(largestPrimeOf(n('5/4'))).toBe(5);
    expect(largestPrimeOf(n('3/2'))).toBe(3);
    expect(largestPrimeOf(n('7/4'))).toBe(7);
    expect(largestPrimeOf(n('2/1'))).toBe(2);
    expect(largestPrimeOf({ m: null, c: 100 })).toBeNull();
  });
  it('roughness comes from the lab dyad function: 81/80 is rougher than 3/2', () => {
    const r = (t: string) => metricValue('roughness', n(t)) as number;
    expect(r('3/2')).toBeLessThan(r('7/4'));
    expect(r('3/2')).toBeLessThan(r('81/80'));
    expect(r('81/80')).toBeGreaterThan(r('5/4'));
  });
});

describe('Prime', () => {
  it('dots keep Near’s solid prime colors, and 81/80 matches 5/4', () => {
    expect(tintOf(n('3/2'), ctx('prime'))?.mark).toBe(primeColor(3));
    expect(tintOf(n('7/4'), ctx('prime'))?.mark).toBe(primeColor(7));
    expect(tintOf(n('81/80'), ctx('prime'))?.fill).toBe(tintOf(n('5/4'), ctx('prime'))?.fill);
    expect(tintOf(n('3/2'), ctx('prime'))?.fill).not.toBe(tintOf(n('5/4'), ctx('prime'))?.fill);
  });
  it('D22: the fill is the tile look, not the solid dot color (Tinted: background step, text step 12)', () => {
    for (const t of ['3/2', '5/4', '7/4']) {
      const tint = tintOf(n(t), ctx('prime'));
      expect(tint?.fill).not.toBe(tint?.mark);
      expect(tint?.text).toMatch(/^var\(--rx-[a-z]+-12\)$|^color-mix/);
      expect(tint?.fill).toMatch(/-[345]\)/);
    }
    // 3 is the first wheel slot: Tinted strong = step 5 of its hue
    expect(tintOf(n('3/2'), ctx('prime'))?.fill).toMatch(/-5\)/);
  });
  it('Outlined: the neutral slot fill with a hue border; Solid: a solid step with black or white text', () => {
    const o = tintOf(n('3/2'), ctx('prime', 'simple', 'dark', null, 'outlined'));
    expect(o?.fill).toBe('var(--panel-slot)');
    expect(o?.border).not.toBe('transparent');
    const s = tintOf(n('3/2'), ctx('prime', 'simple', 'dark', null, 'solid'));
    expect(s?.text).toMatch(/mantine-color-(black|white)/);
    expect(s?.fill).not.toBe('var(--panel-slot)');
  });
  it('every metric follows the look: Outlined fills are the neutral slot', () => {
    for (const metric of ['prime', 'tenney', 'odd', 'roughness', 'error', 'interval'] as const) {
      const t = tintOf(n('5/4'), ctx(metric, 'simple', 'light', null, 'outlined'));
      expect(t?.fill === 'var(--panel-slot)' || t?.fill.startsWith('color-mix')).toBe(true);
    }
  });
  it('the octave has no hue', () => {
    expect(tintOf(n('2/1'), ctx('prime'))?.mark).toBe(primeColor(2));
  });
});

describe('shading (Tenney, Odd limit, Roughness), Simple stands out', () => {
  it('Tenney, fixed: 3/2 strongest to 81/80 faintest (D5)', () => {
    const s = ['3/2', '5/4', '7/4', '81/80'].map((t) => stepOf(tintOf(n(t), ctx('tenney'))));
    expect(s[0]).toBeGreaterThan(s[1]);
    expect(s[1]).toBeGreaterThanOrEqual(s[2]);
    expect(s[2]).toBeGreaterThan(s[3]);
    expect(s[0]).toBe(Math.max(...SHADE_STEPS.dark));
  });
  it('Odd limit orders like Tenney (D7)', () => {
    const s = ['3/2', '5/4', '7/4', '81/80'].map((t) => stepOf(tintOf(n(t), ctx('odd'))));
    expect(s[0]).toBeGreaterThan(s[1]);
    expect(s[1]).toBeGreaterThanOrEqual(s[2]);
    expect(s[2]).toBeGreaterThan(s[3]);
  });
  it('Roughness: the smoothest of the four is strongest, the roughest faintest (D10)', () => {
    const t = (x: string) => stepOf(tintOf(n(x), ctx('roughness')));
    expect(t('3/2')).toBeGreaterThan(t('81/80'));
  });
  it('Complex stands out flips every one of them, in both schemes', () => {
    for (const metric of ['tenney', 'odd', 'roughness'] as const) {
      for (const scheme of ['dark', 'light'] as const) {
        const simple = (x: string) => stepOf(tintOf(n(x), ctx(metric, 'simple', scheme)));
        const complex = (x: string) => stepOf(tintOf(n(x), ctx(metric, 'complex', scheme)));
        expect(simple('3/2')).toBeGreaterThan(simple('81/80'));
        expect(complex('3/2')).toBeLessThan(complex('81/80'));
        expect(complex('81/80')).toBeGreaterThan(simple('81/80'));
      }
    }
  });
  it('Fit to view: the view’s simplest is strongest and its most complex faintest (D6)', () => {
    const view = [n('3/2'), n('5/4'), n('7/4')];
    const bounds = fitBounds('tenney', view);
    const s = view.map((x) => stepOf(tintOf(x, ctx('tenney', 'simple', 'dark', bounds))));
    expect(bounds?.lo).toBeCloseTo(2.585, 2);
    expect(bounds?.hi).toBeCloseTo(4.807, 2);
    expect(s[0]).toBe(Math.max(...SHADE_STEPS.dark));
    expect(s[2]).toBe(Math.min(...SHADE_STEPS.dark));
    expect(s[0]).toBeGreaterThan(s[1]);
    expect(s[1]).toBeGreaterThan(s[2]);
  });
  it('a flat fit range (one cell) reads as the middle, and no bounds fits nothing', () => {
    expect(complexityPosition('tenney', 3, { lo: 3, hi: 3 })).toBe(0.5);
    expect(fitBounds('tenney', [])).toBeNull();
  });
  it('fixed bounds are named and ordered', () => {
    for (const b of Object.values(FIXED_BOUNDS)) {
      expect(b.hi).toBeGreaterThan(b.lo);
    }
  });
});

describe('Error and Interval', () => {
  it('Error: a bigger error reads as a hotter band, an exact one is neutral', () => {
    const f = (x: string) => tintOf(n(x), ctx('error', 'simple', 'dark'))?.fill;
    expect(f('2/1')).not.toBe(f('7/4'));
    expect(f('3/2')).not.toBe(f('7/4'));
    expect(tintOf(n('2/1'), ctx('error'))?.text).toBe('var(--text)');
  });
  it('Error: sharp is the orange hue, flat the cyan hue, exact neutral (same as the Pairs tiles)', () => {
    const fillOf = (x: string) => tintOf(n(x), ctx('error', 'simple', 'dark'))?.fill;
    const tileFill = (cents: number) => signedErrorTile(cents, 'tinted', false, 'dark').fill;
    expect(fillOf('3/2')).toBe(tileFill(signedEdoError(n('3/2').c)));
    expect(fillOf('3/2')).toContain('orange');
    expect(fillOf('5/4')).toBe(tileFill(signedEdoError(n('5/4').c)));
    expect(fillOf('5/4')).toContain('cyan');
    expect(fillOf('7/4')).toContain('cyan');
    expect(fillOf('2/1')).toBe(tileFill(0));
    expect(fillOf('2/1')).not.toMatch(/orange|cyan/);
  });
  it('Interval: the hue follows the size, so equal intervals match and 81/80 sits at the unison', () => {
    const f = (x: string) => tintOf(n(x), ctx('interval'))?.fill;
    expect(f('3/2')).toBe(f('3/2'));
    expect(f('3/2')).not.toBe(f('5/4'));
    expect(f('3/2')).not.toBe(f('7/4'));
  });
});

describe('Monzo cells (D13 to D17)', () => {
  const painted = monzo({ 2: -4, 3: 4, 5: -1 });
  const cell = (cells: Note[][], prime: number, v: number): Note =>
    cells[MONZO_PRIMES.indexOf(prime as (typeof MONZO_PRIMES)[number])][12 - v];
  it('each cell is the painted monzo with only that exponent changed, exact', () => {
    const cells = monzoCellNotes(painted, 'exact');
    expect(cells).toHaveLength(MONZO_PRIMES.length);
    expect(cells[0]).toHaveLength(25);
    const t = (p: number, v: number) => metricValue('tenney', cell(cells, p, v));
    expect(t(5, 0)).toBeCloseTo(10.34, 2); // [-4 4 0> = 81/16
    expect(t(3, 0)).toBeCloseTo(6.32, 2); // [-4 0 -1> = 1/80
    expect(t(7, 1)).toBeCloseTo(15.47, 2); // [-4 4 -1 1> = 567/80
    expect(t(5, -1)).toBeCloseTo(12.66, 2); // the painted cell itself is 81/80
  });
  it('Prime colors of those cells: 3, 5, 7, and the painted cells like 5/4', () => {
    const cells = monzoCellNotes(painted, 'exact');
    const prime = (p: number, v: number) => tintOf(cell(cells, p, v), ctx('prime'))?.mark;
    expect(prime(5, 0)).toBe(primeColor(3));
    expect(prime(3, 0)).toBe(primeColor(5));
    expect(prime(7, 1)).toBe(primeColor(7));
    expect(prime(5, -1)).toBe(primeColor(5));
  });
  it('Reduced folds into one octave: 81/16 becomes 81/64 (12.34)', () => {
    const cells = monzoCellNotes(painted, 'reduced');
    expect(metricValue('tenney', cell(cells, 5, 0))).toBeCloseTo(12.34, 2);
    expect(metricValue('tenney', foldOctave(n('81/16')))).toBeCloseTo(12.34, 2);
    for (const col of cells) {
      for (const note of col) {
        expect(note.c).toBeGreaterThanOrEqual(-1e-6);
        expect(note.c).toBeLessThan(1200 + 1e-6);
      }
    }
  });
  it('nothing painted: a cell is that prime power alone (prime 5, exponent 2 = 25/1)', () => {
    const cells = monzoCellNotes(zeroMonzo(), 'exact');
    expect(metricValue('odd', cell(cells, 5, 2))).toBe(25);
    expect(metricValue('tenney', cell(cells, 5, 2))).toBeCloseTo(Math.log2(25), 6);
    expect(metricValue('tenney', cell(cells, 3, 0))).toBe(0);
  });
  it('the tints of the cells keep the grid shape; Fit uses the cells’ own min and max', () => {
    const cells = monzoCellNotes(painted, 'exact');
    const base = {
      metric: 'tenney' as const,
      intensity: 'strong' as const,
      scheme: 'dark' as const,
      look: 'tinted' as const,
      outline: false,
      repC: 1200,
    };
    const fit = monzoCellTints(cells, { ...base, range: 'fit' });
    expect(fit).toHaveLength(MONZO_PRIMES.length);
    const steps = fit.flat().map((t) => stepOf(t));
    expect(Math.max(...steps)).toBe(Math.max(...SHADE_STEPS.dark));
    expect(Math.min(...steps)).toBe(Math.min(...SHADE_STEPS.dark));
  });
});

describe('legend (D23)', () => {
  const look = { look: 'tinted' as const, outline: false, scheme: 'dark' as const };
  it('the strong end is named by the Interval intensity', () => {
    expect(strongEndOf('strong')).toBe('simple');
    expect(strongEndOf('faint')).toBe('complex');
  });
  it('a shaded bar runs simplest to most complex and flips with the intensity', () => {
    const simple = shadeBarColors({ ...look, intensity: 'strong' }, 6);
    const complex = shadeBarColors({ ...look, intensity: 'faint' }, 6);
    expect(simple).toHaveLength(6);
    expect(simple[0]).toBe(`var(--rx-violet-${Math.max(...SHADE_STEPS.dark)})`);
    expect(simple[5]).toBe(`var(--rx-violet-${Math.min(...SHADE_STEPS.dark)})`);
    expect(complex).toEqual([...simple].reverse());
  });
  it('the bar is sampled from the cell function: a cell at an end has the end color', () => {
    const bar = shadeBarColors({ ...look, intensity: 'strong' }, 12);
    expect(tintOf(n('3/2'), ctx('tenney'))?.fill).toBe(bar[0]);
    expect(tintOf(n('81/80'), ctx('odd'))?.fill).not.toBe(bar[0]);
  });
  it('ends: fixed bounds, or the view for Fit; Odd limit shows limits, Tenney log2 values', () => {
    expect(legendBounds('odd', null)).toEqual({ lo: 3, hi: 255 });
    expect(legendBounds('tenney', null)).toEqual(FIXED_BOUNDS.tenney);
    expect(legendBounds('roughness', null)).toEqual(FIXED_BOUNDS.roughness);
    const fit = fitBounds('tenney', [n('3/2'), n('7/4')]);
    expect(legendBounds('tenney', fit)).toEqual(fit);
    expect(legendBounds('prime', null)).toBeNull();
    expect(legendNumber('odd', 255)).toBe('255');
    expect(legendNumber('tenney', FIXED_BOUNDS.tenney.lo)).toBe('2.58');
  });
  it('the hover tick: position along the bar, clamped, with a beyond flag', () => {
    const mark = (t: string, metric: Parameters<typeof legendMarkOf>[0] = 'odd') =>
      legendMarkOf(metric, n(t), null, 1200);
    expect(mark('3/2')).toEqual({ kind: 'pos', pos: 0, beyond: 0 });
    const m81 = mark('81/80');
    expect(m81?.kind === 'pos' && m81.pos > 0.5 && m81.beyond === 0).toBe(true);
    // 1023 is beyond the fixed odd limit 255: pinned to the complex end, flagged
    expect(mark('1023/1024')).toEqual({ kind: 'pos', pos: 1, beyond: 1 });
    // Tenney 1/1 is 0: below the fixed 2.58, so beyond the simple end
    expect(legendMarkOf('tenney', n('1/1'), null, 1200)).toEqual({
      kind: 'pos',
      pos: 0,
      beyond: -1,
    });
    // Fit to view: the view's own ends
    const fit = fitBounds('tenney', [n('3/2'), n('7/4')]);
    expect(legendMarkOf('tenney', n('7/4'), fit, 1200)).toEqual({ kind: 'pos', pos: 1, beyond: 0 });
  });
  it('Prime and Interval marks are swatch keys; an irrational note has none', () => {
    expect(legendMarkOf('prime', n('81/80'), null, 1200)).toEqual({ kind: 'key', key: 5 });
    expect(legendMarkOf('interval', n('3/2'), null, 1200)).toEqual({ kind: 'key', key: 7 });
    expect(legendMarkOf('interval', n('2/1'), null, 1200)).toEqual({ kind: 'key', key: 0 });
    expect(legendMarkOf('prime', { m: null, c: 100 }, null, 1200)).toBeNull();
    expect(legendMarkOf('odd', { m: null, c: 100 }, null, 1200)).toBeNull();
  });
  it('Error: the tick sits on the fixed 8-segment strip, 0 c in the middle', () => {
    expect(errorStripPosition(0)).toEqual({ pos: 0.5, beyond: 0 });
    expect(errorStripPosition(5).pos).toBeCloseTo(0.625);
    // the same boundaries as errorBand: 5 c is band 2, so it sits exactly on the +5 tick; 4.99 c is inside +0..+5
    expect(errorStripPosition(5).pos).toBeCloseTo(0.625, 10);
    expect(errorStripPosition(4.99).pos).toBeLessThan(0.625);
    expect(errorStripPosition(4.99).pos).toBeGreaterThan(0.5);
    expect(errorStripPosition(-5).pos).toBeCloseTo(0.375);
    expect(errorStripPosition(15).pos).toBeCloseTo(0.75);
    // 7/4 is -31.2 c: beyond on the flat side, pinned to the flat end
    expect(errorStripPosition(-31.2)).toEqual({ pos: 0, beyond: -1 });
    expect(legendMarkOf('error', n('7/4'), null, 1200)).toEqual({
      kind: 'error',
      cents: expect.closeTo(-31.17, 1),
    });
    // +21.5 c (81/80): inside the +15..+30 segment (0.75 to 0.875), linear in cents
    const s = errorStripPosition(21.5);
    expect(s.beyond).toBe(0);
    expect(s.pos).toBeCloseTo(0.75 + (6.5 / 15) * 0.125, 4);
  });
  it('Interval class: 12 swatches, each its own wheel slot', () => {
    const t = intervalClassTints(look);
    expect(t).toHaveLength(12);
    expect(INTERVAL_CLASSES[7]).toBe('P5');
    expect(new Set(t.map((x) => x.fill)).size).toBe(12);
  });
  it('Outlined bars use the border color, since the fill is the neutral slot', () => {
    const bar = shadeBarColors(
      { look: 'outlined', outline: false, scheme: 'dark', intensity: 'strong' },
      3
    );
    expect(bar.every((c) => c !== 'var(--panel-slot)')).toBe(true);
  });
});
