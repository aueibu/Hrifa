import { describe, expect, it } from 'vitest';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition, rationalToNumber } from './musicalTime';
import {
  addNote,
  changeVelocity,
  clipExtent,
  clipRollDuration,
  deleteNotes,
  itemsSpan,
  moveNotes,
  packetRollNotes,
  resizeNotes,
} from './noteClipEdits';
import { commitSnippetEdit, type Snippet } from './snippet';

function item(
  id: string,
  start: number,
  length: number,
  pitches: number[],
  velocity = 1
): DataItem<NoteEventValue> {
  return {
    id,
    value: {
      onset: start === 1 / 3 ? musicalPosition(1, 3) : musicalPosition(start),
      interOnset: musicalDuration(length),
      duration: musicalDuration(length),
      pitches,
      velocity,
    },
    label: id,
    provenance: [],
  };
}

function clip(items: DataItem<NoteEventValue>[], extent = 8): DataPacket {
  return {
    ...packet('events', 'note', items),
    frame: {
      topology: 'linear',
      unit: 'quarterNote',
      extent,
      origin: 0,
      musicalExtent: musicalDuration(extent),
      musicalOrigin: musicalPosition(0),
    },
  };
}

const base = () =>
  clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6400]), item('c', 4, 2, [6000, 6400])]);
const onsets = (p: DataPacket) =>
  p.items.map((entry) => rationalToNumber((entry.value as NoteEventValue).onset.quarterNotes));

