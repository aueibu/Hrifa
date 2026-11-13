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

/**
 * Roles are scale degrees 1 to 7 (M6b): a ninth tone (b9, 9, #9) is the '2nd', an eleventh
 * tone the '4th', a thirteenth the '6th'; altered tones keep the degree of their letter
 * (b5 and #5 are '5th'). The chord name tells the user whether it is an extension.
 */
export type ChordRole = 'root' | '2nd' | '3rd' | '4th' | '5th' | '6th' | '7th';

export const ROLE_ORDER: ChordRole[] = ['root', '2nd', '3rd', '4th', '5th', '6th', '7th'];

/** Simple = triads, 5, 6, sevenths, add9 and plain 9ths; Extended = everything else. */
export type ChordTier = 'simple' | 'extended';

export interface ChordTemplate {
  id: string;
  /** Name suffix appended to the root name at 12-EDO ('' for major, 'm7', 'sus4'). */
  suffix: string;
  /** Interval stack in EDO steps from the root, ascending, first is 0. */
  steps: readonly number[];
  /** One role per tone, same length as steps. */
  roles: readonly ChordRole[];
  tier: ChordTier;
}

function tpl(
  id: string,
  suffix: string,
  steps: readonly number[],
  roles: readonly ChordRole[],
  tier: ChordTier = 'simple'
): ChordTemplate {
  return Object.freeze({
    id,
    suffix,
    steps: Object.freeze([...steps]),
    roles: Object.freeze([...roles]),
    tier,
  });
}

const R: ChordRole = 'root';

const X = 'extended';

/**
 * 12-EDO named library (frozen: templates and their arrays are immutable). Simple templates
 * come first, then extended ones, so library order is already tier order.
 */
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
  tpl('9', '9', [0, 4, 7, 10, 14], [R, '3rd', '5th', '7th', '2nd']),
  tpl('m9', 'm9', [0, 3, 7, 10, 14], [R, '3rd', '5th', '7th', '2nd']),
  tpl('maj9', 'maj9', [0, 4, 7, 11, 14], [R, '3rd', '5th', '7th', '2nd']),
  tpl('add9', 'add9', [0, 4, 7, 14], [R, '3rd', '5th', '2nd']),
  tpl('madd9', 'madd9', [0, 3, 7, 14], [R, '3rd', '5th', '2nd']),
  // Extended (from the human chord sheet). Ids are ASCII: s = sharp, b = flat.
  tpl('7b5', '7b5', [0, 4, 6, 10], [R, '3rd', '5th', '7th'], X),
  tpl('7s5', '7#5', [0, 4, 8, 10], [R, '3rd', '5th', '7th'], X),
  tpl('maj7b5', 'maj7b5', [0, 4, 6, 11], [R, '3rd', '5th', '7th'], X),
  tpl('maj7s5', 'maj7#5', [0, 4, 8, 11], [R, '3rd', '5th', '7th'], X),
  tpl('69', '6/9', [0, 4, 7, 9, 14], [R, '3rd', '5th', '6th', '2nd'], X),
  tpl('mb9', 'mb9', [0, 3, 7, 13], [R, '3rd', '5th', '2nd'], X),
  tpl('susb9', 'susb9', [0, 5, 7, 13], [R, '4th', '5th', '2nd'], X),
  tpl('7b9', '7b9', [0, 4, 7, 10, 13], [R, '3rd', '5th', '7th', '2nd'], X),
  tpl('7b5b9', '7b5b9', [0, 4, 6, 10, 13], [R, '3rd', '5th', '7th', '2nd'], X),
  tpl('7s5b9', '7#5b9', [0, 4, 8, 10, 13], [R, '3rd', '5th', '7th', '2nd'], X),
  tpl('9b5', '9b5', [0, 4, 6, 10, 14], [R, '3rd', '5th', '7th', '2nd'], X),
  tpl('9s5', '9#5', [0, 4, 8, 10, 14], [R, '3rd', '5th', '7th', '2nd'], X),
  tpl('7s9', '7#9', [0, 4, 7, 10, 15], [R, '3rd', '5th', '7th', '2nd'], X),
  tpl('7b5s9', '7b5#9', [0, 4, 6, 10, 15], [R, '3rd', '5th', '7th', '2nd'], X),
  tpl('7s5s9', '7#5#9', [0, 4, 8, 10, 15], [R, '3rd', '5th', '7th', '2nd'], X),
  tpl('13', '13', [0, 4, 7, 10, 14, 17, 21], [R, '3rd', '5th', '7th', '2nd', '4th', '6th'], X),
  tpl('adds11', 'add#11', [0, 4, 7, 18], [R, '3rd', '5th', '4th'], X),
  tpl('maj11', 'maj11', [0, 4, 7, 11, 14, 17], [R, '3rd', '5th', '7th', '2nd', '4th'], X),
  tpl('maj7s9s11', 'maj7#9#11', [0, 4, 7, 11, 15, 18], [R, '3rd', '5th', '7th', '2nd', '4th'], X),
  tpl('7b9s11', '7b9#11', [0, 4, 7, 10, 13, 18], [R, '3rd', '5th', '7th', '2nd', '4th'], X),
  tpl('m7b11', 'm7b11', [0, 3, 7, 10, 16], [R, '3rd', '5th', '7th', '4th'], X),
]);

export function stepName(steps: number[]): string {
  return steps.join('-');
}

/**
 * Stack scale degrees of `set` from `rootPc` (a member): degrees at offsets 0, 2, 4, 6, 8
 * give root/3rd/5th/7th/2nd (the degree an octave above is the 9th). Triad, seventh and 2nd-added stacks are emitted when the set has
 * enough distinct degrees (no stacked degree repeats modulo the set size). Names are step-based, e.g. "0-5-9".
 */
export function degreeStackChords(set: PitchSet, rootPc: number): ChordTemplate[] {
  const { edo, pcs } = set;
  const index = pcs.indexOf(normalizePc(rootPc, edo));
  if (index < 0) {
    return [];
  }
  const roles: ChordRole[] = [R, '3rd', '5th', '7th', '2nd'];
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
