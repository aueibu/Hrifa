/**
 * The send mode (M8d, H-10): which pitches a chord sends to a composite. `field` = As in field (the chord as the field gives it:
 * its nearest field notes), `exact` = the chord's own true ratios placed on the same root. It follows the shelf's
 * "As in field | Exact" switch (`state.shelf.sketch.exact`), and the `-` popup can flip it for one send. A positional chord is
 * fixed (always its field notes) and an item without an exact form (a note, a subset, a selection) has no second mode: the mode
 * does not apply to either. Pure: no React, no storage. The popup preview and the send both call `sendPitches`, so what the
 * preview ring shows is what is added.
 */
import {
  fmtRatio,
  previewAdd,
  type AddPreview,
  type MergeItem,
  type MergeOptions,
  type Note,
} from '../../../lib/harmonic-field';
import type { Sketch } from './chordShelf';
import type { SendItem } from './sendStore';

export type SendMode = 'field' | 'exact';

/** The mode the shelf's switch is on now. */
export const sendModeOf = (sketch: Pick<Sketch, 'exact'>): SendMode =>
  sketch.exact ? 'exact' : 'field';

/** The other mode. */
export const otherSendMode = (m: SendMode): SendMode => (m === 'exact' ? 'field' : 'exact');

type Modal = Pick<SendItem, 'pitches' | 'exact' | 'fixed' | 'fixedReason'>;

/** Why the mode does not apply to the item (the popup shows it beside the disabled slider), or null when it does. */
export function sendModeReason(item: Modal): string | null {
  if (item.fixed) {
    return item.fixedReason ?? 'A positional chord is fixed: it always sends its field notes.';
  }
  if (!item.exact?.length) {
    return 'This item has no separate exact ratios: it always sends its own notes.';
  }
  return null;
}

/** The mode that really applies to the item: its own when the mode applies, else `field`. */
export const effectiveSendMode = (item: Modal, mode: SendMode): SendMode =>
  sendModeReason(item) === null ? mode : 'field';

/** The pitches sent for `item` in `mode`: the exact ones in Exact when the item has them, else the item's own pitches. */
export function sendPitches(item: Modal, mode: SendMode): Note[] {
  const src = effectiveSendMode(item, mode) === 'exact' ? (item.exact as Note[]) : item.pitches;
  return src.map((p) => ({ m: p.m ? { ...p.m } : null, c: p.c }));
}

/** The `-` popup's preview of one composite for the pitches `item` sends in `mode` (same pitches as `sendPitches`). */
export function previewSend(
  items: readonly MergeItem[],
  item: Modal,
  mode: SendMode,
  fallbackRep: Note,
  opts: MergeOptions = {}
): AddPreview {
  return previewAdd(items, { pitches: sendPitches(item, mode) }, fallbackRep, opts);
}

/** A note's monzo as text: its non-zero prime powers ("2^-2 3 7" = 21/4), "1" for the unison. */
export function monzoText(n: Note): string | null {
  if (!n.m) {
    return null;
  }
  const parts = Object.keys(n.m)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((p) => n.m?.[String(p)])
    .map((p) => {
      const e = n.m?.[String(p)] ?? 0;
      return e === 1 ? `${p}` : `${p}^${e}`;
    });
  return parts.length ? parts.join(' ') : '1';
}

/** One line of the popup's stats panel: the pitch in cents, and its ratio and monzo when it has them and exact asks for them. */
export interface PitchRow {
  cents: string;
  ratio: string | null;
  monzo: string | null;
}

export const pitchRows = (pitches: readonly Note[], exact: boolean): PitchRow[] =>
  pitches.map((p) => ({
    cents: `${p.c.toFixed(1)} c`,
    ratio: exact && p.m ? fmtRatio(p) : null,
    monzo: exact ? monzoText(p) : null,
  }));
