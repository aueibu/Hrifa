/**
 * M8o + M9c: the Relative picker's interval coloring (H-37, H-40), pure (no React). ONE module answers "what tint does this exact
 * interval get": the ring cells, the Near dots, the pin cards, the Monzo landing mark and every Monzo matrix cell all call `tintOf`.
 *
 * Two channels per view (M9c): HUE says which family (`prime`: Near's wheel hues, see `primeColor`; `interval`: Pairs' size wheel;
 * `errorSign`: orange sharp / cyan flat / neutral exact, H-38) and BRIGHTNESS says how much (Tenney, Odd limit, Roughness, Harmonic
 * entropy, or the error size in the five `errorBand` bands). With Hue off, Brightness is the BLUE ramp, bright = strong (on dark the
 * dots are Radix blue steps 7 to 12, contrast 2.1 to 10.6 : 1 against the panel). With a Hue set, Brightness moves along THAT hue's
 * own steps. Hue set and Brightness off is the tile look's fixed level; both off is plain. Near also has a RADIUS channel
 * (`nearRadius.ts`). `range` picks fixed bounds (the constants below) or the min and max of the cells in the open view. Which end is
 * strong is the lab-wide Interval intensity (`intervalIntensity`, shared with Pairs): `strong` ("Simple strong", default) gives the
 * simplest interval the strongest tint, `faint` ("Complex strong") flips it; the error size is always strong when large (H-38).
 *
 * Every cell and card FILL is in the lab's tile look (D22: `developer.v1` tileLook and tileOutline, through `tileColors` and
 * `signedBandTile` exactly as the Pairs tiles); Near dots keep the solid `mark` colors. The legend (D23) samples these same functions.
 *
 * Every color is a Radix variable or a theme role (`--rx-<hue>-<step>`, `--text`), never a hex; tuning constants are named.
 */
import {
  H_FAINT,
  H_STRONG,
  MONZO_PRIMES,
  clampExp,
  dissonanceAt,
  mkNote,
  monzoNote,
  oddLimit,
  reduceInto,
  tenneyHeight,
  type MonzoExps,
  type MonzoPrime,
  type Note,
  type TintIntensity,
} from '../../../lib/harmonic-field';
import type { RadixHue } from '../../../theme/radix';
import {
  FLAT_HUE,
  SHARP_HUE,
  hueStep,
  signedBand,
  signedBandTile,
  tileColors,
  wheelHue,
  type TileColors,
  type TileHue,
  type TileLevel,
  type TileLook,
  type TileScheme,
} from './tileColors';

/* ------------------------------------------------------------------------------------------------ settings */
/** The measures a channel can show: Brightness, Radius and (M9c F11) Hue can each be one of these. */
export const REL_METRICS = ['tenney', 'odd', 'roughness', 'entropy', 'errorSize'] as const;
export type RelMetric = (typeof REL_METRICS)[number];
/** Hue: a family (prime, interval class, error sign) or, F11, a measure on the multi-hue ramp (`MEASURE_RAMP`). */
export const REL_HUES = ['off', 'prime', 'interval', 'errorSign', ...REL_METRICS] as const;
export type RelHue = (typeof REL_HUES)[number];
/** The measure a Hue shows on the ramp, or null for Off and the families. */
export const hueMeasure = (h: RelHue): RelMetric | null => REL_METRICS.find((m) => m === h) ?? null;
export const REL_BRIGHTS = ['off', ...REL_METRICS] as const;
export type RelBright = (typeof REL_BRIGHTS)[number];
export const REL_RADII = REL_METRICS;
export type RelRadius = RelMetric;
export type RelColorRange = 'fixed' | 'fit';
export type RelColorOctave = 'exact' | 'reduced';
/** One view's Color choice (Rings; Near adds the radius, Monzo the octave). */
export interface RelViewColor {
  hue: RelHue;
  bright: RelBright;
  range: RelColorRange;
}
export interface RelNearColor extends RelViewColor {
  radius: RelRadius;
}
export interface RelMonzoColor extends RelViewColor {
  octave: RelColorOctave;
}
/** The picker's Color menu, chosen PER VIEW (`settings.v1` ui `relColor`, H-37 amended, H-40). */
export interface RelColor {
  rings: RelViewColor;
  near: RelNearColor;
  monzo: RelMonzoColor;
}
export type RelColorView = keyof RelColor;
/** The Families preset: the default of every view. */
export const REL_VIEW_DEFAULT: RelViewColor = { hue: 'prime', bright: 'off', range: 'fixed' };
export const REL_NEAR_DEFAULT: RelNearColor = { ...REL_VIEW_DEFAULT, radius: 'tenney' };
export const REL_MONZO_DEFAULT: RelMonzoColor = { ...REL_VIEW_DEFAULT, octave: 'exact' };
export const REL_COLOR_DEFAULT: RelColor = {
  rings: { ...REL_VIEW_DEFAULT },
  near: { ...REL_NEAR_DEFAULT },
  monzo: { ...REL_MONZO_DEFAULT },
};

/**
 * The presets (M9c, SCENARIOS F-presets): one click sets Hue and Brightness (and Near's Radius). They are UI shortcuts, never stored
 * as such: the select shows the preset the stored channels equal, else Custom.
 */
