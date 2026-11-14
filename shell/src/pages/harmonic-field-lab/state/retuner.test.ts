// The retuner's lab state (state/retuner.ts) through the lab reducer: card list rules, settings, held keys, and the M2
// drift vector (I - vi - ii - V - I over 5-limit JI cards) run as key presses. No DOM: storage is in retunerStorage.test.tsx.
import { describe, expect, it } from 'vitest';
import { fmtRatio, mFrac, type Monzo, type Note } from '../../../lib/harmonic-field';
import { defaultGen } from './generate';
import { initialState, labReducer, makeTab, type Action, type LabState } from './labState';
import { sanitizeRetuner } from './persist';
import {
  MAX_CARDS,
  type DormantCard,
  defaultRetSettings,
  driftOf,
  fmtBase,
  heldHz,
  initialRetuner,
  litIndex,
  retunerLive,
  shiftOf,
  type RetCard,
} from './retuner';
import { cardFromSnapshot, cardFromTab } from './retunerCards';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const jiTab = (notes: string[]) =>
  makeTab('t1', { ...defaultGen(), method: 'custom', custom: notes.join('\n'), rep: '2/1' });
// A: 5-limit major, 9/8 second. B: the same with the 10/9 second (only degree 1 differs, by 81/80).
const A = ['9/8', '5/4', '4/3', '3/2', '5/3', '15/8'];
const B = ['10/9', '5/4', '4/3', '3/2', '5/3', '15/8'];
const card = (name: string, notes: string[]): RetCard => ({
  ...(cardFromTab(jiTab(notes)) as RetCard),
  name,
});
const threeCards = () => [card('home', A), card('A', A), card('B', B)];
const withCards = (cards: RetCard[], on = true): LabState => ({
  ...initialState(),
  retuner: { ...initialRetuner(cards), on },
});

let clock = 0;
const down = (slot: number): Action => ({ type: 'ret/down', slot, t: ++clock });
/** A chord pressed key by key (the first key is the longest-held, so with Longest it is the pivot), then released. */
const play = (s: LabState, slots: number[]): LabState => {
  let n = run(s, ...slots.map(down));
  const during = n;
  n = run(n, ...slots.map((slot): Action => ({ type: 'ret/up', slot })));
  return { ...n, retuner: { ...n.retuner, last: during.retuner.last } };
};
const slot = (deg: number, oct = 0) => deg + 7 * oct;
// I C E G, vi A C' E', ii A D F, V D' G B, I G C E: the first key of each chord is the common tone with the last
const PROGRESSION = [
  [slot(0), slot(2), slot(4)],
  [slot(5), slot(0, 1), slot(2, 1)],
  [slot(5), slot(1), slot(3)],
  [slot(1, 1), slot(4), slot(6)],
  [slot(4), slot(0), slot(2)],
];

describe('cards from tabs and snapshots', () => {
  it('a card is the subset read from its mode root; an empty subset makes none', () => {
    const c = card('x', A);
    expect(c.notes).toHaveLength(7);
    expect(c.notes[0]).toEqual({ m: {}, c: 0 });
    expect(fmtRatio(c.notes[1] as Note)).toBe('9/8');
    const empty = { ...jiTab(A), sel: [] };
    expect(cardFromTab(empty)).toBeNull();
    const modal = card('mode 2', A);
    expect(modal.rep.c).toBeCloseTo(1200, 9);
    const t = { ...jiTab(A), mode: 1 };
    const d = cardFromTab(t) as RetCard;
    expect(fmtRatio(d.notes[1] as Note)).toBe('10/9'); // the 9/8 scale from its second degree
  });

  it('a stored snapshot rebuilds the same notes; one that selects nothing builds none', () => {
    const c = card('x', B);
    const back = cardFromSnapshot('x', c.snap) as RetCard;
    expect(back.notes.map((n) => n.c)).toEqual(c.notes.map((n) => n.c));
    expect(cardFromSnapshot('x', { ...c.snap, selCents: [] })).toBeNull();
    expect(cardFromSnapshot('x', { ...c.snap, selCents: [123.456] })).toBeNull();
    expect(cardFromSnapshot('x', null as never)).toBeNull();
  });
});

