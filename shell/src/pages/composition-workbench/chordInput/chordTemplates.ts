/**
 * Chord templates: interval stacks in EDO steps from the root, one role label per tone.
 * `steps` ascend and may exceed the EDO (a 9th is 14 steps at 12-EDO), so voicing can keep
 * the stacking order; pitch class = (root + step) mod edo.
 *
 * The named library is 12-EDO only. For other EDOs `degreeStackChords` derives templates
 * by stacking scale degrees of a PitchSet (thirds-by-degree, skipping one), with step-based
 * names (no 12-EDO naming).
 */
import { normalizePc, type PitchSet } from './pitchSet';

export type ChordRole = 'root' | '2nd' | '3rd' | '4th' | '5th' | '6th' | '7th' | '9th';

export const ROLE_ORDER: ChordRole[] = ['root', '2nd', '3rd', '4th', '5th', '6th', '7th', '9th'];

export interface ChordTemplate {
  id: string;
  /** Name suffix appended to the root name at 12-EDO ('' for major, 'm7', 'sus4'). */
  suffix: string;
  /** Interval stack in EDO steps from the root, ascending, first is 0. */
  steps: readonly number[];
  /** One role per tone, same length as steps. */
  roles: readonly ChordRole[];
}

function tpl(
  id: string,
  suffix: string,
  steps: readonly number[],
  roles: readonly ChordRole[]
): ChordTemplate {
  return Object.freeze({
    id,
    suffix,
    steps: Object.freeze([...steps]),
    roles: Object.freeze([...roles]),
  });
}

const R: ChordRole = 'root';

/** 12-EDO named library (frozen: templates and their arrays are immutable). */
export const CHORD_LIBRARY_12: readonly ChordTemplate[] = Object.freeze([
  tpl('major', '', [0, 4, 7], [R, '3rd', '5th']),
  tpl('minor', 'm', [0, 3, 7], [R, '3rd', '5th']),
  tpl('dim', 'dim', [0, 3, 6], [R, '3rd', '5th']),
  tpl('aug', 'aug', [0, 4, 8], [R, '3rd', '5th']),
  tpl('5', '5', [0, 7], [R, '5th']),
  tpl('sus2', 'sus2', [0, 2, 7], [R, '2nd', '5th']),
  tpl('sus4', 'sus4', [0, 5, 7], [R, '4th', '5th']),
  tpl('6', '6', [0, 4, 7, 9], [R, '3rd', '5th', '6th']),
  tpl('m6', 'm6', [0, 3, 7, 9], [R, '3rd', '5th', '6th']),
  tpl('7', '7', [0, 4, 7, 10], [R, '3rd', '5th', '7th']),
  tpl('maj7', 'maj7', [0, 4, 7, 11], [R, '3rd', '5th', '7th']),
  tpl('m7', 'm7', [0, 3, 7, 10], [R, '3rd', '5th', '7th']),
  tpl('m7b5', 'm7b5', [0, 3, 6, 10], [R, '3rd', '5th', '7th']),
  tpl('dim7', 'dim7', [0, 3, 6, 9], [R, '3rd', '5th', '7th']),
  tpl('mMaj7', 'mMaj7', [0, 3, 7, 11], [R, '3rd', '5th', '7th']),
  tpl('9', '9', [0, 4, 7, 10, 14], [R, '3rd', '5th', '7th', '9th']),
  tpl('m9', 'm9', [0, 3, 7, 10, 14], [R, '3rd', '5th', '7th', '9th']),
  tpl('maj9', 'maj9', [0, 4, 7, 11, 14], [R, '3rd', '5th', '7th', '9th']),
  tpl('add9', 'add9', [0, 4, 7, 14], [R, '3rd', '5th', '9th']),
  tpl('madd9', 'madd9', [0, 3, 7, 14], [R, '3rd', '5th', '9th']),
]);

export function stepName(steps: number[]): string {
  return steps.join('-');
}

/**
 * Stack scale degrees of `set` from `rootPc` (a member): degrees at offsets 0, 2, 4, 6, 8
 * give root/3rd/5th/7th/9th. Triad, seventh and ninth stacks are emitted when the set has
 * enough distinct degrees (no stacked degree repeats modulo the set size). Names are step-based, e.g. "0-5-9".
 */
export function degreeStackChords(set: PitchSet, rootPc: number): ChordTemplate[] {
  const { edo, pcs } = set;
  const index = pcs.indexOf(normalizePc(rootPc, edo));
  if (index < 0) {
    return [];
  }
  const roles: ChordRole[] = [R, '3rd', '5th', '7th', '9th'];
  const out: ChordTemplate[] = [];
  for (const count of [3, 4, 5]) {
    if (new Set(Array.from({ length: count }, (_, k) => (2 * k) % pcs.length)).size < count) {
      continue;
    }
    const steps: number[] = [];
    for (let k = 0; k < count; k += 1) {
      const at = index + 2 * k;
      const position = pcs[at % pcs.length] + Math.floor(at / pcs.length) * edo;
      steps.push(position - pcs[index]);
    }
    out.push(tpl(`stack${count}`, stepName(steps), steps, roles.slice(0, count)));
  }
  return out;
}
