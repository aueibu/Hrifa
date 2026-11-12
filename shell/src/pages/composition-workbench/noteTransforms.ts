import { MIN_NOTE_QUARTERS } from '../../components/PianoRoll';
import type {
  ClipAction,
  ClipActionContext,
  ClipActionParams,
  ClipActionResult,
} from './clipActions';
import { hasClipProperties, readClipProperties } from './clipProperties';
import type { DataPacket } from './model';
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  rationalFromNumber,
  rationalToNumber,
  subtractRational,
  type MusicalDuration,
  type Rational,
} from './musicalTime';
import {
  copyNotes,
  isNoteItem,
  itemsSpan,
  noteLabel,
  timeMoveResult,
  type NoteItem,
} from './noteClipEdits';

/**
 * The note-clip transforms (K5b-2a), each a pure function of the packet and the editor's selection.
 * Every one is also a registry action (`noteClipActions`), so the inspector buttons and a later
 * right-click menu call the same code.
 *
 * Target set: the selected notes; with nothing selected, every note; with a time selection, the
 * notes that overlap the span with positive length (a note that only touches an edge is not a
 * target). A note partly inside a time selection is a whole target: no transform cuts notes
 * (duplicate is the one exception, it copies only the part inside, like a time-selection copy).
 * "The span" is the selection's range, or with nothing selected the clip from 0 to the clip's length
 * (reverse grows it to the furthest note end when notes run past it; rotate keeps the clip length
 * so repeated presses wrap in the same span).
 *
 * Refusals return `{ ok: false, error }` and change nothing. A transform that would change nothing
 * returns the same packet.
 */

export const MIN_SCALE_FACTOR = 1 / 32768;
export const MAX_SCALE_FACTOR = 32768;
/** The keyboard's range in midicents (the editor's own). */
const MIN_MIDICENTS = 0;
const MAX_MIDICENTS = 12700;
/** What the grid means when it is on Auto: a sixteenth note. */
export const AUTO_GRID_QUARTERS = 0.25;

type Selection = ClipActionContext['selection'];

const refuse = (error: string): ClipActionResult => ({ ok: false, error });
const done = (packet: DataPacket): ClipActionResult => ({ ok: true, packet });

interface Targets {
  /** Target notes, in packet order. */
  items: NoteItem[];
  /** The selection's span, or null when nothing is selected. */
  span: { from: Rational; to: Rational } | null;
  /** Whether a selection (rather than the whole clip) was targeted. */
  scoped: boolean;
}

const quarters = (value: MusicalDuration) => value.quarterNotes;
const endOf = (item: NoteItem) =>
  addRational(item.value.onset.quarterNotes, item.value.duration.quarterNotes);

function targetsOf(packet: DataPacket, selection: Selection): Targets | string {
  const notes = packet.items.filter(isNoteItem);
  if (selection.kind === 'time' && selection.range) {
    const from = rationalFromNumber(selection.range.start);
    const to = rationalFromNumber(selection.range.end);
    const items = notes.filter(
      (item) =>
        compareRational(endOf(item), from) > 0 &&
        compareRational(item.value.onset.quarterNotes, to) < 0
    );
    return items.length
      ? { items, span: { from, to }, scoped: true }
      : 'There are no notes in the selected time.';
  }
  if (selection.ids.length > 0) {
    const chosen = new Set(selection.ids);
    const items = notes.filter((item) => chosen.has(item.id));
    if (!items.length) {
      return 'The selected notes are not in the clip any more.';
    }
    const range = selection.range ?? itemsSpan(packet, selection.ids);
    return {
      items,
      span: range
        ? { from: rationalFromNumber(range.start), to: rationalFromNumber(range.end) }
        : null,
      scoped: true,
    };
  }
  return notes.length
    ? { items: notes, span: null, scoped: false }
    : 'The clip has no notes to change.';
}

/**
 * The span a positional transform works in: the selection's, or the clip (0 to its length). With
 * `coverContent` (reverse) a clip span grows to the furthest note end when notes run past the
 * length; rotate keeps the span at the clip length so it is the same on every press.
 */