describe('card list', () => {
  it('adds (no empty cards, capped), renames, reorders, deletes and makes a card home; the run resets', () => {
    let s = run(initialState(), { type: 'ret/add', card: card('  First   card ', A) });
    expect(s.retuner.cards.map((c) => c.name)).toEqual(['First card']);
    s = run(s, { type: 'ret/add', card: card('B', B) }, { type: 'ret/add', card: card('C', A) });
    expect(s.retuner.cards.map((c) => c.name)).toEqual(['First card', 'B', 'C']);
    expect(s.retuner.bases).toHaveLength(3);
    s = run(s, { type: 'ret/rename', index: 1, name: '  10/9 major ' });
    expect(s.retuner.cards[1].name).toBe('10/9 major');
    expect(run(s, { type: 'ret/rename', index: 1, name: '   ' }).retuner.cards[1].name).toBe(
      '10/9 major'
    );
    s = run(s, { type: 'ret/move', index: 2, by: -1 });
    expect(s.retuner.cards.map((c) => c.name)).toEqual(['First card', 'C', '10/9 major']);
    expect(run(s, { type: 'ret/move', index: 0, by: -1 })).toBe(s);
    expect(run(s, { type: 'ret/move', index: 2, by: 1 })).toBe(s);
    s = run(s, { type: 'ret/home', index: 2 });
    expect(s.retuner.cards.map((c) => c.name)).toEqual(['10/9 major', 'First card', 'C']);
    expect(run(s, { type: 'ret/home', index: 0 })).toBe(s);
    s = run(s, { type: 'ret/delete', index: 1 });
    expect(s.retuner.cards.map((c) => c.name)).toEqual(['10/9 major', 'C']);
    expect(run(s, { type: 'ret/delete', index: 9 })).toBe(s);
    const none = { ...card('none', A), notes: [] };
    expect(run(s, { type: 'ret/add', card: none })).toBe(s);
    const full = withCards(Array.from({ length: MAX_CARDS }, () => card('x', A)));
    expect(run(full, { type: 'ret/add', card: card('y', A) })).toBe(full);
    // stored-but-unplayable cards count toward the cap too (a save writes cards + dormant, a reload keeps 24)
    const spec = { name: 'dead', snap: {} } as unknown as DormantCard['spec'];
    const almost = withCards(Array.from({ length: MAX_CARDS - 1 }, () => card('x', A)));
    const nearlyFull = { ...almost, retuner: { ...almost.retuner, dormant: [{ at: 0, spec }] } };
    expect(run(nearlyFull, { type: 'ret/add', card: card('y', A) })).toBe(nearlyFull);
  });

  it('reordering or deleting puts every root back on 1/1 and card 0 active', () => {
    let s = withCards(threeCards());
    s = play(s, PROGRESSION[2]);
    s = play(s, PROGRESSION[3]);
    expect(driftOf(s.retuner).c).not.toBe(0);
    s = run(s, { type: 'ret/move', index: 2, by: -1 });
    expect(s.retuner.active).toBe(0);
    expect(s.retuner.last).toBeNull();
    expect(s.retuner.log).toEqual([]);
    expect(s.retuner.bases.every((b) => b.c === 0)).toBe(true);
  });

  it('a card list change does not touch the stored identity of the cards when only the run moves', () => {
    const s = withCards(threeCards());
    const cards = s.retuner.cards;
    const after = play(s, PROGRESSION[0]);
    expect(after.retuner.cards).toBe(cards);
    expect(after.retuner.settings).toBe(s.retuner.settings);
    expect(run(s, { type: 'ret/reset' }).retuner.cards).toBe(cards);
  });
});

describe('settings', () => {
  it('patches and clamps; an unchanged patch changes nothing', () => {
    const s = initialState();
    expect(s.retuner.settings).toEqual({
      pivot: 'longest',
      manualDeg: 0,
      anchor: 'freestyle',
      trigger: 'auto',
      scorer: 'roughness',
      scorerOpts: { harmonics: 7, rolloff: 0.88, oddLimit: 9 },
      glideMs: 120,
    });
    expect(run(s, { type: 'ret/settings', patch: { pivot: 'longest' } })).toBe(s);
    const n = run(s, {
      type: 'ret/settings',
      patch: {
        pivot: 'manual',
        manualDeg: 999,
        glideMs: -5,
        scorer: 'lattice',
        scorerOpts: { oddLimit: 15, rolloff: 7, harmonics: 3.9 },
      },
    });
    expect(n.retuner.settings).toMatchObject({
      pivot: 'manual',
      manualDeg: 255,
      glideMs: 0,
      scorer: 'lattice',
      scorerOpts: { oddLimit: 15, rolloff: 1, harmonics: 3 },
    });
    const bad = run(s, { type: 'ret/settings', patch: { pivot: 'sideways' as never } });
    expect(bad.retuner.settings.pivot).toBe('longest');
  });
});

