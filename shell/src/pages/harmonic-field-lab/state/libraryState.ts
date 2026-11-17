/**
 * M7c-a (H-30): the chord library dialog's state that outlives the dialog. It lives in `settings.v1` (`ui.libFilters`,
 * `ui.libChecked`, `ui.libOpen`, `ui.libCmp`), so it survives closing the dialog and reloading the page; the dialog's own
 * open state is not stored. Everything is additive: a stored value that is missing or bad falls back to its default. A
 * stored entry key or shape id that the library no longer has is dropped when the library is read (done at use, see
 * `knownCheckedKeys` in the lib), not here, because the keys depend on the repeat.
 *
 * Pure: no React, no storage. Types, defaults, sanitizing and the list edits the reducer uses.
 */

/** What the ring compares a chord against: every note of the field, or only the selected subset. */
export type LibCmp = 'field' | 'subset';
export const LIB_CMPS: readonly LibCmp[] = ['field', 'subset'];

/** The dialog's search text and filters (the names match the lib's `LibraryFilter`) plus Checked only. */
export interface LibFilters {
  search: string;
  /** Cardinality (note count) min and max; null = no limit. */
  notesMin: number | null;
  notesMax: number | null;
  oddMax: number | null;
  primeMax: number | null;
  /** A family name, '' = all. */
  family: string;
  /** List only the shapes that hold a checked row, and in them only the checked rows. */
  checkedOnly: boolean;
}

/** The most rows kept checked (a Check beyond it replaces the oldest, as since M7). */
export const MAX_LIB_CHECKED = 40;
/** The most opened shapes kept (the library has about 313 shapes). */
export const MAX_LIB_OPEN = 400;
/** The longest stored entry key or shape id (an 8-note shape id is about 90 characters). */
export const MAX_LIB_KEY = 400;
const MAX_SEARCH = 80;
const MAX_FAMILY = 40;
const MAX_LIMIT = 100000;

export const defaultLibFilters = (): LibFilters => ({
  search: '',
  notesMin: null,
  notesMax: null,
  oddMax: null,
  primeMax: null,
  family: '',
  checkedOnly: false,
});

/** A whole number from 1 to the cap, else null (an empty box, zero, a negative, a fraction, text). */
const limit = (x: unknown): number | null =>
  typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= MAX_LIMIT ? x : null;

/** Coerce whatever is stored into valid filters, field by field. */
export function sanitizeLibFilters(raw: unknown): LibFilters {
  const d = defaultLibFilters();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return d;
  }
  const r = raw as Record<string, unknown>;
  return {
    search: typeof r.search === 'string' ? r.search.slice(0, MAX_SEARCH) : d.search,
    notesMin: limit(r.notesMin),
    notesMax: limit(r.notesMax),
    oddMax: limit(r.oddMax),
    primeMax: limit(r.primeMax),
    family: typeof r.family === 'string' ? r.family.slice(0, MAX_FAMILY) : d.family,
    checkedOnly: typeof r.checkedOnly === 'boolean' ? r.checkedOnly : d.checkedOnly,
  };
}

/** A list of short strings: only strings of 1 to `MAX_LIB_KEY` characters, duplicates dropped (first kept), at most `max` (the LAST ones when it is longer: the newest). */
export function sanitizeKeyList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k === 'string' && k.length > 0 && k.length <= MAX_LIB_KEY && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out.slice(Math.max(0, out.length - max));
}

/** Two filter records are the same. */
export function sameLibFilters(a: LibFilters, b: LibFilters): boolean {
  return (
    a.search === b.search &&
    a.notesMin === b.notesMin &&
    a.notesMax === b.notesMax &&
    a.oddMax === b.oddMax &&
    a.primeMax === b.primeMax &&
    a.family === b.family &&
    a.checkedOnly === b.checkedOnly
  );
}

/**
 * Checks `keys` (a Check on a row or a shape): each goes to the end of the list (a row already checked moves to the end),
 * and past `max` the oldest are dropped. The same array when nothing changes.
 */
export function addChecked(
  list: readonly string[],
  keys: readonly string[],
  max: number = MAX_LIB_CHECKED
): readonly string[] {
  const fresh = [...new Set(keys)];
  if (!fresh.length) {
    return list;
  }
  const next = [...list.filter((k) => !fresh.includes(k)), ...fresh];
  return next.slice(Math.max(0, next.length - max));
}

/** Opens or closes a shape (`open` omitted toggles). The same array when nothing changes. */
export function setOpen(list: readonly string[], id: string, open?: boolean): readonly string[] {
  const has = list.includes(id);
  const want = open ?? !has;
  if (want === has) {
    return list;
  }
  return want
    ? [...list, id].slice(Math.max(0, list.length + 1 - MAX_LIB_OPEN))
    : list.filter((k) => k !== id);
}