export interface RelPreset {
  id: string;
  label: string;
  /** The question the preset answers (the help text lists them). */
  question: string;
  radius: RelRadius;
  hue: RelHue;
  bright: RelBright;
}
export const REL_PRESETS: readonly RelPreset[] = [
  {
    id: 'families',
    label: 'Families',
    question: 'which harmonic family, how simple',
    radius: 'tenney',
    hue: 'prime',
    bright: 'off',
  },
  {
    id: 'earVsPaper',
    label: 'Ear vs paper',
    question: 'simple on paper vs recognizable to the ear',
    radius: 'tenney',
    hue: 'prime',
    bright: 'entropy',
  },
  {
    id: 'tuningCheck',
    label: 'Tuning check',
    question: 'which notes are sharp or flat, how far',
    radius: 'tenney',
    hue: 'errorSign',
    bright: 'errorSize',
  },
  {
    id: 'consonance',
    label: 'Consonance',
    question: 'the two consonance models against each other',
    radius: 'entropy',
    hue: 'off',
    bright: 'roughness',
  },
  {
    id: 'intervalClasses',
    label: 'Interval classes',
    question: 'where each interval class sits, by complexity',
    radius: 'odd',
    hue: 'interval',
    bright: 'tenney',
  },
  {
    id: 'plain',
    label: 'Plain',
    question: 'position only',
    radius: 'tenney',
    hue: 'off',
    bright: 'off',
  },
];
export const PRESET_CUSTOM = 'custom';
/** The preset a view's channels equal (the radius counts only in Near, where `radius` is given), else `custom`. */
export function presetOf(v: { hue: RelHue; bright: RelBright; radius?: RelRadius }): string {
  return (
    REL_PRESETS.find(
      (p) =>
        p.hue === v.hue &&
        p.bright === v.bright &&
        (v.radius === undefined || p.radius === v.radius)
    )?.id ?? PRESET_CUSTOM
  );
}

const asRecord = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

/** The M8o single `metric` as the two channels (H-40): prime/interval -> hue; the measures -> brightness; error -> sign + size. */
const fromLegacyMetric = (m: unknown): { hue: RelHue; bright: RelBright } | null => {
  switch (m) {
    case 'off':
      return { hue: 'off', bright: 'off' };
    case 'prime':
    case 'interval':
      return { hue: m, bright: 'off' };
    case 'tenney':
    case 'odd':
    case 'roughness':
    case 'entropy':
      return { hue: 'off', bright: m };
    case 'error':
      return { hue: 'errorSign', bright: 'errorSize' };
    default:
      return null;
  }
};

function sanitizeView(o: Record<string, unknown>): RelViewColor {
  const legacy = fromLegacyMetric(o.metric);
  const hue = REL_HUES.find((h) => h === o.hue);
  const bright = REL_BRIGHTS.find((b) => b === o.bright);
  return {
    hue: hue ?? legacy?.hue ?? REL_VIEW_DEFAULT.hue,
    bright: bright ?? legacy?.bright ?? REL_VIEW_DEFAULT.bright,
    range: o.range === 'fit' ? 'fit' : 'fixed',
  };
}

/**
 * A stored value as a settings object, field by field: absent or damaged falls back to the default (the Families preset). The M8o
 * `{ metric }` shape migrates into Hue and Brightness (H-40); the older flat shape `{ metric, range, octave }` (one choice for all
 * views) is read into all three views the same way.
 */
export function sanitizeRelColor(raw: unknown): RelColor {
  const o = asRecord(raw);
  const flat = 'metric' in o || 'range' in o || 'octave' in o;
  const pick = (k: RelColorView): Record<string, unknown> => (flat ? o : asRecord(o[k]));
  const near = pick('near');
  const monzo = pick('monzo');
  return {
    rings: sanitizeView(pick('rings')),
    near: {
      ...sanitizeView(near),
      radius: REL_RADII.find((r) => r === near.radius) ?? REL_NEAR_DEFAULT.radius,
    },
    monzo: { ...sanitizeView(monzo), octave: monzo.octave === 'reduced' ? 'reduced' : 'exact' },
  };
}

/** The measures (of Brightness or Hue) the Range switch applies to (the error size is always the fixed bands, D25). */
export const hasRange = (b: RelBright | RelHue): boolean =>
  b === 'tenney' || b === 'odd' || b === 'roughness' || b === 'entropy';
/** The brightness that reads the Interval intensity (the error size is strong when large, whatever the intensity). */
export const usesIntensity = (b: RelBright): boolean => b !== 'off' && b !== 'errorSize';
/** Whether the Range switch and the Interval intensity matter for a view: a shaded measure on Hue or Brightness. */
export const usesRange = (c: { hue: RelHue; bright: RelBright }): boolean =>
  hasRange(c.hue) || hasRange(c.bright);
/** Whether any channel of a view needs the harmonic entropy curve (Hue and Brightness included, F11). */
export const usesEntropy = (c: { hue?: RelHue; bright: RelBright; radius?: RelRadius }): boolean =>
  c.hue === 'entropy' || c.bright === 'entropy' || c.radius === 'entropy';

/* ------------------------------------------------------------------------------------------------ prime colors */
/**
 * Prime colors, a color wheel: the odd primes 3, 5, 7, ... (index i, 3 = 0) take wheel hue `(5 i) mod 12`, the 12 positions being the
 * Pairs wheel (`wheelHue`: the theme's 8 Radix hues in order, blended between neighbors) cut into twelfths. Every dozen of primes
 * (d = floor(i / 12)) is fainter: the fill steps are Pairs' Solid steps (strong 9, normal 8, faint 7) continued down (6, 5).
 * Prime 2 (no odd prime, as for 1/1) is neutral.
 */
export const WHEEL_SLOTS = 12;
/**
 * Consecutive primes step this many slots around the wheel (5 of 12 = 150 degrees, the widest fixed step), so 3, 5, 7 are far
 * apart; 5 and 12 share no factor, so the first dozen still uses every slot once before the cycle repeats at 43.
 */
