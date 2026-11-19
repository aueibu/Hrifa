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
  fmtRatio,
  heCurveAt,
  heRange,
  isZeroMonzo,
  landingPitch,
  landingReadout,
  monzoLanding,
  monzoNote,
  mulNotes,
  oddLimit,
  parseInterval,
  ratioNote,
  reduceInto,
  monzoStep,
  nearRatios,
  noteText,
  sternBrocotBranches,
  parseTypedStep,
  primeRingIndex,
  relativeRingAt,
  type Direction,
  type MonzoExps,
  type Note,
  type RingRatio,
} from '../../../lib/harmonic-field';
import { keyId } from '../audio/keymap';
import { ARMED_DIGITS, type PreviewTarget } from '../audio/plan';
import { SHORTCUTS } from '../audio/shortcuts';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { useHeCurve } from '../state/entropy';
import {
  FIRST_DOZEN_PRIMES,
  channelBounds,
  foldOctave,
  monzoCellNotes,
  monzoCellTints,
  monzoPaintedNote,
  largestPrimeOf,
  legendMarksOf,
  measuredCents,
  measuredNote,
  metricValue,
  primeColor,
  tintOf,
  usesRange,
  type EntropySource,
  type IntervalTint,
  type RelRadius,
  type TintContext,
} from '../state/intervalColor';
import {
  RADIUS_DIP_SHARE,
  effectiveRadius,
  radiusFloor,
  radiusOrder,
  radiusRingLabel,
  radiusRingValues,
  radiusScaleValue,
  radiusValue,
} from '../state/nearRadius';
import { MAX_PINS, addPin, braKet, type PinKind } from '../state/pins';
import {
  MONZO_CTL_H,
  MonzoPanel,
  STRIP_AREA_ROWS,
  monzoSummary,
  type MonzoView,
} from './MonzoPanel';
import { PinBar } from './PinBar';
import { PrimeFilterChips } from './PrimeFilterChips';
import { RelativeColorLegend } from './RelativeColorLegend';
import { RelativeColorControls, RelativeColorPanel } from './RelativeColorMenu';
import { RING_PX_PER_UNIT, RING_R, RingDot } from './ringMarks';
import { PitchRing, type RingDotExtra, type RingOverlayArgs } from './RingStats';
import { Hint, Tip, noteHandlers, useLab } from './ui';
import { previewMonzo, shownMonzoOf, useLocalMonzo } from './useLocalMonzo';
import { useTiles } from './useTiles';
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
  /** The whole window in cents (+-half around the center). */
  spanC: number;
  oddCap: number;
  /** The angle (degrees) the window spreads over, centered on noon; the rest (the seam) is centered at 6 o'clock. */
  arc: number;
  /** How the dots are joined: not at all, in complexity order (one zigzag), or one thread per largest prime. */
  connect: MetaConnect;
  /** Faint circles at round complexity values. */
  rings: boolean;
  /** Radial spokes at round cent offsets. */
  cents: boolean;
  /** M9: the harmonic entropy curve as a thin line in a band outside the ring, at each cent offset's angle (runtime only, like the others). */
  entropy: boolean;
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
export type MetaConnect = 'off' | 'order' | 'prime' | 'parents';
export type MetaZero = 'noon' | 'landing';
export type MetaScale = 'linear' | 'log' | 'even';
export const META_DEFAULTS: MetaSettings = {
  spanC: 1200,
  oddCap: 123,
  arc: 360,
  connect: 'off',
  rings: true,
  cents: true,
  entropy: false,
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
/** The least gap (px) between two complexity rings. */
const RING_GAP = 12;
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
  /** Shift+click (Shift+Enter) on a field dot of the inner ring: that field note becomes the source. */
  onSource: (index: number) => void;
  /** Open straight on Near (the meta ring on 1/1, the Near button's settings): the main ring header's Near button. Read on mount only. */
  startNear?: boolean;
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
  /**
   * M8p: the kept exponents (lab state) the picker opens with. The painted monzo then lives in the picker (`useLocalMonzo`) and is
   * handed back once, with `onMonzoCommit`, when the picker closes.
   */
  monzo: MonzoExps;
  onMonzoCommit: (monzo: MonzoExps) => void;
  /** The painted monzo changed (the page clears its stale message). */
  onMonzoTouch: () => void;
  /** Add a note by its text (the page dispatches `relative/add`). */
  onAdd: (text: string) => void;
  /** The state's quiet line (a refused or duplicate add), shown in the readout pill. */
  message: string | null;
  /** M8d: the meta ring's two settings sets, kept by the page (runtime only). Without them the modal keeps its own. */
  metaSets?: MetaSets;
  onMetaSets?: (s: MetaSets) => void;
}

export type BandMode = 'from' | 'fixed';
export type RelativeMode = 'rings' | 'monzo';

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

/** The radius transform, one function for the dots, the highlight and the complexity rings (see `radiusScaleValue`). */
export const metaScaleValue = radiusScaleValue;

/** The radius of a complexity value between the transformed lo and hi. */
export function metaRadius(
  g: {
    rMin: number;
    rMax: number;
    lo: number;
    hi: number;
    measure: RelRadius;
    scale: MetaScale;
    floor?: number;
  },
  v: number
): number {
  if (g.floor !== undefined && g.floor > g.lo && g.floor < g.hi) {
    // F10: the Entropy dip (values below the Fixed bounds) takes the inner RADIUS_DIP_SHARE; the main scale starts at the floor
    const f = (x: number) => metaScaleValue(g.measure, g.scale, x);
    const rFloor = g.rMin + (g.rMax - g.rMin) * RADIUS_DIP_SHARE;
    return v < g.floor
      ? g.rMin + ((rFloor - g.rMin) * (f(v) - f(g.lo))) / (f(g.floor) - f(g.lo) || 1)
      : rFloor + ((g.rMax - rFloor) * (f(v) - f(g.floor))) / (f(g.hi) - f(g.floor) || 1);
  }
  const f0 = metaScaleValue(g.measure, g.scale, g.lo);
  const f1 = metaScaleValue(g.measure, g.scale, g.hi);
  return (
    g.rMin + ((g.rMax - g.rMin) * (metaScaleValue(g.measure, g.scale, v) - f0)) / (f1 - f0 || 1)
  );
}

export interface MetaGeometry {
  /** The radius metric (the Near Radius channel; the name is kept from the old measure toggle). */
  measure: RelRadius;
  /** The entropy curve's exact values (Radius Entropy only). */
  he?: EntropySource | null;
  /** M9d: Landing measure: a step's landing from 1/1 (null or absent: the radius measures the step itself). */
  measureOf?: ((n: Note) => Note) | null;
  scale: MetaScale;
  C: number;
  rMin: number;
  rMax: number;
  lo: number;
  hi: number;
  /** Entropy radius: where the main scale starts (the dip below it takes the inner share, see `radiusFloor`). */
  floor?: number;
  zero: number;
  sign: 1 | -1;
  arc: number;
  spanC: number;
}

/** Where a dot sits: shared by the memoized layer and the hover highlight so they always agree. */
export function metaDotPos(g: MetaGeometry, d: { v: number; offsetC: number }) {
  const r = Math.max(0, metaRadius(g, d.v));
  return polar(g.C, r, g.zero + (g.sign * d.offsetC * g.arc) / g.spanC);
}

