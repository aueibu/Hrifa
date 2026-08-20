import type { DataItem, DataPacket, Provenance } from './model';
import { asPitchGroup, type PitchClassValue, type PitchGroupValue, type PitchValue } from './pitch';

export interface PitchRouteTreatment {
  bypassed: boolean;
  transposition: number;
  inverted: boolean;
  inversionAxisMidi: number;
  retrograde: boolean;
  rotation: number;
  registerBaseMidi: number;
  voicingInversion: number;
  // Off by default: a pitch-class source stays raw pitch-class (0-11, mod-12 math) unless this
  // is explicitly turned on. Consumers that require a concrete pitch — Melodicization, which
  // only accepts `pitch` domain — need it on; the connection stays live and transpose/
  // invert/retrograde/rotate still apply either way, only the register-floor voicing step is
  // gated by this flag.
  voiceAsPitch: boolean;
  // Off by default: a generic numeric source (not already pitch/pitchClass — e.g. Arithmetic's
  // `integer` output) has no pitch meaning of its own. Turning this on interprets each raw
  // number as a MIDI note number and converts the route to `pitch` domain; left off, the source
  // passes through unconverted, so a consumer that requires pitch material errors until this is
  // explicitly turned on.
  readAsMidiNotes: boolean;
  // What raw value 0 maps to when readAsMidiNotes is on — e.g. an Arithmetic result of 0 becomes
  // MIDI 60 (C4) by default, and a result of 3 becomes MIDI 63, rather than treating the raw
  // number as an absolute MIDI note number itself.
  midiNoteBase: number;
}

export interface RhythmRouteTreatment {
  bypassed: boolean;
  retrograde: boolean;
  rotation: number;
  durationScale: number;
}

export const defaultPitchRouteTreatment: PitchRouteTreatment = {
  bypassed: false,
  transposition: 0,
  inverted: false,
  inversionAxisMidi: 60,
  retrograde: false,
  rotation: 0,
  registerBaseMidi: 60,
  voicingInversion: 0,
  voiceAsPitch: false,
  readAsMidiNotes: false,
  midiNoteBase: 60,
};

export const defaultRhythmRouteTreatment: RhythmRouteTreatment = {
  bypassed: false,
  retrograde: false,
  rotation: 0,
  durationScale: 1,
};

export function isPitchRouteTreatmentIdentity(treatment: PitchRouteTreatment, source?: DataPacket) {
  const stillVoicesToConcretePitch = source?.domain === 'pitchClass' && treatment.voiceAsPitch;
  const stillReadsAsMidi =
    source && source.domain !== 'pitch' && source.domain !== 'pitchClass' && treatment.readAsMidiNotes;
  return (
    !stillVoicesToConcretePitch &&
    !stillReadsAsMidi &&
    !treatment.bypassed &&
    treatment.transposition === 0 &&
    !treatment.inverted &&
    !treatment.retrograde &&
    treatment.rotation === 0 &&
    treatment.voicingInversion === 0
  );
}

export function isRhythmRouteTreatmentIdentity(treatment: RhythmRouteTreatment) {
  return (
    !treatment.bypassed &&
    !treatment.retrograde &&
    treatment.rotation === 0 &&
    treatment.durationScale === 1
  );
}

function modulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