export const WHEEL_STRIDE = 5;
/** The Radix fill step of dozen d (0 = strongest). */
export const DOZEN_STEPS = [9, 8, 7, 6, 5] as const;
/** The first dozen of odd primes (the legend). */
export const FIRST_DOZEN_PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41] as const;
/** The index of an odd prime in 3, 5, 7, ... (-1 when `p` is not an odd prime). */
export function oddPrimeIndex(p: number): number {
  if (!Number.isInteger(p) || p < 3 || p % 2 === 0) {
    return -1;
  }
  let idx = 0;
  for (let q = 3; q < p; q += 2) {
    let prime = true;
    for (let f = 3; f * f <= q; f += 2) {
      if (q % f === 0) {
        prime = false;
        break;
      }
    }
    if (prime) {
      idx++;
    }
  }
  for (let f = 3; f * f <= p; f += 2) {
    if (p % f === 0) {
      return -1;
    }
  }
  return idx;
}
/** The fill of wheel slot `slot` at dozen `d` (a Radix step, blended between two hues when the slot sits between them). */
export function wheelFill(slot: number, d: number): string {
  const n = DOZEN_STEPS[Math.min(d, DOZEN_STEPS.length - 1)];
  return hueStep(wheelHue(slot / WHEEL_SLOTS), n);
}
/** The color of a prime: its wheel hue and dozen (see above), or the neutral `--text-muted` for prime 2. */
export const primeColor = (p: number): string => {
  const i = oddPrimeIndex(p);
  return i < 0
    ? 'var(--text-muted)'
    : wheelFill((i * WHEEL_STRIDE) % WHEEL_SLOTS, Math.floor(i / WHEEL_SLOTS));
};

/* ------------------------------------------------------------------------------------------------ tint */
/**
 * What a cell, card or mark is painted with, in the lab's tile look (D22, `developer.v1` tileLook and tileOutline, as the Pairs
 * tiles): `fill`, `border` and the `text` that reads on them; `mark` is the solid color for a small dot (Near), unchanged by the look.
 */
export interface IntervalTint {
  fill: string;
  border: string;
  text: string;
  mark: string;
}

/** The neutral tint (prime 2, no hue): a faint lift of the text color over any surface, plain text. */
const NEUTRAL: IntervalTint = {
  fill: 'color-mix(in srgb, var(--text) 14%, transparent)',
  border: 'transparent',
  text: 'var(--text)',
  mark: 'var(--text-muted)',
};

/** A tile's colors as a tint (`mark` given). */
const tintOfTile = (t: TileColors, mark: string): IntervalTint => ({
  fill: t.fill,
  border: t.border,
  text: t.text,
  mark,
});

/** The one hue of the Brightness ramp while Hue is off (M9c: blue, bright = strong; the old violet was too faint on the dark panel). */
export const BRIGHT_HUE: RadixHue = 'blue';
/**
 * The Radix steps of the ramp for a small dot or mark, faintest first, bright = strong in both schemes. Dark: steps 7 to 12 measure
 * 2.07, 2.74, 4.26, 4.98, 6.62, 10.6 : 1 against the dark panel (#2e2c2a). Light: steps 8 to 12 measure 2.22, 3.10, 3.45, 4.53, 12.0 : 1
 * against the light panel, so the faint end is at least 2 : 1 and the strong end at least 4.5 : 1 in both. A Hue set uses the same
 * step numbers of its own hue.
 */
export const BRIGHT_MARK_STEPS: Record<TileScheme, readonly number[]> = {
  dark: [7, 8, 9, 10, 11, 12],
  light: [8, 9, 10, 11, 12],
};
/**
 * The Radix steps of the ramp for a cell FILL (Tinted look), faintest first. The Tinted fill steps 3 and 4 are nearly the panel
 * (1.07 and 1.09 : 1 on dark), so the ramp starts where the fill is visibly tinted: dark 5, 6, 7, 8 (1.32, 1.61, 2.07, 2.74 : 1 against
 * the panel); light 5 to 9 (1.25, 1.43, 1.70, 2.22, 3.10 : 1).
 */
export const BRIGHT_FILL_STEPS: Record<TileScheme, readonly number[]> = {
  dark: [5, 6, 7, 8],
  light: [5, 6, 7, 8, 9],
};
/**
 * From this fill step on, the text is the plain text color: the hue's step 12 text drops under 4.5 : 1 there (blue on dark step 8:
 * 3.88 : 1; plain text 4.82; light step 9: 3.87 against 5.42 for plain text). Below it, step 12 reads on every fill (at least 5.1 : 1).
 */
export const BRIGHT_PLAIN_TEXT_FROM: Record<TileScheme, number> = { dark: 8, light: 9 };
const BRIGHT_TEXT_STEP = 12;
/** The blue ramp as a tile hue. */
const BLUE: TileHue = { a: BRIGHT_HUE };

/**
 * The fixed bounds of the shaded metrics (`range: 'fixed'`), simplest to most complex, in the metric's own unit:
 * Tenney: from 3/2 (log2 6, Pairs' `H_STRONG`) to Pairs' `H_FAINT` (14); Odd limit: 3 to 255 (shaded on its log2); Roughness: 0 to
 * `ROUGH_FIXED_MAX`, the rough peak of the lab's own dyad curve (4.39, at 73 c above the base, default timbre and base).
 */
export const ROUGH_FIXED_MAX = 4.4;
export const FIXED_BOUNDS = {
  tenney: { lo: H_STRONG, hi: H_FAINT },
  odd: { lo: 3, hi: 255 },
  roughness: { lo: 0, hi: ROUGH_FIXED_MAX },
} as const;
/** The error size bar runs 0 to this many cents (the last `errorBand` edge); larger errors are the last band. */
export const ERROR_BAR_MAX = 30;

/** The fixed bounds of a metric: the constants above; Entropy has none (its fixed bounds are the current curve's min and max, passed as `bounds`). */
const fixedBoundsOf = (metric: RelMetric): Bounds | null =>
  metric === 'tenney' || metric === 'odd' || metric === 'roughness' ? FIXED_BOUNDS[metric] : null;

/** A metric's unit for shading: the odd limit is shaded on its log2, the others as they are. */
const scaled = (metric: RelMetric, v: number): number =>
  metric === 'odd' ? Math.log2(Math.max(1, v)) : v;

export interface Bounds {
  lo: number;
  hi: number;
}

/**
 * M9 (H-39): harmonic entropy as the picker's pure code sees it: the lowest and highest value of the current curve OUTSIDE the unison
 * and octave windows (the Fixed bounds, M9c F10: `heFixedRange`; a value beyond them clamps to the strong end) and the exact value of one interval (`at`, in nats, any cents: folded into one octave inside; remembered by the entropy store).
 * Null (or absent) while no curve is built: the cells then fall back to plain.
 */
