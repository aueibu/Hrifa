/** Acceptance criteria of milestone M2 (arcs/interval-placement/ARC.md), apart from the golden port check. */
import { describe, expect, it } from 'vitest';
import { scoreVoicing } from '../consonance';
import {
  checkConstraints,
  countOrderings,
  dedupe,
  DEFAULT_ORDERING_CAP,
  placeIntervals,
  placementChunks,
  placeOrdering,
  stepsToCents,
  transpositionScan,
  type PlacedVoicing,
  type PlacementSpec,
} from './index';

const C2 = 65.406;
const base = (steps: number[], over: Partial<PlacementSpec> = {}): PlacementSpec => ({
  intervals: steps.map((s) => ({ cents: s * 100 })),
  window: { bottomHz: C2, widthSteps: 36 },
  distribution: 'prefixSlack',
  ...over,
});

describe('essential vs induced, collisions', () => {
  it('lists the placed spans as essential pairs and every other pair as induced', () => {
    for (const v of placeIntervals(base([11, 7, 16])).voicings) {
      const n = v.cents.length;
      expect(v.essentialPairs.length + v.inducedPairs.length).toBe((n * (n - 1)) / 2);
      v.essentialPairs.forEach((p, k) => {
        expect(p.cents).toBeCloseTo(v.cents[p.high] - v.cents[p.low], 9);
        expect([11, 7, 16].map((s) => s * 100)).toContain(Math.round(p.cents));
        expect(k).toBeGreaterThanOrEqual(0);
      });
      const keys = new Set(
        [...v.essentialPairs, ...v.inducedPairs].map((p) => `${p.low},${p.high}`)
      );
      expect(keys.size).toBe((n * (n - 1)) / 2);
    }
  });

  it('a non-essential interval is placed but its pair is reported as induced', () => {
    const spec: PlacementSpec = base([4, 3]);
    spec.intervals[1].essential = false;
    const v = placeIntervals(spec).voicings[0];
    expect(v.essentialPairs).toHaveLength(1);
    expect(v.essentialPairs[0].cents).toBe(400);
    expect(v.inducedPairs.some((p) => p.cents === 300)).toBe(true);
  });

  it('reports collisions instead of merging them silently', () => {
    const res = placeIntervals(base([11, 7, 16]));
    const withCollision = res.voicings.filter((v) => v.collisions.length > 0);
    expect(withCollision.length).toBeGreaterThan(0);
    for (const v of withCollision) {
      expect(v.measures.collisions).toBe(v.collisions.length);
      // 6 endpoints, fewer notes: the difference is accounted for by the reported collisions
      const merged = v.collisions.reduce((s, c) => s + c.sources.length - 1, 0);
      expect(v.cents.length + merged).toBe(6);
      v.collisions.forEach((c) => {
        expect(c.sources.length).toBeGreaterThan(1);
        expect(v.cents[c.note]).toBeCloseTo(c.cents, 9);
      });
    }
  });

  it('a collision between two essential spans keeps one essential pair when both span the same notes', () => {
    const v = placeOrdering(
      base([4, 4], { distribution: 'uniform', window: { bottomHz: C2, widthSteps: 8 } }),
      [0, 1]
    )!;
    expect(v.cents).toEqual([0, 400, 800]);
    expect(v.collisions).toHaveLength(1);
  });
});

