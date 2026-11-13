// Retuner engine + Infinitone-parity scorer. Data-like cases (pivot picks, degree lookup, re-root bases) live in
// vectors.json; these are the behaviour tests (invariants, scorer ordering and bands, comma drift, Fixed rules).
import { describe, expect, it } from 'vitest';
import {
  parseInterval,
  fmtRatio,
  mCents,
  mFrac,
  rerootCards,
  retuneStep,
  scorePeriodicityInfinitone,
  REF_HZ,
  type HeldNote,
  type Monzo,
  type Note,
  type RetunerCard,
} from './index';

const P = (s: string): Note => parseInterval(s) as Note;
const REP = P('2/1');
const mk = (name: string, notes: string[], base = '1/1'): RetunerCard => ({
  name,
  notes: notes.map(P),
  rep: REP,
  base: P(base),
});
// A: 5-limit major with the 9/8 second. B: the same scale with the 10/9 second (only degree 1 differs, by 81/80).
const A = ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'];
const B = ['1/1', '10/9', '5/4', '4/3', '3/2', '5/3', '15/8'];
const cardsOf = () => [mk('home', A), mk('A', A), mk('B', B)];
const held = (...xs: [number, number, number][]): HeldNote[] =>
  xs.map(([key, deg, oct], i) => ({ key, deg, oct, t: i }));

describe('scorePeriodicityInfinitone', () => {
  const f = 220;
  const c = (r: number) => f * 2 ** (r / 1200);
  const s = (fr: number[]) => scorePeriodicityInfinitone(fr).score;
  // Cell counts measured in notes/AUTORETUNER.md (root 220 Hz). Our reconstruction reproduces them; the test allows
  // a 5 % band, not exact counts.
  const table: [string, number[], number][] = [
    ['single note', [f], 374],
    ['JI 3/2', [f, f * 1.5], 634],
    ['12-EDO fifth', [f, c(700)], 1390],
    ['JI 4:5:6', [f, f * 1.25, f * 1.5], 901],
    ['12-EDO major', [f, c(400), c(700)], 2805],
    ['JI 4:5:6:7', [f, f * 1.25, f * 1.5, f * 1.75], 771],
    ['12-EDO dom7', [f, c(400), c(700), c(1000)], 2623],
    ['JI 10:12:15', [f, f * 1.2, f * 1.5], 1996],
    ['12-EDO minor', [f, c(300), c(700)], 2850],
    ['tritone 45/32', [f, f * (45 / 32)], 3275],
  ];
  it.each(table)('%s is within 5 percent of the measured Infinitone count', (_n, fr, want) => {
    const got = s(fr);
    expect(got).toBeGreaterThan(want * 0.95);
    expect(got).toBeLessThan(want * 1.05);
  });

  it('orders: unison < 3/2 < 12-EDO fifth; 4:5:6 < 12-EDO major; 4:5:6:7 < 12-EDO dom7; 45/32 worst', () => {
    const v = Object.fromEntries(table.map(([n, fr]) => [n, s(fr)]));
    expect(v['single note']).toBeLessThan(v['JI 3/2']);
    expect(v['JI 3/2']).toBeLessThan(v['12-EDO fifth']);
    expect(v['JI 4:5:6']).toBeLessThan(v['12-EDO major']);
    expect(v['JI 4:5:6:7']).toBeLessThan(v['12-EDO dom7']);
    const worst = Math.max(...Object.values(v));
    expect(v['tritone 45/32']).toBe(worst);
  });

  it('is empty-safe: no notes scores 999999', () => {
    expect(scorePeriodicityInfinitone([]).score).toBe(999999);
  });

  // Pitch bias. The ARC expected "4:5:6 at 55 Hz clearly worse than at 440 Hz". The reconstruction (which matches
  // every number in AUTORETUNER.md) does NOT show that: 896 vs 889. What the fixed 0.1 s window really does is below
  // (see the M2 report).
  it('pitch bias: the fixed window flatters very low chords and cannot tell tempered from just in the bass', () => {
    const maj = (b: number) => scorePeriodicityInfinitone([b, b * 1.25, b * 1.5]).score;
    const edo = (b: number) =>
      scorePeriodicityInfinitone([b, b * 2 ** (400 / 1200), b * 2 ** (700 / 1200)]).score;
    // below about 40 Hz the common period of 4:5:6 exceeds 0.1 s, the curve cannot close, fewer cells are filled
    expect(maj(20)).toBeLessThan(maj(440) * 0.6);
    // high chords are sampled sparsely and score worse than the same chord lower down
    expect(maj(1760)).toBeGreaterThan(maj(440) * 1.1);
    // the gap between 12-EDO and JI majors collapses in the bass
    expect(edo(55) - maj(55)).toBeLessThan((edo(440) - maj(440)) * 0.2);
  });
});