export interface EntropySource {
  lo: number;
  hi: number;
  at: (cents: number) => number;
}

/** The context of one painting: the two channels, the intensity and scheme, the size of the repeat, and the bounds (null = fixed). */
export interface TintContext {
  hue: RelHue;
  bright: RelBright;
  intensity: TintIntensity;
  scheme: TileScheme;
  /** The lab's tile look and stacked outline (`developer.v1`), as the Pairs tiles read them. */
  look: TileLook;
  outline: boolean;
  repC: number;
  /** The Brightness measure's bounds (Fit, or Entropy's Fixed ones; null = the metric's fixed constants). */
  bounds: Bounds | null;
  /** The same for a measure on Hue (it may be another metric than the Brightness one); null = fixed. */
  hueBounds?: Bounds | null;
  /** The entropy curve (Entropy brightness only). */
  he?: EntropySource | null;
}

/* ------------------------------------------------------------------------------------------------ values */
/** The octave 2/1 (the fold of the Monzo octave toggle). */
const OCTAVE: Note = mkNote({ '2': 1 });
/** A note folded into [1/1, 2/1) (the Monzo toggle's Reduced). */
export const foldOctave = (n: Note): Note => reduceInto(n, OCTAVE);

/** The largest prime of the note's monzo (2 when there is none, as for 1/1 and the octaves); null for an irrational note. */
export function largestPrimeOf(n: Note): number | null {
  if (!n.m) {
    return null;
  }
  let best = 2;
  for (const k of Object.keys(n.m)) {
    if (n.m[k] !== 0) {
      best = Math.max(best, Number(k));
    }
  }
  return best;
}

/** Cents from the nearest 12-EDO step, absolute. */
export const edoError = (c: number): number => Math.abs(c - 100 * Math.round(c / 100));

const roughCache = new Map<number, number>();
/** The lab's dyad roughness of the base tone and a tone `c` cents above it (default timbre and base; cached by 0.001 c). */
export function dyadRoughness(c: number): number {
  const key = Math.round(c * 1000);
  let v = roughCache.get(key);
  if (v === undefined) {
    v = dissonanceAt(c);
    if (roughCache.size > 20000) {
      roughCache.clear();
    }
    roughCache.set(key, v);
  }
  return v;
}

/**
 * The number a metric measures on a note (Tenney: log2 of n x d, Odd limit, Error size: absolute cents from 12-EDO, Roughness,
 * Entropy), or null when it has none (an irrational note, for the ones that need a ratio; Entropy before a curve exists).
 */
export function metricValue(metric: RelMetric, n: Note, he?: EntropySource | null): number | null {
  switch (metric) {
    case 'tenney':
      return tenneyHeight(n);
    case 'odd': {
      const o = oddLimit(n);
      return o === null ? null : Number(o);
    }
    case 'errorSize':
      return edoError(n.c);
    case 'roughness':
      return dyadRoughness(n.c);
    case 'entropy':
      return he ? he.at(n.c) : null;
  }
}

/** The min and max of a metric over notes (the Fit to view bounds), or null when no note has a value. */
export function fitBounds(
  metric: RelMetric,
  notes: Iterable<Note>,
  he?: EntropySource | null
): Bounds | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    const v = metricValue(metric, n, he);
    if (v !== null) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return hi < lo ? null : { lo, hi };
}

/**
 * The bounds a measure channel (Hue or Brightness) shades with: Fit = the min and max over `notes` (a measure with a range only);
 * Entropy's Fixed bounds are the curve's (`he.lo`, `he.hi`); the other measures use their constants (null).
 */
export function channelBounds(
  metric: RelHue | RelBright,
  range: RelColorRange,
  notes: Iterable<Note>,
  he?: EntropySource | null
): Bounds | null {
  if (!hasRange(metric)) {
    return null;
  }
  const m = metric as RelMetric;
  if (range === 'fit') {
    return fitBounds(m, notes, he);
  }
  return m === 'entropy' && he ? { lo: he.lo, hi: he.hi } : null;
}

/** Where a value sits between simplest (0) and most complex (1) on the metric's bounds: clamped; a flat range is the middle. */
export function complexityPosition(metric: RelMetric, v: number, bounds: Bounds | null): number {
  const b = bounds ?? fixedBoundsOf(metric);
  if (!b) {
    return 0.5;
  }
  const lo = scaled(metric, b.lo);
  const hi = scaled(metric, b.hi);
  if (hi - lo < 1e-9) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, (scaled(metric, v) - lo) / (hi - lo)));
}

/** The strength 0 (faintest) to 1 (strongest) of a complexity position under the intensity: `strong` = simple strong, `faint` = complex strong. */
export const intensityStrength = (pos: number, intensity: TintIntensity): number =>
  intensity === 'strong' ? 1 - pos : pos;

const pick = (steps: readonly number[], strength: number): number =>
  steps[Math.round(Math.min(1, Math.max(0, strength)) * (steps.length - 1))];

/** The tile level of a 0 (faintest) to 1 (strongest) strength: lower third faint, upper third strong (as `strengthLevel`). */
export const strengthTileLevel = (strength: number): TileLevel =>
  strength < 1 / 3 ? 'faint' : strength >= 2 / 3 ? 'strong' : 'normal';

/** The level of a prime's dozen (the first dozen strongest, the second normal, later ones faint). */
const dozenLevel = (d: number): TileLevel => (d <= 0 ? 'strong' : d === 1 ? 'normal' : 'faint');

type LookCtx = Pick<TintContext, 'look' | 'outline' | 'scheme'>;

/** The wheel hue of a prime (the same slot as Near's dot, blended between two Radix hues exactly as the wheel does), null for prime 2. */
function primeHue(p: number): { hue: TileHue; level: TileLevel } | null {
  const i = oddPrimeIndex(p);
  if (i < 0) {
    return null;
  }
  const slot = (i * WHEEL_STRIDE) % WHEEL_SLOTS;
  return { hue: wheelHue(slot / WHEEL_SLOTS), level: dozenLevel(Math.floor(i / WHEEL_SLOTS)) };
}

