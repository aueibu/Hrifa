import { useSyncExternalStore } from 'react';
import type { ClipActionResult, ClipActionSelection } from './clipActions';
import type { DataPacket } from './model';
import type { RotationSessionCore } from './rotationSession';

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
/**
 * The second part of a two-part action (pick a pitch row in the roll). The editor shows the hint
 * while it waits and owns the clicks: the next click on a pitch row (the roll or the keys) calls
 * `onPick` with that row's midi number (0 to 127); Enter calls `onDefault` when there is one;
 * Escape, another tool, another clip or `cancelPick` drop it. The selection is untouched throughout.
 */
export interface PickPitchRequest {
  /** The registry action the pick belongs to (shown as active in the panel). */
  actionId: string;
  hint: string;
  onPick(midi: number): void;
  onDefault?(): void;
}

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
   * for (or keeps its own) against the committed packet. `survivorOf` is given when duplicate notes
   * were merged into the commit (dropped id to the id that absorbed it).
   */
  adopt(
    result: Extract<ClipActionResult, { ok: true }>,
    committed: DataPacket,
    survivorOf?: ReadonlyMap<string, string>
  ): void;
  /** The live rotation session (rotationSession.ts), or null when there is none or it ended. */
  rotation?: RotationSessionCore | null;
  /** The action id of the pick the editor is waiting for, or null. */
  picking: string | null;
  /** Puts the editor into pick-pitch mode (replacing any pick already waiting). */
  beginPick(request: PickPitchRequest): void;
  /** Leaves pick-pitch mode without applying anything. */
  cancelPick(): void;
}

// Held on globalThis, not in module scope: a hot-reloaded copy of this module (dev) or a second
// instance must share the one store with the editor that published into the first, or the inspector
// would read an empty channel and every action would silently act on the whole clip.
const shared = globalThis as typeof globalThis & {
  __noteEditorChannel?: {
    channels: Map<string, NoteEditorChannelState>;
    listeners: Set<() => void>;
  };
};
const store = (shared.__noteEditorChannel ??= {
  channels: new Map<string, NoteEditorChannelState>(),
  listeners: new Set<() => void>(),
});
const { channels, listeners } = store;

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
