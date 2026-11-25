import { describe, expect, it } from 'vitest';
import { validateBlock, type StoredDataBlock } from '../dataBlocks/registry';
import { rational, rationalToNumber } from '../musicalTime';
import { evaluateScene } from './evaluateScene';
import { MIGRATED_STRIP_ID, migrateStoredBlocks } from './sceneMigration';
import { claveBlock, collectionBlock, pitchSetBlock, sceneBlock } from './sceneTestHelpers';
import { objectDataOf, stripWorldStart } from './sceneTypes';

/**
 * Scenario row 12 (W-75): the stored scene from before strips opens by migrating on load. An old object
 * is the shape of W-66 to W-74: `parentRef`, `timeSpan`, `primaryDataRef`, `mapping`, `modifiers`, an
 * optional `contentOffset` and `mute`, all on the object.
 */

interface OldObject {
  parentRef?: { id: string } | null;
  timeSpan?: { start: unknown; duration: unknown };
  contentOffset?: unknown;
  primaryDataRef?: { id: string } | null;
  mapping?: string;
  modifiers?: unknown[];
  mute?: boolean;
}

const oldObject = (id: string, patch: OldObject = {}, name = id) => ({
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

const clave = (patch: OldObject = {}) =>
  oldObject('o', { primaryDataRef: { id: 'clave' }, ...patch }, 'Clave');

const stored = (...objects: unknown[]) =>
  [
    claveBlock(),
    pitchSetBlock('P', [6000]),
    ...objects,
    collectionBlock(
      'root',
      objects.map((object) => (object as { id: string }).id)
    ),
    sceneBlock('scene', 'root'),
  ] as unknown[];

const migrated = (list: unknown[]) => migrateStoredBlocks(list) as StoredDataBlock[];
const stripOfObject = (list: StoredDataBlock[], id: string) =>
  objectDataOf(list.find((block) => block.id === id))!.strips[0];

describe('migration on load: an old object becomes an object with ONE strip', () => {
  it('an old-shape object is not valid until it is migrated (why it runs before validation)', () => {
    const raw = stored(clave())[2] as StoredDataBlock;
    expect(validateBlock(raw)).not.toBeNull();
    const [, , object] = migrated(stored(clave()));
    expect(validateBlock(object)).toBeNull();
  });

  it('carries the start, duration, mapping, offset, data, modifiers and the object mute', () => {
    const list = migrated(
      stored(
        clave({
          timeSpan: { start: rational(4), duration: rational(8) },
          mapping: 'stretch',
          contentOffset: rational(-1),
          modifiers: [modifier],
          mute: true,
        })
      )
    );
    const object = objectDataOf(list.find((block) => block.id === 'o'))!;
    expect(object.mute).toBe(true);
    expect(object.registerSpan).toEqual({ lowMc: 0, highMc: 12700 });
    expect(object.strips).toEqual([
      {
        id: MIGRATED_STRIP_ID,
        dataRef: { id: 'clave' },
        start: rational(4),
        duration: rational(8),
        mapping: 'stretch',
        contentOffset: rational(-1),
        modifiers: [modifier],
        mute: false,
        parentStrip: null,
      },
    ]);
    expect(list.every((block) => validateBlock(block) === null)).toBe(true);
  });

  it('an object saved before the content offset gets offset 0; a blank object stays a silent strip', () => {
    const list = migrated(stored(oldObject('e')));
    expect(stripOfObject(list, 'e')).toMatchObject({ contentOffset: rational(0), dataRef: null });
  });

  it('plays as before: the clave loops from 4 to 12 (nothing else changes)', () => {
    const list = migrated(
      stored(clave({ timeSpan: { start: rational(4), duration: rational(8) } }))
    );
    const { plan, warnings } = evaluateScene(list, 'scene');
    expect(warnings).toEqual([]);
    expect(plan.events.map((event) => rationalToNumber(event.at.quarterNotes))).toEqual([
      4, 4.75, 5.5, 6.5, 7, 8, 8.75, 9.5, 10.5, 11,
    ]);
    expect(rationalToNumber(plan.duration.quarterNotes)).toBe(12);
  });

  it('the parent object becomes "parent strip = that object first strip", keeping the world start', () => {
    const list = migrated(
      stored(
        oldObject('verse', { timeSpan: { start: rational(16), duration: rational(64) } }),
        clave({
          parentRef: { id: 'verse' },
          timeSpan: { start: rational(4), duration: rational(4) },
        })
      )
    );
    expect(stripOfObject(list, 'o').parentStrip).toEqual({
      objectId: 'verse',
      stripId: MIGRATED_STRIP_ID,
    });
    expect(rationalToNumber(stripWorldStart(list, 'o', MIGRATED_STRIP_ID)!)).toBe(20);
  });

  it('a parent that is already new-shape is named by its own first strip id', () => {
    const [, , newer] = migrated(stored(oldObject('newer')));
    const renamed = {
      ...newer,
      payload: {
        kind: 'record',
        data: {
          ...(newer.payload as { data: { strips: unknown[] } }).data,
          strips: [
            { ...(newer.payload as { data: { strips: object[] } }).data.strips[0], id: 'zz' },
          ],
        },
      },
    };
    const list = migrated([renamed, clave({ parentRef: { id: 'newer' } })]);
    expect(stripOfObject(list, 'o').parentStrip).toEqual({ objectId: 'newer', stripId: 'zz' });
  });

  it('a missing parent, a parent that is not an object, and a parent loop become no parent', () => {
    const list = migrated(
      stored(
        oldObject('lost', { parentRef: { id: 'nowhere' } }),
        oldObject('under-collection', { parentRef: { id: 'root' } }),
        oldObject('a', { parentRef: { id: 'b' } }),
        oldObject('b', { parentRef: { id: 'a' } }),
        oldObject('self', { parentRef: { id: 'self' } }),
        oldObject('tail', { parentRef: { id: 'a' } })
      )
    );
    expect(
      ['lost', 'under-collection', 'a', 'b', 'self'].map(
        (id) => stripOfObject(list, id).parentStrip
      )
    ).toEqual([null, null, null, null, null]);
    // A child of a loop is not in the loop: it stays under its parent, which is now a root.
    expect(stripOfObject(list, 'tail').parentStrip).toEqual({
      objectId: 'a',
      stripId: MIGRATED_STRIP_ID,
    });
    expect(list.every((block) => validateBlock(block) === null)).toBe(true);
  });

  it('is idempotent, leaves other blocks the same objects, and does not touch new-shape objects', () => {
    const once = migrated(stored(clave(), oldObject('verse')));
    const twice = migrateStoredBlocks(once);
    expect(twice).toEqual(once);
    twice.forEach((block, index) => expect(block).toBe(once[index]));
    const raw = stored(clave());
    const out = migrateStoredBlocks(raw);
    expect(out[0]).toBe(raw[0]);
    expect(out[1]).toBe(raw[1]);
    expect(out[3]).toBe(raw[3]);
    expect(out[4]).toBe(raw[4]);
  });

  it('ignores junk entries instead of throwing (validation reports them afterward)', () => {
    const junk = [
      null,
      3,
      'x',
      { typeId: 'object' },
      { typeId: 'object', payload: { kind: 'record', data: 4 } },
    ];
    expect(migrateStoredBlocks(junk)).toEqual(junk);
  });
});
