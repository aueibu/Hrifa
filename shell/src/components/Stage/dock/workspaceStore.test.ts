import { describe, expect, it } from 'vitest';
import { makeDocker, makeWorkspace, makeStore } from '../../../lib/stage';
import {
  addWorkspace,
  canNameWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  renameWorkspace,
  setActiveWorkspace,
} from './workspaceStore';

const set = (id: string, name: string, tab = 'a') =>
  makeWorkspace({ id, name, tree: makeDocker('d1', 'Main', [tab]) });
const store = () => makeStore([set('x', 'One'), set('y', 'Two', 'b'), set('z', 'Three')], 'y');

describe('workspace store operations', () => {
  it('activates a workspace, and is a no-op for the active or an unknown one', () => {
    const st = store();
    expect(setActiveWorkspace(st, 'z').active).toBe('z');
    expect(setActiveWorkspace(st, 'y')).toBe(st);
    expect(setActiveWorkspace(st, 'nope')).toBe(st);
  });

  it('adds a copy of the active workspace, last in order, named Workspace N, active', () => {
    const next = addWorkspace(store());
    expect(next.order).toEqual(['x', 'y', 'z', 's4']);
    expect(next.active).toBe('s4');
    expect(next.workspaces.s4.name).toBe('Workspace 4');
    expect(next.workspaces.s4.tree).toEqual(next.workspaces.y.tree);
    expect(next.workspaces.s4.id).toBe('s4');
  });

  it('keeps ids and names unique when adding', () => {
    const st = renameWorkspace(store(), 'x', 'Workspace 4');
    const next = addWorkspace(st);
    expect(next.workspaces[next.active].name).toBe('Workspace 4 2');
    expect(new Set(next.order).size).toBe(next.order.length);
  });

  it('duplicates right after the original, named "<name> copy", and activates it', () => {
    const next = duplicateWorkspace(store(), 'x');
    expect(next.order).toEqual(['x', 's4', 'y', 'z']);
    expect(next.workspaces.s4.name).toBe('One copy');
    expect(next.active).toBe('s4');
    expect(duplicateWorkspace(next, 'x').workspaces.s5.name).toBe('One copy 2');
  });

  it('renames, refusing an empty or taken name (case-insensitive)', () => {
    const st = store();
    expect(renameWorkspace(st, 'x', '  Alpha ').workspaces.x.name).toBe('Alpha');
    expect(renameWorkspace(st, 'x', '')).toBe(st);
    expect(renameWorkspace(st, 'x', 'two')).toBe(st);
    expect(renameWorkspace(st, 'x', 'One')).toBe(st);
    expect(canNameWorkspace(st, 'x', 'ONE')).toBe(true);
    expect(canNameWorkspace(st, null, 'one')).toBe(false);
  });

  it('deletes, moving the active one to its right neighbour, else its left; never the last', () => {
    const st = store();
    const a = deleteWorkspace(st, 'y');
    expect(a.order).toEqual(['x', 'z']);
    expect(a.active).toBe('z');
    expect(a.workspaces.y).toBeUndefined();
    const b = deleteWorkspace(setActiveWorkspace(st, 'z'), 'z');
    expect(b.active).toBe('y');
    expect(deleteWorkspace(st, 'x').active).toBe('y');
    const one = makeStore([set('only', 'Only')]);
    expect(deleteWorkspace(one, 'only')).toBe(one);
    expect(deleteWorkspace(st, 'nope')).toBe(st);
  });
});
