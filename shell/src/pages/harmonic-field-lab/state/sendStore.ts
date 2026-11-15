/**
 * The send-to-composite registry (M8c step 2): what the pointer is on right now (a chord chip, shelf slot, saved subset, key
 * ring, composite item), the open `-` popup and the open right-click menu. A tiny module-level store (like the Developer
 * options): the key handlers in `useLabAudio.ts` and the components read it without any prop plumbing. Runtime only, never stored.
 *
 * A hover source registers a GETTER, so the item (its pitches) is built when it is needed, from the then-current state. The
 * popup captures the item at open: the pointer may move on while it is open.
 */
import { useSyncExternalStore } from 'react';
import type { Note } from '../../../lib/harmonic-field';
import { isTyping } from '../audio/keymap';
import type { ItemDetail, ItemKind, ItemSource } from './composites';
import type { StashRequest } from './labState';
import type { SendMode } from './sendMode';

/** What is sent: kind, a label that names it, its exact pitches (field-absolute) and the repeat of the field it came from. */
export interface SendItem {
  kind: ItemKind;
  label: string;
  pitches: Note[];
  rep: Note | null;
  /**
   * Where the item came from: generator inputs, tab name, date. `undefined` = the active tab (chips, key rings, notes);
   * `null` = unknown (kept unknown, never the active tab's).
   */
  source?: ItemSource | null;
  /**
   * M8d: the chord's own (true ratio) pitches placed on the same root, for the "Exact" send mode (`sendMode.ts`). Absent or
   * empty = the item has no separate exact form (notes, subsets, selections, a free chord): the mode does not apply.
   */
  exact?: Note[] | null;
  /** M8d: a positional chord: always its field notes, the send mode does not apply. */
  fixed?: boolean;
  /** M8d: why it is fixed, when not because it is positional (a stashed shelf chord sends exactly what it stored). */
  fixedReason?: string;
  /** M8d: extra detail the composite item keeps (template, root, positional pattern and tail). */
  detail?: Partial<ItemDetail> | null;
  /** M8d: what Stash on shelf in the right-click menu stashes (chord chips and positional rows); absent = no such menu entry. */
  stash?: Omit<StashRequest, 'date'>;
}

export type SendGetter = () => SendItem | null;

export interface SendView {
  popup: SendItem | null;
  /** M8d: the popup's own As in field | Exact choice (starts on the shelf's; E and the slider change it). */
  popupMode: SendMode;
  /** Where the popup opened (fixed for as long as it is open). */
  popupAt: { x: number; y: number };
  /** A message for the confirmation line (set by multi-item sends). */
  note: { text: string; alert: boolean; n: number } | null;
  menu: { item: SendItem; x: number; y: number } | null;
}

let hover: { id: string; get: SendGetter; el?: Element } | null = null;
let view: SendView = {
  popup: null,
  popupMode: 'field',
  popupAt: { x: 0, y: 0 },
  note: null,
  menu: null,
};
let pendingNote: string | null = null;
const listeners = new Set<() => void>();
const consumed = new WeakSet<Event>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/**
 * The pointer is on a source (`id` is unique per source). `el` (optional) is the source's element: when it has left the page
 * (a row deleted under the pointer, which never fires mouseleave) the source no longer counts as hovered.
 */
export function enterSend(id: string, get: SendGetter, el?: Element) {
  hover = { id, get, el };
}

/** The pointer left a source: forgotten only when it is still the current one. */
export function leaveSend(id: string) {
  if (hover && hover.id === id) {
    hover = null;
  }
}

/**
 * The hovered source's item when the pointer (`target`) is inside the source's element, else null: used by the right-click
 * menu so a merely focused source never takes over the browser's menu.
 */
export const hoveredSendAt = (target: EventTarget | null): SendItem | null =>
  hover && hover.el && target instanceof Node && hover.el.contains(target) && hover.el.isConnected
    ? hover.get()
    : null;

/** The hovered source's item now, or null. */
export const hoveredSend = (): SendItem | null =>
  hover && !(hover.el && !hover.el.isConnected) ? hover.get() : null;

export const isSendOpen = () => view.popup !== null;

/** The current popup / menu state (for the key handler, which must not wait for a render). */
export const sendView = (): SendView => view;

export function openSendPopup(
  item: SendItem,
  at: { x: number; y: number },
  mode: SendMode = 'field'
) {
  view = { ...view, popup: item, popupAt: at, popupMode: mode };
  emit();
}

/** The popup's own mode (the slider, the E key). */
export function setPopupMode(mode: SendMode) {
  if (view.popup && view.popupMode !== mode) {
    view = { ...view, popupMode: mode };
    emit();
  }
}

export function closeSendPopup() {
  if (view.popup) {
    view = { ...view, popup: null };
    emit();
  }
}

export function openSendMenu(item: SendItem, x: number, y: number) {
  view = { ...view, menu: { item, x, y } };
  emit();
}

export function closeSendMenu() {
  if (view.menu) {
    view = { ...view, menu: null };
    emit();
  }
}

/** Show a message on the confirmation line now. */
export function showSendNote(text: string, alert = false) {
  view = { ...view, note: { text, alert, n: (view.note?.n ?? 0) + 1 } };
  emit();
}

/** A message for the NEXT successful add to show instead of "Added X" (a multi-item send's summary). */
export function setPendingSendNote(text: string | null) {
  pendingNote = text;
}
export function takePendingSendNote(): string | null {
  const t = pendingNote;
  pendingNote = null;
  return t;
}

/**
 * What last moved the pointer: the mouse or keyboard focus. `noteHovered()` (called by every setHover of a note) remembers which
 * one put the current note under the pointer, so the right-click menu can tell a hovered note from a merely focused one.
 */
let lastInput: 'mouse' | 'focus' = 'mouse';
let noteBy: 'mouse' | 'focus' = 'mouse';
export const setSendInput = (k: 'mouse' | 'focus') => {
  lastInput = k;
};
export const noteHovered = () => {
  noteBy = lastInput;
};
export const noteIsMouse = () => noteBy === 'mouse';

/** Forget everything (unmount, tests). */
export function resetSend() {
  hover = null;
  view = { popup: null, popupMode: 'field', popupAt: { x: 0, y: 0 }, note: null, menu: null };
  pendingNote = null;
  emit();
}

/** A key event the popup took (so the melody and hold handlers, which may run after it, must ignore it). */
export function markSendKey(e: Event) {
  consumed.add(e);
}

/**
 * True when the popup took this key event, or is open and the key is a digit (plain or with Alt) or a plain E (flips the mode): the other key handlers
 * (hold previews, Parallel | Relative on 0, Alt+digit tabs) return first. Other keys keep working while it is open.
 */
export const sendHasKey = (e: KeyboardEvent): boolean =>
  consumed.has(e) ||
  (view.popup !== null &&
    (/^[0-9]$/.test(e.key) ||
      (e.key.toLowerCase() === 'e' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        !isTyping(e.target))));

export const useSendView = (): SendView =>
  useSyncExternalStore(
    subscribe,
    () => view,
    () => view
  );