describe('dedupe', () => {
  it('orderings with the same pitch set give one voicing listing every ordering', () => {
    // two equal-size intervals reordered give the same pitch set under the uniform engine
    const res = placeIntervals(
      base([3, 4, 5], { distribution: 'uniform', window: { bottomHz: C2, widthSteps: 24 } })
    );
    const orderings = res.orderings.processed;
    expect(orderings).toBe(6);
    expect(res.voicings.reduce((n, v) => n + v.perms.length, 0)).toBe(orderings);
    const ids = res.voicings.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of res.voicings) {
      expect(v.perms[0].perm).toEqual(v.perm);
      expect(v.perms[0].order).toEqual(v.order);
    }
  });

  it('finds real duplicates and lists all their orderings', () => {
    const res = placeIntervals(base([11, 7, 16], { distribution: 'prefixDominance' }));
    const total = res.voicings.reduce((n, v) => n + v.perms.length, 0);
    expect(total).toBe(res.orderings.processed - res.skipped);
    // dedupe() on a concatenation merges identical ids
    const merged = dedupe([...res.voicings, ...res.voicings]);
    expect(merged).toHaveLength(res.voicings.length);
    merged.forEach((v, i) => expect(v.perms).toHaveLength(res.voicings[i].perms.length));
  });

  it('repeated interval sizes count each distinct ordering once', () => {
    const res = placeIntervals(base([4, 4, 3]));
    expect(res.orderings.total).toBe(3);
    expect(res.orderings.processed).toBe(3);
  });
});

describe('cap and the chunked iterator', () => {
  const eight = base([2, 3, 4, 5, 6, 7, 8, 9], { window: { bottomHz: C2, widthSteps: 60 } });

  it('8 intervals with the default cap process 5,040 orderings and report the remainder', () => {
    const res = placeIntervals(eight);
    expect(DEFAULT_ORDERING_CAP).toBe(5040);
    expect(res.orderings).toMatchObject({
      total: 40320,
      totalExact: true,
      processed: 5040,
      remaining: 35280,
    });
    expect(res.voicings.length).toBeGreaterThan(0);
    expect(res.voicings.reduce((n, v) => n + v.perms.length, 0) + res.skipped).toBe(5040);
  });

  it('a custom cap and an uncapped run', () => {
    expect(placeIntervals({ ...eight, cap: 100 }).orderings.processed).toBe(100);
    expect(placeIntervals(base([3, 4, 5], { cap: Infinity })).orderings.remaining).toBe(0);
  });

  it('yields chunks of at most 16 ms of work (generous margin) and the chunks add up to the full run', () => {
    const chunks = [...placementChunks(eight)];
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[chunks.length - 1].done).toBe(true);
    chunks.slice(0, -1).forEach((c) => expect(c.done).toBe(false));
    for (const c of chunks) {
      expect(c.elapsedMs).toBeLessThan(16 + 60);
    }
    const full = placeIntervals(eight);
    const ids = new Set(chunks.flatMap((c) => c.voicings.map((v) => v.id)));
    expect(ids).toEqual(new Set(full.voicings.map((v) => v.id)));
    const last = chunks[chunks.length - 1];
    expect(last.orderings).toEqual(full.orderings);
    expect(last.skipped).toBe(full.skipped);
  });

  it('a tiny budget forces many chunks (injected clock), with cross-chunk dedupe via extraOrderings', () => {
    let t = 0;
    const chunks = [
      ...placementChunks(base([11, 7, 16], { distribution: 'prefixDominance' }), {
        chunkMs: 1,
        now: () => t++,
      }),
    ];
    expect(chunks.length).toBeGreaterThan(2);
    const ids = chunks.flatMap((c) => c.voicings.map((v) => v.id));
    expect(new Set(ids).size).toBe(ids.length);
    const seen = new Set(ids);
    chunks.forEach((c) => c.extraOrderings.forEach((e) => expect(seen.has(e.id)).toBe(true)));
    const total =
      ids.length +
      chunks.reduce((n, c) => n + c.extraOrderings.length, 0) +
      chunks[chunks.length - 1].skipped;
    expect(total).toBe(chunks[chunks.length - 1].orderings.processed);
  });
});