/** A ratio folded into [1, 2) in lowest terms. */
function foldFrac(n: number, d: number): [number, number] {
  let a = n;
  let b = d;
  while (a >= 2 * b) {
    b *= 2;
  }
  while (a < b) {
    a *= 2;
  }
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  const k = gcd(a, b);
  return [a / k, b / k];
}
const oddPart = (v: number): number => {
  let m = v;
  while (m % 2 === 0) {
    m /= 2;
  }
  return m;
};
const wrap1200 = (x: number): number => ((x % 1200) + 1200) % 1200;

export interface MetaParentLinks {
  segments: { key: string; x1: number; y1: number; x2: number; y2: number; dashed: boolean }[];
  ghosts: { key: string; x: number; y: number }[];
}

/**
 * Connect: Parents. Every Stern-Brocot edge on the ancestry of the dot `hoverText` (p/q), each end placed exactly as a dot of that
 * ratio is (folded into one octave, offset from the center `centerC`, `metaDotPos`). An end is inside the window when its offset is
 * within the span (so within the arc) and its radius within `rMax`. An edge with one end outside is cut where it leaves the arc or
 * the outer ring; one with both ends outside is dropped. An inside end that is no drawn dot (prime off, over the ceiling, past the
 * cap, or 1/1 when it is not the center) gets a ghost, and every edge to it is dashed.
 */
export function metaParentLinks(
  g: MetaGeometry,
  centerC: number,
  dots: readonly MetaDot[],
  hoverText: string
): MetaParentLinks {
  const [pn, pd] = hoverText.split('/').map(Number);
  const edges = sternBrocotBranches(pn, pd);
  const dotTexts = new Set(dots.map((d) => d.ratio.text));
  const t = wrap1200(centerC);
  const half = g.spanC / 2;
  interface PNode {
    x: number;
    y: number;
    inside: boolean;
    isDot: boolean;
    key: string;
  }
  const nodes = new Map<string, PNode>();
  const nodeOf = (n: number, d: number): PNode => {
    const [fn, fd] = foldFrac(n, d);
    const key = `${fn}/${fd}`;
    let node = nodes.get(key);
    if (!node) {
      const offsetC = wrap1200(1200 * Math.log2(n / d) - t + 600) - 600;
      const step = ratioNote(fn, fd);
      const v = g.measureOf
        ? (metricValue(g.measure, g.measureOf(step), g.he) ?? 0)
        : radiusValue(
            g.measure,
            {
              note: step,
              odd: Math.max(oddPart(fn), oddPart(fd)),
              tenney: Math.log2(fn * fd),
            },
            g.he
          );
      const p = metaDotPos(g, { v, offsetC });
      const r = Math.hypot(p.x - g.C, p.y - g.C);
      node = {
        x: p.x,
        y: p.y,
        key,
        inside: Math.abs(offsetC) <= half + 1e-9 && r <= g.rMax + 0.5,
        isDot: dotTexts.has(key),
      };
      nodes.set(key, node);
    }
    return node;
  };
  const insideAt = (x: number, y: number): boolean => {
    const dx = x - g.C;
    const dy = y - g.C;
    if (Math.hypot(dx, dy) > g.rMax + 0.5) {
      return false;
    }
    if (g.arc >= 360) {
      return true;
    }
    const ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const delta = ((((ang - g.zero + 180) % 360) + 360) % 360) - 180;
    return Math.abs(delta) <= g.arc / 2 + 1e-6;
  };
  const segments: MetaParentLinks['segments'] = [];
  const used = new Set<string>();
  const seen = new Set<string>();
  for (const e of edges) {
    const a = nodeOf(e.from.n, e.from.d);
    const b = nodeOf(e.to.n, e.to.d);
    const pair = a.key < b.key ? `${a.key}-${b.key}` : `${b.key}-${a.key}`;
    if (a.key === b.key || seen.has(pair) || (!a.inside && !b.inside)) {
      continue;
    }
    seen.add(pair);
    if (a.inside && b.inside) {
      const dashed = !a.isDot || !b.isDot;
      segments.push({ key: pair, x1: a.x, y1: a.y, x2: b.x, y2: b.y, dashed });
      used.add(a.key);
      used.add(b.key);
      continue;
    }
    // one end inside: from it toward the other, stopping at the window's edge
    const [i, o] = a.inside ? [a, b] : [b, a];
    const STEPS = 48;
    let lastIn = 0;
    let firstOut = -1;
    for (let k = 1; k <= STEPS; k++) {
      const u = k / STEPS;
      if (insideAt(i.x + (o.x - i.x) * u, i.y + (o.y - i.y) * u)) {
        lastIn = u;
      } else {
        firstOut = u;
        break;
      }
    }
    if (firstOut >= 0) {
      let u0 = lastIn;
      let u1 = firstOut;
      for (let k = 0; k < 16; k++) {
        const mid = (u0 + u1) / 2;
        if (insideAt(i.x + (o.x - i.x) * mid, i.y + (o.y - i.y) * mid)) {
          u0 = mid;
        } else {
          u1 = mid;
        }
      }
      lastIn = u0;
    }
    segments.push({
      key: pair,
      x1: i.x,
      y1: i.y,
      x2: i.x + (o.x - i.x) * lastIn,
      y2: i.y + (o.y - i.y) * lastIn,
      dashed: !i.isDot,
    });
    used.add(i.key);
  }
  const ghosts = [...used]
    .map((k) => nodes.get(k))
    .filter((n): n is PNode => !!n && !n.isDot)
    .map((n) => ({ key: n.key, x: n.x, y: n.y }));
  return { segments, ghosts };
}

export interface MetaLayerProps {
  C: number;
  bands: readonly (readonly [number, number])[];
  rMin: number;
  rMax: number;
  lo: number;
  hi: number;
  /** Entropy radius: where the main scale starts (see `radiusFloor`). */
  floor?: number;
  zero: number;
  sign: 1 | -1;
  mSet: MetaSettings;
  /** The radius metric drawn (Near's Radius channel) and, for Entropy, its curve's exact values. */
  radius: RelRadius;
  he: EntropySource | null;
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
  /** Connect: Parents only: the ratio text of the hovered dot (null: none, and always null in the other connect modes). */
  hoverText: string | null;
  /** M8o: each dot's tint from the picker's Color menu (null: Color Off, the dots keep the plain look). */
  dotTints: ReadonlyMap<RingRatio, IntervalTint> | null;
  /** M9: the harmonic entropy curve to draw around the ring (null: not drawn). */
  heCurve: Float64Array | null;
  /** M9d: what the dots' measures read (null: the plain step above). */
  measureOf: ((n: Note) => Note) | null;
  /** The entropy curve is drawn at the cents the dots measure (`measuredCents`): Landing, Alt below (Colors follow Alt), source cents. */
  curveLanding: boolean;
  curveBelow: boolean;
  fromC: number;
}

