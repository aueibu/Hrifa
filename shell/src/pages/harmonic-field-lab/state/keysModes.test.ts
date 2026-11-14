import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveBase, keysOf } from './derive';
import { defaultGen } from './generate';
import {
  addTo,
  commonTones,
  keyDiff,
  keySummary,
  subsetSig,
  switchTo,
  viewedKey,
} from './keysModes';
import { activeTab, initialState, labReducer, type Action, type LabState } from './labState';
import {
  DEFAULT_LAYOUT,
  PANEL_IDS,
  loadStoredLayout,
  parseLayout,
  splitKeysModes,
  type Layout,
} from './layout';
import { KEY_LAYOUT, loadLayout, saveLayout } from './persist';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const c12 = () =>
  run(
    initialState(),
    { type: 'tab/add', gen: { ...defaultGen(), method: 'edo', edoN: 12 } },
    { type: 'sel/set', idx: MAJOR }
  );
const keysFor = (s: LabState) => {
  const base = deriveBase(activeTab(s));
  return { base, keys: keysOf(base, 1)! };
};

describe('common tones and the four groups (12-EDO C major)', () => {
  it('G major shares 6 of 7, F# major shares 2 of 7, C major all 7', () => {
    const { base, keys } = keysFor(c12());
    const ring = (root: number) => keys.keyRings.find((r) => r.rootIdx === root)!;
    expect(base.idx).toHaveLength(7);
    expect(commonTones(base.idx, ring(7).idx)).toBe(6);
    expect(commonTones(base.idx, ring(6).idx)).toBe(2);
    expect(commonTones(base.idx, ring(0).idx)).toBe(7);
  });

  it('G major: F# added, F dropped, nothing missing; summary is in words', () => {
    const { base, keys } = keysFor(c12());
    const d = keyDiff(base.idx, keys.keyRings.find((r) => r.rootIdx === 7)!.idx);
    expect(d.added).toEqual([6]);
    expect(d.dropped).toEqual([5]);
    expect(d.common).toHaveLength(6);
    expect(d.missing).toBe(0);
    expect(keySummary(d)).toBe('6 common · +1 added · −1 dropped · 0 missing');
    expect(keySummary(d)).not.toMatch(/\d\/\d/);
  });

  it('counts a degree the field lacks as missing, never as added', () => {
    expect(keyDiff([0, 1], [0, null])).toEqual({
      common: [0],
      added: [],
      dropped: [1],
      missing: 1,
    });
  });
});

describe('Switch and Add', () => {
  it('Switch makes the key the subset with its root as mode root', () => {
    const { keys } = keysFor(c12());
    const g = keys.keyRings.find((r) => r.rootIdx === 7)!;
    const next = switchTo(g.idx, g.rootIdx);
    const s = run(c12(), { type: 'sel/set', idx: next.idx, mode: next.mode });
    expect(activeTab(s).sel).toEqual([0, 2, 4, 6, 7, 9, 11]);
    expect(activeTab(s).sel[activeTab(s).mode]).toBe(7);
  });

  it('Add joins the key notes and keeps the mode root note', () => {
    // mode 2 reads the scale from E (idx 4): its keys are transpositions of E phrygian, so the joined notes differ
    const base = run(c12(), { type: 'mode/set', mode: 2 });
    const { keys } = keysFor(base);
    const g = keys.keyRings.find((r) => r.rootIdx === 7)!;
    const before = activeTab(base).sel;
    const next = addTo(before, 2, g.idx);
    const s = run(base, { type: 'sel/join', idx: next.idx });
    const t = activeTab(s);
    expect(t.sel).toEqual(
      [...new Set([...before, ...g.idx.filter((i): i is number => i !== null)])].sort(
        (a, b) => a - b
      )
    );
    expect(t.sel[t.mode]).toBe(4);
    expect(next.mode).toBe(t.mode);
    // from the root C (mode 0) with the G major key: F stays, F# joins
    const c = run(c12(), {
      type: 'sel/join',
      idx: keysFor(c12()).keys.keyRings[7].idx.filter((i): i is number => i !== null),
    });
    expect(activeTab(c).sel).toEqual([0, 2, 4, 5, 6, 7, 9, 11]);
    expect(activeTab(c).sel[activeTab(c).mode]).toBe(0);
  });

  it('sel/join with nothing selected selects the notes (mode 0); bad indices are ignored', () => {
    const s = run(c12(), { type: 'sel/none' }, { type: 'sel/join', idx: [3, 99, -1] });
    expect(activeTab(s).sel).toEqual([3]);
    expect(activeTab(s).mode).toBe(0);
  });

  it('Add of notes already inside the subset changes nothing', () => {
    const s0 = c12();
    const s1 = run(s0, { type: 'sel/join', idx: [0, 4, 7] });
    expect(activeTab(s1).sel).toEqual(activeTab(s0).sel);
    expect(activeTab(s1).mode).toBe(activeTab(s0).mode);
  });
});

