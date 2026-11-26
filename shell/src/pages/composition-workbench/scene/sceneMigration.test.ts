import { describe, expect, it } from 'vitest';
import { validateBlock, type StoredDataBlock } from '../dataBlocks/registry';
import { rational, rationalToNumber } from '../musicalTime';
import { evaluateScene } from './evaluateScene';
import { migrateStoredBlocks } from './sceneMigration';
import { claveBlock, collectionBlock, pitchSetBlock, sceneBlock } from './sceneTestHelpers';
import { collectionDataOf, objectDataOf, objectWorldStart, type ObjectData } from './sceneTypes';

/**
 * Migration back to one placement per object (W-77; `SCENARIOS.strips.md` row 12 reversed). A stored
 * W-75 object holds `strips`; the first unwraps into the same id, extra strips become new objects
 * `<id>:<stripId>` in the same collection right after it, and `parentStrip` becomes `parentRef`.
 */

interface RawStrip {
  id: string;
  dataRef?: { id: string } | null;
  start?: unknown;
  duration?: unknown;
  mapping?: string;
  contentOffset?: unknown;
  modifiers?: unknown[];
  mute?: boolean;
  parentStrip?: { objectId: string; stripId: string } | null;
}

const strip = (patch: RawStrip) => ({
  dataRef: null,
  start: rational(0),
  duration: rational(4),
  mapping: 'loop',
  contentOffset: rational(0),
  modifiers: [],
  mute: false,
  parentStrip: null,
  ...patch,
});

const w75Object = (
  id: string,
  strips: RawStrip[],
  patch: { mute?: boolean; registerSpan?: unknown } = {},
  name = id
) => ({
  schemaVersion: 2,
  id,
  typeId: 'object',
  name,
  createdAt: '2026-11-24T00:00:00Z',
  payload: {
    kind: 'record',
    data: {
      registerSpan: { lowMc: 0, highMc: 12700 },
      mute: false,
      ...patch,
      strips: strips.map(strip),
    },
  },
});

const oldObject = (id: string, patch: Record<string, unknown> = {}, name = id) => ({
  schemaVersion: 2,
  id,
  typeId: 'object',
  name,
  createdAt: '2026-11-24T00:00:00Z',
  payload: {
    kind: 'record',
    data: {
      parentRef: null,
      timeSpan: { start: rational(0), duration: rational(4) },
      registerSpan: { lowMc: 0, highMc: 12700 },
      primaryDataRef: null,
      mapping: 'loop',
      modifiers: [],
      mute: false,
      ...patch,
    },
  },
});

const modifier = {
  id: 'm1',
  type: 'melodicize',
  mute: false,
  params: {},
  refs: { pitches: { id: 'P' } },
};

const stored = (objects: unknown[], members?: string[]) =>
  [
    claveBlock(),
    pitchSetBlock('P', [6000]),
    ...objects,
    collectionBlock('root', members ?? objects.map((object) => (object as { id: string }).id)),
    sceneBlock('scene', 'root'),
  ] as unknown[];

const migrated = (list: unknown[]) => migrateStoredBlocks(list) as StoredDataBlock[];
const find = (list: StoredDataBlock[], id: string) => list.find((block) => block.id === id)!;
const data = (list: StoredDataBlock[], id: string) => objectDataOf(find(list, id))!;
const members = (list: StoredDataBlock[]) =>
  collectionDataOf(find(list, 'root'))!.memberRefs.map((ref) => ref.id);
const starts = (list: StoredDataBlock[]) =>
  evaluateScene(list, 'scene').plan.events.map((event) => rationalToNumber(event.at.quarterNotes));

