import { describe, expect, it } from 'vitest';
import {
  applyUpdate,
  centsNote,
  childFolders,
  findDuplicate,
  folderName,
  generatorKey,
  inFolder,
  joinFolder,
  listFolders,
  normalizeFolder,
  parentFolder,
  ratioNote,
  reportSentence,
  resolvePitches,
  resolveSubset,
  samePitchSet,
  splitFolder,
  subsetFromSelection,
  type GeneratorInputs,
  type NamedPitchSet,
  type Note,
} from './index';

const r = (n: number, d: number): Note => ratioNote(n, d);
const JI = [r(1, 1), r(9, 8), r(5, 4), r(3, 2), r(5, 3)]; // field indices 0..4
const set = (
  id: string,
  pitches: Note[],
  root: Note | null = pitches[0] ?? null
): NamedPitchSet => ({
  id,
  name: `n${id}`,
  pitches,
  root,
});

describe('generatorKey', () => {
  const base = (): GeneratorInputs => ({
    method: 'harmonic',
    rep: '2/1',
    h: 8,
    edoN: 12,
    shape: 'box',
    axes: [
      { on: true, g: '3/2', n: 12, ctr: 0 },
      { on: false, g: '5/4', n: 3, ctr: 1 },
      { on: false, g: '7/4', n: 3, ctr: 1 },
    ],
    dist: 3,
    bidir: true,
    cpsF: '1 3 5 7',
    cpsK: 2,
    custom: '9/8 5/4',
    mask: Array<boolean>(25).fill(true),
  });
  it('is the same for the same field-determining inputs, whatever else differs', () => {
    const a = base();
    expect(generatorKey({ ...a, rep: '2' })).toBe(generatorKey(a));
    // the inputs of other methods do not matter
    expect(generatorKey({ ...a, edoN: 31, cpsK: 3, custom: 'x', dist: 9 })).toBe(generatorKey(a));
    expect(generatorKey({ ...a, h: 9 })).not.toBe(generatorKey(a));
    expect(generatorKey({ ...a, rep: '3/1' })).not.toBe(generatorKey(a));
    const mask = a.mask.slice();
    mask[3] = false;
    expect(generatorKey({ ...a, mask })).not.toBe(generatorKey(a));
  });
  it('a lattice ignores axes that are off', () => {
    const a = { ...base(), method: 'lattice' as const };
    const b = { ...a, axes: a.axes.map((x, i) => (i === 1 ? { ...x, g: '9/8', n: 7 } : x)) };
    expect(generatorKey(b)).toBe(generatorKey(a));
    const on = { ...a, axes: a.axes.map((x, i) => (i === 1 ? { ...x, on: true } : x)) };
    expect(generatorKey(on)).not.toBe(generatorKey(a));
  });
});

describe('subsetFromSelection', () => {
  it('takes the selected notes as pitches with the mode root as a pitch', () => {
    const s = subsetFromSelection(JI, [3, 0, 2], 1);
    expect(s.pitches.map((p) => Math.round(p.c))).toEqual([0, 386, 702]);
    expect(s.root?.c).toBeCloseTo(JI[2].c, 9);
    expect(s.pitches[0].m).toEqual({});
    // a copy: changing it does not touch the field
    s.pitches[1].c = 1;
    expect(JI[2].c).toBeGreaterThan(300);
  });
  it('repairs a mode out of range and ignores bad indices', () => {
    expect(subsetFromSelection(JI, [0, 9, -1, 2], 7).root?.c).toBe(0);
    expect(subsetFromSelection(JI, [], 0)).toEqual({ pitches: [], root: null });
  });
});

