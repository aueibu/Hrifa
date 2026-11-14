// The retuner through the live provider path: real key events, the lab reducer, the voice engine on a fake AudioContext
// (held voices glide, lights, panic), and the storage of `...retuner.v1`. The M2 drift vector is played as key presses.
import { act, render } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fmtRatio, type Note } from '../../../lib/harmonic-field';
import { FakeCtx } from '../audio/fakeContext';
import { KEYS } from '../audio/keymap';
import { useLab, type Lab } from './context';
import { defaultGen } from './generate';
import { LabProvider, restoreState } from './LabProvider';
import { initialState, makeTab, type LabState } from './labState';
import { KEY_RETUNER, loadRetuner, saveRetuner } from './persist';
import { defaultRetSettings, driftOf, initialRetuner, type RetCard } from './retuner';
import { cardFromTab } from './retunerCards';

const jiTab = (notes: string[]) =>
  makeTab('t1', { ...defaultGen(), method: 'custom', custom: notes.join('\n'), rep: '2/1' });
const A = ['9/8', '5/4', '4/3', '3/2', '5/3', '15/8'];
const B = ['10/9', '5/4', '4/3', '3/2', '5/3', '15/8'];
const card = (name: string, notes: string[]): RetCard => ({
  ...(cardFromTab(jiTab(notes)) as RetCard),
  name,
});
const threeCards = () => [card('home', A), card('A', A), card('B', B)];
const slot = (deg: number, oct = 0) => deg + 7 * oct;

const made: FakeCtx[] = [];
const ctx = () => made[made.length - 1] ?? null;
class TestCtx extends FakeCtx {
  constructor() {
    super();
    made.push(this);
  }
}

const out: { lab: Lab | null } = { lab: null };
function Probe() {
  out.lab = useLab();
  return null;
}
const lab = () => out.lab as Lab;
const retuner = () => lab().state.retuner;

function mount(initial?: Partial<LabState>) {
  const state: LabState = {
    ...initialState(),
    retuner: { ...initialRetuner(threeCards()), on: true },
    ...initial,
  };
  return render(
    <LabProvider initial={state}>
      <Probe />
    </LabProvider>
  );
}

const keyEvent = (type: 'keydown' | 'keyup', s: number) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: KEYS[s], bubbles: true }));
  });
const press = (...slots: number[]) => slots.forEach((s) => keyEvent('keydown', s));
const release = (...slots: number[]) => slots.forEach((s) => keyEvent('keyup', s));
const dispatch = (a: Parameters<Lab['dispatch']>[0]) => act(() => lab().dispatch(a));

beforeEach(() => {
  window.localStorage.clear();
  made.length = 0;
  (window as unknown as { AudioContext: unknown }).AudioContext = TestCtx;
});
afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

// I C E G, vi A C' E', ii A D F, V D' G B, I G C E (the first key of each chord is its common tone: the Longest pivot)
const PROGRESSION = [
  [slot(0), slot(2), slot(4)],
  [slot(5), slot(0, 1), slot(2, 1)],
  [slot(5), slot(1), slot(3)],
  [slot(1, 1), slot(4), slot(6)],
  [slot(4), slot(0), slot(2)],
];
const drift = () => {
  const d = driftOf(retuner());
  return { ratio: d.m ? fmtRatio(d as Note) : '?', cents: d.c };
};

describe('the M2 drift vector through the keys', () => {
  it('Freestyle: I-vi-ii-V-I over 5-limit JI cards collects 80/81 = -21.506 c while the voices follow', () => {
    mount();
    const seen: string[] = [];
    for (const chord of PROGRESSION) {
      press(...chord);
      release(...chord);
      seen.push(drift().ratio);
    }
    expect(seen).toEqual(['1/1', '1/1', '1/1', '80/81', '80/81']);
    expect(drift().cents).toBeCloseTo(-21.5063, 3);
    expect(retuner().held).toEqual([]);
    expect(retuner().active).toBe(0);
    // every voice is released after the last key-up
    expect(lab().sounding.size).toBe(0);
  });

  it('Fixed: the same chords leave the home card and the drift exactly at 0', () => {
    mount();
    dispatch({ type: 'ret/settings', patch: { anchor: 'fixed' } });
    for (const chord of PROGRESSION) {
      press(...chord);
      release(...chord);
    }
    expect(drift()).toEqual({ ratio: '1/1', cents: 0 });
    expect(retuner().bases[0]).toEqual({ m: {}, c: 0 });
    expect(retuner().active).not.toBe(0);
  });
});

