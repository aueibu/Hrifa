/** How a saved subset maps onto the current field: the classification behind a row's dimming and corner triangle. Pure. */
import { fmtRatio, type Note } from '../../../lib/harmonic-field';

export type MatchLevel = 'full' | 'partial' | 'none';

/** Every stored pitch found is `full`; some is `partial`; none (of a non-empty subset) is `none`. */
export function matchLevel(found: number, total: number): MatchLevel {
  if (total <= 0 || found >= total) {
    return 'full';
  }
  return found <= 0 ? 'none' : 'partial';
}

/** A pitch as a ratio when it has one, else its cents. */
export const pitchText = (p: Note): string =>
  p.m ? fmtRatio(p) : `${(Number.isFinite(p.c) ? p.c : 0).toFixed(1)} c`;

/** The triangle's tooltip sentence for a partial or no match (empty for a full match). */
export function matchSentence(found: number, missing: readonly Note[], max = 8): string {
  const total = found + missing.length;
  const level = matchLevel(found, total);
  if (level === 'full') {
    return '';
  }
  if (level === 'none') {
    return 'No notes in common with these settings.';
  }
  const shown = missing.slice(0, max).map(pitchText).join(', ');
  const more = missing.length > max ? ` and ${missing.length - max} more` : '';
  return `${found} of ${total} notes in these settings. Missing: ${shown}${more}.`;
}