describe('keys', () => {
  it('only a live retuner (on, with a card) takes keys; turning it on or off drops held keys', () => {
    const off = withCards(threeCards(), false);
    expect(run(off, down(0))).toBe(off);
    const noCards = withCards([], true);
    expect(retunerLive(noCards.retuner)).toBe(false);
    expect(run(noCards, down(0))).toBe(noCards);
    let s = run(withCards(threeCards()), down(0));
    expect(s.retuner.held).toHaveLength(1);
    s = run(s, { type: 'ret/on', on: false });
    expect(s.retuner.held).toEqual([]);
  });

  it('a key is a degree of the active card; a repeated key-down and a dead slot are ignored', () => {
    let s = withCards(threeCards());
    s = run(s, down(9));
    expect(s.retuner.held[0]).toMatchObject({ key: 9, deg: 2, oct: 1 });
    expect(run(s, down(9))).toBe(s);
    expect(run(s, down(999))).toBe(s);
    expect(run(s, { type: 'ret/up', slot: 4 })).toBe(s);
    expect(run(s, { type: 'ret/up', slot: 9 }).retuner.held).toEqual([]);
    expect(run(s, down(10), { type: 'ret/release' }).retuner.held).toEqual([]);
  });

  it('Auto retunes on every key-down with two or more keys held, never on one key or on release', () => {
    let s = withCards(threeCards());
    s = run(s, down(0));
    expect(s.retuner.last).toBeNull();
    s = run(s, down(2));
    expect(s.retuner.last?.step).toBe(1);
    s = run(s, down(4));
    expect(s.retuner.last?.step).toBe(2);
    s = run(s, { type: 'ret/up', slot: 4 });
    expect(s.retuner.last?.step).toBe(2);
  });

  it('Manual waits for Retune now; with nothing held it does nothing', () => {
    let s = run(withCards(threeCards()), {
      type: 'ret/settings',
      patch: { trigger: 'manual' },
    });
    s = run(s, down(5), down(7), down(9));
    expect(s.retuner.last).toBeNull();
    s = run(s, { type: 'ret/retune' });
    expect(s.retuner.last?.step).toBe(1);
    expect(s.retuner.last?.held).toHaveLength(3);
    const idle = run(withCards(threeCards()), { type: 'ret/retune' });
    expect(idle.retuner.last).toBeNull();
  });

  it('the held keys sound at the chosen card: heldHz equals the engine prediction, the pivot never moves', () => {
    let s = withCards(threeCards());
    s = run(s, down(slot(1)), down(slot(3)), down(slot(5))); // D F A, pivot D (longest)
    const r = s.retuner.last!.result;
    expect(r.chosen).toBe(2); // 10:12:15 wants the 10/9 card
    expect(s.retuner.active).toBe(2);
    s.retuner.held.forEach((h, i) => {
      expect(heldHz(s.retuner, h, 261.6256)).toBeCloseTo(r.predictions[2][i], 9); // the step ran at the 1/1 Hz setting
    });
    // the pivot (D, degree 1 of the card that was active, 9/8) keeps its pitch
    const before = (261.6256 * 9) / 8;
    expect(heldHz(s.retuner, s.retuner.held[0], 261.6256)).toBeCloseTo(before, 9);
  });

  it('Manual pivot by degree: the degree need not be held', () => {
    let s = run(withCards(threeCards()), {
      type: 'ret/settings',
      patch: { pivot: 'manual', manualDeg: 4 },
    });
    s = run(s, down(slot(1)), down(slot(3)), down(slot(5)));
    expect(s.retuner.last!.result.why.pivot).toEqual({ deg: 4, mode: 'manual' });
    expect(s.retuner.last!.result.why.reason).toBeUndefined();
  });

  it('lit index: a retuned pitch lights the field note it coincides with, in any octave, else nothing', () => {
    const field = [0, 386.3137, 701.955];
    expect(litIndex(field, 1200, 386.3137)).toBe(1);
    expect(litIndex(field, 1200, 1200 + 701.955)).toBe(2);
    expect(litIndex(field, 1200, -813.6863)).toBe(1);
    expect(litIndex(field, 1200, 390)).toBe(-1);
    expect(litIndex([], 1200, 0)).toBe(-1);
  });
});

