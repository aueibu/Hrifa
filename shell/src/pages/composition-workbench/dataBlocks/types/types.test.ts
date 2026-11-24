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
import { evaluateDataBlockSource } from '../../runtime/evaluators/dataBlockSource';
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
  dataBlockTypesByFamily,
  getDataBlockType,
  packetTypesAccepting,
  registerDataBlockType,
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

/** Real outputs no specific type holds: the generic List or Bank takes them (W-61), domain intact. */
const realGeneric: [string, DataPacket, 'list' | 'bank'][] = [
  [
    'an interval list (scale construction)',
    scaleSequencePacket(scaleSequence([2, 2, 1]), 's'),
    'list',
  ],
  ['an interval bank (melodic forms)', melodicFormsPacket([2, 2, 1], 'circular', 's'), 'bank'],
  ['an interval bank (scale evolution stages)', scaleEvolutionStagesPacket(evolution, 'e'), 'bank'],
  ['a pitch-class bank (scale evolution)', stagePitchClassesPacket(evolution, 0, 'e'), 'bank'],
  [
    'a duration bank (householder candidates)',
    householderCandidatesPacket(candidates, rhythm, [], 'h', 'reflect', {}),
    'bank',
  ],
  [
    'an integer or rational bank (mist voices)',
    mistVoicesPacket('m', defaultMistSettings(), mistSampling),
    'bank',
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
  it('registers Notes, Pitch set, Pitch classes, Rhythm, Values, List, Bank, Scene, Collection and Object', () => {
    expect(dataBlockTypes().map((type) => [type.id, type.family, [...type.channels]])).toEqual([
      ['notes', 'placed', ['onset', 'duration', 'pitch', 'amplitude']],
      ['pitch-set', 'pitch', ['pitch']],
      ['pitch-classes', 'pitch', ['pitch']],
      ['rhythm', 'time', ['onset']],
      ['values', 'generic', []],
      ['list', 'generic', []],
      ['bank', 'generic', []],
      ['scene', 'composite', []],
      ['collection', 'composite', []],
      ['object', 'placed', []],
    ]);
  });

  it('lists the types of a family, for browsing only', () => {
    expect(dataBlockTypesByFamily('pitch').map((type) => type.id)).toEqual([
      'pitch-set',
      'pitch-classes',
    ]);
    expect(dataBlockTypesByFamily('generic').map((type) => type.id)).toEqual([
      'values',
      'list',
      'bank',
    ]);
    expect(dataBlockTypesByFamily('composite').map((type) => type.id)).toEqual([
      'scene',
      'collection',
    ]);
  });

  it.each(samples)(
    '%s is chosen as its type; no other specific type accepts it',
    (_n, held, id) => {
      expect(chooseTypeId(held)).toBe(id);
      const specific = packetTypesAccepting(held).filter((type) => type.family !== 'generic');
      expect(specific.map((type) => type.id)).toEqual(id === 'values' ? [] : [id]);
    }
  );

  it.each(realGeneric)('captures %s as a %s with the domain intact', (_name, held, expected) => {
    expect(packetTypesAccepting(held).map((type) => type.id)).toEqual([expected]);
    expect(chooseTypeId(held)).toBe(expected);
    const captured = captureDataBlock({
      id: 'g',
      createdAt: '2026-11-24T00:00:00Z',
      name: 'g',
      packet: held,
      nodeInstance: 'x',
    });
    expect(captured.ok && captured.dataBlock.typeId).toBe(expected);
    expect(captured.ok && captured.dataBlock.payload.packet.domain).toBe(held.domain);
    expect(captured.ok && validateBlock(captured.dataBlock)).toBeNull();
  });

  it('keeps a pitch list a Pitch set and an integer list Values, though List also accepts them', () => {
    const pitches = sample('list', 'pitch', 6000);
    const integers = sample('list', 'integer', 3);
    expect(packetTypesAccepting(pitches).map((type) => type.id)).toEqual(['pitch-set', 'list']);
    expect(chooseTypeId(pitches)).toBe('pitch-set');
    expect(chooseTypeId(integers)).toBe('values');
  });

  it('puts generic last whatever the registering order', () => {
    // Registered after List, so an order-based pick would choose List; the priority must not.
    const remove = registerDataBlockType({
      id: 'late-text',
      label: 'Late text',
      family: 'pitch',
      channels: [],
      payload: 'packet',
      accepts: (held) => held.kind === 'list' && held.domain === 'text',
      createBlank: (request) => getDataBlockType('list')!.createBlank(request),
    });
    try {
      const texts = sample('list', 'text', 'a');
      expect(packetTypesAccepting(texts).map((type) => type.id)).toEqual(['list', 'late-text']);
      expect(chooseTypeId(texts)).toBe('late-text');
    } finally {
      remove();
    }
  });

  it('still accepts nothing for a kind no type describes', () => {
    expect(chooseTypeId(sample('value', 'cycleLength', 7))).toBeUndefined();
    expect(chooseTypeId(sample('tree', 'integer', 1))).toBeUndefined();
    expect(chooseTypeId(sample('layers', 'note', 1))).toBeUndefined();
    expect(chooseTypeId(sample('curve', 'rational', 1))).toBeUndefined();
    expect(chooseTypeId(sample('events', 'boolean', true))).toBeUndefined();
  });

  it('accepts every list and bank kind in some type', () => {
    for (const domain of ['boolean', 'symbol', 'interval', 'cycleLength'] as const) {
      expect(chooseTypeId(sample('list', domain, 1))).toBe('list');
      expect(chooseTypeId(sample('bank', domain, 1))).toBe('bank');
    }
  });

  it('publishes a List or Bank block through Make source unchanged', () => {
    for (const held of [sample('list', 'interval', 2), sample('bank', 'boolean', true)]) {
      const captured = captureDataBlock({
        id: 'g',
        createdAt: '2026-11-24T00:00:00Z',
        name: 'g',
        packet: held,
        nodeInstance: 'x',
      });
      const dataBlock = captured.ok ? (captured.dataBlock as PacketBlock) : undefined;
      const { outputs } = evaluateDataBlockSource(
        {},
        { dataBlock },
        { instanceId: 's', instanceLabel: 'S' }
      );
      expect(outputs).toHaveLength(1);
      expect(outputs[0].packet).toBe(dataBlock?.payload.packet);
      expect(outputs[0].packet).toMatchObject({ kind: held.kind, domain: held.domain });
    }
  });

  it('has no audition for List and Bank, and says why', () => {
    expect(getDataBlockType('list')?.noAuditionReason).toBe(
      'A List has no sound of its own; use Hear as ... or a node.'
    );
    expect(getDataBlockType('bank')?.noAuditionReason).toBe(
      'A Bank has no sound of its own; use Hear as ... or a node.'
    );
  });

  it('has an audition for the four specific types, each refusing when empty', () => {
    const withAudition = dataBlockTypes().filter((type) => type.audition);
    expect(withAudition.map((type) => type.id)).toEqual([
      'notes',
      'pitch-set',
      'pitch-classes',
      'rhythm',
    ]);
    withAudition.forEach((type) => {
      expect(type.audition?.refuse).toBeTypeOf('function');
      expect(type.audition?.build).toBeTypeOf('function');
    });
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
