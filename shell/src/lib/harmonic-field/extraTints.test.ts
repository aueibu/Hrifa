import { describe, expect, it } from 'vitest';
import {
  REACH_MAX,
  REACH_MIDDLE,
  REACH_MIN,
  TINT_MAX,
  TINT_MIDDLE,
  TINT_MIN,
  addedCellNote,
  addedCells,
  centsNote,
  drawnAdded,
  extraTints,
  fmtRatio,
  intervalPairs,
  parseInterval,
  ratioNote,
  reduceNote,
  rotateSubset,
  tintReaches,
  tintStrengths,
  tintStrengthsRelative,
  wheelPositions,
} from './index';

const REP = ratioNote(2, 1);
const fiveLimit = [
  ratioNote(1, 1),
  ratioNote(9, 8),
  ratioNote(5, 4),
  ratioNote(4, 3),
  ratioNote(3, 2),
  ratioNote(5, 3),
  ratioNote(15, 8),
];
const pairs = (field = fiveLimit) =>
  intervalPairs(
    rotateSubset(
      field,
      field.map((_, i) => i),
      0,
      REP
    ),
    REP
  )!;

describe('reduceNote and addedCellNote', () => {
  it('reduces an exact ratio into the repeat so its cents match the cell', () => {
    // 15/8 over 3/2 is 5/4; 3/2 over 15/8 wraps: 3/2 * 2 / (15/8) = 8/5
    const hi = addedCellNote({ c: 386.3137 } as never, ratioNote(3, 2), ratioNote(15, 8), REP);
    expect(hi && fmtRatio(hi)).toBe('5/4');
    const lo = addedCellNote({ c: 813.6863 } as never, ratioNote(15, 8), ratioNote(3, 2), REP);
    expect(lo && fmtRatio(lo)).toBe('8/5');
  });
  it('gives null when either pitch has no ratio', () => {
    expect(reduceNote(centsNote(700), 700, REP)).toBeNull();
    expect(addedCellNote({ c: 100 } as never, ratioNote(1, 1), centsNote(100), REP)).toBeNull();
  });
});

