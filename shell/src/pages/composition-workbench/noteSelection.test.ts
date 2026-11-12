import { describe, expect, it } from 'vitest';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import { moveNotes } from './noteClipEdits';
import {
  clearTimeSelection,
  emptyNoteSelection,
  extendRange,
  followEdit,
  itemsBand,
  pruneSelection,
  pruneTimeRange,
  selectIds,
  selectTime,
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

  it('marks a time selection whose range is exactly the dragged span, never widened to notes', () => {
    // n2 spans 2..3 and n3 4..6: the span 2.5..5 catches both but the range stays 2.5..5.
    const timed = selectTime(selectIds(notes, ['b']), { start: 2.5, end: 5 });
    expect(timed).toEqual({ ids: ['b'], range: { start: 2.5, end: 5 }, kind: 'time' });
    expect(selectTime(emptyNoteSelection, { start: 6, end: 8 })).toEqual({
      ids: [],
      range: { start: 6, end: 8 },
      kind: 'time',
    });
    expect(selectIds(notes, ['b']).kind).toBeUndefined();
    expect(extendRange(selectIds(notes, ['b']), { start: 2.5, end: 5 }).kind).toBeUndefined();
  });

  it('a shift-additive time drag unions only touching spans and never fills the gap between spans', () => {
    const first = selectTime(emptyNoteSelection, { start: 0, end: 2 });
    // Overlapping or touching: one span.
    expect(selectTime(first, { start: 1, end: 3 }, true).range).toEqual({ start: 0, end: 3 });
    expect(selectTime(first, { start: 2, end: 3 }, true).range).toEqual({ start: 0, end: 3 });
    // A separate span: its own range, the gap 2..6 is not selected.
    expect(selectTime(first, { start: 6, end: 8 }, true).range).toEqual({ start: 6, end: 8 });
    // Not additive: always just the dragged span.
    expect(selectTime(first, { start: 1, end: 3 }).range).toEqual({ start: 1, end: 3 });
    // An additive drag over a note selection ignores the notes' span too.
    expect(selectTime(selectIds(notes, ['a', 'c']), { start: 3, end: 4 }, true).range).toEqual({
      start: 3,
      end: 4,
    });
  });

  it('drops events that are gone and falls back to what is left', () => {
    const wide = extendRange(selectIds(notes, ['a', 'b']), { start: 0, end: 7 });
    const without = packet('events', 'note', [item('a', 0, 1)]);
    expect(pruneSelection(wide, without)).toEqual({ ids: ['a'], range: { start: 0, end: 1 } });
    expect(pruneSelection(wide, notes)).toBe(wide);
  });

  it('a time selection keeps its kind and range when notes go, held only to the clip', () => {
    const time = { ...selectTime(selectIds(notes, ['a', 'b']), { start: 0, end: 4 }) };
    const without = packet('events', 'note', [item('a', 0, 1)]);
    // Deleted notes drop out of the ids; the span and the kind stay.
    expect(pruneSelection(time, without)).toEqual({
      ids: ['a'],
      range: { start: 0, end: 4 },
      kind: 'time',
    });
    expect(pruneSelection(time, notes)).toBe(time);
    // Pruned to the clip: the start at 0 and the end at the limit.
    expect(pruneSelection(time, notes, 3).range).toEqual({ start: 0, end: 3 });
    expect(pruneTimeRange({ start: -2, end: 1 })).toEqual({ start: 0, end: 1 });
    expect(pruneTimeRange({ start: 5, end: 8 }, 4)).toBeNull();
    expect(pruneSelection(selectTime(emptyNoteSelection, { start: 5, end: 8 }), notes, 4)).toBe(
      emptyNoteSelection
    );
  });

  it('editing notes never moves or widens a time selection', () => {
    const time = selectTime(selectIds(notes, ['b']), { start: 2, end: 4 });
    const moved = moveNotes(notes, ['b'], { start: 1, pitchMidicents: 0 });
    expect(followEdit(time, notes, moved)).toBe(time);
  });

  it('follows the events when an edit moves them, keeping the empty space it covered', () => {
    const wide = extendRange(selectIds(notes, ['b']), { start: 2, end: 4 });
    const moved = moveNotes(notes, ['b'], { start: 1, pitchMidicents: 0 });
    expect(followEdit(wide, notes, moved)).toEqual({ ids: ['b'], range: { start: 3, end: 5 } });
  });
});

describe('one band at a time', () => {
  it('a time selection is cleared by a press; a note selection is kept', () => {
    const time = selectTime(emptyNoteSelection, { start: 1, end: 3 });
    expect(clearTimeSelection(time)).toBe(emptyNoteSelection);
    const picked = selectIds(notes, ['b']);
    expect(clearTimeSelection(picked)).toBe(picked);
  });

  it('the items band is the notes span for a note selection, never for a time selection or no notes', () => {
    expect(itemsBand(selectIds(notes, ['b']))).toEqual({ start: 2, end: 3 });
    expect(itemsBand(selectTime(selectIds(notes, ['b']), { start: 1, end: 3 }))).toBeNull();
    expect(itemsBand(emptyNoteSelection)).toBeNull();
    expect(itemsBand(extendRange(emptyNoteSelection, { start: 1, end: 2 }))).toBeNull();
  });
});
