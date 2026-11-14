import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, type Layout } from './layout';
import { LAYOUT_STORAGE_KEY, parseLayout, serializeLayout } from './persist';
import { createRegistry } from './registry';

const good: Layout = {
  version: 1,
  columns: [
    { slots: ['a'], width: 24 },
    { slots: ['b', 'c'], shares: [0.3, 0.7] },
  ],
};

describe('persistence shape', () => {
  it('names its storage key and round-trips a good layout', () => {
    expect(LAYOUT_STORAGE_KEY).toBe('hrifa.stage.layout.v1');
    expect(parseLayout(serializeLayout(good))).toEqual(good);
    expect(parseLayout(JSON.stringify({ version: 1, columns: [] }))).toEqual({
      version: 1,
      columns: [],
    });
  });

  it('garbage input or wrong types give the default layout', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'not json',
      '5',
      '[]',
      '{}',
      '{"columns":[]}',
      '{"version":"1","columns":[]}',
      '{"version":1,"columns":"x"}',
      '{"version":1,"columns":[{"slots":[]}]}',
      '{"version":1,"columns":[1,"a",null]}',
      '{"version":1,"columns":[{"slots":[5]}]}',
    ]) {
      expect(parseLayout(bad)).toBe(DEFAULT_LAYOUT);
    }
  });

  it('drops an unknown module id and keeps the rest', () => {
    const raw = JSON.stringify({
      version: 1,
      columns: [{ slots: ['a'] }, { slots: ['gone', 'b'] }, { slots: ['gone'] }],
    });
    const expected = { version: 1, columns: [{ slots: ['a'] }, { slots: ['b'] }] };
    expect(parseLayout(raw, new Set(['a', 'b']))).toEqual(expected);
    expect(
      parseLayout(
        raw,
        createRegistry([
          { id: 'a', title: 'a', sizes: [], minSize: { width: 'narrow', height: 'short' } },
          { id: 'b', title: 'b', sizes: [], minSize: { width: 'narrow', height: 'short' } },
        ])
      )
    ).toEqual(expected);
  });

  it('without a known set every non-empty string id is kept', () => {
    expect(parseLayout('{"version":1,"columns":[{"slots":["x","y"]}]}').columns[0].slots).toEqual([
      'x',
      'y',
    ]);
  });

  it('drops duplicates, empty columns, and caps stacks at 3', () => {
    const raw = JSON.stringify({
      version: 1,
      columns: [
        { slots: ['a', 'a', 'b'] },
        { slots: ['a'] },
        { slots: [] },
        { slots: ['c', 'd', 'e', 'f'] },
      ],
    });
    expect(parseLayout(raw).columns.map((c) => c.slots)).toEqual([
      ['a', 'b'],
      ['c', 'd', 'e'],
    ]);
  });

  it('clamps widths and ignores non-number widths', () => {
    const raw = JSON.stringify({
      version: 1,
      columns: [
        { slots: ['a'], width: 2 },
        { slots: ['b'], width: 9999 },
        { slots: ['c'], width: 'wide' },
      ],
    });
    const cols = parseLayout(raw).columns;
    expect(cols[0].width).toBe(12);
    expect(cols[1].width).toBe(96);
    expect(cols[2].width).toBeUndefined();
  });

  it('drops bad shares, renormalises near-1 shares, and drops shares when slots were dropped', () => {
    const mk = (shares: unknown, slots = ['a', 'b']) =>
      parseLayout(
        JSON.stringify({ version: 1, columns: [{ slots, shares }] }),
        new Set(['a', 'b', 'c'])
      ).columns[0];
    expect(mk([0.3, 0.7]).shares).toEqual([0.3, 0.7]);
    expect(mk([0.3, 0.69]).shares).toEqual([0.303, 0.697]);
    expect(mk([0.5, 0.5]).shares).toBeUndefined();
    expect(mk([0.3, 0.3]).shares).toBeUndefined();
    expect(mk([0.3]).shares).toBeUndefined();
    expect(mk([-0.1, 1.1]).shares).toBeUndefined();
    expect(mk('x').shares).toBeUndefined();
    expect(mk([0.3, 0.7], ['a', 'gone']).shares).toBeUndefined();
  });

  it('reads a later version number without crashing', () => {
    expect(parseLayout('{"version":9,"columns":[{"slots":["a"]}]}').version).toBe(1);
  });
});

describe('src/lib/stage purity', () => {
  it('imports nothing from React, pages, the lab, or the DOM', () => {
    const dir = join(process.cwd(), 'src', 'lib', 'stage');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(4);
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      expect(specs.filter((s) => !s.startsWith('./'))).toEqual([]);
      expect(src).not.toMatch(/\b(localStorage|sessionStorage|document\.|window\.)/);
    }
  });
});

describe('review additions', () => {
  const fb: Layout = { version: 1, columns: [{ slots: ['x'] }, { slots: ['y'] }] };
  it('round trip is idempotent on a messy input', () => {
    const messy = JSON.stringify({
      version: 3,
      columns: [
        { slots: ['a', 'a', 'gone', 'b', 'c', 'd'], width: 2000, shares: [0.3, 0.69, 0.01] },
        { slots: [] },
        { slots: ['b'] },
        { slots: ['e'], width: 'x' },
        { slots: ['f', 'g'], shares: [0.3, 0.69] },
        7,
      ],
    });
    const once = parseLayout(messy, new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']));
    const twice = parseLayout(serializeLayout(once), new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']));
    expect(twice).toEqual(once);
  });
  it('uses the fallback for garbage, a missing columns array, bad versions and nothing usable', () => {
    for (const bad of [
      'junk',
      null,
      '{"version":1}',
      '{"version":0,"columns":[]}',
      '{"version":1.5,"columns":[]}',
      '{"version":-1,"columns":[]}',
      '{"version":1,"columns":[{"slots":["zz"]}]}',
    ]) {
      expect(parseLayout(bad, new Set(['a']), fb)).toBe(fb);
    }
  });
  it('a known set that excludes every id gives the fallback', () => {
    expect(parseLayout(serializeLayout(good), new Set(), fb)).toBe(fb);
  });
  it('a valid layout with zero columns is empty, not the fallback', () => {
    expect(parseLayout('{"version":1,"columns":[]}', undefined, fb)).toEqual({
      version: 1,
      columns: [],
    });
  });
});
