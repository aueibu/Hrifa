/**
 * The M1 comparison table: every score for about 18 reference chords (dyads at three registers, triads, tetrads,
 * clusters, compound voicings, a 31-EDO chord and three placements of the page's default intervals `11 7 16`).
 * Printed for the human (run `vitest run --reporter=verbose` to see it); the assertions only check that the table
 * is complete and that the headline orderings hold.
 */
import { describe, expect, it } from 'vitest';
import { flatScores, scoreVoicing, voicingFromSteps, type Voicing } from './index';

const C2 = 65.40639132514966;
const C3 = 130.8127826502993;
const C4 = 261.6255653005986;
const C6 = 1046.5022612023945;

const v12 = (ref: number, semis: number[]): Voicing => voicingFromSteps(ref, semis, 12);

// Placements of the page's default intervals [11, 7, 16] (12-EDO, 3-octave window): the three best by the current
// page's own ranking in its `v2` and `prefixDominance` engines, captured from
// computeIntervalPlacements([11, 7, 16], defaults, [], 3) in this session; steps above the window bottom (C2).
const PLACEMENTS: [string, number[]][] = [
  ['11 7 16 v2 #1 (perm 11,16,7)', [2, 9, 13, 21, 25, 28]],
  ['11 7 16 v2 #2 (perm 16,7,11)', [0, 12, 16, 19, 30]],
  ['11 7 16 prefixDominance #1', [2, 6, 13, 19, 22, 26]],
];

const ROWS: [string, Voicing][] = [
  ['M3 on C2', v12(C2, [0, 4])],
  ['M3 on C4', v12(C4, [0, 4])],
  ['M3 on C6', v12(C6, [0, 4])],
  ['P5 on C4', v12(C4, [0, 7])],
  ['m2 on C4', v12(C4, [0, 1])],
  ['M10 on C4 (compound)', v12(C4, [0, 16])],
  ['major triad C4', v12(C4, [0, 4, 7])],
  ['minor triad C4', v12(C4, [0, 3, 7])],
  ['JI 4:5:6 on C4', { refHz: C4, cents: [0, 1200 * Math.log2(5 / 4), 1200 * Math.log2(3 / 2)] }],
  ['major 7th C4 (0 4 7 11)', v12(C4, [0, 4, 7, 11])],
  ['dominant 7th C4 (0 4 7 10)', v12(C4, [0, 4, 7, 10])],
  ['cluster 0 1 2 on C4', v12(C4, [0, 1, 2])],
  ['cluster 0 1 2 3 on C3', v12(C3, [0, 1, 2, 3])],
  ['open C2 G2 E3 (0 7 16)', v12(C2, [0, 7, 16])],
  ['31-EDO 4:5:6:7 on C3 (0 10 18 25)', voicingFromSteps(C3, [0, 10, 18, 25], 31)],
  ...PLACEMENTS.map(([n, st]) => [n, v12(C2, st)] as [string, Voicing]),
];

describe('comparison table', () => {
  const table = ROWS.map(([name, v]) => {
    const s = scoreVoicing(v, { decompose: false });
    return { name, v, s, flat: flatScores(s) };
  });

  it('prints every score for every chord', () => {
    const f3 = (x: number) => x.toFixed(3).padStart(8);
    const head = [
      'chord'.padEnd(36),
      'notes'.padStart(5),
      'H&K'.padStart(8),
      'worst'.padStart(8),
      'Sethares'.padStart(8),
      'period.'.padStart(8),
      'hrm pc'.padStart(8),
      'hrm pitch'.padStart(9),
      ' ratio chord (Stolzenburg)',
    ].join(' ');
    const lines = table.map(({ name, v, s, flat }) =>
      [
        name.padEnd(36),
        String(v.cents.length).padStart(5),
        f3(flat.interference),
        f3(flat.worstRelation),
        f3(flat.interferenceSethares),
        f3(flat.periodicity),
        f3(flat.harmonicityPc),
        f3(flat.harmonicityPitch).padStart(9),
        ` ${s.periodicity.ratios.join(':')}`,
      ].join(' ')
    );
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        'Scores: interference (H&K: roughness per unit energy; Sethares: summed roughness) lower = smoother; periodicity (log2) lower = simpler;',
        'harmonicity (bits, KL from uniform) higher = more harmonic. Default timbre: 11 harmonics, roll-off 1. Absolute pitch from the reference note.',
        head,
        '-'.repeat(head.length),
        ...lines,
        '',
      ].join('\n')
    );
    expect(lines).toHaveLength(ROWS.length);
    const all = table.flatMap(({ flat }) => Object.values(flat));
    expect(all.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('headline orderings', () => {
    const by = (name: string) => table.find((r) => r.name === name)!.flat;
    expect(by('M3 on C2').interference).toBeGreaterThan(by('M3 on C4').interference);
    expect(by('M3 on C4').interference).toBeGreaterThan(by('M3 on C6').interference);
    expect(by('M10 on C4 (compound)').interference).toBeLessThan(by('M3 on C4').interference);
    expect(by('M10 on C4 (compound)').periodicity).toBeLessThan(by('M3 on C4').periodicity);
    expect(by('cluster 0 1 2 on C4').harmonicityPc).toBeLessThan(
      by('major triad C4').harmonicityPc
    );
    expect(by('cluster 0 1 2 on C4').interference).toBeGreaterThan(
      by('major triad C4').interference
    );
  });
});
