/**
 * M8o: the Relative picker's interval coloring (H-37), pure (no React). ONE module answers "what tint does this exact interval get":
 * the ring cells, the Near dots, the pin cards, the Monzo landing mark and every Monzo matrix cell all call `tintOf`.
 *
 * Metrics: Off, Prime (Near's wheel colors, see `primeColor`), Tenney (log2 of n x d), Odd limit, Error (cents from the nearest
 * 12-EDO step, Pairs' error hues), Interval (Pairs' size wheel) and Roughness (the lab's Sethares dyad roughness, `dissonanceAt`).
 * Tenney, Odd limit and Roughness SHADE along one ramp of one Radix hue (`SHADE_HUE`); `range` picks fixed bounds (the constants
 * below) or the min and max of the cells in the open view. Which end is strong is the lab-wide Interval intensity (`intervalIntensity`,
 * one Developer option, shared with Pairs): `strong` ("Simple strong", default) gives the simplest interval the strongest tint,
 * `faint` ("Complex strong") flips it.
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
export const REL_COLOR_METRICS = [
  'off',
  'prime',
  'tenney',
  'odd',
  'error',
  'interval',
  'roughness',
] as const;
export type RelColorMetric = (typeof REL_COLOR_METRICS)[number];
export type RelColorRange = 'fixed' | 'fit';
export type RelColorOctave = 'exact' | 'reduced';
/** One view's Color choice (Rings, Near; Monzo adds the octave). */
export interface RelViewColor {
  metric: RelColorMetric;
  range: RelColorRange;
}
export interface RelMonzoColor extends RelViewColor {
  octave: RelColorOctave;
}
/** The picker's Color menu, chosen PER VIEW (`settings.v1` ui `relColor`, H-37 amended; Octave is Monzo only). */
export interface RelColor {
  rings: RelViewColor;
  near: RelViewColor;
  monzo: RelMonzoColor;
}
export type RelColorView = keyof RelColor;
export const REL_VIEW_DEFAULT: RelViewColor = { metric: 'prime', range: 'fixed' };
export const REL_MONZO_DEFAULT: RelMonzoColor = { ...REL_VIEW_DEFAULT, octave: 'exact' };
export const REL_COLOR_DEFAULT: RelColor = {
  rings: { ...REL_VIEW_DEFAULT },
  near: { ...REL_VIEW_DEFAULT },
  monzo: { ...REL_MONZO_DEFAULT },
};

const asRecord = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

function sanitizeView(o: Record<string, unknown>): RelViewColor {
  return {
    metric: REL_COLOR_METRICS.includes(o.metric as RelColorMetric)
      ? (o.metric as RelColorMetric)
      : REL_VIEW_DEFAULT.metric,
    range: o.range === 'fit' ? 'fit' : 'fixed',
  };
}

/**
 * A stored value as a settings object, field by field: absent or damaged falls back to the default. The old flat shape
 * `{ metric, range, octave }` (one choice for all views) is read into all three views.
 */
export function sanitizeRelColor(raw: unknown): RelColor {
  const o = asRecord(raw);
  const flat = 'metric' in o || 'range' in o || 'octave' in o;
  const pick = (k: RelColorView): Record<string, unknown> => (flat ? o : asRecord(o[k]));
  const monzo = pick('monzo');
  return {
    rings: sanitizeView(pick('rings')),
    near: sanitizeView(pick('near')),
    monzo: { ...sanitizeView(monzo), octave: monzo.octave === 'reduced' ? 'reduced' : 'exact' },
  };
}

/** The metrics that shade along the ramp (Tenney, Odd limit, Roughness). */
export const isShaded = (m: RelColorMetric): boolean =>
  m === 'tenney' || m === 'odd' || m === 'roughness';
/** The metrics the Range switch applies to (the shaded ones; Error is always the fixed bands, D25). */
export const hasRange = (m: RelColorMetric): boolean => isShaded(m);

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
  const h = wheelHue(slot / WHEEL_SLOTS);
  return h.b
    ? `color-mix(in oklch, var(--rx-${h.a}-${n}) ${h.pctA}%, var(--rx-${h.b}-${n}))`
    : `var(--rx-${h.a}-${n})`;
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