function workingSpan(
  packet: DataPacket,
  targets: Targets,
  coverContent = true
): { from: Rational; to: Rational } {
  if (targets.span) {
    return targets.span;
  }
  const length = readClipProperties(packet).length;
  if (!coverContent) {
    return { from: rational(0), to: length };
  }
  const furthest = packet.items
    .filter(isNoteItem)
    .reduce(
      (end, item) => (compareRational(endOf(item), end) > 0 ? endOf(item) : end),
      rational(0)
    );
  return { from: rational(0), to: compareRational(furthest, length) > 0 ? furthest : length };
}

function sameValue(a: NoteItem, b: NoteItem): boolean {
  return (
    compareRational(a.value.onset.quarterNotes, b.value.onset.quarterNotes) === 0 &&
    compareRational(a.value.duration.quarterNotes, b.value.duration.quarterNotes) === 0 &&
    compareRational(a.value.interOnset.quarterNotes, b.value.interOnset.quarterNotes) === 0 &&
    a.value.velocity === b.value.velocity &&
    a.value.pitches.length === b.value.pitches.length &&
    a.value.pitches.every((pitch, index) => pitch === b.value.pitches[index])
  );
}

/** The packet with these items replaced by id; the same packet when no value actually changed. */
function replaced(packet: DataPacket, next: Map<string, NoteItem>): DataPacket {
  let changed = false;
  const items = packet.items.map((item) => {
    const replacement = next.get(item.id);
    if (!replacement || !isNoteItem(item) || sameValue(item, replacement)) {
      return item;
    }
    changed = true;
    return replacement;
  });
  return changed ? { ...packet, items } : packet;
}

function withValue(item: NoteItem, change: Partial<NoteItem['value']>): NoteItem {
  const value = { ...item.value, ...change };
  return { ...item, value, label: noteLabel(value.pitches, value.onset) };
}

function isSlotMatched(item: NoteItem) {
  return compareRational(quarters(item.value.interOnset), quarters(item.value.duration)) === 0;
}

/** Wraps a transform so an arithmetic overflow becomes a refusal instead of an exception. */
function guarded(run: () => ClipActionResult): ClipActionResult {
  try {
    return run();
  } catch {
    return refuse('The times are too fine to calculate exactly, so nothing was changed.');
  }
}

function noteName(item: NoteItem) {
  return `"${item.label || item.id}"`;
}

// --- Scale -----------------------------------------------------------------------------------

export type ScaleMode = 'whole' | 'individual';

/** Parses a typed factor: `2`, `0.5`, `x3`, `3/2`. Returns the factor or the problem. */
export function parseScaleFactor(
  input: string | number | undefined
): { ok: true; value: Rational } | { ok: false; error: string } {
  const bounds = `The factor must be between 1/${MAX_SCALE_FACTOR} and ${MAX_SCALE_FACTOR}.`;
  const text = String(input ?? '')
    .trim()
    .replace(/^[x×*]\s*/i, '');
  if (!text) {
    return { ok: false, error: 'Enter a scale factor such as 2, 0.5 or 3/2.' };
  }
  let value: Rational;
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (fraction) {
    const [numerator, denominator] = [Number(fraction[1]), Number(fraction[2])];
    if (
      !Number.isSafeInteger(numerator) ||
      !Number.isSafeInteger(denominator) ||
      denominator === 0 ||
      numerator === 0 ||
      numerator / denominator < MIN_SCALE_FACTOR ||
      numerator / denominator > MAX_SCALE_FACTOR
    ) {
      return { ok: false, error: bounds };
    }
    value = rational(numerator, denominator);
  } else {
    if (!/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) {
      return { ok: false, error: 'Enter a scale factor such as 2, 0.5 or 3/2.' };
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < MIN_SCALE_FACTOR || parsed > MAX_SCALE_FACTOR) {
      return { ok: false, error: bounds };
    }
    try {
      value = rationalFromNumber(parsed);
    } catch {
      return { ok: false, error: bounds };
    }
  }
  return { ok: true, value };
}

