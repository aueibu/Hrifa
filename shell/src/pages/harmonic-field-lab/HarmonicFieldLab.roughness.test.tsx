/** Live roughness (M8j): what sounds now is scored (held key, ghost, held preview), and the five-visualizer layout loads old data. */
import { act, fireEvent, render, screen, waitFor, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveRoughness, scoreRoughness } from '../../lib/harmonic-field';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { FADE_OUT_MS, LINGER_MS } from './components/RoughnessView';
import { KEY_SETTINGS } from './state/persist';
import { pickPreset, ungroupShapes } from './testUtils';

vi.setConfig({ testTimeout: 15_000 });

const KEY_LAYOUT = 'hrifa.harmonic-field-lab.layout.v1';
const BASE = 261.6256;
const total = () => screen.getByTestId('live-total').textContent;
const pairs = () => screen.queryAllByTestId('live-pair');
const key = (k: string, type: 'keyDown' | 'keyUp' = 'keyDown') =>
  fireEvent[type](document.body, { key: k });

beforeEach(() => {
  window.localStorage.clear();
  ungroupShapes();
  window.innerWidth = 3840;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
  window.localStorage.setItem(KEY_LAYOUT, JSON.stringify({ left: [['keys']], right: [['viz4']] }));
});
afterEach(() => {
  window.innerWidth = 1024;
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  vi.useRealTimers();
});

/** With fake timers on: the frame that shows a release, then the linger and the fade-out. */
const idleAfterLinger = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(40);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LINGER_MS + FADE_OUT_MS + 100);
  });
};

