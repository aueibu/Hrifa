/** Acceptance of milestone M2c (arcs/interval-placement/ARC.md): spacing rules, spacing range, catalog, Pareto layers. */
import { describe, expect, it } from 'vitest';
import { EQUAL_WEIGHTS, paretoLayers } from '../consonance';
import {
  appendOccurrence,
  bottomNote,
  buildCatalog,
  catalogChunks,
  placeSpaced,
  rankCatalog,
  spacingCenters,
  spacingPreset,
  spacingWidths,
  SPACING_PRESETS_12,
  stepsToCents,
  type CatalogChunk,
  type CatalogEntry,
  type CatalogSpec,
  type SpacingRule,
  type TieMode,
} from './index';

const C2 = 65.406;
const steps = (xs: number[]) => xs.map((x) => x * 100);
const notes = (rule: SpacingRule, order: number[], W: number, tie: TieMode = 'middle') =>
  placeSpaced(rule, order, W, tie)?.notes;

function* permutations<T>(xs: T[]): Generator<T[]> {
  if (xs.length <= 1) {
    yield xs.slice();
    return;
  }
  for (let i = 0; i < xs.length; i++) {
    for (const rest of permutations(xs.filter((_, j) => j !== i))) {
      yield [xs[i], ...rest];
    }
  }
}

describe('the human examples (12-EDO, notes in steps from the base)', () => {
  const near = (a: number[], b: number[]) => {
    expect(a).toHaveLength(b.length);
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9));
  };
  it('equal 7 11 16 in 24: centers 3.5, 9.75, 16; notes 0 4 7 8 15 24', () => {
    near(spacingCenters('equal', [7, 11, 16], 24), [3.5, 9.75, 16]);
    expect(notes('equal', [7, 11, 16], 24)).toEqual([0, 4, 7, 8, 15, 24]);
  });
  it('equal 7 11 16 in 20: centers 3.5, 7.75, 12; notes 0 2 4 7 13 20', () => {
    near(spacingCenters('equal', [7, 11, 16], 20), [3.5, 7.75, 12]);
    expect(notes('equal', [7, 11, 16], 20)).toEqual([0, 2, 4, 7, 13, 20]);
  });
  it('equal 16 11 7 in 24 is the mirror of the first row', () => {
    near(spacingCenters('equal', [16, 11, 7], 24), [8, 14.25, 20.5]);
    expect(notes('equal', [16, 11, 7], 24)).toEqual([0, 9, 16, 17, 20, 24]);
  });
  it('equal 11 7 16 in 24: centers 5.5, 10.75, 16; notes 0 7 8 11 14 24', () => {
    near(spacingCenters('equal', [11, 7, 16], 24), [5.5, 10.75, 16]);
    expect(notes('equal', [11, 7, 16], 24)).toEqual([0, 7, 8, 11, 14, 24]);
  });
  it('shared 11 7 16 in 24: centers 8, 12, 16; 2 ties; the rounding twins; 8 is a shared note', () => {
    near(spacingCenters('shared', [11, 7, 16], 24), [8, 12, 16]);
    const mid = placeSpaced('shared', [11, 7, 16], 24, 'middle')!;
    expect(mid.notes).toEqual([3, 8, 14, 15, 24]);
    expect(mid.ties).toBe(2);
    expect(notes('shared', [11, 7, 16], 24, 'down')).toEqual([2, 8, 13, 15, 24]);
    expect(notes('shared', [11, 7, 16], 24, 'up')).toEqual([3, 8, 9, 14, 16, 24]);
    expect(placeSpaced('shared', [11, 7, 16], 24, 'down')!.ties).toBe(2);
  });
  it('shared 7 11 16 in 24: notes 5 6 8 12 17 24 (2 ties)', () => {
    const p = placeSpaced('shared', [7, 11, 16], 24)!;
    expect(p.notes).toEqual([5, 6, 8, 12, 17, 24]);
    expect(p.ties).toBe(2);
  });
  it('equal 7 16 11 in 19: the 16 ties at 0.5 and rounds up toward the middle; down twin 0 7 8 16 19', () => {
    near(spacingCenters('equal', [7, 16, 11], 19), [3.5, 8.5, 13.5]);
    const p = placeSpaced('equal', [7, 16, 11], 19)!;
    expect(p.notes).toEqual([0, 1, 7, 8, 17, 19]);
    expect(p.ties).toBe(1); // only the 16 (x = 0.5) is a tie
    expect(notes('equal', [7, 16, 11], 19, 'down')).toEqual([0, 7, 8, 16, 19]);
  });
  it('equal 11 16 7 in 19: the 16 rounds down; the exact mirror of the row above', () => {
    near(spacingCenters('equal', [11, 16, 7], 19), [5.5, 10.5, 15.5]);
    expect(notes('equal', [11, 16, 7], 19)).toEqual([0, 2, 11, 12, 18, 19]);
  });
  it('equal 7 11 16 in 15 cannot fit (16 > 15): null, never placed', () => {
    expect(placeSpaced('equal', [7, 11, 16], 15)).toBeNull();
    expect(placeSpaced('shared', [7, 11, 16], 15)).toBeNull();
  });
  it('a single interval sits at the bottom of the window (center d/2)', () => {
    for (const rule of ['equal', 'shared'] as const) {
      const p = placeSpaced(rule, [7], 12)!;
      expect(p.centers).toEqual([3.5]);
      expect(p.notes).toEqual([0, 7]);
    }
  });
  it('no intervals is an error, not an empty placement', () => {
    expect(() => placeSpaced('equal', [], 12)).toThrow(RangeError);
    expect(() => spacingCenters('shared', [], 12)).toThrow(RangeError);
  });
  it('bottomNote: middle rounds ties toward the window middle; a center on the middle rounds down', () => {
    expect(bottomNote(3.5, 7, 24, 'middle')).toEqual({ low: 0, tie: false });
    expect(bottomNote(8, 11, 24, 'middle')).toEqual({ low: 3, tie: true }); // below the middle: up
    expect(bottomNote(16, 11, 24, 'middle')).toEqual({ low: 10, tie: true }); // above: 10.5 -> down
    expect(bottomNote(12, 7, 24, 'middle')).toEqual({ low: 8, tie: true }); // on the middle: down
  });
});