describe('rerootCards', () => {
  it('keeps the pivot pitch in every card (<= 1e-9 c), exact monzo bases for JI cards', () => {
    const cards = [mk('A', A, '3/2'), mk('B', B), mk('C', A, '9/8')];
    for (const ref of [0, 1, 2]) {
      for (let D = 0; D < 7; D++) {
        const bases = rerootCards(cards, ref, D);
        const pivot = cards[ref].base.c + cards[ref].notes[D].c;
        bases.forEach((b, i) => {
          expect(b).not.toBeNull();
          const base = b as { m: Monzo | null; c: number };
          expect(Math.abs(base.c + cards[i].notes[D].c - pivot)).toBeLessThan(1e-9);
          expect(base.m).not.toBeNull();
          expect(Math.abs(base.c - mCents(base.m as Monzo))).toBeLessThan(1e-9);
        });
      }
    }
  });

  it('works with irrational (EDO) cards: cents only, pivot kept', () => {
    const edo = (name: string, n: number): RetunerCard => ({
      name,
      notes: Array.from({ length: n }, (_, i) => ({ m: i ? null : {}, c: (1200 * i) / n })),
      rep: REP,
      base: { m: {}, c: 0 },
    });
    const cards = [edo('12', 12), edo('19', 19)];
    const [r0, r1] = rerootCards(cards, 0, 7);
    expect(r0?.c).toBe(0);
    expect(r1?.m).toBeNull();
    expect(Math.abs((r1?.c ?? 0) + cards[1].notes[7].c - cards[0].notes[7].c)).toBeLessThan(1e-9);
  });
});

describe('retuneStep: comma drift', () => {
  // I - vi - ii - V - I with held keys (MIDI numbers). deg/oct are in the card that is active when the chord is
  // played; the pivot is the common tone with the previous chord (Manual, key given).
  //   vi  A C E  : degrees 5, 0 (oct 1), 2 (oct 1)       pivot A
  //   ii  D F A  : degrees 1, 3, 5                        pivot A
  //   V   G B D' : degrees 4, 6, 1 (oct 1)                pivot D'
  //   I   C E G  : degrees 0, 2, 4                        pivot G
  const steps: { h: [number, number, number][]; pivot: number }[] = [
    {
      h: [
        [60, 0, 0],
        [64, 2, 0],
        [67, 4, 0],
      ],
      pivot: 60,
    },
    {
      h: [
        [69, 5, 0],
        [72, 0, 1],
        [76, 2, 1],
      ],
      pivot: 69,
    },
    {
      h: [
        [62, 1, 0],
        [65, 3, 0],
        [69, 5, 0],
      ],
      pivot: 69,
    },
    {
      h: [
        [67, 4, 0],
        [71, 6, 0],
        [74, 1, 1],
      ],
      pivot: 74,
    },
    {
      h: [
        [60, 0, 0],
        [64, 2, 0],
        [67, 4, 0],
      ],
      pivot: 67,
    },
  ];
  const run = (anchor: 'freestyle' | 'fixed') => {
    let cards = cardsOf().map((c) => ({ ...c, home: c.base }));
    let active = 1;
    const out: { chosen: number; drift: string; driftCents: number }[] = [];
    for (const st of steps) {
      const r = retuneStep(
        { cards, active, held: held(...st.h) },
        { pivotMode: 'manual', manualKey: st.pivot, anchor }
      );
      out.push({
        chosen: r.chosen,
        drift: r.drift.m ? fmtRatio(r.drift as Note) : '?',
        driftCents: r.drift.c,
      });
      cards = cards.map((c, i) => ({ ...c, base: r.bases[i] }));
      active = r.chosen;
    }
    return { out, cards };
  };

  it('Freestyle: the 5-limit cards accumulate the syntonic comma (tonic ends 80/81), exactly', () => {
    const { out, cards } = run('freestyle');
    // vi and I tie (A and B play the same notes): lowest index wins; ii wants B (10:12:15); V wants a 9/8 card again
    expect(out.map((o) => o.chosen)).toEqual([0, 0, 2, 0, 0]);
    expect(out.map((o) => o.drift)).toEqual(['1/1', '1/1', '1/1', '80/81', '80/81']);
    expect(out[4].driftCents).toBeCloseTo(-21.5063, 3);
    // the ratio is exactly the syntonic comma, as a monzo: 80/81 = 2^4 3^-4 5^1
    expect(cards[0].base.m).toEqual({ 2: 4, 3: -4, 5: 1 });
    expect(mFrac(cards[0].base.m as Monzo)).toEqual([80n, 81n]);
  });

  it('Fixed: the home scale never moves; drift is exactly 0 and card 0 is never chosen', () => {
    const { out, cards } = run('fixed');
    expect(out.every((o) => o.chosen !== 0)).toBe(true);
    expect(out.map((o) => o.chosen)).toEqual([1, 1, 2, 1, 1]);
    expect(out.map((o) => o.drift)).toEqual(['1/1', '1/1', '1/1', '1/1', '1/1']);
    expect(out.every((o) => o.driftCents === 0)).toBe(true);
    expect(cards[0].base.m).toEqual({});
    expect(cards[0].base.c).toBe(0);
  });
});

