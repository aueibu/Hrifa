/**
 * M8c (thin slice): the Monzo mode of the Relative pitches modal. One kept set of 13 exponents (primes 2 to 41, each -12 to +12)
 * is edited two ways: an always-visible MATRIX or exact -/+ ROWS; a typed box (ratio or cents, Above / Below) sits under both.
 * The values live in the picker while it is open (`useLocalMonzo`, M8p) and in the lab state (`state.relative.monzo`, runtime
 * only) between openings; this file only draws and reports.
 *
 * Matrix (human, 2026-11-17): 13 prime columns by 25 exponent rows (+12 at the top to -12 at the bottom), the 0 row the same row
 * in every column and marked across the whole matrix, a prime header on top and an exponent label column on the left. M9e: hovering
 * only previews; a press sets that column's prime to the row's value and a drag paints a stroke (Ctrl: a line, Esc: cancel); Add
 * (button, Enter or a double-click) adds the note. Each column's current cell is filled, and a sparkline runs through the centers of the 13 current
 * cells. The panel is `MONZO_AREA_ROWS` rows tall (M9f: the per-prime split band, the header and 25 value rows) with the controls under it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MONZO_PRIMES,
  MONZO_RANGE,
  clampExp,
  type Direction,
  type MonzoExps,
  type MonzoPrime,
} from '../../../lib/harmonic-field';
import { SegmentedControl, TextInput, Button } from '../../../ui';
import { isTyping } from '../audio/keymap';
import { primeTextColor, tintVars, type IntervalTint } from '../state/intervalColor';
import {
  NORM_LABEL,
  partText,
  percentText,
  primeSplit,
  type MonzoSplit,
  type PrimeSplit,
  type SplitNorm,
} from '../state/primeSplit';
import { Hint, Tip } from './ui';
import type { HoverCell } from './useLocalMonzo';
import classes from './relativeMenu.module.css';

export type MonzoView = 'strips' | 'rows';

/** The width of the left column of exponent labels (pixels). */
export const MONZO_LABEL_W = 30;
/** F20: the narrow gutter left of the exponent labels that holds the shift buttons (pixels). */
export const MONZO_GUTTER_W = 18;

/** The matrix area: one header row plus the 25 exponent rows (+12 .. -12). */
export const STRIP_AREA_ROWS = 2 * MONZO_RANGE + 2;
/**
 * M9f: the fixed band above the prime header (percent line, then the bars): 3 rows tall, always reserved (also when every share is
 * zero), so nothing in the matrix moves when the values change. The area is `MONZO_AREA_ROWS` rows (the band, the header, 25 rows).
 */
export const MONZO_BAND_ROWS = 3;
export const MONZO_AREA_ROWS = STRIP_AREA_ROWS + MONZO_BAND_ROWS;
/** The bar zone of the band is its bottom two rows (the top row is the percent line). */
const BAND_BAR_ROWS = MONZO_BAND_ROWS - 1;
/** The exponent rows (+12 .. -12). */
const STRIP_ROWS = 2 * MONZO_RANGE + 1;
/** The controls under the matrix (switch row, typed row, error line), pixels. */
export const MONZO_CTL_H = 76;
const VALUES = Array.from({ length: STRIP_ROWS }, (_, i) => MONZO_RANGE - i);

/** An exponent as text, with the real minus sign. */
export const expText = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');

/** The nonzero exponents as text (`7: +1, 3: −2`), or `all 0`. */
export function monzoSummary(e: MonzoExps): string {
  const parts = MONZO_PRIMES.filter((p) => clampExp(e[p]) !== 0).map(
    (p) => `${p}: ${expText(clampExp(e[p]))}`
  );
  return parts.length ? parts.join(', ') : 'all 0';
}

