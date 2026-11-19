import { describe, expect, it } from 'vitest';
import {
  MONZO_PRIMES,
  heAt,
  heCandidates,
  heCurve,
  heFixedRange,
  heRange,
  noteText,
  parseInterval,
  zeroMonzo,
  type MonzoExps,
  type Note,
} from '../../../lib/harmonic-field';
import { hexToLinearRgb, linearContrast } from '../../../theme/markers';
import { RADIX_HUES, radixHex } from '../../../theme/radix';
import { defaultThemeTokens } from '../../../theme/tokens';
import {
  BRIGHT_FILL_STEPS,
  BRIGHT_MARK_STEPS,
  BRIGHT_PLAIN_TEXT_FROM,
  REL_MEASURES,
  fillStepOf,
  measuredNote,
  ERROR_BAR_BANDS,
  FIXED_BOUNDS,
  INTERVAL_CLASSES,
  PRESET_CUSTOM,
  REL_BRIGHTS,
  REL_COLOR_DEFAULT,
  REL_HUES,
  REL_PRESETS,
  barEndWords,
  brightBarColors,
  complexityPosition,
  edoError,
  errorSignTints,
  errorStripPosition,
  fitBounds,
  foldOctave,
  hasRange,
  intervalClassTints,
  largestPrimeOf,
  legendBounds,
  legendMarksOf,
  legendNumber,
  metricValue,
  monzoCellNotes,
  monzoCellTints,
  presetOf,
  primeColor,
  MEASURE_RAMP,
  RAMP_LEVELS,
  hueBarColors,
  rampColor,
  sanitizeRelColor,
  signedEdoError,
  strongEndOf,
  tintOf,
  usesEntropy,
  usesIntensity,
  usesRange,
  type EntropySource,
  type RelBright,
  type RelHue,
  type TintContext,
} from './intervalColor';
import { signedErrorTile, type TileScheme } from './tileColors';

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
  hue: RelHue,
  bright: RelBright,
  strong: Strong = 'simple',
  scheme: TintContext['scheme'] = 'dark',
  bounds: TintContext['bounds'] = null,
  look: TintContext['look'] = 'tinted'
): TintContext => ({
  hue,
  bright,
  // intervalIntensity: `strong` = Simple strong, `faint` = Complex strong
  intensity: strong === 'simple' ? 'strong' : 'faint',
  scheme,
  look,
  outline: false,
  repC: 1200,
  bounds,
});
/** The ramp step of a shaded tint (`var(--rx-blue-N)`). */
const stepOf = (t: ReturnType<typeof tintOf>): number =>
  Number(/-(\d+)\)$/.exec(t?.fill ?? '')?.[1]);
/** The Radix hue names a color uses (a wheel blend has two). */
const huesOf = (c: string | undefined): string[] => [
  ...new Set([...(c ?? '').matchAll(/--rx-([a-z]+)-\d+/g)].map((m) => m[1])),
];

/** The panels the marks and fills are measured against (dark: #2e2c2a as the human measured it; light: the white panel token). */
const PANEL: Record<TileScheme, string> = { dark: '#2e2c2a', light: defaultThemeTokens.white };
const TEXT: Record<TileScheme, string> = {
  dark: defaultThemeTokens.white,
  light: defaultThemeTokens.black,
};
/** WCAG contrast of two hex colors, computed from the Radix values (no browser). */
const contrast = (a: string, b: string): number =>
  linearContrast(hexToLinearRgb(a), hexToLinearRgb(b));

describe('settings (H-40)', () => {
  it('absent or damaged reads as the Families preset in every view', () => {
    for (const raw of [undefined, null, 5, 'x', [], {}, { metric: 'nope', range: 3, octave: {} }]) {
      expect(sanitizeRelColor(raw)).toEqual(REL_COLOR_DEFAULT);
    }
    expect(REL_COLOR_DEFAULT).toEqual({
      rings: { hue: 'prime', bright: 'off', range: 'fixed', measure: 'step', followAlt: false },
      near: {
        hue: 'prime',
        bright: 'off',
        range: 'fixed',
        measure: 'step',
        followAlt: false,
        radius: 'tenney',
      },
      monzo: {
        hue: 'prime',
        bright: 'off',
        range: 'fixed',
        measure: 'step',
        followAlt: false,
        octave: 'exact',
      },
    });
    expect(presetOf({ ...REL_COLOR_DEFAULT.near })).toBe('families');
  });
  it('keeps each valid field on its own, per view', () => {
    expect(
      sanitizeRelColor({
        rings: { hue: 'errorSign', bright: 'roughness', range: 'fit' },
        near: { hue: 'off', bright: 'bad', range: 'bad', radius: 'entropy' },
        monzo: { bright: 'tenney', octave: 'reduced' },
      })
    ).toEqual({
      rings: {
        hue: 'errorSign',
        bright: 'roughness',
        range: 'fit',
        measure: 'step',
        followAlt: false,
      },
      near: {
        hue: 'off',
        bright: 'off',
        range: 'fixed',
        measure: 'step',
        followAlt: false,
        radius: 'entropy',
      },
      monzo: {
        hue: 'prime',
        bright: 'tenney',
        range: 'fixed',
        measure: 'step',
        followAlt: false,
        octave: 'reduced',
      },
    });
    expect(sanitizeRelColor({ near: { radius: 'nope' } }).near.radius).toBe('tenney');
  });
  it('the old { metric } shape migrates: prime/interval -> hue, measures -> brightness (hue off), error -> sign + size, off -> both off', () => {
    const view = (metric: string) => sanitizeRelColor({ rings: { metric, range: 'fit' } }).rings;
    expect(view('prime')).toEqual({
      hue: 'prime',
      bright: 'off',
      range: 'fit',
      measure: 'step',
      followAlt: false,
    });
    expect(view('interval')).toEqual({
      hue: 'interval',
      bright: 'off',
      range: 'fit',
      measure: 'step',
      followAlt: false,
    });
    for (const m of ['tenney', 'odd', 'roughness', 'entropy'] as const) {
      expect(view(m)).toEqual({
        hue: 'off',
        bright: m,
        range: 'fit',
        measure: 'step',
        followAlt: false,
      });
    }
    expect(view('error')).toEqual({
      hue: 'errorSign',
      bright: 'errorSize',
      range: 'fit',
      measure: 'step',
      followAlt: false,
    });
    expect(view('off')).toEqual({
      hue: 'off',
      bright: 'off',
      range: 'fit',
      measure: 'step',
      followAlt: false,
    });
    expect(view('nope')).toEqual({
      hue: 'prime',
      bright: 'off',
      range: 'fit',
      measure: 'step',
      followAlt: false,
    });
  });
  it('the old per-view shape keeps Near on the Tenney radius and the Monzo octave', () => {
    const v = sanitizeRelColor({
      rings: { metric: 'odd' },
      near: { metric: 'error', range: 'fit' },
      monzo: { metric: 'tenney', octave: 'reduced' },
    });
    expect(v.near).toEqual({
      hue: 'errorSign',
      bright: 'errorSize',
      range: 'fit',
      measure: 'step',
      followAlt: false,
      radius: 'tenney',
    });
    expect(v.rings).toEqual({
      hue: 'off',
      bright: 'odd',
      range: 'fixed',
      measure: 'step',
      followAlt: false,
    });
    expect(v.monzo).toEqual({
      hue: 'off',
      bright: 'tenney',
      range: 'fixed',
      measure: 'step',
      followAlt: false,
      octave: 'reduced',
    });
  });
  it('the older flat shape is read into all three views the same way', () => {
    const v = sanitizeRelColor({ metric: 'odd', range: 'fit', octave: 'reduced' });
    expect(v.rings).toEqual({
      hue: 'off',
      bright: 'odd',
      range: 'fit',
      measure: 'step',
      followAlt: false,
    });
    expect(v.near).toEqual({
      hue: 'off',
      bright: 'odd',
      range: 'fit',
      measure: 'step',
      followAlt: false,
      radius: 'tenney',
    });
    expect(v.monzo).toEqual({
      hue: 'off',
      bright: 'odd',
      range: 'fit',
      measure: 'step',
      followAlt: false,
      octave: 'reduced',
    });
  });
  it('the channel lists are the Hue and Brightness choices of the scenarios', () => {
    expect(REL_HUES).toEqual([
      'off',
      'prime',
      'interval',
      'errorSign',
      'tenney',
      'odd',
      'roughness',
      'entropy',
      'errorSize',
    ]);
    expect(REL_BRIGHTS).toEqual(['off', 'tenney', 'odd', 'roughness', 'entropy', 'errorSize']);
    expect(hasRange('errorSize')).toBe(false);
    expect(hasRange('entropy')).toBe(true);
    expect(usesIntensity('errorSize')).toBe(false);
    expect(usesIntensity('off')).toBe(false);
    expect(usesIntensity('tenney')).toBe(true);
    expect(usesEntropy({ bright: 'off', radius: 'entropy' })).toBe(true);
    expect(usesEntropy({ bright: 'tenney' })).toBe(false);
    expect(usesEntropy({ hue: 'entropy', bright: 'off' })).toBe(true);
    expect(usesRange({ hue: 'tenney', bright: 'off' })).toBe(true);
    expect(usesRange({ hue: 'errorSize', bright: 'errorSize' })).toBe(false);
    expect(usesRange({ hue: 'prime', bright: 'off' })).toBe(false);
  });
  it('F11: the new Hue values are stored and kept; Custom detection handles them', () => {
    for (const h of ['tenney', 'odd', 'roughness', 'entropy', 'errorSize'] as const) {
      expect(sanitizeRelColor({ rings: { hue: h, bright: 'tenney' } }).rings.hue).toBe(h);
      expect(presetOf({ hue: h, bright: 'off' })).toBe(PRESET_CUSTOM);
    }
    // the old values stay valid
    expect(sanitizeRelColor({ rings: { hue: 'interval' } }).rings.hue).toBe('interval');
  });
});

