/**
 * M8b (redesign 3): the Relative pitches generator's picker is a MODAL in the middle of the window, opened by a click on a note of
 * the main ring (that note becomes the source). Its center is a COPY OF THE MAIN RING (`PitchRing` itself, with the field's notes
 * and the source note outlined), NOT turned (1/1 at 12 o'clock like the main ring); the hovered cell's ghost
 * dot is drawn on THIS ring (orange above, teal below), not on the main one. Round it, four ring places outward show four
 * consecutive rings of `relativeRingAt` (levels 1 to 3, then one ring per odd limit, split at 48 ratios; no end) from `ringStart`; keys 3
 * and 2 move one ring more complex or simpler. Each ratio is ONE cell (its whole annular sector). The direction comes
 * from Alt while the modal is open: not held = the ratio ABOVE the source note, held = BELOW it. A click adds the landing note
 * and the modal stays open. Clockwise is higher. The modal makes no sound.
 *
 * Size: the inner ring's circle is `INNER_RATIO` (1.15, never under 0.9) times the MAIN ring's circle, measured in pixels when the
 * modal opens (`mainPxPerUnit`). The bands start outside the inner ring's labels. If everything does not fit the window the bands
 * narrow first (to `MIN_BAND_FACTOR`), then the whole picture scales down uniformly (`layoutFor`).
 *
 * Layout (D8): a band spreads its cells evenly in pitch order, a small tick on its inner edge at the ratio's true angle, a tag with the ring's
 * label at its start edge. A ring writes its labels horizontally, or along the radius (never upside down) when a cell's arc is
 * under `RADIAL_BELOW_ARC_PX`.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, SegmentedControl } from '@mantine/core';
import {
  landingPitch,
  landingReadout,
  monzoLanding,
  monzoStep,
  nearComplexity,
  nearRatios,
  noteText,
  parseTypedStep,
  primeRingIndex,
  relativeRingAt,
  type Direction,
  type MonzoExps,
  type MonzoPrime,
  type NearOrder,
  type Note,
  type RingRatio,
} from '../../../lib/harmonic-field';
import { wheelHue } from '../state/tileColors';
import {
  MONZO_CTL_H,
  MonzoPanel,
  STRIP_AREA_ROWS,
  monzoSummary,
  type MonzoView,
} from './MonzoPanel';
import { PrimeFilterChips } from './PrimeFilterChips';
import { RING_PX_PER_UNIT, RING_R, RingDot } from './ringMarks';
import { PitchRing, type RingDotExtra, type RingOverlayArgs } from './RingStats';
import classes from './relativeMenu.module.css';

/** The inner ring's circle as a multiple of the main ring's circle (the human's floor is 0.9). */
export const INNER_RATIO = 1.15;
/** The bands' radial widths (pixels at scale 1) before the narrowing, and the gap between bands. */
export const MENU_BAND_WIDTHS = [30, 32, 34, 36, 40, 44, 48, 54, 60] as const;
export const MENU_GAP = 4;
/** The narrowest the bands get (a factor on their widths) before the whole picture scales down instead. */
export const MIN_BAND_FACTOR = 0.75;
/** Full-screen experiment: the inner ring shrinks (never under this multiple of the main ring) so the bands keep this factor. */
export const MIN_INNER_RATIO = 0.5;
export const PREF_BAND_FACTOR = 0.85;
/** The places always show this many consecutive groups of the ring sequence (one per entry of `MENU_BAND_WIDTHS`). */
export const MENU_PLACES = MENU_BAND_WIDTHS.length;
/** Experiment switch: the modal fills the window (set false, with 4 widths, to go back). */
export const FULLSCREEN = true;
/** A band writes its labels along the radius when one cell's arc at the band's middle is shorter than this many pixels. */
export const RADIAL_BELOW_ARC_PX = 36;
/** The sequence has no end, so `ringStart` has no upper limit; it never goes below 0. */
export const clampRingStart = (n: number): number => Math.max(0, Math.round(n));

/** The key a navigation press means: `Digit2` or `Digit3` (Shift changes `e.key`, so the physical code is read), else null. */
export function navMove(e: {
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): { dir: 1 | -1; prime: 0 | 1 | 5 } | null {
  if ((e.code !== 'Digit2' && e.code !== 'Digit3') || e.altKey || e.metaKey) {
    return null;
  }
  const dir = e.code === 'Digit3' ? 1 : -1;
  if (e.shiftKey) {
    return { dir, prime: e.ctrlKey ? 5 : 1 };
  }
  return e.ctrlKey ? null : { dir, prime: 0 };
}

/** True for a field where typing digits is typing (text-like inputs, text areas, selects, editable content). */
const isTypingTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) {
    return false;
  }
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
    return true;
  }
  return (
    el.tagName === 'INPUT' &&
    !['radio', 'checkbox', 'button', 'range', 'submit'].includes((el as HTMLInputElement).type)
  );
};
/** The modal is never narrower than this (pixels): the footer's controls need the room. */
const MIN_BODY_W = 480;
/** The modal's horizontal padding (both sides, pixels; Mantine `xs`) plus a little slack. */
const MODAL_PAD_W = 24;
/** Room used by the modal's own chrome (title, footer, padding, margins), pixels. */
const CHROME_H = 175;
const CHROME_W = 40;
/** The label half-width used until the inner ring's own box is measured (SVG units). */
const FALLBACK_VB_HALF = 160;

/** Monzo mode: the strip rows are 12 to 18 px tall, the gap between the ring, strips and controls, and the smallest ring area. */
const MONZO_ROW_MIN = 12;
const MONZO_ROW_MAX = 24;
const MONZO_GAP = 6;
const MONZO_RING_MIN = 120;

const EMPTY_SET: ReadonlySet<number> = new Set<number>();