const primeTints = new Map<string, IntervalTint>();
/**
 * The tint of a prime: the same wheel hue as its Near dot (`mark` is exactly Near's solid dot color), the fill in the lab's tile
 * look (Tinted: the hue's background step and text step; Outlined and Solid as on the Pairs tiles).
 */
export function primeTint(p: number, ctx: LookCtx): IntervalTint {
  const h = primeHue(p);
  if (!h) {
    return NEUTRAL;
  }
  const key = `${p}|${ctx.look}|${ctx.outline}|${ctx.scheme}`;
  let t = primeTints.get(key);
  if (!t) {
    t = tintOfTile(tileColors(ctx.look, ctx.outline, h.level, h.hue, ctx.scheme), primeColor(p));
    primeTints.set(key, t);
  }
  return t;
}

/**
 * The tint of a hue at a strength 0 to 1 (Brightness): the tile look on that hue (`BLUE` when Hue is off); Tinted keeps the finer
 * ramps (`BRIGHT_FILL_STEPS` for the cell, `BRIGHT_MARK_STEPS` for the dot, both the hue's own Radix steps).
 */
function hueTint(hue: TileHue, strength: number, ctx: LookCtx): IntervalTint {
  const tile = tileColors(ctx.look, ctx.outline, strengthTileLevel(strength), hue, ctx.scheme);
  const mark = hueStep(hue, pick(BRIGHT_MARK_STEPS[ctx.scheme], strength));
  if (ctx.look !== 'tinted') {
    return tintOfTile(tile, mark);
  }
  const n = pick(BRIGHT_FILL_STEPS[ctx.scheme], strength);
  return {
    fill: hueStep(hue, n),
    border: tile.border,
    text: n >= BRIGHT_PLAIN_TEXT_FROM[ctx.scheme] ? 'var(--text)' : hueStep(hue, BRIGHT_TEXT_STEP),
    mark,
  };
}

/** The tint of a strength 0 to 1 with no hue to carry it (prime 2 under a Brightness; the legend bar of a set Hue): a share of the text color. */
function neutralTint(strength: number): IntervalTint {
  const mix = (pct: number) => `color-mix(in srgb, var(--text) ${Math.round(pct)}%, transparent)`;
  return {
    fill: mix(8 + 26 * strength),
    border: mix(30 + 40 * strength),
    text: 'var(--text)',
    mark: mix(45 + 50 * strength),
  };
}

/** The band (magnitude) a Hue Error sign draws at with no Brightness: the middle one, band 2 (the tile look's normal level). */
const FIXED_ERROR_BAND = 2;

/** The tint of a signed error band -4 to 4 in the tile look (the Pairs signed error tiles: orange sharp, cyan flat); the dot is the solid tile. */
function severityTint(band: number, ctx: LookCtx): IntervalTint {
  return tintOfTile(
    signedBandTile(ctx.look, ctx.outline, band, ctx.scheme),
    band === 0 ? NEUTRAL.mark : signedBandTile('solid', false, band, ctx.scheme).fill
  );
}

/** The tint of an interval-class wheel position 0 to 1 at a strength 0 to 1 (the Pairs Interval wheel in the tile look). */
function wheelTint(pos: number, strength: number, ctx: LookCtx): IntervalTint {
  const level = strengthTileLevel(strength);
  const hue = wheelHue(pos % 1);
  return tintOfTile(
    tileColors(ctx.look, ctx.outline, level, hue, ctx.scheme),
    tileColors('solid', false, level, hue, ctx.scheme).fill
  );
}

/** The position 0 to 1 of an interval in the repeat (the Interval class wheel). */
const intervalPosition = (n: Note, repC: number): number => ((n.c / repC) % 1) + (n.c < 0 ? 1 : 0);

/* ------------------------------------------------------------------------------------------------ measure ramp (F11) */
/** One stop of the measure ramp: a Radix hue and step. */
export type RampStop = readonly [RadixHue, number];

/**
 * M9c F11: the ordered multi-hue ramp a MEASURE on Hue uses (viridis-like, built from Radix hues; stops are listed faintest first and
 * the in-between colors are `color-mix(in oklch)` of two neighboring stops, as the lab's wheel blends are). The strong end is the end
 * that holds the most contrast with the panel, so the ramp reads the same way as the Brightness bar (bright = strong):
 * - dark: deep blue (faint) -> cyan -> green -> yellow (strong); OKLCH lightness rises along it;
 * - light: pale yellow (faint) -> green -> cyan -> deep blue (strong); lightness falls along it (the contrast with the panel rises).
 * `marks` are for dots (every stop at least 2 : 1 against the panel), `fills` for cells and cards (the plain text color reads on every
 * stop at least 4.5 : 1, so fills stay darker than marks on dark and lighter on light). The test computes lightness and contrast of
 * every stop from the Radix values.
 */
export const MEASURE_RAMP: Record<'marks' | 'fills', Record<TileScheme, readonly RampStop[]>> = {
  marks: {
    dark: [
      ['blue', 7],
      ['cyan', 8],
      ['cyan', 10],
      ['green', 11],
      ['yellow', 9],
    ],
    light: [
      ['yellow', 8],
      ['green', 9],
      ['cyan', 11],
      ['blue', 12],
    ],
  },
  fills: {
    dark: [
      ['blue', 5],
      ['cyan', 6],
      ['green', 7],
      ['green', 8],
      ['yellow', 8],
    ],
    light: [
      ['yellow', 6],
      ['green', 7],
      ['green', 8],
      ['cyan', 9],
      ['blue', 9],
    ],
  },
};
/** How many distinct colors the ramp is cut into (the strength is rounded to this grid, so tints cache and bars are hard-edged steps). */
export const RAMP_LEVELS = 32;
/** F12: a Brightness on top of a Hue measure mixes the ramp color toward the panel (fills) by up to this share at its faintest... */
export const RAMP_FILL_FAINT_PCT = 55;
/** ...or toward the text color (marks) by up to this share at its strongest, so the faint end of a mark never drops below the ramp's own. */
export const RAMP_MARK_TEXT_PCT = 35;
/** The grid the F12 brightness is rounded to. */
const RAMP_BRIGHT_LEVELS = 8;