describe('presets (SCENARIOS F-presets)', () => {
  it('six presets, Families first; the table of the scenarios', () => {
    expect(REL_PRESETS.map((p) => [p.label, p.radius, p.hue, p.bright])).toEqual([
      ['Families', 'tenney', 'prime', 'off'],
      ['Ear vs paper', 'tenney', 'prime', 'entropy'],
      ['Tuning check', 'tenney', 'errorSign', 'errorSize'],
      ['Consonance', 'entropy', 'off', 'roughness'],
      ['Interval classes', 'odd', 'interval', 'tenney'],
      ['Plain', 'tenney', 'off', 'off'],
    ]);
  });
  it('the select shows the preset the channels equal, else Custom; Rings and Monzo ignore the radius', () => {
    for (const p of REL_PRESETS) {
      expect(presetOf({ hue: p.hue, bright: p.bright, radius: p.radius })).toBe(p.id);
      expect(presetOf({ hue: p.hue, bright: p.bright })).toBe(p.id);
    }
    expect(presetOf({ hue: 'prime', bright: 'tenney', radius: 'tenney' })).toBe(PRESET_CUSTOM);
    // Families' hue and brightness with another radius is Custom in Near
    expect(presetOf({ hue: 'prime', bright: 'off', radius: 'odd' })).toBe(PRESET_CUSTOM);
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
  it('error size is the distance in cents to the nearest 12-EDO step', () => {
    expect(edoError(n('3/2').c)).toBeCloseTo(1.955, 2);
    expect(edoError(n('5/4').c)).toBeCloseTo(13.69, 1);
    expect(edoError(n('7/4').c)).toBeCloseTo(31.17, 1);
    expect(edoError(n('81/80').c)).toBeCloseTo(21.51, 1);
    expect(metricValue('errorSize', n('5/4'))).toBeCloseTo(13.69, 1);
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

describe('contrast floor (F1): measured from the Radix values, not the browser', () => {
  it('dark marks: faint end at least 2:1 on the dark panel, strong end at least 4.5:1, rising', () => {
    const c = BRIGHT_MARK_STEPS.dark.map((s) => contrast(radixHex('dark', 'blue', s), PANEL.dark));
    expect(c[0]).toBeGreaterThanOrEqual(2);
    expect(c[c.length - 1]).toBeGreaterThanOrEqual(4.5);
    expect(c).toEqual([...c].sort((a, b) => a - b));
    // the numbers of the scenarios: steps 7..12 = 2.07, 2.74, 4.26, 4.98, 6.62, 10.6
    expect(BRIGHT_MARK_STEPS.dark).toEqual([7, 8, 9, 10, 11, 12]);
    expect(c[0]).toBeCloseTo(2.07, 1);
    expect(c[5]).toBeCloseTo(10.6, 0);
  });
  it('light marks (mirrored): faint end at least 2:1 on the light panel, strong end at least 4.5:1', () => {
    const c = BRIGHT_MARK_STEPS.light.map((s) =>
      contrast(radixHex('light', 'blue', s), PANEL.light)
    );
    expect(c[0]).toBeGreaterThanOrEqual(2);
    expect(c.find((v) => v >= 4.5)).toBeDefined();
    expect(c[c.length - 1]).toBeGreaterThanOrEqual(4.5);
    expect(c).toEqual([...c].sort((a, b) => a - b));
  });
  it('fills: the faint end is lifted off the panel (Tinted steps 3 and 4 are about 1.07 and 1.09:1) and the text reads on every fill', () => {
    for (const scheme of ['dark', 'light'] as const) {
      const fills = BRIGHT_FILL_STEPS[scheme];
      const vsPanel = fills.map((s) => contrast(radixHex(scheme, 'blue', s), PANEL[scheme]));
      expect(contrast(radixHex(scheme, 'blue', 4), PANEL[scheme])).toBeLessThan(1.15);
      expect(vsPanel[0]).toBeGreaterThan(1.2);
      expect(vsPanel).toEqual([...vsPanel].sort((a, b) => a - b));
      for (const s of fills) {
        const text =
          s >= BRIGHT_PLAIN_TEXT_FROM[scheme] ? TEXT[scheme] : radixHex(scheme, 'blue', 12);
        expect(contrast(text, radixHex(scheme, 'blue', s))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('fills: the text reads (4.5:1) on every fill step of every Radix hue of the wheel, the prime and interval-class hues', () => {
    const low: string[] = [];
    for (const scheme of ['dark', 'light'] as const) {
      for (const hue of RADIX_HUES) {
        for (const ramp of BRIGHT_FILL_STEPS[scheme]) {
          const s = fillStepOf(scheme, hue, ramp);
          const text =
            s >= BRIGHT_PLAIN_TEXT_FROM[scheme] ? TEXT[scheme] : radixHex(scheme, hue, 12);
          const c = contrast(text, radixHex(scheme, hue, s));
          if (c < 4.5) {
            low.push(`${scheme} ${hue} step ${s}: ${c.toFixed(2)}`);
          }
        }
      }
    }
    // no exceptions (M9d G8 to G10: the strongest fill of dark cyan, light violet and light pink is one step weaker)
    expect(low).toEqual([]);
  });
  it('M9d: the three capped fills are the one step weaker, and the tint uses it', () => {
    expect(fillStepOf('light', 'violet', 9)).toBe(8);
    expect(fillStepOf('light', 'pink', 9)).toBe(8);
    expect(fillStepOf('dark', 'cyan', 8)).toBe(7);
    expect(fillStepOf('dark', 'violet', 8)).toBe(8);
    expect(fillStepOf('light', 'cyan', 9)).toBe(9);
    for (const [scheme, hue, from, to] of [
      ['light', 'violet', 9, 8],
      ['light', 'pink', 9, 8],
      ['dark', 'cyan', 8, 7],
    ] as const) {
      const c = (st: number) =>
        contrast(
          st >= BRIGHT_PLAIN_TEXT_FROM[scheme] ? TEXT[scheme] : radixHex(scheme, hue, 12),
          radixHex(scheme, hue, st)
        );
      // report: was, now
      expect(c(from)).toBeLessThan(4.5);
      expect(c(to)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('the tint uses exactly those steps (the blue ramp, Hue off), and the plain text on the strongest fills', () => {
    for (const scheme of ['dark', 'light'] as const) {
      const strong = tintOf(n('3/2'), ctx('off', 'tenney', 'simple', scheme));
      const faint = tintOf(n('81/80'), ctx('off', 'tenney', 'complex', scheme));
      expect(strong?.fill).toBe(`var(--rx-blue-${Math.max(...BRIGHT_FILL_STEPS[scheme])})`);
      expect(strong?.mark).toBe(`var(--rx-blue-${Math.max(...BRIGHT_MARK_STEPS[scheme])})`);
      expect(strong?.text).toBe('var(--text)');
      expect(faint?.fill).toMatch(/var\(--rx-blue-\d+\)/);
    }
    expect(tintOf(n('81/80'), ctx('off', 'tenney'))?.text).toBe('var(--rx-blue-12)');
  });
});

describe('Hue Prime, Brightness Off (F3: the tile look)', () => {
  it('dots keep Near’s solid prime colors, and 81/80 matches 5/4', () => {
    expect(tintOf(n('3/2'), ctx('prime', 'off'))?.mark).toBe(primeColor(3));
    expect(tintOf(n('7/4'), ctx('prime', 'off'))?.mark).toBe(primeColor(7));
    expect(tintOf(n('81/80'), ctx('prime', 'off'))?.fill).toBe(
      tintOf(n('5/4'), ctx('prime', 'off'))?.fill
    );
    expect(tintOf(n('3/2'), ctx('prime', 'off'))?.fill).not.toBe(
      tintOf(n('5/4'), ctx('prime', 'off'))?.fill
    );
  });
  it('D22: the fill is the tile look, not the solid dot color (Tinted: background step, text step 12)', () => {
    for (const t of ['3/2', '5/4', '7/4']) {
      const tint = tintOf(n(t), ctx('prime', 'off'));
      expect(tint?.fill).not.toBe(tint?.mark);
      expect(tint?.text).toMatch(/^var\(--rx-[a-z]+-12\)$|^color-mix/);
      expect(tint?.fill).toMatch(/-[345]\)/);
    }
    // 3 is the first wheel slot: Tinted strong = step 5 of its hue
    expect(tintOf(n('3/2'), ctx('prime', 'off'))?.fill).toMatch(/-5\)/);
  });
  it('Outlined: the neutral slot fill with a hue border; Solid: a solid step with black or white text', () => {
    const o = tintOf(n('3/2'), ctx('prime', 'off', 'simple', 'dark', null, 'outlined'));
    expect(o?.fill).toBe('var(--panel-slot)');
    expect(o?.border).not.toBe('transparent');
    const s = tintOf(n('3/2'), ctx('prime', 'off', 'simple', 'dark', null, 'solid'));
    expect(s?.text).toMatch(/mantine-color-(black|white)/);
    expect(s?.fill).not.toBe('var(--panel-slot)');
  });
  it('every channel pair follows the look: Outlined fills are the neutral slot (or a text mix)', () => {
    const pairs: [RelHue, RelBright][] = [
      ['prime', 'off'],
      ['off', 'tenney'],
      ['off', 'odd'],
      ['off', 'roughness'],
      ['errorSign', 'errorSize'],
      ['interval', 'off'],
      ['prime', 'tenney'],
      ['errorSign', 'tenney'],
    ];
    for (const [hue, bright] of pairs) {
      const t = tintOf(n('5/4'), ctx(hue, bright, 'simple', 'light', null, 'outlined'));
      expect(t?.fill === 'var(--panel-slot)' || t?.fill.startsWith('color-mix')).toBe(true);
    }
  });
  it('the octave has no hue', () => {
    expect(tintOf(n('2/1'), ctx('prime', 'off'))?.mark).toBe(primeColor(2));
  });
});

describe('Both off (F6)', () => {
  it('plain: no tint at all', () => {
    expect(tintOf(n('3/2'), ctx('off', 'off'))).toBeNull();
  });
});

describe('Brightness with Hue off: the blue ramp, Simple stands out (F1)', () => {
  it('Tenney, fixed: 3/2 strongest to 81/80 faintest (D5)', () => {
    const s = ['3/2', '5/4', '7/4', '81/80'].map((t) => stepOf(tintOf(n(t), ctx('off', 'tenney'))));
    // four fill levels: 3/2 and 5/4 may share the top one, never the other way round
    expect(s[0]).toBeGreaterThanOrEqual(s[1]);
    expect(s[1]).toBeGreaterThanOrEqual(s[2]);
    expect(s[2]).toBeGreaterThanOrEqual(s[3]);
    expect(s[0]).toBeGreaterThan(s[3]);
    expect(s[0]).toBe(Math.max(...BRIGHT_FILL_STEPS.dark));
  });
  it('Odd limit orders like Tenney (D7)', () => {
    const s = ['3/2', '5/4', '7/4', '81/80'].map((t) => stepOf(tintOf(n(t), ctx('off', 'odd'))));
    expect(s[0]).toBeGreaterThanOrEqual(s[1]);
    expect(s[1]).toBeGreaterThanOrEqual(s[2]);
    expect(s[2]).toBeGreaterThanOrEqual(s[3]);
    expect(s[0]).toBeGreaterThan(s[3]);
  });
  it('Roughness: the smoothest of the four is strongest, the roughest faintest (D10)', () => {
    const t = (x: string) => stepOf(tintOf(n(x), ctx('off', 'roughness')));
    expect(t('3/2')).toBeGreaterThan(t('81/80'));
  });
  it('Complex stands out flips every one of them, in both schemes', () => {
    for (const bright of ['tenney', 'odd', 'roughness'] as const) {
      for (const scheme of ['dark', 'light'] as const) {
        const simple = (x: string) => stepOf(tintOf(n(x), ctx('off', bright, 'simple', scheme)));
        const complex = (x: string) => stepOf(tintOf(n(x), ctx('off', bright, 'complex', scheme)));
        expect(simple('3/2')).toBeGreaterThan(simple('81/80'));
        expect(complex('3/2')).toBeLessThan(complex('81/80'));
        expect(complex('81/80')).toBeGreaterThan(simple('81/80'));
      }
    }
  });
  it('Fit to view: the view’s simplest is strongest and its most complex faintest (D6)', () => {
    const view = [n('3/2'), n('5/4'), n('7/4')];
    const bounds = fitBounds('tenney', view);
    const s = view.map((x) => stepOf(tintOf(x, ctx('off', 'tenney', 'simple', 'dark', bounds))));
    expect(bounds?.lo).toBeCloseTo(2.585, 2);
    expect(bounds?.hi).toBeCloseTo(4.807, 2);
    expect(s[0]).toBe(Math.max(...BRIGHT_FILL_STEPS.dark));
    expect(s[2]).toBe(Math.min(...BRIGHT_FILL_STEPS.dark));
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
  it('|error| (always the five bands, strong when large, whatever the intensity): 2/1 faintest, 7/4 strongest', () => {
    for (const strong of ['simple', 'complex'] as const) {
      const s = (x: string) => stepOf(tintOf(n(x), ctx('off', 'errorSize', strong)));
      expect(s('2/1')).toBe(Math.min(...BRIGHT_FILL_STEPS.dark));
      expect(s('7/4')).toBe(Math.max(...BRIGHT_FILL_STEPS.dark));
      expect(s('5/4')).toBeGreaterThan(s('3/2'));
    }
  });
});

describe('Hue set + Brightness: the hue’s own steps (F2)', () => {
  it('Prime + Tenney: the same hue family as Prime alone, the step follows the brightness', () => {
    const base = tintOf(n('7/4'), ctx('prime', 'off'));
    const bright = tintOf(n('7/4'), ctx('prime', 'tenney'));
    expect(huesOf(bright?.fill)).toEqual(huesOf(base?.fill));
    expect(huesOf(bright?.mark)).toEqual(huesOf(base?.mark));
    // 3/2 and 81/80 (hue of 5): their own hues, 3/2 stronger by Tenney
    expect(huesOf(tintOf(n('81/80'), ctx('prime', 'tenney'))?.fill)).toEqual(
      huesOf(tintOf(n('5/4'), ctx('prime', 'off'))?.fill)
    );
    const step = (t: string) =>
      Number(/-(\d+)\)/.exec(tintOf(n(t), ctx('prime', 'tenney'))?.fill ?? '')?.[1]);
    expect(step('3/2')).toBeGreaterThan(step('81/80'));
  });
  it('Prime keeps the wheel blend (color-mix between two Radix hues) while the step varies', () => {
    // prime 5 sits between two wheel hues: a blend at every step
    const f = (x: string, strong: Strong) =>
      tintOf(n(x), ctx('prime', 'tenney', strong))?.fill as string;
    expect(f('5/4', 'simple')).toContain('color-mix');
    expect(f('5/4', 'simple')).not.toBe(f('5/4', 'complex'));
  });
  it('Prime + Tenney in Outlined and Solid keep their look and use the hue', () => {
    const o = tintOf(n('3/2'), ctx('prime', 'tenney', 'simple', 'dark', null, 'outlined'));
    expect(o?.fill).toBe('var(--panel-slot)');
    const s = tintOf(n('3/2'), ctx('prime', 'tenney', 'simple', 'dark', null, 'solid'));
    expect(s?.text).toMatch(/mantine-color-(black|white)/);
  });
  it('the octave (prime 2, no hue) is a neutral ramp that still varies', () => {
    const a = tintOf(n('2/1'), ctx('prime', 'tenney', 'simple'));
    const b = tintOf(n('2/1'), ctx('prime', 'tenney', 'complex'));
    expect(a?.fill).toMatch(/^color-mix/);
    expect(a?.fill).not.toBe(b?.fill);
  });
  it('Interval class + Tenney: the hue follows the size, the step follows Tenney', () => {
    const f = (x: string) => tintOf(n(x), ctx('interval', 'tenney'));
    expect(huesOf(f('3/2')?.fill)).not.toEqual(huesOf(f('5/4')?.fill));
    const step = (x: string) => Number(/-(\d+)\)/.exec(f(x)?.fill ?? '')?.[1]);
    expect(step('3/2')).toBeGreaterThan(step('81/80'));
  });
});

describe('Error sign (F4, F5)', () => {
  it('F4: Error sign + |error| is exactly the H-38 tile (5/4, -13.7 c: cyan, band 2)', () => {
    const c = ctx('errorSign', 'errorSize');
    for (const x of ['3/2', '5/4', '7/4', '81/80', '2/1']) {
      const tile = signedErrorTile(signedEdoError(n(x).c), 'tinted', false, 'dark');
      expect(tintOf(n(x), c)?.fill).toBe(tile.fill);
      expect(tintOf(n(x), c)?.text).toBe(tile.text);
    }
    expect(tintOf(n('5/4'), c)?.fill).toContain('cyan');
    expect(tintOf(n('3/2'), c)?.fill).toContain('orange');
    expect(tintOf(n('2/1'), c)?.fill).not.toMatch(/orange|cyan/);
    expect(tintOf(n('2/1'), c)?.text).toBe('var(--text)');
  });
  it('sharp is orange, flat cyan, exact neutral; a bigger error reads as a hotter band', () => {
    const f = (x: string) => tintOf(n(x), ctx('errorSign', 'errorSize'))?.fill;
    expect(f('2/1')).not.toBe(f('7/4'));
    expect(f('3/2')).not.toBe(f('7/4'));
    expect(f('7/4')).toContain('cyan');
    expect(f('81/80')).toContain('orange');
  });
  it('Error sign with no Brightness: sign only, one fixed band (the tile look’s normal level)', () => {
    const f = (x: string) => tintOf(n(x), ctx('errorSign', 'off'))?.fill;
    expect(f('3/2')).toContain('orange');
    expect(f('5/4')).toContain('cyan');
    expect(f('7/4')).toBe(f('5/4'));
    expect(f('2/1')).not.toMatch(/orange|cyan/);
  });
  it('F5: Error sign + Tenney: the sign from the error, the lightness from Tenney', () => {
    const t = (x: string) => tintOf(n(x), ctx('errorSign', 'tenney'));
    expect(t('5/4')?.fill).toContain('cyan');
    expect(t('7/4')?.fill).toContain('cyan');
    expect(t('3/2')?.fill).toContain('orange');
    expect(t('81/80')?.fill).toContain('orange');
    // same sign, different Tenney: 5/4 (4.3) is brighter than 7/4 (4.8)... and 3/2 (2.6) than 81/80 (12.7)
    expect(stepOf(t('5/4'))).toBeGreaterThanOrEqual(stepOf(t('7/4')));
    expect(stepOf(t('3/2'))).toBeGreaterThan(stepOf(t('81/80')));
    expect(t('2/1')?.fill).not.toMatch(/orange|cyan/);
  });
});

describe('Interval class', () => {
  it('the hue follows the size, so equal intervals match', () => {
    const f = (x: string) => tintOf(n(x), ctx('interval', 'off'))?.fill;
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
    const prime = (p: number, v: number) => tintOf(cell(cells, p, v), ctx('prime', 'off'))?.mark;
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
      hue: 'off' as const,
      bright: 'tenney' as const,
      intensity: 'strong' as const,
      scheme: 'dark' as const,
      look: 'tinted' as const,
      outline: false,
      repC: 1200,
    };
    const fit = monzoCellTints(cells, { ...base, range: 'fit' });
    expect(fit).toHaveLength(MONZO_PRIMES.length);
    const steps = fit.flat().map((t) => stepOf(t));
    expect(Math.max(...steps)).toBe(Math.max(...BRIGHT_FILL_STEPS.dark));
    expect(Math.min(...steps)).toBe(Math.min(...BRIGHT_FILL_STEPS.dark));
  });
  it('|error| brightness ignores the range (always the bands)', () => {
    const cells = monzoCellNotes(painted, 'exact');
    const base = {
      hue: 'off' as const,
      bright: 'errorSize' as const,
      intensity: 'strong' as const,
      scheme: 'dark' as const,
      look: 'tinted' as const,
      outline: false,
      repC: 1200,
    };
    expect(monzoCellTints(cells, { ...base, range: 'fit' })).toEqual(
      monzoCellTints(cells, { ...base, range: 'fixed' })
    );
  });
});

describe('legend (D23)', () => {
  const look = { look: 'tinted' as const, outline: false, scheme: 'dark' as const };
  const bar = (hue: RelHue, bright: RelBright, intensity: 'strong' | 'faint', steps?: number) =>
    brightBarColors({ ...look, hue, bright, intensity }, steps);
  it('the strong end is named by the Interval intensity', () => {
    expect(strongEndOf('strong')).toBe('simple');
    expect(strongEndOf('faint')).toBe('complex');
    expect(barEndWords('tenney')).toEqual(['simple', 'complex']);
    expect(barEndWords('errorSize')).toEqual(['exact', 'large']);
  });
  it('a Brightness bar (Hue off: the blue ramp) runs simplest to most complex and flips with the intensity', () => {
    const simple = bar('off', 'tenney', 'strong', 6);
    const complex = bar('off', 'tenney', 'faint', 6);
    expect(simple).toHaveLength(6);
    expect(simple[0]).toBe(`var(--rx-blue-${Math.max(...BRIGHT_FILL_STEPS.dark)})`);
    expect(simple[5]).toBe(`var(--rx-blue-${Math.min(...BRIGHT_FILL_STEPS.dark)})`);
    expect(complex).toEqual([...simple].reverse());
  });
  it('the bar is sampled from the cell function: a cell at an end has the end color', () => {
    const b = bar('off', 'tenney', 'strong', 12);
    expect(tintOf(n('3/2'), ctx('off', 'tenney'))?.fill).toBe(b[0]);
    expect(tintOf(n('81/80'), ctx('off', 'odd'))?.fill).not.toBe(b[0]);
  });
  it('with a Hue set the bar is a neutral ramp (the hue has its own legend)', () => {
    const b = bar('prime', 'tenney', 'strong', 4);
    expect(b.every((c) => c.startsWith('color-mix'))).toBe(true);
    expect(new Set(b).size).toBe(4);
  });
  it('the |error| bar has one segment per band, exact first, whatever the intensity', () => {
    const b = bar('off', 'errorSize', 'strong');
    expect(b).toHaveLength(ERROR_BAR_BANDS);
    expect(bar('off', 'errorSize', 'faint')).toEqual(b);
    expect(b[0]).toBe(tintOf(n('2/1'), ctx('off', 'errorSize'))?.fill);
    expect(b[4]).toBe(tintOf(n('7/4'), ctx('off', 'errorSize'))?.fill);
  });
  it('Error sign without |error| has three chips: flat, exact, sharp', () => {
    const chips = errorSignTints(look);
    expect(chips.map((c) => c.label)).toEqual(['flat', 'exact', 'sharp']);
    expect(chips[0].tint.fill).toContain('cyan');
    expect(chips[2].tint.fill).toContain('orange');
  });
  it('ends: fixed bounds, or the view for Fit; Odd limit shows limits, Tenney log2 values, |error| 0 to 30 c', () => {
    expect(legendBounds('odd', null)).toEqual({ lo: 3, hi: 255 });
    expect(legendBounds('tenney', null)).toEqual(FIXED_BOUNDS.tenney);
    expect(legendBounds('roughness', null)).toEqual(FIXED_BOUNDS.roughness);
    const fit = fitBounds('tenney', [n('3/2'), n('7/4')]);
    expect(legendBounds('tenney', fit)).toEqual(fit);
    expect(legendBounds('off', null)).toBeNull();
    expect(legendBounds('errorSize', fit)).toEqual({ lo: 0, hi: 30 });
    expect(legendNumber('odd', 255)).toBe('255');
    expect(legendNumber('tenney', FIXED_BOUNDS.tenney.lo)).toBe('2.58');
    expect(legendNumber('errorSize', 30)).toBe('30 c');
  });
  it('the hover tick: position along the bar, clamped, with a beyond flag', () => {
    const mark = (t: string, bright: RelBright = 'odd') =>
      legendMarksOf('off', bright, n(t), null, 1200).bright;
    expect(mark('3/2')).toEqual({ kind: 'pos', pos: 0, beyond: 0 });
    const m81 = mark('81/80');
    expect(m81?.kind === 'pos' && m81.pos > 0.5 && m81.beyond === 0).toBe(true);
    // 1023 is beyond the fixed odd limit 255: pinned to the complex end, flagged
    expect(mark('1023/1024')).toEqual({ kind: 'pos', pos: 1, beyond: 1 });
    // Tenney 1/1 is 0: below the fixed 2.58, so beyond the simple end
    expect(legendMarksOf('off', 'tenney', n('1/1'), null, 1200).bright).toEqual({
      kind: 'pos',
      pos: 0,
      beyond: -1,
    });
    // Fit to view: the view's own ends
    const fit = fitBounds('tenney', [n('3/2'), n('7/4')]);
    expect(legendMarksOf('off', 'tenney', n('7/4'), fit, 1200).bright).toEqual({
      kind: 'pos',
      pos: 1,
      beyond: 0,
    });
  });
  it('the |error| tick sits in the middle of its band segment', () => {
    // 5/4 is 13.7 c off: band 2 of 0..4
    expect(legendMarksOf('off', 'errorSize', n('5/4'), null, 1200).bright).toEqual({
      kind: 'pos',
      pos: 0.5,
      beyond: 0,
    });
    expect(legendMarksOf('off', 'errorSize', n('2/1'), null, 1200).bright).toEqual({
      kind: 'pos',
      pos: 0.1,
      beyond: 0,
    });
  });
  it('Prime and Interval marks are swatch keys; an irrational note has none; the two legends are separate', () => {
    expect(legendMarksOf('prime', 'off', n('81/80'), null, 1200).hue).toEqual({
      kind: 'key',
      key: 5,
    });
    expect(legendMarksOf('interval', 'off', n('3/2'), null, 1200).hue).toEqual({
      kind: 'key',
      key: 7,
    });
    expect(legendMarksOf('interval', 'off', n('2/1'), null, 1200).hue).toEqual({
      kind: 'key',
      key: 0,
    });
    expect(legendMarksOf('prime', 'off', { m: null, c: 100 }, null, 1200)).toEqual({
      hue: null,
      bright: null,
    });
    expect(legendMarksOf('off', 'odd', { m: null, c: 100 }, null, 1200).bright).toBeNull();
    const both = legendMarksOf('prime', 'tenney', n('3/2'), null, 1200);
    expect(both.hue).toEqual({ kind: 'key', key: 3 });
    expect(both.bright).toMatchObject({ kind: 'pos' });
  });
  it('Error sign: the tick sits on the fixed 8-segment strip, 0 c in the middle', () => {
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
    expect(legendMarksOf('errorSign', 'errorSize', n('7/4'), null, 1200).hue).toEqual({
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
    const b = brightBarColors({
      hue: 'off',
      bright: 'tenney',
      look: 'outlined',
      outline: false,
      scheme: 'dark',
      intensity: 'strong',
    });
    expect(b.every((c) => c !== 'var(--panel-slot)')).toBe(true);
  });
});

describe('Entropy (M9, H-39)', () => {
  const cands = heCandidates(10000);
  const at = (c: number) => heAt(cands, c, 17);
  const curve = heCurve(cands, 17);
  const range = heFixedRange(curve);
  const he: EntropySource = { lo: range.min, hi: range.max, at };
  const ectx = (hue: RelHue = 'off', strong: Strong = 'simple'): TintContext => ({
    ...ctx(hue, 'entropy', strong),
    he,
    bounds: { lo: he.lo, hi: he.hi },
  });

  it('is a brightness with a range; the sanitizer keeps it', () => {
    expect(REL_BRIGHTS).toContain('entropy');
    expect(hasRange('entropy')).toBe(true);
    expect(
      sanitizeRelColor({ rings: { hue: 'off', bright: 'entropy', range: 'fit' } }).rings.bright
    ).toBe('entropy');
  });
  it('has no value without a curve (the cells stay plain)', () => {
    expect(metricValue('entropy', n('3/2'))).toBeNull();
    expect(tintOf(n('3/2'), { ...ctx('off', 'entropy'), he: null })).toBeNull();
    expect(tintOf(n('3/2'), { ...ctx('prime', 'entropy'), he: null })).toBeNull();
  });
  it('the value is the exact one, octave-folded: 3/2 and 3/1 agree, 3/2 is lower than 16/15', () => {
    const v = (t: string) => metricValue('entropy', n(t), he) as number;
    expect(v('3/2')).toBeCloseTo(at(n('3/2').c), 12);
    expect(v('3/1')).toBeCloseTo(v('3/2'), 9);
    expect(v('3/2')).toBeLessThan(v('16/15'));
  });
  it('low entropy is the simple end: Simple strong gives 3/2 a stronger tint than 16/15, Complex strong flips it', () => {
    expect(stepOf(tintOf(n('3/2'), ectx()))).toBeGreaterThan(stepOf(tintOf(n('16/15'), ectx())));
    expect(stepOf(tintOf(n('3/2'), ectx('off', 'complex')))).toBeLessThan(
      stepOf(tintOf(n('16/15'), ectx('off', 'complex')))
    );
  });
  it('F2: Hue Prime + Harmonic entropy: each interval keeps its prime hue, the step follows the entropy (3/2 lower than 7/4)', () => {
    const t = (x: string) => tintOf(n(x), ectx('prime'));
    const step = (x: string) => Number(/-(\d+)\)/.exec(t(x)?.fill ?? '')?.[1]);
    expect(huesOf(t('7/4')?.mark)).toEqual(huesOf(tintOf(n('7/4'), ctx('prime', 'off'))?.mark));
    expect(huesOf(t('81/80')?.mark)).toEqual(huesOf(tintOf(n('5/4'), ctx('prime', 'off'))?.mark));
    expect(he.at(n('3/2').c)).toBeLessThan(he.at(n('7/4').c));
    expect(step('3/2')).toBeGreaterThan(step('7/4'));
  });
  it('F10: 81/80 (21 c) sits inside the excluded unison dip: below the Fixed lo, so it clamps to the strongest step (still colored, not dimmer than 3/2)', () => {
    expect(he.at(n('81/80').c)).toBeLessThan(range.min);
    expect(heRange(curve).min).toBeLessThan(range.min);
    const t = (x: string) => tintOf(n(x), ectx());
    expect(t('81/80')).not.toBeNull();
    expect(stepOf(t('81/80'))).toBeGreaterThanOrEqual(stepOf(t('3/2')));
  });
  it('Fixed bounds are the curve min to max without the +-30 c unison windows (legend); Fit uses the view', () => {
    expect(legendBounds('entropy', { lo: he.lo, hi: he.hi })).toEqual({
      lo: range.min,
      hi: range.max,
    });
    expect(legendBounds('entropy', null)).toBeNull();
    const fit = fitBounds('entropy', [n('3/2'), n('5/4')], he) as { lo: number; hi: number };
    expect(fit.lo).toBeCloseTo(Math.min(at(n('3/2').c), at(n('5/4').c)), 12);
    expect(fit.hi).toBeCloseTo(Math.max(at(n('3/2').c), at(n('5/4').c)), 12);
    const mark = legendMarksOf('off', 'entropy', n('3/2'), { lo: he.lo, hi: he.hi }, 1200, he);
    expect(mark.bright).toMatchObject({ kind: 'pos', beyond: 0 });
  });
  it('Monzo cells are colored from the exact reduced value', () => {
    const cells = monzoCellNotes(monzo({ 3: 1 }), 'reduced');
    const tints = monzoCellTints(cells, { ...ectx(), range: 'fixed' });
    expect(tints.flat().every((t) => t !== null)).toBe(true);
  });
});

/** OKLCH lightness of a hex color (Ottosson's OKLab from linear sRGB), computed in the test. */
const okLightness = (hex: string): number => {
  const [r, g, b] = hexToLinearRgb(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
};
const stopHex = (scheme: TileScheme, kind: 'marks' | 'fills') =>
  MEASURE_RAMP[kind][scheme].map(([hue, step]) => radixHex(scheme, hue, step));
/** The Hue strength of an odd limit under Simple strong and the fixed bounds. */
const oddStrength = (odd: number): number => 1 - complexityPosition('odd', odd, null);

describe('measure ramp (M9c F11): lightness and contrast computed from the Radix values', () => {
  for (const scheme of ['dark', 'light'] as const) {
    it(`${scheme}: lightness is monotonic along the stops (dark rises, light falls toward the strong end)`, () => {
      for (const kind of ['marks', 'fills'] as const) {
        const L = stopHex(scheme, kind).map(okLightness);
        for (let i = 1; i < L.length; i++) {
          expect(scheme === 'dark' ? L[i] - L[i - 1] : L[i - 1] - L[i]).toBeGreaterThan(0);
        }
      }
    });
    it(`${scheme}: every mark stop is at least 2:1 on the panel, the strong end at least 4.5:1`, () => {
      const c = stopHex(scheme, 'marks').map((h) => contrast(h, PANEL[scheme]));
      expect(Math.min(...c)).toBeGreaterThanOrEqual(2);
      expect(c[c.length - 1]).toBeGreaterThanOrEqual(4.5);
      expect(c).toEqual([...c].sort((a, b) => a - b));
    });
    it(`${scheme}: the text on every fill stop is at least 4.5:1`, () => {
      for (const h of stopHex(scheme, 'fills')) {
        expect(contrast(TEXT[scheme], h)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it('the ramp runs blue, cyan, green, yellow on dark and back on light, from Radix hues only', () => {
    expect(MEASURE_RAMP.marks.dark.map(([h]) => h)).toEqual([
      'blue',
      'cyan',
      'cyan',
      'green',
      'yellow',
    ]);
    expect(MEASURE_RAMP.marks.light.map(([h]) => h)).toEqual(['yellow', 'green', 'cyan', 'blue']);
  });
  it('the ends are the stops themselves, the in-between colors are oklch mixes of two neighbors, every level differs', () => {
    const stops = MEASURE_RAMP.marks.dark;
    expect(rampColor(stops, 0)).toBe('var(--rx-blue-7)');
    expect(rampColor(stops, 1)).toBe('var(--rx-yellow-9)');
    expect(rampColor(stops, 0.6)).toMatch(
      /^color-mix\(in oklch, var\(--rx-cyan-10\) \d+%, var\(--rx-green-11\)\)$/
    );
    const all = new Set(
      Array.from({ length: RAMP_LEVELS }, (_, k) => rampColor(stops, k / (RAMP_LEVELS - 1)))
    );
    expect(all.size).toBe(RAMP_LEVELS);
  });
});

describe('measures on Hue (M9c F11 to F14)', () => {
  const fillOf = (t: string, c: TintContext) => tintOf(n(t), c)?.fill;
  it('F11: Brightness Tenney (Hue off, dark) leaves 3/2 and 5/4 in the same blue; Hue Tenney gives them different colors, both schemes', () => {
    // the human's case: dark fills have only 4 usable blue steps (5 to 8)
    const dark = ctx('off', 'tenney', 'simple', 'dark');
    expect(fillOf('3/2', dark)).toBe(fillOf('5/4', dark));
    for (const scheme of ['dark', 'light'] as const) {
      const ramp = ctx('tenney', 'off', 'simple', scheme);
      expect(fillOf('3/2', ramp)).toBeDefined();
      expect(fillOf('3/2', ramp)).not.toBe(fillOf('5/4', ramp));
      expect(tintOf(n('3/2'), ramp)?.mark).not.toBe(tintOf(n('5/4'), ramp)?.mark);
    }
  });
  it('F13: a measure on Hue with Brightness off is the ramp alone (3/2, the simple end, on the strong stop)', () => {
    const t = tintOf(n('3/2'), ctx('tenney', 'off'));
    expect(t?.fill).toBe(rampColor(MEASURE_RAMP.fills.dark, 1));
    expect(t?.mark).toBe(rampColor(MEASURE_RAMP.marks.dark, 1));
    expect(t?.text).toBe('var(--text)');
    // Complex strong flips the ends
    expect(tintOf(n('3/2'), ctx('tenney', 'off', 'complex'))?.fill).toBe(
      rampColor(MEASURE_RAMP.fills.dark, 0)
    );
  });
  it('F12: both measures: the hue position comes from the Hue measure, Brightness moves its lightness', () => {
    // 5/2 and 5/8 have the same odd limit (the Hue) but different Tenney heights (the Brightness)
    const c = ctx('odd', 'tenney');
    const a = tintOf(n('5/2'), c);
    const b = tintOf(n('5/8'), c);
    const base = rampColor(MEASURE_RAMP.fills.dark, oddStrength(5));
    expect(a?.fill).toContain(base);
    expect(b?.fill).toContain(base);
    expect(a?.fill).not.toBe(b?.fill);
    // the simpler 5/2 is the stronger: less of the panel mixed into its fill
    const share = (s: string | undefined) =>
      Number(/var\(--panel\) (\d+)%/.exec(s ?? '')?.[1] ?? 0);
    expect(share(a?.fill)).toBeLessThan(share(b?.fill));
    // and more of the text color in its mark
    const toText = (s: string | undefined) =>
      Number(/var\(--text\) (\d+)%/.exec(s ?? '')?.[1] ?? 0);
    expect(toText(a?.mark)).toBeGreaterThan(toText(b?.mark));
  });
  it('F12: Hue Tenney with Brightness Tenney: the strongest interval is the pure strong stop', () => {
    expect(tintOf(n('3/2'), ctx('tenney', 'tenney'))?.fill).toBe(
      rampColor(MEASURE_RAMP.fills.dark, 1)
    );
  });
  it('a note with no value on the Hue measure has no tint (an irrational note has no odd limit)', () => {
    expect(tintOf({ m: null, c: 100 }, ctx('odd', 'off'))).toBeNull();
  });
  it('Hue Error size: the ramp follows the five error bands, strongest when large', () => {
    const c = ctx('errorSize', 'off');
    expect(fillOf('7/4', c)).toBe(rampColor(MEASURE_RAMP.fills.dark, 1)); // 31.17 c: band 4
    expect(fillOf('3/2', c)).toBe(rampColor(MEASURE_RAMP.fills.dark, 0.25)); // 1.955 c: band 1
  });
  it('F14: the Hue bar is sampled from the same function: simple end first, 12 steps (5 for the error size)', () => {
    const base = {
      hue: 'tenney' as RelHue,
      intensity: 'strong' as const,
      look: 'tinted' as const,
      outline: false,
    };
    const bar = hueBarColors({ ...base, scheme: 'dark' });
    expect(bar).toHaveLength(12);
    expect(bar[0]).toBe(rampColor(MEASURE_RAMP.fills.dark, 1));
    expect(bar[11]).toBe(rampColor(MEASURE_RAMP.fills.dark, 0));
    expect(new Set(bar).size).toBe(12);
    expect(hueBarColors({ ...base, hue: 'errorSize', scheme: 'dark' })).toHaveLength(5);
    expect(hueBarColors({ ...base, intensity: 'faint', scheme: 'dark' })[0]).toBe(
      rampColor(MEASURE_RAMP.fills.dark, 0)
    );
  });
  it('F14: the hover tick of a measure on Hue, and the bounds of each channel', () => {
    const m = legendMarksOf('tenney', 'off', n('3/2'), null, 1200, null, null);
    expect(m.hue).toMatchObject({ kind: 'pos', beyond: 0 });
    expect(m.bright).toBeNull();
    expect(legendMarksOf('prime', 'off', n('3/2'), null, 1200).hue).toEqual({
      kind: 'key',
      key: 3,
    });
    expect(legendBounds('tenney', null)).toEqual(FIXED_BOUNDS.tenney);
    expect(legendBounds('prime', null)).toBeNull();
    expect(legendBounds('off', null)).toBeNull();
    // Hue Tenney and Brightness Odd limit each keep their own bounds
    const both = legendMarksOf('tenney', 'odd', n('3/2'), { lo: 3, hi: 5 }, 1200, null, {
      lo: 2.585,
      hi: 4,
    });
    expect(both.hue).toMatchObject({ kind: 'pos', pos: 0 });
    expect(both.bright).toMatchObject({ kind: 'pos', pos: 0 });
  });
  it('the Monzo cells take a Hue measure and its own Fit range', () => {
    const cells = monzoCellNotes(monzo({ 3: 1 }), 'reduced');
    const base = { ...ctx('tenney', 'off'), range: 'fixed' as const };
    const fixed = monzoCellTints(cells, base).flat();
    const fit = monzoCellTints(cells, { ...base, range: 'fit' }).flat();
    expect(fixed.every((t) => t !== null)).toBe(true);
    expect(fit.map((t) => t?.fill)).not.toEqual(fixed.map((t) => t?.fill));
  });
});

describe('Entropy Fixed bounds exclude the unison window (M9c F10)', () => {
  const cands = heCandidates(10000);
  const at = (c: number) => heAt(cands, c, 17);
  const curve = heCurve(cands, 17);
  const full = heRange(curve);
  const fixed = heFixedRange(curve);
  const posOf = (t: string, b: { min: number; max: number }) =>
    complexityPosition('entropy', at(n(t).c), { lo: b.min, hi: b.max });
  it('the bounds are the min and max of the 30 to 1170 c part: the unison and octave dips set none of them', () => {
    expect(fixed.min).toBeGreaterThan(full.min);
    expect(fixed.max).toBeLessThanOrEqual(full.max);
    let lo = Infinity;
    for (let x = 30; x <= 1170; x++) {
      lo = Math.min(lo, curve[x]);
    }
    expect(fixed.min).toBe(lo);
  });
  it('3/2, 5/4 and 7/4 spread wider on the ramp than with the full min and max', () => {
    const spread = (b: { min: number; max: number }) => {
      const p = ['3/2', '5/4', '7/4'].map((t) => posOf(t, b));
      return Math.max(...p) - Math.min(...p);
    };
    expect(spread(fixed)).toBeGreaterThan(spread(full));
  });
  it('the unison (below the bounds) clamps to the strong end of the color', () => {
    const he: EntropySource = { lo: fixed.min, hi: fixed.max, at };
    const b = { lo: he.lo, hi: he.hi };
    expect(at(0)).toBeLessThan(fixed.min);
    expect(complexityPosition('entropy', at(0), b)).toBe(0);
    const hueCtx: TintContext = { ...ctx('entropy', 'off'), he, hueBounds: b };
    expect(tintOf(n('1/1'), hueCtx)?.fill).toBe(rampColor(MEASURE_RAMP.fills.dark, 1));
    const brightCtx: TintContext = { ...ctx('off', 'entropy'), he, bounds: b };
    expect(stepOf(tintOf(n('1/1'), brightCtx))).toBe(
      BRIGHT_FILL_STEPS.dark[BRIGHT_FILL_STEPS.dark.length - 1]
    );
  });
});

describe('Measure: Step | Landing (M9d, H-41, G1 to G7)', () => {
  const src = n('5/4');
  const at = (step: string, measure: 'step' | 'landing', octave: 'exact' | 'reduced' = 'reduced') =>
    measuredNote(n(step), measure, src, octave);
  it('the choices and the default', () => {
    expect(REL_MEASURES).toEqual(['step', 'landing']);
    expect(REL_COLOR_DEFAULT.rings.measure).toBe('step');
    expect(REL_COLOR_DEFAULT.near.measure).toBe('step');
    expect(REL_COLOR_DEFAULT.monzo.measure).toBe('step');
  });
  it('storage: kept per view; absent, damaged or the old shape reads as step', () => {
    const v = sanitizeRelColor({
      rings: { measure: 'landing' },
      near: { measure: 'sideways' },
      monzo: { measure: 'landing', octave: 'reduced' },
    });
    expect(v.rings.measure).toBe('landing');
    expect(v.near.measure).toBe('step');
    expect(v.monzo.measure).toBe('landing');
    expect(sanitizeRelColor({ rings: { measure: 7 } }).rings.measure).toBe('step');
    expect(sanitizeRelColor({ metric: 'odd', range: 'fit' }).rings.measure).toBe('step');
    expect(sanitizeRelColor(undefined).monzo.measure).toBe('step');
  });
  it('a preset ignores the measure (Custom detection does not see it)', () => {
    expect(presetOf({ hue: 'prime', bright: 'off', radius: 'tenney' })).toBe('families');
    for (const p of REL_PRESETS) {
      expect(presetOf({ hue: p.hue, bright: p.bright, radius: p.radius })).toBe(p.id);
    }
  });
  it('G1: under source 5/4 the 6/5 step measures Tenney 4.91 and error +15.6 c, its landing 3/2 measures Tenney 2.58 and error +2.0 c', () => {
    const step = at('6/5', 'step');
    const landing = at('6/5', 'landing');
    expect(noteText(landing)).toBe('3/2');
    expect(metricValue('tenney', step)).toBeCloseTo(4.91, 2);
    expect(metricValue('tenney', landing)).toBeCloseTo(2.58, 2);
    expect(signedEdoError(step.c)).toBeCloseTo(15.6, 1);
    expect(signedEdoError(landing.c)).toBeCloseTo(1.96, 1);
    expect(largestPrimeOf(step)).toBe(5);
    expect(largestPrimeOf(landing)).toBe(3);
    // and the tint follows: the landing is 3/2's color
    const c = ctx('prime', 'tenney');
    expect(tintOf(landing, c)).toEqual(tintOf(n('3/2'), c));
    expect(tintOf(step, c)).not.toEqual(tintOf(landing, c));
  });
  it('G2: a Near dot 81/64 lands on 5/4 x 81/64 = 405/256', () => {
    expect(noteText(at('81/64', 'landing'))).toBe('405/256');
  });
  it('G6: source 1/1 gives the same in both', () => {
    const one = n('1/1');
    for (const t of ['6/5', '3/2', '81/64', '7/4']) {
      const s = measuredNote(n(t), 'step', one, 'reduced');
      const l = measuredNote(n(t), 'landing', one, 'reduced');
      expect(l.c).toBeCloseTo(s.c, 9);
      expect(metricValue('tenney', l)).toBe(metricValue('tenney', s));
    }
  });
  it('G4: the landing honors Octave Exact or Reduced', () => {
    // source 3/2 + step 3/2 = 9/4: Exact keeps it (Tenney 5.17), Reduced folds it to 9/8 (Tenney 6.17)
    const exact = measuredNote(n('3/2'), 'landing', n('3/2'), 'exact');
    const reduced = measuredNote(n('3/2'), 'landing', n('3/2'), 'reduced');
    expect(noteText(exact)).toBe('9/4');
    expect(noteText(reduced)).toBe('9/8');
    expect(metricValue('tenney', exact)).toBeCloseTo(5.17, 2);
    expect(metricValue('tenney', reduced)).toBeCloseTo(6.17, 2);
    // the step measure is untouched by the octave
    expect(measuredNote(n('3/2'), 'step', n('3/2'), 'reduced')).toEqual(n('3/2'));
  });
  it('G4: a repeat note reduces the landing into that repeat like a click', () => {
    const rep = n('3/1');
    // 3/2 x 3/2 = 9/4 is already under the repeat 3/1
    expect(noteText(measuredNote(n('3/2'), 'landing', n('3/2'), rep))).toBe('9/4');
    // 5/2 x 3/2 = 15/4 folds into [1, 3) as 5/4
    expect(noteText(measuredNote(n('5/2'), 'landing', n('3/2'), rep))).toBe('5/4');
  });
});

describe('Colors follow Alt (G15): the below direction', () => {
  const src = n('5/4');
  it('storage: per view, default off, damaged reads off, Monzo has none', () => {
    expect(REL_COLOR_DEFAULT.rings.followAlt).toBe(false);
    expect(REL_COLOR_DEFAULT.near.followAlt).toBe(false);
    const v = sanitizeRelColor({
      rings: { followAlt: true },
      near: { followAlt: 'yes' },
      monzo: { followAlt: true },
    });
    expect(v.rings.followAlt).toBe(true);
    expect(v.near.followAlt).toBe(false);
    expect(v.monzo.followAlt).toBe(false);
    expect(sanitizeRelColor({ metric: 'odd' }).rings.followAlt).toBe(false);
  });
  it('Landing below: source 5/4, cell 5/4 lands on 1/1 (above: 25/16)', () => {
    expect(noteText(measuredNote(n('5/4'), 'landing', src, 'reduced', 'below'))).toBe('1/1');
    expect(noteText(measuredNote(n('5/4'), 'landing', src, 'reduced', 'above'))).toBe('25/16');
    const c = ctx('prime', 'tenney');
    expect(tintOf(measuredNote(n('5/4'), 'landing', src, 'reduced', 'below'), c)).toEqual(
      tintOf(n('1/1'), c)
    );
  });
  it('Landing below equals the picker landing: source 3/2 minus 5/4, reduced into the octave', () => {
    expect(noteText(measuredNote(n('5/4'), 'landing', n('3/2'), n('2/1'), 'below'))).toBe('6/5');
  });
  it('Step below: the inverse step; the 12-EDO error sign flips for 6/5', () => {
    const up = measuredNote(n('6/5'), 'step', src, 'reduced', 'above');
    const down = measuredNote(n('6/5'), 'step', src, 'reduced', 'below');
    expect(noteText(down)).toBe('5/6');
    expect(signedEdoError(up.c)).toBeCloseTo(15.6, 1);
    expect(signedEdoError(down.c)).toBeCloseTo(-15.6, 1);
    expect(metricValue('tenney', down)).toBeCloseTo(metricValue('tenney', up) ?? 0, 9);
  });
  it('the default direction is above (followAlt off reads the same whatever Alt does)', () => {
    for (const m of ['step', 'landing'] as const) {
      expect(measuredNote(n('6/5'), m, src, 'reduced')).toEqual(
        measuredNote(n('6/5'), m, src, 'reduced', 'above')
      );
    }
  });
});
