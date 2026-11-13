/**
 * Computer keys to scale slots. The dock's keys, left to right, are slots 0, 1, 2 ...; slot i is degree `i mod N` of the
 * subset, `floor(i / N)` repeats up (so with 7 notes the eighth key is the root one repeat higher). Same order as the
 * frozen prototype: the bottom row, then the home row, then the top row.
 */
export const KEYS = "zxcvbnm,./asdfghjkl;'qwertyuiop[]";

/** Slot of a keyboard key (`event.key`, case-insensitive), or -1. */
export const slotOfKey = (key: string): number =>
  key.length === 1 ? KEYS.indexOf(key.toLowerCase()) : -1;

/** Degree and repeat of a slot in a subset of `n` notes (null for no notes or a bad slot). */
export function slotTarget(slot: number, n: number): { deg: number; oct: number } | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= KEYS.length || n < 1) {
    return null;
  }
  return { deg: slot % n, oct: Math.floor(slot / n) };
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

/** `event.code` of each key in KEYS, so a slot follows the physical key whatever Shift or the layout does to `event.key`. */
const CODE_OF: Record<string, string> = {
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  ';': 'Semicolon',
  "'": 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
};
const CODES: readonly string[] = [...KEYS].map((k) => CODE_OF[k] ?? `Key${k.toUpperCase()}`);

/**
 * The slot of a keyboard event: by `code` (the physical key) when there is one, else by `key`. Press and release must use
 * the same identity (`keyId`), because Shift changes `key` between keydown and keyup (',' becomes '<').
 */
export function slotOfEvent(e: { code?: string; key: string }): number {
  const byCode = e.code ? CODES.indexOf(e.code) : -1;
  return byCode >= 0 ? byCode : slotOfKey(e.key);
}

/** Identity of the physical key for releasing: its code, else its lower-cased key. */
export const keyId = (e: { code?: string; key: string }): string => e.code || e.key.toLowerCase();
