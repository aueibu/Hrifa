/**
 * The root of a CPS chord chip (M8d): the member that is the chord's root in ROOT POSITION, read from its factor labels, not the
 * lowest reduced pitch (which differs when the chord wraps the repeat). An otonal 3:5:7 sits on the 3 (smallest label); a utonal
 * 1/(3:5:7) on 1/7, the note that drops the largest label. Returns the field index of that member.
 */
import type { CpsChord } from '../../../lib/harmonic-field';

export function cpsRootIdx(g: CpsChord, labels: readonly string[]): number {
  const labelOf = (m: CpsChord['members'][number]) => Number(labels[m.x] ?? m.x);
  return g.members.reduce((best, m) => {
    const better = g.type === 'harmonic' ? labelOf(m) < labelOf(best) : labelOf(m) > labelOf(best);
    return better ? m : best;
  }, g.members[0]).i;
}