describe('a stored object with ONE strip unwraps into the same object', () => {
  const raw = () =>
    stored([
      w75Object(
        'o',
        [
          {
            id: 's1',
            dataRef: { id: 'clave' },
            start: rational(2),
            duration: rational(8),
            mapping: 'one-shot',
            contentOffset: rational(1),
            modifiers: [modifier],
            mute: true,
          },
        ],
        { mute: false },
        'Clave'
      ),
    ]);

  it('keeps the id and the name, moves the strip fields onto the object, and is valid', () => {
    const list = migrated(raw());
    expect(validateBlock(find(list, 'o'))).toBeNull();
    expect(find(list, 'o').name).toBe('Clave');
    expect(data(list, 'o')).toEqual({
      parentRef: null,
      timeSpan: { start: rational(2), duration: rational(8) },
      contentOffset: rational(1),
      registerSpan: { lowMc: 0, highMc: 12700 },
      registerMapping: 'show',
      primaryDataRef: { id: 'clave' },
      mapping: 'one-shot',
      modifiers: [modifier],
      mute: true,
    });
    expect(members(list)).toEqual(['o']);
  });

  it('is not valid before it is migrated (why it runs before validation)', () => {
    expect(validateBlock(raw()[2] as StoredDataBlock)).not.toBeNull();
  });

  it('plays the clave from its strip start: one-shot, offset 1 trims the first attack', () => {
    const list = migrated(
      stored([
        w75Object('o', [
          {
            id: 's1',
            dataRef: { id: 'clave' },
            start: rational(2),
            duration: rational(8),
            mapping: 'one-shot',
            contentOffset: rational(1),
          },
        ]),
      ])
    );
    // Clave attacks at 0, 3/4, 3/2, 5/2, 3 quarters; the data begins at start - offset = 1, so the
    // attacks fall at 1, 1.75, 2.5, 3.5, 4 and the first two are before the object's start.
    expect(starts(list)).toEqual([2.5, 3.5, 4]);
  });

  it('the object mute stays and a muted strip silences the object', () => {
    expect(data(migrated(raw()), 'o').mute).toBe(true);
    const muted = migrated(stored([w75Object('o', [{ id: 's1' }], { mute: true })]) as unknown[]);
    expect(data(muted, 'o').mute).toBe(true);
  });
});

describe('a stored object with three strips becomes three objects in order', () => {
  const raw = () =>
    stored(
      [
        w75Object(
          'O',
          [
            { id: 'a', dataRef: { id: 'clave' } },
            { id: 'b', start: rational(4), mapping: 'stretch' },
            { id: 'c', start: rational(8), duration: rational(2), dataRef: { id: 'clave' } },
          ],
          { registerSpan: { lowMc: 3600, highMc: 7200 } },
          'Bass'
        ),
        w75Object('K', [
          {
            id: 'k',
            start: rational(1),
            dataRef: { id: 'clave' },
            parentStrip: { objectId: 'O', stripId: 'b' },
          },
        ]),
      ],
      ['O', 'K']
    );

  it('extra strips get the ids <object>:<strip>, unique names, and sit right after the original', () => {
    const list = migrated(raw());
    expect(members(list)).toEqual(['O', 'O:b', 'O:c', 'K']);
    expect(find(list, 'O:b').name).toBe('Bass 2');
    expect(find(list, 'O:c').name).toBe('Bass 3');
    for (const id of ['O', 'O:b', 'O:c', 'K']) {
      expect(validateBlock(find(list, id))).toBeNull();
    }
  });

  it('each new object carries its strip fields and the object register span', () => {
    const list = migrated(raw());
    expect(data(list, 'O:b')).toMatchObject({
      timeSpan: { start: rational(4), duration: rational(4) },
      mapping: 'stretch',
      primaryDataRef: null,
      registerSpan: { lowMc: 3600, highMc: 7200 },
    });
    expect(data(list, 'O:c')).toMatchObject({
      timeSpan: { start: rational(8), duration: rational(2) },
      primaryDataRef: { id: 'clave' },
    });
  });

  it('a child strip of strip 2 is parented to the object that now holds strip 2', () => {
    const list = migrated(raw());
    expect(data(list, 'K').parentRef).toEqual({ id: 'O:b' });
    expect(rationalToNumber(objectWorldStart(list, 'K')!)).toBe(5);
    expect(data(list, 'O').parentRef).toBeNull();
  });

  it('a name already taken gets a .001 suffix', () => {
    const list = migrated(
      stored(
        [w75Object('O', [{ id: 'a' }, { id: 'b' }], {}, 'Bass'), oldObject('X', {}, 'Bass 2')],
        ['O', 'X']
      )
    );
    expect(find(list, 'O:b').name).toBe('Bass 2.001');
  });
});

describe('an object with no strips becomes an Empty', () => {
  it('no data, start 0, 4 quarters, Loop, register span kept', () => {
    const list = migrated(stored([w75Object('E', [], { registerSpan: { lowMc: 1, highMc: 2 } })]));
    expect(validateBlock(find(list, 'E'))).toBeNull();
    expect(data(list, 'E')).toEqual({
      parentRef: null,
      timeSpan: { start: rational(0), duration: rational(4) },
      contentOffset: rational(0),
      registerSpan: { lowMc: 1, highMc: 2 },
      registerMapping: 'show',
      primaryDataRef: null,
      mapping: 'loop',
      modifiers: [],
      mute: false,
    });
  });
});

