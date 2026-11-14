/** Hover + hold 1 plays anything playable: a note, a chord chip, a key ring (scale), a saved subset (scale). */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { chordAmp } from './audio/engine';
import { FakeCtx } from './audio/fakeContext';

vi.setConfig({ testTimeout: 15_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const running = () => oscs().filter((o) => o.stopAt === null);
/** Peak level of every voice that was started (the envelope's attack target). */
const peaks = () =>
  contexts.flatMap((c) =>
    c.gains.flatMap((g) => g.gain.events.filter((e) => e.kind === 'lin').map((e) => e.v ?? 0))
  );
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const down = (key: string) => fireEvent.keyDown(window, { key });
const up = (key: string) => fireEvent.keyUp(window, { key });
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const dot = (name: RegExp) => within(ring()).getByRole('button', { name });
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const lit = () => document.querySelectorAll('[data-lit="true"]').length;
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

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

describe('hover + hold 1', () => {
  it('a ring dot holds that note while 1 is down; 2 and 3 do nothing', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    const d = dot(/^9\/8/);
    fireEvent.mouseEnter(d);
    down('2');
    down('3');
    advance(100);
    expect(oscs()).toHaveLength(0);
    down('1');
    advance(100);
    expect(running()).toHaveLength(1);
    // the same note as clicking it plays
    const held = hz(running()[0]);
    expect(held).toBeGreaterThan(100);
    expect(d.getAttribute('aria-label')).toMatch(/sounding/);
    up('2');
    expect(running()).toHaveLength(1);
    up('1');
    expect(running()).toHaveLength(0);
    expect(lit()).toBe(0);
    fireEvent.click(d, { altKey: true });
    // leaving the dot clears the target
    fireEvent.mouseLeave(d);
    down('1');
    expect(running()).toHaveLength(0);
    up('1');
  });

  it('a different dot gives its own Hz, and blur while held releases everything', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    fireEvent.mouseEnter(dot(/^9\/8/));
    down('1');
    const a = hz(running()[0]);
    up('1');
    fireEvent.mouseLeave(dot(/^9\/8/));
    fireEvent.mouseEnter(dot(/^3\/2/));
    down('1');
    expect(hz(running()[0]) / a).toBeCloseTo(3 / 2 / (9 / 8), 3);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(running()).toHaveLength(0);
    expect(lit()).toBe(0);
    expect(document.querySelectorAll('[aria-label*="sounding"]')).toHaveLength(0);
  });

  it('a chord chip holds the chord voices together, at the chord amplitude', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    const chip = screen.getAllByRole('button', { name: /^major triad 4:5:6 on /i })[0];
    fireEvent.mouseEnter(chip);
    down('1');
    advance(3000); // far longer than a clicked chord rings
    expect(running()).toHaveLength(3);
    const hzs = running()
      .map(hz)
      .sort((x, y) => x - y);
    expect(hzs[1] / hzs[0]).toBeCloseTo(5 / 4, 3);
    expect(hzs[2] / hzs[0]).toBeCloseTo(3 / 2, 3);
    up('1');
    expect(running()).toHaveLength(0);
    expect(lit()).toBe(0);
    fireEvent.mouseLeave(chip);
  });

  it('a key ring steps through its scale while held and stops on keyup; 2 and 3 do nothing', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    type(screen.getByRole('combobox', { name: 'Preset' }), '12-EDO');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    [0, 2, 4, 5, 7, 9, 11].forEach((i) =>
      fireEvent.click(within(ring()).getAllByRole('button')[i])
    );
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Keys/ }));
    const rings = within(screen.getByRole('list', { name: 'Keys' })).getAllByRole('listitem');
    const g = within(rings[7]).getByRole('button');
    fireEvent.mouseEnter(g);
    down('3');
    advance(100);
    expect(oscs()).toHaveLength(0);
    down('1');
    advance(50);
    expect(running()).toHaveLength(1);
    const root = hz(running()[0]);
    advance(2500);
    expect(oscs().length).toBeGreaterThan(3);
    // the second step is the next scale degree of G major (A: a whole tone up)
    const sorted = oscs()
      .slice()
      .sort((x, y) => (x.startAt ?? 0) - (y.startAt ?? 0));
    expect(hz(sorted[1]) / root).toBeCloseTo(2 ** (2 / 12), 3);
    up('1');
    expect(running()).toHaveLength(0);
    const n = oscs().length;
    advance(5000);
    expect(oscs()).toHaveLength(n); // nothing further after keyup
    expect(lit()).toBe(0);
    fireEvent.mouseLeave(g);
  });

  it('a saved subset steps through its scale while held; the scale ends by itself', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save current subset' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Subset name' }), {
      target: { value: 'All eight' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const row = within(screen.getByRole('list', { name: 'Saved subsets list' })).getByRole(
      'button',
      { name: /^All eight/ }
    );
    vi.useFakeTimers();
    fireEvent.mouseEnter(row);
    down('1');
    advance(50);
    expect(running()).toHaveLength(1);
    advance(1500);
    expect(oscs().length).toBeGreaterThan(2);
    advance(20000); // 8 notes and the repeat, then silence
    expect(oscs()).toHaveLength(9);
    expect(running()).toHaveLength(0);
    up('1');
    expect(lit()).toBe(0);
  });

  it('sweeping across dots while 1 is held moves the sound; 2 on a note stops it, then a dot-less digit stays silent', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    const a = dot(/^9\/8/);
    const b = dot(/^3\/2/);
    fireEvent.mouseEnter(a);
    down('1');
    const ha = hz(running()[0]);
    fireEvent.mouseLeave(a);
    expect(running()).toHaveLength(1);
    fireEvent.mouseEnter(b);
    expect(running()).toHaveLength(1);
    expect(hz(running()[0]) / ha).toBeCloseTo(3 / 2 / (9 / 8), 3);
    up('1');
    expect(running()).toHaveLength(0);
    fireEvent.mouseLeave(b);
    // 2 on a note does nothing at all
    fireEvent.mouseEnter(a);
    down('2');
    expect(oscs().length).toBe(2);
    up('2');
  });

  it('simultaneous held voices share the level: an inexact pair at 0.5 each, a triad at chordAmp(3)', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    // one note: the reference level
    fireEvent.mouseEnter(dot(/^9\/8/));
    down('1');
    const one = peaks()[0];
    up('1');
    fireEvent.mouseLeave(dot(/^9\/8/));
    expect(one).toBeGreaterThan(0);
    // a 3-note chord chip, hold 1
    const chip = screen.getAllByRole('button', { name: /^major triad 4:5:6 on /i })[0];
    const before3 = peaks().length;
    fireEvent.mouseEnter(chip);
    down('1');
    const triad = peaks().slice(before3);
    expect(triad).toHaveLength(3);
    for (const v of triad) {
      expect(v / one).toBeCloseTo(chordAmp(3), 6);
    }
    up('1');
    fireEvent.mouseLeave(chip);
    // a mode tile, hold 3: listed + pure
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Modes/ }));
    const tile = within(screen.getAllByTestId('mode-row')[1]).getAllByTestId('mode-tile')[4];
    const before = peaks().length;
    fireEvent.mouseEnter(tile);
    down('3');
    const pair = peaks().slice(before);
    expect(pair).toHaveLength(2);
    for (const v of pair) {
      expect(v / one).toBeCloseTo(0.5, 6); // an inexact pair: half a single note each
    }
    up('3');
    fireEvent.mouseLeave(tile);
    // an exact degree (the mode's root) in "both": one voice at single-note level
    const exactTile = within(screen.getAllByTestId('mode-row')[1]).getAllByTestId('mode-tile')[0];
    const beforeExact = peaks().length;
    fireEvent.mouseEnter(exactTile);
    down('3');
    const single = peaks().slice(beforeExact);
    expect(single).toHaveLength(1);
    expect(single[0] / one).toBeCloseTo(1, 6);
    up('3');
    fireEvent.mouseLeave(exactTile);
  });
});
