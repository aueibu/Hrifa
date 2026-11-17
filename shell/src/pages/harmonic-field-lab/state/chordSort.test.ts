/** M4 scenarios (SCENARIOS.M4.md rows 1 to 15, the parts that are pure): sort keys, per-note errors, worst (avg), settings. From the real lab. */
import { describe, expect, it } from 'vitest';
import { cpsChords } from '../../../lib/harmonic-field';
import { chipOrder } from './chordGroups';
import {
  appearsAtTolerance,
  chipErrors,
  chipSortOptions,
  errorStats,
  fmtErrors,
  noteErrorLines,
  signedC1,
  sortCards,
  sortGroups,
  templateHeight,
} from './chordSort';
import { cpsRootIdx } from './cpsRoot';
import { chordModel, cpsFactorNames, deriveBase, type ChordChip } from './derive';
import { defaultGen } from './generate';
import { defaultUi, makeTab } from './labState';
import { sanitizeSettings } from './persist';

const customTab = (notes: string[]) =>
  makeTab('t1', { ...defaultGen(), method: 'custom', custom: notes.join('\n'), rep: '2/1' });
const MAJOR = ['9/8', '5/4', '4/3', '3/2', '5/3', '15/8'];

const rowOf = (template: string, notes: string[], tol: number) => {
  const base = deriveBase(customTab(notes));
  const chips = chordModel(base)!.chipsAt(tol);
  return { base, row: chips.filter((c) => c.template === template) };
};
const rootsOf = (chips: ChordChip[]) => chips.map((c) => `${c.root}${c.found ? '' : '?'}`);