/**
 * Scales the target notes' times by `factor`. WHOLE: onsets and durations scale about the span's
 * start (the selection's start, or the clip start with no selection), so the pattern stretches
 * and the gaps with it. INDIVIDUAL: each duration scales about the note's own onset; onsets stay.
 * The clip's length never changes (notes pushed past the end are kept). Refuses when any duration
 * would fall under the minimum note length, or any onset before the clip start (a note that starts
 * before a time selection's start can).
 */
export function scaleNotes(
  packet: DataPacket,
  selection: Selection,
  factor: Rational,
  mode: ScaleMode
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  return guarded(() => {
    if (compareRational(factor, rational(1)) === 0) {
      return done(packet);
    }
    const origin = targets.span?.from ?? rational(0);
    const next = new Map<string, NoteItem>();
    for (const item of targets.items) {
      const duration = multiplyRational(quarters(item.value.duration), factor);
      if (rationalToNumber(duration) < MIN_NOTE_QUARTERS - 1e-9) {
        return refuse(
          `Scaling by ${rationalToNumber(factor)} would make ${noteName(item)} shorter than the minimum note length (1/32 of a quarter note). Nothing was changed.`
        );
      }
      if (mode === 'whole') {
        const onset = addRational(
          origin,
          multiplyRational(subtractRational(item.value.onset.quarterNotes, origin), factor)
        );
        if (compareRational(onset, rational(0)) < 0) {
          return refuse(
            `Scaling by ${rationalToNumber(factor)} would move ${noteName(item)} before the start of the clip. Nothing was changed.`
          );
        }
        next.set(
          item.id,
          withValue(item, {
            onset: { quarterNotes: onset },
            duration: { quarterNotes: duration },
            interOnset: { quarterNotes: multiplyRational(quarters(item.value.interOnset), factor) },
          })
        );
      } else {
        next.set(
          item.id,
          withValue(item, {
            duration: { quarterNotes: duration },
            interOnset: isSlotMatched(item) ? { quarterNotes: duration } : item.value.interOnset,
          })
        );
      }
    }
    return done(replaced(packet, next));
  });
}

// --- Reverse ---------------------------------------------------------------------------------

/**
 * Reverse in time: mirrors positions inside the span (a note over [s, e] moves to [S + E - e, S + E - s],
 * lengths kept). With nothing selected the span is the clip. Notes are mirrored whole, so a note
 * partly outside a time selection ends up partly outside its other side. Refuses when a note would
 * start before the clip start.
 */
export function reverseInTime(packet: DataPacket, selection: Selection): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  return guarded(() => {
    const { from, to } = workingSpan(packet, targets);
    const sum = addRational(from, to);
    const next = new Map<string, NoteItem>();
    for (const item of targets.items) {
      const onset = subtractRational(sum, endOf(item));
      if (compareRational(onset, rational(0)) < 0) {
        return refuse(
          `Reversing would move ${noteName(item)} before the start of the clip. Nothing was changed.`
        );
      }
      next.set(item.id, withValue(item, { onset: { quarterNotes: onset } }));
    }
    return done(replaced(packet, next));
  });
}

/** The target notes ordered into their slots: by onset, notes sharing an onset in packet order. */
function slotsOf(items: NoteItem[]): NoteItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        compareRational(a.item.value.onset.quarterNotes, b.item.value.onset.quarterNotes) ||
        a.index - b.index
    )
    .map((entry) => entry.item);
}

/** Moves the pitches and velocity (the payload) into slot `i` from slot `source(i)`; rhythm stays. */
function permutePayload(
  packet: DataPacket,
  slots: NoteItem[],
  source: (index: number) => number
): ClipActionResult {
  const next = new Map<string, NoteItem>();
  slots.forEach((slot, index) => {
    const from = slots[source(index)];
    next.set(
      slot.id,
      withValue(slot, { pitches: [...from.value.pitches], velocity: from.value.velocity })
    );
  });
  return done(replaced(packet, next));
}