/** M8d meta ring: the settings (runtime only, kept by the page), their defaults and ranges, and the most dots drawn. */
export interface MetaSettings {
  measure: NearOrder;
  /** The whole window in cents (+-half around the center). */
  spanC: number;
  oddCap: number;
  /** The angle (degrees) the window spreads over, centered on noon; the rest (the seam) is centered at 6 o'clock. */
  arc: number;
  /** How the dots are joined: not at all, in complexity order (one zigzag), or one thread per largest prime. */
  connect: MetaConnect;
  /** Dot fill by the ratio's largest prime. */
  colorByPrime: boolean;
  /** Faint circles at round complexity values. */
  rings: boolean;
  /** Radial spokes at round cent offsets. */
  cents: boolean;
  /**
   * Where offset 0 sits: at noon, or at the true angle of the pitch the center interval would add (from the clicked note, in the
   * current direction) on the center ring (1/1 at noon). With Alt (below) the window mirrors, so with Span 1200 and Arc 360 every
   * dot sits at the true angle of the pitch it would add.
   */
  zero: MetaZero;
  /** The radius scale: linear in the complexity, its log, or even (square root of the count-like size). */
  scale: MetaScale;
  /** Prime filter (25 slots like the generator's, not linked to it): dots using a prime that is off are dropped. */
  mask: boolean[];
}
export type MetaConnect = 'off' | 'order' | 'prime';
export type MetaZero = 'noon' | 'landing';
export type MetaScale = 'linear' | 'log' | 'even';
export const META_DEFAULTS: MetaSettings = {
  measure: 'tenney',
  spanC: 1200,
  oddCap: 123,
  arc: 360,
  connect: 'off',
  colorByPrime: true,
  rings: true,
  cents: true,
  zero: 'landing',
  scale: 'even',
  mask: Array.from({ length: 25 }, () => true),
};
/** The two settings sets: the Near button (everything near the clicked note, 1/1) and Ctrl+click / typed Near (near that interval). */
export interface MetaSets {
  nearButton: MetaSettings;
  nearClick: MetaSettings;
}
export const META_SETS_DEFAULTS: MetaSets = {
  nearButton: { ...META_DEFAULTS, mask: [...META_DEFAULTS.mask] },
  nearClick: { ...META_DEFAULTS, spanC: 100, arc: 210, mask: [...META_DEFAULTS.mask] },
};
export type MetaContext = keyof MetaSets;
export const META_RANGES = {
  spanC: [4, 1200],
  oddCap: [3, 499],
  arc: [30, 360],
} as const;
export const META_MAX_DOTS = 3500;
/** The default arc (degrees); the rest of the circle (the seam, at 6 o'clock) stays empty. */
export const META_SWEEP = 300;

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
/** The largest prime of numerator and denominator together (2 when there is none, as for 1/1). */
export function largestPrime(text: string): number {
  const [n, d] = text.split('/').map(Number);
  let m = (n || 1) * (d || 1);
  let best = 2;
  for (let f = 2; f * f <= m; f += f === 2 ? 1 : 2) {
    while (m % f === 0) {
      best = Math.max(best, f);
      m /= f;
    }
  }
  return m > 1 ? Math.max(best, m) : best;
}
/** The labeled cents steps, and for each the finer step the unlabeled spokes use. */
const CENTS_STEPS = [1, 2, 5, 10, 20, 50, 100] as const;
const CENTS_FINE: Record<number, number> = { 1: 0.5, 2: 0.5, 5: 1, 10: 2, 20: 5, 50: 10, 100: 20 };
export const centsStep = (half: number): number =>
  CENTS_STEPS.find((s) => half / s <= 6) ?? CENTS_STEPS[CENTS_STEPS.length - 1];
/** Odd limits the complexity rings can sit on. */
/** The least gap (px) between two complexity rings. */
const RING_GAP = 12;
const ODD_RING_VALUES = [7, 15, 31, 63, 127, 255, 511];
/** A cents offset as text with a real minus sign: `+9.9 c`, `−7.7 c`. */
export const signedCents = (c: number, dp = 1): string =>
  `${c < 0 ? '−' : '+'}${Math.abs(c).toFixed(dp)} c`;
/** The meta ring's center: a ratio (a ring cell, or typed) or plain cents (typed). */
export interface MetaCenter {
  note: Note;
  text: string;
}

/** A small number box that keeps what is typed and commits (clamped) on blur or Enter. */
function MetaNum({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) {
      onCommit(Math.min(max, Math.max(min, Math.round(n))));
    }
    setDraft(String(value));
  };
  return (
    <label className={classes.metaField}>
      <span>{label}</span>
      <input
        className={classes.metaInput}
        inputMode="numeric"
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/** What the pointer or focus is on. */
export interface RelativeHover {
  ratio: RingRatio;
  dir: Direction;
}

/** The angle (degrees clockwise from the top) of cell `i` of a band of `n`: spread evenly in pitch order. */
export const spreadAngle = (i: number, n: number): number => ((i + 0.5) / n) * 360;

/** The ratio's true angle (degrees clockwise from the top, folded into one turn) for a repeat of `repC` cents. */
export const trueAngle = (cents: number, repC: number): number =>
  repC > 0 ? ((((cents / repC) * 360) % 360) + 360) % 360 : 0;

const polar = (C: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
};

/** An annulus (ring-shaped band) as one path, filled even-odd. */
const annulus = (C: number, ri: number, ro: number): string =>
  [ro, ri]
    .map((r) => `M${C - r} ${C}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`)
    .join('');

/** One cell of a band: the annular sector between two angles (degrees clockwise from the top). */
const sectorPath = (C: number, ri: number, ro: number, a0: number, a1: number): string => {
  const o0 = polar(C, ro, a0);
  const o1 = polar(C, ro, a1);
  const i0 = polar(C, ri, a0);
  const i1 = polar(C, ri, a1);
  return `M${o0.x} ${o0.y}A${ro} ${ro} 0 0 1 ${o1.x} ${o1.y}L${i1.x} ${i1.y}A${ri} ${ri} 0 0 0 ${i0.x} ${i0.y}Z`;
};

/** The main ring's pixels per SVG unit: its svg box width over its viewBox width (the fallback when it has no size, as in a test). */
export function mainPxPerUnit(svg: Element | null): number {
  if (!svg) {
    return RING_PX_PER_UNIT;
  }
  const w = svg.getBoundingClientRect().width;
  const vb = Number((svg.getAttribute('viewBox') ?? '').split(/\s+/)[2]);
  return w > 0 && vb > 0 ? w / vb : RING_PX_PER_UNIT;
}

export interface MenuLayout {
  /** Pixels per SVG unit of the inner ring before the uniform scale. */
  ppu: number;
  /** The inner radius of band 1 (outside the inner ring's labels), pixels at scale 1. */
  r0: number;
  /** The band widths' factor (1 down to `MIN_BAND_FACTOR`). */
  f: number;
  /** Each band's inner and outer radius, pixels at scale 1. */
  bands: [number, number][];
  /** The whole picture's half-size at scale 1, and the uniform scale that makes it fit (<= 1). */
  half: number;
  scale: number;
}

/**
 * The picture's geometry. `mainPpu`: the main ring's pixels per unit. The inner ring is `INNER_RATIO` times it, so the inner
 * ring's circle (diameter 2 * RING_R * ppu * scale) is `INNER_RATIO * scale` times the main ring's. `vbHalf` is half the inner
 * svg's drawing (its labels). `availR` is the largest radius the window allows. Bands narrow to fit, then `scale` shrinks all.
 */
export function layoutFor(mainPpu: number, vbHalf: number, availR: number): MenuLayout {
  const widthSum = MENU_BAND_WIDTHS.reduce((a, b) => a + b, 0);
  const gaps = MENU_GAP * MENU_BAND_WIDTHS.length;
  // the inner ring shrinks (down to MIN_INNER_RATIO of the main ring) so the bands keep PREF_BAND_FACTOR of their widths
  const ppuFit = (availR - gaps - 2 - widthSum * PREF_BAND_FACTOR - 2) / (vbHalf * 1.08);
  const ppu = Math.max(mainPpu * MIN_INNER_RATIO, Math.min(mainPpu * INNER_RATIO, ppuFit));
  const r0 = vbHalf * ppu * 1.08 + 2;
  const fixed = r0 + gaps + 2;
  const f = Math.max(MIN_BAND_FACTOR, Math.min(1, (availR - fixed) / widthSum));
  const bands: [number, number][] = [];
  let ri = r0 + MENU_GAP;
  for (const w of MENU_BAND_WIDTHS) {
    const ro = ri + w * f;
    bands.push([ri, ro]);
    ri = ro + MENU_GAP;
  }
  const half = bands[bands.length - 1][1] + 2;
  return { ppu, r0, f, bands, half, scale: Math.min(1, availR / half) };
}

export interface RelativeModalProps {
  opened: boolean;
  /** The source note, its index in the field, the repeat. */
  from: Note;
  fromIdx: number;
  rep: Note;
  repC: number;
  /** The Developer ring step. */
  step: number;
  /** The main ring's pixels per unit, measured when the modal opened. */
  mainPpu: number;
  hover: RelativeHover | null;
  onHover: (h: RelativeHover | null) => void;
  /** A half was clicked (or Enter or Space on it). */
  onPick: (h: RelativeHover) => void;
  onRemove: () => void;
  onClose: () => void;
  /** The line under the picture: the hover readout, or the reason a click changed nothing. */
  line: string | null;
  /** How the bands are turned: 'from' = they start at the source note's angle on the inner ring, 'fixed' = unison at noon. */
  bandMode: BandMode;
  onBandMode: (m: BandMode) => void;
  /** Which group of the ring sequence is in place 1 (0 = 3-5, 7-9, 11-15, 17). Runtime only, kept by the page. */
  ringStart: number;
  onRingStart: (n: number) => void;
  /** M8c: Rings (the bands) or Monzo (strips or rows plus the typed box); runtime only, kept by the page. */
  mode: RelativeMode;
  onMode: (m: RelativeMode) => void;
  monzoView: MonzoView;
  onMonzoView: (v: MonzoView) => void;
  /** The kept exponents (lab state), and how they change. */
  monzo: MonzoExps;
  onMonzo: (prime: MonzoPrime, value: number) => void;
  onMonzoReset: () => void;
  /** Add a note by its text (the page dispatches `relative/add`). */
  onAdd: (text: string) => void;
  /** The state's quiet line (a refused or duplicate add), shown in the readout pill. */
  message: string | null;
  /**
   * The landing note under the pointer (a ring cell with the current direction, or in Monzo mode the monzo landing while the pointer
   * is over the matrix or the rows), or null: what holds 1 / 4 / 5 preview. The page owns the sound.
   */
  onPreview?: (landing: Note | null) => void;
  /** M8d: the meta ring's two settings sets, kept by the page (runtime only). Without them the modal keeps its own. */
  metaSets?: MetaSets;
  onMetaSets?: (s: MetaSets) => void;
}

export type BandMode = 'from' | 'fixed';
export type RelativeMode = 'rings' | 'monzo';

const noDotProps = (): RingDotExtra => ({ 'aria-pressed': undefined, tabIndex: -1 });

/** One meta dot: its ratio, offset from the center, complexity, largest prime, and whether it is the center itself. */
export interface MetaDot {
  ratio: RingRatio;
  offsetC: number;
  v: number;
  prime: number;
  isCenter: boolean;
}

/** The complexity range of the dots (the radius scale). */
export function metaRange(dots: readonly MetaDot[]): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of dots) {
    lo = Math.min(lo, d.v);
    hi = Math.max(hi, d.v);
  }
  return dots.length ? { lo, hi } : { lo: 0, hi: 0 };
}

