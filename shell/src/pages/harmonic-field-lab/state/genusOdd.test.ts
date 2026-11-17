/** M6a: the odd limit filter and the genus shape of the Lattice method, as data (generation, identity, storage, actions). */
import { describe, expect, it } from 'vitest';
import { fmtRatio } from '../../../lib/harmonic-field';
import { cloneSource as cloneShelfSource } from './chordShelf';
import { cloneSource as cloneItemSource } from './composites';
import { autoName, capOddLimit, defaultGen, genKey, generateField, type GenSpec } from './generate';
import { cloneGen } from './generatorLibrary';
import {
  activeTab,
  defaultCmp,
  emptyPick,
  initialState,
  labReducer,
  type Action,
  type LabState,
} from './labState';
import { genFromStored, genToStored, libraryToStored, sanitizeLibrary } from './libraryStore';
import { sanitizeSnapshot, toSnapshot } from './persist';

const run = (s: LabState, ...actions: Action[]) => actions.reduce(labReducer, s);
const genus = (n: string, extra: Partial<GenSpec> = {}): GenSpec => ({
  ...defaultGen(),
  method: 'lattice',
  shape: 'genus',
  genusN: n,
  ...extra,
});
const built = (g: GenSpec) => {
  const r = generateField(g);
  if (!r.ok) {
    throw new Error(r.err);
  }
  return r;
};
const ratios = (g: GenSpec) => built(g).field.map(fmtRatio);
const tabRatios = (s: LabState) => activeTab(s).field.map(fmtRatio);
/** A lattice whose only note is (9/8)^-3: its center is past its length, so 1/1 is not in the field. */
const farLattice = (): GenSpec => ({
  ...defaultGen(),
  method: 'lattice',
  axes: [
    { on: true, g: '9/8', n: 1, ctr: 3 },
    { on: false, g: '5/4', n: 3, ctr: 1 },
    { on: false, g: '7/4', n: 3, ctr: 1 },
  ],
});
const OLD_KEYS = ['gen', 'rep', 'h', 'edoN', 'axes', 'shape', 'dist', 'bidir', 'cpsF', 'cpsK'];

describe('generateField: the genus shape', () => {
  it('rows 1 to 5: 45, 105, 225, 1 and 32', () => {
    expect(ratios(genus('45'))).toEqual(['1/1', '9/8', '5/4', '45/32', '3/2', '15/8']);
    expect(ratios(genus('105'))).toHaveLength(8);
    expect(ratios(genus('225'))).toEqual([
      '1/1',
      '9/8',
      '75/64',
      '5/4',
      '45/32',
      '3/2',
      '25/16',
      '225/128',
      '15/8',
    ]);
    expect(ratios(genus('1'))).toEqual(['1/1']);
    expect(ratios(genus('32'))).toEqual(['1/1']);
  });
  it('the axes are ignored with this shape', () => {
    const a = genus('45');
    const b = genus('45', { axes: a.axes.map((x) => ({ ...x, n: 3, g: '9/8', on: true })) });
    expect(ratios(b)).toEqual(ratios(a));
  });
  it('uses the repeat of the spec (45 in a tritave is two notes)', () => {
    expect(ratios(genus('45', { rep: '3/1' }))).toEqual(['1/1', '5/3']);
  });
  it('row 7: 1331 and 1728 notes build; 2197 is refused with the count and nothing is built', () => {
    expect(built(genus(String(3n ** 10n * 5n ** 10n * 7n ** 10n))).field).toHaveLength(1331);
    expect(built(genus(String(3n ** 11n * 5n ** 11n * 7n ** 11n))).field).toHaveLength(1728);
    expect(generateField(genus(String(3n ** 12n * 5n ** 12n * 7n ** 12n)))).toEqual({
      ok: false,
      err: 'This genus has 2197 notes, the limit is 2048.',
    });
  });
  it('row 6: a missing or unreadable number is refused with the sentence, never a throw', () => {
    const hint = { ok: false, err: 'Type a whole number such as 45 or 3^2*5.' };
    expect(generateField({ ...genus('45'), genusN: undefined })).toEqual(hint);
    expect(generateField(genus('abc'))).toEqual(hint);
    expect(generateField(genus('0'))).toEqual(hint);
    expect(generateField(genus('3.5'))).toEqual(hint);
    const prime = generateField(genus('97'));
    expect(prime.ok).toBe(false);
  });
  it('the prime filter and the odd limit still apply to a genus', () => {
    const only3 = (g: GenSpec) => ({ ...g, mask: g.mask.map((_, i) => i < 2) });
    expect(ratios(only3(genus('45')))).toEqual(['1/1', '9/8', '3/2']);
    expect(ratios(genus('45', { oddLimit: 5 }))).toEqual(['1/1', '5/4', '3/2']);
  });
  it('the tab name stays "Lattice" (autoName is unchanged)', () => {
    expect(autoName(genus('45'))).toBe('Lattice');
  });
});

