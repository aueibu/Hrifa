import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packet } from '../model';
import {
  applyConversion,
  getConversion,
  pickerFor,
  registerConversion,
  reinterpretOptions,
  typesAccepting,
  type Conversion,
  type InputSpec,
} from './acceptance';
import {
  auditionRefusal,
  auditionSupport,
  blockRefs,
  chooseTypeId,
  dataBlockTypeOf,
  dataBlockTypes,
  duplicateBlock,
  getDataBlockType,
  isBlockEmpty,
  registerDataBlockType,
  validateBlock,
  type DataBlockTypeDef,
  type StoredDataBlock,
} from './registry';
import {
  blankRequest,
  collectionBlock,
  collectionTestType,
  notesTestType,
  pitchSetTestType,
  rhythmTestType,
} from './testTypes';

let removers: (() => void)[] = [];
function register(def: DataBlockTypeDef) {
  removers.push(registerDataBlockType(def));
}

beforeEach(() => {
  [pitchSetTestType, rhythmTestType, notesTestType, collectionTestType].forEach(register);
});
afterEach(() => {
  removers.forEach((remove) => remove());
  removers = [];
});

/** A desk-facing helper that never names a type: the picker list, as the desk would build it. */
function pickerRows() {
  return dataBlockTypes().map((def) => ({
    id: def.id,
    label: def.label,
    blank: def.createBlank(blankRequest),
    audition: auditionSupport(def),
  }));
}

describe('R1: a new type is one registration', () => {
  it('a generic helper sees a new type with no change', () => {
    const before = pickerRows().length;
    register({
      id: 'curve-test',
      label: 'Curve',
      payload: 'packet',
      accepts: (p) => p.kind === 'curve',
      createBlank: (request) => ({
        schemaVersion: 1,
        id: request.id,
        typeId: 'curve-test',
        name: request.name,
        createdAt: request.createdAt,
        payload: { kind: 'packet', packet: packet('curve', 'rational', []) },
      }),
    });
    const rows = pickerRows();
    expect(rows).toHaveLength(before + 1);
    const curve = rows.find((row) => row.id === 'curve-test');
    expect(curve?.label).toBe('Curve');
    expect(dataBlockTypeOf(curve!.blank)?.id).toBe('curve-test');
    expect(validateBlock(curve!.blank)).toBeNull();
  });

  it('the type is stored: a later registration never changes an existing block', () => {
    const ring = pitchSetTestType.createBlank(blankRequest);
    expect(ring.typeId).toBe('pitch-set-test');
    register({
      id: 'pitch-wide-test',
      label: 'Wide',
      payload: 'packet',
      accepts: () => true,
      createBlank: pitchSetTestType.createBlank,
    });
    expect(dataBlockTypeOf(ring)?.id).toBe('pitch-set-test');
    // accepts only chooses a type when a packet is saved: the first registered match.
    const raw = packet('list', 'pitch', []);
    expect(chooseTypeId(raw)).toBe('pitch-set-test');
  });

  it('validates a block against its stored type, and refuses a payload of the wrong kind', () => {
    const ring = pitchSetTestType.createBlank(blankRequest);
    expect(validateBlock(ring)).toBeNull();
    expect(validateBlock({ ...ring, typeId: 'rhythm-test' })).toMatch(/not a Rhythm/);
    expect(validateBlock({ ...ring, typeId: 'collection-test' })).toMatch(/holds a record/);
    expect(validateBlock({ ...ring, typeId: 'nope' })).toMatch(/no registered type/);
  });

  it('duplicates by payload: packet through the existing step, record as a deep copy', () => {
    const ring = pitchSetTestType.createBlank(blankRequest);
    const copy = duplicateBlock(ring, { id: 'c', createdAt: 'now' });
    expect(copy.name).toBe('New (variation)');
    expect(copy.typeId).toBe('pitch-set-test');
    expect(copy.lineage?.derivedFrom?.dataBlockId).toBe('new');
    const collection = collectionBlock('k', 'K', [['a', 'rhythm', 'R']]);
    const recordCopy = duplicateBlock(collection, { id: 'k2', createdAt: 'now' });
    expect(recordCopy.lineage).toBeUndefined();
    expect(recordCopy.payload).toEqual(collection.payload);
    expect(recordCopy.payload).not.toBe(collection.payload);
    expect((recordCopy.payload as { data: unknown }).data).not.toBe(
      (collection.payload as { data: unknown }).data
    );
  });

  it('empty comes from the type, with a default and an override', () => {
    expect(isBlockEmpty(pitchSetTestType.createBlank(blankRequest))).toBe(true);
    expect(isBlockEmpty(collectionBlock('k', 'K', []))).toBe(false);
    register({
      ...collectionTestType,
      id: 'strict-collection-test',
      isEmpty: () => true,
    });
    expect(
      isBlockEmpty({ ...collectionBlock('k', 'K', []), typeId: 'strict-collection-test' })
    ).toBe(true);
  });
});

