/**
 * The Pairs panel's Find box (M1 follow-up). Text with a "/" or ":" is a ratio; anything else is cents.
 * Local to the Pairs panel on purpose: `parseInterval` (lab-wide, stored custom generators rely on it) reads a bare "2" as 2/1,
 * the Find box reads it as 2 cents.
 */
import { parseInterval } from '../../../lib/harmonic-field';

/** A number with an optional unit: "700", "700 c", "700c", "700.5", "-100 cents". */
const CENTS = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:c|cents?)?$/i;

export interface FindQuery {
  /** The searched size in cents (not yet reduced into the repeat). */
  c: number;
  /** How the search is named in the result: the ratio as typed, or the cents as "700 c". */
  label: string;
}

/** The empty text is no search (null); junk returns 'bad'. */
export function parseFind(text: string): FindQuery | 'bad' | null {
  const t = text.trim();
  if (t === '') {
    return null;
  }
  if (/[/:]/.test(t)) {
    const n = parseInterval(t);
    return n ? { c: n.c, label: t } : 'bad';
  }
  const m = CENTS.exec(t);
  if (!m) {
    return 'bad';
  }
  const c = Number(m[1]);
  return Number.isFinite(c) ? { c, label: `${c} c` } : 'bad';
}
