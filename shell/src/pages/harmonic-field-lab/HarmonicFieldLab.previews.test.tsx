import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';

vi.setConfig({ testTimeout: 15_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const hzs = () =>
  oscs()
    .slice()
    .sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0))
    .map((o) => o.frequency.events[0].v ?? 0);
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const count = () =>
  ring()
    .getAttribute('aria-label')!
    .match(/(\d+) of (\d+) notes selected/)![0];
const openModes = () =>
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Analysis panels' })).getByRole('tab', {
      name: /^Modes/,
    })
  );
const rows = () => screen.getAllByTestId('mode-row');
const CTRL = { ctrlKey: true };
const SHIFT = { shiftKey: true };
const BOTH = { ctrlKey: true, shiftKey: true };
const lit = () => document.querySelectorAll('[data-lit="true"]').length;

beforeEach(() => {
  window.localStorage.clear();
  contexts = [];
  class TestCtx extends FakeCtx {
    constructor() {
      super();
      contexts.push(this);
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = TestCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  vi.useRealTimers();
});

describe('mode grid previews', () => {
  it('Ctrl, Shift and Ctrl+Shift on a mode title play it without selecting it or changing the subset', () => {
    render(<HarmonicFieldLabPage />);
    openModes();
    const before = count();
    const title = within(rows()[1]).getByTestId('mode-title');
    expect(rows()[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(title, CTRL); // listed: 8 notes then the repeat
    expect(oscs()).toHaveLength(9);
    fireEvent.click(title, SHIFT); // pure
    expect(oscs()).toHaveLength(18);
    fireEvent.click(title, { metaKey: true, shiftKey: true }); // Cmd counts as Ctrl: both, a pair per step
    expect(oscs()).toHaveLength(34); // exact steps (1/1 and the repeat) play once, not as a pair
    expect(count()).toBe(before);
    expect(rows()[0]).toHaveAttribute('aria-pressed', 'true');
    expect(rows()[1]).toHaveAttribute('aria-pressed', 'false');
    // a plain click still selects the mode
    fireEvent.click(title);
    expect(rows()[1]).toHaveAttribute('aria-pressed', 'true');
    expect(oscs()).toHaveLength(34);
  });

  it('a single tile: listed is the nearest field note, pure the exact interval, both a beating pair', () => {
    render(<HarmonicFieldLabPage />);
    openModes();
    const before = count();
    // mode 2, degree 5: wants 3/2 above 9/8 = 27/16; the field has 13/8 nearby (a few cents away)
    const tile = within(rows()[1]).getAllByTestId('mode-tile')[4];
    fireEvent.click(tile, CTRL);
    const listed = hzs()[0];
    fireEvent.click(tile, SHIFT);
    const pure = hzs()[1];
    expect(oscs()).toHaveLength(2);
    expect(listed / pure).toBeCloseTo(
      2 **
        (parseFloat(
          tile
            .getAttribute('title')!
            .match(/[+−]\d+\.\d/)![0]
            .replace('−', '-')
        ) /
          1200),
      3
    );
    fireEvent.click(tile, BOTH);
    expect(oscs()).toHaveLength(4);
    const all = oscs().slice(2);
    expect(all[0].startAt).toBe(all[1].startAt);
    expect(all[0].stopAt).toBe(all[1].stopAt);
    expect(count()).toBe(before);
    expect(rows()[0]).toHaveAttribute('aria-pressed', 'true');
    // a plain click on a tile selects the mode through its row
    fireEvent.click(tile);
    expect(rows()[1]).toHaveAttribute('aria-pressed', 'true');
    expect(oscs()).toHaveLength(4);
  });
});

describe('tuner strip previews', () => {
  const col = (ratio: string) =>
    screen
      .getByTestId('strip-plot')
      .querySelector<HTMLElement>(`[data-ratio="${ratio}"]`) as HTMLElement;
  const devOf = (c: HTMLElement) => parseFloat(c.lastElementChild!.textContent!);

  it('Ctrl plays the note, Shift its target (note minus deviation), both together; none toggles or pins', () => {
    render(<HarmonicFieldLabPage />);
    const before = count();
    const c = col('9/8');
    const dev = devOf(c);
    fireEvent.click(c, CTRL);
    const listed = hzs()[0];
    fireEvent.click(c, SHIFT);
    expect(hzs()[1] / listed).toBeCloseTo(2 ** (-dev / 1200), 3);
    fireEvent.click(c, BOTH);
    expect(oscs()).toHaveLength(4);
    expect(count()).toBe(before);
    expect(c).toHaveAttribute('data-on', 'true');
    expect(c).toHaveAttribute('data-pin', 'false');
    // Alt+click still pins, plain click still toggles
    fireEvent.click(c, { altKey: true });
    expect(c).toHaveAttribute('data-pin', 'true');
    expect(oscs()).toHaveLength(4);
    fireEvent.click(c);
    expect(c).toHaveAttribute('data-on', 'false');
  });

  it('lights while sounding (the target lights only its own mark) and stopAll leaves nothing', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    const c = col('9/8');
    fireEvent.click(c, SHIFT);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(c).toHaveAttribute('data-lit', 'true'); // its strip mark
    expect(document.querySelectorAll('[aria-label*="sounding"]')).toHaveLength(1); // no other view lights
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(lit()).toBe(0);
    // the listed tone lights in other views too
    fireEvent.click(c, CTRL);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelectorAll('[aria-label*="sounding"]').length).toBeGreaterThan(1);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(lit()).toBe(0);
    expect(document.querySelectorAll('[aria-label*="sounding"]')).toHaveLength(0);
    expect(oscs().filter((o) => o.stopAt === null)).toHaveLength(0);
    // a mode preview still scheduled is cancelled too
    openModes();
    fireEvent.click(within(rows()[1]).getByTestId('mode-title'), BOTH);
    act(() => {
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(10_000);
    });
    expect(lit()).toBe(0);
  });
});

describe('hold 1 / 2 / 3 previews', () => {
  const tileOf = (mode: number, degree: number) =>
    within(rows()[mode]).getAllByTestId('mode-tile')[degree];
  const down = (key: string, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(window, { key, ...init });
  const up = (key: string) => fireEvent.keyUp(window, { key });
  const running = () => oscs().filter((o) => o.stopAt === null);

  it('hovering a tile and holding 1 / 2 / 3 sounds listed / pure / both until the key goes up', () => {
    render(<HarmonicFieldLabPage />);
    openModes();
    const tile = tileOf(1, 4);
    fireEvent.click(tile, CTRL);
    fireEvent.click(tile, SHIFT);
    const [listed, pure] = hzs(); // the click previews, as the reference pitches
    const base = oscs().length;
    fireEvent.mouseEnter(tile);
    down('1');
    expect(oscs()).toHaveLength(base + 1);
    expect(oscs()[base].frequency.events[0].v).toBeCloseTo(listed, 6);
    expect(oscs()[base].stopAt).toBeNull();
    down('1', { repeat: true }); // key repeat does nothing
    expect(oscs()).toHaveLength(base + 1);
    up('1');
    expect(oscs()[base].stopAt).not.toBeNull();
    down('2');
    expect(oscs()[base + 1].frequency.events[0].v).toBeCloseTo(pure, 6);
    expect(oscs()[base + 1].stopAt).toBeNull();
    up('2');
    expect(oscs()[base + 1].stopAt).not.toBeNull();
    down('3');
    expect(oscs()).toHaveLength(base + 4);
    expect(running()).toHaveLength(2);
    up('3');
    expect(running()).toHaveLength(0);
  });

  it('does nothing without a target, when typing in a field, or with Alt', () => {
    render(<HarmonicFieldLabPage />);
    openModes();
    down('1'); // no target
    expect(oscs()).toHaveLength(0);
    const tile = tileOf(0, 0);
    fireEvent.mouseEnter(tile);
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: '1' });
    input.remove();
    down('1', { altKey: true }); // Alt+1 is the tab shortcut
    expect(oscs()).toHaveLength(0);
    fireEvent.mouseLeave(tile);
    down('1'); // pointer left: no target again
    expect(oscs()).toHaveLength(0);
  });

  it('while held, pointing at another tile moves the sound there; pointing at nothing keeps it until keyup', () => {
    render(<HarmonicFieldLabPage />);
    openModes();
    const a = tileOf(0, 1);
    const b = tileOf(0, 3);
    fireEvent.mouseEnter(a);
    down('1');
    const first = oscs()[0].frequency.events[0].v!;
    expect(running()).toHaveLength(1);
    // onto empty space: the last sound stays
    fireEvent.mouseLeave(a);
    expect(running()).toHaveLength(1);
    // onto tile B: A stops, B sounds
    fireEvent.mouseEnter(b);
    expect(oscs()).toHaveLength(2);
    expect(oscs()[0].stopAt).not.toBeNull();
    expect(running()).toHaveLength(1);
    expect(running()[0].frequency.events[0].v).not.toBeCloseTo(first, 3);
    // off again: B keeps sounding
    fireEvent.mouseLeave(b);
    expect(running()).toHaveLength(1);
    expect(oscs()).toHaveLength(2);
    up('1');
    expect(running()).toHaveLength(0);
    // the next press uses the target pointed at then
    down('1');
    expect(oscs()).toHaveLength(2);
    up('1');
  });

  it('a mode title steps through the mode while held and keyup stops it early', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    openModes();
    fireEvent.mouseEnter(within(rows()[1]).getByTestId('mode-title'));
    down('1');
    expect(oscs()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(oscs().length).toBeGreaterThanOrEqual(3);
    expect(oscs().length).toBeLessThan(9);
    expect(lit()).toBeGreaterThan(0);
    up('1');
    const n = oscs().length;
    expect(running()).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(oscs()).toHaveLength(n); // nothing more is started
    expect(lit()).toBe(0);
    // held to the end: all 8 notes and the repeat play, then it falls silent while the key is still down
    down('1');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(oscs()).toHaveLength(n + 9);
    expect(running()).toHaveLength(0);
    expect(lit()).toBe(0);
    up('1');
  });

  it('a held strip note sounds, lights only itself when pure, and blur releases everything', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    const c = screen.getByTestId('strip-plot').querySelector<HTMLElement>('[data-ratio="9/8"]')!;
    fireEvent.mouseEnter(c);
    down('2');
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(running()).toHaveLength(1);
    expect(c).toHaveAttribute('data-lit', 'true');
    expect(document.querySelectorAll('[aria-label*="sounding"]')).toHaveLength(1);
    up('2');
    down('3');
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(running()).toHaveLength(2);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(running()).toHaveLength(0);
    expect(lit()).toBe(0);
    expect(document.querySelectorAll('[aria-label*="sounding"]')).toHaveLength(0);
    up('3');
  });
});
