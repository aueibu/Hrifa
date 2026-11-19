/**
 * M8p: the painted monzo of the Relative picker, kept LOCAL to the picker while it is open.
 *
 * Painting sweeps the pointer across the matrix and sets several columns per mouse event. Writing each one to the lab-wide
 * reducer re-rendered every `useLab()` consumer on the page (main ring, workspace, stats, side column) once per column, so the
 * drawing fell behind the hover audio. Now:
 * - `latest` is the immediate truth (updated synchronously on every write; the gap fill, Ctrl line and snapshot logic of the
 *   matrix read and write through it, and Add, Pin and the typed box read it);
 * - `monzo` is what is drawn and sounded: at most one React update per animation frame, however many writes came in that frame;
 * - the lab state (`state.relative.monzo`, runtime only) is written once, when the picker closes, so the next opening starts
 *   where this one ended.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MONZO_PRIMES,
  clampExp,
  zeroMonzo,
  type MonzoExps,
  type MonzoPrime,
} from '../../../lib/harmonic-field';

export interface LocalMonzo {
  /** The drawn value (one update per animation frame). */
  monzo: MonzoExps;
  /** The value now, ahead of the drawn one while a frame is pending. */
  latest: { readonly current: MonzoExps };
  /** Set one exponent: batched to the next frame, or at once with `now`. */
  set: (prime: MonzoPrime, value: number, now?: boolean) => void;
  /** All exponents back to 0, drawn at once. */
  reset: () => void;
  /** M9e: the matrix cell under the pointer (preview only, never painted), drawn with the same frame as the painted value. */
  hover: HoverCell | null;
  setHover: (cell: HoverCell | null) => void;
  /** M9e: a paint stroke (button down) is in progress; changes are drawn at once (Esc must see it). */
  stroke: boolean;
  setStroke: (on: boolean) => void;
}

/** A matrix cell: one prime's exponent row. */
export interface HoverCell {
  prime: MonzoPrime;
  value: number;
}

/** M9e: the painted monzo with only the hovered cell's prime set to the hovered row (null without a hovered cell). */
export function previewMonzo(monzo: MonzoExps, cell: HoverCell | null): MonzoExps | null {
  return cell ? { ...monzo, [cell.prime]: clampExp(cell.value) } : null;
}

/**
 * M9e (K13): the monzo with every exponent negated (the inverse interval: 81/80 -> 80/81). It is its own inverse, so one function
 * converts both ways: stored -> shown and shown -> stored. (`0 - v`, never `-v`, so a zero stays +0.)
 */
export const negateMonzo = (monzo: MonzoExps): MonzoExps => {
  const out = { ...monzo };
  for (const p of MONZO_PRIMES) {
    out[p] = 0 - clampExp(monzo[p]);
  }
  return out;
};

/** The monzo as the matrix SHOWS it: the painted one, or its inverse while Alt is held (the same object when not inverted). */
export const shownMonzoOf = (monzo: MonzoExps, inverted: boolean): MonzoExps =>
  inverted ? negateMonzo(monzo) : monzo;

export function useLocalMonzo(
  initial: MonzoExps,
  /** The picker is closing: store the final value in the lab state. */
  onCommit: (monzo: MonzoExps) => void,
  /** Any change (clears a stale message in the lab state). */
  onTouch: () => void
): LocalMonzo {
  const [monzo, setMonzo] = useState(initial);
  const [hover, setHoverState] = useState<HoverCell | null>(null);
  const [stroke, setStrokeState] = useState(false);
  const hoverLatest = useRef<HoverCell | null>(null);
  const latest = useRef(initial);
  const frame = useRef<number | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const touchRef = useRef(onTouch);
  touchRef.current = onTouch;

  const flush = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setMonzo(latest.current);
    setHoverState(hoverLatest.current);
  }, []);
  const schedule = useCallback(() => {
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setMonzo(latest.current);
        setHoverState(hoverLatest.current);
      });
    }
  }, []);
  const set = useCallback(
    (prime: MonzoPrime, value: number, now?: boolean) => {
      const v = clampExp(value);
      if (latest.current[prime] === v) {
        return;
      }
      latest.current = { ...latest.current, [prime]: v };
      touchRef.current();
      if (now) {
        flush();
      } else {
        schedule();
      }
    },
    [flush, schedule]
  );
  const setHover = useCallback(
    (cell: HoverCell | null) => {
      const h = hoverLatest.current;
      if (h?.prime === cell?.prime && h?.value === cell?.value) {
        return;
      }
      hoverLatest.current = cell;
      schedule();
    },
    [schedule]
  );
  const setStroke = useCallback(
    (on: boolean) => {
      setStrokeState(on);
      flush();
    },
    [flush]
  );
  const reset = useCallback(() => {
    latest.current = zeroMonzo();
    touchRef.current();
    flush();
  }, [flush]);
  useEffect(
    () => () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      commitRef.current(latest.current);
    },
    []
  );
  return { monzo, latest, set, reset, hover, setHover, stroke, setStroke };
}

/** True when two monzos have the same exponents. */
export const sameMonzo = (a: MonzoExps, b: MonzoExps): boolean =>
  MONZO_PRIMES.every((p) => clampExp(a[p]) === clampExp(b[p]));