describe('Live roughness view', () => {
  it('d: a held key sounds and the view shows its total; two keys give a pair bar; release shows the hint', async () => {
    render(<HarmonicFieldLabPage />);
    expect(screen.getByTestId('live-hint').textContent).toMatch(/Nothing is sounding/);
    expect(screen.getByTestId('live-hint')).toHaveAttribute('data-visible', 'true');
    // the same blocks exist with nothing sounding: chart frame and the pair box with placeholder rows
    expect(screen.getByTestId('live-curve')).toBeTruthy();
    expect(screen.getByTestId('live-pairs')).toBeTruthy();
    expect(screen.getByTestId('live-pairs').children).toHaveLength(0); // idle: the box is reserved and empty
    expect(total()).toBe('0.00');
    key('z'); // 1/1
    await waitFor(() => expect(total()).toBe(liveRoughness([0], BASE).total.toFixed(2)));
    // no help text for a one-note state
    expect(screen.getByTestId('live-hint')).toHaveAttribute('data-visible', 'false');
    expect(pairs()).toHaveLength(0);
    expect(screen.getByTestId('live-curve')).toBeTruthy();
    key('c'); // 5/4
    const want = liveRoughness([0, 1200 * Math.log2(1.25)], BASE).total.toFixed(2);
    await waitFor(() => expect(total()).toBe(want));
    expect(pairs()).toHaveLength(1);
    expect(screen.getByTestId('live-hint')).toHaveAttribute('data-visible', 'false');
    key('c', 'keyUp');
    await waitFor(() => expect(pairs()).toHaveLength(0));
    expect(total()).toBe(liveRoughness([0], BASE).total.toFixed(2));
    // the last chord lingers for LINGER_MS, then the idle state
    vi.useFakeTimers();
    key('z', 'keyUp');
    await idleAfterLinger();
    expect(total()).toBe('0.00');
    expect(screen.getByTestId('live-hint').textContent).toMatch(/Nothing/);
  });

  it('two keys of the same degree an octave apart are two sounding pitches; each release drops one', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    const top = () => screen.getByTestId('live-top').textContent ?? '';
    key('z'); // degree 0, repeat 0
    key('h'); // slot 12: degree 0 again, one repeat (an octave) up
    await waitFor(() => expect(top()).toContain('2 note'));
    expect(pairs()).toHaveLength(1);
    key('h', 'keyUp');
    await waitFor(() => expect(top()).toContain('1 note'));
    expect(pairs()).toHaveLength(0);
    // the octave key is held again, then the lower one is released: the upper pitch stays
    key('h');
    await waitFor(() => expect(top()).toContain('2 note'));
    key('z', 'keyUp');
    await waitFor(() => expect(top()).toContain('1 note'));
    vi.useFakeTimers();
    key('h', 'keyUp');
    await idleAfterLinger();
    expect(total()).toBe('0.00');
  });

  it('a field change while idle does not restart a running fade', async () => {
    window.localStorage.setItem(
      KEY_LAYOUT,
      JSON.stringify({ left: [['keys']], right: [['viz4']] })
    );
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60)); // real time on purpose: lets the frame the preset change scheduled run
    });
    vi.useFakeTimers();
    const phase = () => screen.getByTestId('live-roughness').getAttribute('data-state');
    key('z');
    act(() => {
      vi.advanceTimersByTime(40);
    });
    key('z', 'keyUp');
    act(() => {
      vi.advanceTimersByTime(40);
    });
    act(() => {
      vi.advanceTimersByTime(LINGER_MS + FADE_OUT_MS / 2);
    });
    expect(phase()).toBe('fading');
    // a subset change rebuilds the field and the labels (new identities) while nothing sounds
    const ring = screen.getByRole('group', { name: /^Pitch circle/ });
    fireEvent.click(within(ring).getAllByRole('button')[3]);
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(phase()).toBe('fading');
    act(() => {
      vi.advanceTimersByTime(FADE_OUT_MS / 2);
    });
    expect(phase()).toBe('idle');
  });

  it('the curve reads a value on keyboard focus and arrow keys', async () => {
    render(<HarmonicFieldLabPage />);
    key('z');
    await waitFor(() => expect(total()).not.toBe('0.00'));
    const slider = screen.getByRole('slider', { name: 'Next-note curve' });
    fireEvent.focus(slider);
    expect(screen.getByTestId('live-curve-value')).toBeTruthy();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^1 c above the lowest note: roughness /);
    key('z', 'keyUp');
  });

  it('e: an off-field (ghost) note counts in the total and the bars', async () => {
    window.localStorage.setItem(
      KEY_LAYOUT,
      JSON.stringify({ left: [['keys', 'chords']], right: [['viz4']] })
    );
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    // let the frame the preset change scheduled run before the clock is faked
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60)); // real time on purpose: lets the frame the preset change scheduled run before the clock is faked
    });
    vi.useFakeTimers();
    const sketch = screen.getByRole('group', { name: 'Sketch a chord' });
    fireEvent.change(within(sketch).getByRole('combobox', { name: 'Sketch template' }), {
      target: { value: '4:5:6:7' },
    });
    fireEvent.click(within(sketch).getByRole('button', { name: 'Play sketch' }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // the view follows at the next animation frame
    act(() => {
      vi.advanceTimersByTime(40);
    });
    // 7/4 is no 12-EDO note: four sounding notes, six pairs, one labelled by its cents
    expect(pairs()).toHaveLength(6);
    expect(pairs().some((p) => /\d c/.test(p.textContent ?? ''))).toBe(true);
    expect(Number(total())).toBeGreaterThan(0);
  });

  it('h: a held mode-tile preview counts as sounding while held', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Analysis panels' })).getByRole('tab', {
        name: /^Modes/,
      })
    );
    const tile = within(screen.getAllByTestId('mode-row')[1]).getAllByTestId('mode-tile')[4];
    fireEvent.mouseEnter(tile);
    fireEvent.keyDown(window, { key: '1' });
    await waitFor(() => expect(total()).not.toBe('0.00'));
    expect(screen.getByText('1 note')).toBeTruthy();
    vi.useFakeTimers();
    fireEvent.keyUp(window, { key: '1' });
    await idleAfterLinger();
    expect(total()).toBe('0.00');
  });
  it('the chart never moves: only the fixed-height top sits above it for 2, 3 and 8 notes, and the pair list is below it', async () => {
    render(<HarmonicFieldLabPage />);
    const above = () => {
      const chart = screen.getByTestId('live-curve');
      const kids = [...chart.closest('[data-testid="live-roughness"]')!.children];
      const at = kids.indexOf(chart.closest('[data-testid="live-roughness"] > *')!);
      return {
        before: kids.slice(0, at).map((k) => k.getAttribute('data-testid')),
        pairsAfter: kids.findIndex((k) => k.querySelector('[data-testid="live-pairs"]')) > at,
      };
    };
    let held = 0;
    expect(above()).toEqual({ before: ['live-top'], pairsAfter: true });
    for (const [count, pairCount] of [
      [1, 0],
      [2, 1],
      [3, 3],
      [8, 28],
    ]) {
      for (; held < count; held++) {
        key('zxcvbnma'[held]);
      }
      await waitFor(() =>
        expect(screen.getByTestId('live-top').textContent).toContain(`${count} note`)
      );
      await waitFor(() => expect(pairs()).toHaveLength(pairCount));
      // only real pairs have rows: never placeholder bars
      expect(screen.getByTestId('live-pairs').children).toHaveLength(pairCount);
      expect(above()).toEqual({ before: ['live-top'], pairsAfter: true });
    }
    for (const k of 'zxcvbnma') {
      key(k, 'keyUp');
    }
  });
  it('the placeholder and the live readout have the same element structure, and only one shows at a time', async () => {
    render(<HarmonicFieldLabPage />);
    const root = () => screen.getByTestId('live-roughness');
    const shape = (el: Element) =>
      [...el.querySelectorAll('*')].map((e) => `${e.tagName}.${e.getAttribute('class')}`).join(' ');
    const layers = () =>
      [...root().querySelectorAll('[data-layer="placeholder"]')].map((ph) => ({
        ph,
        data: ph.parentElement!.querySelector('[data-layer="data"]')!,
      }));
    expect(root().getAttribute('data-state')).toBe('idle');
    const topIdle = shape(layers()[0].data);
    // the total line and the three readout rows each have a placeholder twin
    expect(layers()).toHaveLength(4);
    key('z');
    key('c');
    await waitFor(() => expect(pairs()).toHaveLength(1));
    expect(root().getAttribute('data-state')).toBe('sounding');
    // the total line has the same elements, classes (so the same fixed widths) idle and live
    expect(shape(layers()[0].data)).toBe(topIdle);
    expect(topIdle).toContain('liveTotal');
    expect(topIdle).toContain('liveCount');
    for (const { ph, data } of layers()) {
      expect(shape(ph)).toBe(shape(data));
      expect(ph.getAttribute('aria-hidden')).toBe('true');
    }
    key('z', 'keyUp');
    key('c', 'keyUp');
  });

  it('sources: sounding beats a hovered chord (tag hover), which beats the lingering last chord, which beats idle', async () => {
    window.localStorage.setItem(
      KEY_LAYOUT,
      JSON.stringify({ left: [['keys', 'chords']], right: [['viz4']] })
    );
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    const source = () => screen.getByTestId('live-roughness').getAttribute('data-source');
    // hover: the major triad C E G scores as scoreRoughness of its notes, with no sound
    const chip = screen.getAllByRole('button', { name: /^major triad 4:5:6 on (1\/1|0\.0 c)/i })[0];
    fireEvent.mouseEnter(chip);
    const hz = [0, 400, 700].map((c) => BASE * 2 ** (c / 1200));
    expect(total()).toBe(scoreRoughness(hz).score.toFixed(2));
    expect(source()).toBe('hover');
    expect(screen.getByTestId('live-source').textContent).toBe('hover');
    expect(pairs()).toHaveLength(3);
    // sounding wins: a held key replaces it at once
    key('z');
    await waitFor(() => expect(source()).toBe('sounding'));
    expect(total()).toBe(liveRoughness([0], BASE).total.toFixed(2));
    expect(screen.getByTestId('live-source').textContent).toBe('sounding');
    // release while still hovering: the hovered chord shows again
    vi.useFakeTimers();
    key('z', 'keyUp');
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(source()).toBe('hover');
    // the pointer leaves: the last chord lingers with the same total, then goes idle after LINGER_MS
    fireEvent.mouseLeave(chip);
    expect(source()).toBe('last');
    expect(screen.getByTestId('live-source').textContent).toBe('last chord');
    expect(total()).toBe(liveRoughness([0], BASE).total.toFixed(2));
    const phase = () => screen.getByTestId('live-roughness').getAttribute('data-state');
    const was = total();
    act(() => {
      vi.advanceTimersByTime(LINGER_MS - 1);
    });
    expect(source()).toBe('last');
    expect(phase()).toBe('linger');
    // after LINGER_MS the drawn items fade out over FADE_OUT_MS, still mounted with the same data
    act(() => {
      vi.advanceTimersByTime(1 + FADE_OUT_MS / 2);
    });
    expect(phase()).toBe('fading');
    expect(total()).toBe(was);
    expect(screen.getByTestId('live-source').textContent).toBe('last chord');
    act(() => {
      vi.advanceTimersByTime(FADE_OUT_MS / 2);
    });
    expect(source()).toBe('idle');
    expect(total()).toBe('0.00');
    // a new note during the fade replaces it at once
    key('z');
    act(() => {
      vi.advanceTimersByTime(40);
    });
    key('z', 'keyUp');
    act(() => {
      vi.advanceTimersByTime(40); // the frame that shows the release
    });
    act(() => {
      vi.advanceTimersByTime(LINGER_MS + FADE_OUT_MS / 2);
    });
    expect(phase()).toBe('fading');
    key('x');
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(source()).toBe('sounding');
    expect(phase()).toBe('sounding');
    key('x', 'keyUp');
    act(() => {
      vi.advanceTimersByTime(40);
    });
    act(() => {
      vi.advanceTimersByTime(LINGER_MS + FADE_OUT_MS + 100);
    });
    expect(source()).toBe('idle');
    expect(screen.queryByTestId('live-source')).toBeNull();
  });
});