describe('retuneStep: Fixed, ties and why', () => {
  it('Fixed never chooses card 0 even when it would score best; the reference is card 0', () => {
    const cards = cardsOf();
    const h = held([60, 0, 0], [64, 2, 0], [67, 4, 0]);
    const free = retuneStep({ cards, active: 0, held: h }, { pivotMode: 'lowest' });
    expect(free.chosen).toBe(0); // all three cards play the same chord for degrees 0, 2, 4: tie, lowest index
    const fixed = retuneStep(
      { cards, active: 0, held: h },
      { pivotMode: 'lowest', anchor: 'fixed' }
    );
    expect(fixed.chosen).toBe(1);
    expect(fixed.scores[0]).toBe(999999);
    expect(fixed.predictions[0]).toEqual([]);
    expect(fixed.why.reference).toBe(0);
    expect(fixed.why.entries[0].eligible).toBe(false);
    expect(fixed.why.entries[0].rank).toBeNull();
  });

  it('ties go to the lowest index, whatever the scorer', () => {
    const cards = [mk('x', A), mk('y', A), mk('z', A)];
    const h = held([60, 0, 0], [67, 4, 0]);
    const r = retuneStep({ cards, active: 2, held: h }, { pivotMode: 'lowest', scorer: () => 5 });
    expect(r.chosen).toBe(0);
    expect(r.why.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('why: pivot, reference, per-card base, predicted chord, score, winner', () => {
    const cards = cardsOf();
    const h = held([62, 1, 0], [65, 3, 0], [69, 5, 0]);
    const r = retuneStep({ cards, active: 1, held: h }, { pivotMode: 'manual', manualKey: 69 });
    expect(r.chosen).toBe(2);
    expect(r.why.pivot).toEqual({ key: 69, deg: 5, mode: 'manual' });
    expect(r.why.reference).toBe(1);
    const w = r.why.entries[2];
    expect(w.chosen).toBe(true);
    expect(w.rank).toBe(1);
    expect(w.predicted).toHaveLength(3);
    expect(w.predicted[0]).toBeCloseTo(REF_HZ * (10 / 9), 6);
    expect(w.detail).toMatchObject({ bins: 100 });
    expect(r.scores[2]).toBeLessThan(r.scores[1]);
  });

  it('Manual degree need not be held: it still re-roots, and wins over manualKey', () => {
    const cards = cardsOf();
    const h = held([60, 0, 0], [64, 2, 0]);
    const r = retuneStep({ cards, active: 1, held: h }, { pivotMode: 'manual', manualDeg: 1 });
    expect(r.why.pivot).toEqual({ deg: 1, mode: 'manual' });
    expect(r.why.reference).toBe(1);
    // degree 1 is 9/8 in A and 10/9 in B, so B is re-rooted 81/80 above A
    expect(fmtRatio(r.bases[2] as Note)).toBe('81/80');
    const both = retuneStep(
      { cards, active: 1, held: h },
      { pivotMode: 'manual', manualDeg: 1, manualKey: 60 }
    );
    expect(both.why.pivot).toEqual({ deg: 1, mode: 'manual' });
  });

  it('a non-finite score never wins', () => {
    const cards = [mk('x', A), mk('y', A)];
    const r = retuneStep(
      { cards, active: 0, held: held([60, 0, 0], [67, 4, 0]) },
      { pivotMode: 'lowest', scorer: (_f, i) => (i === 0 ? NaN : 7) }
    );
    expect(r.chosen).toBe(1);
    expect(r.scores[0]).toBe(999999);
  });

  it('keeps the active card when there is no pivot (Manual without a matching key, or nothing held)', () => {
    const cards = cardsOf();
    const a = retuneStep({ cards, active: 1, held: held([60, 0, 0]) }, { pivotMode: 'manual' });
    expect(a.chosen).toBe(1);
    expect(a.why.reason).toBe('no pivot');
    const b = retuneStep({ cards, active: 2, held: [] }, { pivotMode: 'lowest' });
    expect(b.chosen).toBe(2);
    expect(b.why.reason).toBe('nothing held');
  });
});