describe('which key the big view shows', () => {
  const sig = subsetSig(0, 'f', [0, 2, 4], 0);
  it('hover wins, then the last click on this subset, then the current key', () => {
    expect(viewedKey(5, { root: 7, sig }, sig, 0)).toBe(5);
    expect(viewedKey(null, { root: 7, sig }, sig, 0)).toBe(7);
    expect(viewedKey(null, null, sig, 0)).toBe(0);
  });
  it('a click is forgotten when the subset (notes, mode, tab or field) changes', () => {
    const clicked = { root: 7, sig };
    for (const other of [
      subsetSig(0, 'f', [0, 2, 5], 0),
      subsetSig(0, 'f', [0, 2, 4], 1),
      subsetSig(1, 'f', [0, 2, 4], 0),
      subsetSig(0, 'g', [0, 2, 4], 0),
    ]) {
      expect(viewedKey(null, clicked, other, 3)).toBe(3);
    }
  });
});

describe('layout: Keys and Modes split', () => {
  it('has a Modes panel id', () => {
    expect(PANEL_IDS).toContain('modes');
  });

  it('a combined panel alone in its column: Modes goes directly below Keys, in that column', () => {
    const l: Layout = { left: [['keys'], ['chords']], right: [['viz1']] };
    expect(splitKeysModes(l)).toEqual({ left: [['keys', 'modes'], ['chords']], right: [['viz1']] });
  });

  it('in a stack: Modes takes the next slot below Keys, others keep their order', () => {
    expect(splitKeysModes({ left: [], right: [['viz1', 'keys']] }).right).toEqual([
      ['viz1', 'keys', 'modes'],
    ]);
    expect(splitKeysModes({ left: [['keys', 'chords']], right: [] }).left).toEqual([
      ['keys', 'modes', 'chords'],
    ]);
  });

  it('a full column of three has no free slot: Modes is its own column just inside', () => {
    const left = splitKeysModes({ left: [['keys', 'chords', 'viz1'], ['spectrum']], right: [] });
    expect(left.left).toEqual([['keys', 'chords', 'viz1'], ['modes'], ['spectrum']]);
    const right = splitKeysModes({ left: [], right: [['spectrum'], ['keys', 'chords', 'viz1']] });
    expect(right.right).toEqual([['spectrum'], ['modes'], ['keys', 'chords', 'viz1']]);
  });

  it('absent combined panel, or Modes already pinned: unchanged (same object)', () => {
    const none: Layout = { left: [['chords']], right: [['viz1']] };
    expect(splitKeysModes(none)).toBe(none);
    const both: Layout = { left: [['keys'], ['modes']], right: [] };
    expect(splitKeysModes(both)).toBe(both);
    expect(splitKeysModes(DEFAULT_LAYOUT)).toBe(DEFAULT_LAYOUT);
  });

  it('drops the stored shares of the column it changed', () => {
    const l: Layout = { left: [['keys', 'chords']], right: [], splits: { keys: [0.3, 0.7] } };
    expect(splitKeysModes(l).splits).toBeUndefined();
  });

  it('an old stored layout (no marker) is split on load; nothing else is lost', () => {
    const raw = '{"left":[["keys"],["chords"]],"right":[["viz1"],["spectrum"]]}';
    expect(loadStoredLayout(raw)).toEqual({
      left: [['keys', 'modes'], ['chords']],
      right: [['viz1'], ['spectrum']],
    });
    expect(parseLayout(raw).left).toEqual([['keys'], ['chords']]); // parsing alone does not migrate
  });

  it('a marked layout is left alone, so unpinning Modes sticks', () => {
    const raw = '{"left":[["keys"]],"right":[],"keysModesSplit":true}';
    expect(loadStoredLayout(raw)).toEqual({ left: [['keys']], right: [] });
  });

  describe('storage', () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => window.localStorage.clear());

    it('loadLayout migrates an old layout without writing anything', () => {
      const raw = '{"left":[["keys"]],"right":[["viz1"]]}';
      window.localStorage.setItem(KEY_LAYOUT, raw);
      expect(loadLayout()).toEqual({ left: [['keys', 'modes']], right: [['viz1']] });
      expect(window.localStorage.getItem(KEY_LAYOUT)).toBe(raw);
    });

    it('a saved layout is marked, round-trips, and keeps Modes unpinned', () => {
      const l: Layout = { left: [['keys']], right: [['viz1']] };
      saveLayout(l);
      expect(JSON.parse(window.localStorage.getItem(KEY_LAYOUT)!)).toMatchObject({
        keysModesSplit: true,
      });
      expect(loadLayout()).toEqual(l);
    });

    it('a layout with no Keys panel is unchanged by loading', () => {
      window.localStorage.setItem(KEY_LAYOUT, '{"left":[["chords"]],"right":[]}');
      expect(loadLayout()).toEqual({ left: [['chords']], right: [] });
    });
  });
});
