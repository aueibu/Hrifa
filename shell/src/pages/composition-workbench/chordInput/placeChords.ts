/**
 * The notes one or several chord inserts add (pure, no React): the stack-on-note rule of W-22 (shared by the Chords tool
 * and the panel's selection mode), applied per anchor, and the merge of several anchors' chords into one list so a host
 * can add them in ONE commit (one undo step).
 *
 * Stack rule, per request that stacks on a note (`anchor.note`): a tone that would overlap any existing note of the same
 * pitch (same onset, an earlier longer note, a later one inside the span) is dropped, so nothing is split, trimmed or
 * deleted, and the kept tones take that note's velocity. A request with no stack note (an empty-cell click) adds its
 * tones as they are.
 *
 * Merge rule (selection mode with several anchors, decision 3a(i), C2): requests are taken in order, and a tone is also
 * dropped when a tone of an EARLIER request has the same pitch AND the same onset. So a pitch two chords share at one
 * onset is entered once (the first anchor's chord keeps it, with that anchor's length and velocity); tones at different
 * onsets that merely overlap in time are both kept. Tones of one
 * request are never checked against each other, so a single request gives exactly what the Chords tool gives.
 */
import type { ChordInsertRequest } from './chordSession';
import type { PlacedNote } from './placement';

export interface ExistingNote {
  start: number;
  duration: number;
  pitchMidicents: number;
}

export type NewChordNote = PlacedNote & { velocity?: number };

const EPSILON = 1e-9;

/** Pitches closer than this are the same note (an off-grid note counts as its grid pitch). */
function pitchTolerance(edo: number): number {
  return Math.min(50, 1200 / edo / 2) + EPSILON;
}

function overlaps(a: ExistingNote | PlacedNote, b: PlacedNote, tolerance: number): boolean {
  return (
    Math.abs(a.pitchMidicents - b.pitchMidicents) <= tolerance &&
    a.start < b.start + b.duration - EPSILON &&
    a.start + a.duration > b.start + EPSILON
  );
}

/** The merge rule's test: the same pitch entered at the same onset (tones that merely overlap in time are both kept). */
function sameOnsetAndPitch(a: PlacedNote, b: PlacedNote, tolerance: number): boolean {
  return (
    Math.abs(a.pitchMidicents - b.pitchMidicents) <= tolerance &&
    Math.abs(a.start - b.start) <= EPSILON
  );
}

/** One request's tones after the stack rule (the Chords tool's whole rule). */
export function stackTones(
  request: Pick<ChordInsertRequest, 'anchor' | 'notes'>,
  existing: readonly ExistingNote[],
  edo: number
): NewChordNote[] {
  const { anchor, notes: tones } = request;
  if (!anchor.note) {
    return tones;
  }
  const velocity = anchor.note.velocity;
  const tolerance = pitchTolerance(edo);
  return tones
    .filter((tone) => !existing.some((note) => overlaps(note, tone, tolerance)))
    .map((tone) => (velocity === undefined ? tone : { ...tone, velocity }));
}

/** The tones of all requests, stack rule per request and no pitch entered twice across requests; empty: nothing to place. */
export function mergeChordInserts(
  requests: readonly Pick<ChordInsertRequest, 'anchor' | 'notes'>[],
  existing: readonly ExistingNote[],
  edo: number
): NewChordNote[] {
  const tolerance = pitchTolerance(edo);
  const placed: NewChordNote[] = [];
  for (const request of requests) {
    const mine = stackTones(request, existing, edo).filter(
      (tone) => !placed.some((earlier) => sameOnsetAndPitch(earlier, tone, tolerance))
    );
    placed.push(...mine);
  }
  return placed;
}
