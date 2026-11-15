// Fill cards (M7c): candidate derivation, dedupe, tags, cap and the worked example through the real retuneStep.
import { describe, expect, it } from 'vitest';
import { fmtRatio, type NamedPitchSet, type Note } from '../../../lib/harmonic-field';
import { deriveBase, keysOf } from './derive';
import {
  FILL_SOURCES,
  fillCandidates,
  planFill,
  planText,
  sameCard,
  sourceBlocker,
  tagOf,
  type FillInput,
  type FillSource,
} from './fillCards';
import { defaultGen } from './generate';
import { initialState, labReducer, makeTab, type Tab } from './labState';
import { MAX_CARDS, defaultRetSettings, initialRetuner, runStep, type RetCard } from './retuner';
import { cardFromSnapshot, cardFromTab } from './retunerCards';

const MAJOR = ['9/8', '5/4', '4/3', '3/2', '5/3', '15/8'];
const jiTab = (notes: string[], extra: Partial<Tab> = {}): Tab => ({
  ...makeTab('t1', { ...defaultGen(), method: 'custom', custom: notes.join('\n'), rep: '2/1' }),
  ...extra,
});
const card = (name: string, tab: Tab): RetCard => ({ ...(cardFromTab(tab) as RetCard), name });
const on = (...s: FillSource[]) => new Set<FillSource>(s);
const input = (tab: Tab, over: Partial<FillInput> = {}): FillInput => ({
  tab,
  keys: keysOf(deriveBase(tab), 0.5)?.keys ?? null,
  subsets: [],
  cards: [],
  dormant: 0,
  ...over,
});
const ratios = (c: RetCard) => c.notes.map((n) => fmtRatio(n as Note));
const chordOf = (c: RetCard) => [1, 3, 5].map((d) => fmtRatio(c.notes[d] as Note)).join(' ');

describe('modes source', () => {
  it('one card per mode with 1-based names; a mode equal to an existing card is dropped', () => {
    const tab = jiTab(MAJOR);
    const all = fillCandidates(input(tab), on('modes'));
    expect(all.map((c) => c.card.name)).toEqual([1, 2, 3, 4, 5, 6, 7].map((i) => `Mode ${i}`));
    expect(ratios(all[1].card)).toEqual(['1/1', '10/9', '32/27', '4/3', '40/27', '5/3', '16/9']);
    const withHome = fillCandidates(input(tab, { cards: [card('Home', tab)] }), on('modes'));
    expect(withHome.map((c) => c.card.name)).toEqual([2, 3, 4, 5, 6, 7].map((i) => `Mode ${i}`));
  });

  it('each card is a whole tab snapshot whose mode is that mode', () => {
    const all = fillCandidates(input(jiTab(MAJOR)), on('modes'));
    expect(all[2].card.snap.mode).toBe(2);
    expect(all[2].card.snap.selCents).toHaveLength(7);
  });
});

describe('keys source', () => {
  const big = () => {
    const tab = jiTab([
      '16/15',
      '9/8',
      '6/5',
      '5/4',
      '4/3',
      '45/32',
      '3/2',
      '8/5',
      '5/3',
      '9/5',
      '15/8',
    ]);
    return { ...tab, sel: [0, 2, 4, 5, 7, 9, 11] }; // 1/1 9/8 5/4 4/3 3/2 5/3 15/8
  };

  it('lists the complete keys by their root ratio; duplicates across sources go (the first source name wins)', () => {
    const t = big();
    const keys = fillCandidates(input(t), on('keys'));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.card.name.startsWith('Key on '))).toBe(true);
    const both = fillCandidates(input(t), on('modes', 'keys'));
    const sigs = both.map(
      (c) => `${c.card.root.c.toFixed(2)}|${c.card.notes.map((n) => n.c.toFixed(2))}`
    );
    expect(new Set(sigs).size).toBe(sigs.length);
    // the key on 1/1 is the tab itself = Mode 1: the modes' name wins
    expect(both.some((c) => c.card.name === 'Key on 1/1')).toBe(false);
    expect(both[0].source).toBe('modes');
    expect(both.length).toBeLessThan(fillCandidates(input(t), on('modes')).length + keys.length);
  });

  it('is empty when the Keys panel is over its cap (keys null) and says why', () => {
    const tab = jiTab(MAJOR);
    const i = input(tab, { keys: null });
    expect(fillCandidates(i, on('keys'))).toEqual([]);
    expect(sourceBlocker('keys', i, true)).toMatch(/size limit/);
    expect(sourceBlocker('keys', input(tab), true)).toBeNull();
  });
});

