import type { DataDomain, DataItem, DataPacket, Provenance } from './model';
import {
  pitchClassGroupLabel,
  pitchClassGroupToArray,
  pitchGroupToArray,
  type PitchClassItemValue,
  type PitchItemValue,
} from './pitch';

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
  // Off by default: a source that isn't already `list | duration | interOnset` (e.g. Arithmetic's
  // output, whatever domain it lands on) has no rhythm meaning of its own. Turning this on
  // attempts to interpret each item as a positive inter-onset duration and stamps the packet
  // `duration` domain + `interOnset` role; left off, the source passes through unconverted, so a
  // consumer that requires rhythm (Melodicization) errors until this is explicitly turned on —
  // same pattern as pitch's `readAsMidiNotes`.
  interpretAsRhythm: boolean;
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
  interpretAsRhythm: false,
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

export function isValidRhythmSource(source?: DataPacket) {
  return Boolean(source) && source!.kind === 'list' && source!.domain === 'duration' && source!.role === 'interOnset';
}

export function isRhythmRouteTreatmentIdentity(treatment: RhythmRouteTreatment, source?: DataPacket) {
  const stillInterpretsAsRhythm = source && !isValidRhythmSource(source) && treatment.interpretAsRhythm;
  return (
    !stillInterpretsAsRhythm &&
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

// Shared invert/transpose math on bare pitch-class numbers — no wrapper to unpack, since a
// pitchClass item's value is already `number | number[]`.
function transformPitchClasses(pitchClasses: number[], treatment: PitchRouteTreatment): number[] {
  return pitchClasses.map((pitchClass) =>
    modulo((treatment.inverted ? -pitchClass : pitchClass) + treatment.transposition, 12)
  );
}

function pitchClassSequenceSteps(
  treatment: PitchRouteTreatment,
  routeId: string,
  sourceItemId: string
): Provenance[] {
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
  return steps;
}

function pitchGroupLabel(value: PitchItemValue): string {
  const values = pitchGroupToArray(value);
  const label = values.map((midicents) => pitchLabel(midicents)).join(' ');
  return values.length > 1 ? `[${label}]` : label;
}

function concreteGroupFromPitchClasses(
  values: number[],
  treatment: PitchRouteTreatment,
  routeId: string,
  sourceItemId: string
) {
  const transformedPitchClasses = transformPitchClasses(values, treatment);
  const midiNotes = voicePitchClasses(
    transformedPitchClasses,
    treatment.registerBaseMidi,
    treatment.voicingInversion
  );
  const steps = [
    ...pitchClassSequenceSteps(treatment, routeId, sourceItemId),
    {
      sourceModuleInstance: routeId,
      sourceItemIds: [sourceItemId],
      transformation: 'assign-register',
      parameters: {
        registerBaseMidi: treatment.registerBaseMidi,
        voicing: 'ascending-close',
        voicingInversion: treatment.voicingInversion,
      },
    },
  ];
  const midicents = midiNotes.map((midi) => midi * 100);
  const value: PitchItemValue = midicents.length > 1 ? midicents : midicents[0];
  return { value, label: pitchGroupLabel(value), steps };
}

function transformedPitchClassGroup(
  values: number[],
  wasArray: boolean,
  treatment: PitchRouteTreatment,
  routeId: string,
  sourceItemId: string
) {
  const transformed = transformPitchClasses(values, treatment);
  const value: PitchClassItemValue = wasArray ? transformed : transformed[0];
  return {
    value,
    label: pitchClassGroupLabel(value),
    steps: pitchClassSequenceSteps(treatment, routeId, sourceItemId),
  };
}

function transformedConcreteGroup(
  values: number[],
  wasArray: boolean,
  treatment: PitchRouteTreatment,
  routeId: string,
  sourceItemId: string
) {
  const axisMidicents = treatment.inversionAxisMidi * 100;
  let midicents = values.map((concreteMidicents) => {
    const inverted = treatment.inverted
      ? axisMidicents * 2 - concreteMidicents
      : concreteMidicents;
    return inverted + treatment.transposition * 100;
  });
  if (midicents.length > 1 && treatment.voicingInversion !== 0) {
    let previous = Number.NEGATIVE_INFINITY;
    midicents = rotate(midicents, treatment.voicingInversion).map((value) => {
      let bumped = value;
      while (bumped <= previous) {
        bumped += 1200;
      }
      previous = bumped;
      return bumped;
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
  const value: PitchItemValue = wasArray ? midicents : midicents[0];
  return { value, label: pitchGroupLabel(value), steps };
}

// An item's raw value is a single number for most numeric sources, but can also already be a
// number[] — a chord that survived a mismatched-domain Arithmetic combination as a raw array.
// Treat both as "one or more MIDI notes," each offset from `base` — a raw 0 means "the base
// note," not "MIDI note 0."
function midiNoteValuesFromRaw(value: unknown, base: number): { values: number[]; wasArray: boolean } {
  const wasArray = Array.isArray(value);
  const midis = wasArray ? (value as unknown[]).map(Number) : [Number(value)];
  return { values: midis.map((raw) => (raw + base) * 100), wasArray };
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

  if (source.domain === 'pitchClass') {
    // Bare `number | number[]` items — no wrapper to unpack or rebuild. Kept as its own branch
    // rather than merged with 'pitch' below since the transform math genuinely differs (mod-12
    // wrap vs. no wrap), even though both now share the same bare-value representation.
    const items = sequenced.map((item) => {
      const raw = item.value as PitchClassItemValue;
      const values = pitchClassGroupToArray(raw);
      const transformed = keepAsPitchClass
        ? transformedPitchClassGroup(values, Array.isArray(raw), treatment, routeId, item.id)
        : concreteGroupFromPitchClasses(values, treatment, routeId, item.id);
      return {
        ...item,
        value: transformed.value,
        label: transformed.label,
        provenance: [...item.provenance, ...transformed.steps],
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

  // 'pitch' domain, or a generic numeric source being read as MIDI notes — both bare
  // `number | number[]`, same as pitchClass above.
  const items = sequenced.map((item) => {
    const { values, wasArray } = readsAsMidi
      ? midiNoteValuesFromRaw(item.value, treatment.midiNoteBase)
      : {
          values: pitchGroupToArray(item.value as PitchItemValue),
          wasArray: Array.isArray(item.value),
        };
    const transformed = transformedConcreteGroup(values, wasArray, treatment, routeId, item.id);
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
    domain: 'pitch',
    encoding: 'midicent',
    items,
    metadata: {
      ...source.metadata,
      routeTreatment: treatment,
      routeId,
      sourceDomain: source.domain,
    },
  };
}

// Domains a rhythm route is willing to attempt to interpret as inter-onset durations — plain
// numeric meanings where "duration" is a plausible reading. Deliberately excludes pitch,
// pitchClass, note, boolean, symbol, and text: those aren't "a list of durations, onsets, etc."
// and shouldn't be guessed into one. Exported so the rhythm-inlet source picker (which decides
// what's even selectable before Quick Adjust runs) filters on exactly the same domains this
// interpretation step will actually accept.
export const rhythmInterpretableDomains = new Set<DataDomain>([
  'integer',
  'rational',
  'duration',
  'onset',
  'interval',
  'cycleLength',
  'pulseCount',
  'phaseOffset',
]);

export const rhythmInterpretationError =
  'Not a valid rhythm — every item must be a positive number (integer, rational, duration, onset, ' +
  'interval, cycleLength, pulseCount, or phaseOffset domain, no chords or grouped values).';

// Attempts the explicit "read as rhythm" conversion: every item must already be a bare finite
// positive number (not an array/object — a mismatched-domain chord has no honest duration
// reading) in one of the plain numeric domains above. Any single failure rejects the whole
// conversion rather than silently dropping or clamping the bad items — the caller surfaces
// `rhythmInterpretationError` as a packet warning instead.
function interpretRhythmSource(source: DataPacket, routeId: string): DataPacket | null {
  if ((source.kind !== 'list' && source.kind !== 'value') || !rhythmInterpretableDomains.has(source.domain)) {
    return null;
  }
  if (!source.items.every((item) => typeof item.value === 'number' && Number.isFinite(item.value) && item.value > 0)) {
    return null;
  }
  const items = source.items.map((item) => ({
    ...item,
    label: String(item.value),
    provenance: [
      ...item.provenance,
      {
        sourceModuleInstance: routeId,
        sourceItemIds: [item.id],
        transformation: 'interpret-as-rhythm',
      },
    ],
  }));
  const extent = items.reduce((total, item) => total + (item.value as number), 0);
  return {
    ...source,
    kind: 'list',
    domain: 'duration',
    role: 'interOnset',
    frame: source.frame ?? { topology: 'cyclic', unit: 'pulse', extent, origin: 0 },
    items,
  };
}

export function applyRhythmRouteTreatment(
  source: DataPacket | undefined,
  treatment: RhythmRouteTreatment,
  routeId = 'route:melodicization:rhythm'
): DataPacket | undefined {
  if (!source || treatment.bypassed) {
    return source;
  }
  const alreadyRhythm = isValidRhythmSource(source);
  if (!alreadyRhythm && !treatment.interpretAsRhythm) {
    return source;
  }
  const base = alreadyRhythm ? source : interpretRhythmSource(source, routeId);
  if (!base) {
    return { ...source, warnings: [...source.warnings, rhythmInterpretationError] };
  }
  const sequenced = sequenceItems(base.items, routeId, treatment.retrograde, treatment.rotation);
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
    ...base,
    items,
    frame: base.frame
      ? {
          ...base.frame,
          extent:
            base.frame.extent === undefined ? undefined : base.frame.extent * treatment.durationScale,
          grouping: base.frame.grouping
            ? {
                ...base.frame.grouping,
                units: base.frame.grouping.units * treatment.durationScale,
                boundaries: base.frame.grouping.boundaries.map(
                  (boundary) => boundary * treatment.durationScale
                ),
              }
            : undefined,
        }
      : undefined,
    metadata: { ...base.metadata, routeTreatment: treatment, routeId },
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

export function rhythmTreatmentSummary(treatment: RhythmRouteTreatment, source?: DataPacket) {
  if (treatment.bypassed) {
    return 'Bypassed';
  }
  const parts: string[] = [];
  if (source && !isValidRhythmSource(source)) {
    parts.push(treatment.interpretAsRhythm ? 'Read as rhythm' : 'Not a rhythm yet');
  }
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
    Number.isFinite(candidate.durationScale) &&
    typeof candidate.interpretAsRhythm === 'boolean'
  );
}