describe('resolvePitches', () => {
  it('matches by exact monzo', () => {
    const x = resolvePitches(JI, [r(3, 2), r(1, 1), r(7, 4)]);
    expect(x.match).toEqual([3, 0, null]);
    expect(x.indices).toEqual([0, 3]);
    expect(x.found).toEqual([0, 1]);
    expect(x.missing).toEqual([2]);
  });
  it('matches within the tolerance by cents (0.5 c default, inclusive), nearest wins', () => {
    const near = { m: null, c: JI[3].c + 0.4 };
    const far = { m: null, c: JI[3].c + 0.6 };
    expect(resolvePitches(JI, [near]).match).toEqual([3]);
    expect(resolvePitches(JI, [far]).match).toEqual([null]);
    expect(resolvePitches(JI, [far], 1).match).toEqual([3]);
    // two candidates in range: the nearer one
    const f = [centsNote(100), centsNote(100.4)];
    expect(resolvePitches(f, [{ m: null, c: 100.3 }]).match).toEqual([1]);
  });
  it('a pitch with a monzo finds an irrational field note within the tolerance (and the other way round)', () => {
    const edo = [centsNote(0), centsNote(968.9), centsNote(1200 / 12)];
    expect(resolvePitches(edo, [r(7, 4)]).match).toEqual([1]); // 7/4 = 968.826 c
    expect(resolvePitches(JI, [{ m: null, c: 701.955 }]).match).toEqual([3]); // cents-only pitch, exact note
  });
  it('a pitch with a monzo does not match a different rational note that is farther than the tolerance', () => {
    expect(resolvePitches([r(5, 4)], [r(81, 64)]).match).toEqual([null]); // 5/4 and 81/64 are 21.5 c apart
  });
  it('two pitches may land on one note: the index is listed once', () => {
    const x = resolvePitches(JI, [r(3, 2), { m: null, c: JI[3].c + 0.1 }]);
    expect(x.indices).toEqual([3]);
    expect(x.found).toEqual([0, 1]);
  });
  it('resolveSubset returns the selection and the mode of the root; a lost root gives mode 0', () => {
    const a = resolveSubset(JI, { pitches: [r(1, 1), r(5, 4), r(3, 2)], root: r(5, 4) });
    expect(a.sel).toEqual([0, 2, 3]);
    expect(a.mode).toBe(1);
    expect(a.rootFound).toBe(true);
    const b = resolveSubset(JI, { pitches: [r(1, 1), r(5, 4), r(7, 4)], root: r(7, 4) });
    expect(b.sel).toEqual([0, 2]);
    expect(b.mode).toBe(0);
    expect(b.rootFound).toBe(false);
  });
});

describe('duplicates', () => {
  const t1 = { pitches: [r(1, 1), r(5, 4), r(3, 2)], root: r(1, 1) };
  it('same pitch set and same mode root', () => {
    expect(samePitchSet(t1, { pitches: [r(3, 2), r(1, 1), r(5, 4)], root: r(1, 1) })).toBe(true);
    expect(samePitchSet(t1, { ...t1, root: r(5, 4) })).toBe(false);
    expect(samePitchSet(t1, { pitches: [r(1, 1), r(5, 4)], root: r(1, 1) })).toBe(false);
    expect(samePitchSet({ pitches: [], root: null }, { pitches: [], root: null })).toBe(true);
  });
  it('findDuplicate returns the existing row', () => {
    const rows = [set('a', [r(1, 1), r(9, 8)]), set('b', t1.pitches, t1.root)];
    expect(findDuplicate(rows, t1)?.id).toBe('b');
    expect(findDuplicate(rows, { ...t1, root: r(3, 2) })).toBeNull();
  });
  it('cents-only pitches compare within 0.01 c', () => {
    const a = { pitches: [{ m: null, c: 100 }], root: { m: null, c: 100 } };
    const b = { pitches: [{ m: null, c: 100.005 }], root: { m: null, c: 100.005 } };
    expect(samePitchSet(a, b)).toBe(true);
    expect(samePitchSet(a, { pitches: [{ m: null, c: 100.5 }], root: { m: null, c: 100.5 } })).toBe(
      false
    );
  });
});

