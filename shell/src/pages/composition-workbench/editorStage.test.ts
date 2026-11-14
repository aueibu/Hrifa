import { describe, expect, it } from 'vitest';
import { columnWidth, locate } from '../../lib/stage';
import {
  CHORDS_MODULE,
  DEFAULT_PICKER_REM,
  FALLBACK_ROLL_REM,
  ROLL_MODULE,
  defaultEditorLayout,
  hasBothModules,
  migratedPickerRem,
} from './editorStage';

describe('migratedPickerRem', () => {
  it('keeps the default when no width was stored', () => {
    expect(migratedPickerRem(null)).toBe(DEFAULT_PICKER_REM);
    expect(migratedPickerRem(Number.NaN)).toBe(DEFAULT_PICKER_REM);
  });
  it('carries a stored pixel width over as rem', () => {
    expect(migratedPickerRem(480)).toBe(30);
    expect(migratedPickerRem(640)).toBe(40);
    expect(migratedPickerRem(640, 20)).toBe(32);
  });
  it('clamps to the Stage column limits', () => {
    expect(migratedPickerRem(1)).toBe(12);
  });
});

describe('defaultEditorLayout', () => {
  it('puts the picker beside the roll, leaving the picker its width in the measured room', () => {
    const l = defaultEditorLayout(100, 30);
    expect(l.columns.map((c) => c.slots)).toEqual([[ROLL_MODULE], [CHORDS_MODULE]]);
    expect(columnWidth(l.columns[1])).toBe(30);
    expect(columnWidth(l.columns[0])).toBe(69);
    expect(hasBothModules(l)).toBe(true);
  });
  it('uses a fixed roll width until the Stage is measured', () => {
    expect(columnWidth(defaultEditorLayout(0).columns[0])).toBe(FALLBACK_ROLL_REM);
  });
  it('never gives the roll less than the Stage minimum', () => {
    expect(columnWidth(defaultEditorLayout(20, 30).columns[0])).toBe(12);
  });
  it('a narrow editor shrinks the picker so both columns fit; the floor holds at the extreme', () => {
    const narrow = defaultEditorLayout(30, 30);
    expect(columnWidth(narrow.columns[1])).toBe(17);
    expect(columnWidth(narrow.columns[0])).toBe(12);
    expect(columnWidth(defaultEditorLayout(25, 30).columns[1])).toBe(12);
    expect(columnWidth(defaultEditorLayout(15, 30).columns[1])).toBe(12);
    expect(columnWidth(defaultEditorLayout(100, 30).columns[1])).toBe(30);
  });
  it('a layout lacking either module is not usable', () => {
    const l = defaultEditorLayout(100);
    expect(hasBothModules({ ...l, columns: [l.columns[0]] })).toBe(false);
    expect(locate(l, CHORDS_MODULE)?.column).toBe(1);
  });
});