describe('chord Tenney height', () => {
  it('is log2 of the product of the whole numbers in lowest terms', () => {
    expect(templateHeight('4:5:6')).toBeCloseTo(Math.log2(120), 9);
    expect(templateHeight('10:12:15')).toBeCloseTo(Math.log2(1800), 9);
    // utonal 1/(4:5:6) is 10:12:15
    expect(templateHeight('1/(4:5:6)')).toBeCloseTo(Math.log2(1800), 9);
  });
  it('a template with no whole numbers sorts last', () => {
    expect(templateHeight('nonsense')).toBe(Number.POSITIVE_INFINITY);
    expect(templateHeight(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('rows 1 to 3: ratio chords in the 5-limit major scale', () => {
  const minor = rowOf('10:12:15', MAJOR, 25);
  const major = rowOf('4:5:6', MAJOR, 25);
  const field = minor.base.field;

  it('row 1, Default: error first, then scale position', () => {
    const found = minor.row.filter((c) => c.found);
    expect(found.map((c) => c.root)).toEqual(['5/4', '5/3', '9/8']);
    expect(found.map((c) => Math.round(c.maxErr * 10) / 10)).toEqual([0, 0, 21.5]);
  });

  it('row 2, Root: D (9/8), E (5/4), A (5/3)', () => {
    const o = chipSortOptions('root', false, field);
    expect(sortCards(minor.row, o).map((c) => c.root)).toEqual(['9/8', '5/4', '5/3']);
  });

  it("Reverse flips the active key; with Default it reverses today's order", () => {
    expect(sortCards(minor.row, chipSortOptions('root', true, field)).map((c) => c.root)).toEqual([
      '5/3',
      '5/4',
      '9/8',
    ]);
    expect(
      sortCards(minor.row, chipSortOptions('default', true, field)).map((c) => c.root)
    ).toEqual(['9/8', '5/3', '5/4']);
  });

  it('row 3, Major row: C, F, G under Default and under Root', () => {
    expect(rootsOf(major.row.filter((c) => c.found))).toEqual(['1/1', '4/3', '3/2']);
    expect(
      sortCards(major.row, chipSortOptions('root', false, major.base.field))
        .filter((c) => c.found)
        .map((c) => c.root)
    ).toEqual(['1/1', '4/3', '3/2']);
  });

  it('Simplicity: simpler template first across a whole size section', () => {
    const base = deriveBase(customTab(MAJOR));
    const triads = chordModel(base)!
      .chipsAt(25)
      .filter((c) => c.found && c.members.length === 3);
    const sorted = sortCards(triads, chipSortOptions('simplicity', false, base.field));
    const h = sorted.map((c) => templateHeight(c.template));
    expect(h).toEqual([...h].sort((a, b) => a - b));
    expect(sorted[0].template).toBe('4:5:6');
  });

  it('row 8: dashed cards stay after the found cards under every key, sorted by the key among themselves', () => {
    const base = deriveBase(customTab(MAJOR));
    const chips = chordModel(base)!.chipsAt(0);
    expect(chips.some((c) => !c.found)).toBe(true);
    for (const key of ['default', 'root', 'simplicity'] as const) {
      for (const reverse of [false, true]) {
        const out = sortCards(chips, chipSortOptions(key, reverse, base.field));
        const firstDashed = out.findIndex((c) => !c.found);
        expect(
          out.slice(firstDashed).every((c) => !c.found),
          `${key} ${reverse}`
        ).toBe(true);
        expect(out).toHaveLength(chips.length);
      }
    }
    const dashed = sortCards(chips, chipSortOptions('root', false, base.field)).filter(
      (c) => !c.found
    );
    const rc = dashed.map((c) => base.field[c.rootIdx].c);
    expect(rc).toEqual([...rc].sort((a, b) => a - b));
  });
});

describe('row 7: shape groups sort as units by their best member', () => {
  it('roots sort inside a group, groups by the first root, a single dashed card stays last', () => {
    const { base, row } = rowOf('10:12:15', MAJOR, 25);
    const [d, e, a] = ['9/8', '5/4', '5/3'].map((r) => row.find((c) => c.root === r)!);
    const o = chipSortOptions('root', false, base.field);
    const groups = [
      { key: 'g2', members: [a, e] },
      { key: 'g1', members: [d] },
    ];
    const out = sortGroups(groups, o);
    expect(out.map((g) => g.key)).toEqual(['g1', 'g2']);
    expect(out[1].members.map((c) => c.root)).toEqual(['5/4', '5/3']);
    // Default keeps the groups where they are (the panel skips the sort altogether)
    const rev = sortGroups(groups, { ...o, key: 'root', reverse: true });
    expect(rev.map((g) => g.key)).toEqual(['g2', 'g1']);
    expect(rev[0].members.map((c) => c.root)).toEqual(['5/3', '5/4']);
  });
});

describe('rows 4 to 6: CPS chords of the Hexany 1 3 5 7', () => {
  const tab = makeTab('t2', {
    ...defaultGen(),
    method: 'cps',
    cpsF: '1 3 5 7',
    cpsK: 2,
  });
  const base = deriveBase(tab);
  const labels = cpsFactorNames(tab.gen);
  const oto = cpsChords(base.field)
    .filter((g) => g.type === 'harmonic')
    .map((g) => ({
      g,
      text: [...g.members]
        .map((m) => Number(labels[m.x] ?? m.x))
        .sort((a, b) => a - b)
        .join(':'),
      rootC: base.field[cpsRootIdx(g, labels)].c,
    }));
  const opts = (key: 'default' | 'root' | 'simplicity', reverse = false) => ({
    key,
    reverse,
    found: () => true,
    rootC: (t: (typeof oto)[number]) => t.rootC,
    height: (t: (typeof oto)[number]) => templateHeight(t.text),
  });

  it('row 4, Default: the lib order is kept', () => {
    expect(sortCards(oto, opts('default')).map((t) => t.text)).toEqual(oto.map((t) => t.text));
  });
  it('row 5, Simplicity: 1:3:5 (15), 1:3:7 (21), 1:5:7 (35), 3:5:7 (105)', () => {
    expect(oto.map((t) => t.text).sort()).toEqual(['1:3:5', '1:3:7', '1:5:7', '3:5:7']);
    expect(sortCards(oto, opts('simplicity')).map((t) => t.text)).toEqual([
      '1:3:5',
      '1:3:7',
      '1:5:7',
      '3:5:7',
    ]);
  });
  it("row 6, Root: by the pitch of each chord's root note, low to high", () => {
    const out = sortCards(oto, opts('root'));
    const rc = out.map((t) => t.rootC);
    expect(rc).toEqual([...rc].sort((a, b) => a - b));
    expect(sortCards(oto, opts('root', true)).map((t) => t.text)).toEqual(
      [...out].reverse().map((t) => t.text)
    );
  });
});

describe('rows 10 to 12: per-note errors and worst (avg)', () => {
  const chipFor = (notes: string[]) => {
    const base = deriveBase(customTab(notes));
    const chip = chordModel(base)!
      .chipsAt(30)
      .find((c) => c.found && c.template === '10:12:15' && c.rootIdx === 0)!;
    return { base, chip };
  };

  it('row 10: 0, 322, 673.2 gives 0, +6.4, -28.8; worst 28.8, avg 17.6', () => {
    const { base, chip } = chipFor(['322c', '673.2c']);
    const errs = chipErrors(chip, base.field, base.repC)!;
    expect(errs.map((e) => Math.round(e * 10) / 10)).toEqual([0, 6.4, -28.8]);
    expect(fmtErrors(errs)).toBe('0, +6.4, -28.8 c');
    const s = errorStats(errs);
    expect(s.worst.toFixed(1)).toBe('28.8');
    expect(s.avg.toFixed(1)).toBe('17.6');
    expect(chip.maxErr.toFixed(1)).toBe('28.8');
  });

  it('row 11: 0, 292.7, 673.2 has the same worst but a larger average', () => {
    const { base, chip } = chipFor(['292.7c', '673.2c']);
    const errs = chipErrors(chip, base.field, base.repC)!;
    expect(errs[0]).toBe(0);
    expect(errs[1]).toBeCloseTo(292.7 - 315.64, 1);
    const s = errorStats(errs);
    expect(s.worst.toFixed(1)).toBe('28.8');
    // (22.94 + 28.76) / 2 = 25.85: computed from the real voicing, not typed in
    expect(s.avg).toBeCloseTo((Math.abs(errs[1]) + Math.abs(errs[2])) / 2, 9);
    expect(s.avg).toBeGreaterThan(25.8);
    expect(s.avg).toBeLessThan(25.9);
  });

  it('row 12: an exact chord has errors 0, 0, 0', () => {
    const base = deriveBase(customTab(['6/5', '3/2']));
    const chip = chordModel(base)!
      .chipsAt(0)
      .find((c) => c.found && c.template === '10:12:15' && c.rootIdx === 0)!;
    const errs = chipErrors(chip, base.field, base.repC)!;
    expect(errs.map((e) => Math.abs(e) < 1e-6)).toEqual([true, true, true]);
    expect(fmtErrors(errs)).toBe('0, 0, 0 c');
    expect(errorStats(errs).worst).toBeLessThan(1e-6);
    expect(errorStats(errs).avg).toBeLessThan(1e-6);
  });

  it("errors follow the card's note order (root first, then upward from the root), also on a non-first root", () => {
    const base = deriveBase(customTab(MAJOR));
    const chip = chordModel(base)!
      .chipsAt(25)
      .find((c) => c.found && c.template === '10:12:15' && c.root === '9/8')!;
    const errs = chipErrors(chip, base.field, base.repC)!;
    const order = chipOrder(chip, base.field, base.repC);
    expect(errs).toHaveLength(order.length);
    expect(errs[0]).toBe(0);
    order.forEach((i, k) => {
      expect(errs[k]).toBe(chip.errors![chip.memberIdx.indexOf(i)]);
    });
    expect(chip.maxErr).toBeCloseTo(errorStats(errs).worst, 9);
  });

  it('a chip with no errors (or a mismatched list) gives none', () => {
    expect(chipErrors({ rootIdx: 0, memberIdx: [0, 1] }, [], 1200)).toBeNull();
    expect(chipErrors({ rootIdx: 0, memberIdx: [0, 1], errors: [0] }, [], 1200)).toBeNull();
  });
});

describe('the chip tooltip: one sentence per note in the finder order, and the tolerance it appears at', () => {
  // `+ 0` turns -0 into 0 (toEqual tells them apart)
  const r1 = (e: number) => Math.round(e * 10) / 10 + 0;
  const linesOf = (chip: ChordChip, base: ReturnType<typeof deriveBase>) =>
    noteErrorLines(chip, base.field, base.rep)!.map((l) => ({
      member: l.member,
      ideal: l.ideal,
      error: r1(l.error),
    }));

  it('a minor chord with one off note: member, ideal on the root and signed error, root left out', () => {
    const base = deriveBase(customTab(['322c', '673.2c']));
    const chip = chordModel(base)!
      .chipsAt(30)
      .find((c) => c.found && c.template === '10:12:15' && c.rootIdx === 0)!;
    expect(linesOf(chip, base)).toEqual([
      { member: '322.0 c', ideal: '6/5', error: 6.4 },
      { member: '673.2 c', ideal: '3/2', error: -28.8 },
    ]);
    // the k-th line is the k-th member of the finder's order (members, memberIdx and errors are aligned)
    expect(chip.members.slice(1)).toEqual(['322.0 c', '673.2 c']);
  });

  it('the ideal is the template shape placed on the chip root (D minor in the major scale)', () => {
    const base = deriveBase(customTab(MAJOR));
    const chip = chordModel(base)!
      .chipsAt(25)
      .find((c) => c.found && c.template === '10:12:15' && c.root === '9/8')!;
    // 9/8 x 6/5 = 27/20 and 9/8 x 3/2 = 27/16: the field has 4/3 and 5/3 there, both 21.5 c flat
    expect(linesOf(chip, base)).toEqual([
      { member: '4/3', ideal: '27/20', error: -21.5 },
      { member: '5/3', ideal: '27/16', error: -21.5 },
    ]);
  });

  it('an ideal above the repeat is reduced into it, like the field note (A minor: 2/1 is 1/1, 5/2 is 5/4)', () => {
    const base = deriveBase(customTab(MAJOR));
    const chip = chordModel(base)!
      .chipsAt(25)
      .find((c) => c.found && c.template === '10:12:15' && c.root === '5/3')!;
    expect(linesOf(chip, base)).toEqual([
      { member: '1/1', ideal: '1/1', error: 0 },
      { member: '5/4', ideal: '5/4', error: 0 },
    ]);
  });

  it('an exact chord: every error is 0', () => {
    const base = deriveBase(customTab(['6/5', '3/2']));
    const chip = chordModel(base)!
      .chipsAt(0)
      .find((c) => c.found && c.template === '10:12:15' && c.rootIdx === 0)!;
    expect(linesOf(chip, base)).toEqual([
      { member: '6/5', ideal: '6/5', error: 0 },
      { member: '3/2', ideal: '3/2', error: 0 },
    ]);
    expect(appearsAtTolerance(chip.maxErr)).toBe(0);
  });

  it('a utonal template 1/(4:5:6): its notes are the 10:12:15 intervals, in finder order', () => {
    const base = deriveBase(customTab(['322c', '673.2c']));
    const chip = chordModel(base, [{ text: '1/(4:5:6)', name: 'utonal triad' }])!
      .chipsAt(30)
      .find((c) => c.found && c.rootIdx === 0)!;
    expect(chip.template).toBe('1/(4:5:6)');
    expect(linesOf(chip, base)).toEqual([
      { member: '322.0 c', ideal: '6/5', error: 6.4 },
      { member: '673.2 c', ideal: '3/2', error: -28.8 },
    ]);
  });

  it('a four-note chord (harmonic seventh 4:5:6:7) gives three lines', () => {
    const base = deriveBase(customTab(['5/4', '3/2', '7/4']));
    const chip = chordModel(base)!
      .chipsAt(0)
      .find((c) => c.found && c.template === '4:5:6:7' && c.rootIdx === 0)!;
    expect(linesOf(chip, base).map((l) => l.ideal)).toEqual(['5/4', '3/2', '7/4']);
  });

  it('falls back to no lines: no errors, a shape that does not match the members, an unparsable template', () => {
    const base = deriveBase(customTab(['322c', '673.2c']));
    const chip = chordModel(base)!
      .chipsAt(30)
      .find((c) => c.found && c.template === '10:12:15' && c.rootIdx === 0)!;
    expect(noteErrorLines({ ...chip, errors: undefined }, base.field, base.rep)).toBeNull();
    expect(
      noteErrorLines({ ...chip, members: chip.members.slice(1) }, base.field, base.rep)
    ).toBeNull();
    expect(noteErrorLines({ ...chip, template: 'nonsense' }, base.field, base.rep)).toBeNull();
  });

  it('appears at the ladder rung: the worst error rounded up to a whole cent, 0 for exact', () => {
    expect(appearsAtTolerance(28.8)).toBe(29);
    expect(appearsAtTolerance(26.4)).toBe(27);
    expect(appearsAtTolerance(27)).toBe(27);
    expect(appearsAtTolerance(0.2)).toBe(1);
    expect(appearsAtTolerance(0)).toBe(0);
    expect(appearsAtTolerance(1e-9)).toBe(0);
  });

  it('signedC1 uses a true minus (U+2212) and one decimal', () => {
    expect(signedC1(-26.43)).toBe('−26.4');
    expect(signedC1(6.4)).toBe('+6.4');
  });
});

describe('row 9: the stored sort (settings.v1)', () => {
  it('defaults to Default and not reversed; old data without the fields loads unchanged', () => {
    expect(defaultUi().chordSort).toBe('default');
    expect(defaultUi().chordSortReverse).toBe(false);
    const old = sanitizeSettings({ panel: 'keys' });
    expect(old.chordSort).toBe('default');
    expect(old.chordSortReverse).toBe(false);
    expect(sanitizeSettings(null).chordSort).toBe('default');
  });
  it('keeps a valid key and Reverse, and reads anything else as the defaults', () => {
    expect(sanitizeSettings({ chordSort: 'root', chordSortReverse: true })).toMatchObject({
      chordSort: 'root',
      chordSortReverse: true,
    });
    expect(sanitizeSettings({ chordSort: 'simplicity' }).chordSort).toBe('simplicity');
    for (const bad of ['Root', 'error', 3, null, {}, true]) {
      expect(sanitizeSettings({ chordSort: bad }).chordSort).toBe('default');
    }
    for (const bad of ['yes', 1, null, {}]) {
      expect(sanitizeSettings({ chordSortReverse: bad }).chordSortReverse).toBe(false);
    }
  });
});