describe('subsets source', () => {
  const pitch = (r: string): Note => jiTab(MAJOR, {}).field.find((n) => fmtRatio(n) === r) as Note;
  const sub = (id: string, name: string, rs: string[], root = rs[0]): NamedPitchSet => ({
    id,
    name,
    pitches: rs.map(pitch),
    root: pitch(root),
  });

  it('resolves each stored subset against the tab field, skips ones with no match, drops duplicates', () => {
    const tab = jiTab(MAJOR);
    const subsets = [
      sub('a', 'Triad', ['1/1', '5/4', '3/2']),
      sub('b', 'Triad again', ['1/1', '5/4', '3/2']),
      {
        id: 'c',
        name: 'Nowhere',
        pitches: [{ m: { 7: 1 }, c: 968.83 }],
        root: { m: { 7: 1 }, c: 968.83 },
      } as NamedPitchSet,
    ];
    const got = fillCandidates(input(tab, { subsets }), on('subsets'));
    expect(got.map((c) => c.card.name)).toEqual(['Triad']);
    expect(ratios(got[0].card)).toEqual(['1/1', '5/4', '3/2']);
    expect(got[0].tag).toBe('different'); // 3 notes against home's 7
  });

  it('blockers: no owner, no subsets, no selection', () => {
    const tab = jiTab(MAJOR);
    expect(sourceBlocker('subsets', input(tab), false)).toMatch(/not saved/);
    expect(sourceBlocker('subsets', input(tab), true)).toMatch(/no saved subsets/);
    expect(
      sourceBlocker('subsets', input(tab, { subsets: [sub('a', 'x', ['1/1'])] }), true)
    ).toBeNull();
    expect(sourceBlocker('modes', input({ ...tab, sel: [] }), true)).toMatch(/Select/);
  });
});

describe('dedupe, names and tags', () => {
  it('removes cards equal to an existing card and suffixes taken names', () => {
    const tab = jiTab(MAJOR);
    const existing = [card('Mode 2', tab), card('Other', { ...tab, mode: 1 })];
    const got = fillCandidates(input(tab, { cards: existing }), on('modes'));
    // Mode 1 equals existing card 0; Mode 2 equals "Other"
    expect(got.map((c) => c.card.name)).toEqual(['Mode 3', 'Mode 4', 'Mode 5', 'Mode 6', 'Mode 7']);
    const named = fillCandidates(
      input(tab, { cards: [card('Mode 3', { ...tab, sel: [0, 2, 4] })] }),
      on('modes')
    );
    expect(named.map((c) => c.card.name)).toContain('Mode 3 2');
    expect(named.map((c) => c.card.name)).not.toContain('Mode 3');
  });

  it('in Parallel playback every card starts on 1/1, so the root does not make cards different; in Relative it does', () => {
    const tab = jiTab(MAJOR);
    const rel = fillCandidates(input(tab, { relative: true }), on('modes', 'keys'));
    const par = fillCandidates(input(tab, { relative: false }), on('modes', 'keys'));
    expect(par.length).toBeLessThanOrEqual(rel.length);
    const a = card('A', tab);
    const moved = { ...a, root: { ...a.root, c: a.root.c + 300 } };
    expect(sameCard(a, moved)).toBe(false);
    expect(sameCard(a, moved, false)).toBe(true);
  });

  it('every card Fill makes reloads identically from its stored snapshot (mode, key and subset cards)', () => {
    const tab = jiTab(MAJOR);
    for (const c of fillCandidates(input(tab), on('modes', 'keys'))) {
      const back = cardFromSnapshot(c.card.name, c.card.snap);
      expect(back).not.toBeNull();
      expect(sameCard(back!, c.card)).toBe(true);
    }
  });

  it('sameCard compares the notes in cents to 0.01 c at the same root', () => {
    const a = card('a', jiTab(MAJOR));
    expect(sameCard(a, { ...a, notes: a.notes.map((n) => ({ ...n, c: n.c + 0.004 })) })).toBe(true);
    expect(sameCard(a, { ...a, notes: a.notes.map((n) => ({ ...n, c: n.c + 0.02 })) })).toBe(false);
    expect(sameCard(a, { ...a, root: { ...a.root, c: 100 } })).toBe(false);
  });

  it('tags "retuned notes" for a comma difference degree by degree and "different notes" otherwise', () => {
    const home = card('home', jiTab(MAJOR));
    const comma = card('c', jiTab(['10/9', '5/4', '4/3', '3/2', '5/3', '15/8']));
    expect(tagOf(comma, home)).toBe('retuned');
    expect(tagOf(card('f', jiTab(['9/8', '5/4'])), home)).toBe('different');
    const dorian = fillCandidates(input(jiTab(MAJOR)), on('modes'))[1].card;
    expect(tagOf(dorian, home)).toBe('different');
    const shift = (by: number) => ({
      ...home,
      notes: home.notes.map((n, i) => (i === 3 ? { ...n, c: n.c + by } : n)),
    });
    expect(tagOf(shift(29.9), home)).toBe('retuned');
    expect(tagOf(shift(30.5), home)).toBe('different');
  });

  it('an empty list compares with the tab itself', () => {
    const got = fillCandidates(input(jiTab(MAJOR)), on('modes'));
    expect(got[0].tag).toBe('retuned'); // Mode 1 is the tab's own card
  });

  it('no sources, no candidates; the three source ids are fixed', () => {
    expect(fillCandidates(input(jiTab(MAJOR)), on())).toEqual([]);
    expect(FILL_SOURCES).toEqual(['modes', 'keys', 'subsets']);
  });
});

