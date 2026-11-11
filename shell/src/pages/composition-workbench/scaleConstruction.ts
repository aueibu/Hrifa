/**
 * Schillinger Book II Ch. 1-2: pitch-scale construction from an authored interval
 * sequence, and enumeration of its "melodic forms" (permutations of that sequence) —
 * pitch's analog of Book I Ch. 9's rhythm-element permutation, applied to pitch-units
 * instead of durations.
 */

import { packet, type DataItem, type DataPacket } from "./model";
import { pitchClassName } from "./pitch";

export interface ScaleSequence {
  intervals: number[];
  period: number;
}

export function scaleSequence(intervals: number[]): ScaleSequence {
  if (!intervals.length || intervals.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error("A scale requires one or more positive whole-number intervals.");
  }
  return { intervals, period: intervals.reduce((sum, value) => sum + value, 0) };
}

/**
 * Every permutation of the interval sequence, generated in full and never
 * deduplicated. If two distinct orderings happen to produce the same sequence of
 * values, that coincidence is itself part of what the melodic-form table reports —
 * Schillinger's own tables list repeated forms as repeated entries, not one entry.
 */
export function generateMelodicForms(
  intervals: number[],
  mode: "general" | "circular",
): number[][] {
  return generateMelodicFamilies(intervals, mode).flatMap((family) =>
    family.forms.map((form) => form.values),
  );
}

export interface MelodicForm {
  values: number[];
  /** The ordering as positions of the original sequence (0-based), so coincident values stay distinct. */
  order: number[];
  /** Rotation of the family's base ordering that yields this form (0 = the base itself). */
  shift: number;
}

export interface MelodicFamily {
  /** Cycle: 0 is the family containing the original ordering; later ones are further from it. */
  cycle: number;
  /** Adjacent swaps needed to reach the family's base ordering from the original. */
  inversions: number;
  forms: MelodicForm[];
}

/**
 * Groups the melodic forms into rotation families. Each family is one cyclic arrangement of
 * the interval positions (its n rotations); the general mode's n! forms split into (n-1)!
 * families, and the circular mode is exactly cycle 0. Grouping is by position, never
 * by value, so forms that coincide in value remain separate entries.
 */
export function generateMelodicFamilies(
  intervals: number[],
  mode: "general" | "circular",
): MelodicFamily[] {
  const count = intervals.length;
  const identity = intervals.map((_, index) => index);
  // Every rotation orbit has exactly one member beginning with position 0: use it as the base.
  const bases =
    mode === "circular"
      ? [identity]
      : indexPermutations(identity.slice(1)).map((rest) => [0, ...rest]);
  return bases
    .map((base) => ({ base, inversions: countInversions(base) }))
    .sort((a, b) => a.inversions - b.inversions || compareOrders(a.base, b.base))
    .map(({ base, inversions }, cycle) => ({
      cycle,
      inversions,
      forms: base.map((_, shift) => {
        const order = base.map((_, index) => base[(index + shift) % count]);
        return { values: order.map((position) => intervals[position]), order, shift };
      }),
    }));
}

export function cycleLabel(cycle: number): string {
  return cycle === 0 ? "Cycle 0 (original)" : `Cycle ${cycle}`;
}

/** No menu level lists more than this many entries (cycles or folders of them). */
export const MAX_MENU_ENTRIES = 10;

/**
 * The "Cycles a–b" folders a cycle sits in, outermost first, chosen so that no menu
 * level holds more than MAX_MENU_ENTRIES: with up to 10 cycles there are no folders; up to
 * 100 they go in folders of 10; up to 1000, folders of 100 holding folders of 10; and so on.
 * A folder that would hold a single cycle is skipped, so that cycle sits beside its
 * sibling folders instead of inside a redundant "Cycles 100–100".
 */
export function cycleFolders(cycle: number, familyCount: number): string[] {
  let size = 1;
  const sizes: number[] = [];
  while (size * MAX_MENU_ENTRIES < familyCount) {
    size *= MAX_MENU_ENTRIES;
    sizes.unshift(size);
  }
  const folders: string[] = [];
  for (const folderSize of sizes) {
    const start = Math.floor(cycle / folderSize) * folderSize;
    const end = Math.min(start + folderSize, familyCount) - 1;
    if (end > start) folders.push(`Cycles ${start}–${end}`);
  }
  return folders;
}