/**
 * Reverse order: the rhythm (onsets and durations) stays and the sequence of pitches and
 * velocities reverses across the slots. A chord (one event with several pitches) moves as a unit;
 * separate events that share an onset are separate slots, ordered as they are in the packet.
 */
export function reverseOrder(packet: DataPacket, selection: Selection): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  const slots = slotsOf(targets.items);
  return permutePayload(packet, slots, (index) => slots.length - 1 - index);
}

// --- Rotate ----------------------------------------------------------------------------------

function parseInteger(input: string | number | undefined, what: string): number | string {
  const text = String(input ?? '').trim();
  if (!/^[+-]?\d+$/.test(text)) {
    return `Enter a whole number for ${what} (negative is allowed).`;
  }
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : `The ${what} is too large.`;
}

/**
 * Rotate values: the pitches and velocities rotate `amount` slots through the existing onsets and
 * durations (rhythm fixed). Positive moves each value to a later slot, the last wrapping to the
 * first; negative the other way.
 */
export function rotateValues(
  packet: DataPacket,
  selection: Selection,
  amount: number
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  const slots = slotsOf(targets.items);
  const n = slots.length;
  return permutePayload(packet, slots, (index) => (((index - amount) % n) + n) % n);
}

/**
 * Rotate in time: the pattern shifts `amount` grid steps (negative allowed) and wraps around the
 * span (the selection's range, or the clip's length with nothing selected); lengths are kept, so a
 * note that wraps near the end may run past the span's end. A note that starts before a time
 * selection's start wraps by its position relative to the span (modulo), so it lands near the end.
 */
export function rotateInTime(
  packet: DataPacket,
  selection: Selection,
  amount: number,
  gridQuarters: number | undefined
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  return guarded(() => {
    const { from, to } = workingSpan(packet, targets, false);
    const length = subtractRational(to, from);
    if (compareRational(length, rational(0)) <= 0) {
      return refuse('The span has no length to rotate in. Nothing was changed.');
    }
    const step = rationalFromNumber(
      gridQuarters && gridQuarters > 0 ? gridQuarters : AUTO_GRID_QUARTERS
    );
    const shift = multiplyRational(step, amount);
    const next = new Map<string, NoteItem>();
    for (const item of targets.items) {
      const moved = addRational(subtractRational(item.value.onset.quarterNotes, from), shift);
      const wraps = Math.floor(
        (moved.numerator * length.denominator) / (moved.denominator * length.numerator)
      );
      const relative = subtractRational(moved, multiplyRational(length, wraps));
      next.set(item.id, withValue(item, { onset: { quarterNotes: addRational(from, relative) } }));
    }
    const changed = replaced(packet, next);
    // A note selection keeps the span it started with, so the next press wraps in the same span
    // (the editor would otherwise rebuild the range from the moved notes).
    if (targets.scoped && selection.kind !== 'time' && changed !== packet) {
      return {
        ok: true,
        packet: changed,
        selection: {
          ids: [...selection.ids],
          range: { start: rationalToNumber(from), end: rationalToNumber(to) },
        },
      };
    }
    return done(changed);
  });
}

// --- Legato, transpose, quantize --------------------------------------------------------------

/**
 * Legato: each target note extends (or shortens) to the next later onset among the targets; the
 * notes at the last onset are unchanged. Refuses when the next onset is closer than the minimum
 * note length.
 */
export function legato(packet: DataPacket, selection: Selection): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  return guarded(() => {
    const onsets = targets.items
      .map((item) => item.value.onset.quarterNotes)
      .sort(compareRational)
      .filter((onset, index, all) => index === 0 || compareRational(onset, all[index - 1]) !== 0);
    const next = new Map<string, NoteItem>();
    for (const item of targets.items) {
      const onset = item.value.onset.quarterNotes;
      const following = onsets.find((candidate) => compareRational(candidate, onset) > 0);
      if (!following) {
        continue;
      }
      const duration = subtractRational(following, onset);
      if (rationalToNumber(duration) < MIN_NOTE_QUARTERS - 1e-9) {
        return refuse(
          `The next note starts less than the minimum note length after ${noteName(item)}. Nothing was changed.`
        );
      }
      next.set(
        item.id,
        withValue(item, {
          duration: { quarterNotes: duration },
          interOnset: isSlotMatched(item) ? { quarterNotes: duration } : item.value.interOnset,
        })
      );
    }
    return done(replaced(packet, next));
  });
}