describe('cents, 19-EDO and JI inputs', () => {
  it('places a 19-EDO input on the 19-EDO grid', () => {
    const q = 1200 / 19;
    const spec: PlacementSpec = {
      intervals: [6, 11, 5].map((s) => ({ cents: stepsToCents(s, 19) })),
      window: { bottomHz: C2, widthSteps: 38 },
      distribution: 'prefixSlack',
      stepCents: q,
    };
    const res = placeIntervals(spec);
    expect(res.voicings.length).toBeGreaterThan(0);
    for (const v of res.voicings) {
      v.cents.forEach((c) => expect(Math.abs(c / q - Math.round(c / q))).toBeLessThan(1e-9));
      v.essentialPairs.forEach((p) =>
        expect([6, 11, 5].map((s) => stepsToCents(s, 19))).toContainEqual(
          expect.closeTo(p.cents, 6)
        )
      );
      expect(v.cents[v.cents.length - 1]).toBeLessThanOrEqual(2400 + 1e-6);
    }
  });

  it('places a just-intonation input (spans that are not whole steps) without rounding them', () => {
    const jiCents = [386.3137138648348, 701.9550008653874, 1200 + 386.3137138648348]; // 5/4, 3/2, 5/2
    for (const distribution of [
      'uniform',
      'prefixSlack',
      'prefixDominance',
      'repulsion',
    ] as const) {
      const res = placeIntervals({
        intervals: jiCents.map((c) => ({ cents: c })),
        window: { bottomHz: C2, widthCents: 3600 },
        distribution,
      });
      expect(res.voicings.length).toBeGreaterThan(0);
      for (const v of res.voicings) {
        v.essentialPairs.forEach((p) => {
          expect(jiCents.some((c) => Math.abs(c - p.cents) < 1e-6)).toBe(true);
        });
        expect(v.meta.withinWindow).toBe(true);
      }
    }
  });

  it('accepts the window as cents or as steps equivalently', () => {
    const a = placeIntervals(base([5, 7], { window: { bottomHz: C2, widthSteps: 24 } }));
    const b = placeIntervals(base([5, 7], { window: { bottomHz: C2, widthCents: 2400 } }));
    expect(b.voicings.map((v) => v.cents)).toEqual(a.voicings.map((v) => v.cents));
  });

  it('voicings are consonance-library voicings anchored at the window bottom', () => {
    const v = placeIntervals(base([4, 3])).voicings[0];
    expect(v.refHz).toBe(C2);
    expect(scoreVoicing(v).freqsHz[0]).toBeCloseTo(C2 * 2 ** (v.cents[0] / 1200), 9);
  });
});

