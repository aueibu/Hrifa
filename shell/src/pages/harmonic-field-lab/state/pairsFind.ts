/**
 * The Pairs panel's Find box (M1 follow-up). Text with a "/" or ":" is a ratio; anything else is cents.
 * The rule itself lives in the lib (`parsePitchText`, shared with the Add pitch box, M3): `parseInterval` (lab-wide,
 * stored custom generators rely on it) reads a bare "2" as 2/1, the Find box reads it as 2 cents.
 */
import { parsePitchText } from '../../../lib/harmonic-field';

export interface FindQuery {
  /** The searched size in cents (not yet reduced into the repeat). */
  c: number;
  /** How the search is named in the result: the ratio as typed, or the cents as "700 c". */
  label: string;
}

/** The empty text is no search (null); junk returns 'bad'. */
export function parseFind(text: string): FindQuery | 'bad' | null {
  const r = parsePitchText(text);
  return r === null || r === 'bad' ? r : { c: r.c, label: r.label };
}
