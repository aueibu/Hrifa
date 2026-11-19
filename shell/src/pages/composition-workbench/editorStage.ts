/**
 * LEGACY (M6a): the Stage inside the note clip editor is gone (the roll fills the clip editor panel and the chord
 * picker is the page's `chords` panel). What remains is the description of the OLD layout, still read once when a
 * project with no screenset store is seeded (`layout/workbenchScreensets.ts` folds `hrifa.stage.layout.workbench-editor.v1`
 * and `chordDockWidth` into the default screensets), and used by `lib/stage/migrate.test.ts`. Nothing renders from it.
 * Move it next to `lib/stage/migrate.ts` and delete this file when that shared path can be edited.
 *
 * The old design: which modules it hosted, its layout key, and the pure rules for its default layout and for migrating
 * the old dock preferences. No React here.
 *
 * Two modules, both closures built in the editor body (the chord session and the roll's view state stay there):
 * the roll and the chord picker. The picker is in the layout only while the Chords tool is active and its host is the
 * dock; with the canvas takeover as host, or with another tool, the Stage shows the roll alone.
 */
import { columnWidth, locate, type Layout } from '../../lib/stage';

export const EDITOR_STAGE_KEY = 'hrifa.stage.layout.workbench-editor.v1';
export const ROLL_MODULE = 'roll';
export const CHORDS_MODULE = 'chords';

/** The picker column's default width in rem: the old dock's default (480px). */
export const DEFAULT_PICKER_REM = 30;
/** The roll column's width when the Stage has not been measured yet. */
export const FALLBACK_ROLL_REM = 36;
/** The width the Stage counts as before it is measured (a jsdom test, the first frame): wide enough for both. */
export const FALLBACK_STAGE_WIDTH_REM = 80;
/** Stage padding plus one splitter, rem (STAGE_COLUMN_COST in components/Stage/stageOps.ts). */
const CHROME_REM = 1;
/** The smallest column either module accepts (the Stage's minimum column width). */
export const ROLL_MIN_REM = 12;
export const PICKER_MIN_REM = 12;

/**
 * The picker column's width from the stored `chordDockWidth` preference (pixels): the old drag carries over as rem.
 * Absent (null) keeps the default.
 */
export function migratedPickerRem(chordDockWidthPx: number | null, rootPx = 16): number {
  if (chordDockWidthPx === null || !Number.isFinite(chordDockWidthPx) || chordDockWidthPx <= 0) {
    return DEFAULT_PICKER_REM;
  }
  return columnWidth({ slots: [], width: chordDockWidthPx / (rootPx > 0 ? rootPx : 16) });
}

/**
 * The layout a viewer with no stored arrangement sees: the roll, then the picker beside it at `pickerRem`. The picker
 * is the last column, which the Stage lets fill the spare room, so the roll's width is set to leave the picker its
 * width at the measured Stage width (`widthRem`, 0 or less while unknown).
 */
export function defaultEditorLayout(
  widthRem: number,
  wantedPickerRem = DEFAULT_PICKER_REM
): Layout {
  // In a narrow editor the picker shrinks (never below its module minimum) so both columns stay visible.
  const pickerRem =
    widthRem > 0
      ? Math.max(PICKER_MIN_REM, Math.min(wantedPickerRem, widthRem - ROLL_MIN_REM - CHROME_REM))
      : wantedPickerRem;
  const roll = widthRem > 0 ? Math.max(0, widthRem - pickerRem - CHROME_REM) : FALLBACK_ROLL_REM;
  return {
    version: 1,
    columns: [
      { slots: [ROLL_MODULE], width: columnWidth({ slots: [], width: roll }) },
      { slots: [CHORDS_MODULE], width: pickerRem },
    ],
  };
}

/** A stored layout is usable only when it holds both modules (otherwise the default is used). */
export const hasBothModules = (l: Layout): boolean =>
  !!locate(l, ROLL_MODULE) && !!locate(l, CHORDS_MODULE);
