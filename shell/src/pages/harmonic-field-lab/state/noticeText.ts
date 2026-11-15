/** Sentences for the generator notice (M7b step 2). The update sentence is the lib's `reportSentence`. */
import type { UpdateReport } from '../../../lib/harmonic-field';

/** After Save as new with copied subsets: how many came across and what was left out. */
export function copySentence(name: string, r: UpdateReport): string {
  const parts = [
    `Saved '${name}' with ${r.updatedSubsets} copied subset${r.updatedSubsets === 1 ? '' : 's'}.`,
  ];
  if (r.removedSubsets > 0) {
    parts.push(
      `${r.removedSubsets} subset${r.removedSubsets === 1 ? '' : 's'} had no matching pitches and ${r.removedSubsets === 1 ? 'was' : 'were'} left out.`
    );
  }
  if (r.affectedSubsets > 0) {
    parts.push(
      `${r.removedSubsets > 0 ? 'The other subsets' : r.affectedSubsets === 1 ? 'One subset' : 'Subsets'} lost ${r.affectedAverageLost.toFixed(1)} pitches on average (most: ${r.mostLost}).`
    );
  }
  return parts.join(' ');
}

/** After Add on an edited or unsaved generator: the subset went into a new Untitled generator. */
export function forkSentence(reason: 'unsaved' | 'edited'): string {
  return reason === 'unsaved'
    ? 'Saved to a new Untitled generator, because these settings had no saved home yet. Use Save as new to name it.'
    : 'Saved to a new Untitled generator, because this generator was edited. Use Save as new to name it.';
}
