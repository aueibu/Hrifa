/** M6 rules: pin versus selection, the odd limit in the scale menu, and the chord templates (reducer and storage). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATES, fmtRatio } from '../../../lib/harmonic-field';
import { restoreState } from './LabProvider';
import {
  PICK_ODD,
  activeTab,
  initialState,
  labReducer,
  type Action,
  type LabState,
} from './labState';
import {
  KEY_CHORDFINDER,
  loadTemplates,
  sanitizeTemplates,
  saveTemplates,
  sanitizeSnapshot,
  toSnapshot,
} from './persist';

const run = (s: LabState, ...actions: Action[]) => actions.reduce(labReducer, s);
const ratios = (s: LabState) => activeTab(s).field.map((n) => fmtRatio(n));
const selRatios = (s: LabState) => activeTab(s).sel.map((i) => ratios(s)[i]);
const stored = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown;

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('pin versus selection', () => {
  it('pin/toggle pins a note and unpins it again, and never changes the subset', () => {
    const s0 = initialState();
    const s1 = run(s0, { type: 'pin/toggle', i: 2 });
    expect(s1.pin).toBe(2);
    expect(activeTab(s1).sel).toEqual(activeTab(s0).sel);
    const s2 = run(s1, { type: 'pin/toggle', i: 5 });
    expect(s2.pin).toBe(5);
    expect(run(s2, { type: 'pin/toggle', i: 5 }).pin).toBeNull();
  });

  it('sel/toggle does not pin', () => {
    const s = run(initialState(), { type: 'sel/toggle', i: 2 });
    expect(s.pin).toBeNull();
    expect(activeTab(s).sel).not.toContain(2);
  });
});

describe('odd limit as an entry of the scale menu', () => {
  it('pick/apply with the odd entry keeps the notes up to the limit and reports it', () => {
    const s = run(
      initialState(),
      { type: 'pick/set', patch: { scale: PICK_ODD, odd: 5 } },
      { type: 'pick/apply' }
    );
    expect(selRatios(s)).toEqual(['1/1', '5/4', '3/2']);
    expect(activeTab(s).mode).toBe(0);
    expect(activeTab(s).pick.msg).toMatch(/Picked 3 notes with odd limit 5/);
  });

  it('clamps the limit to 1..255', () => {
    const t = run(
      initialState(),
      { type: 'pick/set', patch: { scale: PICK_ODD, odd: 9999 } },
      { type: 'pick/apply' }
    );
    expect(activeTab(t).pick.odd).toBe(255);
    expect(activeTab(t).sel).toHaveLength(8);
  });

  it('the limit is stored with the tab (pickOdd) and an older snapshot without it gets 15', () => {
    const s = run(initialState(), { type: 'pick/set', patch: { scale: PICK_ODD, odd: 9 } });
    const snap = toSnapshot(activeTab(s));
    expect(snap.pickOdd).toBe(9);
    expect(snap.pickScale).toBe(PICK_ODD);
    const { pickOdd: _drop, ...older } = snap;
    expect(sanitizeSnapshot(older)?.pick.odd).toBe(15);
    expect(sanitizeSnapshot({ ...snap, pickOdd: 'x' })?.pick.odd).toBe(15);
  });
});

describe('chord templates in the state', () => {
  it('templates/set replaces the list and clears a kept chord', () => {
    const s = run(
      initialState(),
      { type: 'chord/pick', set: new Set([1, 2]) },
      { type: 'templates/set', templates: [{ text: '4:5:6', family: 'Mine' }] }
    );
    expect(s.templates).toEqual([{ text: '4:5:6', family: 'Mine' }]);
    expect(s.chordPick).toBeNull();
  });
});

describe('chord templates (chordfinder.v1)', () => {
  it('nothing stored gives the defaults', () => {
    expect(loadTemplates()).toEqual(DEFAULT_TEMPLATES);
    expect(restoreState().templates).toEqual(DEFAULT_TEMPLATES);
  });

  it('round-trips an edited list with names and families', () => {
    const list = [
      { text: '4:5:6', name: 'major', family: 'Major' },
      { text: '1/(4:5:6:7)' },
      { text: '8:10:12:14', family: 'Septimal' },
    ];
    expect(saveTemplates(list)).toBe(true);
    expect(stored(KEY_CHORDFINDER)).toEqual({ templates: list });
    expect(loadTemplates()).toEqual(list);
    expect(restoreState().templates).toEqual(list);
  });

  it('a stored empty list is kept as the user choice', () => {
    saveTemplates([]);
    expect(loadTemplates()).toEqual([]);
  });

  it('bad data: not JSON, wrong shape or only bad entries give the defaults', () => {
    for (const raw of ['{oops', 'null', '42', '"x"', '[]', '{"templates":"x"}', '{}']) {
      window.localStorage.setItem(KEY_CHORDFINDER, raw);
      expect(loadTemplates()).toEqual(DEFAULT_TEMPLATES);
    }
    expect(sanitizeTemplates({ templates: [1, null, {}, { text: '' }, { text: 5 }] })).toEqual(
      DEFAULT_TEMPLATES
    );
  });

  it('drops bad entries one by one, trims and caps text, keeps an unparseable template text', () => {
    const out = sanitizeTemplates({
      templates: [
        { text: ' 4:5:6 ', name: '  major ', family: 7 },
        'bad',
        { text: 'x'.repeat(200), name: 'n'.repeat(200), family: 'f'.repeat(200) },
        { text: 'not a chord' },
      ],
    });
    expect(out[0]).toEqual({ text: '4:5:6', name: 'major' });
    expect(out[1].text).toHaveLength(80);
    expect(out[1].name).toHaveLength(60);
    expect(out[1].family).toHaveLength(40);
    expect(out[2]).toEqual({ text: 'not a chord' });
    expect(out).toHaveLength(3);
  });

  it('keeps at most 64 templates', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ text: `${i + 2}:${i + 3}` }));
    expect(sanitizeTemplates({ templates: many })).toHaveLength(64);
  });

  it('a throwing storage is reported by save and never throws on load', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(loadTemplates()).toEqual(DEFAULT_TEMPLATES);
    expect(saveTemplates([{ text: '4:5:6' }])).toBe(false);
    get.mockRestore();
    set.mockRestore();
  });
});

describe('odd limit with nothing to keep', () => {
  it('keeps the selection and reports it plainly when no note is within the limit', () => {
    // every field note irrational (no 1/1 with a monzo): nothing can be within any odd limit
    const base = initialState();
    const s0: LabState = {
      ...base,
      tabs: base.tabs.map((t) => ({ ...t, field: t.field.map((n) => ({ ...n, m: null })) })),
    };
    const before = activeTab(s0).sel;
    const s = run(
      s0,
      { type: 'pick/set', patch: { scale: PICK_ODD, odd: 9 } },
      { type: 'pick/apply' }
    );
    expect(activeTab(s).sel).toEqual(before);
    expect(activeTab(s).pick.ok).toBe(false);
    expect(activeTab(s).pick.msg).toMatch(/No notes within odd limit 9/);
  });
});
