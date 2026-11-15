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

/**
 * After the Add that created an Auto-saved generator (the tab was edited or had no saved home): reassurance, with the new
 * generator's display name. The unsaved/edited reason stays in `LabState.forkNote` but is not worded: the reassurance is the same.
 */
export function forkSentence(name: string): string {
  return `Kept automatically as '${name}' under Auto-saved. Use Save as new to name it and move it to My presets.`;
}
