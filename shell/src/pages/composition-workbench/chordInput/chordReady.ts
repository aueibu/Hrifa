import type { ReadyValue } from '../components/readyState';
/**
 * The Chords panel's ready line value (READY-LINE.md, the workbench "Ready line" rules): ONE pure function returns
 * `{ state, text }` and both the line and the reason on a blocked insert read it, so they never disagree.
 *
 * - `ready`: what Insert will do ("Anchor: click in the roll", "Insert: one chord on each of 2 selected notes").
 * - `waiting`: the one thing needed next ("Select a note, or use the Chords tool").
 * - `no-target`: why nothing can happen here now ("No target: open a data-block to insert").
 *
 * Audition never needs a target, so no state blocks it; only the insert is blocked (`insertBlocked`).
 */
import { barBeatText } from '../positionWording';
import { pitchLabel } from '../routeTreatments';

export const NO_TARGET_TEXT = 'No target: open a data-block to insert';
export const ANCHOR_TEXT = 'Anchor: click in the roll';
export const NO_SELECTION_TEXT = 'Select a note, or use the Chords tool';
export const RANGE_ONLY_TEXT = 'Select a note';
const LIST_WAITING_TEXT = 'Choose where the chord goes';
export const CANNOT_INSERT_MANY_TEXT = 'This host cannot insert several chords';

export interface ChordReadyInput {
  /** Is there an active claim (a data-block open)? */
  hasTarget: boolean;
  /** The host's display name, for a host that is not a roll ("Insert into <name>"); empty: just "Insert". Never a raw id. */
  targetName: string;
  /** The host's meter for "bar X beat Y"; absent: 4/4. */
  meter?: string;
  /** Selection mode: can the host insert several chords in one step? Absent: yes. False: a waiting state, no insert. */
  canInsertMany?: boolean;
  /** Anchor mode (the Chords tool, or any host that wants the picker) or selection mode (another tool). */
  mode: 'anchor' | 'selection';
  /** Does the host have notes and a selection (the data-block editor), as opposed to a list? */
  rollHost: boolean;
  /** Anchor mode: the anchor, when one is set. */
  anchor: { pitchMidicents: number; start: number } | null;
  /** Selection mode: the number of selected notes; null: nothing selected; 0: a selection with no notes (a time range). */
  selectedNotes: number | null;
}

export function chordReady(input: ChordReadyInput): ReadyValue {
  if (!input.hasTarget) {
    return { state: 'no-target', text: NO_TARGET_TEXT };
  }
  if (input.mode === 'anchor') {
    if (!input.rollHost) {
      // A list host (the progression test host): the generic Ready once it has a position; its own hint stays in the
      // picker body, so the line only says what is missing.
      return input.anchor
        ? {
            state: 'ready',
            text: input.targetName ? `Insert into ${input.targetName}` : 'Insert',
          }
        : { state: 'waiting', text: LIST_WAITING_TEXT };
    }
    if (!input.anchor) {
      return { state: 'ready', text: ANCHOR_TEXT };
    }
    const place = barBeatText(input.anchor.start, input.meter ?? '4/4');
    return {
      state: 'ready',
      text: `Anchor: Insert places the chord at ${pitchLabel(input.anchor.pitchMidicents)}, ${place}`,
    };
  }
  // Selection mode: a host with no notes (a list) has no selection to act on, and says nothing about a roll.
  if (!input.rollHost) {
    return { state: 'waiting', text: LIST_WAITING_TEXT };
  }
  if (input.canInsertMany === false) {
    return { state: 'waiting', text: CANNOT_INSERT_MANY_TEXT };
  }
  const count = input.selectedNotes;
  if (count === null) {
    return { state: 'waiting', text: NO_SELECTION_TEXT };
  }
  if (count === 0) {
    return { state: 'waiting', text: RANGE_ONLY_TEXT };
  }
  return {
    state: 'ready',
    text:
      count === 1
        ? 'Insert: one chord on the selected note'
        : `Insert: one chord on each of ${count} selected notes`,
  };
}

/**
 * Whether the insert is blocked, and the reason (the ready line's own text). An anchor-mode roll host with no anchor yet
 * is not blocked here: the picker is not shown until a click sets the anchor.
 */
export function insertBlockedReason(ready: ReadyValue): string | null {
  return ready.state === 'ready' ? null : ready.text;
}
