// M8b through the live provider path: real key events, the lab reducer and the voice engine on a fake AudioContext.
// Melody keys v2 (16 slots, , and . shift), the keyboard modes (Notes | Chords | Split), shelf paging, release safety,
// the linked melody and the retuner taking the melody keys.
import { act, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeCtx } from '../audio/fakeContext';
import { KeyboardDock } from '../components/KeyboardDock';
import { ShelfPanel } from '../components/ShelfPanel';
import { useLab, type Lab } from './context';
import { defaultGen } from './generate';
import { LabProvider } from './LabProvider';
import { initialState, makeTab, type Action, type LabState } from './labState';
import { initialRetuner, type RetCard } from './retuner';
import { cardFromTab } from './retunerCards';

vi.setConfig({ testTimeout: 15_000 });

const made: FakeCtx[] = [];
class TestCtx extends FakeCtx {
  constructor() {
    super();
    made.push(this);
  }
}
const running = () => made.flatMap((c) => c.oscs).filter((o) => o.stopAt === null);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const hzs = () =>
  running()
    .map(hz)
    .sort((a, b) => a - b);
const BASE = 261.6256;

const out: { lab: Lab | null } = { lab: null };
function Probe() {
  out.lab = useLab();
  return null;
}
const lab = () => out.lab as Lab;
const dispatch = (...a: Action[]) => act(() => a.forEach((x) => lab().dispatch(x)));

function mount(initial?: Partial<LabState>) {
  return render(
    <LabProvider initial={{ ...initialState(), ...initial }}>
      <Probe />
      <KeyboardDock open onToggle={() => undefined} />
      <ShelfPanel />
    </LabProvider>
  );
}

const CODES: Record<string, string> = {
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  ';': 'Semicolon',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '=': 'Equal',
};
const codeOf = (k: string) => CODES[k] ?? `Key${k.toUpperCase()}`;
const down = (k: string, init: KeyboardEventInit = {}, target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, code: codeOf(k), bubbles: true, ...init })
    );
  });
const up = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keyup', { key: k, code: codeOf(k), bubbles: true, ...init })
    );
  });
const tap = (k: string) => {
  down(k);
  up(k);
};

const stashAt = (c: number): Action => ({
  type: 'shelf/stash',
  stash: { pitches: [{ m: null, c }], template: null, rootDeg: 0, date: '2026-11-15' },
});
/** `n` one-note chords at 0, 10, 20 ... cents above 1/1 (chord i sounds at BASE * 2^(10 i / 1200)). */
const stashMany = (n: number) => dispatch(...Array.from({ length: n }, (_, i) => stashAt(i * 10)));
const chordHz = (i: number) => BASE * 2 ** ((i * 10) / 1200);