describe('Live roughness: a hovered or pinned note is a one-note source', () => {
  it('note (hover) and pinned tags, faint field marks for every other field note, sounding beats both', async () => {
    window.localStorage.setItem(
      KEY_LAYOUT,
      JSON.stringify({ left: [['keys']], right: [['viz3'], ['viz4']] })
    );
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    const source = () => screen.getByTestId('live-roughness').getAttribute('data-source');
    const marks = () => screen.queryAllByTestId('live-field-mark');
    const diss = within(screen.getByRole('group', { name: /^Dissonance curve/ }));
    const notes = diss.getAllByRole('button');
    expect(notes).toHaveLength(12);
    expect(marks()).toHaveLength(0); // idle: no lowest note, no marks
    fireEvent.mouseEnter(notes[7]); // 700 c
    expect(source()).toBe('note');
    expect(screen.getByTestId('live-source').textContent).toBe('note');
    // register Shape (default): the lowest note sits at middle C, so a lone note scores its self term there
    expect(total()).toBe(liveRoughness([0], BASE).total.toFixed(2));
    expect(pairs()).toHaveLength(0);
    expect(marks()).toHaveLength(11);
    expect(marks()[0].getAttribute('aria-label')).toMatch(/ against .+: roughness \d+\.\d\d$/);
    // subset: the ticks of notes outside the subset are dimmed (data-subset) and say so; selection changes update live
    const dim = () => marks().filter((m) => m.getAttribute('data-subset') === 'false');
    const before = dim().length;
    fireEvent.click(notes[3]);
    expect(Math.abs(dim().length - before)).toBe(1);
    expect(marks()).toHaveLength(11);
    for (const m of dim()) {
      expect(m.getAttribute('aria-label')).toMatch(/\(not in subset\)$/);
    }
    for (const m of marks().filter((x) => x.getAttribute('data-subset') === 'true')) {
      expect(m.getAttribute('aria-label')).not.toMatch(/not in subset/);
    }
    fireEvent.click(notes[3]);
    expect(dim()).toHaveLength(before);
    // pin it, leave: the pinned note stays as its own source
    fireEvent.click(notes[7], { altKey: true });
    fireEvent.mouseLeave(notes[7]);
    expect(source()).toBe('pinned');
    expect(screen.getByTestId('live-source').textContent).toBe('pinned');
    expect(marks()).toHaveLength(11);
    // hovering another note beats the pinned one; sounding beats both
    fireEvent.mouseEnter(notes[4]);
    expect(source()).toBe('note');
    key('z');
    await waitFor(() => expect(source()).toBe('sounding'));
    expect(total()).toBe(liveRoughness([0], BASE).total.toFixed(2));
    key('z', 'keyUp');
  });
});