describe('property tests over every ordering and window', () => {
  const sets = [
    [11, 7, 16],
    [7, 5, 11],
  ];
  const widths = Array.from({ length: 43 }, (_, i) => i + 6);
  it('equal spans the whole window, no note leaves [0, W], and too-narrow windows do not fit', () => {
    let placed = 0;
    for (const set of sets) {
      const M = Math.max(...set);
      for (const order of permutations(set)) {
        for (const W of widths) {
          const p = placeSpaced('equal', order, W);
          if (W < M) {
            expect(p).toBeNull();
            continue;
          }
          placed++;
          const ns = p!.notes;
          expect(ns[0]).toBe(0);
          expect(ns[ns.length - 1]).toBe(W);
          for (const [lo, hi] of p!.endpoints) {
            expect(lo).toBeGreaterThanOrEqual(0);
            expect(hi).toBeLessThanOrEqual(W);
          }
        }
      }
    }
    expect(placed).toBeGreaterThan(400);
  });
  it('shared never leaves [0, W] either', () => {
    for (const set of sets) {
      for (const order of permutations(set)) {
        for (const W of widths) {
          const p = placeSpaced('shared', order, W);
          if (p) {
            expect(Math.min(...p.notes)).toBeGreaterThanOrEqual(0);
            expect(Math.max(...p.notes)).toBeLessThanOrEqual(W);
          }
        }
      }
    }
  });
  it('reversing an ordering gives the mirror W - x under tieMode middle (equal rule)', () => {
    for (const set of sets) {
      for (const order of permutations(set)) {
        for (const W of widths) {
          const a = placeSpaced('equal', order, W);
          const b = placeSpaced('equal', [...order].reverse(), W);
          if (!a || !b) {
            continue;
          }
          expect(b.notes).toEqual(a.notes.map((x) => W - x).reverse());
        }
      }
    }
  });
  it('equal: the mirror fails only where a center is exactly the window middle and ties (pinned: 4 5 7 6 in 8)', () => {
    const a = placeSpaced('equal', [4, 5, 7, 6], 8)!;
    const b = placeSpaced('equal', [6, 7, 5, 4], 8)!;
    expect(a.centers).toEqual([2, 3, 4, 5]);
    expect(a.notes).toEqual([0, 1, 2, 4, 6, 7, 8]);
    expect(b.notes).toEqual([0, 2, 4, 6, 7, 8]);
    expect(b.notes).not.toEqual(a.notes.map((x) => 8 - x).reverse());
    // every exception, over sets that have them, has a center exactly on the middle
    let exceptions = 0;
    for (const set of [
      [4, 5, 6, 7],
      [1, 1, 1],
    ]) {
      for (const order of permutations(set)) {
        for (let W = Math.max(...set); W <= 30; W++) {
          const p = placeSpaced('equal', order, W)!;
          const q = placeSpaced('equal', [...order].reverse(), W)!;
          const mirror = p.notes.map((x) => W - x).reverse();
          if (JSON.stringify(mirror) !== JSON.stringify(q.notes)) {
            exceptions++;
            expect(p.centers.some((c) => Math.abs(c - W / 2) < 1e-9)).toBe(true);
          }
        }
      }
    }
    expect(exceptions).toBeGreaterThan(0);
  });
  it('shared: the mirror holds except where a center is exactly the window middle and ties (it rounds down on both sides)', () => {
    let exceptions = 0;
    for (const set of sets) {
      for (const order of permutations(set)) {
        for (const W of widths) {
          const a = placeSpaced('shared', order, W);
          const b = placeSpaced('shared', [...order].reverse(), W);
          if (!a || !b) {
            continue;
          }
          const mirror = a.notes.map((x) => W - x).reverse();
          const onMiddle = a.centers.some((c) => Math.abs(c - W / 2) < 1e-9);
          if (onMiddle) {
            if (JSON.stringify(mirror) !== JSON.stringify(b.notes)) {
              exceptions++;
            }
          } else {
            expect(b.notes).toEqual(mirror);
          }
        }
      }
    }
    expect(exceptions).toBeGreaterThan(0);
  });
  it('shared centers are the same for every ordering of one set', () => {
    for (const set of sets) {
      for (const W of widths) {
        if (W < Math.max(...set)) {
          continue;
        }
        const ref = spacingCenters('shared', set, W);
        for (const order of permutations(set)) {
          expect(spacingCenters('shared', order, W)).toEqual(ref);
        }
      }
    }
  });
});

