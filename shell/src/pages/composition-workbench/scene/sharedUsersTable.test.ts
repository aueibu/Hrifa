import { describe, expect, it } from 'vitest';
import type { CompositionNodeInstance } from '../compositionWorkspace';
import { rationalToNumber } from '../musicalTime';
import { MELODICIZE_ID } from './modifiers';
import {
  claveBlock,
  collectionBlock,
  modifierOf,
  objectBlock,
  sceneBlock,
} from './sceneTestHelpers';
import { allUsersTable, lengthText, sharedUsersTable } from './sharedUsersTable';

const clave = (start: number, extra = {}) =>
  objectBlock('x', { primaryDataRef: { id: 'clave' }, start, ...extra });

function scene(extra: ReturnType<typeof objectBlock>[] = []) {
  const withId = (id: string, start: number, name: string) => ({
    ...clave(start),
    id,
    name,
  });
  return [
    sceneBlock('s', 'root'),
    collectionBlock('root', ['verse', 'chorus', 'solo']),
    collectionBlock('verse', ['late', 'kid'], {}, 'Verse'),
    collectionBlock('chorus', ['early'], {}, 'Chorus'),
    collectionBlock('solo', ['mod'], {}, 'Solo'),
    claveBlock(),
    withId('late', 16, 'Chords (late)'),
    withId('early', 0, 'Melody'),
    objectBlock('kid', { parentRef: { id: 'late' }, primaryDataRef: { id: 'other' } }, 'Kid'),
    objectBlock(
      'mod',
      { modifiers: [modifierOf('m1', MELODICIZE_ID, { pitches: 'clave' })] },
      'Modded'
    ),
    ...extra,
  ];
}

describe('sharedUsersTable (L5)', () => {
  it('lists each object user with its collection, sorted by world start', () => {
    const rows = sharedUsersTable({ dataBlocks: scene(), instances: [] }, 'clave', 's');
    expect(rows.map((row) => [row.id, row.collection, rationalToNumber(row.start)])).toEqual([
      ['early', 'Chorus', 0],
      ['late', 'Verse', 16],
    ]);
    expect(rows.every((row) => row.kind === 'object')).toBe(true);
    expect(rationalToNumber(rows[0].duration)).toBe(4);
  });

  it('three sharers in two collections are sorted by start', () => {
    const mid = { ...clave(8), id: 'mid', name: 'Mid' };
    const blocks = scene([mid]);
    blocks[2] = collectionBlock('verse', ['late', 'kid', 'mid'], {}, 'Verse');
    const rows = sharedUsersTable({ dataBlocks: blocks, instances: [] }, 'clave', 's');
    expect(rows.map((row) => row.id)).toEqual(['early', 'mid', 'late']);
    expect(rows.map((row) => row.collection)).toEqual(['Chorus', 'Verse', 'Verse']);
  });

  it('a child start is counted from the parent (world start)', () => {
    const blocks = scene();
    blocks[8] = objectBlock(
      'kid',
      { parentRef: { id: 'late' }, primaryDataRef: { id: 'clave' }, start: 2 },
      'Kid'
    );
    const rows = sharedUsersTable({ dataBlocks: blocks, instances: [] }, 'clave', 's');
    expect(rows.find((row) => row.id === 'kid')).toMatchObject({ collection: 'Verse' });
    expect(rationalToNumber(rows.find((row) => row.id === 'kid')!.start)).toBe(18);
  });

  it('a desk node comes after the objects; a parent or modifier user is not a row', () => {
    const node = {
      id: 'n1',
      nodeId: 'data-block-source',
      dataBlockId: 'clave',
    } as unknown as CompositionNodeInstance;
    const rows = sharedUsersTable({ dataBlocks: scene(), instances: [node] }, 'clave', 's');
    expect(rows.map((row) => row.kind)).toEqual(['object', 'object', 'desk']);
    expect(rows.some((row) => row.id === 'mod' || row.id === 'kid')).toBe(false);
    expect(rows[2].collection).toBe('Desk');
  });
});

describe('allUsersTable (L5b, the Desk card)', () => {
  it('every user entry is a row with its entry, objects by start, then the desk node', () => {
    const node = {
      id: 'n1',
      nodeId: 'data-block-source',
      dataBlockId: 'clave',
    } as unknown as CompositionNodeInstance;
    const rows = allUsersTable({ dataBlocks: scene(), instances: [node] }, 'clave');
    // The modifier reference of "mod" is a row here (Make single user acts on it); not in the Properties table.
    expect(rows.map((row) => [row.id, row.kind, row.collection])).toEqual([
      ['early', 'object', 'Chorus'],
      ['mod', 'object', 'Solo'],
      ['late', 'object', 'Verse'],
      ['n1', 'desk', 'Desk'],
    ]);
    expect(rows.every((row) => row.entry !== undefined)).toBe(true);
  });
});

describe('lengthText', () => {
  const q = (numerator: number, denominator = 1) => ({ numerator, denominator });
  it('writes bars, then beats, then a reduced fraction of a beat', () => {
    expect(lengthText(q(8), '4/4')).toBe('2 bars');
    expect(lengthText(q(4), '4/4')).toBe('1 bar');
    expect(lengthText(q(6), '4/4')).toBe('1 bar 2 beats');
    expect(lengthText(q(1), '4/4')).toBe('1 beat');
    expect(lengthText(q(1, 2), '4/4')).toBe('1/2 beat');
    expect(lengthText(q(9, 2), '4/4')).toBe('1 bar 1/2 beat');
    expect(lengthText(q(3, 2), '4/4')).toBe('1 1/2 beats');
  });
});