function indexPermutations(values: number[]): number[][] {
  if (values.length <= 1) return [values.slice()];
  const results: number[][] = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const permutation of indexPermutations(rest)) {
      results.push([value, ...permutation]);
    }
  });
  return results;
}

function countInversions(order: number[]): number {
  let inversions = 0;
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      if (order[i] > order[j]) inversions += 1;
    }
  }
  return inversions;
}

function compareOrders(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Cumulative pitch offsets from a root. No mod-12 folding here — Group One scales
 * (this module's scope) stay within an octave by construction; octave-spanning
 * expansion is a separate, later operation, not something this realization silently
 * performs.
 */
export function realizeScale(intervals: number[], root = 0): number[] {
  const offsets = [root];
  let cursor = root;
  for (const interval of intervals) {
    cursor += interval;
    offsets.push(cursor);
  }
  return offsets;
}

export function scaleSequencePacket(sequence: ScaleSequence, sourceId: string): DataPacket<number> {
  const items: DataItem<number>[] = sequence.intervals.map((value, index) => ({
    id: `${sourceId}:interval:${index}`,
    value,
    provenance: [
      {
        sourceModuleInstance: sourceId,
        sourceItemIds: [],
        transformation: "scale-construction",
        parameters: { intervals: sequence.intervals, index },
      },
    ],
  }));
  return packet("list", "interval", items, [], undefined, {
    role: "interUnit",
    frame: { topology: "cyclic", unit: "abstract", extent: sequence.period, origin: 0 },
  });
}

export function melodicFormsPacket(
  intervals: number[],
  mode: "general" | "circular",
  sourceId: string,
): DataPacket<number[]> {
  const families = generateMelodicFamilies(intervals, mode);
  const period = intervals.reduce((sum, value) => sum + value, 0);
  const items: DataItem<number[]>[] = families.flatMap((family, familyIndex) =>
    family.forms.map((form, shift) => {
      const index = familyIndex * (families[0]?.forms.length ?? 0) + shift;
      return {
        id: `${sourceId}:form:${index}`,
        value: form.values,
        label: form.values.join("+"),
        provenance: [
          {
            sourceModuleInstance: sourceId,
            sourceItemIds: [],
            transformation: mode === "circular" ? "circular-permutation" : "general-permutation",
            parameters: { intervals, mode, index, family: family.cycle, shift: form.shift },
          },
        ],
      };
    }),
  );
  // A bank with several families names each entry's family so a source picker can nest them;
  // a single family (circular mode) needs no extra level.
  // With many families, cycles are filed into nested "Cycles a–b" folders.
  const entryGroups =
    families.length > 1
      ? families.flatMap((family) =>
          family.forms.map(() => [
            ...cycleFolders(family.cycle, families.length),
            cycleLabel(family.cycle),
          ]),
        )
      : undefined;
  return packet("bank", "interval", items, [], { mode, period, familyCount: families.length, entryGroups }, {
    role: "interUnit",
    frame: { topology: "cyclic", unit: "abstract", extent: period, origin: 0 },
  });
}

/**
 * Bare pitch-class numbers (0-11), one per scale degree — no wrapper object. A pitchClass
 * item's stored value is just a number, matching every other domain's items and matching
 * how OM itself represents pitch material. Used both for a single realized scale
 * (scalePitchClassPacket, one item per degree) and for a bank of alternative scales
 * (scaleEvolution's stagePitchClassesPacket, one bank item per stage holding the whole
 * `number[]` scale — which is already exactly a valid bracketed-group pitchClass value,
 * no separate representation needed).
 */
export function realizePitchClasses(intervals: number[], root: number, edo = 12): number[] {
  return realizeScale(intervals, root).map((value) => ((value % edo) + edo) % edo);
}

export function scalePitchClassPacket(
  intervals: number[],
  root: number,
  sourceId: string,
  edo = 12,
): DataPacket<number> {
  const pitchClasses = realizePitchClasses(intervals, root, edo);
  const items: DataItem<number>[] = pitchClasses.map((pitchClass, index) => ({
    id: `${sourceId}:degree:${index}`,
    value: pitchClass,
    label: pitchClassName(pitchClass, edo),
    provenance: [
      {
        sourceModuleInstance: sourceId,
        sourceItemIds: [],
        transformation: "realize-scale",
        parameters: { intervals, root, degree: index },
      },
    ],
  }));
  return packet("list", "pitchClass", items, [], undefined, {
    role: "pitchMaterial",
    encoding: `chromatic-${edo}`,
  });
}