/** The one hue of the shaded metrics (Tenney, Odd limit, Roughness). Not the accent (accent never encodes data) and not the heat family. */
export const SHADE_HUE: RadixHue = 'violet';
/**
 * The Radix steps of the ramp, faintest first. Both schemes read a HIGHER step as stronger (dark: brighter against the dark panel;
 * light: darker against the white panel), so the same list serves both; per-scheme lists are kept so either can be tuned by eye.
 * Text is step 12, readable on every step here.
 */
export const SHADE_STEPS: Record<TileScheme, readonly number[]> = {
  dark: [3, 4, 5, 6, 7, 8],
  light: [3, 4, 5, 6, 7, 8],
};
/** The dot (mark) steps of the ramp, faintest first: solid-ish, so a small dot still shows. */
export const SHADE_MARK_STEPS: Record<TileScheme, readonly number[]> = {
  dark: [5, 6, 7, 8, 9],
  light: [5, 6, 7, 8, 9],
};
const SHADE_TEXT_STEP = 12;

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

/** A metric's unit for shading: the odd limit is shaded on its log2, the others as they are. */
const scaled = (metric: RelColorMetric, v: number): number =>
  metric === 'odd' ? Math.log2(Math.max(1, v)) : v;

export interface Bounds {
  lo: number;
  hi: number;
}

/** The context of one painting: the metric, the intensity and scheme, the size of the repeat, and the fit bounds (null = fixed). */
export interface TintContext {
  metric: Exclude<RelColorMetric, 'off'>;
  intensity: TintIntensity;
  scheme: TileScheme;
  /** The lab's tile look and stacked outline (`developer.v1`), as the Pairs tiles read them. */
  look: TileLook;
  outline: boolean;
  repC: number;
  bounds: Bounds | null;
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
 * The number a metric measures on a note (Tenney: log2 of n x d, Odd limit, Error: absolute cents from 12-EDO, Roughness), or null
 * when it has none (Off, Prime, Interval; or an irrational note, for the ones that need a ratio).
 */
export function metricValue(metric: RelColorMetric, n: Note): number | null {
  switch (metric) {
    case 'tenney':
      return tenneyHeight(n);
    case 'odd': {
      const o = oddLimit(n);
      return o === null ? null : Number(o);
    }
    case 'error':
      return edoError(n.c);
    case 'roughness':
      return dyadRoughness(n.c);
    default:
      return null;
  }
}

/** The min and max of a metric over notes (the Fit to view bounds), or null when no note has a value. */
export function fitBounds(metric: RelColorMetric, notes: Iterable<Note>): Bounds | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    const v = metricValue(metric, n);
    if (v !== null) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return hi < lo ? null : { lo, hi };
}

