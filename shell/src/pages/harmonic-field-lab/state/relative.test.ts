/** M8a: the Relative pitches method as data (generation, identity, storage, presets, actions, Developer option). */
import { describe, expect, it } from 'vitest';
import { fmtRatio, zeroMonzo } from '../../../lib/harmonic-field';
import { cloneSource as cloneShelfSource } from './chordShelf';
import { cloneSource as cloneItemSource } from './composites';
import { parseDeveloperOptions } from './developerOptions';
import { autoName, defaultGen, genKey, generateField, type GenSpec } from './generate';
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
const FIVE = ['1/1', '11/8', '16/11', '3/2', '18/11'];
const rel = (notes: string[], extra: Partial<GenSpec> = {}): GenSpec => ({
  ...defaultGen(),
  method: 'relative',
  notes,
  ...extra,
});
const ratios = (g: GenSpec) => {
  const r = generateField(g);
  if (!r.ok) {
    throw new Error(r.err);
  }
  return r.field.map(fmtRatio);
};
const tabRatios = (s: LabState) => activeTab(s).field.map(fmtRatio);
const relState = (notes: string[] = ['1/1']) =>
  run(initialState(), { type: 'gen/patch', patch: rel(notes) });

describe('generateField', () => {
  it('row 1: a new generator is 1/1 alone', () => {
    expect(defaultGen().notes).toEqual(['1/1']);
    expect(ratios({ ...defaultGen(), method: 'relative' })).toEqual(['1/1']);
  });
  it('the field is the notes folded and sorted, equal pitches merged', () => {
    expect(ratios(rel(FIVE))).toEqual(['1/1', '11/8', '16/11', '3/2', '18/11']);
    expect(ratios(rel(['3/2', '1/1', '3/1', '9/4']))).toEqual(['1/1', '9/8', '3/2']);
    const g = generateField(rel(['1/1', '700 c']));
    expect(g.ok && g.field.map((n) => n.c)).toEqual([0, 700]);
    expect(g.ok && g.field[1].m).toBeNull();
  });
  it('row 14: odd limit 9 keeps 1/1 and 3/2 only; the notes stay', () => {
    expect(ratios(rel(FIVE, { oddLimit: 9 }))).toEqual(['1/1', '3/2']);
    expect(ratios(rel(FIVE))).toHaveLength(5);
  });
  it('the prime filter applies after the build', () => {
    const mask = defaultGen().mask.map((_, i) => i < 2);
    expect(ratios(rel(FIVE, { mask }))).toEqual(['1/1', '3/2']);
  });
  it('an unreadable note is a sentence, not a throw', () => {
    const r = generateField(rel(['1/1', 'zz']));
    expect(r.ok).toBe(false);
  });
  it('the name', () => {
    expect(autoName(rel(['1/1']))).toBe('Relative pitches');
  });
});

describe('genKey', () => {
  it('a relative spec keys on its pitches; other methods are unaffected by notes', () => {
    expect(genKey(rel(['1/1', '3/2']))).toBe(genKey(rel(['3/2', '1/1'])));
    expect(genKey(rel(['1/1', '3/2']))).not.toBe(genKey(rel(['1/1'])));
    const h = defaultGen();
    expect(genKey({ ...h, notes: ['1/1', '5/4'] })).toBe(genKey(h));
  });
});