describe('parents that are missing or circular become null', () => {
  it('a parent strip that does not exist, or whose object is gone', () => {
    const list = migrated(
      stored([
        w75Object('A', [{ id: 'a', parentStrip: { objectId: 'A', stripId: 'nope' } }]),
        w75Object('B', [{ id: 'b', parentStrip: { objectId: 'gone', stripId: 'b' } }]),
      ])
    );
    expect(data(list, 'A').parentRef).toBeNull();
    expect(data(list, 'B').parentRef).toBeNull();
  });

  it('a loop between two objects, and a strip under itself, both end up with no parent', () => {
    const list = migrated(
      stored([
        w75Object('X', [{ id: 'x', parentStrip: { objectId: 'Y', stripId: 'y' } }]),
        w75Object('Y', [{ id: 'y', parentStrip: { objectId: 'X', stripId: 'x' } }]),
        w75Object('S', [{ id: 's', parentStrip: { objectId: 'S', stripId: 's' } }]),
      ])
    );
    expect(data(list, 'X').parentRef).toBeNull();
    expect(data(list, 'Y').parentRef).toBeNull();
    expect(data(list, 'S').parentRef).toBeNull();
    for (const id of ['X', 'Y', 'S']) {
      expect(validateBlock(find(list, id))).toBeNull();
    }
  });

  it('a strip under another strip of the SAME object nests the new objects', () => {
    const list = migrated(
      stored([
        w75Object('O', [
          { id: 'a' },
          { id: 'b', start: rational(2), parentStrip: { objectId: 'O', stripId: 'a' } },
        ]),
      ])
    );
    expect(data(list, 'O:b').parentRef).toEqual({ id: 'O' });
  });
});

describe('old shapes and idempotence', () => {
  it('an object from before strips is already valid; only a missing contentOffset is added', () => {
    const old = oldObject('o', { parentRef: { id: 'p' }, mapping: 'stretch' });
    const list = migrated(stored([old, oldObject('p')]));
    expect(validateBlock(find(list, 'o'))).toBeNull();
    expect(data(list, 'o')).toMatchObject({
      parentRef: { id: 'p' },
      mapping: 'stretch',
      contentOffset: rational(0),
    });
  });

  it('an object with no registerMapping gets show and keeps its span; a stored value is kept', () => {
    const span = { lowMc: 3600, highMc: 7200 };
    const list = migrated(
      stored([
        oldObject('o', { contentOffset: rational(0), registerSpan: span }),
        oldObject('f', { contentOffset: rational(0), registerMapping: 'fold' }),
      ])
    );
    expect(validateBlock(find(list, 'o'))).toBeNull();
    expect(data(list, 'o')).toMatchObject({ registerMapping: 'show', registerSpan: span });
    expect(data(list, 'f').registerMapping).toBe('fold');
  });

  it('an object already in the new shape keeps its identity', () => {
    const once = migrated(
      stored([oldObject('o', { contentOffset: rational(1, 2), registerMapping: 'show' })])
    );
    const twice = migrateStoredBlocks(once);
    expect(twice).toBe(once);
  });

  it('running twice gives the same list as running once', () => {
    const list = stored([
      w75Object('O', [{ id: 'a' }, { id: 'b' }, { id: 'c' }], {}, 'Bass'),
      w75Object('K', [{ id: 'k', parentStrip: { objectId: 'O', stripId: 'c' } }]),
      w75Object('E', []),
    ]);
    const once = migrated(list);
    expect(migrateStoredBlocks(once)).toEqual(once);
    expect(members(once)).toEqual(['O', 'O:b', 'O:c', 'K', 'E']);
  });

  it('non-object entries and a list with nothing to migrate pass through untouched', () => {
    const list = stored([]);
    expect(migrateStoredBlocks(list)).toBe(list);
    const odd = [null, 3, { id: 'x', typeId: 'object', payload: 'no' }];
    expect(migrateStoredBlocks(odd)).toBe(odd);
  });

  it('plays the same scene after the unwrap as the one-placement scene would', () => {
    const raw = stored([
      w75Object('O', [{ id: 'a', dataRef: { id: 'clave' }, start: rational(4) }]),
    ]);
    const direct = stored([
      oldObject('O', {
        primaryDataRef: { id: 'clave' },
        timeSpan: { start: rational(4), duration: rational(4) },
      }),
    ]);
    expect(starts(migrated(raw))).toEqual(starts(migrated(direct)));
  });
});

// `ObjectData` is the one-placement shape the unwrap must produce.
const shape: (keyof ObjectData)[] = [
  'parentRef',
  'timeSpan',
  'contentOffset',
  'registerSpan',
  'registerMapping',
  'primaryDataRef',
  'mapping',
  'modifiers',
  'mute',
];
describe('the unwrapped shape', () => {
  it('has exactly the ObjectData fields', () => {
    const list = migrated(stored([w75Object('o', [{ id: 's' }])]));
    expect(Object.keys(data(list, 'o')).sort()).toEqual([...shape].sort());
  });
});
