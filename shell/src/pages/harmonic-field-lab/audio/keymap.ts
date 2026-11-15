/**
 * Computer keys to scale slots (melody keys v2, M8b). The dock's keys, left to right, are slots 0, 1, 2 ...; slot i is degree
 * `i mod N` of the subset, `floor(i / N)` repeats up (so with 7 notes the eighth key is the root one repeat higher). The
 * bottom row `z x c v b n m`, then the home row `a s d f g h j k l`: 16 slots. `,` and `.` are the octave (repeat) shift, not
 * notes; the top row is the chord row (`CHORD_KEYS`).
 */
export const KEYS = 'zxcvbnmasdfghjkl';

/** The chord keys: the first ten shelf slots of the current page, in shelf order (Chords and Split modes). */
export const CHORD_KEYS = 'qwertyuiop';
/** Shelf slots per page; `[` and `]` page by this many. */
export const CHORD_PAGE = CHORD_KEYS.length;

/** What the computer keys do: melody notes, shelf chords, or both (melody on the bottom two rows, chords on the top row). */
export type KeyboardMode = 'notes' | 'chords' | 'split';
export const KEYBOARD_MODES: readonly KeyboardMode[] = ['notes', 'chords', 'split'];

/** The melody shift is clamped to this many repeats either way (the voice engine itself only needs a positive finite Hz). */
export const MAX_SHIFT = 4;
export const clampShift = (n: number): number =>
  Number.isFinite(n) ? Math.min(MAX_SHIFT, Math.max(-MAX_SHIFT, Math.trunc(n))) : 0;

/** True when this mode plays melody notes from the bottom two rows. */
export const playsMelody = (m: KeyboardMode): boolean => m !== 'chords';
/** True when this mode plays shelf chords from the top row. */
export const playsChords = (m: KeyboardMode): boolean => m !== 'notes';

/** Slot of a keyboard key (`event.key`, case-insensitive), or -1. */
export const slotOfKey = (key: string): number =>
  key.length === 1 ? KEYS.indexOf(key.toLowerCase()) : -1;

/** Degree and repeat of a slot in a subset of `n` notes (null for no notes or a bad slot). `shift` is the melody shift in repeats. */
export function slotTarget(
  slot: number,
  n: number,
  shift = 0
): { deg: number; oct: number } | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= KEYS.length || n < 1) {
    return null;
  }
  return { deg: slot % n, oct: Math.floor(slot / n) + shift };
}

/** How many dock keys to draw for `n` scale notes: the notes plus the repeat, capped at the keys we have. */
export const dockKeyCount = (n: number): number => Math.min(KEYS.length, Math.max(0, n) + 1);

/** True when the event target is somewhere the user is typing, so a letter must not play a note. */
export function isTyping(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  if (!t || !t.tagName) {
    return false;
  }
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) {
    return true;
  }
  if (t.tagName === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return type !== 'checkbox' && type !== 'range' && type !== 'radio' && type !== 'button';
  }
  return false;
}

/** `event.code` of each melody key, so a slot follows the physical key whatever Shift or the layout does to `event.key`. */
const CODES: readonly string[] = [...KEYS].map((k) => `Key${k.toUpperCase()}`);
const CHORD_CODES: readonly string[] = [...CHORD_KEYS].map((k) => `Key${k.toUpperCase()}`);

/**
 * The slot of a keyboard event: by `code` (the physical key) when there is one, else by `key`. Press and release must use
 * the same identity (`keyId`), because Shift changes `key` between keydown and keyup.
 */
export function slotOfEvent(e: { code?: string; key: string }): number {
  const byCode = e.code ? CODES.indexOf(e.code) : -1;
  return byCode >= 0 ? byCode : slotOfKey(e.key);
}

/** The chord key (0 to 9, Q to P) of a keyboard event, or -1. */
export function chordSlotOfEvent(e: { code?: string; key: string }): number {
  const byCode = e.code ? CHORD_CODES.indexOf(e.code) : -1;
  if (byCode >= 0) {
    return byCode;
  }
  return e.key.length === 1 ? CHORD_KEYS.indexOf(e.key.toLowerCase()) : -1;
}

/** -1 for `,` (shift down), +1 for `.` (shift up), 0 otherwise; by physical code, else by key. */
export function shiftOfEvent(e: { code?: string; key: string }): number {
  if (e.code === 'Comma' || (!e.code && e.key === ',')) {
    return -1;
  }
  if (e.code === 'Period' || (!e.code && e.key === '.')) {
    return 1;
  }
  return 0;
}

/** -1 for `[` (previous shelf page), +1 for `]` (next), 0 otherwise. */
export function pageOfEvent(e: { code?: string; key: string }): number {
  if (e.code === 'BracketLeft' || (!e.code && e.key === '[')) {
    return -1;
  }
  if (e.code === 'BracketRight' || (!e.code && e.key === ']')) {
    return 1;
  }
  return 0;
}

/** Identity of the physical key for releasing: its code, else its lower-cased key. */
export const keyId = (e: { code?: string; key: string }): string => e.code || e.key.toLowerCase();
