import { describe, expect, it } from 'vitest';
import { captureDataBlock, convertDataBlockToPitchClass } from '../../dataBlock';
import {
  householderCandidatesPacket,
  householderSelectedPacket,
  type HouseholderCandidate,
} from '../../householder';
import { melodicize } from '../../melodicization';
import { defaultMistSettings, mistChordsPacket, mistVoicesPacket, sampleMist } from '../../mist';
import { packet, type DataKind, type DataDomain, type DataPacket } from '../../model';
import { musicalDuration, rational, rationalFromNumber } from '../../musicalTime';
import { generatePairComposition, pairCompositionDurationPacket } from '../../pairComposition';
import { interpretPitchList } from '../../pitch';
import {
  melodicFormsPacket,
  scalePitchClassPacket,
  scaleSequence,
  scaleSequencePacket,
} from '../../scaleConstruction';
import {
  evolveScale,
  scaleEvolutionStagesPacket,
  stagePitchClassesPacket,
} from '../../scaleEvolution';
import {
  chooseTypeId,
  dataBlockTypes,
  packetTypesAccepting,
  validateBlock,
  type BlankRequest,
  type PacketBlock,
} from '../registry';
import './index';

const item = (id: string, value: unknown) => ({ id, value, provenance: [] });

const note = (id: string) =>
  item(id, {
    onset: { quarterNotes: rationalFromNumber(0) },
    interOnset: musicalDuration(1),
    duration: musicalDuration(1),
    pitches: [6000],
    velocity: 1,
  });

const sample = (kind: DataKind, domain: DataDomain, value: unknown): DataPacket =>
  packet(kind, domain, [item('a', value)]);

const pitchList = (format: 'midi-note' | 'note-name', inlineText: string) =>
  interpretPitchList({ instanceId: 'pitch-list', format, inlineText }).packet;

const rhythm = pairCompositionDurationPacket(generatePairComposition(3, 2, 'balancing'), 'pair');

const melody = melodicize({
  instanceId: 'melodicization',
  rhythm,
  pitches: pitchList('midi-note', '60, 62'),
  allocation: 'cycle',
  pulseUnit: musicalDuration(1, 4),
  articulationPercent: 100,
});

const evolution = evolveScale([3, 2, 2, 1, 1, 3]);
const candidates: HouseholderCandidate[] = [
  { durations: [1, 2], units: [1, 2], score: 0, movement: 0, isInput: true },
  { durations: [2, 1], units: [2, 1], score: 1, movement: 1, isInput: false },
];
const mistSampling = sampleMist(defaultMistSettings());

/** The packets a node really publishes that a type accepts, and the type each must land in. */
const realSamples: [string, DataPacket, string][] = [
  ['a pair-composition rhythm', rhythm, 'rhythm'],
  [
    'a householder pick',
    householderSelectedPacket(candidates[1], rhythm, [], 'h', 'reflect', {}),
    'rhythm',
  ],
  [
    'a realized scale (pitch-class list)',
    scalePitchClassPacket([2, 2, 1, 2, 2, 2, 1], 0, 's'),
    'pitch-classes',
  ],
  ['a pitch list in MIDI notes', pitchList('midi-note', '60, 62'), 'pitch-set'],
  ['a pitch list in note names', pitchList('note-name', 'C4, D4'), 'pitch-set'],
  ['mist chords', mistChordsPacket('m', defaultMistSettings(), mistSampling), 'values'],
  ['a melodicization', melody.packet, 'notes'],
];

/** Real outputs no type holds today (human 2026-11-24: lists and banks of intervals are on hold). */
const realUnaccepted: [string, DataPacket][] = [
  ['an interval list (scale construction)', scaleSequencePacket(scaleSequence([2, 2, 1]), 's')],
  ['an interval bank (melodic forms)', melodicFormsPacket([2, 2, 1], 'circular', 's')],
  ['an interval bank (scale evolution stages)', scaleEvolutionStagesPacket(evolution, 'e')],
  ['a pitch-class bank (scale evolution)', stagePitchClassesPacket(evolution, 0, 'e')],
  [
    'a duration bank (householder candidates)',
    householderCandidatesPacket(candidates, rhythm, [], 'h', 'reflect', {}),
  ],
  [
    'an integer or rational bank (mist voices)',
    mistVoicesPacket('m', defaultMistSettings(), mistSampling),
  ],
];

