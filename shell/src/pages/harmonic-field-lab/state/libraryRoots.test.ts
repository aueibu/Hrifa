/**
 * M7d: "Found on N roots" data and the pin rules (SCENARIOS.M7d.md rows 1, 2, 6, 7, 8, 9, 10, 12). The field is the 5-limit
 * major scale; the numbers are asserted against the real finder (rounded to one decimal, as the table writes them).
 */
import { describe, expect, it } from 'vitest';
import {
  libraryEntries,
  parseInterval,
  type LibraryEntry,
  type Note,
  type RelNote,
} from '../../../lib/harmonic-field';
import { errorStats } from './chordSort';
import { MAX_CHORDS } from './derive';
import { checkEntry } from './libraryCheck';
import {
  chosenRoot,
  keepRoot,
  rootIndices,
  rootsTitle,
  shownRoots,
  togglePin,
} from './libraryRoots';

const entries = libraryEntries(1200);
const entry = (t: string): LibraryEntry => entries.find((e) => e.text === t) as LibraryEntry;

const baseOf = (xs: string[]) => ({
  repC: 1200,
  ratios: xs,
  rel: xs.map((s, i) => ({ ...(parseInterval(s) as Note), src: i }) as RelNote),
});
const major5 = baseOf(['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8']);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** `root worst avg` of each hit, one decimal. */
const rows = (text: string, tol: number, base = major5) => {
  const v = shownRoots(base, entry(text), tol);
  return v.kind === 'found' ? v.hits.map((h) => [h.root, r1(h.worst), r1(h.avg)]) : v.kind;
};

describe('CheckHit carries the best voicing and its worst and avg', () => {
  it('worst is maxErr, avg is errorStats over the non-root notes, errors start with the root (0)', () => {
    const r = checkEntry(major5, entry('4:5:6:7'), 90)!;
    for (const h of r.hits) {
      expect(h.errors).toHaveLength(4);
      expect(h.errors[0]).toBe(0);
      expect(h.worst).toBeCloseTo(h.maxErr, 9);
      expect(h.avg).toBeCloseTo(errorStats(h.errors).avg, 9);
    }
  });

  it('a root with several voicings keeps the errors of its best (smallest maxErr) one', () => {
    const b = baseOf(['1/1', '13/8', '5/3']);
    const r = checkEntry(b, { text: '3:5' }, 50)!;
    const h = r.hits.find((x) => x.rootIdx === 0)!;
    expect(h.maxErr).toBeLessThan(1e-6);
    expect(h.errors).toHaveLength(2);
    expect(h.worst).toBeLessThan(1e-6);
    expect(h.avg).toBeLessThan(1e-6);
  });
});

describe('shownRoots (rows 1, 2, 6, 7, 8)', () => {
  it('row 1: tolerance 0, Minor Triad: 5/4 and 5/3, both exact', () => {
    expect(rows('10:12:15', 0)).toEqual([
      ['5/4', 0, 0],
      ['5/3', 0, 0],
    ]);
  });

  it('row 2: tolerance 25: 9/8 joins at 21.5 / 21.5, subset order low to high', () => {
    expect(rows('10:12:15', 25)).toEqual([
      ['9/8', 21.5, 21.5],
      ['5/4', 0, 0],
      ['5/3', 0, 0],
    ]);
  });

  it('row 6: tolerance 90: 4:5:6:7 on five roots', () => {
    expect(rows('4:5:6:7', 90)).toEqual([
      ['1/1', 84.5, 28.2],
      ['5/4', 70.7, 39.8],
      ['4/3', 63, 21],
      ['3/2', 27.3, 9.1],
      ['5/3', 70.7, 39.8],
    ]);
  });

  it('row 7: tolerance 0: 4:5:6:7 is not found (7/4 is not in the field)', () => {
    expect(shownRoots(major5, entry('4:5:6:7'), 0)).toEqual({ kind: 'none', truncated: false });
  });

  it('row 8: tolerance 30: one root, 3/2 at 27.3 / 9.1', () => {
    expect(rows('4:5:6:7', 30)).toEqual([['3/2', 27.3, 9.1]]);
  });

  it('row 9: fewer than 2 or more than 128 notes is the range view; row 10: a folding chord is the fold view', () => {
    expect(shownRoots(baseOf(['1/1']), entry('4:5:6'), 10)).toEqual({ kind: 'range' });
    const many = baseOf(Array.from({ length: MAX_CHORDS + 1 }, (_, i) => `${100 + i}/100`));
    expect(shownRoots(many, entry('4:5:6'), 1)).toEqual({ kind: 'range' });
    expect(shownRoots(major5, entry('1:2:3'), 50)).toEqual({ kind: 'fold' });
    // a folding chord on a subset out of range is still the fold note (the finder never searches it)
    expect(shownRoots(baseOf(['1/1']), entry('1:2:3'), 50)).toEqual({ kind: 'fold' });
  });

  it('the roots table title counts the roots', () => {
    expect(rootsTitle(1)).toBe('In your subset: found on 1 root');
    expect(rootsTitle(2)).toBe('In your subset: found on 2 roots');
    expect(rootsTitle(5)).toBe('In your subset: found on 5 roots');
  });
});

describe('the pin rules (row 12)', () => {
  const at = (tol: number, base = major5) => shownRoots(base, entry('10:12:15'), tol);

  it('rootIndices lists the field indices of the roots, none for any other view', () => {
    expect(rootIndices(at(25))).toEqual([1, 2, 5]);
    expect(rootIndices(at(0))).toEqual([2, 5]);
    expect(rootIndices(shownRoots(major5, entry('4:5:6:7'), 0))).toEqual([]);
    expect(rootIndices(null)).toEqual([]);
  });

  it('a pinned root stays while it is found, and is dropped when it is not', () => {
    // 5/3 (index 5) is found at 0 and at 25
    expect(keepRoot(5, at(0))).toBe(5);
    expect(keepRoot(5, at(25))).toBe(5);
    // 9/8 (index 1) is found at 25, not at 0
    expect(keepRoot(1, at(25))).toBe(1);
    expect(keepRoot(1, at(0))).toBeNull();
    // the subset loses 5/3: the pin is gone
    const noFifth = baseOf(['1/1', '9/8', '5/4', '4/3', '3/2', '15/8']);
    expect(keepRoot(5, at(0, noFifth))).toBeNull();
    expect(keepRoot(null, at(0))).toBeNull();
    expect(keepRoot(5, null)).toBeNull();
  });

  it('the chosen root is the hovered one, else the pinned one, else none (the default rule)', () => {
    const v = at(25);
    expect(chosenRoot(null, null, v)).toBeNull();
    expect(chosenRoot(null, 5, v)).toBe(5);
    expect(chosenRoot(1, 5, v)).toBe(1);
    // a hovered root that is not found is ignored; the pin still applies
    expect(chosenRoot(3, 5, v)).toBe(5);
    expect(chosenRoot(3, 4, v)).toBeNull();
  });

  it('a click pins a root, a second click on it unpins, a click on another moves the pin', () => {
    expect(togglePin(null, 5)).toBe(5);
    expect(togglePin(5, 5)).toBeNull();
    expect(togglePin(5, 2)).toBe(2);
  });
});
