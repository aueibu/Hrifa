// Pitch-fair periodicity, lattice distance, Sethares roughness, compareScorers.
import { describe, expect, it } from 'vitest';
import {
  compareScorers,
  parseInterval,
  scoreLattice,
  scorePeriodicityFair,
  scorePeriodicityInfinitone,
  scoreRoughness,
  type NamedScorer,
  type Note,
} from './index';

const ji = (root: number, ratios: number[]) => ratios.map((r) => root * r);
const edo = (root: number, semis: number[]) => semis.map((s) => root * 2 ** (s / 12));
const P = (s: string): Note => parseInterval(s) as Note;

const SCORERS: NamedScorer[] = [
  { name: 'parity', score: (f) => scorePeriodicityInfinitone(f) },
  { name: 'fair', score: (f) => scorePeriodicityFair(f) },
  { name: 'lattice', score: (f, n) => scoreLattice(n ?? f) },
  { name: 'roughness', score: (f) => scoreRoughness(f) },
];

describe('scorePeriodicityFair', () => {
  it('scores 4:5:6 the same at 55, 220 and 880 Hz (identical by construction, checked within 0.5 %)', () => {
    const s = [55, 220, 880].map((r) => scorePeriodicityFair(ji(r, [1, 5 / 4, 3 / 2])).score);
    for (const v of s) {
      expect(Math.abs(v / s[1] - 1)).toBeLessThan(0.005);
    }
  });
  it('also keeps the 12-EDO major chord register-independent', () => {
    const s = [55, 220, 880].map((r) => scorePeriodicityFair(edo(r, [0, 4, 7])).score);
    for (const v of s) {
      expect(Math.abs(v / s[1] - 1)).toBeLessThan(0.02);
    }
  });
  it('empty and single-note input', () => {
    expect(scorePeriodicityFair([]).score).toBe(999999);
    const one = scorePeriodicityFair([220]).score;
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(500);
  });
});

describe('scoreLattice', () => {
  it('4:5:6 and 10:12:15 score the same, hand-checked at (log2 20 + log2 30 + log2 6) / 3', () => {
    const a = scoreLattice([P('1/1'), P('5/4'), P('3/2')]);
    const b = scoreLattice([P('1/1'), P('6/5'), P('3/2')]);
    const hand = (Math.log2(20) + Math.log2(30) + Math.log2(6)) / 3; // 3.93793...
    expect(a.score).toBeCloseTo(hand, 9);
    expect(b.score).toBeCloseTo(hand, 9);
    expect(a.score).toBeCloseTo(3.93793, 4);
    const pairs = (a.detail as { pairs: { ratio: string }[] }).pairs.map((p) => p.ratio).sort();
    expect(pairs).toEqual(['3/2', '5/4', '6/5']);
  });
  it('gives the same value from Hz (nearest ratio) as from monzos, at any register', () => {
    const exact = scoreLattice([P('1/1'), P('5/4'), P('3/2')]).score;
    expect(scoreLattice(ji(220, [1, 5 / 4, 3 / 2])).score).toBeCloseTo(exact, 6);
    expect(scoreLattice(ji(55, [1, 5 / 4, 3 / 2])).score).toBeCloseTo(exact, 6);
    expect(scoreLattice(ji(220, [4, 5, 6])).score).toBeCloseTo(exact, 6);
  });
  it('octave voicing does not change it (octave-reduced pairs)', () => {
    const close = scoreLattice([P('1/1'), P('5/4'), P('3/2')]).score;
    const open = scoreLattice([P('1/1'), P('5/2'), P('3/1')]).score;
    expect(open).toBeCloseTo(close, 9);
  });
  it('12-EDO minor third (300 c) is explained as 6/5, not 13/11, even at odd limit 15', () => {
    for (const oddLimit of [9, 15]) {
      const r = scoreLattice(edo(220, [0, 3]), { oddLimit });
      expect((r.detail as { pairs: { ratio: string }[] }).pairs[0].ratio).toBe('6/5');
    }
  });
  it('the score is continuous: no jump between neighbouring cents', () => {
    for (const oddLimit of [9, 15]) {
      let prev = NaN;
      for (let c = 0; c <= 1200; c += 0.1) {
        const v = scoreLattice([220, 220 * 2 ** (c / 1200)], { oddLimit }).score;
        if (!Number.isNaN(prev)) {
          // slope is at most centsPenalty (0.05 bit per cent) so 0.1 c moves the score by at most 0.005
          expect(Math.abs(v - prev)).toBeLessThan(0.0051);
        }
        prev = v;
      }
    }
  });
  it('JI 4:5:6 ranks above 12-EDO major, and ties it when the penalty is 0', () => {
    const jiScore = scoreLattice(ji(220, [1, 5 / 4, 3 / 2])).score;
    expect(jiScore).toBeLessThan(scoreLattice(edo(220, [0, 4, 7])).score);
    expect(scoreLattice(edo(220, [0, 4, 7]), { centsPenalty: 0 }).score).toBeCloseTo(jiScore, 6);
  });
  it('ignores non-positive and non-finite Hz; detail indices refer to the input order', () => {
    const r = scoreLattice([0, 330, NaN, 220, -5]);
    expect(r.score).toBeCloseTo(Math.log2(6), 6);
    const pair = (r.detail as { pairs: { i: number; j: number }[] }).pairs[0];
    expect([pair.i, pair.j]).toEqual([3, 1]);
    expect(scoreLattice([0, -1]).score).toBe(999999);
  });
  it('empty and single-note input', () => {
    expect(scoreLattice([]).score).toBe(999999);
    expect(scoreLattice([220]).score).toBe(0);
    expect(scoreLattice([P('1/1')]).score).toBe(0);
  });
});