/** Where a value sits between simplest (0) and most complex (1) on the metric's bounds: clamped; a flat range is the middle. */
export function complexityPosition(
  metric: RelColorMetric,
  v: number,
  bounds: Bounds | null
): number {
  const b = bounds ?? (isShaded(metric) ? FIXED_BOUNDS[metric as keyof typeof FIXED_BOUNDS] : null);
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

/** The tint of a shaded metric at a strength 0 to 1: the tile look on the shade hue; Tinted keeps the finer `SHADE_STEPS` ramp. */
function shadeTint(strength: number, ctx: LookCtx): IntervalTint {
  const tile = tileColors(
    ctx.look,
    ctx.outline,
    strengthTileLevel(strength),
    { a: SHADE_HUE },
    ctx.scheme
  );
  const mark = `var(--rx-${SHADE_HUE}-${pick(SHADE_MARK_STEPS[ctx.scheme], strength)})`;
  if (ctx.look !== 'tinted') {
    return tintOfTile(tile, mark);
  }
  return {
    fill: `var(--rx-${SHADE_HUE}-${pick(SHADE_STEPS[ctx.scheme], strength)})`,
    border: tile.border,
    text: `var(--rx-${SHADE_HUE}-${SHADE_TEXT_STEP})`,
    mark,
  };
}

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

/** The tint of an exact interval under a context; null when the note has no ratio (an irrational note) or the metric needs none. */
export function tintOf(n: Note, ctx: TintContext): IntervalTint | null {
  const { metric } = ctx;
  if (metric === 'prime') {
    const p = largestPrimeOf(n);
    return p === null ? null : primeTint(p, ctx);
  }
  if (metric === 'error') {
    return severityTint(signedBand(signedEdoError(n.c)), ctx);
  }
  if (metric === 'interval') {
    const h = tenneyHeight(n);
    const strength = intensityStrength(
      h === null ? 0.5 : complexityPosition('tenney', h, null),
      ctx.intensity
    );
    return wheelTint(intervalPosition(n, ctx.repC), strength, ctx);
  }
  const v = metricValue(metric, n);
  if (v === null) {
    return null;
  }
  return shadeTint(
    intensityStrength(complexityPosition(metric, v, ctx.bounds), ctx.intensity),
    ctx
  );
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

/** The fill a legend BAR draws for a tint: the border for Outlined (whose fill is the neutral slot), else the fill. */
export const barColor = (t: IntervalTint, look: TileLook): string =>
  look === 'outlined' ? t.border : t.fill;

/** How many hard-edged steps a shaded legend bar is drawn with. */
export const LEGEND_STEPS = 12;

/** The word for the strong end of a shaded ramp under the Interval intensity (`strong` = Simple strong). */
export const strongEndOf = (intensity: TintIntensity): 'simple' | 'complex' =>
  intensity === 'strong' ? 'simple' : 'complex';

/**
 * The colors of a shaded legend bar, simplest end first, sampled from the same function that colors the cells (`shadeTint` at the
 * strength of each position under the intensity).
 */
export function shadeBarColors(
  ctx: Pick<TintContext, 'intensity' | 'look' | 'outline' | 'scheme'>,
  steps: number = LEGEND_STEPS
): string[] {
  return Array.from({ length: steps }, (_, i) => {
    const pos = steps === 1 ? 0.5 : i / (steps - 1);
    return barColor(shadeTint(intensityStrength(pos, ctx.intensity), ctx), ctx.look);
  });
}

/** A number as the legend prints it: the odd limit as an integer, the others to 2 decimals. */
export const legendNumber = (metric: RelColorMetric, v: number): string =>
  metric === 'odd' ? String(Math.round(v)) : String(Math.round(v * 100) / 100);

/** The bounds a shaded legend shows: the view's (Fit, when it has any) or the fixed ones; null for a metric that does not shade. */
export function legendBounds(metric: RelColorMetric, bounds: Bounds | null): Bounds | null {
  if (!isShaded(metric)) {
    return null;
  }
  return bounds ?? FIXED_BOUNDS[metric as keyof typeof FIXED_BOUNDS];
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
 * cents of the hovered error for the Error strip (`SignedErrorLegend`, which places it with `errorStripPosition`).
 */
export type LegendMark =
  | { kind: 'key'; key: number }
  | { kind: 'pos'; pos: number; beyond: -1 | 0 | 1 }
  | { kind: 'error'; cents: number };

/**
 * Where a hovered note sits on the legend of a metric (null: no mark, e.g. an irrational note). Shaded bars run simplest (0) to most
 * complex (1); the Error strip runs flat (0) to sharp (1) with 0 c in the middle (`errorStripPosition`).
 */
export function legendMarkOf(
  metric: RelColorMetric,
  n: Note,
  bounds: Bounds | null,
  repC: number
): LegendMark | null {
  if (metric === 'prime') {
    const p = largestPrimeOf(n);
    return p === null ? null : { kind: 'key', key: p };
  }
  if (metric === 'interval') {
    return { kind: 'key', key: intervalClassOf(n, repC) };
  }
  if (metric === 'error') {
    return { kind: 'error', cents: signedEdoError(n.c) };
  }
  const b = legendBounds(metric, bounds);
  const v = metricValue(metric, n);
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
  const bounds = c.range === 'fit' && hasRange(c.metric) ? fitBounds(c.metric, cells.flat()) : null;
  const ctx: TintContext = { ...c, bounds };
  return cells.map((col) => col.map((n) => tintOf(n, ctx)));
}

/** A tint as the custom properties the picker's CSS reads (`--rc-fill`, `--rc-bd`, `--rc-fg`). */
export const tintVars = (t: IntervalTint | null | undefined): Record<string, string> | undefined =>
  t ? { '--rc-fill': t.fill, '--rc-bd': t.border, '--rc-fg': t.text } : undefined;
