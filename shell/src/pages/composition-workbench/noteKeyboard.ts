import { MIN_NOTE_QUARTERS } from '../../components/PianoRoll';
import type { DataPacket } from './model';
import { rationalToNumber } from './musicalTime';
import { moveNotes, resizeNotes, isNoteItem, type NoteItem } from './noteClipEdits';

/**
 * Pure parts of the note editor's keyboard editing (the arrow keys act on the selected notes; the
 * editor wires them to `commit()`, one hand-edit undo step per press). Each edit takes the packet and
 * returns a new one, or the same packet when the key changes nothing.
 */

/** Shift+Left/Right nudges notes off the grid by the effective grid unit divided by this (three subdivisions finer). */
export const NUDGE_GRID_DIVISOR = 8;

/** The nudge never gets finer than this (1/1024 of a quarter): at tiny grid units it still nudges by this. */
export const MIN_NUDGE_QUARTERS = 1 / 1024;

/** The Shift+Left/Right nudge for a grid unit in quarters: unit / 8, but never below the floor. */
export function nudgeQuarters(gridUnit: number): number {
  return Math.max(gridUnit / NUDGE_GRID_DIVISOR, MIN_NUDGE_QUARTERS);
}

/** One pitch step in midicents: the roll's rows are the 128 MIDI semitones (not edo-aware). */
export const PITCH_STEP_MIDICENTS = 100;

/** One octave in midicents: 12 roll rows. */
export const OCTAVE_MIDICENTS = 1200;

const MAX_MIDICENTS = 12700;

export type NoteKeyEdit =
  | { kind: 'move'; quarters: number }
  | { kind: 'pitch'; midicents: number }
  | { kind: 'length'; quarters: number };

/** What an arrow key does, given the modifiers and the editor's grid unit, or null for no binding. */
export function noteKeyEdit(
  key: string,
  modifiers: { shift: boolean; alt: boolean; mod: boolean },
  gridUnit: number
): NoteKeyEdit | { kind: 'navigate'; direction: 1 | -1 } | null {
  const horizontal = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  const vertical = key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0;
  if (!horizontal && !vertical) {
    return null;
  }
  const { shift, alt, mod } = modifiers;
  if (alt) {
    return horizontal && !shift && !mod ? { kind: 'navigate', direction: horizontal } : null;
  }
  if (mod) {
    return horizontal && !shift ? { kind: 'length', quarters: horizontal * gridUnit } : null;
  }
  if (horizontal) {
    return { kind: 'move', quarters: horizontal * (shift ? nudgeQuarters(gridUnit) : gridUnit) };
  }
  return {
    kind: 'pitch',
    midicents: vertical * (shift ? OCTAVE_MIDICENTS : PITCH_STEP_MIDICENTS),
  };
}

/**
 * Moves the selected notes in time by `quarters`: all by the same amount, so a group keeps its
 * shape, held at the clip's start (the whole group stops when its earliest note reaches 0).
 */
export function moveNotesInTime(
  packet: DataPacket,
  ids: readonly string[],
  quarters: number
): DataPacket {
  return moveNotes(packet, ids, { start: quarters, pitchMidicents: 0 });
}

/**
 * Moves the selected notes by `midicents` of pitch. A group never moves partially: when any note
 * would leave the keyboard (0 to 12700), nothing moves.
 */
export function moveNotesInPitch(
  packet: DataPacket,
  ids: readonly string[],
  midicents: number
): DataPacket {
  const chosen = new Set(ids);
  const moving = packet.items.filter(
    (item): item is NoteItem => isNoteItem(item) && chosen.has(item.id)
  );
  const fits = moving.every((item) =>
    item.value.pitches.every(
      (pitch) => pitch + midicents >= 0 && pitch + midicents <= MAX_MIDICENTS
    )
  );
  return moving.length && fits
    ? moveNotes(packet, ids, { start: 0, pitchMidicents: midicents })
    : packet;
}

/**
 * Lengthens (`quarters` > 0) or shortens (`quarters` < 0) each selected note by that much, each held
 * on its own: a shortened note never goes below `unit` (one grid division), and a note already at or
 * below `unit` is left as it is. (The group is not refused as a whole: the other notes still change.)
 */
export function resizeNotesByGrid(
  packet: DataPacket,
  ids: readonly string[],
  quarters: number,
  unit: number
): DataPacket {
  if (!Number.isFinite(quarters) || quarters === 0) {
    return packet;
  }
  const floor = Math.max(unit, MIN_NOTE_QUARTERS);
  let next = packet;
  for (const id of ids) {
    const item = next.items.find((entry) => entry.id === id);
    if (!item || !isNoteItem(item)) {
      continue;
    }
    const current = rationalToNumber(item.value.duration.quarterNotes);
    if (quarters < 0 && current <= floor + 1e-9) {
      continue;
    }
    const delta = quarters < 0 ? Math.max(quarters, floor - current) : quarters;
    next = resizeNotes(next, [id], delta);
  }
  return next;
}

/** The id of a note's roll position: its highest pitch (a chord event sorts by its top note). */
function topPitch(item: NoteItem): number {
  return Math.max(...item.value.pitches);
}

/**
 * The notes in navigation order: onset ascending, then pitch from HIGH to LOW (a chord event by its
 * top pitch), then packet order.
 */
export function navigationOrder(packet: DataPacket): string[] {
  return packet.items
    .filter(isNoteItem)
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        rationalToNumber(a.item.value.onset.quarterNotes) -
          rationalToNumber(b.item.value.onset.quarterNotes) ||
        topPitch(b.item) - topPitch(a.item) ||
        a.index - b.index
    )
    .map((entry) => entry.item.id);
}

/**
 * The note Alt+Right (`direction` 1) or Alt+Left (-1) selects, or null when the clip has no notes.
 * Several notes selected: the first (Right) or last (Left) of them in navigation order, alone. One
 * note: the next or previous in order, staying where it is at the end. Nothing selected: the first
 * or last note of the clip.
 */
export function navigateSelection(
  packet: DataPacket,
  selectedIds: readonly string[],
  direction: 1 | -1
): string | null {
  const order = navigationOrder(packet);
  if (order.length === 0) {
    return null;
  }
  const selected = order.filter((id) => selectedIds.includes(id));
  if (selected.length === 0) {
    return direction === 1 ? order[0] : order[order.length - 1];
  }
  if (selected.length > 1) {
    return direction === 1 ? selected[0] : selected[selected.length - 1];
  }
  const at = order.indexOf(selected[0]) + direction;
  return order[Math.min(Math.max(at, 0), order.length - 1)];
}
