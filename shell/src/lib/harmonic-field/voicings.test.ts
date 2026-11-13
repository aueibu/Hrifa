import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATES,
  findChordVoicings,
  findChords,
  parseInterval,
  type Note,
  type RelNote,
} from './index';

const rel = (xs: string[]): RelNote[] =>
  xs.map((s, i) => ({ ...(parseInterval(s) as Note), src: i }) as RelNote);
const strip = (c: object) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'family'));

describe('findChordVoicings', () => {
  it('gives each field note near the same chord tone its own voicing (13/8 and 5/3 for a major sixth)', () => {
    const r = rel(['1/1', '13/8', '5/3']);
    const { chords, truncated } = findChordVoicings(
      r,
      1200,
      [{ text: '3:5', name: 'major sixth' }],
      50
    );
    const onRoot = chords.filter((c) => c.root === 0);
    expect(onRoot.map((c) => c.members)).toEqual([
      [0, 2],
      [0, 1],
    ]);
    expect(onRoot[0].maxErr).toBeLessThan(1e-6);
    expect(onRoot[1].errors[1]).toBeCloseTo(840.53 - 884.36, 1);
    expect(truncated).toBe(false);
    // findChords keeps only the nearest note
    expect(findChords(r, 1200, [{ text: '3:5' }], 50).filter((c) => c.root === 0)).toHaveLength(1);
  });

  it('equals findChords when each tone has one candidate', () => {
    const r = rel(['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '7/4', '15/8']);
    for (const tol of [0, 5, 18, 40]) {
      const a = findChords(r, 1200, DEFAULT_TEMPLATES, tol);
      const b = findChordVoicings(r, 1200, DEFAULT_TEMPLATES, tol, { maxPerTone: 1 });
      expect(b.chords.map(strip)).toEqual(a.map(strip));
    }
  });

  it('skips duplicate, folding and unreadable templates like findChords', () => {
    const r = rel(['1/1', '5/4', '3/2']);
    const t = [{ text: '4:5:6' }, { text: '8:10:12' }, { text: '1:2' }, { text: 'nonsense' }];
    const v = findChordVoicings(r, 1200, t, 10);
    expect(v.chords.map((c) => c.template)).toEqual(['4:5:6']);
    expect(findChords(r, 1200, t, 10)).toHaveLength(1);
  });

  it('never repeats a note within a voicing, and flags truncation at the caps', () => {
    const r = rel(['1/1', '9/8', '10/9', '8/7', '7/6', '6/5', '5/4', '4/3', '3/2']);
    const v = findChordVoicings(r, 1200, [{ text: '4:5:6' }], 400, { maxPerTone: 2 });
    expect(v.truncated).toBe(true);
    for (const c of v.chords) {
      expect(new Set(c.members).size).toBe(c.members.length);
    }
    const w = findChordVoicings(r, 1200, [{ text: '4:5:6' }], 400, { maxTotal: 3 });
    expect(w.chords).toHaveLength(3);
    expect(w.truncated).toBe(true);
  });

  it('carries the template family and the defaults are grouped', () => {
    const r = rel(['1/1', '5/4', '3/2']);
    const v = findChordVoicings(r, 1200, DEFAULT_TEMPLATES, 5);
    expect(v.chords[0].family).toBe('Major');
    expect(DEFAULT_TEMPLATES.find((t) => t.text === '6:8:9')?.family).toBe('Suspended');
    expect(DEFAULT_TEMPLATES.every((t) => t.family)).toBe(true);
  });
});

describe('findChordVoicings caps across templates', () => {
  const r = rel(['1/1', '9/8', '10/9', '8/7', '7/6', '6/5', '5/4', '4/3', '3/2', '5/3', '7/4']);
  const many = [{ text: '4:5:6' }, { text: '10:12:15' }, { text: '4:5:6:7' }, { text: '6:7:9' }];

  it('maxTotal is a hard cap over all templates, and the search stops', () => {
    const all = findChordVoicings(r, 1200, many, 400);
    expect(all.chords.length).toBeGreaterThan(8);
    for (const cap of [1, 3, 8]) {
      const v = findChordVoicings(r, 1200, many, 400, { maxTotal: cap });
      expect(v.chords).toHaveLength(cap);
      expect(v.truncated).toBe(true);
    }
  });

  it('is not truncated when the cap equals the number of voicings', () => {
    const all = findChordVoicings(r, 1200, many, 400, { maxTotal: 5000, maxPerTone: 50 });
    const v = findChordVoicings(r, 1200, many, 400, {
      maxTotal: all.chords.length,
      maxPerTone: 50,
    });
    expect(v.chords).toHaveLength(all.chords.length);
    expect(v.truncated).toBe(false);
  });

  it('a per-tone cut on a root that yields no chord does not set truncated', () => {
    // four notes near the fifth, but the major third is missing: the root is not otherwise possible
    const q = rel(['1/1', '700c', '701c', '702c', '703c']);
    const v = findChordVoicings(q, 1200, [{ text: '4:5:6' }], 10, { maxPerTone: 2 });
    expect(v.chords).toHaveLength(0);
    expect(v.truncated).toBe(false);
  });
});