const stopCss = (s: RampStop): string => hueStep({ a: s[0] }, s[1]);

/** The ramp color at a strength 0 (faintest stop) to 1 (strongest stop): the strength is rounded to `RAMP_LEVELS`. */
export function rampColor(stops: readonly RampStop[], strength: number): string {
  const q = Math.round(Math.min(1, Math.max(0, strength)) * (RAMP_LEVELS - 1)) / (RAMP_LEVELS - 1);
  const x = q * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x + 1e-9));
  const f = x - i;
  if (f < 1e-6) {
    return stopCss(stops[i]);
  }
  if (f > 1 - 1e-6) {
    return stopCss(stops[i + 1]);
  }
  return `color-mix(in oklch, ${stopCss(stops[i])} ${Math.round((1 - f) * 100)}%, ${stopCss(stops[i + 1])})`;
}

const rampTints = new Map<string, IntervalTint>();
/**
 * The tint of a measure on Hue at a strength 0 to 1 (`hs`), with an optional Brightness strength (`bs`, F12; null = the ramp alone,
 * F13). Tinted and Solid fill with the fill stops (plain text color on top); Outlined puts the mark color on the border over the
 * neutral slot. With a Brightness, the fill is the ramp color mixed toward the panel and the mark toward the text color, so a stronger
 * brightness is always more contrast, as it is on the blue ramp.
 */
export function rampTint(hs: number, bs: number | null, ctx: LookCtx): IntervalTint {
  const h = Math.round(Math.min(1, Math.max(0, hs)) * (RAMP_LEVELS - 1));
  const b = bs === null ? -1 : Math.round(Math.min(1, Math.max(0, bs)) * RAMP_BRIGHT_LEVELS);
  const key = `${h}|${b}|${ctx.look}|${ctx.outline}|${ctx.scheme}`;
  let t = rampTints.get(key);
  if (!t) {
    let mark = rampColor(MEASURE_RAMP.marks[ctx.scheme], hs);
    let fill = rampColor(MEASURE_RAMP.fills[ctx.scheme], hs);
    if (b >= 0) {
      const bf = b / RAMP_BRIGHT_LEVELS;
      const toText = Math.round(RAMP_MARK_TEXT_PCT * bf);
      const toPanel = Math.round(RAMP_FILL_FAINT_PCT * (1 - bf));
      mark = toText > 0 ? `color-mix(in oklch, ${mark}, var(--text) ${toText}%)` : mark;
      fill = toPanel > 0 ? `color-mix(in oklch, ${fill}, var(--panel) ${toPanel}%)` : fill;
    }
    t =
      ctx.look === 'outlined'
        ? { fill: 'var(--panel-slot)', border: mark, text: 'var(--text)', mark }
        : { fill, border: ctx.outline ? mark : 'transparent', text: 'var(--text)', mark };
    rampTints.set(key, t);
  }
  return t;
}

/**
 * The strength 0 (faintest) to 1 of a note under a measure (Hue's or Brightness's), or null when it has none (no ratio, or no entropy
 * curve yet). `bounds` are that channel's own (null = the metric's fixed constants).
 */
function measureStrength(
  metric: RelMetric,
  n: Note,
  ctx: Pick<TintContext, 'he' | 'intensity'>,
  bounds: Bounds | null
): number | null {
  if (metric === 'errorSize') {
    // the five errorBand bands, always strong when large (H-38): band 0 faintest, band 4 strongest
    return Math.abs(signedBand(signedEdoError(n.c))) / 4;
  }
  const v = metricValue(metric, n, ctx.he);
  return v === null
    ? null
    : intensityStrength(complexityPosition(metric, v, bounds), ctx.intensity);
}

/** The strength 0 (faintest) to 1 of a note under a Brightness, or null when it has none. */
function brightStrength(n: Note, ctx: TintContext): number | null {
  return ctx.bright === 'off' ? null : measureStrength(ctx.bright, n, ctx, ctx.bounds);
}

/** The tint of an exact interval under a context; null when the note has no ratio (an irrational note) or the channels need none. */
export function tintOf(n: Note, ctx: TintContext): IntervalTint | null {
  const { hue, bright } = ctx;
  if (hue === 'off' && bright === 'off') {
    return null;
  }
  const strength = brightStrength(n, ctx);
  if (bright !== 'off' && strength === null) {
    return null;
  }
  const measure = hueMeasure(hue);
  if (measure) {
    // F11 to F13: the hue position from the hue measure; a Brightness (if any) moves that color's lightness
    const hs = measureStrength(measure, n, ctx, ctx.hueBounds ?? null);
    return hs === null ? null : rampTint(hs, strength, ctx);
  }
  if (hue === 'off') {
    return hueTint(BLUE, strength ?? 0.5, ctx);
  }
  if (hue === 'prime') {
    const p = largestPrimeOf(n);
    if (p === null) {
      return null;
    }
    if (strength === null) {
      return primeTint(p, ctx);
    }
    const h = primeHue(p);
    return h ? hueTint(h.hue, strength, ctx) : neutralTint(strength);
  }
  if (hue === 'interval') {
    const pos = intervalPosition(n, ctx.repC);
    return strength === null ? wheelTint(pos, 0.5, ctx) : hueTint(wheelHue(pos % 1), strength, ctx);
  }
  // errorSign: the sign from the error, the strength from the error size (H-38) or from the other Brightness (F5)
  const band = signedBand(signedEdoError(n.c));
  if (bright === 'errorSize') {
    return severityTint(band, ctx);
  }
  if (band === 0) {
    return severityTint(0, ctx);
  }
  return strength === null
    ? severityTint(band > 0 ? FIXED_ERROR_BAND : -FIXED_ERROR_BAND, ctx)
    : hueTint({ a: band > 0 ? SHARP_HUE : FLAT_HUE }, strength, ctx);
}