describe('constraints', () => {
  const spec = base([11, 7, 16]);
  const all = placeIntervals(spec);
  const has = (v: PlacedVoicing, c: number) =>
    [...v.essentialPairs, ...v.inducedPairs].some((p) => Math.abs(p.cents - c) < 1e-6);
  const hasOct = (v: PlacedVoicing, c: number) =>
    [...v.essentialPairs, ...v.inducedPairs].some(
      (p) => Math.abs((((p.cents - c) % 1200) + 1200) % 1200) < 1e-6
    );

  it('must-not-have (exact) removes every voicing containing the interval and reports the count', () => {
    const res = placeIntervals({ ...spec, constraints: { mustNotHave: [{ cents: 400 }] } });
    expect(all.voicings.some((v) => has(v, 400))).toBe(true);
    expect(res.voicings.every((v) => !has(v, 400))).toBe(true);
    expect(res.filtered.mustNotHave).toBe(all.voicings.filter((v) => has(v, 400)).length);
    expect(res.voicings.length + res.filtered.total).toBe(all.voicings.length);
  });

  it('must-not-have (octave-equivalent) also removes compound forms', () => {
    const res = placeIntervals({
      ...spec,
      constraints: { mustNotHave: [{ cents: 400, octaveEquivalent: true }] },
    });
    expect(res.voicings.every((v) => !hasOct(v, 400))).toBe(true);
    expect(res.filtered.mustNotHave).toBe(all.voicings.filter((v) => hasOct(v, 400)).length);
    const exact = placeIntervals({ ...spec, constraints: { mustNotHave: [{ cents: 400 }] } });
    expect(res.filtered.mustNotHave).toBeGreaterThanOrEqual(exact.filtered.mustNotHave);
  });

  it('must-have keeps only voicings containing the interval; reports the rest', () => {
    const res = placeIntervals({ ...spec, constraints: { mustHave: [{ cents: 700 }] } });
    expect(res.voicings.length).toBeGreaterThan(0);
    expect(res.voicings.every((v) => has(v, 700))).toBe(true);
    expect(res.filtered.mustHave).toBe(all.voicings.filter((v) => !has(v, 700)).length);
    const oct = placeIntervals({
      ...spec,
      constraints: { mustHave: [{ cents: 700, octaveEquivalent: true }] },
    });
    expect(oct.voicings.every((v) => hasOct(v, 700))).toBe(true);
    expect(oct.voicings.length).toBeGreaterThanOrEqual(res.voicings.length);
  });

  it('tolerance widens the match', () => {
    const tight = placeIntervals({ ...spec, constraints: { mustHave: [{ cents: 703 }] } });
    const loose = placeIntervals({
      ...spec,
      constraints: { mustHave: [{ cents: 703, toleranceCents: 5 }] },
    });
    expect(tight.voicings).toHaveLength(0);
    expect(loose.voicings.length).toBeGreaterThan(0);
  });

  it('a constraint that removes everything gives an empty result, not an error', () => {
    const res = placeIntervals({ ...spec, constraints: { mustHave: [{ cents: 50 }] } });
    expect(res.voicings).toEqual([]);
    expect(res.filtered.mustHave).toBe(all.voicings.length);
    const res2 = placeIntervals({
      ...spec,
      constraints: {
        mustNotHave: [
          { cents: 1100, octaveEquivalent: true },
          { cents: 700, octaveEquivalent: true },
          { cents: 400, octaveEquivalent: true },
        ],
      },
    });
    expect(res2.voicings.length + res2.filtered.total).toBe(all.voicings.length);
  });

  it('checkConstraints checks must-not-have first', () => {
    const pairs = [{ low: 0, high: 1, cents: 700 }];
    expect(
      checkConstraints(pairs, { mustNotHave: [{ cents: 700 }], mustHave: [{ cents: 100 }] })
    ).toBe('mustNotHave');
    expect(checkConstraints(pairs, { mustHave: [{ cents: 100 }] })).toBe('mustHave');
    expect(checkConstraints(pairs, undefined)).toBe('ok');
  });

  it('a voicing rejected once is counted once even if several orderings reach it', () => {
    const res = placeIntervals({
      ...spec,
      distribution: 'prefixDominance',
      constraints: { mustHave: [{ cents: 50 }] },
    });
    const unfiltered = placeIntervals({ ...spec, distribution: 'prefixDominance' });
    expect(res.filtered.total).toBe(unfiltered.voicings.length);
  });
});

describe('descriptive measures', () => {
  it('computes span, count, centroid, lowest note, distinct induced intervals and collisions', () => {
    const v = placeOrdering(
      base([4, 3], { distribution: 'uniform', window: { bottomHz: C2, widthSteps: 24 } }),
      [0, 1]
    )!;
    const m = v.measures;
    expect(m.noteCount).toBe(v.cents.length);
    expect(m.spanCents).toBe(v.cents[v.cents.length - 1] - v.cents[0]);
    expect(m.centroidCents).toBeCloseTo(v.cents.reduce((s, c) => s + c, 0) / v.cents.length, 9);
    expect(m.centroidHz).toBeCloseTo(C2 * 2 ** (m.centroidCents / 1200), 9);
    expect(m.lowestCents).toBe(v.cents[0]);
    expect(m.lowestHz).toBeCloseTo(C2 * 2 ** (v.cents[0] / 1200), 9);
    expect(m.distinctInduced).toBe(
      new Set(v.inducedPairs.map((p) => Math.round(p.cents * 1e6))).size
    );
    expect(m.collisions).toBe(0);
  });

  it('hand-checked example: uniform, window 24, spans 4 then 3 -> notes 0 400 2000 2300', () => {
    // anchors 2 and 22 (safe range [2, 22]); 4 -> [0,4], 3 -> [20,23] in steps
    const v = placeOrdering(
      base([4, 3], { distribution: 'uniform', window: { bottomHz: C2, widthSteps: 24 } }),
      [0, 1]
    )!;
    expect(v.cents).toEqual([0, 400, 2000, 2300]);
    expect(v.measures.spanCents).toBe(2300);
    expect(v.measures.centroidCents).toBe(1175);
    expect(v.measures.lowestCents).toBe(0);
    expect(v.measures.distinctInduced).toBe(4); // 2000, 2300, 1600, 1900
    expect(v.measures.noteCount).toBe(4);
    expect(v.essentialPairs.map((p) => p.cents)).toEqual([400, 300]);
  });
});