describe('extraTints', () => {
  it('a group takes its relative strength under the relative scale', () => {
    const mm = pairs();
    const g = mm.groups.find((x) => x.ratio === '5/4')!;
    const [t] = extraTints(
      mm,
      [{ c: g.c, note: ratioNote(5, 4) }],
      REP.c,
      'size',
      'strong',
      'relative'
    );
    expect(t.strength).toBeCloseTo(tintStrengthsRelative(mm, 'strong')[g.id], 12);
  });
  const m = pairs();
  it('an interval equal to a subset group takes that group exactly', () => {
    const g = m.groups.find((x) => x.ratio === '3/2')!;
    for (const reading of ['size', 'rank'] as const) {
      const [t] = extraTints(m, [{ c: g.c, note: ratioNote(3, 2) }], REP.c, reading, 'strong');
      expect(t.pos).toBeCloseTo(wheelPositions(m, REP.c, reading)[g.id], 12);
      expect(t.strength).toBeCloseTo(tintStrengths(m, 'strong')[g.id], 12);
      expect(t.reach).toBeCloseTo(tintReaches(m, 'strong')[g.id], 12);
    }
  });
  it('a new exact ratio: fixed strength from its own height, reach from the subset range, both clamped (relative scale: the old spread)', () => {
    const hs = m.groups.map((g) => g.h!);
    const simplest = m.groups[hs.indexOf(Math.min(...hs))];
    const items = [
      { c: 1200 * Math.log2(7 / 4), note: ratioNote(7, 4) }, // height log2(28) is within the subset's range
      { c: 1200 * Math.log2(101 / 64), note: ratioNote(101, 64) }, // height log2(6464) 12.7: above the subset's range
      { c: 1200 * Math.log2(129 / 128), note: ratioNote(129, 128) }, // height 14.01: the faintest fixed strength
    ];
    const [simple, complex, tiny] = extraTints(m, items, REP.c, 'size', 'strong');
    expect(simple.strength).toBeLessThan(TINT_MAX);
    expect(simple.strength).toBeGreaterThan(complex.strength);
    expect(complex.reach).toBeCloseTo(REACH_MIN, 12); // clamped at the most complex of the subset
    expect(tiny.strength).toBeCloseTo(TINT_MIN, 12);
    expect(tiny.reach).toBeCloseTo(REACH_MIN, 12);
    expect(simple.reach).toBeGreaterThan(REACH_MIN);
    expect(simple.reach).toBeLessThan(REACH_MAX);
    expect(simplest.h).toBeLessThan(Math.log2(28));
    // relative scale: the strength is spread over the subset's heights and clamped
    const [, rc] = extraTints(m, items, REP.c, 'size', 'strong', 'relative');
    expect(rc.strength).toBeCloseTo(TINT_MIN, 12);
    // 'faint' is the reverse of both
    const [, fc] = extraTints(m, items, REP.c, 'size', 'faint');
    expect(fc.reach).toBeCloseTo(REACH_MAX, 12);
    const [, fr] = extraTints(m, items, REP.c, 'size', 'faint', 'relative');
    expect(fr.strength).toBeCloseTo(TINT_MAX, 12);
  });
  it('no ratio (cents only) gets the middle strength, like an EDO subset cell', () => {
    const [t] = extraTints(m, [{ c: 333.3, note: null }], REP.c, 'size', 'strong');
    expect(t.strength).toBe(TINT_MIDDLE);
    expect(t.reach).toBe(REACH_MIDDLE);
    expect(t.pos).toBeCloseTo(333.3 / 1200, 12);
  });
  it('rank: a new size is ranked among the subset groups plus the new sizes; subset ranks are untouched', () => {
    const before = wheelPositions(m, REP.c, 'rank');
    const items = [
      { c: 100, note: null },
      { c: 100.001, note: null }, // the same new size
      { c: 1100, note: null },
    ];
    const [a, b, c] = extraTints(m, items, REP.c, 'rank', 'strong');
    expect(a.pos).toBe(b.pos);
    expect(a.pos).toBeCloseTo(0, 12); // smallest of all sizes: rank 0
    const n = m.groups.length;
    expect(c.pos).toBeCloseTo(((((n + 1) * 0.381966) % 1) + 1) % 1, 6); // 1100 c is above every subset group but 15/8 (1088.3): rank n
    expect(wheelPositions(m, REP.c, 'rank')).toEqual(before);
  });
  it('an added exact pitch against exact subset notes gets the real ratio; against a cents note it gets none', () => {
    const sub = [ratioNote(1, 1), ratioNote(5, 4), ratioNote(4, 3)];
    const places = sub.map((n) => n.c);
    const added = drawnAdded(['3/2'], places, REP.c);
    const cells = addedCells(places, added, REP.c, 20);
    const ad = parseInterval('3/2')!;
    const fromE = cells.find((c) => c.from.kind === 'subset' && c.from.i === 1)!;
    expect(fmtRatio(addedCellNote(fromE, sub[1], ad, REP)!)).toBe('6/5');
    const toE = cells.find((c) => c.to.kind === 'subset' && c.to.i === 1)!;
    expect(fmtRatio(addedCellNote(toE, ad, sub[1], REP)!)).toBe('5/3');
    expect(addedCellNote(fromE, centsNote(386.3137), ad, REP)).toBeNull();
    // and the tint of the exact one differs from the middle strength
    const mm = pairs(sub);
    const [t6] = extraTints(
      mm,
      [{ c: fromE.c, note: addedCellNote(fromE, sub[1], ad, REP) }],
      REP.c,
      'size',
      'strong'
    );
    expect(t6.strength).not.toBe(TINT_MIDDLE);
  });
});
