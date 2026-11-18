/**
 * M8c (thin slice): the Monzo mode of the Relative pitches modal. One kept set of 13 exponents (primes 2 to 41, each -12 to +12)
 * is edited two ways: an always-visible MATRIX or exact -/+ ROWS; a typed box (ratio or cents, Above / Below) sits under both.
 * The values live in the lab state (`state.relative.monzo`, runtime only); this file only draws and reports.
 *
 * Matrix (human, 2026-11-17): 13 prime columns by 25 exponent rows (+12 at the top to -12 at the bottom), the 0 row the same row
 * in every column and marked across the whole matrix, a prime header on top and an exponent label column on the left. Hovering a
 * cell sets that column's prime to the row's value at once (so sweeping the pointer paints values); a click adds the note;
 * leaving keeps the values. Each column's current cell is filled, and a sparkline runs through the centers of the 13 current
 * cells. The panel is `STRIP_AREA_ROWS` rows tall (the header plus 25 value rows) with the controls under it.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, SegmentedControl, TextInput } from '@mantine/core';
import {
  MONZO_PRIMES,
  MONZO_RANGE,
  clampExp,
  type Direction,
  type MonzoExps,
  type MonzoPrime,
} from '../../../lib/harmonic-field';
import { isTyping } from '../audio/keymap';
import { tintVars, type IntervalTint } from '../state/intervalColor';
import { Hint } from './ui';
import classes from './relativeMenu.module.css';

export type MonzoView = 'strips' | 'rows';

/** The width of the left column of exponent labels (pixels). */
export const MONZO_LABEL_W = 30;

/** The matrix area: one header row plus the 25 exponent rows (+12 .. -12). */
export const STRIP_AREA_ROWS = 2 * MONZO_RANGE + 2;
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
  monzo: MonzoExps;
  onMonzo: (prime: MonzoPrime, value: number) => void;
  onReset: () => void;
  /** Add the dialed monzo's landing note. */
  onAddMonzo: () => void;
  /** Add the typed step above or below; returns the message when the text is refused, else null. */
  onTyped: (text: string, dir: Direction) => string | null;
  /** Open the meta ring (ratios near the typed ratio or cents); returns the message when the text is refused, else null. */
  onNear?: (text: string) => string | null;
  /** The panel's width (pixels) and one matrix row's height (pixels). */
  width: number;
  rowH: number;
  /** The pointer entered or left the matrix or the rows (the hold 1 / 4 / 5 previews follow the landing only while it is over). */
  onOver?: (over: boolean) => void;
  /**
   * M8o (H-37): each matrix cell's tint, `[column][row]` in the order of `MONZO_PRIMES` and `+12 .. -12`: the interval the painted
   * monzo would become if only that prime's exponent were that cell's value. Null (Color Off): the plain cells.
   */
  cellTints?: readonly (readonly (IntervalTint | null)[])[] | null;
}