describe('generateField: the odd limit', () => {
  it('rows 8 and 9 through a generator', () => {
    const hh = { ...defaultGen(), method: 'harmonic' as const, h: 8, oddLimit: 9 };
    expect(ratios(hh)).toEqual(['1/1', '9/8', '5/4', '3/2', '7/4']);
    const custom = {
      ...defaultGen(),
      method: 'custom' as const,
      custom: '9/8\n5/4\n4/3\n3/2\n5/3\n15/8',
    };
    expect(ratios({ ...custom, oddLimit: 5 })).toEqual(['1/1', '5/4', '4/3', '3/2', '5/3']);
    expect(ratios({ ...custom, oddLimit: 15 })).toHaveLength(7);
    expect(ratios(custom)).toHaveLength(7);
  });
  it('row 12: 12-EDO with limit 5 keeps all 12', () => {
    expect(ratios({ ...defaultGen(), method: 'edo', edoN: 12, oddLimit: 5 })).toHaveLength(12);
  });
  it('row 13: the prime filter and the odd limit add up', () => {
    const g: GenSpec = {
      ...defaultGen(),
      method: 'custom',
      custom: '9/8\n81/64\n3/2\n27/16\n5/4\n7/4\n15/8',
      mask: defaultGen().mask.map((_, i) => i < 2),
      oddLimit: 9,
    };
    expect(ratios(g)).toEqual(['1/1', '9/8', '3/2']);
  });
  it('applies to a composite snapshot too', () => {
    const base = generateField({ ...defaultGen(), method: 'harmonic', h: 8 });
    if (!base.ok) {
      throw new Error('base');
    }
    const comp: GenSpec = {
      ...defaultGen(),
      method: 'composite',
      snap: { id: 1, name: 'C', rep: base.rep, notes: base.field },
      oddLimit: 9,
    };
    expect(ratios(comp)).toEqual(['1/1', '9/8', '5/4', '3/2', '7/4']);
  });
  it('a limit that leaves nothing says so (a note, like the prime filter), and is not a failure', () => {
    // one lattice note, (9/8)^-3 folded into the octave = 1024/729 (odd limit 729): 1/1 is not in this field
    const g: GenSpec = { ...farLattice(), oddLimit: 3 };
    expect(ratios(farLattice())).toEqual(['1024/729']);
    const r = built(g);
    expect(r.field).toEqual([]);
    expect(r.warn).toBe('Odd limit 3 leaves no notes.');
    // the prime filter alone empties it: that message wins, as before
    const mask = defaultGen().mask.map((_, i) => i === 0);
    expect(built({ ...g, mask }).warn).toBe('Prime filter removed every note');
    // no odd limit: the message is the old one
    expect(built({ ...farLattice(), mask }).warn).toBe('Prime filter removed every note');
    expect(built(farLattice()).warn).toBe('');
    // a limit that is large enough keeps the note
    expect(built({ ...farLattice(), oddLimit: 729 }).field).toHaveLength(1);
  });
});

describe('capOddLimit', () => {
  it('whole numbers from 1, capped at 4095; anything else is no filter', () => {
    expect(capOddLimit(9)).toBe(9);
    expect(capOddLimit('15')).toBe(15);
    expect(capOddLimit(5000)).toBe(4095);
    for (const x of [0, -1, 2.5, 'x', '', ' ', null, undefined, NaN, {}, true]) {
      expect(capOddLimit(x)).toBeNull();
    }
  });
});