/**
 * The radius transform, one function for the dots, the highlight and the complexity rings. Linear: v. Log: log(1 + v). Even: the
 * count-like size, which for Tenney (log2 of n x d) is 2^(v/2) = sqrt(n x d); odd-limit counts already grow about with the radius,
 * so for the odd limit Even is the same as Linear.
 */
export function metaScaleValue(measure: NearOrder, scale: MetaScale, v: number): number {
  if (scale === 'log') {
    return Math.log(1 + Math.max(0, v));
  }
  if (scale === 'even' && measure === 'tenney') {
    return 2 ** (v / 2);
  }
  return v;
}

/** The radius of a complexity value between the transformed lo and hi. */
export function metaRadius(
  g: { rMin: number; rMax: number; lo: number; hi: number; measure: NearOrder; scale: MetaScale },
  v: number
): number {
  const f0 = metaScaleValue(g.measure, g.scale, g.lo);
  const f1 = metaScaleValue(g.measure, g.scale, g.hi);
  return (
    g.rMin + ((g.rMax - g.rMin) * (metaScaleValue(g.measure, g.scale, v) - f0)) / (f1 - f0 || 1)
  );
}

export interface MetaGeometry {
  measure: NearOrder;
  scale: MetaScale;
  C: number;
  rMin: number;
  rMax: number;
  lo: number;
  hi: number;
  zero: number;
  sign: 1 | -1;
  arc: number;
  spanC: number;
}

/** Where a dot sits: shared by the memoized layer and the hover highlight so they always agree. */
export function metaDotPos(g: MetaGeometry, d: { v: number; offsetC: number }) {
  const r = metaRadius(g, d.v);
  return polar(g.C, r, g.zero + (g.sign * d.offsetC * g.arc) / g.spanC);
}

export interface MetaLayerProps {
  C: number;
  bands: readonly (readonly [number, number])[];
  rMin: number;
  rMax: number;
  lo: number;
  hi: number;
  zero: number;
  sign: 1 | -1;
  mSet: MetaSettings;
  meta: MetaCenter;
  dots: readonly MetaDot[];
  onDotEnter: (ratio: RingRatio, altKey?: boolean) => void;
  onDotLeave: () => void;
  onDotClick: (ratio: RingRatio, altKey: boolean) => void;
  onDotKey: (
    ratio: RingRatio,
    e: { key: string; altKey: boolean; preventDefault: () => void }
  ) => void;
  onSurfaceClick: (ctrlKey: boolean) => void;
}

/**
 * The meta ring's whole drawing (surface, guides, threads, dots with hit circles). Memoized with stable props and callbacks, so a
 * hover (which only changes the parent's `cell`) never re-renders it; the hovered highlight is one circle drawn above it.
 */