describe('voices, glide and lights', () => {
  it('a key plays the active card (not the tab), lights the tab note it coincides with and stops on key-up', () => {
    mount();
    press(slot(2)); // E of the card: 5/4 above 1/1 Hz
    const osc = ctx()!.oscs[0];
    expect(osc.frequency.events.find((e) => e.kind === 'set')!.v).toBeCloseTo(
      lab().state.ui.baseHz * 1.25,
      6
    );
    // the default tab (Harmonics 8-15) has 5/4, so it lights
    const five = lab().base.ratios.indexOf('5/4');
    expect(lab().sounding.has(five)).toBe(true);
    release(slot(2));
    expect(lab().sounding.size).toBe(0);
    expect(osc.stopAt).not.toBeNull();
  });

  it('Retune now glides the held voices to the chosen card over the glide time', () => {
    mount();
    dispatch({ type: 'ret/settings', patch: { trigger: 'manual', glideMs: 200 } });
    press(slot(1), slot(3), slot(5)); // D F A in the home card, nothing retuned yet
    expect(retuner().last).toBeNull();
    const [d, f, a] = ctx()!.oscs;
    const before = f.frequency.events.filter((e) => e.kind === 'exp').length;
    dispatch({ type: 'ret/retune' });
    const r = retuner().last!.result;
    expect(r.chosen).toBe(2); // 10:12:15 wants the 10/9 card
    expect(retuner().active).toBe(2);
    // the pivot (D, the longest held) keeps its pitch, F and A glide to the prediction of the chosen card
    const glide = (o: FakeCtx['oscs'][number]) =>
      o.frequency.events.filter((e) => e.kind === 'exp');
    expect(glide(d)).toHaveLength(0); // the pivot does not move, so it does not glide
    expect(glide(f)).toHaveLength(before + 1);
    expect(glide(f)[before].v).toBeCloseTo(r.predictions[2][1], 6);
    expect(glide(a).at(-1)!.v).toBeCloseTo(r.predictions[2][2], 6);
    // 200 ms
    expect(glide(f)[before].t).toBeCloseTo(ctx()!.currentTime + 0.2, 6);
    // the pitch of D did not move
    expect(r.predictions[2][0]).toBeCloseTo(lab().state.ui.baseHz * (9 / 8), 6);
  });

  it('with Auto the second key retunes at once and a new key starts at the retuned pitch', () => {
    mount();
    press(slot(1), slot(3)); // D then F
    expect(retuner().last?.step).toBe(1);
    expect(retuner().active).toBe(2);
    const r = retuner().last!.result;
    const f = ctx()!.oscs[1];
    expect(f.frequency.events.find((e) => e.kind === 'set')!.v).toBeCloseTo(r.predictions[2][1], 6);
  });

  it('turning the retuner off hands the keys back to the tab and silences the retuned voices', () => {
    mount();
    press(slot(1), slot(3));
    dispatch({ type: 'ret/on', on: false });
    expect(retuner().held).toEqual([]);
    expect(ctx()!.oscs.every((o) => o.stopAt !== null)).toBe(true);
    const n = ctx()!.oscs.length;
    press(slot(0));
    expect(ctx()!.oscs.length).toBe(n + 1); // the normal tab voice
    expect(retuner().held).toEqual([]);
    release(slot(0));
  });

  it('blur is a panic: the held keys are released and nothing is left lit', () => {
    mount();
    press(slot(0), slot(2), slot(4));
    expect(retuner().held).toHaveLength(3);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(retuner().held).toEqual([]);
    expect(lab().sounding.size).toBe(0);
    expect(ctx()!.oscs.every((o) => o.stopAt !== null)).toBe(true);
    release(slot(0), slot(2), slot(4)); // late key-ups are harmless
    expect(retuner().held).toEqual([]);
  });

  it('a retuned pitch that is no tab note lights nothing', () => {
    mount();
    // the default tab (Harmonics 8-15) has no 5/3
    press(slot(5));
    expect(retuner().held).toHaveLength(1);
    expect(lab().sounding.size).toBe(0);
    release(slot(5));
  });
});