describe('transpositionScan', () => {
  const v = { refHz: C2, cents: [0, 400, 700] };

  it('shifts the voicing through the range, endpoints included', () => {
    const scan = transpositionScan(v, { fromCents: 0, toCents: 2400, stepCents: 600 });
    expect(scan.map((p) => p.shiftCents)).toEqual([0, 600, 1200, 1800, 2400]);
    expect(scan[2].voicing.refHz).toBeCloseTo(C2 * 2, 9);
    expect(scan[2].voicing.cents).toEqual(v.cents);
    expect(scan[0].scores).toBeUndefined();
  });

  it('optionally scores each point with scoreVoicing; interference falls with register (M3 low vs high)', () => {
    const scan = transpositionScan(
      { refHz: C2, cents: [0, 400] },
      { fromCents: 0, toCents: 2400, stepCents: 1200 },
      { score: true }
    );
    const hk = scan.map((p) => p.scores!.interference.hutchinsonKnopoff.total);
    expect(hk[0]).toBeGreaterThan(hk[1]);
    expect(hk[1]).toBeGreaterThan(hk[2]);
    expect(scan[1].scores!.freqsHz[0]).toBeCloseTo(C2 * 2, 9);
  });

  it('supports negative shifts and rejects bad ranges', () => {
    expect(
      transpositionScan(v, { fromCents: -100, toCents: 100, stepCents: 100 }).map(
        (p) => p.shiftCents
      )
    ).toEqual([-100, 0, 100]);
    expect(() => transpositionScan(v, { fromCents: 0, toCents: 100, stepCents: 0 })).toThrow(
      RangeError
    );
    expect(() => transpositionScan(v, { fromCents: 100, toCents: 0, stepCents: 10 })).toThrow(
      RangeError
    );
  });
});

describe('input validation and window behaviour', () => {
  it('rejects bad specs with RangeError', () => {
    expect(() => placeIntervals(base([]))).toThrow(RangeError);
    expect(() => placeIntervals(base([3], { window: { bottomHz: 0, widthSteps: 12 } }))).toThrow(
      RangeError
    );
    expect(() => placeIntervals(base([3], { window: { bottomHz: C2 } }))).toThrow(RangeError);
    expect(() =>
      placeIntervals(base([3], { window: { bottomHz: C2, widthSteps: 12, widthCents: 1200 } }))
    ).toThrow(RangeError);
    expect(() => placeIntervals({ ...base([3]), intervals: [{ cents: -1 }] })).toThrow(RangeError);
  });

  it('orderings that do not fit are counted as skipped, not dropped silently', () => {
    const res = placeIntervals(base([30, 20], { window: { bottomHz: C2, widthSteps: 24 } }));
    expect(res.voicings).toHaveLength(0);
    expect(res.skipped).toBe(2);
  });

  it('flags uniform placements that stick out of a too-narrow window', () => {
    const res = placeIntervals(
      base([11, 7, 16], { distribution: 'uniform', window: { bottomHz: C2, widthSteps: 12 } })
    );
    expect(res.voicings.every((v) => !v.meta.withinWindow)).toBe(true);
  });

  it('is pure: the same spec gives the same result', () => {
    expect(placeIntervals(base([11, 7, 16]))).toEqual(placeIntervals(base([11, 7, 16])));
  });

  it('odd bias attaches to the interval by default (and to the span position under "position")', () => {
    const spec = base([3, 4], { distribution: 'prefixSlack' });
    spec.intervals[0].oddBias = 'up';
    const byInterval = placeIntervals(spec);
    const byPosition = placeIntervals({ ...spec, oddBiasSemantics: 'position' });
    const third = (r: ReturnType<typeof placeIntervals>) =>
      r.voicings.map((v) => v.endpoints[v.perm.indexOf(300)].map((e) => e % 100));
    expect(third(byInterval)).toBeDefined();
    // order [4,3]: the 3 is second; with 'position' it takes the bias of position 1 ('down'), with 'interval' it keeps 'up'
    const iv = byInterval.voicings.find((v) => v.perm[0] === 400)!;
    const pv = byPosition.voicings.find((v) => v.perm[0] === 400)!;
    const lowOf3 = (v: PlacedVoicing) => v.endpoints[1][0];
    expect(lowOf3(iv)).not.toBe(lowOf3(pv));
  });
});

