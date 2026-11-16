/**
 * M8i: which chord cards merge into one. Ratio chips and positional rows with the same template or pattern and the same step list
 * (within 0.5 c) on different roots are one group; a chip found only at a raised tolerance (dashed) and CPS chords never group.
 * The expanded state of a group lives in `ui.folds` under `grp:<hash>` (a stored id = EXPANDED: the reverse of the sections).
 */
import { groupByShape, stepKey, type Note, type ShapeGroup } from '../../../lib/harmonic-field';
import type { ChordChip } from './derive';
import { MAX_FOLD_ID } from './persist';

/** Prefix of a shape group's id in `ui.folds`: a present id means the group is expanded. */
export const GROUP_PREFIX = 'grp:';

/** The chord's field indices, root first, then upward from the root. */
export function chipOrder(
  chip: Pick<ChordChip, 'rootIdx' | 'memberIdx'>,
  field: readonly Note[],
  repC: number
): number[] {
  const rootC = field[chip.rootIdx]?.c ?? 0;
  const up = (i: number) => (repC > 0 ? (((field[i].c - rootC) % repC) + repC) % repC : field[i].c);
  const rest = [...new Set(chip.memberIdx)]
    .filter((i) => i !== chip.rootIdx && field[i])
    .sort((a, b) => up(a) - up(b));
  return [chip.rootIdx, ...rest].filter((i) => field[i]);
}

/** The chord's pitches in cents above its root, root first (the shape). */
export function chipUps(
  chip: Pick<ChordChip, 'rootIdx' | 'memberIdx'>,
  field: readonly Note[],
  repC: number
): number[] {
  const rootC = field[chip.rootIdx]?.c ?? 0;
  return chipOrder(chip, field, repC).map((i) =>
    repC > 0 ? (((field[i].c - rootC) % repC) + repC) % repC : field[i].c - rootC
  );
}

/** Identity of a ratio chip's shape (template + steps), or null when it never groups (found only at a raised tolerance). */
export function chipShapeKey(chip: ChordChip, field: readonly Note[], repC: number): string | null {
  return chip.found ? `r|${chip.template}|${stepKey(chipUps(chip, field, repC))}` : null;
}

/** Identity of a positional row's shape (pattern + steps of its pitches). */
export const positionalShapeKey = (pattern: string, pitches: readonly Note[]): string =>
  `p|${pattern}|${stepKey(pitches.map((p) => p.c))}`;

/** Ratio chips grouped by shape (order of first appearance). */
export const groupChips = (
  chips: readonly ChordChip[],
  field: readonly Note[],
  repC: number
): ShapeGroup<ChordChip>[] => groupByShape(chips, (c) => chipShapeKey(c, field, repC));

/** The ids of the groups of 2 or more in a list of chips (the ones the panel renders as a grouped card). */
export const ratioGroupIds = (
  chips: readonly ChordChip[],
  field: readonly Note[],
  repC: number
): string[] =>
  groupChips(chips, field, repC)
    .filter((g) => g.key !== null && g.members.length > 1)
    .map((g) => groupFoldId(g.key as string));

/** The chords (found chips) in `chips` and the number of shapes they make once grouped (groups of one included). */
export function shapeCounts(
  chips: readonly ChordChip[],
  field: readonly Note[],
  repC: number
): { n: number; m: number } {
  const groups = groupChips(chips, field, repC).filter((g) => g.members[0].found);
  return { n: groups.reduce((a, g) => a + g.members.length, 0), m: groups.length };
}

/** A short stable id for a group key (two 32-bit FNV-1a hashes), under the 60-char cap of a fold id. */
export function groupFoldId(key: string): string {
  const fnv = (seed: number) => {
    let h = seed;
    for (let i = 0; i < key.length; i++) {
      h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
    }
    return h.toString(36);
  };
  return `${GROUP_PREFIX}${fnv(2166136261)}${fnv(0x9e3779b1)}`.slice(0, MAX_FOLD_ID);
}

/** The member a grouped card plays for: the one rooted on the Sketch stepper root (`rootDeg` wrapped), else the first. */
export function representative<T>(
  members: readonly T[],
  rootDegOf: (m: T) => number,
  stepperDeg: number
): T {
  return members.find((m) => rootDegOf(m) === stepperDeg) ?? members[0];
}