/** The entropy curve's band outside the ring (SVG units): its gap from the outermost dot radius and its height (inside the bands' 16 px margin). */
export const HE_BAND_GAP = 3;
export const HE_BAND_H = 11;
/** Points of the entropy polyline across the span. */
const HE_POINTS = 240;

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
  floor,
  zero,
  sign,
  mSet,
  radius,
  he,
  meta,
  dots,
  onDotEnter,
  onDotLeave,
  onDotClick,
  onDotKey,
  onSurfaceClick,
  hoverText,
  dotTints,
  heCurve,
  measureOf,
  curveLanding,
  curveBelow,
  fromC,
}: MetaLayerProps) {
  const arc = mSet.arc;
  const geo: MetaGeometry = {
    measure: radius,
    he,
    measureOf,
    scale: mSet.scale,
    C,
    rMin,
    rMax,
    lo,
    hi,
    floor,
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
    [dots, C, rMin, rMax, lo, hi, floor, zero, sign, arc, mSet.spanC, radius, mSet.scale]
  );
  // M9: the entropy curve as a radial polyline: the pitch at offset o is the center interval plus o, drawn at the dots' own angle for
  // o; low entropy (consonant) sits nearest the ring; with a smaller Span only that arc is drawn
  const hePoints = useMemo(() => {
    if (!heCurve) {
      return null;
    }
    const { min, max } = heRange(heCurve);
    const out: string[] = [];
    for (let i = 0; i <= HE_POINTS; i++) {
      const o = -mSet.spanC / 2 + (mSet.spanC * i) / HE_POINTS;
      const t =
        max > min
          ? (heCurveAt(heCurve, measuredCents(meta.note.c + o, fromC, curveLanding, curveBelow)) -
              min) /
            (max - min)
          : 0;
      const p = polar(C, rMax + HE_BAND_GAP + HE_BAND_H * t, metaAngle(o));
      out.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    return out.join(' ');
  }, [heCurve, C, rMax, zero, sign, arc, mSet.spanC, meta.note.c, curveLanding, curveBelow, fromC]);
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
  // Connect: Parents: the hovered dot's whole Stern-Brocot ancestry (nothing is drawn without a hover)
  const parentLinks = useMemo(
    () =>
      mSet.connect === 'parents' && hoverText
        ? metaParentLinks(geo, meta.note.c, dots, hoverText)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geo is rebuilt each render; its fields are listed
    [
      mSet.connect,
      hoverText,
      dots,
      C,
      rMin,
      rMax,
      lo,
      hi,
      floor,
      zero,
      sign,
      arc,
      mSet.spanC,
      radius,
      he,
      mSet.scale,
      meta.note.c,
      measureOf,
    ]
  );
  const seamHalf = Number((mSet.spanC / 2).toFixed(2));
  const closed = arc >= 330;
  const seamGap = closed ? 0 : 14;
  const seamEdge = (s: -1 | 1) => metaAngle((s * mSet.spanC) / 2) + s * sign * seamGap;
  const seamL = polar(C, (rMin + rMax) / 2, closed ? zero + 180 : seamEdge(-1));
  const seamR = polar(C, (rMin + rMax) / 2, seamEdge(1));
  // guides: complexity rings (round values inside the drawn range) and cents spokes
  const ringValues: number[] = [];
  if (mSet.rings && dots.length) {
    // the rings label the main scale only: the dip below `floor` is drawn without rings, inward of the innermost labeled one
    const candidates = radiusRingValues(radius, floor ?? lo, hi);
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
  const ringLabel = (v: number) => radiusRingLabel(radius, v);
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
  const dotFill = (d: { ratio: RingRatio }) => {
    const t = dotTints?.get(d.ratio);
    return t ? { fill: t.mark } : undefined;
  };
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
      {hePoints && (
        <polyline
          className={classes.metaHe}
          data-testid="relative-meta-entropy"
          points={hePoints}
          vectorEffect="non-scaling-stroke"
        />
      )}
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
      {parentLinks && (
        <g data-testid="relative-meta-parents">
          {parentLinks.segments.map((sg) => (
            <line
              key={sg.key}
              className={
                sg.dashed ? `${classes.metaParent} ${classes.metaParentDashed}` : classes.metaParent
              }
              x1={sg.x1}
              y1={sg.y1}
              x2={sg.x2}
              y2={sg.y2}
            />
          ))}
          {parentLinks.ghosts.map((gh) => (
            <circle key={gh.key} className={classes.metaGhost} cx={gh.x} cy={gh.y} r={2.6} />
          ))}
        </g>
      )}
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

/** The band cells' event handlers, kept stable across hovers (they read the latest state through a ref). */
interface CellHandlers {
  enter: (ratio: RingRatio, altKey: boolean) => void;
  leave: () => void;
  focus: (ratio: RingRatio) => void;
  click: (
    ratio: RingRatio,
    e: { altKey: boolean; ctrlKey: boolean; stopPropagation: () => void }
  ) => void;
  key: (ratio: RingRatio, e: { key: string; altKey: boolean; preventDefault: () => void }) => void;
}

/**
 * Every ratio cell of the bands (tick, label, click target). Memoized: a hover changes none of these props, so the several hundred
 * cells are not rebuilt on every pointer move (the hovered cell's tint is one separate path drawn by the modal on top).
 */
const BandCells = memo(function BandCells({
  rings,
  bands,
  C,
  rot,
  scale,
  repC,
  on,
  tints,
}: {
  rings: RingRatio[][];
  bands: [number, number][];
  C: number;
  rot: number;
  scale: number;
  repC: number;
  on: CellHandlers;
  tints: ReadonlyMap<RingRatio, IntervalTint> | null;
}) {
  return (
    <>
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
          const tint = tints?.get(ratio);
          const tintText = tint ? { fill: tint.text } : undefined;
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
                style={tintText}
              >
                {ratio.text}
              </text>
              <path
                className={classes.half}
                d={sector}
                data-testid="relative-half"
                data-ratio={ratio.text}
                role="button"
                tabIndex={0}
                aria-label={`${ratio.text} from the source note (hold Alt for below)`}
                onMouseEnter={(e) => on.enter(ratio, e.altKey)}
                onMouseLeave={on.leave}
                onFocus={() => on.focus(ratio)}
                onBlur={on.leave}
                // Alt+click adds below; the click stops here so nothing behind it (the page's Alt+click pin) sees it
                onClick={(e) => on.click(ratio, e)}
                onKeyDown={(e) => on.key(ratio, e)}
              />
            </g>
          );
        })
      )}
    </>
  );
});

