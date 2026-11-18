/**
 * The Relative picker's interval pin bar (M8f, H-35). Two ordered lists of exact ratio texts (`81/80`), one for the Rings and Near
 * views and one for the Monzo view, at most `MAX_PINS` each, no duplicates. A monzo pin is stored as the ratio of the painted
 * exponents (exact: BigInt numerals) and shown as its bra-ket `[-4 4 -1>`. Pure helpers; the page keeps the lists in `settings.v1`.
 */
import { MONZO_PRIMES, fmtRatio, parseInterval } from '../../../lib/harmonic-field';

export const MAX_PINS = 128;
/** The grid is this many cards wide. */
export const PIN_COLS = 8;

export type PinKind = 'ring' | 'monzo';
export interface Pins {
  ring: string[];
  monzo: string[];
}

export const emptyPins = (): Pins => ({ ring: [], monzo: [] });

/** The canonical `p/q` (lowest terms) of a stored text, or null when it is not an exact positive ratio. */
export function canonicalPin(text: unknown): string | null {
  if (typeof text !== 'string' || text.length > 400 || !/^\d+\/\d+$/.test(text)) {
    return null;
  }
  const n = parseInterval(text);
  if (!n || !n.m) {
    return null;
  }
  const t = fmtRatio(n);
  return t === text ? t : null;
}

/** A monzo pin must use only the dialed primes (2 to 41) with exponents of at most 12 either way. */
export function monzoOfPin(text: string): number[] | null {
  const n = parseInterval(text);
  if (!n || !n.m) {
    return null;
  }
  const out: number[] = MONZO_PRIMES.map(() => 0);
  for (const key of Object.keys(n.m)) {
    const at = MONZO_PRIMES.findIndex((p) => String(p) === key);
    if (at < 0 || Math.abs(n.m[key]) > 12) {
      return null;
    }
    out[at] = n.m[key];
  }
  return out;
}

/** The bra-ket text of a monzo pin: the exponents from 2 up to the largest prime used, `[-4 4 -1>`. Null when it is not a monzo. */
export function braKet(text: string): string | null {
  const v = monzoOfPin(text);
  if (!v) {
    return null;
  }
  let last = v.length - 1;
  while (last > 0 && v[last] === 0) {
    last--;
  }
  return `[${v.slice(0, last + 1).join(' ')}>`;
}

/** One list as read from storage: bad or repeated entries dropped, at most `MAX_PINS` (kind `monzo` also needs a dialable monzo). */
export function sanitizePinList(raw: unknown, kind: PinKind): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of raw) {
    const t = canonicalPin(e);
    if (t === null || seen.has(t) || (kind === 'monzo' && monzoOfPin(t) === null)) {
      continue;
    }
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_PINS) {
      break;
    }
  }
  return out;
}

/** `settings.v1` ui `pins`: absent or damaged reads as two empty lists. */
export function sanitizePins(raw: unknown): Pins {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return { ring: sanitizePinList(o.ring, 'ring'), monzo: sanitizePinList(o.monzo, 'monzo') };
}

export type PinAdd =
  | { result: 'added'; list: string[] }
  | { result: 'duplicate'; list: string[]; at: number }
  | { result: 'full'; list: string[] };

/** Pin a ratio text at the end: a repeat adds nothing (and says where it is), a full list refuses (nothing is dropped). */
export function addPin(list: readonly string[], text: string): PinAdd {
  const at = list.indexOf(text);
  if (at >= 0) {
    return { result: 'duplicate', list: list as string[], at };
  }
  if (list.length >= MAX_PINS) {
    return { result: 'full', list: list as string[] };
  }
  return { result: 'added', list: [...list, text] };
}

/** Move the card at `from` to slot `to`; the cards in between shift by one. */
export function movePin(list: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= list.length) {
    return list as string[];
  }
  const t = Math.max(0, Math.min(list.length - 1, to));
  const out = list.slice();
  const [x] = out.splice(from, 1);
  out.splice(t, 0, x);
  return out;
}

/**
 * Move the card at `from` into the gap before card `gap` (0 = first, `list.length` = last), the cards in between shift by one.
 * The gaps on either side of the card itself change nothing.
 */
export function insertPin(list: readonly string[], from: number, gap: number): string[] {
  if (from < 0 || from >= list.length || gap === from || gap === from + 1) {
    return list as string[];
  }
  const g = Math.max(0, Math.min(list.length, gap));
  return movePin(list, from, g > from ? g - 1 : g);
}

/** Trade the places of two cards; nothing else moves. */
export function swapPins(list: readonly string[], a: number, b: number): string[] {
  if (a === b || a < 0 || b < 0 || a >= list.length || b >= list.length) {
    return list as string[];
  }
  const out = list.slice();
  out[a] = list[b];
  out[b] = list[a];
  return out;
}

export const removePin = (list: readonly string[], at: number): string[] =>
  list.filter((_, i) => i !== at);

/** Clear one row of the grid (`PIN_COLS` cards). */
export const clearRow = (list: readonly string[], row: number): string[] =>
  list.filter((_, i) => Math.floor(i / PIN_COLS) !== row);
