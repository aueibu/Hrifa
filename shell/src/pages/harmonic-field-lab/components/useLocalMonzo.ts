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
}

export function useLocalMonzo(
  initial: MonzoExps,
  /** The picker is closing: store the final value in the lab state. */
  onCommit: (monzo: MonzoExps) => void,
  /** Any change (clears a stale message in the lab state). */
  onTouch: () => void
): LocalMonzo {
  const [monzo, setMonzo] = useState(initial);
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
      } else if (frame.current === null) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          setMonzo(latest.current);
        });
      }
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
  return { monzo, latest, set, reset };
}

/** True when two monzos have the same exponents. */
export const sameMonzo = (a: MonzoExps, b: MonzoExps): boolean =>
  MONZO_PRIMES.every((p) => clampExp(a[p]) === clampExp(b[p]));
