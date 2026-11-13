/**
 * Parity between the engine and the human's chord sheet
 * (arcs/workbench/reference/any-chord-voice-relations.csv). For the fixed note 3 and each
 * chord type, the sheet lists the chord's pitch classes when note 3 is the root, third, ...
 * thirteenth (columns are FUNCTIONAL slots: sus2 puts its second tone in the "3" column).
 * Neither side is silently corrected: every row that does not match is in KNOWN_GAPS.
 */
import { describe, expect, it } from 'vitest';
import csv from '../../../../arcs/workbench/reference/any-chord-voice-relations.csv?raw';
import { chordsWithCommonTone } from './chords';
import { CHORD_LIBRARY_12 } from './chordTemplates';
import { chromaticSet } from './pitchSet';

const FIXED = 3;
const BLOCK_START = 16;
const BLOCK_WIDTH = 11;
const SLOTS = 7;

type Cell = number | null;

interface SheetRow {
  name: string;
  /** Interval (0..11) per functional slot R,3,5,7,9,11,13; null where the slot is absent. */
  intervals: Cell[];
  /** blocks[b]: pitch classes per slot when FIXED sits in functional slot b (null = gap). */
  blocks: (Cell[] | null)[];
}

const cell = (text: string | undefined): Cell => {
  const t = (text ?? '').trim();
  return t === '' || t === '-' ? null : Number(t);
};

function parse(): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const cells = line.split(',');
    const name = (cells[2] ?? '').trim();
    if (!name) {
      continue;
    }
    const intervals = cells.slice(5, 5 + SLOTS).map(cell);
    const blocks = Array.from({ length: SLOTS }, (_, b) => {
      const start = BLOCK_START + b * BLOCK_WIDTH;
      const values = cells.slice(start, start + SLOTS).map(cell);
      return values.every((v) => v === null) ? null : values;
    });
    rows.push({ name, intervals, blocks });
  }
  return rows;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const present = (values: Cell[]): number[] => values.filter((v): v is number => v !== null);
const slotsOf = (values: Cell[]): number[] => values.flatMap((v, i) => (v === null ? [] : [i]));
const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

/**
 * The 12-EDO template for `intervals` (mod 12, in slot order): an exact stack match first,
 * then, only if none, one with the same interval set in another stacking order (6/9). The
 * order matters: m7b11 (0 3 7 10 4) and 7#9 (0 4 7 10 3) are the same pitch-class set.
 */
function matchTemplate(intervals: number[]) {
  const stack = (t: { steps: readonly number[] }) => t.steps.map(mod12);
  const exact = CHORD_LIBRARY_12.find((t) => stack(t).join() === intervals.join());
  const want = sorted(intervals).join();
  return exact ?? CHORD_LIBRARY_12.find((t) => sorted(stack(t)).join() === want);
}

/** Template the sheet NAME is meant to describe, for names that disagree with their numbers. */
const NAMED_AS: Record<string, string> = {
  Sus4: 'sus4',
  'Dominant 7 b5 #9': '7b5s9',
  'Dominant 7 #5 #9': '7s5s9',
};

const KNOWN_GAPS: { name: string; reason: string }[] = [
  {
    name: 'Sus4',
    reason: 'sheet numbers (0 4 7) are a major triad, not sus4 (0 5 7); it matches "major"',
  },
  { name: 'French Sixth', reason: 'augmented sixth: no root tone, no template' },
  { name: 'Italian Sixth', reason: 'augmented sixth: no root tone, no template' },
  { name: 'German Sixth', reason: 'augmented sixth: no root tone, no template' },
  {
    name: 'Dominant 7 b5 #9',
    reason:
      'sheet numbers (0 4 7 10 3) are 7#9, not 7b5#9 (0 4 6 10 15); duplicate of the Dominant #9 row',
  },
  {
    name: 'Dominant 7 #5 #9',
    reason:
      'sheet numbers (0 4 8 11 3) have a major 7th (maj7#5#9), not 7#5#9 (0 4 8 10 15); no template',
  },
  { name: '[0 1 4 6]', reason: 'pitch-class set: no root tone, no template' },
  { name: '[0 1 4 7]', reason: 'pitch-class set: no root tone, no template' },
  { name: 'WT [0 2 4 6]', reason: 'pitch-class set: no root tone, no template' },
  { name: '(I+bVI) Major b6 #9', reason: 'no template (out of scope for M6b)' },
];