beforeEach(() => {
  window.localStorage.clear();
  made.length = 0;
  (window as unknown as { AudioContext: unknown }).AudioContext = TestCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('Notes mode: melody keys v2', () => {
  it('plays 16 slots (z to m, a to l); the top row, the old long layout and the brackets are silent', () => {
    mount();
    const rel = lab().base.rel;
    // 8 notes: slot 15 is degree 7 one repeat up
    down('l');
    expect(running()).toHaveLength(1);
    expect(hz(running()[0])).toBeCloseTo(BASE * 2 ** ((rel[7].c + 1200) / 1200), 3);
    up('l');
    for (const k of ['q', 'w', 'p', '/', ';', '[', ']', ',', '.']) {
      tap(k);
    }
    expect(made.flatMap((c) => c.oscs)).toHaveLength(1);
    // all 16 keys sound, one voice each
    for (const k of 'zxcvbnmasdfghjkl') {
      down(k);
    }
    expect(running()).toHaveLength(16);
    for (const k of 'zxcvbnmasdfghjkl') {
      up(k);
    }
    expect(running()).toHaveLength(0);
  });

  it(', and . are shifts, not slots: one repeat, clamped at +/-4, key repeat ignored', () => {
    mount();
    tap('.');
    expect(lab().state.keys.shift).toBe(1);
    expect(running()).toHaveLength(0);
    down('z');
    expect(hz(running()[0])).toBeCloseTo(BASE * 2, 3);
    up('z');
    down('.', { repeat: true });
    expect(lab().state.keys.shift).toBe(1);
    for (let i = 0; i < 8; i++) {
      tap('.');
    }
    expect(lab().state.keys.shift).toBe(4);
    for (let i = 0; i < 12; i++) {
      tap(',');
    }
    expect(lab().state.keys.shift).toBe(-4);
    down('z');
    expect(hz(running()[0])).toBeCloseTo(BASE / 16, 3);
    up('z');
  });

  it('a held key keeps its pitch through a shift and is released by its physical key', () => {
    mount();
    down('x');
    const osc = running()[0];
    const f = hz(osc);
    tap('.');
    tap('.');
    expect(running()).toHaveLength(1);
    expect(osc.frequency.events).toHaveLength(1);
    // a new press uses the new shift: the same key one press later is 2 repeats up
    down('c');
    expect(running()).toHaveLength(2);
    // release after the shift stops exactly the voice that was started
    up('x');
    expect(running().map(hz)).not.toContain(f);
    expect(running()).toHaveLength(1);
    up('c');
    expect(running()).toHaveLength(0);
  });

  it('a non-octave repeat: the shift is one repeat (3/1 for Bohlen-Pierce)', () => {
    const gen = { ...defaultGen(), method: 'custom' as const, custom: '1/1\n9/7\n7/5', rep: '3/1' };
    mount({ tabs: [makeTab('t1', gen)] });
    down('x');
    const plain = hz(running()[0]);
    up('x');
    tap('.');
    down('x');
    expect(hz(running()[0]) / plain).toBeCloseTo(3, 6);
    up('x');
  });

  it('the melody keys still set the Sketch root; , and . do not', () => {
    mount();
    down('c');
    expect(lab().state.shelf.sketch.rootDeg).toBe(2);
    up('c');
    tap('.');
    expect(lab().state.shelf.sketch.rootDeg).toBe(2);
  });
});

describe('Chords and Split modes', () => {
  it('Chords: the top row plays shelf slots in order while held; melody keys are silent', () => {
    mount();
    stashMany(3);
    dispatch({ type: 'ui', patch: { keyboardMode: 'chords', modePlayback: 'relative' } });
    down('z');
    expect(running()).toHaveLength(0);
    down('w');
    expect(hzs()[0]).toBeCloseTo(chordHz(1), 3);
    expect(running()).toHaveLength(1);
    down('q');
    expect(hzs().map((h) => Math.round(h * 100))).toEqual(
      [chordHz(0), chordHz(1)].map((h) => Math.round(h * 100))
    );
    up('w');
    expect(running()).toHaveLength(1);
    up('q');
    expect(running()).toHaveLength(0);
    // a key with no chord behind it is silent
    tap('p');
    expect(running()).toHaveLength(0);
  });

  it('[ and ] page the shelf by ten (clamped), and the page decides which chord a key plays', () => {
    mount();
    stashMany(12);
    dispatch({ type: 'ui', patch: { keyboardMode: 'chords', modePlayback: 'relative' } });
    tap(']');
    expect(lab().state.keys.page).toBe(1);
    tap(']');
    expect(lab().state.keys.page).toBe(1);
    down('q');
    expect(hz(running()[0])).toBeCloseTo(chordHz(10), 3);
    up('q');
    down('w');
    expect(hz(running()[0])).toBeCloseTo(chordHz(11), 3);
    up('w');
    down('e');
    expect(running()).toHaveLength(0);
    tap('[');
    expect(lab().state.keys.page).toBe(0);
    down('q');
    expect(hz(running()[0])).toBeCloseTo(chordHz(0), 3);
    up('q');
  });

  it('Notes mode ignores the chord row and the brackets', () => {
    mount();
    stashMany(2);
    tap('q');
    tap(']');
    expect(made.flatMap((c) => c.oscs)).toHaveLength(0);
    expect(lab().state.keys.page).toBe(0);
  });

  it('Split: the melody keys and the chord keys sound together; the shift moves only the melody', () => {
    mount();
    stashMany(1);
    dispatch({ type: 'ui', patch: { keyboardMode: 'split' } });
    tap('.');
    down('q');
    down('z');
    expect(running()).toHaveLength(2);
    expect(hzs().map((h) => Math.round(h * 10))).toEqual(
      [chordHz(0), BASE * 2].map((h) => Math.round(h * 10)).sort((a, b) => a - b)
    );
    up('q');
    up('z');
    expect(running()).toHaveLength(0);
  });

  it('release safety: blur, a hidden tab and the Stop path silence held chord and melody keys', () => {
    mount();
    stashMany(2);
    dispatch({ type: 'ui', patch: { keyboardMode: 'split' } });
    down('q');
    down('z');
    expect(running()).toHaveLength(2);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(running()).toHaveLength(0);
    // a release that follows the panic is harmless
    up('q');
    up('z');
    down('w');
    expect(running()).toHaveLength(1);
    act(() => lab().audio.stopAll());
    expect(running()).toHaveLength(0);
    down('w');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    expect(running()).toHaveLength(0);
  });

  it('never plays while typing in an input', () => {
    mount();
    stashMany(1);
    dispatch({ type: 'ui', patch: { keyboardMode: 'split' } });
    const input = document.createElement('input');
    document.body.appendChild(input);
    down('q', {}, input);
    down('z', {}, input);
    down('.', {}, input);
    expect(made.flatMap((c) => c.oscs)).toHaveLength(0);
    expect(lab().state.keys.shift).toBe(0);
    input.remove();
  });

  it('a Parallel | Relative switch changes what a chord key plays, as the shelf slot does', () => {
    mount();
    // Relative plays the stored pitch; Parallel puts the chord's own root (here its only note) on 1/1
    dispatch(
      { type: 'gen/preset', name: '12-EDO' },
      { type: 'sel/set', idx: [0, 2, 4, 5, 7, 9, 11], mode: 1 },
      stashAt(400),
      { type: 'ui', patch: { keyboardMode: 'chords', modePlayback: 'relative' } }
    );
    down('q');
    expect(hz(running()[0])).toBeCloseTo(BASE * 2 ** (400 / 1200), 3);
    up('q');
    dispatch({ type: 'ui', patch: { modePlayback: 'parallel' } });
    down('q');
    expect(hz(running()[0])).toBeCloseTo(BASE, 3);
    up('q');
  });
});

describe('Linked melody', () => {
  /** A chord stashed from 12-EDO C major read as Dorian; the tab then moves to 19-EDO (the chord keeps its source). */
  function dorianOn19(extra: Partial<LabState['ui']> = {}) {
    mount();
    dispatch(
      { type: 'gen/preset', name: '12-EDO' },
      { type: 'sel/set', idx: [0, 2, 4, 5, 7, 9, 11], mode: 1 },
      stashAt(200),
      { type: 'gen/preset', name: '19-EDO' },
      { type: 'ui', patch: { keyboardMode: 'split', linkedMelody: true, ...extra } }
    );
  }

  it('off by default: a chord key does not link, the melody is the active subset', () => {
    mount();
    stashMany(1);
    dispatch({ type: 'ui', patch: { keyboardMode: 'split' } });
    tap('q');
    expect(lab().state.keys.link).toBeNull();
    down('c');
    expect(hz(running()[0])).toBeCloseTo(BASE * 2 ** (lab().base.rel[2].c / 1200), 3);
    up('c');
  });

  it("pressing a chord key brings that chord's source melody: Parallel puts the Dorian root on 1/1", () => {
    dorianOn19();
    // before any chord key: the active (19-EDO) subset
    down('c');
    expect(hz(running()[0])).toBeCloseTo(BASE * 2 ** (lab().base.rel[2].c / 1200), 3);
    up('c');
    tap('q');
    expect(lab().state.keys.link).toBe('c1');
    // c is the third degree of D Dorian: F, 300 c above its root (12-EDO Dorian is not the 19-EDO scale)
    down('c');
    expect(hz(running()[0])).toBeCloseTo(BASE * 2 ** (300 / 1200), 3);
    up('c');
    // a shift is a repeat of the SOURCE generator
    tap('.');
    down('z');
    expect(hz(running()[0])).toBeCloseTo(BASE * 2, 3);
    up('z');
  });

  it('follows Relative the way a shelf slot does, and lights only a matching field note (a ghost for the rest)', () => {
    dorianOn19({ modePlayback: 'relative' });
    tap('q');
    // F is 500 c above 1/1: no 19-EDO note (505.3 c) lies within half a cent, so it is a ghost, not a light
    down('c');
    expect(hz(running()[0])).toBeCloseTo(BASE * 2 ** (500 / 1200), 3);
    expect(lab().state.soundingGhosts.map((c) => Math.round(c))).toContain(500);
    // the root D (200 c) is no 19-EDO note either; the unison is: the A (700 c) is not, the repeat is
    down('z');
    expect(lab().state.soundingGhosts.map((c) => Math.round(c))).toContain(200);
    up('z');
    up('c');
    expect(lab().state.soundingGhosts).toEqual([]);
    expect(lab().state.sounding.size).toBe(0);
    // the main views stay on the tab
    expect(lab().tab.gen.edoN).toBe(19);
  });

  it('a note that coincides with a field note of the tab lights it', () => {
    mount();
    dispatch(
      { type: 'gen/preset', name: '12-EDO' },
      { type: 'sel/set', idx: [0, 2, 4, 5, 7, 9, 11], mode: 0 },
      stashAt(0),
      { type: 'gen/preset', name: '24-EDO' },
      { type: 'ui', patch: { keyboardMode: 'split', linkedMelody: true } }
    );
    tap('q');
    down('x'); // 200 c: 24-EDO step 4
    expect(lab().state.sounding.size).toBe(1);
    expect(lab().state.soundingGhosts).toEqual([]);
    up('x');
    expect(lab().state.sounding.size).toBe(0);
  });

  it('a non-octave source brings its own repeat (3/1) to the melody shift', () => {
    mount();
    dispatch(
      { type: 'gen/preset', name: 'Bohlen–Pierce (13 ED 3/1)' },
      stashAt(0),
      { type: 'gen/preset', name: '12-EDO' },
      { type: 'ui', patch: { keyboardMode: 'split', linkedMelody: true } }
    );
    tap('q');
    down('z');
    const root = hz(running()[0]);
    up('z');
    tap('.');
    down('z');
    expect(hz(running()[0]) / root).toBeCloseTo(3, 6);
    up('z');
  });

  it('the last chord stays linked; a held melody key keeps its pitch when another chord key changes the link', () => {
    mount();
    dispatch(
      { type: 'gen/preset', name: '12-EDO' },
      { type: 'sel/set', idx: [0, 2, 4, 5, 7, 9, 11], mode: 1 },
      stashAt(200),
      { type: 'sel/set', idx: [0, 2, 4, 5, 7, 9, 11], mode: 0 },
      stashAt(0),
      { type: 'ui', patch: { keyboardMode: 'split', linkedMelody: true } }
    );
    tap('q');
    down('c');
    const f = hz(running()[0]);
    expect(f).toBeCloseTo(BASE * 2 ** (300 / 1200), 3);
    tap('w'); // the C major chord: its melody is major now
    expect(lab().state.keys.link).toBe('c2');
    expect(hz(running()[0])).toBeCloseTo(f, 6);
    up('c');
    down('c');
    expect(hz(running()[0])).toBeCloseTo(BASE * 2 ** (400 / 1200), 3);
    up('c');
  });

  it('resets on a mode change, on the option, on a tab switch, and falls back when the chord is gone', () => {
    dorianOn19();
    tap('q');
    expect(lab().state.keys.link).toBe('c1');
    dispatch({ type: 'ui', patch: { keyboardMode: 'chords' } });
    expect(lab().state.keys.link).toBeNull();
    dispatch({ type: 'ui', patch: { keyboardMode: 'split' } });
    tap('q');
    dispatch({ type: 'ui', patch: { linkedMelody: false } });
    expect(lab().state.keys.link).toBeNull();
    dispatch({ type: 'ui', patch: { linkedMelody: true } });
    tap('q');
    expect(lab().state.keys.link).toBe('c1');
    dispatch({ type: 'tab/add' });
    expect(lab().state.keys.link).toBeNull();
    dispatch({ type: 'tab/switch', index: 0 }, { type: 'keys/link', id: 'c1' });
    dispatch({ type: 'shelf/delete', id: 'c1' });
    // the linked chord is gone: the melody is the active subset again
    down('c');
    expect(hz(running()[0])).toBeCloseTo(BASE * 2 ** (lab().base.rel[2].c / 1200), 3);
    up('c');
  });
});

describe("Parallel | Relative for chords: Parallel puts each chord's own root on 1/1", () => {
  const stashChord = (cents: number[]): Action => ({
    type: 'shelf/stash',
    stash: {
      pitches: cents.map((c) => ({ m: null, c })),
      template: null,
      rootDeg: 0,
      date: '2026-11-15',
    },
  });
  /** C major (0, 400, 700) and E minor (400, 700, 1100), both stashed with the mode root C, 12-EDO. */
  function setup(frame: 'parallel' | 'relative') {
    seen = 0;
    mount();
    dispatch(
      { type: 'gen/preset', name: '12-EDO' },
      { type: 'sel/set', idx: [0, 2, 4, 5, 7, 9, 11], mode: 0 },
      stashChord([0, 400, 700]),
      stashChord([400, 700, 1100]),
      { type: 'ui', patch: { keyboardMode: 'chords', modePlayback: frame } }
    );
  }
  let seen = 0;
  const heardCents = () =>
    made
      .flatMap((c) => c.oscs)
      .slice(seen)
      .map((o) => Math.round(1200 * Math.log2(hz(o) / BASE)))
      .sort((a, b) => a - b);

  it.each([
    ['relative', [0, 400, 700], [400, 700, 1100]],
    ['parallel', [0, 400, 700], [0, 300, 700]],
  ] as const)('%s: chord keys play %j and %j', (frame, major, minor) => {
    setup(frame);
    down('q');
    expect(heardCents()).toEqual(major);
    up('q');
    seen = made.flatMap((c) => c.oscs).length;
    down('w');
    expect(heardCents()).toEqual(minor);
    // the lights land on the real notes in both frames (12-EDO index = steps)
    expect([...lab().state.sounding].sort((a, b) => a - b)).toEqual([4, 7, 11]);
    up('w');
  });

  it.each([
    ['relative', [400, 700, 1100]],
    ['parallel', [0, 300, 700]],
  ] as const)('%s: a shelf slot and a chord chip agree with the chord key', (frame, minor) => {
    vi.useFakeTimers();
    setup(frame);
    act(() => {
      screen.getByRole('button', { name: 'Play Chord 2' }).click();
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(heardCents()).toEqual(minor);
    expect([...lab().state.sounding].sort((a, b) => a - b)).toEqual([4, 7, 11]);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    seen = made.flatMap((c) => c.oscs).length;
    // the chip of the same chord: E minor on field note 4
    act(() => lab().audio.playFieldChord([4, 7, 11], 4));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(heardCents()).toEqual(minor);
    vi.useRealTimers();
  });
});

describe('Shelf cards follow the keys', () => {
  const cards = () =>
    within(screen.getByRole('list', { name: 'Chord shelf' })).getAllByRole('listitem');
  const playing = () => cards().map((c) => c.getAttribute('data-playing') === 'true');
  const badges = () => cards().map((c) => within(c).queryByTestId('slot-key')?.textContent ?? '');

  it('a held chord key lights its card and key-up, blur, a page change and Stop clear it', () => {
    mount();
    stashMany(12);
    dispatch({ type: 'ui', patch: { keyboardMode: 'split' } });
    expect(playing().some(Boolean)).toBe(false);
    down('w');
    expect(playing().indexOf(true)).toBe(1);
    expect(playing().filter(Boolean)).toHaveLength(1);
    up('w');
    expect(playing().some(Boolean)).toBe(false);
    down('e');
    expect(playing()[2]).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(playing().some(Boolean)).toBe(false);
    down('q');
    tap(']');
    expect(playing().some(Boolean)).toBe(false);
    expect(running()).toHaveLength(0);
    tap('[');
    down('q');
    expect(playing()[0]).toBe(true);
    act(() => lab().audio.stopAll());
    expect(playing().some(Boolean)).toBe(false);
  });

  it('a click, hold 1 on a slot and Play selected light their cards the same way', () => {
    vi.useFakeTimers();
    mount();
    stashMany(2);
    act(() => lab().audio.playCents([0], [0], ['c2']));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(playing()).toEqual([false, true]);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(playing()).toEqual([false, false]);
    vi.useRealTimers();
  });

  it('key badges Q to P mark the ten chords of the current page in Chords and Split, none in Notes', () => {
    mount();
    stashMany(12);
    expect(badges().every((b) => b === '')).toBe(true);
    dispatch({ type: 'ui', patch: { keyboardMode: 'chords' } });
    expect(badges()).toEqual([...'QWERTYUIOP'.split(''), '', '']);
    tap(']');
    expect(badges()).toEqual([...Array(10).fill(''), 'Q', 'W']);
    dispatch({ type: 'ui', patch: { keyboardMode: 'split' } });
    expect(badges().slice(10)).toEqual(['Q', 'W']);
    dispatch({ type: 'ui', patch: { keyboardMode: 'notes' } });
    expect(badges().every((b) => b === '')).toBe(true);
  });
});

describe('Linked melody on the dock and under the retuner', () => {
  it('while a chord is linked the dock keys are labelled with its pitches (cents, shift tag), and a press plays them', () => {
    mount();
    dispatch(
      { type: 'gen/preset', name: '12-EDO' },
      { type: 'sel/set', idx: [0, 2, 4, 5, 7, 9, 11], mode: 1 },
      stashAt(200),
      { type: 'gen/preset', name: '19-EDO' },
      { type: 'ui', patch: { keyboardMode: 'split', linkedMelody: true } }
    );
    const keys = () =>
      within(screen.getByRole('group', { name: 'Subset keys' })).getAllByRole('button');
    // not linked yet: the 19-EDO subset (capped at the 16 keys)
    expect(keys()).toHaveLength(16);
    tap('q');
    // linked: the 7 Dorian degrees plus the repeat, labelled in cents above the mode root (Parallel)
    expect(keys()).toHaveLength(8);
    expect(keys()[2].getAttribute('aria-label')).toBe('300.0 c, 300.0 cents');
    tap('.');
    expect(keys()[2].getAttribute('aria-label')).toBe('300.0 c, 1500.0 cents');
    expect(within(keys()[2]).getByTestId('key-shift')).toHaveTextContent('+1');
    expect(screen.getByTestId('shelf-page')).toHaveTextContent('melody of');
    // a dock press plays the linked pitch the label names
    act(() => lab().audio.press(2));
    expect(hz(running()[0])).toBeCloseTo(BASE * 2 ** (1500 / 1200), 3);
    act(() => lab().audio.release(2));
    dispatch({ type: 'ui', patch: { modePlayback: 'relative' } });
    tap('q');
    expect(keys()[2].getAttribute('aria-label')).toBe('500.0 c, 1700.0 cents');
  });

  it('with the retuner live the linked melody gives way: melody keys are the retuners and still set the Sketch root', () => {
    const card = {
      ...(cardFromTab(
        makeTab('t1', {
          ...defaultGen(),
          method: 'custom',
          custom: '9/8\n5/4\n4/3\n3/2',
          rep: '2/1',
        })
      ) as RetCard),
      name: 'home',
    };
    mount({ retuner: { ...initialRetuner([card]), on: true } });
    dispatch(
      { type: 'gen/preset', name: '12-EDO' },
      { type: 'sel/set', idx: [0, 2, 4, 5, 7, 9, 11], mode: 1 },
      stashAt(200),
      { type: 'ui', patch: { keyboardMode: 'split', linkedMelody: true } }
    );
    tap('q');
    expect(lab().state.keys.link).toBe('c1');
    down('c');
    expect(lab().state.retuner.held).toHaveLength(1);
    expect(lab().state.shelf.sketch.rootDeg).toBe(2);
    up('c');
  });
});

describe('Retuner precedence', () => {
  const jiCard = (name: string): RetCard => ({
    ...(cardFromTab(
      makeTab('t1', {
        ...defaultGen(),
        method: 'custom',
        custom: '9/8\n5/4\n4/3\n3/2\n5/3\n15/8',
        rep: '2/1',
      })
    ) as RetCard),
    name,
  });
  const live = () => ({ retuner: { ...initialRetuner([jiCard('home'), jiCard('A')]), on: true } });

  it('in Notes mode the retuner owns the melody keys, and the shift lifts the degree a repeat', () => {
    mount(live());
    tap('.');
    down('z');
    expect(lab().state.retuner.held).toHaveLength(1);
    expect(lab().state.retuner.held[0]).toMatchObject({ deg: 0, oct: 1 });
    up('z');
    expect(lab().state.retuner.held).toHaveLength(0);
  });

  it("in Chords mode the melody keys are not the retuner's and the chord keys still play the shelf", () => {
    mount({ ...live(), keyboardMode: undefined } as Partial<LabState>);
    stashMany(1);
    dispatch({ type: 'ui', patch: { keyboardMode: 'chords' } });
    down('z');
    expect(lab().state.retuner.held).toHaveLength(0);
    down('q');
    expect(running()).toHaveLength(1);
    expect(hz(running()[0])).toBeCloseTo(chordHz(0), 3);
    up('q');
    up('z');
  });

  it('in Split mode the melody keys go to the retuner and the chord keys play the shelf', () => {
    mount(live());
    stashMany(1);
    dispatch({ type: 'ui', patch: { keyboardMode: 'split' } });
    down('z');
    down('q');
    expect(lab().state.retuner.held).toHaveLength(1);
    expect(running()).toHaveLength(2);
    up('z');
    up('q');
    expect(running()).toHaveLength(0);
  });
});