describe('R2: an input accepting Pitch sets', () => {
  const toPitchSet: Conversion = {
    id: 'notes-to-pitch-set',
    from: 'notes-test',
    to: 'pitch-set-test',
    label: 'Pitch set',
    describe: 'drops the timing',
    convert: vi.fn(
      (block: StoredDataBlock): StoredDataBlock => ({
        ...pitchSetTestType.createBlank({ ...blankRequest, id: block.id, name: block.name }),
      })
    ),
  };
  const spec: InputSpec = { accepts: ['pitch-set-test'], conversions: ['notes-to-pitch-set'] };
  const ring = pitchSetTestType.createBlank({ ...blankRequest, id: 'ring', name: 'Ring A' });
  const clave = rhythmTestType.createBlank({ ...blankRequest, id: 'clave', name: 'Clave' });
  const melody = notesTestType.createBlank({ ...blankRequest, id: 'melody', name: 'Melody' });

  beforeEach(() => {
    vi.mocked(toPitchSet.convert).mockClear();
    removers.push(registerConversion(toPitchSet));
  });

  it('lists only pitch-set types exactly', () => {
    expect(typesAccepting(spec).map((def) => def.id)).toEqual(['pitch-set-test']);
    expect(pickerFor(spec, [ring, clave, melody]).exact.map((e) => e.block.id)).toEqual(['ring']);
  });

  it('lists Notes only under reinterpret, with its description; nothing converts yet', () => {
    const picker = pickerFor(spec, [ring, clave, melody]);
    expect(picker.reinterpret).toHaveLength(1);
    expect(picker.reinterpret[0].block.id).toBe('melody');
    expect(picker.reinterpret[0].conversion.describe).toBe('drops the timing');
    expect(reinterpretOptions(spec, clave)).toEqual([]);
    expect(reinterpretOptions(spec, ring)).toEqual([]);
    expect(toPitchSet.convert).not.toHaveBeenCalled();
  });

  it('an input that does not list the conversion never offers it', () => {
    const plain: InputSpec = { accepts: ['pitch-set-test'] };
    const picker = pickerFor(plain, [ring, clave, melody]);
    expect(picker.exact).toHaveLength(1);
    expect(picker.reinterpret).toEqual([]);
  });

  it('convert runs only when applied, and must produce its target type', () => {
    const chosen = reinterpretOptions(spec, melody)[0];
    const result = applyConversion(chosen, melody);
    expect(toPitchSet.convert).toHaveBeenCalledTimes(1);
    expect(result.typeId).toBe('pitch-set-test');
    expect(() => applyConversion(chosen, ring)).toThrow(/converts notes-test/);
    const bad: Conversion = { ...toPitchSet, id: 'bad', convert: (block) => block };
    expect(() => applyConversion(bad, melody)).toThrow(/must produce/);
  });

  it('a duplicate conversion id throws; the pair is registered once, not per input', () => {
    expect(() => registerConversion(toPitchSet)).toThrow(/already registered/);
    expect(getConversion('notes-to-pitch-set')).toBe(toPitchSet);
  });
});

describe('R3: audition', () => {
  it('a type without audition reports a reason', () => {
    expect(auditionSupport(rhythmTestType)).toEqual({
      supported: false,
      reason: 'Rhythm needs a pitch to be heard.',
    });
    expect(auditionSupport(pitchSetTestType)).toEqual({ supported: true });
    const bare: DataBlockTypeDef = { ...collectionTestType, noAuditionReason: undefined };
    expect(auditionSupport(bare)).toEqual({
      supported: false,
      reason: 'Collection has no audition yet.',
    });
  });

  it('A8: an empty block is refused by its type, a filled one is not', () => {
    const empty = pitchSetTestType.createBlank(blankRequest);
    expect(auditionRefusal(empty)).toMatch(/empty/);
    const filled: StoredDataBlock = {
      ...empty,
      payload: {
        kind: 'packet',
        packet: packet('list', 'pitch', [{ id: 'a', value: 6000, provenance: [] }]),
      },
    };
    expect(auditionRefusal(filled)).toBeNull();
    expect(auditionRefusal(rhythmTestType.createBlank(blankRequest))).toMatch(/needs a pitch/);
  });
});

describe('R4: record validation and registration', () => {
  it('two entries with the same role name are valid, under different slots', () => {
    const block = collectionBlock('c', 'C', [
      ['s1', 'melody', 'a'],
      ['s2', 'melody', 'b'],
    ]);
    expect(validateBlock(block)).toBeNull();
    expect(blockRefs(block).map((entry) => entry.slot)).toEqual(['s1', 's2']);
  });

  it('a missing reference is valid', () => {
    expect(
      validateBlock(collectionBlock('c', 'C', [['s1', 'rhythm', 'deleted-long-ago']]))
    ).toBeNull();
  });

  it('malformed data is refused with a reason', () => {
    expect(validateBlock(collectionBlock('c', 'C', [['s1', '', null]]))).toMatch(/role name/);
  });

  it('a duplicate id throws and leaves the first registration', () => {
    expect(() => registerDataBlockType({ ...pitchSetTestType })).toThrow(/already registered/);
    expect(getDataBlockType('pitch-set-test')).toBe(pitchSetTestType);
  });

  it('a remover frees the id', () => {
    const remove = registerDataBlockType({ ...pitchSetTestType, id: 'temp-test' });
    remove();
    expect(getDataBlockType('temp-test')).toBeUndefined();
  });
});