const MetaLayer = memo(function MetaLayer({
  C,
  bands,
  rMin,
  rMax,
  lo,
  hi,
  zero,
  sign,
  mSet,
  meta,
  dots,
  onDotEnter,
  onDotLeave,
  onDotClick,
  onDotKey,
  onSurfaceClick,
}: MetaLayerProps) {
  const arc = mSet.arc;
  const geo: MetaGeometry = {
    measure: mSet.measure,
    scale: mSet.scale,
    C,
    rMin,
    rMax,
    lo,
    hi,
    zero,
    sign,
    arc,
    spanC: mSet.spanC,
  };
  const metaAngle = (offsetC: number) => zero + (sign * offsetC * arc) / mSet.spanC;
  const radiusOf = (v: number) => metaRadius(geo, v);
  const metaPos = (d: { v: number; offsetC: number }) => metaDotPos(geo, d);
  const pts = (list: readonly MetaDot[]) =>
    list
      .map((d) => metaPos(d))
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  const metaLine = useMemo(
    () => pts(dots),
    [dots, C, rMin, rMax, lo, hi, zero, sign, arc, mSet.spanC, mSet.measure, mSet.scale]
  );
  // one thread per largest prime (groups of two or more, in complexity order)
  const threads = useMemo(() => {
    const byPrime = new Map<number, MetaDot[]>();
    for (const d of dots) {
      const g = byPrime.get(d.prime);
      if (g) {
        g.push(d);
      } else {
        byPrime.set(d.prime, [d]);
      }
    }
    return [...byPrime.entries()].filter(([, g]) => g.length > 1).sort(([a], [b]) => a - b);
  }, [dots]);
  const seamHalf = Number((mSet.spanC / 2).toFixed(2));
  const closed = arc >= 330;
  const seamGap = closed ? 0 : 14;
  const seamEdge = (s: -1 | 1) => metaAngle((s * mSet.spanC) / 2) + s * sign * seamGap;
  const seamL = polar(C, (rMin + rMax) / 2, closed ? zero + 180 : seamEdge(-1));
  const seamR = polar(C, (rMin + rMax) / 2, seamEdge(1));
  // guides: complexity rings (round values inside the drawn range) and cents spokes
  const ringValues: number[] = [];
  if (mSet.rings && dots.length) {
    const candidates: number[] = [];
    if (mSet.measure === 'odd') {
      candidates.push(...ODD_RING_VALUES.filter((v) => v >= lo && v <= hi));
      if (!candidates.includes(hi)) {
        candidates.push(hi);
      }
    } else {
      for (let v = Math.ceil(lo); v <= Math.floor(hi); v++) {
        candidates.push(v);
      }
    }
    // thin by distance on the drawn radius (the transform crowds one end): from the outside in, keep a ring only when it
    // sits at least RING_GAP px inside the last kept one
    let lastR = Infinity;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const r = radiusOf(candidates[i]);
      if (lastR - r >= RING_GAP) {
        ringValues.push(candidates[i]);
        lastR = r;
      }
    }
    ringValues.reverse();
  }
  const ringLabel = (v: number) => (mSet.measure === 'odd' ? `o${v}` : `T${v}`);
  const arcPath = (r: number) => {
    const a0 = zero - arc / 2;
    const a1 = zero + arc / 2;
    const p0 = polar(C, r, a0);
    const pm = polar(C, r, zero);
    const p1 = polar(C, r, a1);
    return `M${p0.x} ${p0.y}A${r} ${r} 0 0 1 ${pm.x} ${pm.y}A${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
  };
  const halfC = mSet.spanC / 2;
  const labStep = centsStep(halfC);
  const spokes: { c: number; labeled: boolean }[] = [];
  if (mSet.cents) {
    for (let k = 1; k * labStep <= halfC + 1e-9; k++) {
      spokes.push({ c: k * labStep, labeled: true }, { c: -k * labStep, labeled: true });
    }
    const fine = CENTS_FINE[labStep];
    const px = (rMax * ((arc * Math.PI) / 180) * fine) / mSet.spanC;
    if (px >= 6) {
      for (let k = 1; k * fine <= halfC + 1e-9; k++) {
        const c = Math.round(k * fine * 100) / 100;
        if (Math.abs(c / labStep - Math.round(c / labStep)) > 1e-6) {
          spokes.push({ c, labeled: false }, { c: -c, labeled: false });
        }
      }
    }
  }
  const centsText = (c: number) => `${c < 0 ? '−' : '+'}${Math.abs(c)} c`;
  const dotFill = (d: { prime: number }) =>
    mSet.colorByPrime ? { fill: primeColor(d.prime) } : undefined;
  return (
    <g data-testid="relative-meta" className={classes.metaOverlay}>
      {/* catches the pointer over the bands (they are dimmed): a Ctrl+click on empty space closes the meta ring */}
      <path
        className={classes.metaHit}
        d={annulus(C, bands[0][0] - MENU_GAP, bands[bands.length - 1][1] + 2)}
        fillRule="evenodd"
        onClick={(e) => {
          e.stopPropagation();
          onSurfaceClick(e.ctrlKey);
        }}
      />
      <line
        className={classes.metaGuide}
        x1={polar(C, rMin - 6, zero).x}
        y1={polar(C, rMin - 6, zero).y}
        x2={polar(C, rMax + 2, zero).x}
        y2={polar(C, rMax + 2, zero).y}
      />
      {(closed ? [zero + 180] : [zero - arc / 2, zero + arc / 2]).map((a) => (
        <line
          key={a}
          className={classes.metaGuide}
          x1={polar(C, rMin - 6, a).x}
          y1={polar(C, rMin - 6, a).y}
          x2={polar(C, rMax + 2, a).x}
          y2={polar(C, rMax + 2, a).y}
        />
      ))}
      {ringValues.map((v) => (
        <g key={`ring${v}`}>
          <path className={classes.metaRing} d={arcPath(radiusOf(v))} />
          <text
            className={classes.metaGuideLabel}
            x={polar(C, radiusOf(v), zero).x + 3}
            y={polar(C, radiusOf(v), zero).y - 1}
            textAnchor="start"
            dominantBaseline="auto"
          >
            {ringLabel(v)}
          </text>
        </g>
      ))}
      {spokes.map((s) => {
        const a = metaAngle(s.c);
        const p0 = polar(C, rMin - 6, a);
        const p1 = polar(C, rMax + 2, a);
        const t = polar(C, rMax + 10, a);
        return (
          <g key={`sp${s.c}`}>
            <line
              className={s.labeled ? classes.metaSpoke : classes.metaSpokeFine}
              x1={p0.x}
              y1={p0.y}
              x2={p1.x}
              y2={p1.y}
            />
            {s.labeled && (
              <text
                className={classes.metaGuideLabel}
                x={t.x}
                y={t.y}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {centsText(s.c)}
              </text>
            )}
          </g>
        );
      })}
      {mSet.cents && (
        <text
          className={classes.metaGuideLabel}
          x={polar(C, rMax + 10, zero).x}
          y={polar(C, rMax + 10, zero).y}
          textAnchor="middle"
          dominantBaseline="central"
        >
          0
        </text>
      )}
      <text
        className={classes.tag}
        x={seamL.x}
        y={seamL.y}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {closed ? `±${seamHalf} c` : `−${seamHalf} c`}
      </text>
      {!closed && (
        <text
          className={classes.tag}
          x={seamR.x}
          y={seamR.y}
          textAnchor="middle"
          dominantBaseline="central"
        >
          +{seamHalf} c
        </text>
      )}
      {!meta.note.m && (
        <line
          className={classes.metaCenterTick}
          x1={polar(C, rMin - 8, zero).x}
          y1={polar(C, rMin - 8, zero).y}
          x2={polar(C, rMin + 8, zero).x}
          y2={polar(C, rMin + 8, zero).y}
        />
      )}
      {mSet.connect === 'order' && dots.length > 1 && (
        <polyline className={classes.metaLine} points={metaLine} />
      )}
      {mSet.connect === 'prime' &&
        threads.map(([p, g]) => (
          <polyline
            key={`th${p}`}
            className={classes.metaLine}
            style={{ stroke: primeColor(p) }}
            points={pts(g)}
          />
        ))}
      {dots.map((d) => {
        const p = metaPos(d);
        const ratio = d.ratio;
        return (
          <g key={ratio.text} className={classes.metaDotG}>
            <circle
              className={d.isCenter ? classes.metaCenter : classes.metaDot}
              cx={p.x}
              cy={p.y}
              r={d.isCenter ? 5 : 2.6}
              style={d.isCenter ? undefined : dotFill(d)}
            />
            <circle
              className={classes.metaDotHit}
              cx={p.x}
              cy={p.y}
              r={6}
              data-testid="relative-meta-dot"
              data-ratio={ratio.text}
              role="button"
              tabIndex={-1}
              aria-label={`${ratio.text} near ${meta.text}`}
              onMouseEnter={(e) => onDotEnter(ratio, e.altKey)}
              onMouseLeave={onDotLeave}
              onFocus={() => onDotEnter(ratio)}
              onBlur={onDotLeave}
              onClick={(e) => {
                e.stopPropagation();
                onDotClick(ratio, e.altKey);
              }}
              onKeyDown={(e) => onDotKey(ratio, e)}
            />
          </g>
        );
      })}
    </g>
  );
});

export function RelativeModal({
  opened,
  from,
  fromIdx,
  rep,
  repC,
  step,
  mainPpu,
  hover,
  onHover,
  onPick,
  onRemove,
  onClose,
  line,
  bandMode,
  onBandMode,
  ringStart,
  onRingStart,
  mode,
  onMode,
  monzoView,
  onMonzoView,
  monzo,
  onMonzo,
  onMonzoReset,
  onAdd,
  message,
  onPreview,
  metaSets,
  onMetaSets,
}: RelativeModalProps) {
  const isMonzo = mode === 'monzo';
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // M8d meta ring: the center (a ratio or cents) it is open on, or null; the settings
  const [meta, setMeta] = useState<MetaCenter | null>(null);
  // which context opened it: the Near button (always 1/1) or a Ctrl+click / typed Near (that interval); each keeps its own settings
  const [metaCtx, setMetaCtx] = useState<MetaContext>('nearButton');
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const [localSets, setLocalSets] = useState<MetaSets>(META_SETS_DEFAULTS);
  const mSets = metaSets ?? localSets;
  const mSet = mSets[metaCtx];
  const setMSet = (patch: Partial<MetaSettings>) => {
    (onMetaSets ?? setLocalSets)({ ...mSets, [metaCtx]: { ...mSet, ...patch } });
  };
  const openMeta = (ctx: MetaContext, center: MetaCenter) => {
    setMetaCtx(ctx);
    setMeta(center);
  };
  const start = clampRingStart(ringStart);
  // the four places: rings start .. start + 3 of the endless sequence (made on demand)
  const places = useMemo(
    () => Array.from({ length: MENU_PLACES }, (_, i) => relativeRingAt(step, start + i)),
    [step, start]
  );
  const rings = places.map((g) => g.ratios);
  // direction: Alt NOT held = above, Alt held = below (tracked while the modal is open, reset when the window loses focus; a click reads its own altKey)
  const [alt, setAlt] = useState(false);
  const navRef = useRef({ start, step, set: onRingStart });
  navRef.current = { start, step, set: onRingStart };
  // Keys while the modal is open, in the CAPTURE phase so the page's own handlers (Alt+digit tabs, digit holds) never see them:
  // 2 / 3 move one ring, Shift+2 / 3 one prime ring, Ctrl+Shift+2 / 3 five prime rings. Alt only sets the direction: pressing or
  // releasing it alone must not open the browser menu, and Alt+digit must not switch tabs.
  useEffect(() => {
    if (!opened) {
      return undefined;
    }
    const onDown = (e: KeyboardEvent) => {
      setAlt(e.altKey);
      if (e.key === 'Alt') {
        e.preventDefault();
        return;
      }
      if (e.altKey && /^(Digit|Numpad)[1-9]$/.test(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // the meta ring: Esc closes it (not the whole modal); the ring-step keys do nothing while it is open
      if (metaRef.current && modeRef.current === 'rings') {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setMeta(null);
          return;
        }
        if (navMove(e) && !isTypingTarget(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      const mv = navMove(e);
      if (!mv || modeRef.current === 'monzo' || isTypingTarget(e.target)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const { start: s, step: st, set } = navRef.current;
      const next = mv.prime ? primeRingIndex(st, s, mv.dir, mv.prime) : clampRingStart(s + mv.dir);
      if (next !== s) {
        set(next);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      setAlt(e.altKey);
      if (e.key === 'Alt') {
        e.preventDefault();
      }
    };
    const onBlur = () => setAlt(false);
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [opened]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [vbHalf, setVbHalf] = useState(FALLBACK_VB_HALF);
  // half the inner ring's own drawing (its labels reach that far), read from the rendered svg's viewBox ONCE when the modal opens
  // (that drawing grows and shrinks with the ghost dot and hover, which used to re-run the layout and resize the modal)
  const measured = useRef(false);
  useLayoutEffect(() => {
    if (measured.current) {
      return;
    }
    const vb = Number(
      (wrapRef.current?.querySelector('svg')?.getAttribute('viewBox') ?? '').split(/\s+/)[2]
    );
    if (vb > 0) {
      measured.current = true;
      setVbHalf(vb / 2);
    }
  });
  // the window's size, read when the modal opens and on a resize only
  const [win, setWin] = useState(() => ({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    h: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  useEffect(() => {
    if (!opened) {
      return undefined;
    }
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [opened]);
  const availR = Math.max(120, Math.min(win.w - CHROME_W, win.h - CHROME_H) / 2);
  const lay = useMemo(() => layoutFor(mainPpu, vbHalf, availR), [mainPpu, vbHalf, availR]);
  const { bands, half, scale } = lay;
  const C = half;
  const size = 2 * half * scale;
  // the modal and its body have explicit pixel sizes from this layout alone (never from the content)
  const bodyW = Math.max(size, MIN_BODY_W);
  // the bands' turn (degrees clockwise): 'from' starts them at the source note's angle on the inner ring (which is NOT turned: 1/1 stays at noon), so a cell's tick points where that ratio lands on it
  const bandRotationDeg =
    bandMode === 'from' && repC > 0 ? ((((from.c / repC) * 360) % 360) + 360) % 360 : 0;
  const rot = bandRotationDeg;
  const fromText = noteText(from);
  const isUnison = Math.abs(from.c) < 1e-6;
  // Monzo mode keeps the SAME body size: the ring copy shrinks into the top, the strip area (27 rows) and the controls fill the rest
  const mGeo = useMemo(() => {
    const gaps = 2 * MONZO_GAP;
    const rowH = Math.max(
      MONZO_ROW_MIN,
      Math.min(
        MONZO_ROW_MAX,
        Math.floor((size - MONZO_CTL_H - gaps - MONZO_RING_MIN) / STRIP_AREA_ROWS)
      )
    );
    const ringArea = Math.max(MONZO_RING_MIN, size - MONZO_CTL_H - gaps - STRIP_AREA_ROWS * rowH);
    return { rowH, ringArea, ppu: Math.min(lay.ppu * scale, ringArea / (2 * vbHalf)) };
  }, [size, lay.ppu, scale, vbHalf]);
  // Monzo mode: the ghost follows the kept exponents (all 0 = on the source note itself)
  const mStep = useMemo(() => monzoStep(monzo, rep), [monzo, rep]);
  const mLanding = useMemo(() => monzoLanding(from, monzo, rep), [from, monzo, rep]);
  const mDir: Direction = mStep?.dir ?? 'above';
  const overlay = useMemo(
    () =>
      function GhostOverlay(a: RingOverlayArgs) {
        return (
          <RelativeGhost
            at={a.at}
            k={a.k}
            from={from}
            rep={rep}
            hover={hover}
            landing={isMonzo ? { note: mLanding, dir: mDir } : undefined}
          />
        );
      },
    [from, rep, hover, isMonzo, mLanding, mDir]
  );
  const [cell, setCell] = useState<RingRatio | null>(null);
  useEffect(() => {
    setCell(null);
  }, [mode]);
  // the readout pill in Monzo mode: the landing as for the rings, then the nonzero exponents
  const monzoLine = message
    ? message
    : `${
        mStep
          ? landingReadout(noteText(mStep.ratio), mStep.dir, from, mLanding)
          : `${noteText(from)} (all 0)`
      } · ${monzoSummary(monzo)}`;
  const onTyped = (text: string, d: Direction): string | null => {
    const r = parseTypedStep(text);
    if (!r.ok) {
      return r.message;
    }
    onAdd(noteText(landingPitch(from, r.ratio, d, rep)));
    return null;
  };
  const dir: Direction = alt ? 'below' : 'above';
  // M8c hover keys: the landing under the pointer (the ghost), reported up so holds 1 / 4 / 5 can sound it
  const [monzoOver, setMonzoOver] = useState(false);
  useEffect(() => {
    setMonzoOver(false);
  }, [mode, monzoView]);
  const pointLanding = useMemo(
    () =>
      isMonzo
        ? monzoOver
          ? mLanding
          : null
        : cell
          ? landingPitch(from, cell.note, dir, rep)
          : null,
    [isMonzo, monzoOver, mLanding, cell, from, dir, rep]
  );
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  useEffect(() => {
    onPreviewRef.current?.(pointLanding);
  }, [pointLanding]);
  useEffect(
    () => () => {
      onPreviewRef.current?.(null);
    },
    []
  );
  // the hovered cell and the direction together are the hover the ghost and the readout follow
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  useEffect(() => {
    onHoverRef.current(cell ? { ratio: cell, dir } : null);
  }, [cell, dir]);
  const cellProps = (ratio: RingRatio) => ({
    'data-testid': 'relative-half',
    'data-ratio': ratio.text,
    'data-dir': cell === ratio ? dir : undefined,
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': `${ratio.text} from the source note (hold Alt for below)`,
    onMouseEnter: (e: { altKey: boolean }) => {
      setAlt(e.altKey);
      setCell(ratio);
    },
    onMouseLeave: () => setCell(null),
    onFocus: () => setCell(ratio),
    onBlur: () => setCell(null),
    // Alt+click adds below; the click stops here so nothing behind it (the page's Alt+click pin) sees it
    onClick: (e: { altKey: boolean; ctrlKey: boolean; stopPropagation: () => void }) => {
      e.stopPropagation();
      setAlt(e.altKey);
      // Ctrl+click opens the meta ring on this ratio (adds nothing)
      if (e.ctrlKey) {
        openMeta('nearClick', { note: ratio.note, text: ratio.text });
        setCell(null);
        return;
      }
      onPick({ ratio, dir: e.altKey ? 'below' : 'above' });
    },
    onKeyDown: (e: { key: string; altKey: boolean; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPick({ ratio, dir: e.altKey ? 'below' : 'above' });
      }
    },
  });
  // The typed box's Near (or Ctrl+Enter): open the meta ring on what is typed (a ratio or cents); returns the message when refused
  const onNear = (text: string): string | null => {
    const r = parseTypedStep(text);
    if (!r.ok) {
      return r.message;
    }
    openMeta('nearClick', { note: r.ratio, text: r.label });
    onMode('rings');
    return null;
  };
  const metaOn = meta !== null && !isMonzo;
  const near = useMemo(
    () =>
      metaOn && meta
        ? nearRatios(meta.note, {
            spanC: mSet.spanC,
            oddCap: mSet.oddCap,
            order: mSet.measure,
            max: META_MAX_DOTS,
            mask: mSet.mask,
          })
        : null,
    [metaOn, meta, mSet.spanC, mSet.oddCap, mSet.measure, mSet.mask]
  );
  // one RingRatio per dot (stable between renders, so hover can compare by identity)
  const dots = useMemo(
    () =>
      (near?.items ?? []).map((it) => ({
        ratio: { note: it.note, text: it.text, odd: it.odd } as RingRatio,
        offsetC: it.offsetC,
        v: nearComplexity(it, mSet.measure),
        prime: largestPrime(it.text),
        isCenter: meta !== null && it.text === meta.text && Math.abs(it.offsetC) < 1e-6,
      })),
    [near, meta, mSet.measure]
  );
  const dotByRatio = useMemo(() => new Map(dots.map((d) => [d.ratio, d])), [dots]);
  const hoverDot = metaOn && cell ? (dotByRatio.get(cell) ?? null) : null;
  const hoverOffset = hoverDot ? hoverDot.offsetC : null;
  const readoutLine =
    metaOn && meta && hoverOffset !== null && line && !message
      ? `${line} · ${signedCents(hoverOffset, meta.note.m ? 1 : 2)} from ${meta.text}`
      : line;
  const rMin = bands[0][0] + 4;
  // the dots' outer radius leaves room outside it for the cents labels
  const rMax = bands[bands.length - 1][1] - 16;
  const { lo, hi } = useMemo(() => metaRange(dots), [dots]);
  // offset 0 at noon, or at the true angle of the pitch the center interval adds (Alt = below mirrors the window)
  const atLanding = mSet.zero === 'landing' && meta !== null;
  const zero = atLanding ? trueAngle(landingPitch(from, meta.note, dir, rep).c, repC) : 0;
  const sign: 1 | -1 = atLanding && dir === 'below' ? -1 : 1;
  // stable callbacks for the memoized meta layer (the latest pick handler is read through a ref)
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onDotEnter = useCallback((ratio: RingRatio, altKey?: boolean) => {
    if (altKey !== undefined) {
      setAlt(altKey);
    }
    setCell(ratio);
  }, []);
  const onDotLeave = useCallback(() => setCell(null), []);
  const onDotClick = useCallback((ratio: RingRatio, altKey: boolean) => {
    setAlt(altKey);
    onPickRef.current({ ratio, dir: altKey ? 'below' : 'above' });
  }, []);
  const onDotKey = useCallback(
    (ratio: RingRatio, e: { key: string; altKey: boolean; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPickRef.current({ ratio, dir: e.altKey ? 'below' : 'above' });
      }
    },
    []
  );
  const onSurfaceClick = useCallback((ctrlKey: boolean) => {
    if (ctrlKey) {
      setMeta(null);
    }
  }, []);
  const showLegend = mSet.connect === 'prime' || mSet.colorByPrime;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      // Mantine's own Esc listener is a window capture listener registered before ours, so stopping the event cannot reach it:
      // while the meta ring is open, Esc belongs to the meta ring (back to the rings) and the Modal must not close on it
      closeOnEscape={!metaOn}
      fullScreen={FULLSCREEN}
      centered
      size={bodyW + MODAL_PAD_W}
      padding="xs"
      title={`From ${fromText}`}
      transitionProps={{ duration: 0 }}
    >
      <div
        className={classes.modalBody}
        data-relative-menu=""
        data-testid="relative-menu"
        style={{ width: size, height: size }}
      >
        <div
          ref={wrapRef}
          className={classes.ringWrap}
          data-testid="relative-ring"
          style={isMonzo ? { top: mGeo.ringArea / 2 } : undefined}
        >
          <PitchRing
            view="chromatic"
            steps={12}
            radius={RING_R}
            pxPerUnit={isMonzo ? mGeo.ppu : lay.ppu * scale}
            hover={fromIdx}
            chord={EMPTY_SET}
            sounding={EMPTY_SET}
            ghosts={[]}
            dotProps={noDotProps}
            overlay={overlay}
            ariaLabel={`Copy of the pitch circle, ${fromText} at the top`}
          />
        </div>
        {isMonzo && (
          <MonzoPanel
            view={monzoView}
            onView={onMonzoView}
            monzo={monzo}
            onMonzo={onMonzo}
            onReset={onMonzoReset}
            onAddMonzo={() => onAdd(noteText(mLanding))}
            onTyped={onTyped}
            onNear={onNear}
            width={size}
            rowH={mGeo.rowH}
            onOver={setMonzoOver}
          />
        )}
        <svg
          className={classes.svg}
          style={isMonzo ? { display: 'none' } : undefined}
          width={size}
          height={size}
          viewBox={`0 0 ${2 * half} ${2 * half}`}
          role="group"
          aria-label={`Relative pitches menu for ${fromText}`}
          data-band-rotation={rot}
          data-meta={metaOn ? 'true' : undefined}
          // a settings box left focused would swallow the hold keys (typing): pointing at the picture takes the focus back
          // (the box commits on blur, as when clicking away)
          onPointerEnter={() => {
            const el = document.activeElement;
            if (el instanceof HTMLElement && isTypingTarget(el)) {
              el.blur();
            }
          }}
        >
          {bands.map(([ri, ro], b) => (
            <path key={b} className={classes.band} d={annulus(C, ri, ro)} fillRule="evenodd" />
          ))}
          {/* a radial divider at each boundary between neighboring cells, so every ratio reads as its own cell */}
          {rings.map((band, b) =>
            band.map((ratio, i) => {
              const [ri, ro] = bands[b];
              const a = polar(C, ri, (i / band.length) * 360 + rot);
              const e = polar(C, ro, (i / band.length) * 360 + rot);
              return (
                <line
                  key={`e${b}-${ratio.text}`}
                  className={classes.cellEdge}
                  x1={a.x}
                  y1={a.y}
                  x2={e.x}
                  y2={e.y}
                />
              );
            })
          )}
          {/* each ring's tag sits ON its start boundary (where the pitch begins rising clockwise), with a heavier edge there */}
          {places.map((g, b) => {
            const [ri, ro] = bands[b];
            const a = polar(C, ri, rot);
            const e = polar(C, ro, rot);
            const t = polar(C, (ri + ro) / 2, rot);
            return (
              <g key={`s${b}-${g.key}`} data-testid="relative-ring-tag" data-ring={g.label}>
                <line className={classes.startEdge} x1={a.x} y1={a.y} x2={e.x} y2={e.y} />
                <text
                  className={classes.tag}
                  x={t.x}
                  y={t.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {g.label}
                </text>
              </g>
            );
          })}
          {rings.map((band, b) =>
            band.map((ratio, i) => {
              const [ri, ro] = bands[b];
              const mid = (ri + ro) / 2;
              const ang = spreadAngle(i, band.length) + rot;
              const p = polar(C, mid, ang);
              const t0 = polar(C, ri + 1, trueAngle(ratio.note.c, repC) + rot);
              const t1 = polar(C, ri + 5, trueAngle(ratio.note.c, repC) + rot);
              // horizontal text needs room along the arc: crowded bands write along the radius instead
              const radial = (2 * Math.PI * mid * scale) / band.length < RADIAL_BELOW_ARC_PX;
              const flip = ((ang % 360) + 360) % 360 > 180;
              // the cell's whole annular sector is ONE button (the direction comes from Alt)
              const sector = sectorPath(
                C,
                ri,
                ro,
                (i / band.length) * 360 + rot,
                ((i + 1) / band.length) * 360 + rot
              );
              return (
                <g key={`${b}-${ratio.text}`} className={classes.btn} data-band={b + 1}>
                  <title>{ratio.text}</title>
                  <line className={classes.tick} x1={t0.x} y1={t0.y} x2={t1.x} y2={t1.y} />
                  <text
                    className={radial ? classes.labelSmall : classes.label}
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`translate(${p.x} ${p.y})${radial ? ` rotate(${flip ? ang + 90 : ang - 90})` : ''}`}
                  >
                    {ratio.text}
                  </text>
                  <path
                    className={classes.half}
                    d={sector}
                    data-selected={hover?.ratio === ratio ? 'true' : undefined}
                    {...cellProps(ratio)}
                  />
                </g>
              );
            })
          )}
          {metaOn && meta && (
            <MetaLayer
              C={C}
              bands={bands}
              rMin={rMin}
              rMax={rMax}
              lo={lo}
              hi={hi}
              zero={zero}
              sign={sign}
              mSet={mSet}
              meta={meta}
              dots={dots}
              onDotEnter={onDotEnter}
              onDotLeave={onDotLeave}
              onDotClick={onDotClick}
              onDotKey={onDotKey}
              onSurfaceClick={onSurfaceClick}
            />
          )}
          {/* the hovered dot's highlight: one circle above the memoized layer (the layer itself never re-renders on hover) */}
          {metaOn &&
            meta &&
            hoverDot &&
            (() => {
              const p = metaDotPos(
                {
                  measure: mSet.measure,
                  scale: mSet.scale,
                  C,
                  rMin,
                  rMax,
                  lo,
                  hi,
                  zero,
                  sign,
                  arc: mSet.arc,
                  spanC: mSet.spanC,
                },
                hoverDot
              );
              return (
                <circle
                  className={classes.metaHighlight}
                  data-testid="relative-meta-highlight"
                  data-dir={dir}
                  cx={p.x}
                  cy={p.y}
                  r={6}
                />
              );
            })()}
        </svg>
        {metaOn && meta && (
          <div className={classes.metaPanel} data-testid="relative-meta-panel">
            <Button
              size="compact-xs"
              variant="default"
              data-testid="relative-meta-back"
              onClick={() => setMeta(null)}
            >
              Back to rings
            </Button>
            <div className={classes.metaTitle}>Near {meta.text}</div>
            <SegmentedControl
              size="xs"
              aria-label="Complexity measure"
              value={mSet.measure}
              onChange={(v) => setMSet({ measure: v === 'tenney' ? 'tenney' : 'odd' })}
              data={[
                { value: 'odd', label: 'Odd limit' },
                { value: 'tenney', label: 'Tenney' },
              ]}
            />
            <SegmentedControl
              size="xs"
              aria-label="Radius scale"
              title="Scale: Linear (radius by the complexity), Log (by its log), Even (by the count-like size, square root of n x d for Tenney, so the dots spread evenly)"
              value={mSet.scale}
              onChange={(v) =>
                setMSet({ scale: v === 'linear' ? 'linear' : v === 'log' ? 'log' : 'even' })
              }
              data={[
                { value: 'linear', label: 'Linear' },
                { value: 'log', label: 'Log' },
                { value: 'even', label: 'Even' },
              ]}
            />
            <SegmentedControl
              size="xs"
              aria-label="Where 0 c sits"
              title="Noon, or the true angle of the pitch it adds (with Span 1200 and Arc 360 every dot sits at its true pitch)"
              value={mSet.zero}
              onChange={(v) => setMSet({ zero: v === 'landing' ? 'landing' : 'noon' })}
              data={[
                { value: 'noon', label: '0 at noon' },
                { value: 'landing', label: '0 at pitch' },
              ]}
            />
            <MetaNum
              label="Span (c)"
              value={mSet.spanC}
              min={META_RANGES.spanC[0]}
              max={META_RANGES.spanC[1]}
              onCommit={(n) => setMSet({ spanC: n })}
            />
            <MetaNum
              label="Ceiling (odd)"
              value={mSet.oddCap}
              min={META_RANGES.oddCap[0]}
              max={META_RANGES.oddCap[1]}
              onCommit={(n) => setMSet({ oddCap: n })}
            />
            <div className={classes.metaPrimes} data-active={mSet.mask.some((on) => !on)}>
              <PrimeFilterChips
                mask={mSet.mask}
                onToggle={(slot) =>
                  setMSet({ mask: mSet.mask.map((on, i) => (i === slot ? !on : on)) })
                }
                onAll={(on) => setMSet({ mask: mSet.mask.map(() => on) })}
              />
            </div>
            <MetaNum
              label="Arc (deg)"
              value={mSet.arc}
              min={META_RANGES.arc[0]}
              max={META_RANGES.arc[1]}
              onCommit={(n) => setMSet({ arc: n })}
            />
            <SegmentedControl
              size="xs"
              aria-label="Connect the dots"
              title="Connect: Off, Order (one zigzag by complexity), By prime (one thread per largest prime)"
              value={mSet.connect}
              onChange={(v) =>
                setMSet({ connect: v === 'off' ? 'off' : v === 'prime' ? 'prime' : 'order' })
              }
              data={[
                { value: 'off', label: 'Off' },
                { value: 'order', label: 'Order' },
                { value: 'prime', label: 'By prime' },
              ]}
            />
            <label className={classes.metaCheck} title="Dot fill by the ratio's largest prime">
              <input
                type="checkbox"
                checked={mSet.colorByPrime}
                onChange={(e) => setMSet({ colorByPrime: e.currentTarget.checked })}
              />
              Color by prime
            </label>
            <label className={classes.metaCheck} title="Faint circles at round complexity values">
              <input
                type="checkbox"
                checked={mSet.rings}
                onChange={(e) => setMSet({ rings: e.currentTarget.checked })}
              />
              Complexity rings
            </label>
            <label className={classes.metaCheck} title="Spokes at round cent offsets">
              <input
                type="checkbox"
                checked={mSet.cents}
                onChange={(e) => setMSet({ cents: e.currentTarget.checked })}
              />
              Cents lines
            </label>
            {showLegend && (
              <div className={classes.metaLegend} data-testid="relative-meta-legend">
                {FIRST_DOZEN_PRIMES.map((p) => (
                  <span key={p}>
                    <span className={classes.metaSwatch} style={{ background: primeColor(p) }} />
                    {p}
                  </span>
                ))}
                <span className={classes.metaLegendNote}>
                  43+ repeat the hues, fainter per dozen
                </span>
              </div>
            )}
            <div className={classes.metaNote}>
              {near && near.total > near.items.length
                ? `Showing ${near.items.length} of ${near.total}`
                : `${near?.total ?? 0} ratios`}
            </div>
          </div>
        )}
      </div>
      {/* the footer is three rows of a fixed height and width (nothing wraps, nothing unmounts), so it never resizes the modal */}
      <div className={classes.footer} style={{ width: bodyW }}>
        <div className={classes.footRow}>
          <SegmentedControl
            size="xs"
            aria-label="Bands start at"
            value={bandMode}
            disabled={isMonzo}
            onChange={(v) => onBandMode(v === 'fixed' ? 'fixed' : 'from')}
            data={[
              { value: 'from', label: 'Bands: From note' },
              { value: 'fixed', label: 'Fixed' },
            ]}
          />
          <SegmentedControl
            size="xs"
            aria-label="Picker style"
            value={metaOn ? 'near' : mode}
            onChange={(v) => {
              if (v === 'near') {
                // the meta ring on 1/1 (everything near the clicked note itself), with the Near button's settings
                const unison = parseTypedStep('1/1');
                onMode('rings');
                if (unison.ok) {
                  openMeta('nearButton', { note: unison.ratio, text: unison.label });
                }
                return;
              }
              setMeta(null);
              onMode(v === 'monzo' ? 'monzo' : 'rings');
            }}
            data={[
              { value: 'rings', label: 'Rings' },
              { value: 'near', label: 'Near' },
              { value: 'monzo', label: 'Monzo' },
            ]}
          />
          <div className={classes.dirHint} data-testid="relative-dir" data-dir={dir}>
            {isMonzo ? 'Negative = below' : alt ? 'Below' : 'Above · hold Alt'}
          </div>
          {/* 1/1 always stays (the reference), so its modal has no Remove button; the slot keeps its space */}
          <div className={classes.removeSlot}>
            {!isUnison && (
              <Button
                size="compact-xs"
                variant="default"
                color="red"
                data-testid="relative-remove"
                onClick={onRemove}
              >
                Remove this note
              </Button>
            )}
          </div>
        </div>
        <div className={classes.footLine} data-testid="relative-rings">
          {isMonzo
            ? 'Move to paint · Ctrl line · Alt no paint · click to add · hold 1 / 4 / 5 to hear'
            : metaOn
              ? 'Esc: back to rings · click a dot to add (Alt: below) · hold 1/4/5 to hear'
              : `Rings ${places.map((g) => g.label).join(' · ')} · 2/3 ring, Shift prime, Ctrl+Shift 5 · Ctrl+click: near ratios · hold 1/4/5 to hear`}
        </div>
        <div className={classes.line} data-testid="relative-line" aria-live="polite">
          {isMonzo ? monzoLine : readoutLine}
        </div>
      </div>
    </Modal>
  );
}

export interface RelativeGhostProps {
  /** The point at pitch `c` on the ring (the overlay's `at`) and the marks scale. */
  at: (c: number) => { x: number; y: number };
  k: number;
  from: Note;
  rep: Note;
  hover: RelativeHover | null;
  /** Monzo mode: the landing note and tone to draw instead of the hovered half's. */
  landing?: { note: Note; dir: Direction };
}

/** The ghost dot on the inner ring at the landing pitch of the hovered half (orange above, teal below). */
export function RelativeGhost({ at, k, from, rep, hover, landing }: RelativeGhostProps) {
  const ghost =
    landing ??
    (hover ? { note: landingPitch(from, hover.ratio.note, hover.dir, rep), dir: hover.dir } : null);
  const p = ghost ? at(ghost.note.c) : null;
  if (!p || !ghost) {
    return null;
  }
  return (
    <RingDot
      kind="ghost"
      tone={ghost.dir}
      scale={k}
      cx={p.x}
      cy={p.y}
      data-testid="relative-ghost"
      pointerEvents="none"
    />
  );
}
