import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_VELOCITY_LANE_HEIGHT, MIN_VELOCITY_LANE_HEIGHT } from '../../components/PianoRoll';
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
    expect(readNoteEditorPreferences()).toEqual({
      entryLength: null,
      entryVelocity: null,
      grid: 'auto',
      velocityLaneCollapsed: false,
      laneHeight: null,
      actionSections: ['time', 'pitch', 'values', 'clipboard'],
    });
  });

  it('remembers a length and a grid outside the workbench key prefix, and reads damage as defaults', () => {
    writeNoteEditorPreferences({ entryLength: 0.75, entryVelocity: null, grid: '1/8T' });
    expect(readNoteEditorPreferences()).toEqual({
      entryLength: 0.75,
      entryVelocity: null,
      grid: '1/8T',
      velocityLaneCollapsed: false,
      laneHeight: null,
      actionSections: ['time', 'pitch', 'values', 'clipboard'],
    });
    expect(NOTE_EDITOR_PREFERENCES_KEY.startsWith('hrifa.composition-workbench.')).toBe(false);
    localStorage.setItem(
      NOTE_EDITOR_PREFERENCES_KEY,
      JSON.stringify({ entryLength: -3, grid: 'x' })
    );
    expect(readNoteEditorPreferences()).toEqual({
      entryLength: null,
      entryVelocity: null,
      grid: 'auto',
      velocityLaneCollapsed: false,
      laneHeight: null,
      actionSections: ['time', 'pitch', 'values', 'clipboard'],
    });
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, '{nope');
    expect(readNoteEditorPreferences()).toEqual({
      entryLength: null,
      entryVelocity: null,
      grid: 'auto',
      velocityLaneCollapsed: false,
      laneHeight: null,
      actionSections: ['time', 'pitch', 'values', 'clipboard'],
    });
  });

  it('remembers a collapsed velocity lane and reads anything but true as expanded', () => {
    writeNoteEditorPreferences({ velocityLaneCollapsed: true });
    expect(readNoteEditorPreferences().velocityLaneCollapsed).toBe(true);
    localStorage.setItem(
      NOTE_EDITOR_PREFERENCES_KEY,
      JSON.stringify({ velocityLaneCollapsed: 'yes' })
    );
    expect(readNoteEditorPreferences().velocityLaneCollapsed).toBe(false);
  });

  it('clamps a length on write to the range the read accepts, so it always reads back', () => {
    writeNoteEditorPreferences({ entryLength: 1000 });
    expect(readNoteEditorPreferences().entryLength).toBe(MAX_ENTRY_LENGTH);
    writeNoteEditorPreferences({ entryLength: 0 });
    expect(readNoteEditorPreferences().entryLength).toBe(MIN_ENTRY_LENGTH);
    writeNoteEditorPreferences({ entryLength: Number.NaN });
    expect(readNoteEditorPreferences().entryLength).toBeNull();
  });

  it('round-trips a remembered velocity, clamps it on write, and reads out-of-range as null', () => {
    writeNoteEditorPreferences({ entryVelocity: 0.38 });
    expect(readNoteEditorPreferences().entryVelocity).toBe(0.38);
    writeNoteEditorPreferences({ entryVelocity: 1.5 });
    expect(readNoteEditorPreferences().entryVelocity).toBe(1);
    writeNoteEditorPreferences({ entryVelocity: 0 });
    expect(readNoteEditorPreferences().entryVelocity).toBe(0.01);
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, JSON.stringify({ entryVelocity: 2 }));
    expect(readNoteEditorPreferences().entryVelocity).toBeNull();
  });

  it('round-trips the lane height, clamps it on write, and reads out-of-range as null', () => {
    writeNoteEditorPreferences({ laneHeight: 120 });
    expect(readNoteEditorPreferences().laneHeight).toBe(120);
    writeNoteEditorPreferences({ laneHeight: 5000 });
    expect(readNoteEditorPreferences().laneHeight).toBe(MAX_VELOCITY_LANE_HEIGHT);
    writeNoteEditorPreferences({ laneHeight: 1 });
    expect(readNoteEditorPreferences().laneHeight).toBe(MIN_VELOCITY_LANE_HEIGHT);
    writeNoteEditorPreferences({ laneHeight: null });
    expect(readNoteEditorPreferences().laneHeight).toBeNull();
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, JSON.stringify({ laneHeight: 9999 }));
    expect(readNoteEditorPreferences().laneHeight).toBeNull();
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, JSON.stringify({ laneHeight: 'tall' }));
    expect(readNoteEditorPreferences().laneHeight).toBeNull();
  });

  it('remembers which Actions sections are open (all by default), keeping only known ids in order', () => {
    expect(readNoteEditorPreferences().actionSections).toEqual([
      'time',
      'pitch',
      'values',
      'clipboard',
    ]);
    writeNoteEditorPreferences({ actionSections: ['clipboard', 'time'] });
    expect(readNoteEditorPreferences().actionSections).toEqual(['time', 'clipboard']);
    writeNoteEditorPreferences({ actionSections: [] });
    expect(readNoteEditorPreferences().actionSections).toEqual([]);
    // Outside the workbench prefix, so a saved project never captures it.
    expect(JSON.parse(localStorage.getItem(NOTE_EDITOR_PREFERENCES_KEY) ?? '{}')).toMatchObject({
      actionSections: [],
    });
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, JSON.stringify({ actionSections: 'time' }));
    expect(readNoteEditorPreferences().actionSections).toHaveLength(4);
    localStorage.setItem(
      NOTE_EDITOR_PREFERENCES_KEY,
      JSON.stringify({ actionSections: ['pitch', 'bogus', 'pitch'] })
    );
    expect(readNoteEditorPreferences().actionSections).toEqual(['pitch']);
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