describe('cap', () => {
  it('counts stored dormant cards, adds what fits in list order and says how many would not', () => {
    const cands = fillCandidates(input(jiTab(MAJOR)), on('modes'));
    const all = new Set(cands.map((c) => c.key));
    const p = planFill(cands, all, 20, 1);
    expect(p.room).toBe(MAX_CARDS - 21);
    expect(p.add.map((c) => c.card.name)).toEqual(['Mode 1', 'Mode 2', 'Mode 3']);
    expect(p.over).toBe(4);
    expect(planText(p)).toBe('3 cards will be added; 4 would exceed the 24-card limit.');
    const none = planFill(cands, all, MAX_CARDS, 0);
    expect(none.add).toEqual([]);
    expect(none.over).toBe(7);
    const one = planFill(cands, new Set([cands[4].key]), 0, 0);
    expect(planText(one)).toBe('1 card will be added.');
    expect(one.add[0].card.name).toBe('Mode 5');
  });
});

describe('worked example (engine)', () => {
  it('Fill cards with Modes lets the engine pick the pure 10:12:15 (about 4.45 against 5.63); substituting modes read "different notes"', () => {
    const tab = jiTab(MAJOR);
    const home = card('Major', tab);
    const fill = fillCandidates(input(tab, { cards: [home] }), on('modes'));
    const settings = { ...defaultRetSettings(), pivot: 'manual' as const, manualDeg: 3 };
    const held = [1, 3, 5].map((deg, k) => ({ key: k, deg, oct: 0, t: k + 1 }));
    const run = (cards: RetCard[]) =>
      runStep({ ...initialRetuner(cards, settings), on: true, held });

    // only the major card: 9/8 : 4/3 : 5/3
    const alone = run([home]);
    expect(chordOf(home)).toBe('9/8 4/3 5/3');
    expect(alone.last!.result.scores[0]).toBeCloseTo(5.63, 2);

    const filled = run([home, ...fill.map((c) => c.card)]);
    const res = filled.last!.result;
    const chosen = filled.cards[res.chosen];
    expect(res.scores[res.chosen]).toBeCloseTo(4.45, 2);
    expect(res.scores[res.chosen]).toBeLessThan(res.scores[0]);
    expect(chordOf(chosen)).toBe('10/9 4/3 5/3');
    // every filled mode substitutes notes
    expect(fill.length).toBeGreaterThan(0);
    expect(fill.every((c) => c.tag === 'different')).toBe(true);
    // another mode gives 16/15 : 4/3 : 8/5 at about 4.54
    const sub = filled.cards.findIndex((c) => chordOf(c) === '16/15 4/3 8/5');
    expect(sub).toBeGreaterThan(0);
    expect(res.scores[sub]).toBeCloseTo(4.54, 2);
  });

  it('the lab reducer takes the filled cards through ret/add, keeping the existing ones in place', () => {
    const tab = jiTab(MAJOR);
    let s = labReducer(initialState(), { type: 'ret/add', card: card('Major', tab) });
    const fill = fillCandidates(input(tab, { cards: s.retuner.cards }), on('modes'));
    for (const c of fill) {
      s = labReducer(s, { type: 'ret/add', card: c.card });
    }
    expect(s.retuner.cards.map((c) => c.name)).toEqual([
      'Major',
      ...[2, 3, 4, 5, 6, 7].map((i) => `Mode ${i}`),
    ]);
  });
});