/** Hand-built samples, only for kinds no producer emits. */
const samples: [string, DataPacket, string][] = [
  ...realSamples,
  ['a melody', packet('events', 'note', [note('n1')]), 'notes'],
  ['a pitch set', sample('list', 'pitch', 6000), 'pitch-set'],
  ['pitch classes (list)', sample('list', 'pitchClass', 4), 'pitch-classes'],
  [
    'pitch classes (events, as the desk conversion makes them)',
    sample('events', 'pitchClass', { pitchClasses: [0, 4, 7] }),
    'pitch-classes',
  ],
  ['a rhythm', sample('list', 'duration', 1), 'rhythm'],
  ['a rhythm pattern', sample('list', 'rhythmPattern', 1), 'rhythm'],
  ['integer values', sample('list', 'integer', 3), 'values'],
  ['rational values', sample('list', 'rational', rational(1, 3)), 'values'],
  ['a single value', sample('value', 'integer', 3), 'values'],
];

describe('the built-in packet types', () => {
  it('registers Notes, Pitch set, Pitch classes, Rhythm and Values', () => {
    expect(dataBlockTypes().map((type) => type.id)).toEqual([
      'notes',
      'pitch-set',
      'pitch-classes',
      'rhythm',
      'values',
    ]);
  });

  it.each(samples)('%s is accepted by exactly one type', (_name, sampled, expected) => {
    expect(packetTypesAccepting(sampled).map((type) => type.id)).toEqual([expected]);
    expect(chooseTypeId(sampled)).toBe(expected);
  });

  it.each(realUnaccepted)(
    'has no type yet for %s (named, so adding one is a deliberate change)',
    (_name, unaccepted) => {
      expect(packetTypesAccepting(unaccepted)).toEqual([]);
      expect(chooseTypeId(unaccepted)).toBeUndefined();
    }
  );

  it('accepts nothing for a packet no type describes', () => {
    expect(chooseTypeId(sample('value', 'cycleLength', 7))).toBeUndefined();
    expect(chooseTypeId(sample('list', 'boolean', true))).toBeUndefined();
  });

  it('has an audition only for Notes, which refuses when empty', () => {
    const withAudition = dataBlockTypes().filter((type) => type.audition);
    expect(withAudition.map((type) => type.id)).toEqual(['notes']);
    expect(withAudition[0].audition?.refuse).toBeTypeOf('function');
  });

  it('makes a blank of every type that its own type validates', () => {
    const request: BlankRequest = {
      id: 'b',
      createdAt: '2026-11-24T00:00:00Z',
      name: 'b',
      length: rational(4),
    };
    for (const type of dataBlockTypes()) {
      const block = type.createBlank(request);
      expect(block.typeId).toBe(type.id);
      expect(validateBlock(block)).toBeNull();
    }
  });

  it('stores the chosen type on capture and on the pitch-class conversion', () => {
    const captured = captureDataBlock({
      id: 'c',
      createdAt: '2026-11-24T00:00:00Z',
      name: 'c',
      packet: packet('events', 'note', [note('n1')]),
      nodeInstance: 'x',
    });
    expect(captured.ok && captured.dataBlock.typeId).toBe('notes');
    const rhythm = captureDataBlock({
      id: 'r',
      createdAt: '2026-11-24T00:00:00Z',
      name: 'r',
      packet: sample('list', 'duration', 1),
      nodeInstance: 'x',
    });
    expect(rhythm.ok && rhythm.dataBlock.typeId).toBe('rhythm');
    const refused = captureDataBlock({
      id: 'z',
      createdAt: '2026-11-24T00:00:00Z',
      name: 'z',
      packet: sample('value', 'cycleLength', 7),
      nodeInstance: 'x',
    });
    expect(refused).toMatchObject({ ok: false });
    if (captured.ok) {
      const converted = convertDataBlockToPitchClass(captured.dataBlock as PacketBlock, {
        id: 'p',
        createdAt: '2026-11-24T00:00:00Z',
      });
      expect(converted.ok && converted.dataBlock.typeId).toBe('pitch-classes');
    }
  });
});
