/**
 * Schillinger Book II Ch. 1-2: pitch-scale construction from an authored interval
 * sequence, and enumeration of its "melodic forms" (permutations of that sequence) —
 * pitch's analog of Book I Ch. 9's rhythm-element permutation, applied to pitch-units
 * instead of durations.
 */

import { packet, type DataItem, type DataPacket } from "./model";
import { pitchClassNames, type PitchClassValue, type PitchGroupValue } from "./pitch";

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
  if (mode === "circular") {
    return intervals.map((_, shift) =>
      intervals.map((_, index) => intervals[(index + shift) % intervals.length]),
    );
  }
  return generalPermutations(intervals);
}

function generalPermutations(values: number[]): number[][] {
  if (values.length <= 1) return [values.slice()];
  const results: number[][] = [];
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const permutation of generalPermutations(rest)) {
      results.push([value, ...permutation]);
    }
  });
  return results;
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
  const forms = generateMelodicForms(intervals, mode);
  const period = intervals.reduce((sum, value) => sum + value, 0);
  const items: DataItem<number[]>[] = forms.map((form, index) => ({
    id: `${sourceId}:form:${index}`,
    value: form,
    label: form.join("+"),
    provenance: [
      {
        sourceModuleInstance: sourceId,
        sourceItemIds: [],
        transformation: mode === "circular" ? "circular-permutation" : "general-permutation",
        parameters: { intervals, mode, index },
      },
    ],
  }));
  return packet("bank", "interval", items, [], { mode, period }, {
    role: "interUnit",
    frame: { topology: "cyclic", unit: "abstract", extent: period, origin: 0 },
  });
}

/**
 * PitchGroupValue-wrapped PitchClassValue objects, one per scale degree — the shape
 * pitch.ts's own parsePitchClass (and Pitch List's packets) already use. Every producer
 * of pitchClass material, whether a single realized scale (scalePitchClassPacket) or a
 * bank of alternative scales (scaleEvolution's stagePitchClassesPacket), must build its
 * items from this shape. Emitting a bare number here silently breaks Melodicization's
 * "voice as concrete pitch" route treatment: asPitchGroup would wrap the bare number as
 * { pitches: [number] } rather than { pitches: [PitchClassValue] }, and
 * concreteGroupFromPitchClasses's `pitch.pitchClass` lookup then reads undefined off a
 * number, producing NaN midicents and the "must contain finite concrete midicent
 * values" error downstream.
 */
export function realizePitchGroups(intervals: number[], root: number): PitchGroupValue[] {
  return realizeScale(intervals, root).map((value) => {
    const pitchClass = ((value % 12) + 12) % 12;
    const pitch: PitchClassValue = {
      pitchClass,
      label: pitchClassNames[pitchClass],
      sourceValue: pitchClass,
    };
    return { pitches: [pitch], label: pitch.label };
  });
}

export function scalePitchClassPacket(
  intervals: number[],
  root: number,
  sourceId: string,
): DataPacket<PitchGroupValue> {
  const groups = realizePitchGroups(intervals, root);
  const items: DataItem<PitchGroupValue>[] = groups.map((group, index) => ({
    id: `${sourceId}:degree:${index}`,
    value: group,
    label: group.label,
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
    encoding: "chromatic-12",
  });
}