describe('M2 attempt 2 fixes', () => {
  it('window-inside check is computed for every engine (item 2 examples)', () => {
    const dominance = placeIntervals({
      intervals: [{ cents: 700 }],
      window: { bottomHz: C2, widthSteps: 24 },
      distribution: 'prefixDominance',
    }).voicings[0];
    expect(dominance.endpoints).toEqual([[-100, 600]]);
    expect(dominance.meta.withinWindow).toBe(false);
    const repulsion = placeIntervals({
      intervals: [{ cents: 2000 }, { cents: 400 }],
      window: { bottomHz: C2, widthSteps: 12 },
      distribution: 'repulsion',
    });
    expect(repulsion.skipped).toBe(0);
    expect(repulsion.voicings.some((v) => v.cents.join() === '-800,0,400,1200')).toBe(true);
    expect(repulsion.voicings.every((v) => !v.meta.withinWindow)).toBe(true);
    const fits = placeIntervals(base([4, 3]));
    expect(fits.voicings.every((v) => v.meta.withinWindow)).toBe(true);
  });

  it('chunk timer does not charge the consumer time between pulls', () => {
    let t = 0;
    const it = placementChunks(base([11, 7, 16, 5], { distribution: 'prefixDominance' }), {
      chunkMs: 5,
      now: () => t++,
    });
    const sizes: number[] = [];
    let before = 0;
    for (;;) {
      const r = it.next();
      if (r.done) {
        break;
      }
      sizes.push(r.value.orderings.processed - before);
      before = r.value.orderings.processed;
      t += 1000; // the consumer is slow
      if (r.value.done) {
        break;
      }
    }
    expect(sizes.length).toBeGreaterThan(2);
    sizes.slice(0, -1).forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
  });

  it('keeps per-ordering essential pairs and endpoints; flags when they vary', () => {
    const res = placeIntervals(
      base([2, 9, 5, 12], { distribution: 'prefixSlack', window: { bottomHz: C2, widthSteps: 18 } })
    );
    const multi = res.voicings.filter((v) => v.perms.length > 1);
    expect(multi.length).toBeGreaterThan(0);
    for (const v of multi) {
      expect(v.perms[0].essentialPairs).toEqual(v.essentialPairs);
      const sig = (ps: PlacedVoicing['essentialPairs']) =>
        ps
          .map((p) => `${p.low},${p.high}`)
          .sort()
          .join(';');
      const differs = v.perms.some((r) => sig(r.essentialPairs) !== sig(v.essentialPairs));
      expect(v.essentialVaries).toBe(differs);
      v.perms.forEach((r) => expect(r.endpoints).toHaveLength(4));
    }
    expect(res.voicings.every((v) => typeof v.essentialVaries === 'boolean')).toBe(true);
    expect(multi.some((v) => v.essentialVaries)).toBe(true);
  });

  it('exposes order; equal sizes with different bias or essential flags stay distinct, and dedupe keeps them', () => {
    const spec = base([3, 3, 4]);
    spec.intervals[0].oddBias = 'up';
    spec.intervals[1].essential = false;
    const res = placeIntervals({ ...spec, cap: Infinity });
    expect(res.orderings.total).toBe(6); // the two 3s are not interchangeable
    const all = res.voicings.flatMap((v) => v.perms.map((r) => r.order.join()));
    expect(new Set(all).size).toBe(6 - res.skipped);
    res.voicings.forEach((v) => expect(v.order.length).toBe(3));
    const merged = dedupe([...res.voicings, ...res.voicings]);
    expect(merged.reduce((n, v) => n + v.perms.length, 0)).toBe(all.length);
    // the input voicings are not mutated
    expect(res.voicings.reduce((n, v) => n + v.perms.length, 0)).toBe(all.length);
  });

  it('snaps a fractional window down to whole steps when every span is whole', () => {
    const res = placeIntervals({
      intervals: [{ cents: 500 }, { cents: 700 }],
      window: { bottomHz: C2, widthCents: 2450 },
      distribution: 'prefixSlack',
    });
    expect(res.voicings.length).toBeGreaterThan(0);
    for (const v of res.voicings) {
      v.cents.forEach((c) => expect(c % 100).toBe(0));
      expect(v.meta.withinWindow).toBe(true);
      expect(v.cents[v.cents.length - 1]).toBeLessThanOrEqual(2400);
    }
  });

  it('counts orderings exactly for huge n', () => {
    const equal = placeIntervals({
      intervals: Array.from({ length: 180 }, () => ({ cents: 200 })),
      window: { bottomHz: C2, widthSteps: 600 },
      distribution: 'prefixSlack',
    });
    expect(equal.orderings).toMatchObject({
      total: 1,
      totalExact: true,
      totalText: '1',
      processed: 1,
      remaining: 0,
    });
    const distinct = placeIntervals({
      intervals: Array.from({ length: 25 }, (_v, i) => ({ cents: 100 * (i + 1) })),
      window: { bottomHz: C2, widthSteps: 400 },
      distribution: 'prefixSlack',
      cap: 3,
    });
    expect(distinct.orderings.totalText).toBe('15511210043330985984000000'); // 25!
    expect(distinct.orderings.totalExact).toBe(false);
    expect(distinct.orderings.processed).toBe(3);
    expect(distinct.orderings.total).toBeCloseTo(1.5511210043330986e25, -10);
    expect(countOrderings([2, 2, 1])).toBe(30n);
    expect(countOrderings([1, 1, 1, 1, 1, 1, 1, 1])).toBe(40320n);
  });

  it('validates engine params, constraints and the distribution', () => {
    const bad = (over: Partial<PlacementSpec>) => () => placeIntervals(base([3, 4], over));
    expect(bad({ params: { anchorAlpha: Number.NaN } })).toThrow(RangeError);
    expect(bad({ params: { repulseKappa: Infinity } })).toThrow(RangeError);
    expect(bad({ params: { repulseIterations: -1 } })).toThrow(RangeError);
    expect(bad({ constraints: { mustHave: [{ cents: Number.NaN }] } })).toThrow(RangeError);
    expect(bad({ constraints: { mustNotHave: [{ cents: Infinity }] } })).toThrow(RangeError);
    expect(bad({ constraints: { mustHave: [{ cents: 700, toleranceCents: -1 }] } })).toThrow(
      RangeError
    );
    expect(
      bad({ constraints: { mustHave: [{ cents: 700, toleranceCents: Number.NaN }] } })
    ).toThrow(RangeError);
    expect(bad({ distribution: 'gravity' as never })).toThrow(RangeError);
    expect(bad({ params: { anchorAlpha: 0.5 } })).not.toThrow();
  });
});