export interface MonzoPanelProps {
  view: MonzoView;
  onView: (v: MonzoView) => void;
  /** The monzo as SHOWN (the painted one, or its inverse while `inverted`); the whole panel works in shown space. */
  monzo: MonzoExps;
  /** K13: Alt is held, `monzo` is the inverse of the stored one: every value written out is negated (the one store boundary, `write`). */
  inverted?: boolean;
  /** Set one STORED exponent; `now` draws it at once (a button), otherwise the picker draws it with the next animation frame (painting). */
  onMonzo: (prime: MonzoPrime, value: number, now?: boolean) => void;
  onReset: () => void;
  /** Add the dialed monzo's landing note; `altKey` is the Alt state of the event (the shown value is added). */
  onAddMonzo: (altKey?: boolean) => void;
  /** Add the typed step above or below; returns the message when the text is refused, else null. */
  onTyped: (text: string, dir: Direction) => string | null;
  /** Open the meta ring (ratios near the typed ratio or cents); returns the message when the text is refused, else null. */
  onNear?: (text: string) => string | null;
  /** The panel's width (pixels) and one matrix row's height (pixels). */
  width: number;
  rowH: number;
  /**
   * M8o (H-37): each matrix cell's tint, `[column][row]` in the order of `MONZO_PRIMES` and `+12 .. -12`: the interval the painted
   * monzo would become if only that prime's exponent were that cell's value. Null (Color Off): the plain cells.
   */
  cellTints?: readonly (readonly (IntervalTint | null)[])[] | null;
  /** M9e: the cell under the pointer (a preview: the picker shows its interval; never painted) and its setter. */
  hover?: HoverCell | null;
  onHover?: (cell: HoverCell | null) => void;
  /** M9e: a paint stroke (button down) began or ended (the picker keeps Esc from closing the modal meanwhile). */
  onStroke?: (on: boolean) => void;
  /** M9f (H-42): the interval the colors measure now (its monzo; null: nothing to split), the saved Norm / Count octaves and their setter. */
  splitMonzo?: Readonly<Record<string, number>> | null;
  splitSetting?: MonzoSplit;
  /** True when the split's interval is the Landing measure (the prime header tooltip says "landing" rather than "step"). */
  splitLanding?: boolean;
  onSplitSetting?: (patch: Partial<MonzoSplit>) => void;
  /**
   * F21: a counter the picker bumps whenever a note is added (Add, a typed step, a pin card): the frozen shift set is forgotten
   * when it moves. Read at the click, never rendered.
   */
  freezeEpoch?: { readonly current: number };
}

const SPLIT_DEFAULT: MonzoSplit = { norm: 'l1', octaves: true, fit: false };

/**
 * M9f (look 1, F18): one prime's bar and percent, directly beside the + button of its Rows-view row. A zero row shows nothing (no
 * track, no number); an uncounted prime 2 shows the dashed ghost outline and no number.
 */
function RowSplit({
  part,
  norm,
  split,
  octaves,
}: {
  part: PrimeSplit['parts'][number];
  norm: SplitNorm;
  split: PrimeSplit;
  octaves: boolean;
}) {
  if (part.bar <= 0 && part.ghost <= 0) {
    // keep the fixed-width slot so the centered grid never shifts sideways when a value becomes nonzero
    return (
      <span className={classes.rowSplit} data-testid="monzo-row-split">
        <span className={classes.rowPct} />
        <span className={classes.rowTrack} />
      </span>
    );
  }
  return (
    <Hint label={partText(part, split.total, norm, octaves)}>
      <span className={classes.rowSplit} data-testid="monzo-row-split">
        <span className={classes.rowPct}>{percentText(part, norm)}</span>
        <span className={classes.rowTrack}>
          {part.bar > 0 ? (
            <span
              className={classes.rowBar}
              data-testid="monzo-row-bar"
              data-bar={part.bar.toFixed(3)}
              style={{ width: `${part.bar * 100}%`, background: primeTextColor(part.prime) }}
            />
          ) : (
            <span
              className={classes.rowGhost}
              data-testid="monzo-row-ghost"
              data-bar={part.ghost.toFixed(3)}
              style={{ width: `${part.ghost * 100}%` }}
            />
          )}
        </span>
      </span>
    </Hint>
  );
}