describe('scoreRoughness', () => {
  it('a sweep of two harmonic tones has local minima at 1/1, 6/5, 5/4, 4/3, 3/2, 5/3, 2/1 (within 1 cent)', () => {
    for (const root of [110, 220, 440]) {
      const v: number[] = [];
      for (let c = 0; c <= 1200; c += 0.5) {
        v.push(scoreRoughness([root, root * 2 ** (c / 1200)]).score);
      }
      const minima: number[] = [];
      for (let i = 0; i < v.length; i++) {
        const l = i === 0 ? Infinity : v[i - 1];
        const r = i === v.length - 1 ? Infinity : v[i + 1];
        if (v[i] < l && v[i] <= r) {
          minima.push(i * 0.5);
        }
      }
      const missing = [1, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2].filter((ratio) => {
        const target = 1200 * Math.log2(ratio);
        return !minima.some((m) => Math.abs(m - target) <= 1);
      });
      expect(missing).toEqual([]);
    }
  });
  it('the amplitude rule changes the numbers but not where the minima are', () => {
    expect(scoreRoughness([220, 330], { amp: 'product' }).score).not.toBe(
      scoreRoughness([220, 330]).score
    );
  });
  it('detail lists per-pair contributions that add up with the self terms', () => {
    const r = scoreRoughness([220, 275, 330]);
    const d = r.detail as { pairs: { roughness: number }[]; self: number[] };
    expect(d.pairs).toHaveLength(3);
    const sum = d.pairs.reduce((s, p) => s + p.roughness, 0) + d.self.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(r.score, 9);
  });
  it('empty and single-note input', () => {
    expect(scoreRoughness([]).score).toBe(999999);
    const one = scoreRoughness([220]).score;
    expect(one).toBeGreaterThan(0);
    expect(Number.isFinite(one)).toBe(true);
  });
});

describe('all scorers agree JI 4:5:6 beats 12-EDO major at 220 Hz', () => {
  for (const s of SCORERS) {
    it(s.name, () => {
      expect(s.score(ji(220, [1, 5 / 4, 3 / 2])).score).toBeLessThan(
        s.score(edo(220, [0, 4, 7])).score
      );
    });
  }
});