describe('applyUpdate (hand-checked)', () => {
  // field JI = 1/1 9/8 5/4 3/2 5/3
  const A = set('s1', [r(1, 1), r(5, 4), r(3, 2)]); // all found
  const B = set('s2', [r(1, 1), r(9, 8), r(7, 4)], r(9, 8)); // 7/4 lost
  const C = set('s3', [r(7, 4), r(11, 8)]); // all lost: removed
  const D = set('s4', [r(5, 4), r(7, 4), r(11, 8), r(3, 2)], r(7, 4)); // 7/4 and 11/8 lost, root lost
  const all = [A, B, C, D];
  const res = applyUpdate(all, JI);

  it('keeps the matching pitches, removes empty subsets, in order', () => {
    expect(res.subsets.map((s) => s.id)).toEqual(['s1', 's2', 's4']);
    expect(res.subsets[1].pitches.map((p) => Math.round(p.c))).toEqual([0, 204]);
    expect(res.subsets[1].root?.c).toBeCloseTo(JI[1].c, 9); // 9/8 was the root and survives
    // D lost its root: the lowest remaining pitch is the root
    expect(res.subsets[2].pitches.map((p) => Math.round(p.c))).toEqual([386, 702]);
    expect(res.subsets[2].root?.c).toBeCloseTo(JI[2].c, 9);
  });
  it('report numbers: 4 subsets, 1 removed, 2 affected losing 1 and 2 (average 1.5, most 2), 7 of 12 pitches found', () => {
    const rep = res.report;
    expect(rep.subsetsTotal).toBe(4);
    expect(rep.updatedSubsets).toBe(3);
    expect(rep.removedSubsets).toBe(1);
    expect(rep.removed).toEqual([{ id: 's3', name: 'ns3' }]);
    expect(rep.affectedSubsets).toBe(2);
    expect(rep.affectedAverageLost).toBe(1.5);
    expect(rep.mostLost).toBe(2);
    expect(rep.pitchesFound).toBe(7);
    expect(rep.pitchesTotal).toBe(12);
  });
  it('detail lists what each affected subset kept and lost, flagging the removed one', () => {
    expect(res.report.detail.map((d) => [d.id, d.kept.length, d.lost.length, d.removed])).toEqual([
      ['s2', 2, 1, false],
      ['s3', 0, 2, true],
      ['s4', 2, 2, false],
    ]);
    expect(res.report.detail[2].root?.c).toBeCloseTo(r(7, 4).c, 9); // the root before the change
  });
  it('undo is the exact previous subsets, and the input is not modified', () => {
    expect(res.undo).toEqual(all);
    expect(res.undo).not.toBe(all);
    expect(all[3].pitches).toHaveLength(4);
  });
  it('an update that loses nothing reports zeros', () => {
    const same = applyUpdate([A], JI);
    expect(same.report.affectedSubsets).toBe(0);
    expect(same.report.affectedAverageLost).toBe(0);
    expect(same.report.pitchesFound).toBe(same.report.pitchesTotal);
    expect(reportSentence('Pool', same.report)).toBe(
      "Updated 'Pool'. Every subset kept all its pitches."
    );
  });
  it('the sentence follows the notice wording', () => {
    expect(reportSentence('X', res.report)).toBe(
      "Updated 'X'. 1 subset had no matching pitches and was removed. The other subsets lost 1.5 pitches on average (most: 2)."
    );
  });
  it('an empty field removes everything (the page refuses to apply it)', () => {
    expect(applyUpdate(all, []).subsets).toEqual([]);
  });
});

describe('folder paths', () => {
  it('normalizes', () => {
    expect(normalizeFolder(' A /  B//C ')).toBe('A/B/C');
    expect(normalizeFolder('/')).toBe('');
    expect(normalizeFolder('a/./../b')).toBe('a/b');
    expect(normalizeFolder('x'.repeat(100)).length).toBe(40);
    expect(splitFolder('1/2/3/4/5/6/7/8')).toHaveLength(6);
  });
  it('splits, joins, parent, name', () => {
    expect(splitFolder('A/B')).toEqual(['A', 'B']);
    expect(splitFolder('')).toEqual([]);
    expect(joinFolder('A', 'B/C')).toBe('A/B/C');
    expect(parentFolder('A/B')).toBe('A');
    expect(parentFolder('A')).toBe('');
    expect(parentFolder('')).toBe('');
    expect(folderName('A/B')).toBe('B');
    expect(folderName('')).toBe('');
  });
  it('lists every folder with its ancestors, and the children of one', () => {
    const paths = ['Pools/Seven', 'Pools/Five/Odd', '', 'beta'];
    expect(listFolders(paths)).toEqual([
      'beta',
      'Pools',
      'Pools/Five',
      'Pools/Five/Odd',
      'Pools/Seven',
    ]);
    expect(childFolders(paths, '')).toEqual(['beta', 'Pools']);
    expect(childFolders(paths, 'Pools')).toEqual(['Pools/Five', 'Pools/Seven']);
    expect(inFolder('Pools/Five/Odd', 'Pools')).toBe(true);
    expect(inFolder('Pools', 'Pools/Five')).toBe(false);
    expect(inFolder('anything', '')).toBe(true);
  });
});