export function MonzoPanel({
  view,
  onView,
  monzo,
  inverted = false,
  onMonzo,
  onReset,
  onAddMonzo,
  onTyped,
  onNear,
  width,
  rowH,
  cellTints,
  hover,
  onHover,
  onStroke,
  splitMonzo = null,
  splitLanding = false,
  splitSetting = SPLIT_DEFAULT,
  onSplitSetting,
  freezeEpoch,
}: MonzoPanelProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const areaH = MONZO_AREA_ROWS * rowH;
  const bandH = MONZO_BAND_ROWS * rowH;
  const barZoneH = BAND_BAR_ROWS * rowH;
  // nearly square cells (1.25 x the row height), the label column plus matrix centered in the area
  const cellW = Math.round(rowH * 1.25);
  const gridW = cellW * MONZO_PRIMES.length;
  const x0 = Math.max(0, Math.floor((width - MONZO_GUTTER_W - MONZO_LABEL_W - gridW) / 2));
  // the left of the labels, and the left of the matrix (gutter, then labels, then the grid)
  const xl = x0 + MONZO_GUTTER_W;
  const xg = xl + MONZO_LABEL_W;
  const gridH = STRIP_ROWS * rowH;

  // The values as last known: re-read from the props when they change (the picker draws one frame behind the pointer, so an
  // unrelated render in between must not bring a stale value back), updated at once on a write so one move never repeats it.
  const cur = useRef<number[]>([]);
  const seen = useRef<MonzoExps | null>(null);
  if (seen.current !== monzo) {
    seen.current = monzo;
    cur.current = MONZO_PRIMES.map((p) => clampExp(monzo[p]));
  }
  const keys = useRef({ ctrl: false });
  /** M9e: a paint stroke (primary button down): the monzo before the press, for Esc. */
  const stroke = useRef<{ snap: number[] } | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  // the cell the last plain paint set: a fast sweep skips columns between two mouse events, so they are filled along the way
  const prevCell = useRef<{ col: number; row: number } | null>(null);
  /** Ctrl line paint: the anchor cell, the values when Ctrl went down, and the columns the line covers now. */
  const line = useRef<{
    col: number;
    row: number;
    snap: number[];
    lo: number;
    hi: number;
  } | null>(null);
  // K13: everything above (cur, the snapshots, the gap fill, the line) is in SHOWN space. `write` is the only place a value leaves
  // for the store, and it negates there while Alt is held. When Alt flips in the middle of a stroke the snapshots change space with
  // it (negated), and the path memory (previous cell, line) starts over.
  const inv = useRef(inverted);
  if (inv.current !== inverted) {
    inv.current = inverted;
    if (stroke.current) {
      stroke.current.snap = stroke.current.snap.map((v) => 0 - v);
    }
    prevCell.current = null;
    line.current = null;
  }
  const write = (j: number, v: number, now?: boolean) =>
    onMonzo(MONZO_PRIMES[j], inv.current ? 0 - v : v, now);
  const setCol = (j: number, v: number) => {
    if (cur.current[j] !== v) {
      cur.current[j] = v;
      write(j, v);
    }
  };
  /**
   * Paint for a pointer position (only while the button is down, M9e). Ctrl: a straight line from the anchor cell to the pointer's
   * cell (columns the line no longer covers return to their snapshot). Otherwise the cell under the pointer is set.
   */
  const paint = (clientX: number, clientY: number, ctrl: boolean) => {
    keys.current = { ctrl };
    const box = gridRef.current?.getBoundingClientRect();
    if (!ctrl) {
      line.current = null;
    }
    if (!box) {
      prevCell.current = null;
      return;
    }
    const col = Math.max(
      0,
      Math.min(MONZO_PRIMES.length - 1, Math.floor((clientX - box.left) / cellW))
    );
    const row = Math.max(0, Math.min(STRIP_ROWS - 1, Math.floor((clientY - box.top) / rowH)));
    if (!ctrl) {
      // every column from the last painted cell to this one gets the row on the straight path between them
      const p = prevCell.current;
      if (p && p.col !== col) {
        const step = col > p.col ? 1 : -1;
        for (let j = p.col + step; j !== col + step; j += step) {
          const r = Math.round(p.row + ((j - p.col) / (col - p.col)) * (row - p.row));
          setCol(j, MONZO_RANGE - r);
        }
      } else {
        setCol(col, MONZO_RANGE - row);
      }
      prevCell.current = { col, row };
      return;
    }
    prevCell.current = null;
    const a = (line.current ??= { col, row, snap: [...cur.current], lo: col, hi: col });
    const lo = Math.min(a.col, col);
    const hi = Math.max(a.col, col);
    for (let j = a.lo; j <= a.hi; j++) {
      if (j < lo || j > hi) {
        setCol(j, a.snap[j]);
      }
    }
    for (let j = lo; j <= hi; j++) {
      const r =
        col === a.col ? a.row : a.row + Math.round(((j - a.col) / (col - a.col)) * (row - a.row));
      setCol(j, clampExp(MONZO_RANGE - Math.max(0, Math.min(STRIP_ROWS - 1, r))));
    }
    a.lo = lo;
    a.hi = hi;
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const cellAt = (clientX: number, clientY: number): HoverCell | null => {
    const box = gridRef.current?.getBoundingClientRect();
    if (!box) {
      return null;
    }
    const col = Math.max(
      0,
      Math.min(MONZO_PRIMES.length - 1, Math.floor((clientX - box.left) / cellW))
    );
    const row = Math.max(0, Math.min(STRIP_ROWS - 1, Math.floor((clientY - box.top) / rowH)));
    return { prime: MONZO_PRIMES[col], value: MONZO_RANGE - row };
  };
  const endStroke = () => {
    if (stroke.current) {
      stroke.current = null;
      prevCell.current = null;
      line.current = null;
      onStroke?.(false);
    }
  };
  const cancelStroke = () => {
    const s = stroke.current;
    if (s) {
      s.snap.forEach((v, j) => setCol(j, v));
      endStroke();
    }
  };
  const addRef = useRef(onAddMonzo);
  addRef.current = onAddMonzo;
  const strokeApi = useRef({ end: endStroke, cancel: cancelStroke });
  strokeApi.current = { end: endStroke, cancel: cancelStroke };
  // Ctrl is tracked on the window (reset on blur); mouse events also carry their own flag so a missed key never sticks. A stroke
  // follows the pointer on the window (it keeps working outside the matrix) and ends on the button's release anywhere; Esc during
  // a stroke restores the monzo before the press; Enter adds the painted monzo (not while typing or on a focused button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown' && e.key === 'Escape' && stroke.current) {
        e.preventDefault();
        e.stopPropagation();
        strokeApi.current.cancel();
        return;
      }
      if (
        e.type === 'keydown' &&
        e.key === 'Enter' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !isTyping(e.target) &&
        !(e.target instanceof HTMLButtonElement) &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        e.stopPropagation();
        // K14: Alt + Enter adds the SHOWN (inverted) value
        addRef.current(e.altKey);
        return;
      }
      const was = keys.current.ctrl;
      keys.current = { ctrl: e.ctrlKey };
      const p = lastPos.current;
      if (e.ctrlKey && !was && stroke.current && p) {
        paintRef.current(p.x, p.y, e.ctrlKey);
      } else if (!e.ctrlKey) {
        line.current = null;
      }
    };
    const onBlur = () => {
      keys.current = { ctrl: false };
      line.current = null;
      // the window lost focus mid-stroke: the release may never arrive, so the stroke ends here, as a release would
      strokeApi.current.end();
    };
    const onMove = (e: MouseEvent) => {
      if (stroke.current) {
        // the button is already up (released outside the window): end the stroke instead of painting on
        if ((e.buttons & 1) === 0) {
          strokeApi.current.end();
          return;
        }
        lastPos.current = { x: e.clientX, y: e.clientY };
        paintRef.current(e.clientX, e.clientY, e.ctrlKey);
      }
    };
    const onUp = () => strokeApi.current.end();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      strokeApi.current.end();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  // M9f: computed in this render (13 primes), never in the lab state: a hover only changes the props of the picker
  const split = useMemo(
    () => primeSplit(splitMonzo, splitSetting.norm, splitSetting.octaves, splitSetting.fit),
    [splitMonzo, splitSetting.norm, splitSetting.octaves, splitSetting.fit]
  );
  const sy = (p: MonzoPrime) => (MONZO_RANGE - clampExp(monzo[p]) + 0.5) * rowH;
  const points = MONZO_PRIMES.map((p, j) => `${(j + 0.5) * cellW},${sy(p)}`).join(' ');

  // F21: the frozen shift set (indices of the primes nonzero when shifting started), runtime only. It is valid only while the stored
  // values are exactly what the last shift wrote (a paint, label, Reset or typed entry changes them) and no note was added since.
  const freeze = useRef<{ set: number[]; expect: number[]; epoch: number } | null>(null);
  const frozenSet = (shown: readonly number[], invFlag: boolean): number[] => {
    const f = freeze.current;
    const stored = shown.map((v) => (invFlag ? 0 - v : v));
    if (f && f.epoch === (freezeEpoch?.current ?? 0) && f.expect.every((v, i) => v === stored[i])) {
      return f.set;
    }
    return shown.flatMap((v, i) => (v !== 0 ? [i] : []));
  };
  const shownNow = MONZO_PRIMES.map((p) => clampExp(monzo[p]));
  const shiftSet = frozenSet(shownNow, inverted);
  const shiftBlock = (d: 1 | -1): number | undefined =>
    shiftSet.find((j) => Math.abs(shownNow[j] + d) > MONZO_RANGE);
  /** One commit: every frozen prime moves by d in the SHOWN view (write() negates for the store while Alt is held). */
  const shift = (d: 1 | -1) => {
    const set = frozenSet(cur.current, inv.current);
    if (set.length === 0 || set.some((j) => Math.abs(cur.current[j] + d) > MONZO_RANGE)) {
      return;
    }
    for (const j of set) {
      const v = cur.current[j] + d;
      cur.current[j] = v;
      write(j, v, true);
    }
    freeze.current = {
      set,
      expect: cur.current.map((v) => (inv.current ? 0 - v : v)),
      epoch: freezeEpoch?.current ?? 0,
    };
  };
  /** F19: set all 13 primes to a shown value (0 clears all, as Reset). Not an Add. */
  const setAll = (v: number) => {
    freeze.current = null;
    for (let j = 0; j < MONZO_PRIMES.length; j++) {
      cur.current[j] = v;
      write(j, v, true);
    }
  };
  const shiftHint = (d: 1 | -1): string => {
    if (shiftSet.length === 0) {
      return 'Nothing to shift: every exponent is 0';
    }
    const j = shiftBlock(d);
    if (j !== undefined) {
      return `Cannot shift ${d > 0 ? 'up' : 'down'}: ${MONZO_PRIMES[j]} is already at ${expText(shownNow[j])}`;
    }
    return d > 0 ? 'Add 1 to every used prime' : 'Subtract 1 from every used prime';
  };

  const submit = (dir: Direction) => {
    freeze.current = null;
    setError(onTyped(text, dir));
  };

  return (
    <div className={classes.monzoPanel} style={{ width }} data-testid="monzo-panel">
      <div
        className={classes.stripArea}
        style={{ height: areaH }}
        data-testid="monzo-area"
        // a focused typed box would swallow the hold keys (typing): pointing at the matrix or rows takes the focus back
        onPointerEnter={() => {
          const el = document.activeElement;
          if (el instanceof HTMLElement && isTyping(el)) {
            el.blur();
          }
        }}
      >
        {view === 'strips' ? (
          <>
            <div
              className={classes.primeRow}
              style={{ left: xg, top: bandH, width: gridW, height: rowH }}
              data-testid="monzo-primes"
            >
              {MONZO_PRIMES.map((p, j) => {
                const v = clampExp(monzo[p]);
                const part = split.parts[j];
                const e = Math.round(splitMonzo?.[p] ?? 0);
                const headerText = (
                  pr: number,
                  painted: number,
                  det: string,
                  pt: PrimeSplit['parts'][number]
                ): string => {
                  const bits: string[] = [];
                  if (painted !== 0) {
                    bits.push(`painted ${expText(painted)}`);
                  }
                  if (pt.counted && pt.a > 0) {
                    bits.push(
                      `${splitLanding ? 'landing' : 'step'} exponent ${expText(e)}, ${det.slice(String(pr).length + 2)}`
                    );
                  }
                  return bits.length ? `${pr}: ${bits.join('; ')}` : `${pr}: 0`;
                };
                const detail = partText(
                  split.parts[j],
                  split.total,
                  splitSetting.norm,
                  splitSetting.octaves
                );
                return (
                  <Hint key={p} label={headerText(p, v, detail, part)}>
                    <div
                      className={classes.primeCell}
                      data-testid="monzo-prime"
                      data-prime={p}
                      data-nonzero={v !== 0 ? 'true' : undefined}
                      style={v !== 0 ? { color: primeTextColor(p) } : undefined}
                    >
                      {p}
                    </div>
                  </Hint>
                );
              })}
            </div>
            <Hint
              k="monzoSplit"
              dynamic={`Total (${NORM_LABEL[splitSetting.norm]}, ${splitSetting.octaves ? 'octaves counted' : 'octaves not counted'}): ${split.total.toFixed(2)}`}
            >
              <div
                className={classes.splitCorner}
                style={{ left: xl, width: MONZO_LABEL_W, height: bandH }}
                data-testid="monzo-split-total"
              >
                {split.total > 0 ? split.total.toFixed(2) : ''}
              </div>
            </Hint>
            <div
              className={classes.splitBand}
              style={{ left: xg, width: gridW, height: bandH }}
              data-testid="monzo-split"
              data-norm={splitSetting.norm}
            >
              {split.parts.map((part) => (
                <Hint
                  key={part.prime}
                  label={partText(part, split.total, splitSetting.norm, splitSetting.octaves)}
                >
                  <div
                    className={classes.splitSlot}
                    style={{ width: cellW }}
                    data-testid="monzo-split-slot"
                    data-prime={part.prime}
                    data-off={!part.counted ? 'true' : undefined}
                    data-max={part.isMax ? 'true' : undefined}
                  >
                    <div
                      className={classes.splitPct}
                      style={{ height: rowH }}
                      data-testid="monzo-split-pct"
                    >
                      {percentText(part, splitSetting.norm)}
                    </div>
                    <div className={classes.splitBarZone} style={{ height: barZoneH }}>
                      {part.bar > 0 && (
                        <div
                          className={classes.splitBar}
                          data-testid="monzo-split-bar"
                          data-bar={part.bar.toFixed(3)}
                          style={{
                            width: Math.max(4, Math.round(cellW * 0.55)),
                            height: Math.max(2, Math.round(part.bar * barZoneH)),
                            background: primeTextColor(part.prime),
                          }}
                        />
                      )}
                      {part.ghost > 0 && (
                        <div
                          className={classes.splitGhost}
                          data-testid="monzo-split-ghost"
                          data-bar={part.ghost.toFixed(3)}
                          style={{
                            width: Math.max(4, Math.round(cellW * 0.55)),
                            height: Math.max(2, Math.round(part.ghost * barZoneH)),
                          }}
                        />
                      )}
                    </div>
                  </div>
                </Hint>
              ))}
            </div>
            <div
              className={classes.shiftGutter}
              style={{ left: x0, top: bandH + rowH, width: MONZO_GUTTER_W }}
              data-testid="monzo-shift"
            >
              {([1, -1] as const).map((d) => {
                const off = shiftSet.length === 0 || shiftBlock(d) !== undefined;
                return (
                  <div
                    key={d}
                    className={classes.shiftSlot}
                    style={{ top: (MONZO_RANGE - d) * rowH, height: rowH }}
                  >
                    <Hint k="monzoShift" dynamic={shiftHint(d)}>
                      <span className={classes.shiftWrap}>
                        <button
                          type="button"
                          className={classes.shiftBtn}
                          data-testid={d > 0 ? 'monzo-shift-up' : 'monzo-shift-down'}
                          aria-label={
                            d > 0
                              ? 'Shift all used primes up by 1'
                              : 'Shift all used primes down by 1'
                          }
                          disabled={off}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => shift(d)}
                        >
                          {d > 0 ? '+' : '−'}
                        </button>
                      </span>
                    </Hint>
                  </div>
                );
              })}
            </div>
            <div
              className={classes.expLabels}
              style={{ left: xl, top: bandH + rowH, width: MONZO_LABEL_W }}
            >
              {VALUES.map((v) => (
                <Hint key={v} k="monzoLabelSet" dynamic={`Set all 13 primes to ${expText(v)}`}>
                  <button
                    type="button"
                    className={classes.expLabel}
                    data-testid="monzo-label"
                    data-value={v}
                    data-zero={v === 0 ? 'true' : undefined}
                    style={{ height: rowH }}
                    aria-label={`Set all primes to ${expText(v)}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setAll(v)}
                  >
                    {expText(v)}
                  </button>
                </Hint>
              ))}
            </div>
            <div
              ref={gridRef}
              className={classes.matrix}
              style={{ left: xg, top: bandH + rowH, width: gridW, height: gridH }}
              data-testid="monzo-matrix"
              onMouseLeave={() => {
                onHover?.(null);
              }}
              // hovering only previews (M9e): the hovered cell goes up to the picker, nothing is painted
              onMouseMove={(e) => {
                lastPos.current = { x: e.clientX, y: e.clientY };
                onHover?.(cellAt(e.clientX, e.clientY));
              }}
              // a press paints its cell and starts a stroke; the window follows the drag and ends it on release
              onMouseDown={(e) => {
                if (e.button !== 0) {
                  return;
                }
                e.preventDefault();
                freeze.current = null;
                lastPos.current = { x: e.clientX, y: e.clientY };
                stroke.current = { snap: [...cur.current] };
                prevCell.current = null;
                line.current = null;
                paint(e.clientX, e.clientY, e.ctrlKey);
                onStroke?.(true);
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const c = cellAt(e.clientX, e.clientY);
                if (c) {
                  setCol(MONZO_PRIMES.indexOf(c.prime), c.value);
                }
                // K14: with Alt held the cell was set in the shown view and the shown (inverted) value is added
                freeze.current = null;
                onAddMonzo(e.altKey);
              }}
            >
              {MONZO_PRIMES.map((prime, j) => {
                const now = clampExp(monzo[prime]);
                return (
                  <div
                    key={prime}
                    className={classes.matrixCol}
                    data-testid="monzo-strip"
                    data-prime={prime}
                  >
                    {VALUES.map((v, r) => {
                      const tint = cellTints?.[j]?.[r];
                      return (
                        <div
                          key={v}
                          className={classes.stripCell}
                          data-testid="monzo-value"
                          data-value={v}
                          data-now={v === now ? 'true' : undefined}
                          data-zero={v === 0 ? 'true' : undefined}
                          data-hover={
                            hover?.prime === prime && hover.value === v ? 'true' : undefined
                          }
                          data-tinted={tint ? 'true' : undefined}
                          style={{ height: rowH, ...tintVars(tint) }}
                        >
                          {expText(v)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              <svg
                className={classes.spark}
                width={gridW}
                height={gridH}
                viewBox={`0 0 ${gridW} ${gridH}`}
                data-testid="monzo-spark"
                aria-hidden="true"
              >
                <polyline className={classes.sparkHalo} points={points} />
                <polyline className={classes.sparkLine} points={points} />
                {MONZO_PRIMES.map((p, j) => (
                  <circle
                    key={p}
                    className={classes.sparkDot}
                    cx={(j + 0.5) * cellW}
                    cy={sy(p)}
                    r={2.5}
                  />
                ))}
              </svg>
            </div>
          </>
        ) : (
          <div className={classes.rowsGrid} data-testid="monzo-rows">
            {MONZO_PRIMES.map((p, j) => {
              const v = clampExp(monzo[p]);
              return (
                <div key={p} className={classes.monzoRow} data-testid="monzo-row" data-prime={p}>
                  <span className={classes.rowPrime}>{p}</span>
                  <Button
                    size="compact-xs"
                    variant="default"
                    aria-label={`Lower the exponent of ${p}`}
                    disabled={v <= -MONZO_RANGE}
                    onClick={() => write(j, clampExp(cur.current[j]) - 1, true)}
                  >
                    −
                  </Button>
                  <span
                    className={classes.rowValue}
                    data-nonzero={v !== 0 ? 'true' : undefined}
                    style={v !== 0 ? { color: primeTextColor(p) } : undefined}
                  >
                    {expText(v)}
                  </span>
                  <Button
                    size="compact-xs"
                    variant="default"
                    aria-label={`Raise the exponent of ${p}`}
                    disabled={v >= MONZO_RANGE}
                    onClick={() => write(j, clampExp(cur.current[j]) + 1, true)}
                  >
                    +
                  </Button>
                  <RowSplit
                    part={split.parts[j]}
                    norm={splitSetting.norm}
                    split={split}
                    octaves={splitSetting.octaves}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div
        className={classes.monzoBottom}
        style={{ height: MONZO_CTL_H }}
        data-testid="monzo-bottom"
      >
        <div className={classes.monzoCtl}>
          <SegmentedControl
            size="xs"
            aria-label="Monzo input"
            value={view}
            onChange={(v) => {
              onView(v === 'rows' ? 'rows' : 'strips');
            }}
            data={[
              { value: 'strips', label: 'Matrix' },
              { value: 'rows', label: 'Rows' },
            ]}
          />
          <Tip k="monzoNorm" as="control">
            <SegmentedControl
              size="xs"
              aria-label="Norm"
              data-testid="monzo-norm"
              value={splitSetting.norm}
              onChange={(v) =>
                onSplitSetting?.({ norm: v === 'l2' ? 'l2' : v === 'linf' ? 'linf' : 'l1' })
              }
              data={[
                { value: 'l1', label: 'L1' },
                { value: 'l2', label: 'L2' },
                { value: 'linf', label: 'L-inf' },
              ]}
            />
          </Tip>
          <Tip k="monzoOctaves" as="control">
            <label className={classes.metaCheck}>
              <input
                type="checkbox"
                data-testid="monzo-octaves"
                checked={splitSetting.octaves}
                onChange={(e) => onSplitSetting?.({ octaves: e.currentTarget.checked })}
              />
              Count octaves
            </label>
          </Tip>
          <Tip k="monzoFit" as="control">
            <label className={classes.metaCheck}>
              <input
                type="checkbox"
                data-testid="monzo-fit"
                checked={splitSetting.fit}
                onChange={(e) => onSplitSetting?.({ fit: e.currentTarget.checked })}
              />
              Fit bars
            </label>
          </Tip>
          <Button
            size="compact-xs"
            variant="default"
            data-testid="monzo-reset"
            onClick={() => {
              freeze.current = null;
              onReset();
            }}
          >
            Reset
          </Button>
          {view === 'rows' && (
            <Button
              size="compact-xs"
              data-testid="monzo-add"
              onClick={(e) => {
                freeze.current = null;
                onAddMonzo(e.altKey);
              }}
            >
              Add
            </Button>
          )}
        </div>
        <div className={classes.monzoCtl}>
          <TextInput
            size="xs"
            aria-label="Typed step"
            placeholder="3/2 or 700"
            value={text}
            data-testid="monzo-typed"
            style={{ flex: 1 }}
            error={error ? true : undefined}
            classNames={{ error: classes.inputError }}
            onChange={(e) => {
              setText(e.currentTarget.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.ctrlKey && onNear) {
                  setError(onNear(text));
                } else {
                  submit('above');
                }
              }
            }}
          />
          <Button size="compact-xs" variant="default" onClick={() => submit('above')}>
            Above
          </Button>
          <Button size="compact-xs" variant="default" onClick={() => submit('below')}>
            Below
          </Button>
          {onNear && (
            <Button size="compact-xs" variant="default" onClick={() => setError(onNear(text))}>
              Near
            </Button>
          )}
        </div>
        <div className={classes.typedError} data-testid="monzo-error" role="alert">
          {error}
        </div>
      </div>
    </div>
  );
}