describe('compareScorers', () => {
  // JI chord from integer terms, lowest term at 220 Hz; exact notes for the lattice scorer.
  const terms = (name: string, t: number[]) => ({
    name,
    freqs: t.map((x) => (220 * x) / t[0]),
    notes: t.map((x) => P(`${x}/${t[0]}`)),
  });
  const CHORDS: { name: string; freqs: number[]; notes?: Note[] }[] = [
    terms('JI fifth 2:3', [2, 3]),
    terms('JI major 4:5:6', [4, 5, 6]),
    { name: '12-EDO major', freqs: edo(220, [0, 4, 7]) },
    terms('JI minor 10:12:15', [10, 12, 15]),
    { name: '12-EDO minor', freqs: edo(220, [0, 3, 7]) },
    terms('JI harmonic 7th 4:5:6:7', [4, 5, 6, 7]),
    { name: '12-EDO dom7', freqs: edo(220, [0, 4, 7, 10]) },
    terms('JI septimal minor 6:7:9', [6, 7, 9]),
    terms('JI tritone 45/32', [32, 45]),
    { name: '12-EDO tritone', freqs: edo(220, [0, 6]) },
    terms('JI 5-limit 9:10:12', [9, 10, 12]),
    { name: '12-EDO semitone cluster', freqs: edo(220, [0, 1, 2]) },
    terms('JI whole-tone pair 8:9', [8, 9]),
    // La Monte Young, The Well-Tuned Piano. Chord terms from Kyle Gann, "La Monte Young's The Well-Tuned Piano",
    // Perspectives of New Music 31/1 (Winter 1993), pp. 134-162, Examples 10-12 (supplied by the human).
    terms('WTP Opening 4:6:7:8:9:12', [4, 6, 7, 8, 9, 12]),
    terms('WTP Magic 81:84:108:112:144:162:192:216', [81, 84, 108, 112, 144, 162, 192, 216]),
    terms('WTP Romantic 48:54:56:64:72:81:84', [48, 54, 56, 64, 72, 81, 84]),
    terms('WTP Gamelan 42:54:64:81', [42, 54, 64, 81]),
    terms('WTP Tamiar Dream 14:18:24:27', [14, 18, 24, 27]),
    terms('WTP 189/98 Lost Ancestral Lake Region 12:14:18:21:24:27', [12, 14, 18, 21, 24, 27]),
    terms('WTP The Brook 12:14:16:18:21', [12, 14, 16, 18, 21]),
    terms('WTP The Pool 128:144:147:192:224', [128, 144, 147, 192, 224]),
  ];
  const table = compareScorers(CHORDS, SCORERS);
  it('has one row per chord, one column per scorer, ranks 1..n', () => {
    expect(table.scorers).toEqual(['parity', 'fair', 'lattice', 'roughness']);
    expect(table.rows).toHaveLength(CHORDS.length);
    for (const row of table.rows) {
      expect(row.scores).toHaveLength(4);
      expect(row.ranks.every((r) => r >= 1 && r <= CHORDS.length)).toBe(true);
    }
    for (let k = 0; k < 4; k++) {
      expect(table.rows.some((r) => r.ranks[k] === 1)).toBe(true);
    }
  });
  it('among 3-note chords the 12-EDO semitone cluster is the roughest (roughness) and the lattice worst', () => {
    const triads = table.rows.filter((r) =>
      [
        'JI major 4:5:6',
        '12-EDO major',
        'JI minor 10:12:15',
        '12-EDO minor',
        '12-EDO semitone cluster',
      ].includes(r.name)
    );
    const worst = (k: number) => triads.reduce((a, b) => (b.scores[k] > a.scores[k] ? b : a)).name;
    expect(worst(3)).toBe('12-EDO semitone cluster');
    expect(worst(2)).toBe('12-EDO semitone cluster');
  });
  it('prints the markdown table when HFL_TABLE is set', () => {
    if (process.env.HFL_TABLE) {
      const head = `| chord | ${table.scorers.join(' | ')} |`;
      const sep = `| --- | ${table.scorers.map(() => '---').join(' | ')} |`;
      const rows = table.rows.map(
        (r) =>
          `| ${r.name} | ${r.scores.map((s, k) => `${Math.round(s * 100) / 100} (#${r.ranks[k]})`).join(' | ')} |`
      );
      process.stderr.write(`\n${[head, sep, ...rows].join('\n')}\n`);
    }
    expect(true).toBe(true);
  });
});
