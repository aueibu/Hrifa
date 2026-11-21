/**
 * Validation against listener data (CC0 datasets in `data/`, see `data/SOURCE.md`): Spearman correlation of each score
 * with the Bowling, Purves & Gill (2018) attractiveness ratings (all 12-TET dyads, triads and tetrads, with the exact
 * Hz played) and with the Johnson-Laird, Kang & Leong (2012) dissonance ratings (triads and tetrads as MIDI voicings
 * in several registers). The table is printed (run `vitest run --reporter=verbose` to see it); only a sanity floor is
 * asserted.
 *
 * Sign conventions: Bowling ratings are consonance ratings (high = more attractive); Johnson-Laird ratings are DISSONANCE
 * ratings (high = more dissonant). A good interference or periodicity score therefore correlates NEGATIVELY with
 * Bowling and POSITIVELY with Johnson-Laird; a good harmonicity score the other way round.
 */
import { describe, expect, it } from 'vitest';
import { readCsv, spearman } from './testUtils';
import { inconComposite, scoreVoicing, midiToHz, type VoicingScores } from './index';

interface Item {
  freqs: number[];
  rating: number;
  size: number;
}

function bowling(file: string, n: number): Item[] {
  return readCsv(file).map((r) => {
    const freqs = Array.from({ length: n }, (_, i) => Number(r[`f_${i + 1}`]));
    return { freqs, rating: Number(r.rating_mean), size: n };
  });
}

function jl(file: string): Item[] {
  return readCsv(file).map((r) => {
    const midis = r.midi.trim().split(/\s+/).map(Number);
    return { freqs: midis.map(midiToHz), rating: Number(r.mean_rating), size: midis.length };
  });
}

const score = (f: number[]): VoicingScores => {
  // the datasets give Hz: put the lowest note as the reference
  const ref = Math.min(...f);
  return scoreVoicing(
    { refHz: ref, cents: f.map((x) => 1200 * Math.log2(x / ref)) },
    { decompose: false }
  );
};

const COLUMNS = [
  ['interference H&K', (s: VoicingScores) => s.interference.hutchinsonKnopoff.total],
  ['interference Sethares', (s: VoicingScores) => s.interference.sethares.total],
  ['periodicity (Stolzenburg)', (s: VoicingScores) => s.periodicity.value],
  ['harmonicity pitch-class (har18)', (s: VoicingScores) => s.harmonicity.pitchClass.value],
  ['harmonicity pitch (extension)', (s: VoicingScores) => s.harmonicity.pitch.value],
] as const;

function correlations(items: Item[]): number[] {
  const scores = items.map((it) => score(it.freqs));
  const rating = items.map((it) => it.rating);
  const cols = COLUMNS.map(([, f]) => scores.map(f));
  const rho = cols.map((c) => spearman(c, rating));
  // incon composite: the published raw-value regression (Table 2 coefficients, no culture term, no chord-size term)
  const comp = scores.map((sc) =>
    inconComposite({
      interference: sc.interference.hutchinsonKnopoff.total,
      harmonicity: sc.harmonicity.pitchClass.value,
    })
  );
  rho.push(spearman(comp, rating));
  return rho;
}

const fmt = (v: number) => (v >= 0 ? ' ' : '') + v.toFixed(3);

describe('validation against listener ratings', () => {
  const dy = bowling('dyads.csv', 2);
  const tr = bowling('triads.csv', 3);
  const te = bowling('tetrads.csv', 4);
  const all = [...dy, ...tr, ...te];
  const jl2 = jl('jl12-figure-2.csv');
  const jl3 = jl('jl12-figure-3.csv');

  const sets: [string, Item[]][] = [
    [`Bowling all (${all.length})`, all],
    [`Bowling dyads (${dy.length})`, dy],
    [`Bowling triads (${tr.length})`, tr],
    [`Bowling tetrads (${te.length})`, te],
    [`JL12 fig 2 (${jl2.length})`, jl2],
    [`JL12 fig 3 (${jl3.length})`, jl3],
  ];
  let cached: (readonly [string, number[]])[] | undefined;
  const getTable = () => {
    cached ??= sets.map(([name, items]) => [name, correlations(items)] as const);
    return cached;
  };

  it('prints the Spearman correlation table', () => {
    const table = getTable();
    const names = [...COLUMNS.map(([n]) => n), 'incon composite (raw H&K + pc harmonicity)'];
    const lines = [
      '',
      'Spearman rho of each score with listener ratings (Bowling: consonance ratings; JL12: DISSONANCE ratings)',
      ['score'.padEnd(40), ...table.map(([n]) => n.padStart(22))].join(' '),
      ...names.map((n, k) =>
        [n.padEnd(40), ...table.map(([, r]) => fmt(r[k]).padStart(22))].join(' ')
      ),
      '',
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(table).toHaveLength(6);
  });

  it('sanity floor: interference and harmonicity correlate with the Bowling ratings in the expected direction', () => {
    const [, bowlAll] = getTable()[0];
    expect(bowlAll[0]).toBeLessThan(-0.3); // H&K interference: rougher chords are rated less attractive
    expect(bowlAll[1]).toBeLessThan(-0.3); // Sethares
    expect(bowlAll[3]).toBeGreaterThan(0.3); // pitch-class harmonicity: more harmonic chords are rated higher
    expect(bowlAll[5]).toBeGreaterThan(0.3); // the composite
  });

  it('sanity floor: on the Johnson-Laird dissonance ratings interference is positive, harmonicity and the composite negative', () => {
    for (const idx of [4, 5]) {
      const [, r] = getTable()[idx];
      expect(r[0]).toBeGreaterThan(0.2); // H&K
      expect(r[3]).toBeLessThan(-0.2); // pitch-class harmonicity
      expect(r[5]).toBeLessThan(-0.2); // composite
    }
  });
});
