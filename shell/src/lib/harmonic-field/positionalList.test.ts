import { describe, expect, it } from 'vitest';
import { positionalChords, positionalList } from './positional';
import type { Note } from './types';

const edo12: Note[] = Array.from({ length: 12 }, (_, i) => ({ m: null, c: i * 100 }));
const rep: Note = { m: null, c: 1200 };
const major = [0, 2, 4, 5, 7, 9, 11];
const cents = (c: { pitches: Note[] }) => c.pitches.map((p) => Math.round(p.c));

describe('scenario e: positional list order', () => {
  const chords = positionalChords(edo12, major, [2, 2], 0, rep);

  it('Scale order: degree 1..7 (C E G, D F A, ...), each with score and rank', () => {
    const rows = positionalList(chords, 'scale');
    expect(rows.map((r) => r.degree)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cents(rows[0])).toEqual([0, 400, 700]);
    expect(cents(rows[1])).toEqual([200, 500, 900]);
    rows.forEach((r) => expect(Number.isFinite(r.score)).toBe(true));
    expect(rows.map((r) => r.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('Smoothest: best score first, rank 1..7 in order; ranks are the same in both orders', () => {
    const smooth = positionalList(chords, 'smoothest');
    expect(smooth.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (let i = 1; i < smooth.length; i++) {
      expect(smooth[i].score).toBeGreaterThanOrEqual(smooth[i - 1].score - 1e-9);
    }
    for (const r of positionalList(chords, 'scale')) {
      const same = smooth.find((x) => x.degree === r.degree)!;
      expect(r.rank).toBe(same.rank);
      expect(r.score).toBe(same.score);
    }
  });

  it('rank is over the full list: C, F and G major tie and take ranks 1 to 3 in degree order', () => {
    const scale = positionalList(chords, 'scale');
    expect([scale[0].rank, scale[3].rank, scale[4].rank]).toEqual([1, 2, 3]);
  });

  it('a custom score and an empty list', () => {
    const rows = positionalList(chords, 'scale', undefined, (p) => -p[0].c);
    expect(rows[6].rank).toBe(1);
    expect(positionalList([], 'scale')).toEqual([]);
  });
});