/**
 * Transpose by `semitones` (decimals allowed: the shift is rounded to a whole midicent). Every
 * pitch of every target moves by the same amount, so microtonal offsets and chord shapes are kept.
 * Refuses, changing nothing, if any pitch would leave the keyboard (0 to 12700 midicents).
 */
export function transposeNotes(
  packet: DataPacket,
  selection: Selection,
  semitones: number
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  const shift = Math.round(semitones * 100);
  const next = new Map<string, NoteItem>();
  for (const item of targets.items) {
    const pitches = item.value.pitches.map((pitch) => pitch + shift);
    if (pitches.some((pitch) => pitch < MIN_MIDICENTS || pitch > MAX_MIDICENTS)) {
      return refuse(
        `Transposing by ${semitones} semitones would move ${noteName(item)} off the keyboard. Nothing was changed.`
      );
    }
    next.set(item.id, withValue(item, { pitches }));
  }
  return done(replaced(packet, next));
}

/**
 * Quantize: every target onset snaps to the nearest grid line (halves round up) at 100% strength.
 * Durations are left as they are (a note keeps its length, so its end moves with its start).
 * `gridQuarters` is the grid unit in quarter notes (the editor's effective snap unit, so Auto follows
 * the zoom); a sixteenth only when the caller has none.
 */
export function quantizeNotes(
  packet: DataPacket,
  selection: Selection,
  gridQuarters: number | undefined
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  return guarded(() => {
    const step = rationalFromNumber(
      gridQuarters && gridQuarters > 0 ? gridQuarters : AUTO_GRID_QUARTERS
    );
    const next = new Map<string, NoteItem>();
    for (const item of targets.items) {
      const onset = item.value.onset.quarterNotes;
      const lines = Math.floor(rationalToNumber(onset) / rationalToNumber(step) + 0.5 + 1e-9);
      next.set(
        item.id,
        withValue(item, { onset: { quarterNotes: multiplyRational(step, lines) } })
      );
    }
    return done(replaced(packet, next));
  });
}

// --- Duplicate -------------------------------------------------------------------------------

/**
 * Duplicate: a copy lands directly after the span (its start at the span's end, so it is shifted by
 * the span's length): the selection's range, or with nothing selected 0 to the content's end. Copies
 * are new items (fresh ids, same pitches, velocity and inherited provenance). A note selection
 * copies the selected notes whole; a time selection copies only the part of each note inside the
 * span (cut at its edges, like a time-selection copy). The result selects the copies; the clip's
 * length does not change.
 */
export function duplicateNotes(
  packet: DataPacket,
  selection: Selection,
  newId: () => string
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  return guarded(() => {
    if (selection.kind === 'time' && selection.range) {
      const { start, end } = selection.range;
      const length = end - start;
      const result = timeMoveResult(packet, selection.range, length, newId, undefined, {
        copy: true,
        merge: true,
      });
      if (result.packet === packet) {
        return done(packet);
      }
      return {
        ok: true,
        packet: result.packet,
        selection: {
          ids: result.movedIds,
          range: { start: start + length, end: end + length },
          kind: 'time',
        },
      };
    }
    const contentEnd = targets.items.reduce(
      (end, item) => Math.max(end, rationalToNumber(endOf(item))),
      0
    );
    const span = targets.span
      ? { start: rationalToNumber(targets.span.from), end: rationalToNumber(targets.span.to) }
      : { start: 0, end: contentEnd };
    const length = span.end - span.start;
    const copied = copyNotes(
      packet,
      targets.items.map((item) => item.id),
      { start: length, pitchMidicents: 0 },
      newId
    );
    if (copied.packet === packet) {
      return done(packet);
    }
    const copySpan = targets.scoped
      ? { start: span.start + length, end: span.end + length }
      : itemsSpan(copied.packet, copied.copyIds);
    return {
      ok: true,
      packet: copied.packet,
      selection: { ids: copied.copyIds, range: copySpan },
    };
  });
}