/* ------------------------------------------------------------------------------------------------ legend (D23) */
/** The 12 interval classes of the Interval legend, one wheel slot each (100 c steps of a 1200 c repeat). */
export const INTERVAL_CLASSES = [
  'unison',
  'm2',
  'M2',
  'm3',
  'M3',
  'P4',
  'TT',
  'P5',
  'm6',
  'M6',
  'm7',
  'M7',
] as const;

/** The class index 0 to 11 an interval falls in: the nearest twelfth of the repeat. */
export const intervalClassOf = (n: Note, repC: number): number =>
  Math.round(intervalPosition(n, repC) * INTERVAL_CLASSES.length) % INTERVAL_CLASSES.length;

/** The tint of each of the 12 interval classes at normal strength (the Interval legend's swatches). */
export const intervalClassTints = (ctx: LookCtx): IntervalTint[] =>
  INTERVAL_CLASSES.map((_, k) => wheelTint(k / INTERVAL_CLASSES.length, 0.5, ctx));

/** The Error sign swatches of the legend when no error size is drawn: flat, exact and sharp (key -1, 0, 1) at the fixed band. */
export const errorSignTints = (
  ctx: LookCtx
): { key: number; label: string; tint: IntervalTint }[] => [
  { key: -1, label: 'flat', tint: severityTint(-FIXED_ERROR_BAND, ctx) },
  { key: 0, label: 'exact', tint: severityTint(0, ctx) },
  { key: 1, label: 'sharp', tint: severityTint(FIXED_ERROR_BAND, ctx) },
];

/** The fill a legend BAR draws for a tint: the border for Outlined (whose fill is the neutral slot), else the fill. */
export const barColor = (t: IntervalTint, look: TileLook): string =>
  look === 'outlined' ? t.border : t.fill;

/** How many hard-edged steps a shaded legend bar is drawn with. */
export const LEGEND_STEPS = 12;

/** The word for the strong end of a shaded ramp under the Interval intensity (`strong` = Simple strong). */
export const strongEndOf = (intensity: TintIntensity): 'simple' | 'complex' =>
  intensity === 'strong' ? 'simple' : 'complex';

/** How many bands the error size bar has (the `errorBand` bands 0 to 4, exact first). */
export const ERROR_BAR_BANDS = 5;

/**
 * The colors of the Brightness legend bar, simplest end first (the error size bar: exact end first, one color per `errorBand` band),
 * sampled from the same functions that color the cells: Hue off draws the blue ramp (`hueTint`), a Hue set draws a neutral ramp (the
 * brightness alone; the hue has its own legend).
 */
export function brightBarColors(
  ctx: Pick<TintContext, 'hue' | 'bright' | 'intensity' | 'look' | 'outline' | 'scheme'>,
  steps: number = LEGEND_STEPS
): string[] {
  const errorBar = ctx.bright === 'errorSize';
  const count = errorBar ? ERROR_BAR_BANDS : steps;
  return Array.from({ length: count }, (_, i) => {
    const pos = count === 1 ? 0.5 : i / (count - 1);
    const strength = errorBar ? pos : intensityStrength(pos, ctx.intensity);
    const t = ctx.hue === 'off' ? hueTint(BLUE, strength, ctx) : neutralTint(strength);
    return barColor(t, ctx.look);
  });
}

/**
 * F14: the colors of the Hue legend bar for a measure on Hue, simplest end first (the error size: exact end first, one color per band),
 * sampled from the ramp function that colors the cells (`rampTint`, the ramp alone).
 */
export function hueBarColors(
  ctx: Pick<TintContext, 'hue' | 'intensity' | 'look' | 'outline' | 'scheme'>,
  steps: number = LEGEND_STEPS
): string[] {
  const errorBar = ctx.hue === 'errorSize';
  const count = errorBar ? ERROR_BAR_BANDS : steps;
  return Array.from({ length: count }, (_, i) => {
    const pos = count === 1 ? 0.5 : i / (count - 1);
    return barColor(
      rampTint(errorBar ? pos : intensityStrength(pos, ctx.intensity), null, ctx),
      ctx.look
    );
  });
}

/** The words at the two ends of a measure bar (the error size bar: exact to large). */
export const barEndWords = (measure: RelBright | RelHue): readonly [string, string] =>
  measure === 'errorSize' ? ['exact', 'large'] : ['simple', 'complex'];

/** A number as the legend prints it: the odd limit as an integer, the error size in cents, the others to 2 decimals. */
export const legendNumber = (metric: RelMetric, v: number): string =>
  metric === 'odd'
    ? String(Math.round(v))
    : metric === 'errorSize'
      ? `${Math.round(v * 10) / 10} c`
      : String(Math.round(v * 100) / 100);

/** The bounds a Brightness legend shows: the view's (Fit, when it has any) or the fixed ones; the error size is 0 to `ERROR_BAR_MAX` c; null when off. */
export function legendBounds(channel: RelBright | RelHue, bounds: Bounds | null): Bounds | null {
  const metric = REL_METRICS.find((m) => m === channel);
  if (!metric) {
    return null;
  }
  if (metric === 'errorSize') {
    return { lo: 0, hi: ERROR_BAR_MAX };
  }
  return bounds ?? fixedBoundsOf(metric);
}

/** The signed cents from the nearest 12-EDO step (flat negative, sharp positive). */
export const signedEdoError = (c: number): number => c - 100 * Math.round(c / 100);

/** The 8 equal segments of the signed error strip (`SignedErrorLegend`): bands -4..-1 then +1..+4, exact at the center. */
const ERROR_EDGES = [0, 5, 15, 30] as const;
/**
 * Where a signed error (cents) sits on the signed error strip, 0 (left end) to 1 (right end): the segment by band, linear inside the
 * band's cents range (0-5, 5-15, 15-30 c per side), and the beyond-30 band (30 c up) clamped to its segment's outer end with
 * `beyond` -1 or 1 (the tick is drawn as an outward wedge).
 */
