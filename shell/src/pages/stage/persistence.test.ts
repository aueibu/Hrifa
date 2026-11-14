import { describe, expect, it } from 'vitest';
import { LAYOUT_STORAGE_KEY, createRegistry, type Layout } from '../../lib/stage';
import { loadLayout, saveLayout, type StageStorage } from './persistence';

const size = { width: 'regular', height: 'regular' } as const;
const registry = createRegistry(
  ['a', 'b'].map((id) => ({ id, title: id, sizes: [size], minSize: size }))
);
const fallback: Layout = { version: 1, columns: [{ slots: ['a'] }] };

const fakeStorage = (): StageStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
};

const throwing: StageStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

describe('layout persistence', () => {
  it('round trips a layout through storage under the Stage key only', () => {
    const s = fakeStorage();
    const layout: Layout = {
      version: 1,
      columns: [{ slots: ['b'], width: 30 }, { slots: ['a'] }],
    };
    expect(saveLayout(s, layout)).toBe(true);
    expect([...s.data.keys()]).toEqual([LAYOUT_STORAGE_KEY]);
    expect(loadLayout(s, registry, fallback)).toEqual(layout);
  });

  it('loads a stored layout without a module id that is no longer registered', () => {
    const s = fakeStorage();
    s.data.set(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: 1, columns: [{ slots: ['a', 'gone'] }, { slots: ['gone2'] }] })
    );
    expect(loadLayout(s, registry, fallback).columns).toEqual([{ slots: ['a'] }]);
  });

  it('uses the fallback when nothing or garbage is stored', () => {
    expect(loadLayout(fakeStorage(), registry, fallback)).toBe(fallback);
    const s = fakeStorage();
    s.data.set(LAYOUT_STORAGE_KEY, '{not json');
    expect(loadLayout(s, registry, fallback)).toBe(fallback);
  });

  it('survives storage that throws or is missing', () => {
    expect(loadLayout(throwing, registry, fallback)).toBe(fallback);
    expect(saveLayout(throwing, fallback)).toBe(false);
    expect(loadLayout(undefined, registry, fallback)).toBe(fallback);
    expect(saveLayout(undefined, fallback)).toBe(false);
  });
});
