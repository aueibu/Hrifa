import { describe, expect, it } from 'vitest';
import {
  columnOf,
  nextSort,
  ratioNumbers,
  sanitizeLibSort,
  sortShapes,
  type LibSort,
  type SortableEntry,
} from './librarySort';

const e = (text: string, name: string, notes = 3, odd = 5, prime = 5): SortableEntry => ({
  text,
  names: [name],
  notes,
  oddLimit: odd,
  primeLimit: prime,
});

describe('ratioNumbers', () => {
  it('reads the numbers of a ratio and of an undertone', () => {
    expect(ratioNumbers('4:5:6')).toEqual([4, 5, 6]);
    expect(ratioNumbers('1/(4:5:6:7)')).toEqual([4, 5, 6, 7]);
  });
});

describe('the click cycle', () => {
  it('a plain column goes ascending, descending, none', () => {
    const a = nextSort(null, 'notes');
    expect(a).toEqual({ key: 'notes', dir: 'asc' });
    const d = nextSort(a, 'notes');
    expect(d).toEqual({ key: 'notes', dir: 'desc' });
    expect(nextSort(d, 'notes')).toBeNull();
  });

  it('Ratio goes through both its orders, then none', () => {
    const steps: (LibSort | null)[] = [];
    let cur: LibSort | null = null;
    for (let i = 0; i < 5; i++) {
      cur = nextSort(cur, 'ratio');
      steps.push(cur);
    }
    expect(steps).toEqual([
      { key: 'ratio', dir: 'asc' },
      { key: 'ratio', dir: 'desc' },
      { key: 'simplest', dir: 'asc' },
      { key: 'simplest', dir: 'desc' },
      null,
    ]);
  });

  it('a click on another column starts that column from the top', () => {
    expect(nextSort({ key: 'notes', dir: 'desc' }, 'odd')).toEqual({ key: 'odd', dir: 'asc' });
    expect(columnOf('simplest')).toBe('ratio');
  });
});

describe('sanitizeLibSort', () => {
  it('keeps a valid sort and drops anything else', () => {
    expect(sanitizeLibSort({ key: 'prime', dir: 'desc' })).toEqual({ key: 'prime', dir: 'desc' });
    for (const bad of [null, 3, 'x', {}, { key: 'nope', dir: 'asc' }, { key: 'odd', dir: 'up' }]) {
      expect(sanitizeLibSort(bad)).toBeNull();
    }
  });
});

describe('sortShapes', () => {
  const shapes = [
    {
      id: 'a',
      entries: [
        e('10:12:15', 'Minor Triad', 3, 15, 5),
        e('12:15:20', 'Minor Triad 1st inversion', 3, 5, 5),
      ],
    },
    { id: 'b', entries: [e('4:5:6:7', 'Harmonic Seventh', 4, 7, 7)] },
    { id: 'c', entries: [e('4:5:6', 'Major Triad', 3, 5, 5)] },
    { id: 'd', entries: [e('5:6:7', 'Subminor Triad', 3, 7, 7)] },
  ];
  const ids = (s: LibSort | null) => sortShapes(shapes, s).map((x) => x.id);

  it("without a sort the order is the library's and root is the first entry", () => {
    expect(ids(null)).toEqual(['a', 'b', 'c', 'd']);
    expect(sortShapes(shapes, null)[0].root.text).toBe('10:12:15');
  });

  it('Ratio reads the numbers one after the other: 4:5:6, 4:5:6:7, 5:6:7, 10:12:15', () => {
    expect(ids({ key: 'ratio', dir: 'asc' })).toEqual(['c', 'b', 'd', 'a']);
    expect(ids({ key: 'ratio', dir: 'desc' })).toEqual(['a', 'd', 'b', 'c']);
  });

  it('simplest first: the smallest largest number, then the shorter chord', () => {
    expect(ids({ key: 'simplest', dir: 'asc' })).toEqual(['c', 'd', 'b', 'a']);
  });

  it('Name is alphabetical, Notes numeric, ties keep the library order', () => {
    expect(ids({ key: 'name', dir: 'asc' })).toEqual(['b', 'c', 'a', 'd']);
    expect(ids({ key: 'notes', dir: 'asc' })).toEqual(['a', 'c', 'd', 'b']);
    expect(ids({ key: 'odd', dir: 'desc' })).toEqual(['a', 'b', 'd', 'c']);
  });

  it('a group is placed by its root entry; its own rows are sorted by the same column and root stays the root entry', () => {
    const out = sortShapes(shapes, { key: 'odd', dir: 'asc' });
    const a = out.find((x) => x.id === 'a')!;
    expect(a.root.text).toBe('10:12:15');
    expect(a.entries.map((x) => x.text)).toEqual(['12:15:20', '10:12:15']);
    expect(out.map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});
