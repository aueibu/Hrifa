import { scoreVoicing, type ScoreOptions, type VoicingScores } from '../consonance';
import type { Voicing } from '../consonance/types';

export interface TranspositionRange {
  /** First shift in cents (may be negative). */
  fromCents: number;
  /** Last shift in cents (inclusive when it falls on a step). */
  toCents: number;
  /** Step between shifts, > 0. */
  stepCents: number;
}

export interface TranspositionPoint {
  shiftCents: number;
  /** The voicing moved up by `shiftCents`: same `cents`, `refHz` scaled by 2^(shift/1200). */
  voicing: Voicing;
  /** Present when scoring was requested. */
  scores?: VoicingScores;
}

/**
 * The voicing shifted through a range of transpositions (the register scan), optionally scored with `scoreVoicing`
 * (`score: true` for defaults, or its options).
 */
export function transpositionScan(
  voicing: Voicing,
  range: TranspositionRange,
  opts: { score?: boolean | ScoreOptions } = {}
): TranspositionPoint[] {
  const { fromCents, toCents, stepCents } = range;
  if (![fromCents, toCents, stepCents].every(Number.isFinite) || !(stepCents > 0)) {
    throw new RangeError('transpositionScan: need finite from/to and stepCents > 0');
  }
  if (toCents < fromCents) {
    throw new RangeError('transpositionScan: toCents < fromCents');
  }
  const n = Math.floor((toCents - fromCents) / stepCents + 1e-9) + 1;
  const scoreOpts = opts.score === true ? {} : opts.score || null;
  const out: TranspositionPoint[] = [];
  for (let k = 0; k < n; k++) {
    const shiftCents = fromCents + k * stepCents;
    const shifted: Voicing = {
      refHz: voicing.refHz * 2 ** (shiftCents / 1200),
      cents: voicing.cents.slice(),
    };
    out.push({
      shiftCents,
      voicing: shifted,
      ...(scoreOpts ? { scores: scoreVoicing(shifted, scoreOpts) } : {}),
    });
  }
  return out;
}
