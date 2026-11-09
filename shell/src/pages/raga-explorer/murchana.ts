/** Murchana search: does a mode-rotation of a scale match a real raga in the database?
 *
 * A murchana is the classical operation of re-basing a scale on a different one of its own notes -- keep the
 * exact same set of pitch classes, just shift which one is heard as Sa (the same relationship Western theory
 * calls a "mode rotation": Ionian re-based on its 2nd degree is Dorian, etc.). It is the natural tool for the
 * three questions this module answers:
 *   - INVERSIONS: murchana-rotate the raga's OWN scale onto each of its own other notes. This is the raga
 *     re-based on each of its degrees in turn -- does any of those rotations happen to be another real raga's
 *     scale? (The un-rotated raga itself, startPc=0, is excluded here: that case is already covered by "Scale
 *     twins" in the main linked-ragas panel, so listing it again here would just be noise.)
 *   - MIRROR rotations: same murchana search, but starting from the melodic mirror's pitch-class set (the
 *     inversion around Sa -- see theory.ts's mirrorGamut) instead of the raga's own scale.
 *   - NEGATIVE rotations: same again, starting from the negative/complement pitch-class set (theory.ts's
 *     negativeGamut) -- the raga's totally unused pitches, treated as a scale in its own right.
 * All three searches are pure pitch-class-set matches (order- and vakra-independent): they ask "does a real raga
 * use exactly this set of pitches", not "does it phrase them the same way". */
import { mod12 } from './theory';
import type { RagaVariant } from './types';

export interface MurchanaRotation {
  startPc: number;
  rotated: number[];
  str: string;
}

export function pcsetKey(pcset: number[]): string {
  return [...new Set(pcset)].sort((a, b) => a - b).join(',');
}

/** Every murchana of `pcset`: for each of its own pitch classes taken as the new Sa, the resulting rotated set. */
export function murchanaRotations(pcset: number[]): MurchanaRotation[] {
  const unique = [...new Set(pcset)].sort((a, b) => a - b);
  return unique.map((startPc) => {
    const rotated = unique.map((p) => mod12(p - startPc)).sort((a, b) => a - b);
    return { startPc, rotated, str: pcsetKey(rotated) };
  });
}

export interface MurchanaHit {
  startPc: number;
  ragas: RagaVariant[];
}

/** `byPcset` maps a pcsetKey() signature to every raga variant that uses exactly that pitch-class set (see
 * data.ts's `byPcset` index). Returns one entry per rotation that has at least one real-raga match, each with one
 * representative variant per matching Raga ID (not every scale reading of it), excluding `excludeRagaId` (so a
 * raga never "matches" its own rotation back to itself). `skipStartPc` optionally omits one rotation (used to
 * drop the un-rotated case for the "inversions of the raga itself" search, see the module docstring). */
export function findMurchanaMatches(
  pcset: number[],
  byPcset: Map<string, RagaVariant[]>,
  excludeRagaId: string,
  skipStartPc?: number
): MurchanaHit[] {
  const hits: MurchanaHit[] = [];
  for (const rot of murchanaRotations(pcset)) {
    if (skipStartPc != null && rot.startPc === skipStartPc) {
      continue;
    }
    const candidates = byPcset.get(rot.str);
    if (!candidates || candidates.length === 0) {
      continue;
    }
    const seen = new Set<string>([excludeRagaId]);
    const ragas: RagaVariant[] = [];
    for (const r of candidates) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        ragas.push(r);
      }
    }
    if (ragas.length > 0) {
      hits.push({ startPc: rot.startPc, ragas });
    }
  }
  return hits;
}