describe('five visualizers', () => {
  it('a stored three-visualizer layout and settings load with viz4 and viz5 as defaults, unpinned, and nothing is written on mount', () => {
    const layout = '{"left":[["keys"]],"right":[["viz1"],["viz3"]],"views":{"viz3":"iso"}}';
    const settings = JSON.stringify({
      viz: { viz1: { labels: false }, viz2: {}, viz3: { isoTol: 35 } },
    });
    window.localStorage.setItem(KEY_LAYOUT, layout);
    window.localStorage.setItem(KEY_SETTINGS, settings);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<HarmonicFieldLabPage />);
    const rail = within(screen.getByRole('navigation', { name: 'Analysis panels' }));
    expect(rail.getByRole('tab', { name: /^Visualizer 4 \u2013 Live roughness/ })).toBeTruthy();
    expect(
      rail.getByRole('tab', { name: /^Visualizer 5 \u2013 Isomorphic keyboard/ })
    ).toBeTruthy();
    expect(
      rail.getByRole('button', { name: 'Pin Visualizer 4 \u2013 Live roughness as a column' })
    ).toBeTruthy();
    expect(
      rail.getByRole('button', { name: 'Pin Visualizer 5 \u2013 Isomorphic keyboard as a column' })
    ).toBeTruthy();
    // viz3 keeps its stored view
    expect(
      rail.getByRole('tab', { name: /^Visualizer 3 \u2013 Isomorphic keyboard/ })
    ).toBeTruthy();
    const writes = setItem.mock.calls.filter((c) => c[0] === KEY_LAYOUT || c[0] === KEY_SETTINGS);
    expect(writes).toHaveLength(0);
    expect(window.localStorage.getItem(KEY_LAYOUT)).toBe(layout);
    expect(window.localStorage.getItem(KEY_SETTINGS)).toBe(settings);
    setItem.mockRestore();
  });
});