// --- Registry --------------------------------------------------------------------------------

const GROUP = 'Transform';

function typedNumber(params: ClipActionParams, key: string, label: string): number | string {
  const text = String(params[key] ?? '').trim();
  const value = Number(text);
  return text !== '' && Number.isFinite(value) ? value : `Enter a number for ${label}.`;
}

/** The note clip's actions, registered on the `notes` clip type (clipTypes.ts). */
export const noteClipActions: readonly ClipAction[] = [
  {
    id: 'scale',
    label: 'Scale',
    group: GROUP,
    params: [
      { id: 'factor', label: 'Factor', type: 'number', default: 2 },
      {
        id: 'mode',
        label: 'Mode',
        type: 'choice',
        default: 'whole',
        options: [
          { value: 'whole', label: 'Whole' },
          { value: 'individual', label: 'Individually' },
        ],
      },
    ],
    applies: hasClipProperties,
    run: (packet, context, params) => {
      const factor = parseScaleFactor(params.factor);
      if (!factor.ok) {
        return refuse(factor.error);
      }
      return scaleNotes(
        packet,
        context.selection,
        factor.value,
        params.mode === 'individual' ? 'individual' : 'whole'
      );
    },
  },
  {
    id: 'reverse-time',
    label: 'Reverse in time',
    group: GROUP,
    params: [],
    applies: hasClipProperties,
    run: (packet, context) => reverseInTime(packet, context.selection),
  },
  {
    id: 'reverse-order',
    label: 'Reverse order',
    group: GROUP,
    params: [],
    applies: hasClipProperties,
    run: (packet, context) => reverseOrder(packet, context.selection),
  },
  {
    id: 'rotate-values',
    label: 'Rotate values',
    group: GROUP,
    params: [{ id: 'amount', label: 'Slots', type: 'integer', default: 1 }],
    applies: hasClipProperties,
    run: (packet, context, params) => {
      const amount = parseInteger(params.amount, 'the rotation');
      return typeof amount === 'string'
        ? refuse(amount)
        : rotateValues(packet, context.selection, amount);
    },
  },
  {
    id: 'rotate-time',
    label: 'Rotate in time',
    group: GROUP,
    params: [{ id: 'amount', label: 'Grid steps', type: 'integer', default: 1 }],
    applies: hasClipProperties,
    run: (packet, context, params) => {
      const amount = parseInteger(params.amount, 'the rotation');
      return typeof amount === 'string'
        ? refuse(amount)
        : rotateInTime(packet, context.selection, amount, context.gridUnit);
    },
  },
  {
    id: 'legato',
    label: 'Legato',
    group: GROUP,
    params: [],
    applies: hasClipProperties,
    run: (packet, context) => legato(packet, context.selection),
  },
  {
    id: 'transpose',
    label: 'Transpose',
    group: GROUP,
    params: [{ id: 'semitones', label: 'Semitones', type: 'number', default: 0 }],
    applies: hasClipProperties,
    run: (packet, context, params) => {
      const semitones = typedNumber(params, 'semitones', 'the semitones');
      return typeof semitones === 'string'
        ? refuse(semitones)
        : transposeNotes(packet, context.selection, semitones);
    },
  },
  {
    id: 'quantize',
    label: 'Quantize',
    group: GROUP,
    params: [],
    applies: hasClipProperties,
    run: (packet, context) => quantizeNotes(packet, context.selection, context.gridUnit),
  },
  {
    id: 'duplicate',
    label: 'Duplicate',
    group: GROUP,
    params: [],
    applies: hasClipProperties,
    run: (packet, context) => duplicateNotes(packet, context.selection, context.newId),
  },
];
