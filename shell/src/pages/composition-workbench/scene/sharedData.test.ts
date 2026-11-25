import { describe, expect, it } from 'vitest';
import { claveBlock, objectBlock } from './sceneTestHelpers';
import { sharedDataOf } from './sharedData';

const clave = (id: string) => objectBlock(id, { primaryDataRef: { id: 'clave' } });

describe('sharedDataOf (W-79)', () => {
  it('two objects on the same data share it, each naming the other', () => {
    const blocks = [
      claveBlock(),
      clave('a'),
      clave('b'),
      objectBlock('c', { primaryDataRef: { id: 'other' } }),
    ];
    const out = sharedDataOf(blocks, ['a', 'b', 'c']);
    expect(out.get('a')).toEqual({ dataId: 'clave', others: ['b'], count: 2 });
    expect(out.get('b')).toEqual({ dataId: 'clave', others: ['a'], count: 2 });
    expect(out.has('c')).toBe(false);
  });

  it('three sharing gives count 3 and two others', () => {
    const blocks = [claveBlock(), clave('a'), clave('b'), clave('c')];
    const entry = sharedDataOf(blocks, ['a', 'b', 'c']).get('b');
    expect(entry?.count).toBe(3);
    expect(entry?.others).toEqual(['a', 'c']);
  });

  it('Empty objects (no data) never count, even together', () => {
    const blocks = [objectBlock('a'), objectBlock('b')];
    expect(sharedDataOf(blocks, ['a', 'b']).size).toBe(0);
  });

  it('a shared parent reference does not count; objects outside the list do not either', () => {
    const blocks = [
      claveBlock(),
      objectBlock('p', { primaryDataRef: { id: 'clave' } }),
      objectBlock('k1', { parentRef: { id: 'p' }, primaryDataRef: { id: 'x1' } }),
      objectBlock('k2', { parentRef: { id: 'p' }, primaryDataRef: { id: 'x2' } }),
      clave('out'),
    ];
    const out = sharedDataOf(blocks, ['p', 'k1', 'k2']);
    expect(out.size).toBe(0);
  });
});