/** Templates whose engine pitch classes equal the sheet's as sets but not in stack order. */
const KNOWN_ORDER_DIFFERENCES = ['6/9'];

/** Sheet slot (0-based: R,3,5,7,9,11,13) to the engine role of that column's tone. */
const EXTENSION_ROLES: Record<number, string> = { 4: '2nd', 5: '4th', 6: '6th' };

const rows = parse();
const engineChords = chordsWithCommonTone(chromaticSet(12), FIXED, { tier: 'extended' }).flatMap(
  (col) => col.chords
);
const gapNames = new Set(KNOWN_GAPS.map((gap) => gap.name));

describe('chord sheet parity', () => {
  it('parses the sheet layout (7 blocks of 11 columns)', () => {
    expect(rows.length).toBeGreaterThan(40);
    const major = rows.find((row) => row.name === 'Major');
    expect(major?.intervals).toEqual([0, 4, 7, null, null, null, null]);
    expect(major?.blocks[0]).toEqual([3, 7, 10, null, null, null, null]);
    expect(major?.blocks[1]).toEqual([11, 3, 6, null, null, null, null]);
  });

  it('reports exactly the known gaps as unmatched rows', () => {
    const gaps: string[] = [];
    for (const row of rows) {
      const template =
        row.intervals[0] === null ? undefined : matchTemplate(present(row.intervals));
      if (!template || (NAMED_AS[row.name] && NAMED_AS[row.name] !== template.id)) {
        gaps.push(row.name);
      }
    }
    expect(gaps.sort()).toEqual(KNOWN_GAPS.map((gap) => gap.name).sort());
  });

  it('keeps each matched row internally consistent (blocks follow the interval columns)', () => {
    const inconsistent: string[] = [];
    for (const row of rows) {
      if (gapNames.has(row.name)) {
        continue;
      }
      for (const slot of slotsOf(row.intervals)) {
        const root = mod12(FIXED - (row.intervals[slot] as number));
        const expected = present(row.intervals).map((iv) => mod12(root + iv));
        if (JSON.stringify(present(row.blocks[slot] ?? [])) !== JSON.stringify(expected)) {
          inconsistent.push(`${row.name}@${slot}`);
        }
      }
    }
    expect(inconsistent).toEqual([]);
  });

  it('matches the engine for every matched row and tone slot', () => {
    const orderDifferent = new Set<string>();
    let checked = 0;
    for (const row of rows) {
      if (gapNames.has(row.name)) {
        continue;
      }
      const template = matchTemplate(present(row.intervals));
      expect(template, row.name).toBeDefined();
      slotsOf(row.intervals).forEach((slot) => {
        const sheetPcs = present(row.blocks[slot] ?? []);
        // The engine chord of this template with FIXED as the tone whose interval is the slot's
        // (the j-th present column; the same tone unless the template stacks in another order).
        const interval = row.intervals[slot] as number;
        const j = template?.steps.findIndex((s) => mod12(s) === interval) ?? -1;
        const rootPc = mod12(FIXED - interval);
        const chord = engineChords.find(
          (c) => c.templateId === template?.id && c.rootPc === rootPc && c.pcs[j] === FIXED
        );
        expect(chord, `${row.name} slot ${slot}`).toBeDefined();
        // Roles: only the Ninth, Eleventh and Thirteenth columns name their degree unambiguously.
        // Root/Third/Fifth/Seventh columns are functional slots (sus2, sus4 and 6 tones sit in
        // them), so their roles are not asserted.
        const columnRole = EXTENSION_ROLES[slot];
        if (columnRole) {
          expect(chord?.roles[j], `${row.name} slot ${slot} role`).toBe(columnRole);
        }
        if (JSON.stringify(chord?.pcs) !== JSON.stringify(sheetPcs)) {
          expect(sorted(chord?.pcs ?? []), `${row.name} slot ${slot}`).toEqual(sorted(sheetPcs));
          orderDifferent.add(template?.suffix ?? '');
        }
        checked += 1;
      });
    }
    expect(checked).toBeGreaterThan(100);
    expect([...orderDifferent]).toEqual(KNOWN_ORDER_DIFFERENCES);
  });
});
