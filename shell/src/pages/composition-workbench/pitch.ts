import { packet, type DataItem, type DataPacket, type Provenance } from './model';

export type PitchInputFormat = 'midi-note' | 'midicent' | 'note-name' | 'pitch-class';

export interface PitchValue {
  midicents: number;
  label: string;
  sourceValue: string | number;
  spelling?: string;
}

export interface PitchClassValue {
  pitchClass: number;
  label: string;
  sourceValue: string | number;
  spelling?: string;
}

export type PitchMaterialValue = PitchValue | PitchClassValue;

export interface PitchGroupValue {
  pitches: PitchMaterialValue[];
  label: string;
}

export interface InterpretedPitchList {
  packet: DataPacket<PitchGroupValue>;
  errors: string[];
  source: 'inline' | 'upstream';
}

export type InlinePitchGroupProvenance = Record<string, Provenance[]>;

const pitchClassByLetter: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
export const pitchClassNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function tokenizePitchGroups(value: string) {
  const groups: string[][] = [];
  const errors: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    while (cursor < value.length && /[\s,]/.test(value[cursor])) cursor += 1;
    if (cursor >= value.length) break;
    if (value[cursor] === ']') {
      errors.push(`Unexpected closing bracket at character ${cursor + 1}.`);
      cursor += 1;
      continue;
    }
    if (value[cursor] === '[') {
      const closesAt = value.indexOf(']', cursor + 1);
      if (closesAt < 0) {
        errors.push(`Chord beginning at character ${cursor + 1} is missing a closing bracket.`);
        break;
      }
      const contents = value.slice(cursor + 1, closesAt);
      if (contents.includes('[')) {
        errors.push('Nested chord brackets are not supported.');
      } else {
        const tokens = contents.split(/[\s,]+/).filter(Boolean);
        if (tokens.length) groups.push(tokens);
        else errors.push('Chord brackets must contain at least one pitch.');
      }
      cursor = closesAt + 1;
      continue;
    }
    let endsAt = cursor;
    while (endsAt < value.length && !/[\s,[\]]/.test(value[endsAt])) endsAt += 1;
    groups.push([value.slice(cursor, endsAt)]);
    cursor = endsAt;
  }
  return { groups, errors };
}

export function asPitchGroup(value: PitchMaterialValue | PitchGroupValue): PitchGroupValue {
  return typeof value === 'object' && value !== null && 'pitches' in value
    ? value
    : { pitches: [value], label: value.label };
}

function accidentalOffset(accidental = '') {
  if (accidental === '#' || accidental === '♯') return 1;
  if (accidental === 'b' || accidental === '♭') return -1;
  return 0;
}

function formatMidicents(midicents: number) {
  const midi = midicents / 100;
  const nearest = Math.round(midi);
  const pitchClass = ((nearest % 12) + 12) % 12;
  const octave = Math.floor(nearest / 12) - 1;
  const cents = Math.round((midi - nearest) * 100);
  return `${pitchClassNames[pitchClass]}${octave}${cents === 0 ? '' : ` ${cents > 0 ? '+' : ''}${cents}c`}`;
}

