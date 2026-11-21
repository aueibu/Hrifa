import type { Constraints, IntervalConstraint, NotePair } from './types';

const DEFAULT_TOL = 1e-6;

function matches(sizeCents: number, c: IntervalConstraint): boolean {
  const tol = c.toleranceCents ?? DEFAULT_TOL;
  if (!c.octaveEquivalent) {
    return Math.abs(sizeCents - c.cents) <= tol;
  }
  const d = (((sizeCents - c.cents) % 1200) + 1200) % 1200;
  return Math.min(d, 1200 - d) <= tol;
}

/** True when any pair of notes (essential or induced) has the constraint's size. */
export function containsInterval(pairs: readonly NotePair[], c: IntervalConstraint): boolean {
  return pairs.some((p) => matches(p.cents, c));
}

export type ConstraintVerdict = 'ok' | 'mustNotHave' | 'mustHave';

/** The first constraint kind a voicing's pairs violate (must-not-have is checked first), or `'ok'`. */
export function checkConstraints(
  pairs: readonly NotePair[],
  constraints: Constraints | undefined
): ConstraintVerdict {
  if (!constraints) {
    return 'ok';
  }
  if (constraints.mustNotHave?.some((c) => containsInterval(pairs, c))) {
    return 'mustNotHave';
  }
  if (constraints.mustHave?.some((c) => !containsInterval(pairs, c))) {
    return 'mustHave';
  }
  return 'ok';
}