describe('genKey (row 15 and the new components)', () => {
  it('an old spec keeps its key; the new fields enter only when set', () => {
    const a = defaultGen();
    const was = genKey(a);
    expect(genKey({ ...a, oddLimit: undefined })).toBe(was);
    expect(genKey({ ...a, genusN: '45' })).toBe(was);
    expect(genKey({ ...a, oddLimit: 9 })).not.toBe(was);
    const lat = { ...a, method: 'lattice' as const };
    expect(genKey(genus('45'))).not.toBe(genKey(lat));
    expect(genKey(genus('45'))).not.toBe(genKey(genus('105')));
    expect(genKey(genus('45'))).toBe(genKey(genus('45', { preset: 'x', keepNew: true })));
    expect(genKey(genus('45', { oddLimit: 9 }))).not.toBe(genKey(genus('45')));
  });
});

describe('storage: snapshot, sanitizing and the generator record', () => {
  it('row 15: an old stored generator reads back with no new fields and the same key', () => {
    const old: Record<string, unknown> = {};
    const g = { ...defaultGen(), method: 'edo' as const, edoN: 19 };
    const stored = JSON.parse(JSON.stringify(genToStored(g))) as Record<string, unknown>;
    expect('oddLimit' in stored || 'genusN' in stored).toBe(false);
    Object.assign(old, stored);
    const back = genFromStored(old);
    expect(back).not.toBeNull();
    expect(back && 'oddLimit' in back).toBe(false);
    expect(back && 'genusN' in back).toBe(false);
    expect(back && genKey(back)).toBe(genKey(g));
    expect(JSON.parse(JSON.stringify(genToStored(back as GenSpec)))).toEqual(stored);
  });
  it('writes oddLimit only when set and genusN only for the genus shape', () => {
    const j = (g: GenSpec) => JSON.parse(JSON.stringify(genToStored(g))) as Record<string, unknown>;
    expect(j({ ...defaultGen(), oddLimit: 9 }).oddLimit).toBe(9);
    expect('oddLimit' in j(defaultGen())).toBe(false);
    const g45 = j(genus('45'));
    expect(g45.shape).toBe('genus');
    expect(g45.genusN).toBe('45');
    // a box or diamond that still carries a number in memory does not store it
    expect('genusN' in j({ ...genus('45'), shape: 'box' })).toBe(false);
    expect('genusN' in j({ ...genus('45'), shape: 'diamond' })).toBe(false);
    // a genus shape without a readable number is stored as the box it can fall back to
    expect(j({ ...genus('45'), genusN: undefined }).shape).toBe('box');
    expect(j({ ...genus('45'), genusN: 'abc' }).shape).toBe('box');
  });
  it('sanitizing: an unknown shape or a bad number falls back to box and drops the number', () => {
    const read = (patch: Record<string, unknown>) => {
      const raw = { ...JSON.parse(JSON.stringify(genToStored(genus('45')))), ...patch };
      return sanitizeSnapshot(raw)?.gen as GenSpec;
    };
    expect(read({}).shape).toBe('genus');
    expect(read({}).genusN).toBe('45');
    for (const bad of [
      'abc',
      '',
      '0',
      '045',
      '3.5',
      '-5',
      45.5,
      null,
      undefined,
      {},
      [],
      '9'.repeat(6001),
    ]) {
      const g = read({ genusN: bad });
      expect(g.shape).toBe('box');
      expect('genusN' in g).toBe(false);
    }
    // an older version wrote nothing else; a plain safe number is read as its digits
    expect(read({ genusN: 45 }).genusN).toBe('45');
    for (const shape of ['hexagon', 5, null, undefined, 'GENUS']) {
      const g = read({ shape });
      expect(g.shape).toBe('box');
      expect('genusN' in g).toBe(false);
    }
    // a number stored with another shape is dropped
    const dia = read({ shape: 'diamond' });
    expect(dia.shape).toBe('diamond');
    expect('genusN' in dia).toBe(false);
  });
  it('sanitizing the odd limit: whole numbers from 1, capped at 4095, else no filter', () => {
    const read = (v: unknown) =>
      sanitizeSnapshot({ ...JSON.parse(JSON.stringify(genToStored(defaultGen()))), oddLimit: v })
        ?.gen as GenSpec;
    expect(read(9).oddLimit).toBe(9);
    expect(read('15').oddLimit).toBe(15);
    expect(read(4095).oddLimit).toBe(4095);
    expect(read(9999).oddLimit).toBe(4095);
    for (const bad of [0, -3, 2.5, 'x', '', null, undefined, NaN, true, {}, []]) {
      expect('oddLimit' in read(bad)).toBe(false);
    }
  });
  it('a tab snapshot carries both, and an old snapshot has neither', () => {
    const tab = (g: GenSpec) => ({
      gen: g,
      sel: [],
      field: [],
      mode: 0,
      cmp: defaultCmp(),
      pick: emptyPick(),
    });
    const snap = toSnapshot(tab(genus('45', { oddLimit: 7 })));
    expect(snap.shape).toBe('genus');
    expect(snap.genusN).toBe('45');
    expect(snap.oddLimit).toBe(7);
    const plain = toSnapshot(tab(defaultGen()));
    expect('genusN' in plain || 'oddLimit' in plain).toBe(false);
    expect(Object.keys(plain)).toEqual(expect.arrayContaining(OLD_KEYS));
    const back = sanitizeSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(back?.gen.genusN).toBe('45');
    expect(back?.gen.oddLimit).toBe(7);
    expect(back?.gen.shape).toBe('genus');
  });
  it('the numbers of row 7 survive storage exactly (a string, not a rounded number)', () => {
    const n = String(3n ** 11n * 5n ** 11n * 7n ** 11n);
    expect(n.length).toBeGreaterThan(16);
    const back = genFromStored(JSON.parse(JSON.stringify(genToStored(genus(n)))));
    expect(back?.genusN).toBe(n);
    expect(back && built(back).field).toHaveLength(1728);
  });
});

