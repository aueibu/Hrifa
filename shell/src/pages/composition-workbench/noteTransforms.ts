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
import type { ClipboardNote, NoteClipboard } from './noteClipboard';
import {
  collisionSafe,
  copyNotes,
  isNoteItem,
  itemsSpan,
  newNoteItemId,
  noteLabel,
  timeMoveResult,
  type NoteItem,
} from './noteClipEdits';
import type { RotationSessionCore } from './rotationSession';

/**
 * The note-clip transforms (K5b-2a), each a pure function of the packet and the editor's selection.
 * Every one is also a registry action (`noteClipActions`), so the inspector buttons and a later
 * right-click menu call the same code.
 *
 * Target set: the selected notes; with nothing selected, every note; with a time selection, the
 * notes that overlap the span with positive length (a note that only touches an edge is not a
 * target). A note partly inside a time selection is a whole target: no transform cuts notes, except
 * duplicate (it copies only the part inside, like a time-selection copy) and rotate in time (it cuts
 * at the span's edges and rotates only the inside parts).
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

/** Whether an exception is musical-time arithmetic running out of exact range (musicalTime.ts). */
function isMusicalTimeOverflow(error: unknown): boolean {
  return (
    error instanceof Error &&
    /^Musical time requires (safe integer rational components|a finite number)\./.test(
      error.message
    )
  );
}

/**
 * Wraps a transform so an arithmetic overflow becomes a refusal instead of an exception. Only the
 * musical-time overflow errors are taken for "too fine"; any other exception is a bug and is
 * rethrown for the caller to log and report as an internal error (never mislabelled as a refusal).
 */