describe('cross-check against m2c/catalog/worker2.ts', () => {
  // Fixture: copied from arcs/interval-placement/m2c/catalog/worker2.ts lines 25-68 (`centres`, `low`, `place`, the
  // part that decides the notes); importing it would pull `node:worker_threads` into the test.
  const TIE = 1e-9;
  function centres(rule: 'equal' | 'shared', order: number[], W: number): number[] {
    const n = order.length;
    if (rule === 'shared') {
      const h = Math.max(...order) / 2;
      return order.map((_, k) => h + (k * (W - 2 * h)) / (n - 1));
    }
    let D = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        D = Math.min(D, (W - (order[i] + order[j]) / 2) / (j - i));
      }
    }
    let c0 = -Infinity;
    for (let k = 0; k < n; k++) {
      c0 = Math.max(c0, order[k] / 2 - k * D);
    }
    return order.map((_, k) => c0 + k * D);
  }
  function low(c: number, d: number, W: number, tie: number): [number, boolean] {
    const x = c - d / 2;
    const f = Math.floor(x + TIE);
    if (Math.abs(x - f - 0.5) > TIE) {
      return [Math.round(x), false];
    }
    if (tie === 1) {
      return [f, true];
    }
    if (tie === 2) {
      return [f + 1, true];
    }
    return [c < W / 2 - TIE ? f + 1 : f, true];
  }
  function refPlace(rule: 'equal' | 'shared', order: number[], W: number, tie: number) {
    const cs = centres(rule, order, W);
    let ties = 0;
    const lows = order.map((d, k) => {
      const [lo, t] = low(cs[k], d, W, tie);
      if (t) {
        ties++;
      }
      return lo;
    });
    const ends: number[] = [];
    order.forEach((d, k) => ends.push(lows[k], lows[k] + d));
    return { notes: [...new Set(ends)].sort((a, b) => a - b), ties };
  }
  const modes: TieMode[] = ['middle', 'down', 'up'];
  it('notes and tie counts equal the reference for a sample of sets, windows, rules and tie modes', () => {
    let compared = 0;
    for (const set of [
      [11, 7, 16],
      [7, 5, 11],
      [3, 4, 5, 6],
      [2, 9],
      [4, 4, 7],
    ]) {
      const M = Math.max(...set);
      for (const order of permutations(set)) {
        for (let W = M; W <= 48; W++) {
          for (const rule of ['equal', 'shared'] as const) {
            modes.forEach((mode, t) => {
              const ref = refPlace(rule, order, W, t);
              const mine = placeSpaced(rule, order, W, mode)!;
              expect(mine.notes).toEqual(ref.notes);
              expect(mine.ties).toBe(ref.ties);
              compared++;
            });
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(5000);
  });
});

describe('spacing range and presets', () => {
  it('presets are data: close 6-12, open 13-24, wide 25-36, vast 37-48 at 12-EDO', () => {
    expect(SPACING_PRESETS_12).toEqual({
      close: { fromSteps: 6, toSteps: 12 },
      open: { fromSteps: 13, toSteps: 24 },
      wide: { fromSteps: 25, toSteps: 36 },
      vast: { fromSteps: 37, toSteps: 48 },
    });
    expect(spacingPreset('open')).toEqual({ fromSteps: 13, toSteps: 24 });
  });
  it('other EDOs: whole-octave tops, each preset starts one step above the previous (no gaps)', () => {
    expect(spacingPreset('close', 19)).toEqual({ fromSteps: 10, toSteps: 19 });
    expect(spacingPreset('open', 19)).toEqual({ fromSteps: 20, toSteps: 38 });
    expect(spacingPreset('wide', 19)).toEqual({ fromSteps: 39, toSteps: 57 });
    expect(spacingPreset('vast', 19)).toEqual({ fromSteps: 58, toSteps: 76 });
    expect(spacingPreset('close', 31)).toEqual({ fromSteps: 16, toSteps: 31 });
    expect(spacingPreset('open', 31)).toEqual({ fromSteps: 32, toSteps: 62 });
    expect(spacingPreset('vast', 31)).toEqual({ fromSteps: 94, toSteps: 124 });
    for (const edo of [5, 7, 12, 17, 19, 22, 31, 53]) {
      const names = ['close', 'open', 'wide', 'vast'] as const;
      for (let i = 1; i < names.length; i++) {
        expect(spacingPreset(names[i], edo).fromSteps).toBe(
          spacingPreset(names[i - 1], edo).toSteps + 1
        );
      }
    }
  });
  it('widths: steps or cents; from = to is one width; bad ranges throw', () => {
    expect(spacingWidths({ fromSteps: 24, toSteps: 24 }, 100)).toEqual([24]);
    expect(spacingWidths({ fromSteps: 6, toSteps: 9 }, 100)).toEqual([6, 7, 8, 9]);
    expect(spacingWidths({ fromCents: 600, toCents: 900 }, 100)).toEqual([6, 7, 8, 9]);
    expect(spacingWidths({ fromCents: 1200, toCents: 1200 }, 1200 / 19)).toEqual([19]);
    expect(() => spacingWidths({ fromSteps: 9, toSteps: 6 }, 100)).toThrow(RangeError);
    expect(() => spacingWidths({ fromSteps: 0, toSteps: 6 }, 100)).toThrow(RangeError);
    expect(() => spacingWidths({ fromCents: 110, toCents: 190 }, 100)).toThrow(RangeError);
  });
});

const spec = (set: number[], over: Partial<CatalogSpec> = {}): CatalogSpec => ({
  intervals: steps(set).map((cents) => ({ cents })),
  bottomHz: C2,
  spacing: { fromSteps: 24, toSteps: 24 },
  ...over,
});
const occurrenceFor = (
  entries: readonly CatalogEntry[],
  order: number[],
  W: number,
  tie: TieMode = 'middle'
) => {
  for (const e of entries) {
    for (const o of e.occurrences) {
      if (o.widthSteps === W && o.tieMode === tie && o.perm.join() === steps(order).join()) {
        return { entry: e, occurrence: o };
      }
    }
  }
  return undefined;
};

describe('catalog of 11 7 16 at width 24', () => {
  it('has one entry per distinct pitch set (6 orderings, 6 sets) and defaults to the equal rule', () => {
    const r = buildCatalog(spec([11, 7, 16]));
    expect(r.entries).toHaveLength(6);
    expect(r.orderings).toMatchObject({ total: 6, processed: 6, remaining: 0 });
    expect(r.placements).toBe(6);
    expect(r.cannotFit).toEqual([]);
    const hit = occurrenceFor(r.entries, [11, 7, 16], 24)!;
    expect(hit.entry.cents).toEqual(steps([0, 7, 8, 11, 14, 24]));
    expect(hit.entry.refHz).toBe(C2);
    expect(hit.occurrence.rule).toBe('equal');
    expect(hit.entry.flat.interference).toBeGreaterThan(0);
  });
  it('shared rule with the rounding twins listed together; 8 is a reported shared note', () => {
    const r = buildCatalog(
      spec([11, 7, 16], { rule: 'shared', tieMode: ['middle', 'down', 'up'] })
    );
    const mid = occurrenceFor(r.entries, [11, 7, 16], 24, 'middle')!;
    expect(mid.entry.cents).toEqual(steps([3, 8, 14, 15, 24]));
    expect(mid.occurrence.ties).toBe(2);
    expect(mid.entry.collisions).toHaveLength(1);
    expect(mid.entry.collisions[0]).toMatchObject({ cents: 800 });
    expect(mid.entry.collisions[0].sources).toHaveLength(2);
    expect(mid.entry.measures.collisions).toBe(1);
    expect(occurrenceFor(r.entries, [11, 7, 16], 24, 'down')!.entry.cents).toEqual(
      steps([2, 8, 13, 15, 24])
    );
    expect(occurrenceFor(r.entries, [11, 7, 16], 24, 'up')!.entry.cents).toEqual(
      steps([3, 8, 9, 14, 16, 24])
    );
  });
  it('every ordering at every width: 6 orderings x widths 16-20 = 30 placements', () => {
    const r = buildCatalog(spec([11, 7, 16], { spacing: { fromSteps: 16, toSteps: 20 } }));
    expect(r.placements).toBe(30);
    const total = r.entries.reduce((s, e) => s + e.occurrences.length, 0);
    expect(total).toBe(30);
    for (const e of r.entries) {
      for (const o of e.occurrences) {
        expect(o.endpoints.flat().every((c) => c >= 0 && c <= o.widthCents)).toBe(true);
      }
    }
  });
});

describe('cannot fit is counted per width and never placed', () => {
  it('7 11 16 over widths 12-18: widths 12-15 cannot fit (6 orderings each)', () => {
    const r = buildCatalog(spec([7, 11, 16], { spacing: { fromSteps: 12, toSteps: 18 } }));
    expect(r.cannotFit).toEqual(
      [12, 13, 14, 15].map((widthSteps) => ({ widthSteps, orderings: 6 }))
    );
    expect(r.placements).toBe(6 * 3);
    for (const e of r.entries) {
      for (const o of e.occurrences) {
        expect(o.widthSteps).toBeGreaterThanOrEqual(16);
      }
    }
  });
  it('a range with no fitting width gives an empty catalog, not an error', () => {
    const r = buildCatalog(spec([7, 11, 16], { spacing: { fromSteps: 12, toSteps: 15 } }));
    expect(r.entries).toEqual([]);
    expect(r.cannotFit.reduce((s, c) => s + c.orderings, 0)).toBe(24);
  });
});

describe('dedupe across widths', () => {
  it('shared 3 4 5 at widths 5 and 6: the set 0 1 4 5 is made at both widths, by several orderings', () => {
    const r = buildCatalog(
      spec([3, 4, 5], { rule: 'shared', spacing: { fromSteps: 5, toSteps: 6 } })
    );
    const e = r.entries.find((x) => x.cents.join() === steps([0, 1, 4, 5]).join())!;
    expect(e).toBeDefined();
    expect(new Set(e.occurrences.map((o) => o.widthSteps))).toEqual(new Set([5, 6]));
    expect(e.occurrences.length).toBeGreaterThan(2);
    expect(new Set(e.occurrences.map((o) => o.order.join())).size).toBeGreaterThan(1);
    // 6 orderings x 2 widths = 12 placements, fewer entries
    expect(r.placements).toBe(12);
    expect(r.entries.length).toBeLessThan(12);
  });
});

describe('other grids and JI', () => {
  for (const edo of [19, 31]) {
    it(`${edo}-EDO: the same step patterns as 12-EDO, in ${edo}-EDO cents`, () => {
      const q = 1200 / edo;
      const r = buildCatalog({
        intervals: [7, 11, 16].map((d) => ({ cents: stepsToCents(d, edo) })),
        bottomHz: C2,
        spacing: { fromSteps: 24, toSteps: 24 },
        stepCents: q,
      });
      const hit = r.entries.find((e) => e.occurrences.some((o) => o.order.join() === '0,1,2'))!;
      const want = [0, 4, 7, 8, 15, 24].map((s) => s * q);
      expect(hit.cents).toHaveLength(want.length);
      hit.cents.forEach((c, i) => expect(c).toBeCloseTo(want[i], 6));
      expect(r.placements).toBe(6);
    });
  }
  it('JI 5/4 + 3/2 in 12 steps (equal): bottom rounds to a grid step that keeps the span inside, top = bottom + exact span', () => {
    const third = 1200 * Math.log2(5 / 4);
    const fifth = 1200 * Math.log2(3 / 2);
    const r = buildCatalog({
      intervals: [{ cents: third }, { cents: fifth }],
      bottomHz: C2,
      spacing: { fromSteps: 12, toSteps: 12 },
    });
    const hit = r.entries.find((e) => e.occurrences.some((o) => o.order.join() === '0,1'))!;
    // centers 1.93, 8.49: the fifth wants bottom 4.98 -> 5, but 5 + 7.02 > 12, so it stays at 4
    expect(hit.cents).toHaveLength(4);
    expect(hit.cents[0]).toBeCloseTo(0, 9);
    expect(hit.cents[1]).toBeCloseTo(third, 9);
    expect(hit.cents[2]).toBeCloseTo(400, 9);
    expect(hit.cents[3]).toBeCloseTo(400 + fifth, 9);
    for (const e of r.entries) {
      expect(e.cents.every((c) => c >= -1e-9 && c <= 1200 + 1e-9)).toBe(true);
    }
    const p = placeSpaced('equal', [third / 100, fifth / 100], 12)!;
    expect(p.endpoints[1][1] - p.endpoints[1][0]).toBeCloseTo(fifth / 100, 12);
  });
});

describe('constraints', () => {
  it('must-not-have removes voicings containing the interval; must-have keeps only those; counts reported', () => {
    const all = buildCatalog(spec([11, 7, 16], { spacing: { fromSteps: 16, toSteps: 24 } }));
    const has = (e: CatalogEntry, c: number) =>
      e.cents.some((a) => e.cents.some((b) => Math.abs(b - a - c) < 1e-6));
    const without = buildCatalog(
      spec([11, 7, 16], {
        spacing: { fromSteps: 16, toSteps: 24 },
        constraints: { mustNotHave: [{ cents: 700 }] },
      })
    );
    expect(without.entries.every((e) => !has(e, 700))).toBe(true);
    expect(without.entries.length + without.filtered.mustNotHave).toBe(all.entries.length);
    expect(without.filtered.mustNotHave).toBeGreaterThan(0);
    const withIt = buildCatalog(
      spec([11, 7, 16], {
        spacing: { fromSteps: 16, toSteps: 24 },
        constraints: { mustHave: [{ cents: 500 }] },
      })
    );
    expect(withIt.entries.every((e) => has(e, 500))).toBe(true);
    expect(withIt.entries.length + withIt.filtered.mustHave).toBe(all.entries.length);
  });
  it('octave-equivalent mode and a constraint that removes everything (empty, no error)', () => {
    const r = buildCatalog(
      spec([11, 7, 16], { constraints: { mustNotHave: [{ cents: 700, octaveEquivalent: true }] } })
    );
    expect(
      r.entries.every((e) =>
        e.cents.every((a) => e.cents.every((b) => Math.abs(((b - a) % 1200) - 700) > 1e-6))
      )
    ).toBe(true);
    const none = buildCatalog(spec([11, 7, 16], { constraints: { mustHave: [{ cents: 12345 }] } }));
    expect(none.entries).toEqual([]);
    expect(none.filtered.mustHave).toBe(6);
  });
});

describe('ranking and Pareto layers', () => {
  it('paretoLayers peels the front repeatedly (min/min), respects senses, omits NaN points', () => {
    const pts = [
      [1, 5],
      [2, 2],
      [5, 1],
      [3, 3],
      [4, 4],
      [6, 6],
    ];
    expect(paretoLayers(pts)).toEqual([[0, 1, 2], [3], [4], [5]]);
    expect(
      paretoLayers([
        [1, 1],
        [2, 2],
        [3, 3],
      ])
    ).toEqual([[0], [1], [2]]);
    expect(
      paretoLayers(
        [
          [1, 1],
          [2, 2],
          [3, 3],
        ],
        ['min', 'max']
      )
    ).toEqual([[0, 1, 2]]);
    expect(
      paretoLayers(
        [
          [1, 1],
          [3, 3],
          [2, 2],
        ],
        ['max', 'max']
      )
    ).toEqual([[1], [2], [0]]);
    expect(
      paretoLayers([
        [1, Number.NaN],
        [2, 2],
      ])
    ).toEqual([[1]]);
    expect(paretoLayers([])).toEqual([]);
  });
  it('entries are sorted by the mix; layers follow the chosen keys and their senses', () => {
    const r = buildCatalog(spec([11, 7, 16], { spacing: { fromSteps: 16, toSteps: 30 } }));
    expect(r.entries.length).toBeGreaterThan(20);
    for (let i = 1; i < r.entries.length; i++) {
      expect(r.entries[i - 1].mix).toBeGreaterThanOrEqual(r.entries[i].mix);
    }
    // the best on the mix is never in a deeper layer than a few: layer 0 is non-empty and nothing dominates its members
    const front = r.entries.filter((e) => e.layer === 0);
    expect(front.length).toBeGreaterThan(0);
    for (const f of front) {
      for (const e of r.entries) {
        const dominates =
          e.flat.interference <= f.flat.interference &&
          e.flat.harmonicityPc >= f.flat.harmonicityPc &&
          (e.flat.interference < f.flat.interference ||
            e.flat.harmonicityPc > f.flat.harmonicityPc);
        expect(dominates).toBe(false);
      }
    }
    const byPer = rankCatalog(r.entries, {
      weights: { periodicity: -1 },
      paretoKeys: ['periodicity', 'harmonicityPc'],
    });
    for (let i = 1; i < byPer.length; i++) {
      expect(byPer[i - 1].flat.periodicity).toBeLessThanOrEqual(byPer[i].flat.periodicity + 1e-9);
    }
    expect(byPer.some((e) => e.layer === 0)).toBe(true);
  });
  it('weights: EQUAL_WEIGHTS ranks exactly as the default (harmonicity = harmonicityPc); unknown keys throw', () => {
    const r = buildCatalog(spec([11, 7, 16], { spacing: { fromSteps: 16, toSteps: 30 } }));
    const viaEqual = rankCatalog(r.entries, { weights: EQUAL_WEIGHTS });
    expect(viaEqual.map((e) => e.id)).toEqual(r.entries.map((e) => e.id));
    // not interference alone: the harmonicity column changes the order
    const interferenceOnly = rankCatalog(r.entries, { weights: { interference: -1 } });
    expect(interferenceOnly.map((e) => e.id)).not.toEqual(viaEqual.map((e) => e.id));
    expect(() => rankCatalog(r.entries, { weights: { roughness: -1 } as never })).toThrow(
      RangeError
    );
    expect(() => rankCatalog(r.entries, { weights: { interference: Number.NaN } })).toThrow(
      RangeError
    );
  });
});

describe('chunked iteration', () => {
  it('yields the same catalog as the one-shot function (worker protocol: entries cloned, extras appended)', () => {
    const s = spec([7, 11, 16], {
      rule: 'shared',
      spacing: { fromSteps: 16, toSteps: 30 },
      tieMode: ['middle', 'down'],
    });
    const clones = new Map<string, CatalogEntry>();
    let chunks = 0;
    let last: CatalogChunk | undefined;
    for (const chunk of catalogChunks(s, { chunkMs: 0 })) {
      chunks++;
      for (const e of chunk.entries) {
        clones.set(e.id, structuredClone(e));
      }
      for (const x of chunk.extraOccurrences) {
        const c = clones.get(x.id)!;
        const key = (o: CatalogEntry['occurrences'][number]) =>
          `${o.widthSteps}|${o.order}|${o.tieMode}|${o.rule}`;
        // an extra is never one the cloned entry already holds (no double counting for a naive consumer)
        expect(c.occurrences.map(key)).not.toContain(key(x.occurrence));
        appendOccurrence(c, structuredClone(x.occurrence));
      }
      last = chunk;
    }
    expect(chunks).toBeGreaterThan(3);
    expect(last!.done).toBe(true);
    const one = buildCatalog(s);
    expect(clones.size).toBe(one.entries.length);
    for (const e of one.entries) {
      const c = clones.get(e.id)!;
      expect(c.cents).toEqual(e.cents);
      expect(c.occurrences.map((o) => `${o.widthSteps}|${o.order}|${o.tieMode}`).sort()).toEqual(
        e.occurrences.map((o) => `${o.widthSteps}|${o.order}|${o.tieMode}`).sort()
      );
    }
    expect(last!.placements).toBe(one.placements);
    expect(last!.cannotFit).toEqual(one.cannotFit);
  });
  it('the cap counts orderings looked at and reports the remainder (8 intervals, cap 3)', () => {
    const r = buildCatalog(
      spec([1, 2, 3, 4, 5, 6, 7, 8], { spacing: { fromSteps: 24, toSteps: 24 }, cap: 3 })
    );
    expect(r.orderings).toMatchObject({ total: 40320, processed: 3, remaining: 40317 });
    expect(r.placements).toBe(3);
  });
});

describe('validation', () => {
  it('throws RangeError for bad specs', () => {
    expect(() => buildCatalog(spec([]))).toThrow(RangeError);
    expect(() => buildCatalog(spec([5], { bottomHz: 0 }))).toThrow(RangeError);
    expect(() => buildCatalog(spec([5], { rule: 'nope' as SpacingRule }))).toThrow(RangeError);
    expect(() => buildCatalog(spec([5], { tieMode: 'sideways' as TieMode }))).toThrow(RangeError);
    expect(() => buildCatalog(spec([5], { stepCents: 0 }))).toThrow(RangeError);
    expect(() => buildCatalog(spec([5], { spacing: { fromSteps: 8, toSteps: 6 } }))).toThrow(
      RangeError
    );
    expect(() => buildCatalog({ ...spec([5]), intervals: [{ cents: -1 }] })).toThrow(RangeError);
  });
});