export function MonzoPanel({
  view,
  onView,
  monzo,
  onMonzo,
  onReset,
  onAddMonzo,
  onTyped,
  onNear,
  width,
  rowH,
  onOver,
  cellTints,
}: MonzoPanelProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const areaH = STRIP_AREA_ROWS * rowH;
  // nearly square cells (1.25 x the row height), the label column plus matrix centered in the area
  const cellW = Math.round(rowH * 1.25);
  const gridW = cellW * MONZO_PRIMES.length;
  const x0 = Math.max(0, Math.floor((width - MONZO_LABEL_W - gridW) / 2));
  const gridH = STRIP_ROWS * rowH;

  // The values as last known (re-read from the props every render, updated at once on a dispatch so one move never repeats a write).
  const cur = useRef<number[]>([]);
  cur.current = MONZO_PRIMES.map((p) => clampExp(monzo[p]));
  const keys = useRef({ ctrl: false, alt: false });
  const inside = useRef(false);
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
  const setCol = (j: number, v: number) => {
    if (cur.current[j] !== v) {
      cur.current[j] = v;
      onMonzo(MONZO_PRIMES[j], v);
    }
  };
  /**
   * Paint for a pointer position. Alt: nothing. Ctrl: a straight line from the anchor cell to the pointer's cell (columns the line no
   * longer covers return to their snapshot). Otherwise the cell under the pointer is set.
   */
  const paint = (clientX: number, clientY: number, ctrl: boolean, alt: boolean) => {
    keys.current = { ctrl, alt };
    const box = gridRef.current?.getBoundingClientRect();
    if (!ctrl) {
      line.current = null;
    }
    if (!box || alt) {
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
  // Ctrl and Alt are tracked on the window (reset on blur); pointer events also carry their own flags so a missed key never sticks
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const was = keys.current.ctrl;
      keys.current = { ctrl: e.ctrlKey, alt: e.altKey };
      const p = lastPos.current;
      if (e.ctrlKey && !was && inside.current && p) {
        paintRef.current(p.x, p.y, e.ctrlKey, e.altKey);
      } else if (!e.ctrlKey) {
        line.current = null;
      }
    };
    const onBlur = () => {
      keys.current = { ctrl: false, alt: false };
      line.current = null;
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  const sy = (p: MonzoPrime) => (MONZO_RANGE - clampExp(monzo[p]) + 0.5) * rowH;
  const points = MONZO_PRIMES.map((p, j) => `${(j + 0.5) * cellW},${sy(p)}`).join(' ');

  const submit = (dir: Direction) => setError(onTyped(text, dir));
  const half = Math.ceil(MONZO_PRIMES.length / 2);

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
              style={{ left: x0 + MONZO_LABEL_W, width: gridW, height: rowH }}
              data-testid="monzo-primes"
            >
              {MONZO_PRIMES.map((p) => {
                const v = clampExp(monzo[p]);
                return (
                  <Hint key={p} label={`${p}: ${expText(v)}`}>
                    <div
                      className={classes.primeCell}
                      data-testid="monzo-prime"
                      data-prime={p}
                      data-nonzero={v !== 0 ? 'true' : undefined}
                    >
                      {p}
                    </div>
                  </Hint>
                );
              })}
            </div>
            <div
              className={classes.expLabels}
              style={{ left: x0, top: rowH, width: MONZO_LABEL_W }}
            >
              {VALUES.map((v) => (
                <div
                  key={v}
                  className={classes.expLabel}
                  data-zero={v === 0 ? 'true' : undefined}
                  style={{ height: rowH }}
                >
                  {expText(v)}
                </div>
              ))}
            </div>
            <div
              ref={gridRef}
              className={classes.matrix}
              style={{ left: x0 + MONZO_LABEL_W, top: rowH, width: gridW, height: gridH }}
              data-testid="monzo-matrix"
              onMouseEnter={() => {
                inside.current = true;
                prevCell.current = null;
                onOver?.(true);
              }}
              onMouseLeave={() => {
                inside.current = false;
                prevCell.current = null;
                onOver?.(false);
              }}
              onMouseMove={(e) => {
                inside.current = true;
                lastPos.current = { x: e.clientX, y: e.clientY };
                paint(e.clientX, e.clientY, e.ctrlKey, e.altKey);
              }}
              onMouseDown={(e) => paint(e.clientX, e.clientY, e.ctrlKey, e.altKey)}
              onClick={(e) => {
                e.stopPropagation();
                paint(e.clientX, e.clientY, e.ctrlKey, e.altKey);
                onAddMonzo();
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
          <div
            className={classes.rowsGrid}
            data-testid="monzo-rows"
            onMouseEnter={() => onOver?.(true)}
            onMouseLeave={() => onOver?.(false)}
          >
            {MONZO_PRIMES.map((p, j) => {
              const v = clampExp(monzo[p]);
              return (
                <div
                  key={p}
                  className={classes.monzoRow}
                  data-testid="monzo-row"
                  data-prime={p}
                  style={{ gridColumn: j < half ? 1 : 2, gridRow: (j % half) + 1 }}
                >
                  <span className={classes.rowPrime}>{p}</span>
                  <Button
                    size="compact-xs"
                    variant="default"
                    aria-label={`Lower the exponent of ${p}`}
                    disabled={v <= -MONZO_RANGE}
                    onClick={() => onMonzo(p, v - 1)}
                  >
                    −
                  </Button>
                  <span className={classes.rowValue} data-nonzero={v !== 0 ? 'true' : undefined}>
                    {expText(v)}
                  </span>
                  <Button
                    size="compact-xs"
                    variant="default"
                    aria-label={`Raise the exponent of ${p}`}
                    disabled={v >= MONZO_RANGE}
                    onClick={() => onMonzo(p, v + 1)}
                  >
                    +
                  </Button>
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
          <Button size="compact-xs" variant="default" data-testid="monzo-reset" onClick={onReset}>
            Reset
          </Button>
          {view === 'rows' && (
            <Button size="compact-xs" data-testid="monzo-add" onClick={onAddMonzo}>
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
