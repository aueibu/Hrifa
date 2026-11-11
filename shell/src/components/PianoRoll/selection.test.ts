import { describe, expect, it } from 'vitest';
import type { PianoRollNote } from './model';
import {
  clickSelection,
  marqueeSelection,
  noteRect,
  notesInRect,
  rectFromCorners,
} from './selection';

const view = { pixelsPerQuarter: 100, pixelsPerSemitone: 20 };

function note(id: string, start: number, duration: number, midi: number): PianoRollNote {
  return { id, start, duration, pitchMidicents: midi * 100, label: id };
}

const notes = [note('a', 0, 1, 60), note('b', 1, 1, 62), note('c', 2, 1, 64.5)];

describe('piano roll selection', () => {
  it('places a note by time and pitch, keeping microtonal height', () => {
    const rect = noteRect(notes[2], view);
    expect(rect.left).toBe(200);
    expect(rect.width).toBe(100);
    // 64.5 sits half a semitone above 64: its row is 10px higher than a whole-tone note.
    expect(noteRect(note('x', 2, 1, 64), view).top - rect.top).toBeCloseTo(10);
  });

  it('selects every note a marquee touches, in note order', () => {
    const a = noteRect(notes[0], view);
    const b = noteRect(notes[1], view);
    const rect = rectFromCorners(b.left + b.width, a.top + a.height, a.left + 10, b.top);
    expect(notesInRect(notes, view, rect)).toEqual(['a', 'b']);
  });

  it('catches a note the marquee only grazes, and ignores empty space', () => {
    const c = noteRect(notes[2], view);
    expect(notesInRect(notes, view, { left: c.left + c.width - 1, top: c.top, width: 5, height: 5 })).toEqual([
      'c',
    ]);
    expect(notesInRect(notes, view, { left: 900, top: 900, width: 10, height: 10 })).toEqual([]);
  });

  it('selects a whole chord once, even when the marquee touches one pitch', () => {
    const chord = [
      { ...note('c1', 0, 1, 60), sourceId: 'event-1' },
      { ...note('c2', 0, 1, 64), sourceId: 'event-1' },
      { ...note('d', 1, 1, 67), sourceId: 'event-2' },
    ];
    const low = noteRect(chord[0], view);
    expect(notesInRect(chord, view, low)).toEqual(['event-1']);
    const both = rectFromCorners(0, 0, 1000, 5000);
    expect(notesInRect(chord, view, both)).toEqual(['event-1', 'event-2']);
  });

  it('plain click replaces the selection; toggle adds and removes', () => {
    expect(clickSelection(['a', 'b'], 'c', false)).toEqual(['c']);
    expect(clickSelection(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(clickSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  });

  it('a marquee replaces the selection, or joins it when additive', () => {
    expect(marqueeSelection(['a'], ['b', 'c'], false)).toEqual(['b', 'c']);
    expect(marqueeSelection(['a', 'b'], ['b', 'c'], true)).toEqual(['a', 'b', 'c']);
  });
});