describe('Parallel | Relative through the keys', () => {
  const rooted = (c: RetCard, m: Record<string, number>, cents: number): RetCard => ({
    ...c,
    root: { m, c: cents },
  });
  const fifthCards = () => threeCards().map((c) => rooted(c, { 2: -1, 3: 1 }, 701.955));
  const relative = () => dispatch({ type: 'ui', patch: { modePlayback: 'relative' } });
  const firstHz = () => ctx()!.oscs[0].frequency.events.find((e) => e.kind === 'set')!.v!;

  it('the drift vector is 80/81 = -21.506 c in Relative as well', () => {
    mount({ retuner: { ...initialRetuner(fifthCards()), on: true } });
    relative();
    for (const chord of PROGRESSION) {
      press(...chord);
      release(...chord);
    }
    expect(drift().ratio).toBe('80/81');
    expect(drift().cents).toBeCloseTo(-21.5063, 3);
  });

  it('Relative starts a card at its mode root, Parallel on 1/1 Hz', () => {
    mount({ retuner: { ...initialRetuner(fifthCards()), on: true } });
    press(slot(0));
    expect(firstHz()).toBeCloseTo(lab().state.ui.baseHz, 6);
    release(slot(0));
    relative();
    press(slot(0));
    const hz = ctx()!.oscs[1].frequency.events.find((e) => e.kind === 'set')!.v!;
    expect(hz).toBeCloseTo(lab().state.ui.baseHz * 1.5, 4);
  });

  it('lights follow the switch: the tab mode root sits on 1/1 in Parallel, at its own pitch in Relative', () => {
    mount();
    dispatch({ type: 'mode/set', mode: 2 }); // the tab's mode root is 5/4
    const ratios = lab().base.ratios;
    press(slot(0)); // the card root, 1/1 Hz
    expect([...lab().sounding]).toEqual([ratios.indexOf('5/4')]);
    release(slot(0));
    relative();
    press(slot(0)); // the card (mode 0) starts on its own root, 1/1: that is the field's 1/1
    expect([...lab().sounding]).toEqual([ratios.indexOf('1/1')]);
    release(slot(0));
  });

  it('switching while keys are held resets the run and releases the voices cleanly', () => {
    mount();
    press(slot(1), slot(3), slot(5));
    expect(retuner().active).toBe(2);
    expect(retuner().held).toHaveLength(3);
    relative();
    expect(retuner().held).toEqual([]);
    expect(retuner().active).toBe(0);
    expect(retuner().last).toBeNull();
    expect(ctx()!.oscs.every((o) => o.stopAt !== null)).toBe(true);
    expect(lab().sounding.size).toBe(0);
    release(slot(1), slot(3), slot(5)); // late key-ups are harmless
    expect(retuner().held).toEqual([]);
  });
});