function guarded(run: () => ClipActionResult): ClipActionResult {
  try {
    return run();
  } catch (error) {
    if (isMusicalTimeOverflow(error)) {
      return refuse('The times are too fine to calculate exactly, so nothing was changed.');
    }
    throw error;
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

/**
 * The target notes grouped into chord slots: items that share an onset (exactly) are ONE slot and
 * move together; slots are in time order, the items of a slot in packet order.
 */
function groupsOf(items: NoteItem[]): NoteItem[][] {
  const groups: NoteItem[][] = [];
  for (const item of slotsOf(items)) {
    const last = groups[groups.length - 1];
    if (
      last &&
      compareRational(last[0].value.onset.quarterNotes, item.value.onset.quarterNotes) === 0
    ) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}

/**
 * The packet with these items replaced by id, these removed and `added` appended; the same packet
 * if nothing changed.
 */
function replacedAndRemoved(
  packet: DataPacket,
  next: Map<string, NoteItem>,
  removed: ReadonlySet<string>,
  added: NoteItem[] = []
): DataPacket {
  if (removed.size === 0 && added.length === 0) {
    return replaced(packet, next);
  }
  const items = packet.items
    .filter((item) => !removed.has(item.id))
    .map((item) => {
      const replacement = next.get(item.id);
      return replacement && isNoteItem(item) && !sameValue(item, replacement) ? replacement : item;
    });
  return { ...packet, items: [...items, ...added] };
}

/**
 * Moves the pitches and velocities (the payload) of slot `source(i)` into slot `i`; rhythm stays.
 * Notes stay single-pitch items: nothing here ever merges notes into a multi-pitch item (an item that
 * already holds several pitches is moved as a unit, as is). A slot that receives the payload of a
 * slot with the SAME number of items is rebuilt note by note: its i-th item takes the i-th source
 * item's pitches and velocity and keeps its own onset and duration. With a DIFFERENT number of
 * items the slot becomes one single-pitch item per incoming pitch (repeats dropped), each with the
 * velocity of the source item it came from and all with the slot's LONGEST duration: the slot's
 * first item keeps its id (and the next ones theirs, in order), extra target items are removed and
 * missing ones are created with fresh collision-safe ids at the slot's onset. A rest (a slot whose
 * items carry no pitches at all) landing in a slot of another size leaves ONE empty-pitch item in
 * it (the first, extra items removed): the onset is never deleted.
 */
function permutePayload(
  packet: DataPacket,
  groups: NoteItem[][],
  source: (index: number) => number,
  newId: () => string,
  selection: Selection,
  scoped: boolean
): ClipActionResult {
  const next = new Map<string, NoteItem>();
  const removed = new Set<string>();
  const added: NoteItem[] = [];
  const makeId = collisionSafe(packet, newId);
  groups.forEach((target, index) => {
    const from = groups[source(index)];
    if (from === target) {
      return;
    }
    if (from.length === target.length) {
      target.forEach((item, position) =>
        next.set(
          item.id,
          withValue(item, {
            pitches: [...from[position].value.pitches],
            velocity: from[position].value.velocity,
          })
        )
      );
      return;
    }
    const longest = target.reduce(
      (best, item) =>
        compareRational(item.value.duration.quarterNotes, best) > 0
          ? item.value.duration.quarterNotes
          : best,
      target[0].value.duration.quarterNotes
    );
    const incoming = from
      .flatMap((item) =>
        item.value.pitches.map((pitch) => ({ pitch, velocity: item.value.velocity }))
      )
      .filter(
        (entry, position, all) => all.findIndex((other) => other.pitch === entry.pitch) === position
      );
    if (incoming.length === 0) {
      // A rest (no pitches) lands in a slot of another size: the slot keeps ONE empty-pitch item (the
      // first, with the rest's velocity and the slot's longest duration) so the onset is not deleted.
      const slotItem = target[0];
      next.set(
        slotItem.id,
        withValue(slotItem, {
          pitches: [],
          velocity: from[0].value.velocity,
          duration: { quarterNotes: longest },
          interOnset: isSlotMatched(slotItem)
            ? { quarterNotes: longest }
            : slotItem.value.interOnset,
        })
      );
      target.slice(1).forEach((item) => removed.add(item.id));
      return;
    }
    incoming.forEach((entry, position) => {
      const slotItem = target[position] ?? target[0];
      const change = {
        pitches: [entry.pitch],
        velocity: entry.velocity,
        duration: { quarterNotes: longest },
        interOnset: isSlotMatched(slotItem) ? { quarterNotes: longest } : slotItem.value.interOnset,
      };
      if (target[position]) {
        next.set(slotItem.id, withValue(slotItem, change));
      } else {
        added.push({
          ...withValue(slotItem, change),
          id: makeId(),
          provenance: [...slotItem.provenance],
        });
      }
    });
    target.slice(incoming.length).forEach((item) => removed.add(item.id));
  });
  const result = replacedAndRemoved(packet, next, removed, added);
  // A note selection must be exactly the notes that now make up the target: the kept ids, the ids a
  // rebuilt slot created, and not the ids it removed (the editor would otherwise keep only the
  // survivors of each slot).
  if (scoped && selection.kind !== 'time' && (removed.size > 0 || added.length > 0)) {
    const ids = [
      ...selection.ids.filter((id) => !removed.has(id)),
      ...added.map((entry) => entry.id),
    ];
    return { ok: true, packet: result, selection: { ids, range: itemsSpan(result, ids) } };
  }
  return done(result);
}

/**
 * Reverse order: the rhythm (onsets and durations) stays and the sequence of pitches and
 * velocities reverses across the slots. Items sharing an onset are ONE chord slot and move as a
 * group (see `permutePayload` for slots of different sizes).
 */
export function reverseOrder(
  packet: DataPacket,
  selection: Selection,
  newId: () => string = () => newNoteItemId('slot')
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  const groups = groupsOf(targets.items);
  return permutePayload(
    packet,
    groups,
    (index) => groups.length - 1 - index,
    newId,
    selection,
    targets.scoped
  );
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

/** The slot a rotation by `amount` takes slot `index`'s payload from: forward moves values later. */
const rotatedFrom = (index: number, amount: number, count: number) =>
  (((index - amount) % count) + count) % count;

/**
 * Rotate values: the pitches and velocities rotate `amount` slots through the existing onsets and
 * durations (rhythm fixed). Positive moves each value to a later slot, the last wrapping to the
 * first; negative the other way. Worked example: C quarter, D half, E eighth rotated +1 gives
 * E quarter, C half, D eighth. Items sharing an onset are one chord slot (see `permutePayload`).
 */
export function rotateValues(
  packet: DataPacket,
  selection: Selection,
  amount: number,
  newId: () => string = () => newNoteItemId('slot')
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  const groups = groupsOf(targets.items);
  return permutePayload(
    packet,
    groups,
    (index) => rotatedFrom(index, amount, groups.length),
    newId,
    selection,
    targets.scoped
  );
}

/**
 * Rotate durations: pitches and velocities stay where they are and the durations rotate `amount`
 * slots through the slots, in the same direction convention as rotate values (slot i takes the
 * duration of slot i - amount). Worked example: C quarter, D half, E eighth rotated +1 gives C
 * eighth, D quarter, E half. A slot of several items (a chord drawn as separate items) hands over
 * its durations in packet order, and the receiving slot's j-th item takes the source's
 * (j mod size)-th duration. An inter-onset that followed its note's length keeps following it.
 */
export function rotateDurations(
  packet: DataPacket,
  selection: Selection,
  amount: number
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  const groups = groupsOf(targets.items);
  const next = new Map<string, NoteItem>();
  groups.forEach((target, index) => {
    const from = groups[rotatedFrom(index, amount, groups.length)];
    if (from === target) {
      return;
    }
    target.forEach((item, position) => {
      const duration = from[position % from.length].value.duration;
      next.set(
        item.id,
        withValue(item, {
          duration: { quarterNotes: duration.quarterNotes },
          interOnset: isSlotMatched(item)
            ? { quarterNotes: duration.quarterNotes }
            : item.value.interOnset,
        })
      );
    });
  });
  return done(replaced(packet, next));
}

/** floor(value / length) for rationals, as an integer, computed exactly (no float division). */
export function wholeWindows(value: Rational, length: Rational): number {
  const numerator = BigInt(value.numerator) * BigInt(length.denominator);
  const denominator = BigInt(value.denominator) * BigInt(length.numerator);
  let quotient = numerator / denominator;
  if (numerator % denominator !== 0n && numerator < 0n !== denominator < 0n) {
    quotient -= 1n;
  }
  return Number(quotient);
}

interface RotationPiece {
  window: number;
  start: Rational;
  end: Rational;
}

/**
 * The pieces a note makes when it is placed at `a` (relative to the span's start) on the line of
 * repeating windows of `length`: one per window it touches, each relative to its own window.
 */
function piecesAt(a: Rational, duration: Rational, length: Rational): RotationPiece[] {
  const b = addRational(a, duration);
  const pieces: RotationPiece[] = [];
  for (let window = wholeWindows(a, length); ; window += 1) {
    const windowStart = multiplyRational(length, window);
    const windowEnd = multiplyRational(length, window + 1);
    const start = compareRational(a, windowStart) > 0 ? a : windowStart;
    const end = compareRational(b, windowEnd) < 0 ? b : windowEnd;
    if (compareRational(end, start) > 0) {
      pieces.push({
        window,
        start: subtractRational(start, windowStart),
        end: subtractRational(end, windowStart),
      });
    }
    if (compareRational(b, windowEnd) <= 0) {
      return pieces;
    }
  }
}

/**
 * Rotate in time, BOUNDED and circular: the pattern shifts `amount` grid steps (negative allowed)
 * around the span (the selection's range, or 0 to the clip length with nothing selected) and nothing
 * ever lands outside it. A note crossing the span's left or right edge is CUT at the edge first (the
 * same rule as the knife and the time-selection move): only the part inside rotates, the parts
 * outside stay exactly where they are (a note wholly outside the span is not touched). The first
 * part (an outside part, else the rotating one) keeps the note's id; the other parts are fresh items
 * (same pitches, velocity and provenance) with ids derived from the original's (`<id>~r1`,
 * collision-safe), stable across presses. The inside part that would cross the span's end is split
 * there and its tail wraps to the start (backwards, the part before the start wraps to the end), so
 * the sound is conserved; a split that would leave a piece shorter than the minimum note length is
 * refused. A note selection's span is its notes' range, so none are cut; it returns itself plus the
 * pieces (and its first span) so the next press rotates the same notes in the same span. Zero steps
 * change nothing.
 *
 * With a valid `session` (rotationSession.ts: same span and grid, the originals still in the clip)
 * the rotation is applied to the ORIGINAL uncut notes with the cumulative shift, replacing all their
 * parts, so when the inside part is back in place (the cumulative shift is a whole number of spans)
 * the original note is rebuilt exactly, outside parts re-merged, and rotating back restores the
 * original packet. The result carries the updated session for the editor to keep.
 */
export function rotateInTime(
  packet: DataPacket,
  selection: Selection,
  amount: number,
  gridQuarters: number | undefined,
  session?: RotationSessionCore | null
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  if (amount === 0) {
    // No shift: the packet as it is (no folding of notes past the span, no version).
    return done(packet);
  }
  return guarded(() => {
    const { from, to } = workingSpan(packet, targets, false);
    const length = subtractRational(to, from);
    if (compareRational(length, rational(0)) <= 0) {
      return refuse('The span has no length to rotate in. Nothing was changed.');
    }
    const stepQuarters = gridQuarters && gridQuarters > 0 ? gridQuarters : AUTO_GRID_QUARTERS;
    const step = rationalFromNumber(stepQuarters);
    const present = new Set(packet.items.map((entry) => entry.id));
    const continuing =
      session &&
      session.gridQuarters === stepQuarters &&
      compareRational(session.from, from) === 0 &&
      compareRational(session.to, to) === 0 &&
      session.originals.every((original) => present.has(original.id))
        ? session
        : null;
    const sources = continuing ? continuing.originals : targets.items;
    const total = addRational(
      continuing ? continuing.shift : rational(0),
      multiplyRational(step, amount)
    );
    const oldPieces = continuing?.pieceIds ?? {};
    const taken = new Set(present);
    const next = new Map<string, NoteItem>();
    const added: NoteItem[] = [];
    const removed = new Set<string>(Object.values(oldPieces).flat());
    const pieceIds: Record<string, string[]> = {};
    const pick = (a: Rational, b: Rational) => (compareRational(a, b) >= 0 ? a : b);
    const least = (a: Rational, b: Rational) => (compareRational(a, b) <= 0 ? a : b);
    for (const original of sources) {
      pieceIds[original.id] = [];
      const noteStart = original.value.onset.quarterNotes;
      const noteEnd = endOf(original);
      // Cut at the span's edges: only the part inside rotates; the parts outside stay put.
      const insideStart = pick(noteStart, from);
      const insideEnd = least(noteEnd, to);
      if (compareRational(insideEnd, insideStart) <= 0) {
        continue; // wholly outside the span: not touched
      }
      const duration = subtractRational(insideEnd, insideStart);
      const a = addRational(subtractRational(insideStart, from), total);
      const pieces = piecesAt(a, duration, length);
      if (
        pieces.length > 1 &&
        pieces.some(
          (piece) =>
            rationalToNumber(subtractRational(piece.end, piece.start)) < MIN_NOTE_QUARTERS - 1e-9
        )
      ) {
        return refuse(
          `Rotating would split ${noteName(original)} into a piece shorter than the minimum note length. Quantize first, or use a different step. Nothing was changed.`
        );
      }
      const insideBack =
        pieces.length === 1 &&
        compareRational(pieces[0].start, subtractRational(insideStart, from)) === 0 &&
        compareRational(pieces[0].end, subtractRational(insideEnd, from)) === 0;
      if (insideBack) {
        // Back where it began: the very original note again, outside parts re-merged (their ids stay in
        // `removed`, so they leave the clip).
        next.set(original.id, original);
        continue;
      }
      const keeper = pieces.find((piece) => piece.window === 0) ?? pieces[0];
      const parts: { start: Rational; end: Rational }[] = [];
      if (compareRational(noteStart, from) < 0) {
        parts.push({ start: noteStart, end: from });
      }
      if (compareRational(noteEnd, to) > 0) {
        parts.push({ start: to, end: noteEnd });
      }
      for (const piece of [keeper, ...pieces.filter((entry) => entry !== keeper)]) {
        parts.push({
          start: addRational(from, piece.start),
          end: addRational(from, piece.end),
        });
      }
      const known = oldPieces[original.id] ?? [];
      parts.forEach((part, index) => {
        const partLength = subtractRational(part.end, part.start);
        const rebuilt = withValue(original, {
          onset: { quarterNotes: part.start },
          duration: { quarterNotes: partLength },
          interOnset: isSlotMatched(original)
            ? { quarterNotes: partLength }
            : original.value.interOnset,
        });
        // The first part keeps the note's id; the others take the ids it used before, then fresh ones.
        if (index === 0) {
          next.set(original.id, rebuilt);
          return;
        }
        let id = known[index - 1];
        if (id === undefined) {
          let count = 1;
          let candidate = `${original.id}~r${count}`;
          while (taken.has(candidate)) {
            count += 1;
            candidate = `${original.id}~r${count}`;
          }
          id = candidate;
          taken.add(id);
        }
        removed.delete(id);
        pieceIds[original.id].push(id);
        const piece = { ...rebuilt, id, provenance: [...original.provenance] };
        if (present.has(id)) {
          next.set(id, piece);
        } else {
          added.push(piece);
        }
      });
    }
    const result = replacedAndRemoved(packet, next, removed, added);
    if (result === packet) {
      return done(packet);
    }
    const core: RotationSessionCore = {
      originals: sources,
      from,
      to,
      gridQuarters: stepQuarters,
      shift: total,
      pieceIds,
    };
    // A note selection keeps the span it started with, so the next press wraps in the same span, and
    // takes in the pieces so they rotate with the rest.
    if (targets.scoped && selection.kind !== 'time') {
      const kept = selection.ids.filter((id) => !removed.has(id));
      const everyPiece = Object.values(pieceIds).flat();
      return {
        ok: true,
        packet: result,
        rotation: core,
        selection: {
          ids: [...kept, ...everyPiece.filter((id) => !kept.includes(id))],
          range: { start: rationalToNumber(from), end: rationalToNumber(to) },
        },
      };
    }
    return { ok: true, packet: result, rotation: core };
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

// --- Inversion and make equal ------------------------------------------------------------------

/**
 * Inversion: every pitch mirrors around an axis, `new = 2 * axis - pitch` in midicents, so
 * microtonal offsets survive (a pitch 30 cents above the axis lands 30 cents below it). The default
 * axis is the tonal middle of the target set: the midpoint of its lowest and highest pitch. A picked
 * axis (a whole semitone, `midi * 100`) may be any pitch on the keyboard. Every pitch of a chord is
 * mirrored (a chord that was listed low to high stays listed low to high). Refuses, changing nothing,
 * when any result would leave the keyboard (0 to 12700 midicents).
 */
export function invertNotes(
  packet: DataPacket,
  selection: Selection,
  axisMidicents?: number
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  if (axisMidicents !== undefined && !Number.isFinite(axisMidicents)) {
    return refuse('The axis must be a pitch.');
  }
  const all = targets.items.flatMap((item) => item.value.pitches);
  // Twice the axis, so a midpoint between two midicents is still an integer sum.
  const twiceAxis =
    axisMidicents === undefined
      ? Math.min(...all) + Math.max(...all)
      : Math.round(axisMidicents * 2);
  const next = new Map<string, NoteItem>();
  for (const item of targets.items) {
    const mirrored = item.value.pitches.map((pitch) => twiceAxis - pitch);
    if (mirrored.some((pitch) => pitch < MIN_MIDICENTS || pitch > MAX_MIDICENTS)) {
      return refuse(
        `Inverting would move ${noteName(item)} off the keyboard. Nothing was changed.`
      );
    }
    const wasAscending = item.value.pitches.every(
      (pitch, index, list) => index === 0 || list[index - 1] <= pitch
    );
    next.set(
      item.id,
      withValue(item, { pitches: wasAscending ? mirrored.sort((a, b) => a - b) : mirrored })
    );
  }
  return done(replaced(packet, next));
}

/** The earliest target (ties in packet order): the note "the first note" means for defaults. */
function firstTarget(targets: Targets): NoteItem {
  return slotsOf(targets.items)[0];
}

export const MAX_NOTE_QUARTERS = 288000;

/**
 * Parses a typed note length: a plain number is quarter notes (`1`, `0.5`, `1.5`); a fraction
 * `a/b` is a note value, a fraction of a whole note (`1/4` a quarter note, `1/8` an eighth, `1/16`
 * a sixteenth, `3/16` a dotted eighth). Between 1/32 of a quarter note and 288000 quarter notes.
 */
export function parseNoteDuration(
  input: string | number | undefined
): { ok: true; value: Rational } | { ok: false; error: string } {
  const bad = {
    ok: false as const,
    error:
      'Enter a length in quarter notes (1, 0.5) or as a note value (1/8 is an eighth, 1/16 a sixteenth).',
  };
  const text = String(input ?? '').trim();
  if (!text) {
    return bad;
  }
  let value: Rational;
  try {
    const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
    if (fraction) {
      const [numerator, denominator] = [Number(fraction[1]), Number(fraction[2])];
      if (!Number.isSafeInteger(numerator * 4) || !Number.isSafeInteger(denominator)) {
        return bad;
      }
      if (denominator === 0) {
        return bad;
      }
      value = rational(numerator * 4, denominator);
    } else if (/^(\d+\.?\d*|\.\d+)$/.test(text)) {
      value = rationalFromNumber(Number(text));
    } else {
      return bad;
    }
  } catch {
    return bad;
  }
  const long = rationalToNumber(value);
  if (long < MIN_NOTE_QUARTERS - 1e-9) {
    return { ok: false, error: 'A note cannot be shorter than 1/32 of a quarter note.' };
  }
  if (long > MAX_NOTE_QUARTERS) {
    return { ok: false, error: `A note cannot be longer than ${MAX_NOTE_QUARTERS} quarter notes.` };
  }
  return { ok: true, value };
}

/**
 * Make all equal, duration: every target note gets this length (default: the first target note's,
 * which makes the others match it). A note whose inter-onset follows its length keeps following it.
 * Onsets do not move, so notes may now overlap or leave gaps.
 */
export function makeEqualDuration(
  packet: DataPacket,
  selection: Selection,
  duration?: Rational
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  const wanted = duration ?? firstTarget(targets).value.duration.quarterNotes;
  if (rationalToNumber(wanted) < MIN_NOTE_QUARTERS - 1e-9) {
    return refuse('A note cannot be shorter than 1/32 of a quarter note. Nothing was changed.');
  }
  const next = new Map<string, NoteItem>();
  for (const item of targets.items) {
    next.set(
      item.id,
      withValue(item, {
        duration: { quarterNotes: wanted },
        interOnset: isSlotMatched(item) ? { quarterNotes: wanted } : item.value.interOnset,
      })
    );
  }
  return done(replaced(packet, next));
}

/** Parses a typed velocity percent (`80`, `80%`, `12.5`) into 0..1; 1 to 100 percent. */
export function parseVelocityPercent(
  input: string | number | undefined
): { ok: true; value: number } | { ok: false; error: string } {
  const text = String(input ?? '')
    .trim()
    .replace(/\s*%$/, '');
  const percent = Number(text);
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text) || percent < 1 || percent > 100) {
    return { ok: false, error: 'Enter a velocity from 1 to 100 percent.' };
  }
  return { ok: true, value: Math.round(percent * 10) / 1000 };
}

/** Make all equal, velocity: every target note gets this velocity (0..1; default the first target's). */
export function makeEqualVelocity(
  packet: DataPacket,
  selection: Selection,
  velocity?: number
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  const wanted = velocity ?? firstTarget(targets).value.velocity;
  if (!Number.isFinite(wanted) || wanted <= 0 || wanted > 1) {
    return refuse('Enter a velocity from 1 to 100 percent.');
  }
  const next = new Map<string, NoteItem>();
  for (const item of targets.items) {
    next.set(item.id, withValue(item, { velocity: wanted }));
  }
  return done(replaced(packet, next));
}

/**
 * Make all equal, pitch: every target note sounds the picked pitch (a whole semitone in midicents).
 * A chord (an item with several pitches) COLLAPSES to the picked pitch: all its pitches become the
 * one pitch, so "all equal" is literally true. Undo restores the chord (one version).
 */
export function makeEqualPitch(
  packet: DataPacket,
  selection: Selection,
  pitchMidicents: number
): ClipActionResult {
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return refuse(targets);
  }
  if (
    !Number.isFinite(pitchMidicents) ||
    pitchMidicents < MIN_MIDICENTS ||
    pitchMidicents > MAX_MIDICENTS
  ) {
    return refuse('Pick a pitch on the keyboard.');
  }
  const wanted = Math.round(pitchMidicents);
  const next = new Map<string, NoteItem>();
  for (const item of targets.items) {
    next.set(item.id, withValue(item, { pitches: [wanted] }));
  }
  return done(replaced(packet, next));
}

// --- Copy and paste --------------------------------------------------------------------------

const earliest = (a: Rational, b: Rational) => (compareRational(a, b) <= 0 ? a : b);

/**
 * Copy: the selected notes, whole, become the clipboard, held relative to the selection's start.
 * A note selection copies exactly those notes (origin: the earliest of them); a time selection
 * copies every note overlapping its span (a note that only touches an edge is not included),
 * whole, not cut at the span's edges (origin: the span's start, or the earliest note's onset when a
 * note began before the span, so no offset is negative). With nothing selected there is nothing to
 * copy: a message, never the whole clip. The packet is not changed.
 */
export function copyToClipboard(
  packet: DataPacket,
  selection: Selection
): { ok: true; clipboard: NoteClipboard } | { ok: false; error: string } {
  const timeSelection = selection.kind === 'time' && selection.range !== null;
  if (!timeSelection && selection.ids.length === 0) {
    return { ok: false, error: 'Select the notes to copy first.' };
  }
  const targets = targetsOf(packet, selection);
  if (typeof targets === 'string') {
    return { ok: false, error: targets };
  }
  try {
    let origin = targets.items.reduce(
      (soonest, item) => earliest(soonest, item.value.onset.quarterNotes),
      targets.items[0].value.onset.quarterNotes
    );
    if (timeSelection && targets.span) {
      origin = earliest(origin, targets.span.from);
    }
    const notes = targets.items.map((item): ClipboardNote => {
      const { onset, ...rest } = item.value;
      return {
        offset: subtractRational(onset.quarterNotes, origin),
        value: {
          ...rest,
          pitches: [...rest.pitches],
          interOnset: { ...rest.interOnset },
          duration: { ...rest.duration },
        },
        label: item.label,
        provenance: item.provenance.map((entry) => ({ ...entry })),
      };
    });
    return { ok: true, clipboard: { notes } };
  } catch (error) {
    if (isMusicalTimeOverflow(error)) {
      return { ok: false, error: 'The times are too fine to copy exactly.' };
    }
    throw error;
  }
}

/**
 * Where a paste lands: the time selection's start; else the earliest selected note's onset; else the
 * clip start (0; the editor has no playhead of its own to paste at).
 */
export function pasteStart(packet: DataPacket, selection: Selection): Rational {
  if (selection.kind === 'time' && selection.range) {
    return rationalFromNumber(selection.range.start);
  }
  if (selection.ids.length > 0) {
    const chosen = new Set(selection.ids);
    const onsets = packet.items
      .filter(isNoteItem)
      .filter((item) => chosen.has(item.id))
      .map((item) => item.value.onset.quarterNotes);
    if (onsets.length) {
      return onsets.reduce(earliest);
    }
  }
  return rational(0);
}

/**
 * Paste: the clipboard's notes land at `pasteStart`, each a new item (a collision-safe fresh id, the
 * copied pitches, velocity, lengths and provenance). The pasted notes become the selection. The
 * clip's total length never grows: notes past the end are kept, shown past the end marker.
 */
export function pasteNotes(
  packet: DataPacket,
  selection: Selection,
  clipboard: NoteClipboard | null | undefined,
  newId: () => string
): ClipActionResult {
  if (!clipboard || clipboard.notes.length === 0) {
    return refuse('The clipboard is empty. Copy some notes first.');
  }
  return guarded(() => {
    const at = pasteStart(packet, selection);
    const makeId = collisionSafe(packet, newId);
    const pasted: NoteItem[] = clipboard.notes.map((note) => {
      const onset = { quarterNotes: addRational(at, note.offset) };
      const value: NoteItem['value'] = {
        ...note.value,
        onset,
        pitches: [...note.value.pitches],
        interOnset: { ...note.value.interOnset },
        duration: { ...note.value.duration },
      };
      return {
        id: makeId(),
        value,
        label: noteLabel(value.pitches, onset),
        provenance: note.provenance.map((entry) => ({ ...entry })),
      };
    });
    const result: DataPacket = { ...packet, items: [...packet.items, ...pasted] };
    const ids = pasted.map((item) => item.id);
    return {
      ok: true,
      packet: result,
      selection: { ids, range: itemsSpan(result, ids) },
      message: `Pasted ${pasted.length} note${pasted.length === 1 ? '' : 's'}.`,
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
    run: (packet, context) => reverseOrder(packet, context.selection, context.newId),
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
        : rotateValues(packet, context.selection, amount, context.newId);
    },
  },
  {
    id: 'rotate-durations',
    label: 'Rotate durations',
    group: GROUP,
    params: [{ id: 'amount', label: 'Slots', type: 'integer', default: 1 }],
    applies: hasClipProperties,
    run: (packet, context, params) => {
      const amount = parseInteger(params.amount, 'the rotation');
      return typeof amount === 'string'
        ? refuse(amount)
        : rotateDurations(packet, context.selection, amount);
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
        : rotateInTime(packet, context.selection, amount, context.gridUnit, context.rotation);
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
  {
    id: 'invert',
    label: 'Invert',
    group: GROUP,
    params: [{ id: 'axis', label: 'Axis', type: 'pick-pitch', optional: true }],
    applies: hasClipProperties,
    run: (packet, context, params) => {
      const text = String(params.axis ?? '').trim();
      if (text === '') {
        return invertNotes(packet, context.selection);
      }
      const axis = Number(text);
      return Number.isFinite(axis) && axis >= MIN_MIDICENTS && axis <= MAX_MIDICENTS
        ? invertNotes(packet, context.selection, axis)
        : refuse('The axis must be a pitch on the keyboard.');
    },
  },
  {
    id: 'equal-duration',
    label: 'Make all durations equal',
    group: GROUP,
    params: [{ id: 'duration', label: 'Length', type: 'duration', optional: true }],
    applies: hasClipProperties,
    run: (packet, context, params) => {
      if (String(params.duration ?? '').trim() === '') {
        return makeEqualDuration(packet, context.selection);
      }
      const duration = parseNoteDuration(params.duration);
      return duration.ok
        ? makeEqualDuration(packet, context.selection, duration.value)
        : refuse(duration.error);
    },
  },
  {
    id: 'equal-velocity',
    label: 'Make all velocities equal',
    group: GROUP,
    params: [{ id: 'velocity', label: 'Velocity (percent)', type: 'number', optional: true }],
    applies: hasClipProperties,
    run: (packet, context, params) => {
      if (String(params.velocity ?? '').trim() === '') {
        return makeEqualVelocity(packet, context.selection);
      }
      const velocity = parseVelocityPercent(params.velocity);
      return velocity.ok
        ? makeEqualVelocity(packet, context.selection, velocity.value)
        : refuse(velocity.error);
    },
  },
  {
    id: 'equal-pitch',
    label: 'Make all pitches equal',
    group: GROUP,
    params: [{ id: 'pitch', label: 'Pitch', type: 'pick-pitch' }],
    applies: hasClipProperties,
    run: (packet, context, params) => {
      const text = String(params.pitch ?? '').trim();
      const pitch = Number(text);
      return text !== '' && Number.isFinite(pitch)
        ? makeEqualPitch(packet, context.selection, pitch)
        : refuse('Pick a pitch first.');
    },
  },
  {
    id: 'copy',
    label: 'Copy',
    group: 'Clipboard',
    params: [],
    applies: hasClipProperties,
    run: (packet, context) => {
      const copied = copyToClipboard(packet, context.selection);
      if (!copied.ok) {
        return refuse(copied.error);
      }
      const count = copied.clipboard.notes.length;
      return {
        ok: true,
        packet,
        clipboard: copied.clipboard,
        message: `Copied ${count} note${count === 1 ? '' : 's'}.`,
      };
    },
  },
  {
    id: 'paste',
    label: 'Paste',
    group: 'Clipboard',
    params: [],
    applies: hasClipProperties,
    run: (packet, context) =>
      pasteNotes(packet, context.selection, context.clipboard, context.newId),
  },
];