export function errorStripPosition(cents: number): { pos: number; beyond: -1 | 0 | 1 } {
  const a = Math.abs(cents);
  const sign = cents < 0 ? -1 : 1;
  let seg = 3; // the beyond band's index, counted from the center
  let within = 1;
  for (let i = 0; i < 3; i++) {
    if (a < ERROR_EDGES[i + 1]) {
      seg = i;
      within = (a - ERROR_EDGES[i]) / (ERROR_EDGES[i + 1] - ERROR_EDGES[i]);
      break;
    }
  }
  const out = (seg + within) / 4; // 0 to 1 outward from the center, the four segments per side
  return { pos: 0.5 + (sign * out) / 2, beyond: a > 30 ? (sign as -1 | 1) : 0 };
}

/**
 * A hovered interval on a legend: a swatch to outline (`key`: the prime, or the interval class 0 to 11), or a tick on a bar (`pos` 0 to
 * 1 along it, clamped; `beyond` -1 or 1 when the value lies outside the bar's ends, so the tick is drawn as an arrow), or the signed
 * cents of the hovered error for the Error sign strip (`SignedErrorLegend`, which places it with `errorStripPosition`).
 */
export type LegendMark =
  | { kind: 'key'; key: number }
  | { kind: 'pos'; pos: number; beyond: -1 | 0 | 1 }
  | { kind: 'error'; cents: number };

/** A hovered interval on both legends of a view: its place on the hue legend and on the brightness bar (each null when that channel is off or the note has none). */
export interface LegendMarks {
  hue: LegendMark | null;
  bright: LegendMark | null;
}

/**
 * Where a hovered note sits on the legends of a view (null parts: no mark, e.g. an irrational note). Shaded bars run simplest (0) to
 * most complex (1); the error size bar has one segment per band; the Error sign strip runs flat (0) to sharp (1) with 0 c in the middle
 * (`errorStripPosition`).
 */
export function legendMarksOf(
  hue: RelHue,
  bright: RelBright,
  n: Note,
  bounds: Bounds | null,
  repC: number,
  he?: EntropySource | null,
  hueBounds: Bounds | null = null
): LegendMarks {
  let hueMark: LegendMark | null = null;
  const measure = hueMeasure(hue);
  if (measure) {
    hueMark = measureMark(measure, n, hueBounds, he);
  } else if (hue === 'prime') {
    const p = largestPrimeOf(n);
    hueMark = p === null ? null : { kind: 'key', key: p };
  } else if (hue === 'interval') {
    hueMark = { kind: 'key', key: intervalClassOf(n, repC) };
  } else if (hue === 'errorSign') {
    hueMark = { kind: 'error', cents: signedEdoError(n.c) };
  }
  const brightMark = bright === 'off' ? null : measureMark(bright, n, bounds, he);
  return { hue: hueMark, bright: brightMark };
}

/** Where a note sits on a measure's bar (null: no value). The error size bar has one segment per band. */
function measureMark(
  metric: RelMetric,
  n: Note,
  bounds: Bounds | null,
  he?: EntropySource | null
): LegendMark | null {
  if (metric === 'errorSize') {
    return {
      kind: 'pos',
      pos: (Math.abs(signedBand(signedEdoError(n.c))) + 0.5) / ERROR_BAR_BANDS,
      beyond: 0,
    };
  }
  const b = legendBounds(metric, bounds);
  const v = metricValue(metric, n, he);
  if (!b || v === null) {
    return null;
  }
  const x = scaled(metric, v);
  return {
    kind: 'pos',
    pos: complexityPosition(metric, v, b),
    beyond: x < scaled(metric, b.lo) - 1e-9 ? -1 : x > scaled(metric, b.hi) + 1e-9 ? 1 : 0,
  };
}

/* ------------------------------------------------------------------------------------------------ monzo cells */
/** The matrix rows, +12 at the top to -12 at the bottom (the Monzo panel's order). */
export const MONZO_VALUES: readonly number[] = Array.from({ length: 25 }, (_, i) => 12 - i);

/**
 * The interval each matrix cell stands for: the painted monzo with ONLY that prime's exponent set to the cell's value (nothing
 * painted: that prime power alone), folded into one octave when `octave` is Reduced. `cells[j][r]` is the column of
 * `MONZO_PRIMES[j]`, row `MONZO_VALUES[r]`.
 */
export function monzoCellNotes(monzo: MonzoExps, octave: RelColorOctave): Note[][] {
  return MONZO_PRIMES.map((p: MonzoPrime) =>
    MONZO_VALUES.map((v) => {
      const n = monzoNote({ ...monzo, [p]: clampExp(v) } as MonzoExps);
      return octave === 'reduced' ? foldOctave(n) : n;
    })
  );
}

/** The painted monzo itself as an interval (Exact keeps the 2-exponent, Reduced folds it into one octave). */
export function monzoPaintedNote(monzo: MonzoExps, octave: RelColorOctave): Note {
  const n = monzoNote(monzo);
  return octave === 'reduced' ? foldOctave(n) : n;
}

/** The tints of every matrix cell (same shape as `monzoCellNotes`); the Fit range is the min and max over the cells themselves. */
export function monzoCellTints(
  cells: readonly (readonly Note[])[],
  c: Omit<TintContext, 'bounds'> & { range: RelColorRange }
): (IntervalTint | null)[][] {
  // each measure channel has its own bounds (Fit over the cells themselves, or Entropy's Fixed ones); the caller's `bounds` is unused
  const notes = cells.flat();
  const ctx: TintContext = {
    ...c,
    bounds: channelBounds(c.bright, c.range, notes, c.he),
    hueBounds: channelBounds(c.hue, c.range, notes, c.he),
  };
  return cells.map((col) => col.map((n) => tintOf(n, ctx)));
}

/** A tint as the custom properties the picker's CSS reads (`--rc-fill`, `--rc-bd`, `--rc-fg`). */
export const tintVars = (t: IntervalTint | null | undefined): Record<string, string> | undefined =>
  t ? { '--rc-fill': t.fill, '--rc-bd': t.border, '--rc-fg': t.text } : undefined;