describe('storage (retuner.v1)', () => {
  const settings = () => ({ ...defaultRetSettings(), pivot: 'lowest' as const, glideMs: 250 });

  it('nothing is written on mount; a change writes only { cards: [{ name, snap }], settings }', () => {
    mount();
    expect(window.localStorage.getItem(KEY_RETUNER)).toBeNull();
    dispatch({ type: 'ret/settings', patch: { glideMs: 333 } });
    const raw = JSON.parse(window.localStorage.getItem(KEY_RETUNER)!);
    expect(Object.keys(raw).sort()).toEqual(['cards', 'settings']);
    expect(raw.settings.glideMs).toBe(333);
    expect(raw.cards).toHaveLength(3);
    expect(Object.keys(raw.cards[0]).sort()).toEqual(['name', 'snap']);
    expect(raw.cards[0].snap.gen).toBe('custom');
    // the run is not stored: playing writes nothing more
    const before = window.localStorage.getItem(KEY_RETUNER);
    press(slot(1), slot(3));
    release(slot(1), slot(3));
    expect(window.localStorage.getItem(KEY_RETUNER)).toBe(before);
  });

  it('round-trips cards and settings through the shell save/load and restoreState', () => {
    const cards = threeCards();
    expect(saveRetuner(cards, settings())).toBe(true);
    const loaded = loadRetuner();
    expect(loaded.settings).toEqual(settings());
    expect(loaded.cards.map((c) => c.name)).toEqual(['home', 'A', 'B']);
    const r = restoreState().retuner;
    expect(r.cards.map((c) => c.name)).toEqual(['home', 'A', 'B']);
    expect(r.cards[2].notes.map((n) => n.c)).toEqual(cards[2].notes.map((n) => n.c));
    expect(r.settings).toEqual(settings());
    expect(r.on).toBe(false); // never stored
    expect(r.bases).toHaveLength(3);
  });

  it('bad data falls back to the defaults; a bad card is dropped and nothing is overwritten on mount', () => {
    window.localStorage.setItem(KEY_RETUNER, '{not json');
    expect(restoreState().retuner.cards).toEqual([]);
    expect(restoreState().retuner.settings).toEqual(defaultRetSettings());
    const good = card('keep', A);
    const dead = { name: 'dead', snap: { ...good.snap, selCents: [1234.5678] } };
    const mixed = JSON.stringify({
      cards: [dead, { name: 'junk' }, { name: good.name, snap: good.snap }],
      settings: { pivot: 'recent', scorer: 'nope', glideMs: 'x' },
    });
    window.localStorage.setItem(KEY_RETUNER, mixed);
    const r = restoreState().retuner;
    expect(r.cards.map((c) => c.name)).toEqual(['keep']);
    expect(r.settings).toEqual({ ...defaultRetSettings(), pivot: 'recent' });
    // mounting the provider on it does not rewrite what it could not fully use
    render(
      <LabProvider>
        <Probe />
      </LabProvider>
    );
    expect(window.localStorage.getItem(KEY_RETUNER)).toBe(mixed);
    expect(retuner().cards).toHaveLength(1);
  });

  it('a stored card that cannot play is kept dormant: a save of a changed setting writes it back in place', () => {
    const good = card('keep', A);
    const dead = { name: 'dead', snap: { ...good.snap, selCents: [1234.5678] } };
    window.localStorage.setItem(
      KEY_RETUNER,
      JSON.stringify({
        cards: [{ name: 'first', snap: good.snap }, dead, { name: 'last', snap: good.snap }],
        settings: {},
      })
    );
    const r = restoreState().retuner;
    expect(r.cards.map((c) => c.name)).toEqual(['first', 'last']);
    expect(r.dormant.map((d) => [d.at, d.spec.name])).toEqual([[1, 'dead']]);
    render(
      <LabProvider>
        <Probe />
      </LabProvider>
    );
    dispatch({ type: 'ret/settings', patch: { glideMs: 321 } });
    const raw = JSON.parse(window.localStorage.getItem(KEY_RETUNER)!);
    expect(raw.cards.map((c: { name: string }) => c.name)).toEqual(['first', 'dead', 'last']);
    expect(raw.cards[1].snap.selCents).toEqual([1234.5678]);
    expect(raw.settings.glideMs).toBe(321);
  });

  it('a failed write is reported', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(saveRetuner(threeCards(), settings())).toBe(false);
  });
});