function rotate<T>(items: T[], amount: number) {
  if (!items.length) {
    return items;
  }
  const normalized = modulo(amount, items.length);
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function sequenceSteps(
  routeId: string,
  sourceItemId: string,
  retrograde: boolean,
  rotation: number
): Provenance[] {
  const steps: Provenance[] = [];
  if (retrograde) {
    steps.push({
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'retrograde-sequence',
    });
  }
  if (rotation !== 0) {
    steps.push({
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'rotate-sequence',
      parameters: { rotation },
    });
  }
  return steps;
}

function sequenceItems<T>(
  items: DataItem<T>[],
  routeId: string,
  retrograde: boolean,
  rotation: number
) {
  const ordered = rotate(retrograde ? [...items].reverse() : [...items], rotation);
  return ordered.map((item) => ({
    ...item,
    provenance: [...item.provenance, ...sequenceSteps(routeId, item.id, retrograde, rotation)],
  }));
}

const pitchClassNames = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function pitchLabel(midicents: number) {
  const midi = midicents / 100;
  const nearest = Math.round(midi);
  const pitchClass = modulo(nearest, 12);
  const octave = Math.floor(nearest / 12) - 1;
  const cents = Math.round((midi - nearest) * 100);
  return `${pitchClassNames[pitchClass]}${octave}${cents ? ` ${cents > 0 ? '+' : ''}${cents}c` : ''}`;
}

function voicePitchClasses(
  pitchClasses: number[],
  registerBaseMidi: number,
  voicingInversion: number
) {
  if (!pitchClasses.length) {
    return [];
  }
  const ordered = rotate(
    [...pitchClasses].sort((left, right) => left - right),
    voicingInversion
  );
  const octaveBase = Math.floor(registerBaseMidi / 12) * 12;
  let previous = registerBaseMidi - 1;
  return ordered.map((pitchClass) => {
    let midi = octaveBase + pitchClass;
    while (midi < registerBaseMidi || midi <= previous) {
      midi += 12;
    }
    previous = midi;
    return midi;
  });
}

function concreteGroupFromPitchClasses(
  group: PitchGroupValue,
  treatment: PitchRouteTreatment,
  routeId: string,
  sourceItemId: string
) {
  const sourcePitchClasses = group.pitches.map((pitch) => (pitch as PitchClassValue).pitchClass);
  const transformedPitchClasses = sourcePitchClasses.map((pitchClass) =>
    modulo((treatment.inverted ? -pitchClass : pitchClass) + treatment.transposition, 12)
  );
  const midiNotes = voicePitchClasses(
    transformedPitchClasses,
    treatment.registerBaseMidi,
    treatment.voicingInversion
  );
  const steps: Provenance[] = [];
  if (treatment.inverted) {
    steps.push({
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'invert-pitch-classes',
      parameters: { axis: 0 },
    });
  }
  if (treatment.transposition !== 0) {
    steps.push({
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'transpose-pitch-classes',
      parameters: { semitones: treatment.transposition },
    });
  }
  steps.push({
    sourceModuleInstance: routeId,
    sourceItemIds: [sourceItemId],
    transformation: 'assign-register',
    parameters: {
      registerBaseMidi: treatment.registerBaseMidi,
      voicing: 'ascending-close',
      voicingInversion: treatment.voicingInversion,
    },
  });
  const pitches: PitchValue[] = midiNotes.map((midi) => ({
    midicents: midi * 100,
    label: pitchLabel(midi * 100),
    sourceValue: midi,
  }));
  const label = pitches.map((pitch) => pitch.label).join(' ');
  return {
    value: { pitches, label } satisfies PitchGroupValue,
    label: pitches.length > 1 ? `[${label}]` : label,
    steps,
  };
}

function transformedPitchClassGroup(
  group: PitchGroupValue,
  treatment: PitchRouteTreatment,
  routeId: string,
  sourceItemId: string
) {
  const sourcePitchClasses = group.pitches.map((pitch) => (pitch as PitchClassValue).pitchClass);
  const transformedPitchClasses = sourcePitchClasses.map((pitchClass) =>
    modulo((treatment.inverted ? -pitchClass : pitchClass) + treatment.transposition, 12)
  );
  const steps: Provenance[] = [];
  if (treatment.inverted) {
    steps.push({
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'invert-pitch-classes',
      parameters: { axis: 0 },
    });
  }
  if (treatment.transposition !== 0) {
    steps.push({
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'transpose-pitch-classes',
      parameters: { semitones: treatment.transposition },
    });
  }
  const pitches: PitchClassValue[] = transformedPitchClasses.map((pitchClass) => ({
    pitchClass,
    label: pitchClassNames[pitchClass],
    sourceValue: pitchClass,
  }));
  const label = pitches.map((pitch) => pitch.label).join(' ');
  return {
    value: { pitches, label } satisfies PitchGroupValue,
    label: pitches.length > 1 ? `[${label}]` : label,
    steps,
  };
}

function transformedConcreteGroup(
  group: PitchGroupValue,
  treatment: PitchRouteTreatment,
  routeId: string,
  sourceItemId: string
) {
  const axisMidicents = treatment.inversionAxisMidi * 100;
  let pitches = group.pitches.map((pitch) => {
    const concrete = pitch as PitchValue;
    const invertedMidicents = treatment.inverted
      ? axisMidicents * 2 - concrete.midicents
      : concrete.midicents;
    const midicents = invertedMidicents + treatment.transposition * 100;
    return { ...concrete, midicents, label: pitchLabel(midicents) };
  });
  if (pitches.length > 1 && treatment.voicingInversion !== 0) {
    let previous = Number.NEGATIVE_INFINITY;
    pitches = rotate(pitches, treatment.voicingInversion).map((pitch) => {
      let midicents = pitch.midicents;
      while (midicents <= previous) {
        midicents += 1200;
      }
      previous = midicents;
      return { ...pitch, midicents, label: pitchLabel(midicents) };
    });
  }
  const steps: Provenance[] = [];
  if (treatment.inverted) {
    steps.push({
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'invert-pitches',
      parameters: { axisMidi: treatment.inversionAxisMidi },
    });
  }
  if (treatment.transposition !== 0) {
    steps.push({
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'transpose-pitches',
      parameters: { semitones: treatment.transposition },
    });
  }
  if (treatment.voicingInversion !== 0) {
    steps.push({
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'voice-inversion',
      parameters: { inversion: treatment.voicingInversion },
    });
  }
  const label = pitches.map((pitch) => pitch.label).join(' ');
  return {
    value: { pitches, label } satisfies PitchGroupValue,
    label: pitches.length > 1 ? `[${label}]` : label,
    steps,
  };
}

function midiNoteGroupFromRaw(value: unknown, base: number): PitchGroupValue {
  // An item's raw value is a single number for most numeric sources, but can also already be a
  // number[] — a chord that survived a mismatched-domain Arithmetic combination as a raw array
  // rather than a PitchGroupValue (see arithmetic.ts). Treat both as "one or more MIDI notes,"
  // each offset from `base` — a raw 0 means "the base note," not "MIDI note 0."
  const midis = Array.isArray(value) ? value.map(Number) : [Number(value)];
  const pitches: PitchValue[] = midis.map((raw) => {
    const midi = raw + base;
    const midicents = midi * 100;
    return { midicents, label: pitchLabel(midicents), sourceValue: midi };
  });
  const label = pitches.map((pitch) => pitch.label).join(' ');
  return { pitches, label: pitches.length > 1 ? `[${label}]` : label };
}

export function applyPitchRouteTreatment(
  source: DataPacket | undefined,
  treatment: PitchRouteTreatment,
  routeId = 'route:melodicization:pitches'
): DataPacket | undefined {
  if (!source || treatment.bypassed || source.kind !== 'list') {
    return source;
  }
  const isPitchDomain = source.domain === 'pitch' || source.domain === 'pitchClass';
  // A generic numeric source (e.g. Arithmetic's `integer` output) has no pitch meaning of its
  // own — nothing converts it automatically. Only an explicit "read as MIDI notes" opt-in turns
  // it into pitch material; left off, this returns the source untouched (still not `pitch`
  // domain), so a downstream consumer like Melodicization correctly errors until the user
  // deliberately converts it here.
  const readsAsMidi = !isPitchDomain && treatment.readAsMidiNotes;
  if (!isPitchDomain && !readsAsMidi) {
    return source;
  }
  const keepAsPitchClass = source.domain === 'pitchClass' && !treatment.voiceAsPitch;
  const sequenced = sequenceItems(source.items, routeId, treatment.retrograde, treatment.rotation);
  const items = sequenced.map((item) => {
    const group = readsAsMidi
      ? midiNoteGroupFromRaw(item.value, treatment.midiNoteBase)
      : asPitchGroup(item.value as PitchValue | PitchClassValue | PitchGroupValue);
    const transformed = keepAsPitchClass
      ? transformedPitchClassGroup(group, treatment, routeId, item.id)
      : source.domain === 'pitchClass'
        ? concreteGroupFromPitchClasses(group, treatment, routeId, item.id)
        : transformedConcreteGroup(group, treatment, routeId, item.id);
    const interpretStep: Provenance[] = readsAsMidi
      ? [
          {
            sourceModuleInstance: routeId,
            sourceItemIds: [item.id],
            transformation: 'read-as-midi-note',
            parameters: { base: treatment.midiNoteBase },
          },
        ]
      : [];
    return {
      ...item,
      value: transformed.value,
      label: transformed.label,
      provenance: [...item.provenance, ...interpretStep, ...transformed.steps],
    };
  });
  return {
    ...source,
    domain: keepAsPitchClass ? 'pitchClass' : 'pitch',
    encoding: keepAsPitchClass ? source.encoding : 'midicent',
    items,
    metadata: {
      ...source.metadata,
      routeTreatment: treatment,
      routeId,
      sourceDomain: source.domain,
    },
  };
}

export function applyRhythmRouteTreatment(
  source: DataPacket | undefined,
  treatment: RhythmRouteTreatment,
  routeId = 'route:melodicization:rhythm'
): DataPacket | undefined {
  if (!source || treatment.bypassed || source.kind !== 'list' || source.domain !== 'duration') {
    return source;
  }
  const sequenced = sequenceItems(source.items, routeId, treatment.retrograde, treatment.rotation);
  const items = sequenced.map((item) => {
    const scaled = Number(item.value) * treatment.durationScale;
    const scaleStep: Provenance[] =
      treatment.durationScale === 1
        ? []
        : [
            {
              sourceModuleInstance: routeId,
              sourceItemIds: [item.id],
              transformation: 'scale-durations',
              parameters: { factor: treatment.durationScale },
            },
          ];
    return {
      ...item,
      value: scaled,
      label: String(scaled),
      provenance: [...item.provenance, ...scaleStep],
    };
  });
  return {
    ...source,
    items,
    frame: source.frame
      ? {
          ...source.frame,
          extent:
            source.frame.extent === undefined
              ? undefined
              : source.frame.extent * treatment.durationScale,
          grouping: source.frame.grouping
            ? {
                ...source.frame.grouping,
                units: source.frame.grouping.units * treatment.durationScale,
                boundaries: source.frame.grouping.boundaries.map(
                  (boundary) => boundary * treatment.durationScale
                ),
              }
            : undefined,
        }
      : undefined,
    metadata: { ...source.metadata, routeTreatment: treatment, routeId },
  };
}

export function pitchTreatmentSummary(treatment: PitchRouteTreatment, source?: DataPacket) {
  if (treatment.bypassed) {
    return 'Bypassed';
  }
  const parts: string[] = [];
  if (treatment.transposition !== 0) {
    parts.push(`${treatment.transposition > 0 ? '+' : ''}${treatment.transposition} st`);
  }
  if (treatment.inverted) {
    parts.push('Invert');
  }
  if (treatment.retrograde) {
    parts.push('Retrograde');
  }
  if (treatment.rotation !== 0) {
    parts.push(`Rotate ${treatment.rotation}`);
  }
  if (source?.domain === 'pitchClass') {
    if (treatment.voiceAsPitch) {
      parts.push(`≥ MIDI ${treatment.registerBaseMidi}`);
    } else {
      parts.push('Raw pitch class');
    }
  }
  if (source && source.domain !== 'pitch' && source.domain !== 'pitchClass') {
    parts.push(
      treatment.readAsMidiNotes
        ? `Read as MIDI notes (0 = ${treatment.midiNoteBase})`
        : 'Not pitch material yet'
    );
  }
  if (treatment.voicingInversion !== 0) {
    parts.push(`Voice ${treatment.voicingInversion}`);
  }
  return parts.join(' · ') || 'Identity';
}

export function rhythmTreatmentSummary(treatment: RhythmRouteTreatment) {
  if (treatment.bypassed) {
    return 'Bypassed';
  }
  const parts: string[] = [];
  if (treatment.retrograde) {
    parts.push('Retrograde');
  }
  if (treatment.rotation !== 0) {
    parts.push(`Rotate ${treatment.rotation}`);
  }
  if (treatment.durationScale !== 1) {
    parts.push(`×${treatment.durationScale}`);
  }
  return parts.join(' · ') || 'Identity';
}

export function acceptsPitchRouteTreatment(value: unknown): value is PitchRouteTreatment {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as PitchRouteTreatment;
  return (
    typeof candidate.bypassed === 'boolean' &&
    Number.isFinite(candidate.transposition) &&
    typeof candidate.inverted === 'boolean' &&
    Number.isFinite(candidate.inversionAxisMidi) &&
    typeof candidate.retrograde === 'boolean' &&
    Number.isFinite(candidate.rotation) &&
    Number.isFinite(candidate.registerBaseMidi) &&
    Number.isFinite(candidate.voicingInversion) &&
    typeof candidate.voiceAsPitch === 'boolean' &&
    typeof candidate.readAsMidiNotes === 'boolean' &&
    Number.isFinite(candidate.midiNoteBase)
  );
}

export function acceptsRhythmRouteTreatment(value: unknown): value is RhythmRouteTreatment {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as RhythmRouteTreatment;
  return (
    typeof candidate.bypassed === 'boolean' &&
    typeof candidate.retrograde === 'boolean' &&
    Number.isFinite(candidate.rotation) &&
    Number.isFinite(candidate.durationScale)
  );
}