describe('the M2 drift vector, played as keys (Roughness scorer, the default)', () => {
  const ratioOf = (s: LabState) => {
    const d = driftOf(s.retuner);
    return d.m ? fmtRatio(d as Note) : '?';
  };
  const through = (anchor: 'freestyle' | 'fixed') => {
    let s = run(withCards(threeCards()), { type: 'ret/settings', patch: { anchor } });
    const out: { chosen: number; ratio: string; cents: number }[] = [];
    for (const chord of PROGRESSION) {
      s = play(s, chord);
      out.push({ chosen: s.retuner.active, ratio: ratioOf(s), cents: driftOf(s.retuner).c });
    }
    return { s, out };
  };

  it('Freestyle accumulates the syntonic comma: 80/81 = -21.506 c, as an exact monzo', () => {
    const { s, out } = through('freestyle');
    expect(out.map((o) => o.chosen)).toEqual([0, 0, 2, 0, 0]);
    expect(out.map((o) => o.ratio)).toEqual(['1/1', '1/1', '1/1', '80/81', '80/81']);
    expect(out[4].cents).toBeCloseTo(-21.5063, 3);
    expect(s.retuner.bases[0].m).toEqual({ 2: 4, 3: -4, 5: 1 });
    expect(mFrac(s.retuner.bases[0].m as Monzo)).toEqual([80n, 81n]);
    expect(s.retuner.log.map((l) => l.chosenName)).toEqual(expect.arrayContaining(['home', 'B']));
  });

  it('Fixed: the home scale never moves, card 0 is never chosen, drift is exactly 0', () => {
    const { s, out } = through('fixed');
    expect(out.every((o) => o.chosen !== 0)).toBe(true);
    expect(out.map((o) => o.chosen)).toEqual([1, 1, 2, 1, 1]);
    expect(out.map((o) => o.ratio)).toEqual(['1/1', '1/1', '1/1', '1/1', '1/1']);
    expect(out.every((o) => o.cents === 0)).toBe(true);
    expect(s.retuner.bases[0]).toEqual({ m: {}, c: 0 });
  });

  it('the same vector with the Manual pivot by degree (the common tone of each chord, as in M2)', () => {
    let s = run(withCards(threeCards()), { type: 'ret/settings', patch: { pivot: 'manual' } });
    const pivots = [0, 5, 5, 1, 4];
    PROGRESSION.forEach((chord, i) => {
      s = run(s, { type: 'ret/settings', patch: { manualDeg: pivots[i] } });
      s = play(s, [...chord].reverse());
    });
    expect(ratioOf(s)).toBe('80/81');
    expect(driftOf(s.retuner).c).toBeCloseTo(-21.5063, 3);
  });

  it('Reset roots clears the drift and the history', () => {
    let { s } = through('freestyle');
    s = run(s, { type: 'ret/reset' });
    expect(driftOf(s.retuner).c).toBe(0);
    expect(s.retuner.log).toEqual([]);
    expect(s.retuner.active).toBe(0);
    expect(s.retuner.bases.every((b) => b.c === 0)).toBe(true);
  });
});

describe('sanitizeRetuner', () => {
  const good = () => ({
    name: 'A',
    snap: card('A', A).snap,
  });
  it('keeps good cards, drops bad ones one by one, defaults the rest', () => {
    const out = sanitizeRetuner({
      cards: [good(), { name: 'no snap' }, 5, null, { ...good(), name: '  ' }, { snap: 'x' }],
      settings: {
        pivot: 'lowest',
        anchor: 'sideways',
        glideMs: 99999,
        scorerOpts: { rolloff: 'x' },
      },
    });
    expect(out.cards.map((c) => c.name)).toEqual(['A', 'Card 2']);
    expect(out.settings).toEqual({
      ...defaultRetSettings(),
      pivot: 'lowest',
      glideMs: defaultRetSettings().glideMs,
    });
  });

  it('anything that is not the shape gives no cards and the default settings', () => {
    for (const raw of [undefined, null, 3, 'x', [], { cards: 'x' }]) {
      expect(sanitizeRetuner(raw)).toEqual({ cards: [], settings: defaultRetSettings() });
    }
  });

  it('cuts long names and caps the list', () => {
    const many = Array.from({ length: MAX_CARDS + 10 }, () => ({
      ...good(),
      name: 'x'.repeat(200),
    }));
    const out = sanitizeRetuner({ cards: many });
    expect(out.cards).toHaveLength(MAX_CARDS);
    expect(out.cards[0].name).toHaveLength(60);
  });
});

