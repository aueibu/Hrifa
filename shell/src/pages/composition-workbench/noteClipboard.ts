import { useSyncExternalStore } from 'react';
import type { NoteEventValue } from './melodicization';
import type { Provenance } from './model';
import type { Rational } from './musicalTime';

/**
 * The note clipboard (K5b-2b): what Copy took, held in memory for this viewer only. It is
 * module-level state, deliberately outside the history, the projects and any desk storage: it
 * crosses clips (copy in one, paste in another) and is gone with the page. Copied notes are held
 * relative to where the copy started, so a paste can land them anywhere.
 */
export interface ClipboardNote {
  /** The note's onset relative to the clipboard's origin, in quarter notes (never negative). */
  offset: Rational;
  /** The note as it was copied, without its onset (that is `offset`). Pitches, velocity, lengths kept. */
  value: Omit<NoteEventValue, 'onset'>;
  label?: string;
  /** The copied note's provenance, carried to the pasted note. */
  provenance: Provenance[];
}

export interface NoteClipboard {
  /** The notes, in the order they were in the clip they were copied from. */
  notes: ClipboardNote[];
}

// On globalThis for the same reason as the editor channel: one clipboard per page even if this
// module is hot-reloaded or loaded twice.
const shared = globalThis as typeof globalThis & {
  __noteClipboard?: { value: NoteClipboard | null; listeners: Set<() => void> };
};
const store = (shared.__noteClipboard ??= { value: null, listeners: new Set<() => void>() });
const { listeners } = store;

/** The viewer's clipboard right now, or null when nothing was copied. */
export function readNoteClipboard(): NoteClipboard | null {
  return store.value;
}

/** Replaces the clipboard (a Copy). */
export function writeNoteClipboard(next: NoteClipboard) {
  store.value = next;
  listeners.forEach((listener) => listener());
}

/** Empties the clipboard (tests; there is no user action for it). */
export function clearNoteClipboard() {
  if (store.value !== null) {
    store.value = null;
    listeners.forEach((listener) => listener());
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The clipboard, re-rendering the caller when a Copy replaces it (the Paste button's enabled state). */
export function useNoteClipboard(): NoteClipboard | null {
  return useSyncExternalStore(
    subscribe,
    () => store.value,
    () => null
  );
}
