/**
 * Sorting the chord library by a column header. Pure. The list is a mix of single rows and shape groups: the whole list is
 * sorted as one, a group placed by its first (root position) entry, and a group's own rows sorted by the same column. A tie
 * keeps the library's own order (a stable sort).
 *
 * The Ratio header has two orders in its cycle: by the numbers of the ratio read one after the other (`4:5:6` before
 * `4:5:6:7` before `5:6:7` before `10:12:15`), and "simplest first" (the smallest largest number, then the shorter chord).
 */
export type LibSortKey = 'ratio' | 'simplest' | 'name' | 'notes' | 'odd' | 'prime';
export type LibSortDir = 'asc' | 'desc';
export interface LibSort {
  key: LibSortKey;
  dir: LibSortDir;
}
/** The columns whose header can be clicked. */
export type LibSortColumn = 'ratio' | 'name' | 'notes' | 'odd' | 'prime';

const KEYS: readonly LibSortKey[] = ['ratio', 'simplest', 'name', 'notes', 'odd', 'prime'];

/** What a header click does: none, then ascending, then descending, then none again. The Ratio header goes on to its second order before it returns to none. */
export function nextSort(cur: LibSort | null, column: LibSortColumn): LibSort | null {
  const cycle: LibSort[] =
    column === 'ratio'
      ? [
          { key: 'ratio', dir: 'asc' },
          { key: 'ratio', dir: 'desc' },
          { key: 'simplest', dir: 'asc' },
          { key: 'simplest', dir: 'desc' },
        ]
      : [
          { key: column, dir: 'asc' },
          { key: column, dir: 'desc' },
        ];
  const at = cur ? cycle.findIndex((s) => s.key === cur.key && s.dir === cur.dir) : -1;
  return at < 0 ? cycle[0] : (cycle[at + 1] ?? null);
}

/** The column a sort belongs to (`simplest` is the Ratio column's second order). */
export const columnOf = (k: LibSortKey): LibSortColumn => (k === 'simplest' ? 'ratio' : k);

/** A stored sort, or null when it is missing or damaged. */
export function sanitizeLibSort(raw: unknown): LibSort | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  return KEYS.includes(o.key as LibSortKey) && (o.dir === 'asc' || o.dir === 'desc')
    ? { key: o.key as LibSortKey, dir: o.dir }
    : null;
}

export interface SortableEntry {
  text: string;
  names: readonly string[];
  notes: number;
  oddLimit: number;
  primeLimit: number;
}

/** The numbers of a ratio text: `4:5:6` gives 4, 5, 6; an undertone `1/(4:5:6)` gives the numbers inside the brackets. */
export function ratioNumbers(text: string): number[] {
  const inner = /^1\/\((.*)\)$/.exec(text)?.[1] ?? text;
  return inner
    .split(':')
    .map((p) => Number(p))
    .filter((n) => Number.isFinite(n));
}

function compareNumbers(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

/** `a` against `b` ascending in the sort's column (the direction is applied by the caller). */
function ascending(a: SortableEntry, b: SortableEntry, key: LibSortKey): number {
  switch (key) {
    case 'ratio':
      return compareNumbers(ratioNumbers(a.text), ratioNumbers(b.text));
    case 'simplest': {
      const na = ratioNumbers(a.text);
      const nb = ratioNumbers(b.text);
      return Math.max(...na) - Math.max(...nb) || na.length - nb.length || compareNumbers(na, nb);
    }
    case 'name':
      return (a.names[0] ?? '').localeCompare(b.names[0] ?? '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    case 'notes':
      return a.notes - b.notes;
    case 'odd':
      return a.oddLimit - b.oddLimit;
    default:
      return a.primeLimit - b.primeLimit;
  }
}

export function compareEntries(a: SortableEntry, b: SortableEntry, s: LibSort): number {
  const c = ascending(a, b, s.key);
  return s.dir === 'desc' ? -c : c;
}

/** `items` ordered by `s` (a stable sort: ties keep their order); the same array order when `s` is null. */
function sortedBy<T>(
  items: readonly T[],
  entryOf: (t: T) => SortableEntry,
  s: LibSort | null
): T[] {
  if (!s) {
    return [...items];
  }
  return items
    .map((t, i) => ({ t, i }))
    .sort((x, y) => compareEntries(entryOf(x.t), entryOf(y.t), s) || x.i - y.i)
    .map((x) => x.t);
}

/**
 * The shapes ordered by `s`. A shape stays put as a unit, placed by its root position entry (`entries[0]`); its own entries are sorted
 * by the same column, and `root` records the root position entry for the heading (the sorted `entries` may start elsewhere).
 */
export function sortShapes<E extends SortableEntry, T extends { entries: E[] }>(
  shapes: readonly T[],
  s: LibSort | null
): (T & { root: E })[] {
  const withRoot = shapes.map((sh) => ({ ...sh, root: sh.entries[0] }));
  if (!s) {
    return withRoot;
  }
  return sortedBy(withRoot, (sh) => sh.root, s).map((sh) => ({
    ...sh,
    entries: sortedBy(sh.entries, (e) => e, s),
  }));
}
