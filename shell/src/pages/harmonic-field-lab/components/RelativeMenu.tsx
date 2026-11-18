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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, SegmentedControl } from '@mantine/core';
import {
  landingPitch,
  landingReadout,
  monzoLanding,
  monzoStep,
  noteText,
  parseTypedStep,
  primeRingIndex,
  relativeRingAt,
  type Direction,
  type MonzoExps,
  type MonzoPrime,
  type Note,
  type RingRatio,
} from '../../../lib/harmonic-field';
import {
  MONZO_CTL_H,
  MonzoPanel,
  STRIP_AREA_ROWS,
  monzoSummary,
  type MonzoView,
} from './MonzoPanel';
import { RING_PX_PER_UNIT, RING_R, RingDot } from './ringMarks';
import { PitchRing, type RingDotExtra, type RingOverlayArgs } from './RingStats';
import classes from './relativeMenu.module.css';

/** The inner ring's circle as a multiple of the main ring's circle (the human's floor is 0.9). */
export const INNER_RATIO = 1.15;
/** The bands' radial widths (pixels at scale 1) before the narrowing, and the gap between bands. */
export const MENU_BAND_WIDTHS = [42, 46, 52, 60] as const;
export const MENU_GAP = 4;
/** The narrowest the bands get (a factor on their widths) before the whole picture scales down instead. */
export const MIN_BAND_FACTOR = 0.75;
/** The four places always show this many consecutive groups of the ring sequence. */
export const MENU_PLACES = 4;
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
const CHROME_H = 150;
const CHROME_W = 72;
/** The label half-width used until the inner ring's own box is measured (SVG units). */
const FALLBACK_VB_HALF = 160;

/** Monzo mode: the strip rows are 12 to 18 px tall, the gap between the ring, strips and controls, and the smallest ring area. */
const MONZO_ROW_MIN = 12;
const MONZO_ROW_MAX = 18;
const MONZO_GAP = 6;
const MONZO_RING_MIN = 120;

const EMPTY_SET: ReadonlySet<number> = new Set<number>();

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
  const ppu = mainPpu * INNER_RATIO;
  const r0 = vbHalf * ppu * 1.08 + 2;
  const widthSum = MENU_BAND_WIDTHS.reduce((a, b) => a + b, 0);
  const fixed = r0 + MENU_GAP * 4 + 2;
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
}

export type BandMode = 'from' | 'fixed';
export type RelativeMode = 'rings' | 'monzo';

const noDotProps = (): RingDotExtra => ({ 'aria-pressed': undefined, tabIndex: -1 });

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
}: RelativeModalProps) {
  const isMonzo = mode === 'monzo';
  const modeRef = useRef(mode);
  modeRef.current = mode;
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
    onClick: (e: { altKey: boolean; stopPropagation: () => void }) => {
      e.stopPropagation();
      setAlt(e.altKey);
      onPick({ ratio, dir: e.altKey ? 'below' : 'above' });
    },
    onKeyDown: (e: { key: string; altKey: boolean; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPick({ ratio, dir: e.altKey ? 'below' : 'above' });
      }
    },
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
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
        </svg>
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
            value={mode}
            onChange={(v) => onMode(v === 'monzo' ? 'monzo' : 'rings')}
            data={[
              { value: 'rings', label: 'Rings' },
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
            : `Rings ${places.map((g) => g.label).join(' · ')} · 2/3 ring, Shift prime, Ctrl+Shift 5 · hold 1/4/5 to hear`}
        </div>
        <div className={classes.line} data-testid="relative-line" aria-live="polite">
          {isMonzo ? monzoLine : line}
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
