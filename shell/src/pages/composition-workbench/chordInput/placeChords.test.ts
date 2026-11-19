import { describe, expect, it } from 'vitest';
import { chordsOnRoot, type Chord } from './chords';
import type { ChordAnchor } from './chordSession';
import { makePitchSet } from './pitchSet';
import { mergeChordInserts, stackTones, type ExistingNote } from './placeChords';
import { chordNotes, DEFAULT_VOICING } from './placement';

const cMajor = makePitchSet(12, [0, 2, 4, 5, 7, 9, 11]);
const chord = (root: number, name: string): Chord => {
  const found = chordsOnRoot(cMajor, root).find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`${name} is not offered on ${root}`);
  }
  return found;
};

const onNote = (
  pitch: number,
  start: number,
  duration: number,
  velocity?: number
): ChordAnchor => ({
  pitchMidicents: pitch,
  start,
  step: 1,
  note: { duration, velocity, pitchMidicents: pitch },
});
const request = (anchor: ChordAnchor, c: Chord) => ({
  anchor,
  notes: chordNotes(c, anchor, DEFAULT_VOICING, anchor.note?.duration ?? anchor.step),
});
const pitches = (list: { pitchMidicents: number }[]) => list.map((n) => n.pitchMidicents);

describe('stackTones (the Chords tool rule, one request)', () => {
  it('B1: stacking C major on a selected C4 adds E4 and G4 with the note length and velocity', () => {
    const existing: ExistingNote[] = [{ start: 1, duration: 1, pitchMidicents: 6000 }];
    const placed = stackTones(request(onNote(6000, 1, 1, 0.7), chord(0, 'C')), existing, 12);
    expect(pitches(placed)).toEqual([6400, 6700]);
    expect(placed.every((n) => n.start === 1 && n.duration === 1 && n.velocity === 0.7)).toBe(true);
  });

  it('an empty-cell request adds its tones as they are, whatever exists', () => {
    const anchor: ChordAnchor = { pitchMidicents: 6000, start: 0, step: 0.5 };
    const existing: ExistingNote[] = [{ start: 0, duration: 1, pitchMidicents: 6000 }];
    expect(pitches(stackTones(request(anchor, chord(0, 'C')), existing, 12))).toEqual([
      6000, 6400, 6700,
    ]);
  });
});

describe('mergeChordInserts (selection mode, several anchors)', () => {
  it('B4: notes at different onsets each get their chord', () => {
    const existing: ExistingNote[] = [
      { start: 1, duration: 1, pitchMidicents: 6000 },
      { start: 3, duration: 1, pitchMidicents: 6700 },
    ];
    const placed = mergeChordInserts(
      [request(onNote(6000, 1, 1), chord(0, 'C')), request(onNote(6700, 3, 1), chord(7, 'G'))],
      existing,
      12
    );
    // C4 chord: E4, G4 at beat 1 (C4 exists); G4 chord (root mode, the quality on G): B4, D5 at beat 3.
    expect(placed.map((n) => [n.start, n.pitchMidicents])).toEqual([
      [1, 6400],
      [1, 6700],
      [3, 7100],
      [3, 7400],
    ]);
  });

  it('B5: at one onset, a pitch both chords contain is entered once and an existing note is not duplicated', () => {
    // C4 and G4 both at beat 1. C major on C4 = C E G; on G4 (common tone, same pitch classes) = also contains G4.
    const existing: ExistingNote[] = [
      { start: 1, duration: 1, pitchMidicents: 6000 },
      { start: 1, duration: 1, pitchMidicents: 6700 },
    ];
    const c = chord(0, 'C');
    // Common-tone placement: C major with the anchored tone held at the click, so G4 stays G4 and the chord is C4 E4 G4.
    const forG: ChordAnchor = onNote(6700, 1, 1);
    const requests = [
      request(onNote(6000, 1, 1), c),
      {
        anchor: forG,
        notes: chordNotes(c, forG, DEFAULT_VOICING, 1, 7),
      },
    ];
    expect(pitches(requests[1].notes)).toEqual([6000, 6400, 6700]);
    const placed = mergeChordInserts(requests, existing, 12);
    // C4 and G4 exist; E4 is the only new pitch and is entered once, not twice.
    expect(pitches(placed)).toEqual([6400]);
  });

  it('B5: two chords that share a new pitch at one onset enter it once', () => {
    const existing: ExistingNote[] = [
      { start: 0, duration: 1, pitchMidicents: 6000 },
      { start: 0, duration: 1, pitchMidicents: 6400 },
    ];
    // C major on C4 (adds G4) and A minor with E4 anchored (common tone: A3 C4 E4: nothing new but A3);
    // use C major on both: C4 adds E4/G4 minus existing E4 = G4; second chord common-tone on E4 = C4 E4 G4 -> G4 again.
    const c = chord(0, 'C');
    const e4 = onNote(6400, 0, 1);
    const placed = mergeChordInserts(
      [
        request(onNote(6000, 0, 1), c),
        { anchor: e4, notes: chordNotes(c, e4, DEFAULT_VOICING, 1, 4) },
      ],
      existing,
      12
    );
    expect(pitches(placed)).toEqual([6700]);
  });

  it('C2: the same pitch at different onsets that merely overlap in time is kept at both', () => {
    // C4 at beat 1 (length 4) and E4 at beat 3 (length 1); C major on both (the second in common-tone mode on E4).
    const c = chord(0, 'C');
    const e4 = onNote(6400, 3, 1);
    const placed = mergeChordInserts(
      [
        request(onNote(6000, 1, 4), c),
        { anchor: e4, notes: chordNotes(c, e4, DEFAULT_VOICING, 1, 4) },
      ],
      [
        { start: 1, duration: 4, pitchMidicents: 6000 },
        { start: 3, duration: 1, pitchMidicents: 6400 },
      ],
      12
    );
    // The first chord's E4 would sit on the existing E4 (inside its span) and is dropped; both G4s stay.
    expect(placed.map((n) => [n.start, n.pitchMidicents])).toEqual([
      [1, 6700],
      [3, 6700],
    ]);
  });

  it('keeps the first anchor length and velocity for a shared pitch', () => {
    const c = chord(0, 'C');
    const e4 = onNote(6400, 0, 2, 0.4);
    const placed = mergeChordInserts(
      [
        request(onNote(6000, 0, 1, 0.9), c),
        { anchor: e4, notes: chordNotes(c, e4, DEFAULT_VOICING, 2, 4) },
      ],
      [
        { start: 0, duration: 1, pitchMidicents: 6000 },
        { start: 0, duration: 2, pitchMidicents: 6400 },
      ],
      12
    );
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ pitchMidicents: 6700, duration: 1, velocity: 0.9 });
  });

  it('one request is exactly the single-chord result', () => {
    const r = request(onNote(6000, 1, 1, 0.5), chord(0, 'C'));
    const existing: ExistingNote[] = [{ start: 1, duration: 1, pitchMidicents: 6000 }];
    expect(mergeChordInserts([r], existing, 12)).toEqual(stackTones(r, existing, 12));
  });

  it('no requests, or tones that all exist, place nothing', () => {
    expect(mergeChordInserts([], [], 12)).toEqual([]);
    const all: ExistingNote[] = [6000, 6400, 6700].map((p) => ({
      start: 0,
      duration: 1,
      pitchMidicents: p,
    }));
    expect(mergeChordInserts([request(onNote(6000, 0, 1), chord(0, 'C'))], all, 12)).toEqual([]);
  });
});
