import { describe, expect, it } from 'vitest';
import { generateField } from './generate';
import { activeTab, initialState, labReducer, type Action, type LabState } from './labState';
import { linkedPitch, linkedScale } from './linkedMelody';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** A shelf chord stashed from 12-EDO C major read as Dorian (mode root D = 200 c). */
function dorianChord() {
  let s = run(initialState(), { type: 'gen/preset', name: '12-EDO' });
  s = run(s, { type: 'sel/set', idx: C_MAJOR, mode: 1 });
  s = run(s, {
    type: 'shelf/stash',
    stash: { pitches: [{ m: null, c: 200 }], template: null, rootDeg: 0, date: '2026-11-15' },
  });
  const chord = s.shelf.chords[0];
  const g = generateField(activeTab(s).gen);
  return { chord, repC: g.ok ? g.rep.c : 0 };
}

describe('linked melody scale', () => {
  it('is the source subset read from its mode root, reduced into the repeat', () => {
    const { chord, repC } = dorianChord();
    const sc = linkedScale(chord, repC)!;
    expect(repC).toBeCloseTo(1200, 6);
    expect(sc.rootC).toBeCloseTo(200, 6);
    expect(sc.rel.map((c) => Math.round(c))).toEqual([0, 200, 300, 500, 700, 900, 1000]);
  });

  it('places a slot in the frame: Parallel puts the mode root on 1/1, Relative keeps it at its own pitch', () => {
    const sc = linkedScale(dorianChord().chord, 1200)!;
    // slot 2 = Dorian degree 3 (F, 300 c above D)
    const par = linkedPitch(sc, 2, 0, 'parallel', 100)!;
    const rel = linkedPitch(sc, 2, 0, 'relative', 100)!;
    expect(par.hz).toBeCloseTo(100 * 2 ** (300 / 1200), 6);
    expect(rel.hz).toBeCloseTo(100 * 2 ** (500 / 1200), 6);
    // the light is the field-absolute pitch in both frames
    expect(par.abs).toBeCloseTo(500, 6);
    expect(rel.abs).toBeCloseTo(500, 6);
    // slot 7 is the root a repeat up; a shift adds whole repeats
    expect(linkedPitch(sc, 7, 0, 'parallel', 100)!.hz).toBeCloseTo(200, 6);
    expect(linkedPitch(sc, 0, 2, 'parallel', 100)!.hz).toBeCloseTo(400, 6);
    expect(linkedPitch(sc, -1, 0, 'parallel', 100)).toBeNull();
  });

  it('a chord with no source (or no repeat) gives no scale: the melody stays on the active subset', () => {
    const { chord } = dorianChord();
    expect(linkedScale({ ...chord, source: null }, 1200)).toBeNull();
    expect(linkedScale(chord, 0)).toBeNull();
    expect(linkedScale(undefined, 1200)).toBeNull();
  });

  it('uses the source generator repeat, so a 3/1 source shifts by a tritave', () => {
    let s = run(initialState(), { type: 'gen/preset', name: 'Bohlen–Pierce (13 ED 3/1)' });
    s = run(s, {
      type: 'shelf/stash',
      stash: { pitches: [{ m: null, c: 0 }], template: null, rootDeg: 0, date: '2026-11-15' },
    });
    const g = generateField(s.shelf.chords[0].source!.gen);
    const repC = g.ok ? g.rep.c : 0;
    expect(repC).toBeCloseTo(1901.955, 2);
    const sc = linkedScale(s.shelf.chords[0], repC)!;
    expect(sc.rel).toHaveLength(13);
    const a = linkedPitch(sc, 3, 0, 'parallel', 100)!.hz;
    expect(linkedPitch(sc, 3, 1, 'parallel', 100)!.hz / a).toBeCloseTo(3, 6);
  });

  /** A shelf chord on `rootC` stashed from 12-EDO C major (mode root C = 0). */
  function cMajorChordOn(rootC: number) {
    let s = run(initialState(), { type: 'gen/preset', name: '12-EDO' });
    s = run(s, { type: 'sel/set', idx: C_MAJOR, mode: 0 });
    s = run(s, {
      type: 'shelf/stash',
      stash: { pitches: [{ m: null, c: rootC }], template: null, rootDeg: 0, date: '2026-11-15' },
    });
    return s.shelf.chords[0];
  }
  const rounded = (a: number[]) => a.map((c) => Math.round(c));

  it('Transpose moves the source rigidly so its mode root lands on the chord root (C major over D = D major)', () => {
    const sc = linkedScale(cMajorChordOn(200), 1200, 'transpose')!;
    expect(sc.rootC).toBeCloseTo(200, 6);
    expect(rounded(sc.rel)).toEqual([0, 200, 400, 500, 700, 900, 1100]);
    // slot 2 is the major third of D: F# (600 c above 1/1), 400 c above the root in Parallel
    expect(linkedPitch(sc, 2, 0, 'parallel', 100)!.hz).toBeCloseTo(100 * 2 ** (400 / 1200), 6);
    expect(linkedPitch(sc, 2, 0, 'relative', 100)!.hz).toBeCloseTo(100 * 2 ** (600 / 1200), 6);
    expect(linkedPitch(sc, 2, 0, 'parallel', 100)!.abs).toBeCloseTo(600, 6);
    // on the source's own root it is the subset as stored; Transpose is the default
    expect(rounded(linkedScale(cMajorChordOn(0), 1200)!.rel)).toEqual(rounded(sc.rel));
    expect(linkedScale(cMajorChordOn(0), 1200)!.rootC).toBeCloseTo(0, 6);
  });

  it('Re-root keeps the source notes and starts them on the chord root (C major over D = D E F G A B C)', () => {
    const sc = linkedScale(cMajorChordOn(200), 1200, 'reroot')!;
    expect(sc.rootC).toBeCloseTo(200, 6);
    expect(rounded(sc.rel)).toEqual([0, 200, 300, 500, 700, 900, 1000]);
    // slot 2 = F, a note of the subset: 500 c above 1/1 (300 above the root in Parallel)
    expect(linkedPitch(sc, 2, 0, 'parallel', 100)!.abs).toBeCloseTo(500, 6);
    expect(linkedPitch(sc, 2, 0, 'parallel', 100)!.hz).toBeCloseTo(100 * 2 ** (300 / 1200), 6);
    expect(linkedPitch(sc, 2, 0, 'relative', 100)!.hz).toBeCloseTo(100 * 2 ** (500 / 1200), 6);
  });

  it('Re-root falls back to Transpose for a chord root that is not in the source subset', () => {
    const chord = cMajorChordOn(100);
    const re = linkedScale(chord, 1200, 'reroot')!;
    const tr = linkedScale(chord, 1200, 'transpose')!;
    expect(re).toEqual(tr);
    expect(re.rootC).toBeCloseTo(100, 6);
    expect(rounded(re.rel)).toEqual([0, 200, 400, 500, 700, 900, 1100]);
    // within the merge tolerance still counts as a member
    expect(linkedScale(cMajorChordOn(203), 1200, 'reroot')!.rootC).toBeCloseTo(200, 6);
  });
});