function parsePitchClass(token: string): PitchClassValue | string {
  const numeric = Number(token);
  if (Number.isInteger(numeric)) {
    if (numeric < 0 || numeric > 11) return `${token}: pitch-class integers must be from 0 to 11`;
    return { pitchClass: numeric, label: pitchClassNames[numeric], sourceValue: numeric };
  }
  const match = /^([A-Ga-g])([#b♯♭]?)$/.exec(token);
  if (!match) return `${token}: enter a pitch-class integer or name such as 0, C, F#, or Bb`;
  const spelling = `${match[1].toUpperCase()}${match[2]}`;
  const pitchClass =
    (pitchClassByLetter[match[1].toUpperCase()] + accidentalOffset(match[2]) + 12) % 12;
  return { pitchClass, label: spelling, sourceValue: token, spelling };
}

function parseConcretePitch(token: string, format: Exclude<PitchInputFormat, 'pitch-class'>) {
  if (format === 'note-name') {
    const match = /^([A-Ga-g])([#b♯♭]?)(-?\d+)$/.exec(token);
    if (!match) return `${token}: enter a note name with octave, such as C4, F#3, or Bb5`;
    const spelling = `${match[1].toUpperCase()}${match[2]}${match[3]}`;
    const midi =
      (Number(match[3]) + 1) * 12 +
      pitchClassByLetter[match[1].toUpperCase()] +
      accidentalOffset(match[2]);
    return {
      midicents: midi * 100,
      label: spelling,
      sourceValue: token,
      spelling,
    } satisfies PitchValue;
  }

  const value = Number(token);
  if (!Number.isFinite(value)) return `${token}: enter a finite number`;
  if (format === 'midi-note' && (value < 0 || value > 127)) {
    return `${token}: MIDI-note values must be from 0 to 127`;
  }
  const midicents = format === 'midi-note' ? value * 100 : value;
  return {
    midicents,
    label: formatMidicents(midicents),
    sourceValue: value,
  } satisfies PitchValue;
}

export function pitchFrequency(midicents: number) {
  return 440 * 2 ** ((midicents - 6900) / 1200);
}

export function previewMidicents(value: PitchMaterialValue, previewOctave: number) {
  return 'midicents' in value
    ? value.midicents
    : (previewOctave + 1) * 1200 + value.pitchClass * 100;
}

export function interpretPitchList({
  instanceId,
  format,
  inlineText,
  inlineProvenance,
  upstream,
}: {
  instanceId: string;
  format: PitchInputFormat;
  inlineText: string;
  inlineProvenance?: InlinePitchGroupProvenance;
  upstream?: DataPacket;
}): InterpretedPitchList {
  if (upstream && (upstream.domain === 'pitch' || upstream.domain === 'pitchClass')) {
    return {
      packet: {
        ...upstream,
        items: upstream.items.map((item) => ({
          ...item,
          value: asPitchGroup(item.value as PitchMaterialValue | PitchGroupValue),
        })),
      },
      errors: [],
      source: 'upstream',
    };
  }

  const tokenized = upstream ? undefined : tokenizePitchGroups(inlineText);
  const sourceItems = upstream
    ? upstream.items.map((item) => ({
        tokens: [String(item.value)],
        sourceId: item.id,
        inherited: item.provenance,
      }))
    : (tokenized?.groups ?? []).map((tokens, index) => ({
        tokens,
        sourceId: `${instanceId}:inline:${index}`,
        inherited: inlineProvenance?.[String(index)] ?? ([] as Provenance[]),
      }));
  const errors: string[] = [...(tokenized?.errors ?? [])];
  const items: DataItem<PitchGroupValue>[] = [];

  sourceItems.forEach(({ tokens, sourceId, inherited }, index) => {
    const parsed = tokens.map((token) =>
      format === 'pitch-class' ? parsePitchClass(token) : parseConcretePitch(token, format)
    );
    const groupErrors = parsed.filter((value): value is string => typeof value === 'string');
    if (groupErrors.length) {
      errors.push(...groupErrors);
      return;
    }
    const pitches = parsed as PitchMaterialValue[];
    const label = pitches.map((pitch) => pitch.label).join(' ');
    items.push({
      id: `${instanceId}:pitch-group:${index}`,
      value: { pitches, label },
      label: pitches.length > 1 ? `[${label}]` : label,
      provenance: [
        ...inherited,
        {
          sourceModuleInstance: instanceId,
          sourceItemIds: upstream ? [sourceId] : [],
          transformation: `read-as-${format}`,
          parameters: {
            sourceValues: pitches.map((pitch) => pitch.sourceValue),
            grouped: pitches.length > 1,
          },
        },
      ],
    });
  });

  if (!sourceItems.length) errors.push('Enter at least one pitch value.');
  const domain = format === 'pitch-class' ? 'pitchClass' : 'pitch';
  return {
    packet: packet(
      'list',
      domain,
      items,
      errors,
      { source: upstream ? 'upstream' : 'inline' },
      {
        role: 'pitchMaterial',
        encoding: format === 'pitch-class' ? 'chromatic-12' : format,
      }
    ),
    errors,
    source: upstream ? 'upstream' : 'inline',
  };
}
