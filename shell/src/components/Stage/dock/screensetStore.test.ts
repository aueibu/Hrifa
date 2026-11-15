import { describe, expect, it } from 'vitest';
import { makeDocker, makeScreenset, makeStore } from '../../../lib/stage';
import {
  addScreenset,
  canNameScreenset,
  deleteScreenset,
  duplicateScreenset,
  renameScreenset,
  setActiveScreenset,
} from './screensetStore';

const set = (id: string, name: string, tab = 'a') =>
  makeScreenset({ id, name, tree: makeDocker('d1', 'Main', [tab]) });
const store = () => makeStore([set('x', 'One'), set('y', 'Two', 'b'), set('z', 'Three')], 'y');

describe('screenset store operations', () => {
  it('activates a screenset, and is a no-op for the active or an unknown one', () => {
    const st = store();
    expect(setActiveScreenset(st, 'z').active).toBe('z');
    expect(setActiveScreenset(st, 'y')).toBe(st);
    expect(setActiveScreenset(st, 'nope')).toBe(st);
  });

  it('adds a copy of the active screenset, last in order, named Screenset N, active', () => {
    const next = addScreenset(store());
    expect(next.order).toEqual(['x', 'y', 'z', 's4']);
    expect(next.active).toBe('s4');
    expect(next.screensets.s4.name).toBe('Screenset 4');
    expect(next.screensets.s4.tree).toEqual(next.screensets.y.tree);
    expect(next.screensets.s4.id).toBe('s4');
  });

  it('keeps ids and names unique when adding', () => {
    const st = renameScreenset(store(), 'x', 'Screenset 4');
    const next = addScreenset(st);
    expect(next.screensets[next.active].name).toBe('Screenset 4 2');
    expect(new Set(next.order).size).toBe(next.order.length);
  });

  it('duplicates right after the original, named "<name> copy", and activates it', () => {
    const next = duplicateScreenset(store(), 'x');
    expect(next.order).toEqual(['x', 's4', 'y', 'z']);
    expect(next.screensets.s4.name).toBe('One copy');
    expect(next.active).toBe('s4');
    expect(duplicateScreenset(next, 'x').screensets.s5.name).toBe('One copy 2');
  });

  it('renames, refusing an empty or taken name (case-insensitive)', () => {
    const st = store();
    expect(renameScreenset(st, 'x', '  Alpha ').screensets.x.name).toBe('Alpha');
    expect(renameScreenset(st, 'x', '')).toBe(st);
    expect(renameScreenset(st, 'x', 'two')).toBe(st);
    expect(renameScreenset(st, 'x', 'One')).toBe(st);
    expect(canNameScreenset(st, 'x', 'ONE')).toBe(true);
    expect(canNameScreenset(st, null, 'one')).toBe(false);
  });

  it('deletes, moving the active one to its right neighbour, else its left; never the last', () => {
    const st = store();
    const a = deleteScreenset(st, 'y');
    expect(a.order).toEqual(['x', 'z']);
    expect(a.active).toBe('z');
    expect(a.screensets.y).toBeUndefined();
    const b = deleteScreenset(setActiveScreenset(st, 'z'), 'z');
    expect(b.active).toBe('y');
    expect(deleteScreenset(st, 'x').active).toBe('y');
    const one = makeStore([set('only', 'Only')]);
    expect(deleteScreenset(one, 'only')).toBe(one);
    expect(deleteScreenset(st, 'nope')).toBe(st);
  });
});
