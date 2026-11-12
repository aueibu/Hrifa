import { describe, expect, it } from 'vitest';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import { moveNotes } from './noteClipEdits';
import {
  emptyNoteSelection,
  extendRange,
  followEdit,
  pruneSelection,
  selectIds,
} from './noteSelection';

function item(id: string, start: number, length: number): DataItem<NoteEventValue> {
  return {
    id,
    value: {
      onset: musicalPosition(start),
      interOnset: musicalDuration(length),
      duration: musicalDuration(length),
      pitches: [6000],
      velocity: 1,
    },
    provenance: [],
  };
}

const notes = packet('events', 'note', [item('a', 0, 1), item('b', 2, 1), item('c', 4, 2)]);

describe('note selection: events and the time they occupy', () => {
  it('starts empty and holds the span of the selected events', () => {
    expect(emptyNoteSelection).toEqual({ ids: [], range: null });
    expect(selectIds(notes, ['a', 'c'])).toEqual({ ids: ['a', 'c'], range: { start: 0, end: 6 } });
    expect(selectIds(notes, ['ghost'])).toEqual({ ids: [], range: null });
  });

  it('extends over empty space and keeps the events', () => {
    const picked = selectIds(notes, ['b']);
    const wider = extendRange(picked, { start: 2.5, end: 5 });
    expect(wider).toEqual({ ids: ['b'], range: { start: 2, end: 5 } });
    // A time-only selection: no events, a range.
    expect(extendRange(emptyNoteSelection, { start: 6, end: 8 })).toEqual({
      ids: [],
      range: { start: 6, end: 8 },
    });
    expect(extendRange(picked, { start: 3, end: 3 })).toBe(picked);
  });

  it('drops events that are gone and falls back to what is left', () => {
    const wide = extendRange(selectIds(notes, ['a', 'b']), { start: 0, end: 7 });
    const without = packet('events', 'note', [item('a', 0, 1)]);
    expect(pruneSelection(wide, without)).toEqual({ ids: ['a'], range: { start: 0, end: 1 } });
    expect(pruneSelection(wide, notes)).toBe(wide);
  });

  it('follows the events when an edit moves them, keeping the empty space it covered', () => {
    const wide = extendRange(selectIds(notes, ['b']), { start: 2, end: 4 });
    const moved = moveNotes(notes, ['b'], { start: 1, pitchMidicents: 0 });
    expect(followEdit(wide, notes, moved)).toEqual({ ids: ['b'], range: { start: 3, end: 5 } });
  });
});