describe('note clip edits', () => {
  it('adds a note with the given id, keeps its length past the clip end, and keeps every other item by reference', () => {
    const before = base();
    const after = addNote(before, { start: 7, duration: 5, pitchMidicents: 6050.4 }, 'fresh');
    expect(after.items.slice(0, 3)).toEqual(before.items);
    after.items.slice(0, 3).forEach((entry, index) => expect(entry).toBe(before.items[index]));
    const added = after.items[3];
    expect(added.id).toBe('fresh');
    expect(added.provenance).toEqual([]);
    expect(added.value).toMatchObject({ pitches: [6050], velocity: 0.8 });
    // Notes may run past the 8-quarter clip's end.
    expect(rationalToNumber((added.value as NoteEventValue).duration.quarterNotes)).toBe(5);
    expect(before.items).toHaveLength(3);
  });

  it('accepts a note past the end of the clip, but not before its start', () => {
    const before = base();
    const past = addNote(before, { start: 9, duration: 1, pitchMidicents: 6000 }, 'x');
    expect(onsets(past)).toEqual([0, 2, 4, 9]);
    const early = addNote(before, { start: -2, duration: 1, pitchMidicents: 6000 }, 'y');
    expect(onsets(early)).toEqual([0, 2, 4, 0]);
  });

  it('moves by the delta, keeps ids, leaves other items by reference and keeps exact time', () => {
    const before = clip([item('a', 0, 1, [6000]), item('b', 1 / 3, 1, [6400])]);
    const after = moveNotes(before, ['b'], { start: 0.25, pitchMidicents: -200 });
    expect(after.items.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(after.items[0]).toBe(before.items[0]);
    expect((after.items[1].value as NoteEventValue).pitches).toEqual([6200]);
    expect((after.items[1].value as NoteEventValue).onset.quarterNotes).toEqual({
      numerator: 7,
      denominator: 12,
    });
  });

  it('moves a group by one clamped delta so it keeps its shape, and a chord as a whole', () => {
    const before = base();
    const left = moveNotes(before, ['a', 'b'], { start: -3, pitchMidicents: 0 });
    expect(onsets(left)).toEqual([0, 2, 4]);
    const some = moveNotes(before, ['b', 'c'], { start: -3, pitchMidicents: 0 });
    // b may go back by 2 (to 0), so c goes back by the same 2.
    expect(onsets(some)).toEqual([0, 0, 2]);
    const right = moveNotes(before, ['c'], { start: 5, pitchMidicents: 300 });
    // No limit at the clip's end (8): c moves the full 5. Pitches move together.
    expect(onsets(right)).toEqual([0, 2, 9]);
    expect((right.items[2].value as NoteEventValue).pitches).toEqual([6300, 6700]);
    expect(
      moveNotes(before, ['a'], { start: 0, pitchMidicents: 20000 }).items[0].value
    ).toMatchObject({
      pitches: [12700],
    });
    expect(moveNotes(before, ['a'], { start: -1, pitchMidicents: 0 })).toBe(before);
  });

  it('lets a note past the clip end move and grow freely', () => {
    const before = clip([item('long', 6, 4, [6000])], 8);
    expect(onsets(moveNotes(before, ['long'], { start: 1, pitchMidicents: 0 }))).toEqual([7]);
    const longer = resizeNotes(before, ['long'], 1);
    expect(rationalToNumber((longer.items[0].value as NoteEventValue).duration.quarterNotes)).toBe(
      5
    );
    const shorter = resizeNotes(before, ['long'], -1);
    expect(rationalToNumber((shorter.items[0].value as NoteEventValue).duration.quarterNotes)).toBe(
      3
    );
    expect(clipRollDuration(before)).toBe(10);
  });

  it('resizes with a floor, no ceiling at the clip end, and keeps a matching slot matching', () => {
    const before = base();
    const grown = resizeNotes(before, ['a'], 0.5);
    const value = grown.items[0].value as NoteEventValue;
    expect(rationalToNumber(value.duration.quarterNotes)).toBe(1.5);
    expect(value.interOnset).toEqual(value.duration);
    const floored = resizeNotes(before, ['a'], -5);
    expect(rationalToNumber((floored.items[0].value as NoteEventValue).duration.quarterNotes)).toBe(
      1 / 32
    );
    const capped = resizeNotes(before, ['c'], 10);
    expect(rationalToNumber((capped.items[2].value as NoteEventValue).duration.quarterNotes)).toBe(
      12
    );
    expect(grown.items[1]).toBe(before.items[1]);
  });

  it('deletes the chosen events only', () => {
    const before = base();
    const after = deleteNotes(before, ['b']);
    expect(after.items.map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(deleteNotes(before, ['nope'])).toBe(before);
  });

  it('changes velocity within 0 to 1', () => {
    const before = base();
    expect((changeVelocity(before, ['a'], -2).items[0].value as NoteEventValue).velocity).toBe(0);
    expect(changeVelocity(before, ['a'], 0.5)).toBe(before);
    expect((changeVelocity(before, ['a'], -0.25).items[0].value as NoteEventValue).velocity).toBe(
      0.75
    );
  });

  it('only added and modified notes get the edit step when committed (K2 provenance)', () => {
    const snippet: Snippet = {
      schemaVersion: 1,
      id: 'clip-1',
      name: 'Clip',
      createdAt: '2026-11-11T00:00:00Z',
      packet: base(),
    };
    const edited = deleteNotes(
      addNote(
        moveNotes(snippet.packet, ['a'], { start: 1, pitchMidicents: 0 }),
        {
          start: 6,
          duration: 1,
          pitchMidicents: 6000,
        },
        'fresh'
      ),
      ['b']
    );
    const result = commitSnippetEdit(snippet, edited, 'edit-notes', { handEdit: true });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const steps = (id: string) =>
      result.snippet.packet.items
        .find((entry) => entry.id === id)!
        .provenance.filter((step) => step.transformation === 'edit-notes')
        .map((step) => step.parameters?.change);
    expect(steps('a')).toEqual(['modified']);
    expect(steps('fresh')).toEqual(['added']);
    expect(steps('c')).toEqual([]);
    expect(result.snippet.packet.items.map((entry) => entry.id)).toEqual(['a', 'c', 'fresh']);
  });

  it('describes the clip: extent, one roll rectangle per pitch, and the time events occupy', () => {
    const before = base();
    expect(clipExtent(before)).toBe(8);
    expect(clipRollDuration(clip([], 4))).toBe(4);
    const notes = packetRollNotes(before);
    expect(notes).toHaveLength(4);
    expect(notes.filter((note) => note.sourceId === 'c').map((note) => note.id)).toEqual([
      'c:pitch:0',
      'c:pitch:1',
    ]);
    expect(itemsSpan(before, ['a', 'c'])).toEqual({ start: 0, end: 6 });
    expect(itemsSpan(before, ['nope'])).toBeNull();
  });
});