describe('storage (row 15)', () => {
  it('the snapshot writes notes only for the relative method', () => {
    const t = (g: GenSpec) =>
      toSnapshot({ gen: g, sel: [], field: [], mode: 0, cmp: defaultCmp(), pick: emptyPick() });
    expect(t(rel(FIVE)).notes).toEqual(FIVE);
    expect('notes' in t(defaultGen())).toBe(false);
    expect('notes' in t({ ...defaultGen(), notes: ['1/1', '3/2'] })).toBe(false);
  });
  it('round trip through the snapshot and the generator record: the same five notes, nothing computed', () => {
    const g = rel(FIVE);
    expect(
      sanitizeSnapshot(
        toSnapshot({ gen: g, sel: [], field: [], mode: 0, cmp: defaultCmp(), pick: emptyPick() })
      )?.gen.notes
    ).toEqual(FIVE);
    const stored = genToStored(g);
    expect(stored.notes).toEqual(FIVE);
    expect(stored.gen).toBe('relative');
    const back = genFromStored(JSON.parse(JSON.stringify(stored)));
    expect(back?.method).toBe('relative');
    expect(back?.notes).toEqual(FIVE);
    expect(back && genKey(back)).toBe(genKey(g));
    expect(Object.keys(stored)).not.toContain('field');
  });
  it('a preset in the library reloads with the same notes', () => {
    const s = relState(FIVE);
    const saved = run(s, { type: 'preset/save', name: 'Five', folder: '' });
    const lib = sanitizeLibrary(JSON.parse(JSON.stringify(libraryToStored(saved.library))));
    const p = lib?.presets.find((x) => x.name === 'Five');
    expect(p?.gen.notes).toEqual(FIVE);
    expect(p?.gen.method).toBe('relative');
  });
  it('old stored specs load unchanged: no notes key, default notes, same method and key', () => {
    const old = genToStored(defaultGen());
    expect(JSON.parse(JSON.stringify(old))).not.toHaveProperty('notes');
    const back = genFromStored(old);
    expect(back?.method).toBe('harmonic');
    expect(back && genKey(back)).toBe(genKey(defaultGen()));
  });
  it('sanitizing: bad entries dropped, cap 256, empty is 1/1, unknown method falls back as before', () => {
    const base = toSnapshot({
      gen: rel(FIVE),
      sel: [],
      field: [],
      mode: 0,
      cmp: defaultCmp(),
      pick: emptyPick(),
    });
    const get = (patch: Record<string, unknown>) => sanitizeSnapshot({ ...base, ...patch })?.gen;
    expect(get({ notes: ['1/1', 'zz', 3, '3/2'] })?.notes).toEqual(['1/1', '3/2']);
    expect(get({ notes: [] })?.notes).toEqual(['1/1']);
    expect(get({ notes: 'x' })?.notes).toEqual(['1/1']);
    const many = Array.from({ length: 400 }, (_, i) => `${i + 1} c`);
    expect(get({ notes: many })?.notes).toHaveLength(256);
    expect(get({ gen: 'nonsense' })?.method).toBe('harmonic');
  });
  it('copies keep their own notes array', () => {
    const g = rel(FIVE);
    const c = cloneGen(g);
    expect(c.notes).toEqual(FIVE);
    expect(c.notes).not.toBe(g.notes);
    const gen = rel(FIVE);
    const shelf = cloneShelfSource({ gen, subset: { pitches: [], root: null }, tab: 't' } as never);
    expect(shelf.gen.notes).not.toBe(gen.notes);
    const item = cloneItemSource({ gen, tab: 't', date: 'd' } as never);
    expect(item.gen.notes).not.toBe(gen.notes);
  });
});

