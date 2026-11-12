import { beforeEach, describe, expect, it } from 'vitest';
import {
  GRID_OPTIONS,
  MAX_ENTRY_LENGTH,
  MIN_ENTRY_LENGTH,
  NOTE_EDITOR_PREFERENCES_KEY,
  readNoteEditorPreferences,
  writeNoteEditorPreferences,
} from './noteEditorPreferences';

beforeEach(() => localStorage.clear());

describe('note editor preferences', () => {
  it('defaults to the automatic grid and no remembered length', () => {
    expect(readNoteEditorPreferences()).toEqual({ entryLength: null, grid: 'auto' });
  });

  it('remembers a length and a grid outside the workbench key prefix, and reads damage as defaults', () => {
    writeNoteEditorPreferences({ entryLength: 0.75, grid: '1/8T' });
    expect(readNoteEditorPreferences()).toEqual({ entryLength: 0.75, grid: '1/8T' });
    expect(NOTE_EDITOR_PREFERENCES_KEY.startsWith('hrifa.composition-workbench.')).toBe(false);
    localStorage.setItem(
      NOTE_EDITOR_PREFERENCES_KEY,
      JSON.stringify({ entryLength: -3, grid: 'x' })
    );
    expect(readNoteEditorPreferences()).toEqual({ entryLength: null, grid: 'auto' });
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, '{nope');
    expect(readNoteEditorPreferences()).toEqual({ entryLength: null, grid: 'auto' });
  });

  it('clamps a length on write to the range the read accepts, so it always reads back', () => {
    writeNoteEditorPreferences({ entryLength: 1000 });
    expect(readNoteEditorPreferences().entryLength).toBe(MAX_ENTRY_LENGTH);
    writeNoteEditorPreferences({ entryLength: 0 });
    expect(readNoteEditorPreferences().entryLength).toBe(MIN_ENTRY_LENGTH);
    writeNoteEditorPreferences({ entryLength: Number.NaN });
    expect(readNoteEditorPreferences().entryLength).toBeNull();
  });

  it('offers 1/1 to 1/32 and the triplets, in quarter notes', () => {
    const by = (id: string) => GRID_OPTIONS.find((option) => option.id === id)?.quarters;
    expect(by('1/1')).toBe(4);
    expect(by('1/4')).toBe(1);
    expect(by('1/32')).toBe(0.125);
    expect(by('1/8T')).toBeCloseTo(1 / 3);
    expect(by('1/2T')).toBeCloseTo(4 / 3);
    expect(by('auto')).toBeNull();
  });
});
