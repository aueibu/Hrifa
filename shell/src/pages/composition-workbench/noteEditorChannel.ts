import { useSyncExternalStore } from 'react';
import type { ClipActionResult, ClipActionSelection } from './clipActions';
import type { DataPacket } from './model';

/**
 * The editor -> inspector channel. The note editor keeps its selection and grid in its own state
 * (transient view state, never in the packet or the history); the inspector's actions panel, in
 * another part of the page, has to read them at the moment a button is pressed, and tell the editor
 * what the selection becomes after the action. A small module-level store keyed by clip id does
 * that: the open editor publishes `{ selection, gridUnit, adopt }` after every render that changed
 * them and withdraws it when it unmounts; the panel reads the current value (never a render's copy)
 * and calls `adopt`. Reading never changes anything, so using the panel can never clear or steal the
 * selection.
 */
export interface NoteEditorChannelState {
  /** The editor's current selection. */
  selection: ClipActionSelection;
  /** The editor's grid unit in quarter notes; undefined when it is on Auto. */
  gridUnit: number | undefined;
  /**
   * The unit the roll snaps to right now in quarter notes: the grid unit, or on Auto the adaptive
   * subdivision at the current zoom. What grid-based actions use, so Auto matches what is shown.
   */
  snapUnit: number;
  /**
   * Called after an action's packet was committed: the editor takes the selection the action asked
   * for (or keeps its own) against the committed packet.
   */
  adopt(result: Extract<ClipActionResult, { ok: true }>, committed: DataPacket): void;
}

const channels = new Map<string, NoteEditorChannelState>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** Publishes (replacing) the open editor's state for a clip. */
export function publishNoteEditor(clipId: string, state: NoteEditorChannelState) {
  channels.set(clipId, state);
  notify();
}

/** Withdraws the clip's editor state (its editor closed). */
export function withdrawNoteEditor(clipId: string) {
  if (channels.delete(clipId)) {
    notify();
  }
}

/** The editor's state for the clip right now, or undefined when no editor has it open. */
export function readNoteEditor(clipId: string): NoteEditorChannelState | undefined {
  return channels.get(clipId);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The editor's state for the clip, re-rendering the caller when the editor publishes a change. */
export function useNoteEditorState(clipId: string): NoteEditorChannelState | undefined {
  return useSyncExternalStore(
    subscribe,
    () => channels.get(clipId),
    () => undefined
  );
}