describe('actions', () => {
  it('rows 2 to 5: the whole example, one note at a time', () => {
    let s = relState(['1/1']);
    expect(tabRatios(s)).toEqual(['1/1']);
    s = run(s, { type: 'relative/add', text: '3/2' });
    expect(tabRatios(s)).toEqual(['1/1', '3/2']);
    s = run(s, { type: 'relative/add', text: '11/8' }, { type: 'relative/add', text: '18/11' });
    s = run(s, { type: 'relative/add', text: '16/11' });
    expect(tabRatios(s)).toEqual(['1/1', '11/8', '16/11', '3/2', '18/11']);
    expect(activeTab(s).gen.notes).toEqual(['1/1', '3/2', '11/8', '18/11', '16/11']);
    expect(s.relative.message).toBeNull();
  });
  it('row 9: a duplicate changes nothing and leaves a quiet line; the next add clears it', () => {
    let s = relState(['1/1', '3/2', '9/8']);
    const before = activeTab(s);
    s = run(s, { type: 'relative/add', text: '9/8' });
    expect(activeTab(s)).toBe(before);
    expect(s.relative.message).toMatch(/already in the field/);
    s = run(s, { type: 'relative/add', text: '5/4' });
    expect(s.relative.message).toBeNull();
    expect(tabRatios(s)).toContain('5/4');
    s = run(s, { type: 'relative/add', text: '9/8' }, { type: 'relative/dismiss' });
    expect(s.relative.message).toBeNull();
  });
  it('the 256 cap refuses with a line', () => {
    const full = Array.from({ length: 256 }, (_, i) => `${i + 1} c`);
    const s = run(relState(full), { type: 'relative/add', text: '3/2' });
    expect(activeTab(s).gen.notes).toHaveLength(256);
    expect(s.relative.message).toMatch(/256/);
  });
  it('row 13: deleting 3/2 removes only 3/2', () => {
    let s = relState(FIVE);
    const i = activeTab(s).field.findIndex((n) => fmtRatio(n) === '3/2');
    s = run(s, { type: 'relative/remove', index: i });
    expect(tabRatios(s)).toEqual(['1/1', '11/8', '16/11', '18/11']);
    expect(activeTab(s).gen.notes).toEqual(['1/1', '11/8', '16/11', '18/11']);
  });
  it('removing 1/1 is refused with a line, even with other notes there', () => {
    let s = relState(FIVE);
    const before = activeTab(s);
    const i = before.field.findIndex((n) => fmtRatio(n) === '1/1');
    s = run(s, { type: 'relative/remove', index: i });
    expect(activeTab(s)).toBe(before);
    expect(s.relative.message).toMatch(/always stays/);
  });
  it('an out-of-range index and a non-relative tab change nothing', () => {
    const s = relState(FIVE);
    expect(run(s, { type: 'relative/remove', index: 99 })).toBe(s);
    const h = initialState();
    expect(run(h, { type: 'relative/add', text: '3/2' })).toBe(h);
  });
  it('gen/method to relative starts from 1/1 alone', () => {
    const s = run(initialState(), { type: 'gen/method', method: 'relative' });
    expect(tabRatios(s)).toEqual(['1/1']);
  });
  it('rows 21 and 22: monzo values are kept, clamped, and Reset zeroes them', () => {
    let s = initialState();
    expect(s.relative.monzo).toEqual(zeroMonzo());
    s = run(
      s,
      { type: 'relative/monzo', prime: 7, value: 1 },
      { type: 'relative/monzo', prime: 3, value: 99 }
    );
    expect(s.relative.monzo[7]).toBe(1);
    expect(s.relative.monzo[3]).toBe(12);
    s = run(s, { type: 'relative/monzo', prime: 41, value: -50 });
    expect(s.relative.monzo[41]).toBe(-12);
    // adding a note or switching tabs does not touch them
    s = run(s, { type: 'gen/method', method: 'relative' }, { type: 'relative/add', text: '3/2' });
    expect(s.relative.monzo[7]).toBe(1);
    s = run(s, { type: 'relative/monzoReset' });
    expect(s.relative.monzo).toEqual(zeroMonzo());
    expect(Object.keys(s.relative.monzo)).toHaveLength(13);
  });
});

describe('Developer option relativeRingStep', () => {
  it('defaults to 5 (absent, damaged), keeps 2 to 10, rounds and clamps', () => {
    for (const raw of [null, '', '{', '[]', '{"relativeRingStep":"x"}', '{"tooltips":false}']) {
      expect(parseDeveloperOptions(raw).relativeRingStep, String(raw)).toBe(5);
    }
    expect(parseDeveloperOptions('{"relativeRingStep":4}').relativeRingStep).toBe(4);
    expect(parseDeveloperOptions('{"relativeRingStep":4.6}').relativeRingStep).toBe(5);
    expect(parseDeveloperOptions('{"relativeRingStep":1}').relativeRingStep).toBe(2);
    expect(parseDeveloperOptions('{"relativeRingStep":50}').relativeRingStep).toBe(10);
    expect(parseDeveloperOptions('{"tooltips":false}').tooltips).toBe(false);
  });
});