describe('row 14: a Genus preset round trip', () => {
  it('saves, reloads and opens the same six notes; only the number is stored', () => {
    let s = run(
      initialState(),
      { type: 'gen/patch', patch: { method: 'lattice', shape: 'genus', genusN: '45' } },
      { type: 'preset/save', name: 'Genus 45', folder: 'Genus' }
    );
    expect(tabRatios(s)).toEqual(['1/1', '9/8', '5/4', '45/32', '3/2', '15/8']);
    expect(s.library.presets).toHaveLength(1);
    const json = JSON.parse(JSON.stringify(libraryToStored(s.library))) as {
      presets: { gen: Record<string, unknown> }[];
    };
    const stored = json.presets[0].gen;
    expect(stored.shape).toBe('genus');
    expect(stored.genusN).toBe('45');
    expect('oddLimit' in stored).toBe(false);
    // nothing computed: no field, notes or ratios anywhere in the stored record
    expect(JSON.stringify(stored)).not.toMatch(/notes|field|ratio|45\/32|"m":/);
    const lib = sanitizeLibrary(json);
    expect(lib?.presets[0].gen.genusN).toBe('45');
    expect(lib?.presets[0].gen.shape).toBe('genus');
    s = run({ ...initialState(), library: lib! }, { type: 'preset/open', owner: 'p:p1' });
    expect(tabRatios(s)).toEqual(['1/1', '9/8', '5/4', '45/32', '3/2', '15/8']);
    expect(activeTab(s).gen.genusN).toBe('45');
  });
  it('an odd limit is saved and restored with its preset', () => {
    let s = run(
      initialState(),
      { type: 'gen/oddLimit', limit: 9 },
      { type: 'preset/save', name: 'Nine', folder: '' }
    );
    const json = JSON.parse(JSON.stringify(libraryToStored(s.library))) as {
      presets: { gen: Record<string, unknown> }[];
    };
    expect(json.presets[0].gen.oddLimit).toBe(9);
    const lib = sanitizeLibrary(json);
    s = run({ ...initialState(), library: lib! }, { type: 'preset/open', owner: 'p:p1' });
    expect(activeTab(s).gen.oddLimit).toBe(9);
    expect(tabRatios(s)).toEqual(['1/1', '9/8', '5/4', '3/2', '7/4']);
  });
});

