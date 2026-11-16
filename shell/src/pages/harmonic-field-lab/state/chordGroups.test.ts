/** M8i scenarios (12-EDO, a JI hexany, the dashed chips, the switch off) for the chord shape groups, from the real chord finder. */
import { describe, expect, it } from 'vitest';
import { groupByShape, positionalChords, positionalList } from '../../../lib/harmonic-field';
import {
  groupChips,
  groupFoldId,
  positionalShapeKey,
  representative,
  shapeCounts,
} from './chordGroups';
import { chordModel, deriveBase } from './derive';
import { genFromPreset, presetByName } from './generate';
import { makeTab } from './labState';
import { MAX_FOLD_ID } from './persist';

const tabOf = (name: string) => makeTab('t9', genFromPreset(presetByName(name)!));
const baseOf = (name: string, sel?: number[]) => {
  const t = tabOf(name);
  return deriveBase(sel ? { ...t, sel } : t);
};
// the C major scale inside 12-EDO: field indices 0 2 4 5 7 9 11
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

const chipGroups = (name: string, sel?: number[], tol = 18) => {
  const base = baseOf(name, sel);
  const chips = chordModel(base)!.chipsAt(tol);
  return { base, chips, groups: groupChips(chips, base.field, base.repC) };
};
const summary = (g: ReturnType<typeof groupChips>, template: string) =>
  g
    .filter((x) => x.members[0].template === template && x.members[0].found)
    .map((x) => x.members.map((m) => m.root));

describe('ratio chips grouped by shape', () => {
  it('12-EDO, all 12 notes: the 4:5:6 template is ONE group of 12', () => {
    const { groups } = chipGroups('12-EDO');
    const major = groups.filter((x) => x.members[0].template === '4:5:6' && x.members[0].found);
    expect(major).toHaveLength(1);
    expect(major[0].members).toHaveLength(12);
    expect(new Set(major[0].members.map((m) => m.rootIdx)).size).toBe(12);
  });

  it('12-EDO C major scale: major triads C F G, minor D E A, diminished B', () => {
    const { base, groups } = chipGroups('12-EDO', MAJOR);
    const root = (m: { rootIdx: number }) => base.rel.find((r) => r.src === m.rootIdx)!.src;
    const names = (t: string) =>
      groups
        .filter((x) => x.members[0].template === t && x.members[0].found)
        .map((x) =>
          x.members.map((m) => ['C', 'D', 'E', 'F', 'G', 'A', 'B'][MAJOR.indexOf(root(m))])
        );
    expect(names('4:5:6')).toEqual([['C', 'F', 'G']]);
    expect(names('10:12:15')).toEqual([['D', 'E', 'A']]);
    expect(names('5:6:7')).toEqual([['B']]);
  });

  it('a JI hexany (asymmetric): groups of one only', () => {
    const { groups } = chipGroups('Hexany (1 3 5 7, choose 2)');
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.members.length === 1)).toBe(true);
  });

  it('chips found only at a raised tolerance (dashed) are never grouped', () => {
    // at 0 c nothing in 12-EDO matches 4:5:6 within tolerance: it is listed dashed (needs a raised tolerance)
    const { chips, groups } = chipGroups('12-EDO', undefined, 0);
    const dashed = chips.filter((c) => !c.found);
    expect(dashed.length).toBeGreaterThan(0);
    const g = groups.filter((x) => !x.members[0].found);
    expect(g).toHaveLength(dashed.length);
    expect(g.every((x) => x.members.length === 1 && x.key === null)).toBe(true);
  });

  it('keeps the order of first appearance and the same chips as ungrouped', () => {
    const { chips, groups } = chipGroups('12-EDO', MAJOR);
    const flat = groups.flatMap((g) => g.members);
    expect(flat).toHaveLength(chips.length);
    expect(new Set(flat)).toEqual(new Set(chips));
    const firsts = groups.map((g) => chips.indexOf(g.members[0]));
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    expect(summary(groups, '4:5:6')).toHaveLength(1);
  });
});

describe('header counts: chords and shapes', () => {
  it('12-EDO: N chords make fewer M shapes; dashed chips are not counted; a hexany has N = M', () => {
    const a = chipGroups('12-EDO');
    const found = a.chips.filter((c) => c.found);
    const c = shapeCounts(a.chips, a.base.field, a.base.repC);
    expect(c.n).toBe(found.length);
    expect(c.m).toBeLessThan(c.n);
    expect(c.m).toBe(a.groups.filter((g) => g.members[0].found).length);
    const m = chipGroups('12-EDO', MAJOR);
    const cm = shapeCounts(m.chips, m.base.field, m.base.repC);
    expect(cm.n).toBeGreaterThan(cm.m);
    const h = chipGroups('Hexany (1 3 5 7, choose 2)');
    const ch = shapeCounts(h.chips, h.base.field, h.base.repC);
    expect(ch.m).toBe(ch.n);
    // dashed only
    const d = chipGroups('12-EDO', undefined, 0);
    expect(shapeCounts(d.chips, d.base.field, d.base.repC)).toEqual({ n: 0, m: 0 });
  });
});

describe('positional rows grouped by shape', () => {
  const rows = (name: string, sel: number[] | undefined, steps: number[]) => {
    const t = tabOf(name);
    const base = deriveBase(sel ? { ...t, sel } : t);
    const list = positionalList(
      positionalChords(base.field, base.idx, steps, base.mode, base.rep),
      'smoothest',
      261.6256
    );
    return groupByShape(list, (r) => positionalShapeKey('2-2', r.pitches));
  };

  it('2-2 in a 12-note field: one group of 12', () => {
    const g = rows('12-EDO', undefined, [2, 2]);
    expect(g).toHaveLength(1);
    expect(g[0].members).toHaveLength(12);
    // identical shapes tie: the best rank is the shared rank 1
    expect(Math.min(...g[0].members.map((m) => m.rank))).toBe(1);
  });

  it('2-2 in the major scale: major, minor and diminished groups', () => {
    const g = rows('12-EDO', MAJOR, [2, 2]);
    expect(g.map((x) => x.members.length).sort()).toEqual([1, 3, 3]);
  });

  it('a hexany gives groups of one only', () => {
    const g = rows('Hexany (1 3 5 7, choose 2)', undefined, [1, 1]);
    expect(g.every((x) => x.members.length === 1)).toBe(true);
  });
});

describe('group ids and the representative', () => {
  it('ids are short, stable, prefixed grp: and differ per key', () => {
    const a = groupFoldId(`r|4:5:6|${'x'.repeat(500)}`);
    expect(a.startsWith('grp:')).toBe(true);
    expect(a.length).toBeLessThanOrEqual(MAX_FOLD_ID);
    expect(groupFoldId(`r|4:5:6|${'x'.repeat(500)}`)).toBe(a);
    expect(groupFoldId('r|4:5:6|400.0,300.0')).not.toBe(groupFoldId('r|10:12:15|300.0,400.0'));
  });

  it('the representative is the member on the stepper root, else the first', () => {
    const ms = [{ d: 0 }, { d: 3 }, { d: 5 }];
    expect(representative(ms, (m) => m.d, 3)).toBe(ms[1]);
    expect(representative(ms, (m) => m.d, 4)).toBe(ms[0]);
  });
});