describe('Parallel | Relative: where the cards start', () => {
  const FIFTH: RetCard['root'] = { m: { 2: -1, 3: 1 }, c: 701.955 };
  const rooted = (cards: RetCard[]) => cards.map((c) => ({ ...c, root: FIFTH }));
  const relativeState = () =>
    run(withCards(rooted(threeCards())), { type: 'ui', patch: { modePlayback: 'relative' } });

  it('Parallel starts every card on 1/1; Relative starts it at its own mode root', () => {
    const par = withCards(rooted(threeCards()));
    expect(par.retuner.bases.every((b) => b.c === 0)).toBe(true);
    const rel = relativeState();
    expect(rel.retuner.relative).toBe(true);
    expect(rel.retuner.bases.every((b) => b.c === 701.955 && b.m?.[3] === 1)).toBe(true);
    // a real mode: the card made from a tab at mode 2 has that mode root's cents and monzo
    const modal = cardFromTab({ ...jiTab(A), mode: 1 }) as RetCard;
    expect(fmtRatio(modal.root as Note)).toBe('9/8');
    expect(modal.root.c).toBeCloseTo(203.91, 2);
    expect(card('x', A).root).toEqual({ m: {}, c: 0 });
  });

  it('the first key sounds at the card root in Relative, at 1/1 Hz in Parallel', () => {
    const hzOfFirst = (s: LabState) =>
      heldHz(run(s, down(0)).retuner, { key: 0, deg: 0, oct: 0, t: 0 }, 261.6256);
    expect(hzOfFirst(withCards(rooted(threeCards())))).toBeCloseTo(261.6256, 9);
    expect(hzOfFirst(relativeState())).toBeCloseTo(261.6256 * 1.5, 6);
  });

  it('the drift vector gives 80/81 = -21.506 c in Relative too (drift is against the start)', () => {
    let s = run(relativeState(), { type: 'ret/settings', patch: { anchor: 'freestyle' } });
    for (const chord of PROGRESSION) {
      s = play(s, chord);
    }
    const d = driftOf(s.retuner);
    expect(fmtRatio(d as Note)).toBe('80/81');
    expect(d.c).toBeCloseTo(-21.5063, 3);
    // the card roots read as shifts from their start, not as absolute pitches
    expect(fmtBase(shiftOf(s.retuner, 0, s.retuner.bases[0]))).toBe('80/81');
    expect(fmtBase(shiftOf(s.retuner, 1, s.retuner.bases[1]))).toBe('80/81'); // the same scale as card 0
    let f = run(relativeState(), { type: 'ret/settings', patch: { anchor: 'fixed' } });
    for (const chord of PROGRESSION) {
      f = play(f, chord);
    }
    expect(driftOf(f.retuner).c).toBe(0);
  });

  it('switching Parallel | Relative resets the run and drops held keys; an unchanged setting does not', () => {
    let s = withCards(rooted(threeCards()));
    s = run(s, down(slot(1)), down(slot(3)), down(slot(5)));
    expect(s.retuner.active).toBe(2);
    const same = run(s, { type: 'ui', patch: { modePlayback: 'parallel', volume: 0.3 } });
    expect(same.retuner).toBe(s.retuner);
    const sw = run(s, { type: 'ui', patch: { modePlayback: 'relative' } });
    expect(sw.retuner.held).toEqual([]);
    expect(sw.retuner.active).toBe(0);
    expect(sw.retuner.last).toBeNull();
    expect(sw.retuner.log).toEqual([]);
    expect(sw.retuner.bases[2].c).toBe(701.955);
    expect(sw.retuner.cards).toBe(s.retuner.cards);
    expect(run(sw, { type: 'ui', patch: { modePlayback: 'parallel' } }).retuner.bases[2].c).toBe(0);
  });
});