/** M8o: the tinted fill of every ring cell (its whole annular sector), under the dividers and labels; memoized like `BandCells`. */
const CellTints = memo(function CellTints({
  rings,
  bands,
  C,
  rot,
  tints,
}: {
  rings: RingRatio[][];
  bands: [number, number][];
  C: number;
  rot: number;
  tints: ReadonlyMap<RingRatio, IntervalTint>;
}) {
  return (
    <>
      {rings.map((band, b) =>
        band.map((ratio, i) => {
          const t = tints.get(ratio);
          if (!t) {
            return null;
          }
          const [ri, ro] = bands[b];
          return (
            <path
              key={`t${b}-${ratio.text}`}
              className={classes.cellTint}
              d={sectorPath(
                C,
                ri,
                ro,
                (i / band.length) * 360 + rot,
                ((i + 1) / band.length) * 360 + rot
              )}
              style={{ fill: t.fill, stroke: t.border }}
              data-testid="relative-cell-tint"
              data-ratio={ratio.text}
            />
          );
        })
      )}
    </>
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
  onSource,
  startNear,
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
  monzo: initialMonzo,
  onMonzoCommit,
  onMonzoTouch,
  onAdd,
  message,
  metaSets,
  onMetaSets,
}: RelativeModalProps) {
  const lab = useLab();
  // M8p: the painted monzo is local to the picker (one drawn update per animation frame); the lab state gets it when this closes
  const {
    monzo,
    latest: monzoNow,
    set: setMonzoExp,
    reset: resetMonzo,
    hover: monzoHoverCell,
    setHover: setMonzoHover,
    stroke: monzoStroke,
    setStroke: setMonzoStroke,
  } = useLocalMonzo(initialMonzo, onMonzoCommit, onMonzoTouch);
  // M9e: the matrix cell under the pointer is a PREVIEW. K13: while Alt is held in Monzo the matrix SHOWS the inverse of the painted
  // monzo (`shownBase`: every exponent negated; the same object as `monzo` otherwise, so memos below depend on Alt only in Monzo).
  // `shownMonzo` (the preview built on `shownBase`, else `shownBase`) drives the landing ghost, the readout, the legend tick, holds
  // 1 / 4 / 5 and the pin; the matrix, its sparkline, header, Rows and cell tints read `shownBase`; Add reads the shown value at
  // the event. Only the store keeps the PAINTED `monzo` (the panel negates at its write boundary).
  const [alt, setAlt] = useState(false);
  const altRef = useRef(alt);
  altRef.current = alt;
  const invertMonzo = mode === 'monzo' && alt;
  const shownBase = useMemo(() => shownMonzoOf(monzo, invertMonzo), [monzo, invertMonzo]);
  const monzoPreview = useMemo(
    () => previewMonzo(shownBase, monzoHoverCell),
    [shownBase, monzoHoverCell]
  );
  const shownMonzo = monzoPreview ?? shownBase;
  const hoverCellRef = useRef(monzoHoverCell);
  hoverCellRef.current = monzoHoverCell;
  // the inner ring's field dots: click toggles the subset, Shift+click makes the note the source, right-click or Delete removes it
  // (never 1/1). The ring's own hover stays the source (`hover={fromIdx}`), so no hover handlers here.
  const innerDotProps = (i: number): RingDotExtra => {
    const isRef = Math.abs(lab.base.field[i]?.c ?? 0) < 1e-6;
    const own = noteHandlers(lab, i);
    const remove = () => {
      if (!isRef) {
        lab.dispatch({ type: 'relative/remove', index: i });
      }
    };
    return {
      // Shift+mousedown would extend the page's text selection over the ratio labels
      onMouseDown: (e) => {
        if (e.shiftKey) {
          e.preventDefault();
        }
      },
      onClick: (e) => (e.shiftKey ? onSource(i) : own.onClick(e)),
      onContextMenu: (e) => {
        e.preventDefault();
        remove();
      },
      onKeyDown: (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.shiftKey) {
          e.preventDefault();
          onSource(i);
        } else if (e.key === 'Delete') {
          e.preventDefault();
          remove();
        } else {
          own.onKeyDown(e);
        }
      },
    };
  };
  const isMonzo = mode === 'monzo';
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // M8f pin bar: the ring list (Rings and Near) or the monzo list (Monzo); the card under the pointer in Monzo; the flash and message
  const pinKind: PinKind = mode === 'monzo' ? 'monzo' : 'ring';
  const pinList = lab.state.ui.pins[pinKind];
  const pinRef = useRef<() => void>(() => undefined);
  const [pinHover, setPinHover] = useState<string | null>(null);
  const [pinFlash, setPinFlash] = useState<{ text: string; n: number } | null>(null);
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  // a pin-bar drag in progress: Esc cancels the drag, it must not close the modal
  const [pinDrag, setPinDrag] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pinMsg) {
      return undefined;
    }
    const t = window.setTimeout(() => setPinMsg(null), 3000);
    return () => window.clearTimeout(t);
  }, [pinMsg]);
  // M8d meta ring: the center (a ratio or cents) it is open on, or null; the settings
  const [meta, setMeta] = useState<MetaCenter | null>(() => {
    if (!startNear) {
      return null;
    }
    const unison = parseTypedStep('1/1');
    return unison.ok ? { note: unison.ratio, text: unison.label } : null;
  });
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
  // stable across hovers (the memoized band cells compare it by identity)
  const rings = useMemo(() => places.map((g) => g.ratios), [places]);
  // direction: Alt NOT held = above, Alt held = below (tracked while the modal is open, reset when the window loses focus; a click reads its own altKey)
  // (`alt` itself is declared above, with the monzo)
  // M9d: holding ` (Backquote, by physical key) shows the opposite Measure (Step <-> Landing) while held; release or blur goes back
  const [measureFlip, setMeasureFlip] = useState(false);
  // the key handler below is set up once per opening: it reads the audio API through a ref, never a stale copy
  const audioRef = useRef(lab.audio);
  audioRef.current = lab.audio;
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
      // M9d: momentary Step <-> Landing flip (a dead key on some layouts: the physical code still arrives)
      if (e.code === 'Backquote' && !e.ctrlKey && !e.metaKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        setMeasureFlip(true);
        return;
      }
      if (e.altKey && /^(Digit|Numpad)[1-9]$/.test(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        // Alt is "below" here, not "switch tab": the page's hold handler ignores Alt+digit (it means tab there), so a hold key
        // pressed while Alt is already down starts its preview from here (release needs nothing: the page releases by key code)
        const digit = e.code.slice(-1);
        // only 1, 4 and 5 sound in the picker (a plain 2 or 3 plays nothing on a picker target either)
        if (
          !e.repeat &&
          !e.ctrlKey &&
          !e.metaKey &&
          !isTypingTarget(e.target) &&
          (digit === SHORTCUTS.holdOwn || ARMED_DIGITS[digit])
        ) {
          audioRef.current.holdPreview(keyId(e), digit);
        }
        return;
      }
      // M8f: = (or +, the same physical key) pins the hovered interval; it must not reach the page's Sketch stash
      if (
        (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '=' || e.key === '+') &&
        !e.ctrlKey &&
        !e.metaKey &&
        // M9e K13: in Monzo, Alt+= pins the shown inverse; elsewhere Alt+= does nothing
        (!e.altKey || modeRef.current === 'monzo') &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) {
          pinRef.current();
        }
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
      if (e.code === 'Backquote') {
        setMeasureFlip(false);
      }
    };
    const onBlur = () => {
      setAlt(false);
      setMeasureFlip(false);
    };
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
  const mStep = useMemo(() => monzoStep(shownMonzo, rep), [shownMonzo, rep]);
  const mLanding = useMemo(() => monzoLanding(from, shownMonzo, rep), [from, shownMonzo, rep]);
  const mDir: Direction = mStep?.dir ?? 'above';
  // a hovered monzo card previews like the painted interval: from the source note times its exponents (Alt = divided, below)
  const pinNote = useMemo(
    () => (isMonzo && pinHover ? parseInterval(pinHover) : null),
    [isMonzo, pinHover]
  );
  const pinDir: Direction = alt ? 'below' : 'above';
  const pinLanding = useMemo(
    () => (pinNote ? reduceInto(mulNotes(from, pinNote, alt ? -1 : 1), rep) : null),
    [pinNote, from, rep, alt]
  );
  const [cell, setCell] = useState<RingRatio | null>(null);
  useEffect(() => {
    setCell(null);
    setPinHover(null);
  }, [mode]);
  // the readout pill in Monzo mode: the landing as for the rings, then the nonzero exponents
  const monzoLine = message
    ? message
    : pinHover && pinLanding
      ? landingReadout(braKet(pinHover) ?? pinHover, pinDir, from, pinLanding)
      : `${
          mStep
            ? landingReadout(noteText(mStep.ratio), mStep.dir, from, mLanding)
            : `${noteText(from)} (all 0)`
        } · ${monzoSummary(shownMonzo)}`;
  const onTyped = (text: string, d: Direction): string | null => {
    const r = parseTypedStep(text);
    if (!r.ok) {
      return r.message;
    }
    onAdd(noteText(landingPitch(from, r.ratio, d, rep)));
    return null;
  };
  const dir: Direction = alt ? 'below' : 'above';
  // where the hovered ratio sits in the bands (for the one tint path drawn over the memoized cells)
  const selCell = useMemo(() => {
    const r = hover?.ratio;
    if (!r) {
      return null;
    }
    for (let b = 0; b < rings.length; b++) {
      const i = rings[b].indexOf(r);
      if (i >= 0) {
        return { b, i };
      }
    }
    return null;
  }, [hover?.ratio, rings]);
  // M8c hover keys: the landing under the pointer (the ghost), reported up so holds 1 / 4 / 5 can sound it
  const [monzoOver, setMonzoOver] = useState(false);
  useEffect(() => {
    setMonzoOver(false);
    setMonzoHover(null);
  }, [mode, monzoView, setMonzoHover]);
  const pointLanding = useMemo(
    () =>
      isMonzo
        ? (pinLanding ?? (monzoOver ? mLanding : null))
        : cell
          ? landingPitch(from, cell.note, dir, rep)
          : null,
    [isMonzo, monzoOver, mLanding, pinLanding, cell, from, dir, rep]
  );
  // The landing under the pointer is what holds 1 / 4 / 5 sound (1 = that pitch alone, 4 = the picked note and it, 5 = the whole
  // field and it; absolute pitches, like a library row's). The key carries the landing, the source and the field, so a held key
  // follows a change under a resting pointer. Owned here (not by the page) so a painted frame re-renders only the picker, and
  // read from the same value the matrix draws, so sound and picture change together.
  const audio = lab.audio;
  const lastTarget = useRef<PreviewTarget | null>(null);
  const fieldCents = lab.base.field.map((n) => n.c);
  const fieldSig = fieldCents.join(',');
  // M9d: hold 4 plays the interval the colors measure: Step = the source note and the landing; Landing (or ` held) = 1/1 and the
  // landing. The open view's Measure, flipped while ` is held (the same rule as `landingOn` below).
  const viewMeasure = (
    isMonzo
      ? lab.state.ui.relColor.monzo
      : meta !== null
        ? lab.state.ui.relColor.near
        : lab.state.ui.relColor.rings
  ).measure;
  const pairRefC = (viewMeasure === 'landing') !== measureFlip ? 0 : from.c;
  useEffect(() => {
    const prev = lastTarget.current;
    if (!pointLanding) {
      if (prev) {
        audio.clearPreviewTarget(prev);
        lastTarget.current = null;
      }
      return;
    }
    const l = pointLanding.c;
    const exact = fieldCents.some((c) => Math.abs(c - l) < 1e-6)
      ? [...fieldCents]
      : [...fieldCents, l].sort((a, b) => a - b);
    const next: PreviewTarget = {
      kind: 'pitches',
      key: `rel:${from.c}:${pairRefC}:${l}:${fieldSig}`,
      cents: [l],
      variants: { own: [l], rounded: [pairRefC, l], exact },
    };
    lastTarget.current = next;
    audio.setPreviewTarget(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fieldCents is rebuilt each render; fieldSig stands for it
  }, [pointLanding, from.c, pairRefC, fieldSig, audio]);
  useEffect(
    () => () => {
      if (lastTarget.current) {
        audio.clearPreviewTarget(lastTarget.current);
        lastTarget.current = null;
      }
    },
    [audio]
  );
  // the hovered cell and the direction together are the hover the ghost and the readout follow
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  useEffect(() => {
    onHoverRef.current(cell ? { ratio: cell, dir } : null);
  }, [cell, dir]);
  // the band cells' handlers: one stable object (so the memoized cells are not rebuilt on a hover), reading the latest callbacks
  const cellLatest = useRef({ openMeta, onPick });
  cellLatest.current = { openMeta, onPick };
  const cellOn = useMemo<CellHandlers>(
    () => ({
      enter: (ratio, altKey) => {
        setAlt(altKey);
        setCell(ratio);
      },
      leave: () => setCell(null),
      focus: (ratio) => setCell(ratio),
      click: (ratio, e) => {
        e.stopPropagation();
        setAlt(e.altKey);
        // Ctrl+click opens the meta ring on this ratio (adds nothing)
        if (e.ctrlKey) {
          cellLatest.current.openMeta('nearClick', { note: ratio.note, text: ratio.text });
          setCell(null);
          return;
        }
        cellLatest.current.onPick({ ratio, dir: e.altKey ? 'below' : 'above' });
      },
      key: (ratio, e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          cellLatest.current.onPick({ ratio, dir: e.altKey ? 'below' : 'above' });
        }
      },
    }),
    []
  );
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
  // M8o Color menu + M9c channels: Hue, Brightness, range and octave (settings.v1), the lab-wide interval intensity (developer.v1) and the
  // scheme; in Near also the RADIUS of the dots. The tints are built per view (ring cells, Near dots, Monzo matrix cells) and handed
  // down as one memoized map or grid, so a hover (which changes none of these inputs) never rebuilds them and the memoized band cells
  // stay memoized.
  // the OPEN view's choice (D24: Rings, Near and Monzo each keep their own; ring pin cards follow the open view)
  const relColors = lab.state.ui.relColor;
  const relColor = isMonzo ? relColors.monzo : metaOn ? relColors.near : relColors.rings;
  const monzoOctave = isMonzo ? relColors.monzo.octave : 'exact';
  // M9d (H-41): what the measures read. Step: the cell's own interval. Landing: where it lands from 1/1 (`from` x step; Monzo honors its
  // Octave, the other views reduce into the repeat like a click). Null for Step, so the memos below change only with a real Landing.
  // The maps never depend on the hovered cell, only on the source, the repeat and the Octave.
  // holding ` flips it for as long as it is held (the saved setting is unchanged)
  const landingOn = (relColor.measure === 'landing') !== measureFlip;
  // G15: "Colors follow Alt" (Rings and Near; Monzo has none): while Alt is held the measures read the BELOW direction (Landing: source
  // / step; Step: the inverse step). `belowOn` is false whenever the setting is off, so with it off no memo below depends on Alt.
  const belowOn = !isMonzo && relColor.followAlt && alt;
  const measureOf = useMemo<((n: Note) => Note) | null>(
    () =>
      landingOn || belowOn
        ? (n) =>
            measuredNote(
              n,
              landingOn ? 'landing' : 'step',
              from,
              isMonzo ? monzoOctave : rep,
              belowOn ? 'below' : 'above'
            )
        : null,
    [landingOn, belowOn, from, rep, isMonzo, monzoOctave]
  );
  const [dev] = useLabDeveloperOptions();
  const { look, outline, scheme } = useTiles();
  const colorOn = relColor.hue !== 'off' || relColor.bright !== 'off';
  // M9: the entropy curve is asked for only while something here draws it (Entropy brightness or radius, or the Near overlay); the
  // picker re-renders only when a build finishes. The tint maps depend on the curve's identity, never on a hover.
  const entropyColor = relColor.bright === 'entropy' || relColor.hue === 'entropy';
  const entropyRadius = metaOn && relColors.near.radius === 'entropy';
  const he = useHeCurve(
    lab.state.ui.heBlur,
    dev.heLimit,
    entropyColor || entropyRadius || (metaOn && mSet.entropy)
  );
  const heSource = entropyColor || entropyRadius ? he.source : null;
  // M9c: the Near radius (Entropy waits for its curve: Tenney meanwhile, so the dots and the ring labels never mix two scales)
  const radius = effectiveRadius(relColors.near.radius, heSource !== null);
  const near = useMemo(
    () =>
      metaOn && meta
        ? nearRatios(meta.note, {
            spanC: mSet.spanC,
            oddCap: mSet.oddCap,
            order: radiusOrder(radius),
            max: META_MAX_DOTS,
            mask: mSet.mask,
          })
        : null,
    [metaOn, meta, mSet.spanC, mSet.oddCap, radius, mSet.mask]
  );
  // one RingRatio per dot (stable between renders, so hover can compare by identity)
  const dots = useMemo(
    () =>
      (near?.items ?? []).map((it) => ({
        ratio: { note: it.note, text: it.text, odd: it.odd } as RingRatio,
        offsetC: it.offsetC,
        v: measureOf
          ? (metricValue(radius, measureOf(it.note), heSource) ?? 0)
          : radiusValue(radius, it, heSource),
        prime: largestPrime(it.text),
        isCenter: meta !== null && it.text === meta.text && Math.abs(it.offsetC) < 1e-6,
      })),
    [near, meta, radius, heSource, measureOf]
  );
  const dotByRatio = useMemo(() => new Map(dots.map((d) => [d.ratio, d])), [dots]);
  const hoverDot = metaOn && cell ? (dotByRatio.get(cell) ?? null) : null;
  const hoverOffset = hoverDot ? hoverDot.offsetC : null;
  const monzoCells = useMemo(
    () => (isMonzo && colorOn ? monzoCellNotes(shownBase, monzoOctave) : null),
    [isMonzo, colorOn, shownBase, monzoOctave]
  );
  // the cells' notes as the measures read them (the landings when Landing), per view
  const measuredCells = useMemo(
    () => (monzoCells && measureOf ? monzoCells.map((col) => col.map(measureOf)) : monzoCells),
    [monzoCells, measureOf]
  );
  const measuredView = useMemo(
    () =>
      isMonzo
        ? (measuredCells?.flat() ?? [])
        : (metaOn ? dots.map((d) => d.ratio.note) : rings.flat().map((r) => r.note)).map((n) =>
            measureOf ? measureOf(n) : n
          ),
    [isMonzo, measuredCells, metaOn, dots, rings, measureOf]
  );
  // Fit to view: the min and max over the cells of the open view (ring cells, Near dots or Monzo matrix cells)
  const viewNotes = useMemo(
    () => (relColor.range !== 'fit' || !usesRange(relColor) ? [] : measuredView),
    [relColor.range, relColor.hue, relColor.bright, measuredView]
  );
  const tintCtx = useMemo<TintContext | null>(
    () =>
      colorOn && (!entropyColor || heSource)
        ? {
            hue: relColor.hue,
            bright: relColor.bright,
            he: heSource,
            intensity: dev.intervalIntensity,
            scheme,
            look,
            outline,
            repC,
            // each measure channel has its own bounds: Fit over the view, or Entropy's Fixed ones (F10)
            bounds: channelBounds(relColor.bright, relColor.range, viewNotes, heSource),
            hueBounds: channelBounds(relColor.hue, relColor.range, viewNotes, heSource),
          }
        : null,
    [
      colorOn,
      entropyColor,
      heSource,
      relColor.hue,
      relColor.bright,
      relColor.range,
      dev.intervalIntensity,
      scheme,
      look,
      outline,
      repC,
      viewNotes,
    ]
  );
  // D23 legend: the primes present in the open view (Prime) and the hovered interval's place on the legend. `legendMark` is rebuilt
  // only when the hovered interval (or the legend's own inputs) changes and the memoized legend alone redraws; the ring never does.
  const legendPrimes = useMemo(() => {
    if (relColor.hue !== 'prime') {
      return [];
    }
    const set = new Set<number>();
    for (const n of measuredView) {
      const p = largestPrimeOf(n);
      if (p !== null) {
        set.add(p);
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [relColor.hue, measuredView]);
  const ringTints = useMemo(
    () =>
      tintCtx && !isMonzo && !metaOn
        ? new Map(
            rings.flat().flatMap((r) => {
              const t = tintOf(measureOf ? measureOf(r.note) : r.note, tintCtx);
              return t ? [[r, t] as const] : [];
            })
          )
        : null,
    [tintCtx, isMonzo, metaOn, rings, measureOf]
  );
  const dotTints = useMemo(
    () =>
      tintCtx && metaOn
        ? new Map(
            dots.flatMap((d) => {
              const t = tintOf(measureOf ? measureOf(d.ratio.note) : d.ratio.note, tintCtx);
              return t ? [[d.ratio, t] as const] : [];
            })
          )
        : null,
    [tintCtx, metaOn, dots, measureOf]
  );
  const cellTints = useMemo(
    () =>
      tintCtx && measuredCells
        ? monzoCellTints(measuredCells, {
            hue: tintCtx.hue,
            bright: tintCtx.bright,
            intensity: tintCtx.intensity,
            scheme: tintCtx.scheme,
            look: tintCtx.look,
            outline: tintCtx.outline,
            repC: tintCtx.repC,
            he: tintCtx.he,
            range: relColor.range,
          })
        : null,
    [tintCtx, measuredCells, relColor.range]
  );
  // the pin cards: the same tint as the interval's cell (a card's note is parsed once; Fit uses the open view's range)
  const pinNotes = useRef(new Map<string, ReturnType<typeof parseInterval>>());
  const pinTint = useCallback(
    (text: string): IntervalTint | null => {
      if (!tintCtx) {
        return null;
      }
      let n = pinNotes.current.get(text);
      if (n === undefined) {
        n = parseInterval(text);
        pinNotes.current.set(text, n);
      }
      if (!n) {
        return null;
      }
      const step = monzoOctave === 'reduced' ? foldOctave(n) : n;
      return tintOf(measureOf ? measureOf(step) : step, tintCtx);
    },
    [tintCtx, monzoOctave, measureOf]
  );
  // the Monzo landing mark: the painted interval's tint (a hovered monzo card shows its own)
  const landingTint =
    isMonzo && tintCtx
      ? pinNote
        ? pinTint(pinHover ?? '')
        : tintOf(
            measureOf
              ? measureOf(monzoPaintedNote(shownMonzo, monzoOctave))
              : monzoPaintedNote(shownMonzo, monzoOctave),
            tintCtx
          )
      : null;
  // the hovered interval on the legend: a ring cell, a Near dot or a ring pin card (`cell`), a hovered Monzo card, or in Monzo the
  // painted interval (hovering a matrix cell paints it, so the cell under the pointer IS the painted interval)
  const monzoHoverNote = useMemo(
    () =>
      !isMonzo || !colorOn
        ? null
        : pinNote
          ? monzoOctave === 'reduced'
            ? foldOctave(pinNote)
            : pinNote
          : monzoPaintedNote(shownMonzo, monzoOctave),
    [isMonzo, colorOn, pinNote, shownMonzo, monzoOctave]
  );
  const hoverStep = isMonzo ? monzoHoverNote : (cell?.note ?? null);
  // the landing is rebuilt only when the hovered note (or the source) changes, so the legend mark below stays memoized
  const hoverNote = useMemo(
    () => (hoverStep && measureOf ? measureOf(hoverStep) : hoverStep),
    [hoverStep, measureOf]
  );
  const legendBounds = tintCtx?.bounds ?? null;
  const legendHueBounds = tintCtx?.hueBounds ?? null;
  const legendMark = useMemo(
    () =>
      hoverNote && colorOn
        ? legendMarksOf(
            relColor.hue,
            relColor.bright,
            hoverNote,
            legendBounds,
            repC,
            heSource,
            legendHueBounds
          )
        : null,
    // the note is read through its identity: a ring cell and a parsed card keep theirs, the painted note is rebuilt per monzo
    [
      hoverNote,
      colorOn,
      relColor.hue,
      relColor.bright,
      legendBounds,
      legendHueBounds,
      repC,
      heSource,
    ]
  );
  const legend = (
    <RelativeColorLegend
      hue={relColor.hue}
      bright={relColor.bright}
      bounds={legendBounds}
      hueBounds={legendHueBounds}
      intensity={dev.intervalIntensity}
      look={look}
      outline={outline}
      scheme={scheme}
      primes={legendPrimes}
      mark={legendMark}
      building={(entropyColor || entropyRadius) && he.building}
    />
  );
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
            landing={
              isMonzo
                ? pinLanding
                  ? { note: pinLanding, dir: pinDir }
                  : { note: mLanding, dir: mDir }
                : undefined
            }
            tint={landingTint?.mark}
          />
        );
      },
    [from, rep, hover, isMonzo, mLanding, mDir, pinLanding, pinDir, landingTint?.mark]
  );
  const baseLine =
    metaOn && meta && hoverOffset !== null && line && !message
      ? `${line} · ${signedCents(hoverOffset, meta.note.m ? 1 : 2)} from ${meta.text}`
      : line;
  // M9d: which interval is measured, "6/5 step" or "3/2 from 1/1" (only while a color channel is on). It follows the direction
  // (Alt = below) like the sound does: Landing reads the same landing hold 4 plays (source 5/4, cell 5/4: 25/16 above, 1/1 below).
  const landingText = pointLanding ? noteText(pointLanding) : null;
  const readoutLine =
    baseLine && cell && colorOn && !message
      ? `${baseLine} · ${
          measureOf && landingOn
            ? `${landingText ?? noteText(measureOf(cell.note))} from 1/1`
            : `${cell.text} step${dir === 'below' ? ' down' : ''}`
        }`
      : baseLine;
  const rMin = bands[0][0] + 4;
  // the dots' outer radius leaves room outside it for the cents labels
  const rMax = bands[bands.length - 1][1] - 16;
  const { lo, hi } = useMemo(() => metaRange(dots), [dots]);
  const floor = radiusFloor(radius, heSource, lo, hi);
  // offset 0 at noon, or at the true angle of the pitch the center interval adds (Alt = below mirrors the window)
  const atLanding = mSet.zero === 'landing' && meta !== null;
  const zero = atLanding ? trueAngle(landingPitch(from, meta.note, dir, rep).c, repC) : 0;
  const sign: 1 | -1 = atLanding && dir === 'below' ? -1 : 1;
  // stable callbacks for the memoized meta layer (the latest pick handler is read through a ref)
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // M8f pin bar: pin the hovered interval (the key), and what a card does on hover, leave and click
  const cellRef = useRef(cell);
  cellRef.current = cell;
  const pinHoverRef = useRef(pinHover);
  pinHoverRef.current = pinHover;
  const labRef = useRef(lab);
  labRef.current = lab;
  // one RingRatio per pinned text (kept, so the hover compares by identity as for the band cells)
  const pinRatios = useRef(new Map<string, RingRatio>());
  const ringOfPin = (text: string): RingRatio | null => {
    const kept = pinRatios.current.get(text);
    if (kept) {
      return kept;
    }
    const note = parseInterval(text);
    if (!note || !note.m) {
      return null;
    }
    const r: RingRatio = { note, text, odd: Number(oddLimit(note) ?? 1n) };
    pinRatios.current.set(text, r);
    return r;
  };
  const setPins = (kind: PinKind, next: string[]) => {
    const l = labRef.current;
    l.dispatch({ type: 'ui', patch: { pins: { ...l.state.ui.pins, [kind]: next } } });
  };
  pinRef.current = () => {
    const kind: PinKind = modeRef.current === 'monzo' ? 'monzo' : 'ring';
    let text: string | null = null;
    if (kind === 'monzo') {
      // M9e: the previewed interval when a matrix cell is hovered, else the painted one
      const base = shownMonzoOf(monzoNow.current, altRef.current);
      const m = previewMonzo(base, hoverCellRef.current) ?? base;
      text = pinHoverRef.current ?? (isZeroMonzo(m) ? null : fmtRatio(monzoNote(m)));
      if (!text) {
        setPinMsg('Paint an interval first: every exponent is 0.');
        return;
      }
    } else {
      const c = cellRef.current;
      if (!c) {
        setPinMsg('Point at an interval first, then press =.');
        return;
      }
      if (!c.note.m) {
        setPinMsg('Only exact ratios can be pinned.');
        return;
      }
      text = fmtRatio(c.note);
    }
    const r = addPin(labRef.current.state.ui.pins[kind], text);
    if (r.result === 'added') {
      setPins(kind, r.list);
      setPinMsg(null);
    } else if (r.result === 'duplicate') {
      const t = text;
      setPinFlash((f) => ({ text: t, n: (f?.n ?? 0) + 1 }));
      setPinMsg(null);
    } else {
      setPinMsg(`The ${kind} pin list is full (${MAX_PINS}). Remove one to pin another.`);
    }
  };
  const onPinEnter = (text: string, altKey: boolean) => {
    setAlt(altKey);
    if (modeRef.current === 'monzo') {
      setPinHover(text);
    } else {
      const r = ringOfPin(text);
      if (r) {
        setCell(r);
      }
    }
  };
  const onPinLeave = () => {
    if (modeRef.current === 'monzo') {
      setPinHover(null);
    } else {
      setCell(null);
    }
  };
  const onPinAdd = (text: string, altKey: boolean) => {
    setAlt(altKey);
    if (modeRef.current === 'monzo') {
      const n = parseInterval(text);
      if (n) {
        onAdd(noteText(reduceInto(mulNotes(from, n, altKey ? -1 : 1), rep)));
      }
    } else {
      const r = ringOfPin(text);
      if (r) {
        onPickRef.current({ ratio: r, dir: altKey ? 'below' : 'above' });
      }
    }
  };
  // a card that is gone (removed, row or list cleared) must not leave its preview behind
  useEffect(() => {
    setPinHover(null);
    const c = cellRef.current;
    if (c && pinRatios.current.get(c.text) === c) {
      setCell(null);
    }
  }, [pinList.length]);
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
  const showLegend = mSet.connect === 'prime' && relColor.hue !== 'prime';
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      // Mantine's own Esc listener is a window capture listener registered before ours, so stopping the event cannot reach it:
      // while the meta ring is open, Esc belongs to the meta ring (back to the rings) and the Modal must not close on it
      closeOnEscape={!metaOn && !pinDrag && !monzoStroke}
      fullScreen={FULLSCREEN}
      centered
      size={bodyW + MODAL_PAD_W}
      padding="xs"
      title={`From ${fromText}`}
      transitionProps={{ duration: 0 }}
    >
      <div
        ref={bodyRef}
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
            dotProps={innerDotProps}
            overlay={overlay}
            ariaLabel={`Copy of the pitch circle, ${fromText} at the top`}
          />
        </div>
        {isMonzo && (
          <MonzoPanel
            view={monzoView}
            onView={onMonzoView}
            monzo={shownBase}
            inverted={invertMonzo}
            onMonzo={setMonzoExp}
            onReset={resetMonzo}
            hover={monzoHoverCell}
            onHover={setMonzoHover}
            onStroke={setMonzoStroke}
            // Add (button, Enter, double-click) adds what has been painted NOW (a frame ahead of the drawn landing), as SHOWN: the
            // inverse when Alt is held (K14; the event's own Alt flag, else the tracked one)
            onAddMonzo={(altKey) =>
              onAdd(
                noteText(
                  monzoLanding(from, shownMonzoOf(monzoNow.current, altKey ?? altRef.current), rep)
                )
              )
            }
            onTyped={onTyped}
            onNear={onNear}
            width={size}
            rowH={mGeo.rowH}
            onOver={setMonzoOver}
            cellTints={cellTints}
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
          {/* M8o: the Color menu's tinted fill of each ring cell, under the dividers and labels */}
          {ringTints && <CellTints rings={rings} bands={bands} C={C} rot={rot} tints={ringTints} />}
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
          <BandCells
            rings={rings}
            bands={bands}
            C={C}
            rot={rot}
            scale={scale}
            repC={repC}
            on={cellOn}
            tints={ringTints}
          />
          {/* the hovered (or key-stepped) cell's tint: one path on top, so a hover redraws only this */}
          {selCell && (
            <path
              className={classes.halfSel}
              d={sectorPath(
                C,
                bands[selCell.b][0],
                bands[selCell.b][1],
                (selCell.i / rings[selCell.b].length) * 360 + rot,
                ((selCell.i + 1) / rings[selCell.b].length) * 360 + rot
              )}
              data-testid="relative-half-selected"
              data-ratio={rings[selCell.b][selCell.i].text}
              data-dir={dir}
            />
          )}
          {metaOn && meta && (
            <MetaLayer
              C={C}
              bands={bands}
              rMin={rMin}
              rMax={rMax}
              lo={lo}
              hi={hi}
              floor={floor}
              zero={zero}
              sign={sign}
              mSet={mSet}
              radius={radius}
              he={heSource}
              meta={meta}
              dots={dots}
              onDotEnter={onDotEnter}
              onDotLeave={onDotLeave}
              onDotClick={onDotClick}
              onDotKey={onDotKey}
              onSurfaceClick={onSurfaceClick}
              hoverText={mSet.connect === 'parents' && cell ? cell.text : null}
              dotTints={dotTints}
              heCurve={metaOn && mSet.entropy ? he.curve : null}
              measureOf={measureOf}
              curveLanding={landingOn}
              curveBelow={belowOn}
              fromC={from.c}
            />
          )}
          {/* the hovered dot's highlight: one circle above the memoized layer (the layer itself never re-renders on hover) */}
          {metaOn &&
            meta &&
            hoverDot &&
            (() => {
              const p = metaDotPos(
                {
                  measure: radius,
                  he: heSource,
                  scale: mSet.scale,
                  C,
                  rMin,
                  rMax,
                  lo,
                  hi,
                  floor,
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
        {!metaOn && <RelativeColorPanel monzo={isMonzo} legend={legend} />}
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
              aria-label="Radius scale"
              title="Scale: Linear (radius by the Radius value), Log (by its log), Even (for Tenney by the count-like size, square root of n x d, so the dots spread evenly; the other Radius values have no count-like size, so Even is Linear)"
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
              title="Connect: Off, Order (one zigzag by complexity), By prime (one thread per largest prime), Parents (hover a dot to see its whole Stern-Brocot ancestry: each step is joined to its two simpler parents; dashed to a ghost dot where a parent would be but is filtered out)"
              value={mSet.connect}
              onChange={(v) =>
                setMSet({
                  connect:
                    v === 'off'
                      ? 'off'
                      : v === 'prime'
                        ? 'prime'
                        : v === 'parents'
                          ? 'parents'
                          : 'order',
                })
              }
              data={[
                { value: 'off', label: 'Off' },
                { value: 'order', label: 'Order' },
                { value: 'prime', label: 'By prime' },
                { value: 'parents', label: 'Parents' },
              ]}
            />
            <RelativeColorControls monzo={false} near legend={legend} />
            <Hint label="Faint circles at round complexity values">
              <label className={classes.metaCheck}>
                <input
                  type="checkbox"
                  checked={mSet.rings}
                  onChange={(e) => setMSet({ rings: e.currentTarget.checked })}
                />
                Complexity rings
              </label>
            </Hint>
            <Hint label="Spokes at round cent offsets">
              <label className={classes.metaCheck}>
                <input
                  type="checkbox"
                  checked={mSet.cents}
                  onChange={(e) => setMSet({ cents: e.currentTarget.checked })}
                />
                Cents lines
              </label>
            </Hint>
            <Tip k="heNear" as="control" block>
              <label className={classes.metaCheck}>
                <input
                  type="checkbox"
                  data-testid="relative-meta-entropy-check"
                  checked={mSet.entropy}
                  onChange={(e) => setMSet({ entropy: e.currentTarget.checked })}
                />
                Entropy curve
              </label>
            </Tip>
            {mSet.entropy && he.building && (
              <div className={classes.metaNote}>Building entropy…</div>
            )}
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
            ? 'Hover to preview · click or drag to paint · Ctrl line · double-click or Enter to add · hold Alt for the inverse · hold 1 / 4 / 5 to hear'
            : metaOn
              ? 'Esc: back to rings · click a dot to add (Alt: below) · hold 1/4/5 to hear'
              : `Rings ${places.map((g) => g.label).join(' · ')} · 2/3 ring, Shift prime, Ctrl+Shift 5 · Ctrl+click: near ratios · inner dot: click subset, Shift from it, right-click remove · hold 1/4/5 to hear`}
        </div>
        <div className={classes.line} data-testid="relative-line" aria-live="polite">
          {isMonzo ? monzoLine : readoutLine}
        </div>
      </div>
      <PinBar
        kind={pinKind}
        list={pinList}
        max={MAX_PINS}
        onList={(next) => setPins(pinKind, next)}
        onEnter={onPinEnter}
        onLeave={onPinLeave}
        onAdd={onPinAdd}
        flash={pinFlash}
        message={pinMsg}
        anchorRef={bodyRef}
        onDragActive={setPinDrag}
        tintOf={pinTint}
      />
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
  /** M8o: the landing mark's fill (the Color menu's tint of the painted interval); absent: the plain dashed mark. */
  tint?: string;
}

/** The ghost dot on the inner ring at the landing pitch of the hovered half (orange above, teal below). */
export function RelativeGhost({ at, k, from, rep, hover, landing, tint }: RelativeGhostProps) {
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
      style={landing && tint ? { fill: tint } : undefined}
    />
  );
}
