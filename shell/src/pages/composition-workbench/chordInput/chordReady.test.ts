import { describe, expect, it } from 'vitest';
import { chordReady, insertBlockedReason, type ChordReadyInput } from './chordReady';

const base: ChordReadyInput = {
  hasTarget: true,
  targetName: 'clip-a',
  mode: 'anchor',
  rollHost: true,
  anchor: null,
  selectedNotes: null,
};

describe('chordReady: the Chords panel ready line value', () => {
  it('no claim: No target, whatever else is set', () => {
    expect(chordReady({ ...base, hasTarget: false })).toEqual({
      state: 'no-target',
      text: 'No target: open a clip to insert',
    });
    expect(
      chordReady({ ...base, hasTarget: false, mode: 'selection', selectedNotes: 3 }).state
    ).toBe('no-target');
  });

  it('anchor mode: Ready, "Anchor: click in the roll" until an anchor is set, then what Insert does', () => {
    expect(chordReady(base)).toEqual({ state: 'ready', text: 'Anchor: click in the roll' });
    expect(chordReady({ ...base, anchor: { pitchMidicents: 6000, start: 0 } })).toEqual({
      state: 'ready',
      text: 'Anchor: Insert places the chord at C4, bar 1 beat 1',
    });
    expect(chordReady({ ...base, anchor: { pitchMidicents: 6900, start: 2.5 } }).text).toBe(
      'Anchor: Insert places the chord at A4, bar 1 beat 3.5'
    );
  });

  it('the position is "bar X beat Y" in the clip meter, like the editor', () => {
    const at = (start: number, meter?: string) =>
      chordReady({ ...base, meter, anchor: { pitchMidicents: 6000, start } }).text;
    expect(at(4)).toBe('Anchor: Insert places the chord at C4, bar 2 beat 1');
    expect(at(3, '3/4')).toBe('Anchor: Insert places the chord at C4, bar 2 beat 1');
    expect(at(2.5, '3/4')).toBe('Anchor: Insert places the chord at C4, bar 1 beat 3.5');
    // 6/8: a beat is an eighth (half a quarter), a bar is 3 quarters.
    expect(at(3.5, '6/8')).toBe('Anchor: Insert places the chord at C4, bar 2 beat 2');
  });

  it('selection mode: one note, several notes, nothing, a time range only', () => {
    const selection = { ...base, mode: 'selection' as const };
    expect(chordReady({ ...selection, selectedNotes: 1 })).toEqual({
      state: 'ready',
      text: 'Insert: one chord on the selected note',
    });
    expect(chordReady({ ...selection, selectedNotes: 2 })).toEqual({
      state: 'ready',
      text: 'Insert: one chord on each of 2 selected notes',
    });
    expect(chordReady({ ...selection, selectedNotes: 12 }).text).toBe(
      'Insert: one chord on each of 12 selected notes'
    );
    expect(chordReady({ ...selection, selectedNotes: null })).toEqual({
      state: 'waiting',
      text: 'Select a note, or use the Chords tool',
    });
    expect(chordReady({ ...selection, selectedNotes: 0 })).toEqual({
      state: 'waiting',
      text: 'Select a note',
    });
  });

  it('a list host (no roll): waiting while it has no position, then "Insert into <label>" (just "Insert" without a label)', () => {
    const list = { ...base, rollHost: false, targetName: 'the progression' };
    expect(chordReady(list)).toEqual({ state: 'waiting', text: 'Choose where the chord goes' });
    expect(chordReady({ ...list, anchor: { pitchMidicents: 6000, start: 0 } })).toEqual({
      state: 'ready',
      text: 'Insert into the progression',
    });
    expect(
      chordReady({ ...list, targetName: '', anchor: { pitchMidicents: 6000, start: 0 } }).text
    ).toBe('Insert');
  });

  it('a list host in selection mode says nothing about a roll or the Chords tool', () => {
    const text = chordReady({ ...base, rollHost: false, mode: 'selection' }).text;
    expect(text).toBe('Choose where the chord goes');
    expect(text).not.toMatch(/Chords tool|note/);
  });

  it('fail closed: a roll host that cannot insert several chords is waiting, whatever is selected', () => {
    expect(
      chordReady({ ...base, mode: 'selection', selectedNotes: 2, canInsertMany: false })
    ).toEqual({ state: 'waiting', text: 'This host cannot insert several chords' });
    expect(
      chordReady({ ...base, mode: 'selection', selectedNotes: 2, canInsertMany: true }).state
    ).toBe('ready');
  });

  it('the insert is blocked with the line text unless Ready', () => {
    expect(
      insertBlockedReason(chordReady({ ...base, mode: 'selection', selectedNotes: 1 }))
    ).toBeNull();
    expect(insertBlockedReason(chordReady({ ...base, mode: 'selection' }))).toBe(
      'Select a note, or use the Chords tool'
    );
    expect(insertBlockedReason(chordReady({ ...base, hasTarget: false }))).toBe(
      'No target: open a clip to insert'
    );
  });
});