describe('copies keep the new fields', () => {
  const g = genus('45', { oddLimit: 9 });
  it('cloneGen, the shelf source and the composite item source', () => {
    expect(cloneGen(g)).toMatchObject({ shape: 'genus', genusN: '45', oddLimit: 9 });
    expect(
      cloneShelfSource({ gen: g, subset: { pitches: [], root: null }, tab: 'T' }).gen
    ).toMatchObject({
      shape: 'genus',
      genusN: '45',
      oddLimit: 9,
    });
    expect(cloneItemSource({ gen: g, tab: 'T', date: 'd' }).gen).toMatchObject({
      shape: 'genus',
      genusN: '45',
      oddLimit: 9,
    });
  });
});

describe('actions', () => {
  it('gen/oddLimit sets, changes and clears the filter and rebuilds the field', () => {
    let s = initialState();
    expect(tabRatios(s)).toHaveLength(8);
    s = run(s, { type: 'gen/oddLimit', limit: 9 });
    expect(activeTab(s).gen.oddLimit).toBe(9);
    expect(tabRatios(s)).toEqual(['1/1', '9/8', '5/4', '3/2', '7/4']);
    expect(activeTab(s).gen.preset).toBe('');
    s = run(s, { type: 'gen/oddLimit', limit: 5 });
    expect(tabRatios(s)).toEqual(['1/1', '5/4', '3/2']);
    s = run(s, { type: 'gen/oddLimit', limit: null });
    expect('oddLimit' in activeTab(s).gen).toBe(false);
    expect(tabRatios(s)).toHaveLength(8);
    // junk clears it; a big number is capped
    s = run(s, { type: 'gen/oddLimit', limit: 9 }, { type: 'gen/oddLimit', limit: 0 });
    expect('oddLimit' in activeTab(s).gen).toBe(false);
    s = run(s, { type: 'gen/oddLimit', limit: 8000 });
    expect(activeTab(s).gen.oddLimit).toBe(4095);
  });
  it('the filter stays when the method changes and in a duplicated tab', () => {
    let s = run(
      initialState(),
      { type: 'gen/oddLimit', limit: 5 },
      { type: 'gen/method', method: 'edo' }
    );
    expect(activeTab(s).gen.oddLimit).toBe(5);
    expect(activeTab(s).field).toHaveLength(12);
    s = run(s, { type: 'tab/duplicate' });
    expect(activeTab(s).gen.oddLimit).toBe(5);
  });
  it('a limit that empties the field shows the note and keeps the filter', () => {
    const s = run(
      initialState(),
      { type: 'gen/patch', patch: farLattice() },
      { type: 'gen/oddLimit', limit: 3 }
    );
    expect(activeTab(s).field).toEqual([]);
    expect(activeTab(s).gen.oddLimit).toBe(3);
    expect(activeTab(s).err).toBe('Odd limit 3 leaves no notes.');
  });
  it('gen/patch switches the lattice to the genus shape; a refused number keeps the field', () => {
    let s = run(initialState(), {
      type: 'gen/patch',
      patch: { method: 'lattice', shape: 'genus', genusN: '45' },
    });
    expect(tabRatios(s)).toHaveLength(6);
    expect(activeTab(s).err).toBe('');
    const before = activeTab(s).field;
    s = run(s, {
      type: 'gen/patch',
      patch: { genusN: String(3n ** 12n * 5n ** 12n * 7n ** 12n) },
    });
    expect(activeTab(s).field).toBe(before);
    expect(activeTab(s).err).toBe('This genus has 2197 notes, the limit is 2048.');
    s = run(s, { type: 'gen/patch', patch: { shape: 'box' } });
    expect(activeTab(s).err).toBe('');
  });
});
