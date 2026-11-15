/**
 * M8e: hold 4 / 5 on a chord chip plays it on the Sketch row root (a to g), the Composites panel item lines and hover
 * highlight (h), the remembered Positional order (i). 12-EDO is the full chromatic set, so degree n of the stepper is (n-1)*100 c.
 */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset } from './testUtils';

vi.setConfig({ testTimeout: 20_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const down = (key: string) => fireEvent.keyDown(window, { key });
const up = (key: string) => fireEvent.keyUp(window, { key });
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const C4 = 261.6256;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const chip = (re: RegExp) => screen.getAllByRole('button', { name: re })[0];
const EDO_MAJOR = /^major triad 4:5:6 on (1\/1|0\.0 c)/i;
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const railTab = (re: RegExp) => within(rail()).getByRole('tab', { name: re });

/** What started since `from`: the lowest in cents above C4, and every voice in cents above the lowest. */
function heardSince(from: number) {
  const h = oscs()
    .slice(from)
    .map(hz)
    .sort((x, y) => x - y);
  return {
    low: Math.round(cents(h[0], C4)),
    rel: h.map((x) => Math.round(cents(x, h[0]) * 10) / 10),
  };
}

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

describe('hold 4 / 5 on a chip plays it on the Sketch root (a to e)', () => {
  it('a, b: C; c, d: the stepper degree the played key chose, also while the key is held; e: hold 1 is the chip itself', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    vi.useFakeTimers();
    const major = chip(EDO_MAJOR);
    fireEvent.mouseEnter(major);
    // a: as in field
    let n = oscs().length;
    down('4');
    advance(50);
    expect(heardSince(n)).toEqual({ low: 0, rel: [0, 400, 700] });
    up('4');
    // b: exact
    n = oscs().length;
    down('5');
    advance(50);
    expect(heardSince(n)).toEqual({ low: 0, rel: [0, 386.3, 702] });
    up('5');
    // d: a melody key (x = degree 2) moves the stepper; its key is STILL held while the chip is auditioned
    fireEvent.mouseLeave(major);
    fireEvent.keyDown(window, { key: 'x', code: 'KeyX' });
    n = oscs().length;
    fireEvent.mouseEnter(major);
    down('4');
    advance(50);
    expect(heardSince(n)).toEqual({ low: 100, rel: [0, 400, 700] });
    up('4');
    // c: the same after the key is released; hold 5 is exact on that root
    fireEvent.keyUp(window, { key: 'x', code: 'KeyX' });
    n = oscs().length;
    down('5');
    advance(50);
    expect(heardSince(n)).toEqual({ low: 100, rel: [0, 386.3, 702] });
    up('5');
    // e: hold 1 is unchanged, the chip's own root (C) and pitches
    n = oscs().length;
    down('1');
    advance(50);
    expect(heardSince(n)).toEqual({ low: 0, rel: [0, 400, 700] });
    up('1');
    fireEvent.mouseLeave(major);
  });
});

describe('positional rows and CPS chips have no exact form (f, g)', () => {
  it('f: a positional row plays its field notes on 4 and on 5, on the chosen root', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    const dots = within(screen.getByRole('group', { name: /^Pitch circle/ })).getAllByRole(
      'button'
    );
    [0, 2, 4, 5, 7, 9, 11].forEach((i) => fireEvent.click(dots[i]));
    vi.useFakeTimers();
    const r = within(screen.getByRole('list', { name: 'Positional chords' })).getByRole('button', {
      name: /^2-2 on 1,/,
    });
    expect(r.getAttribute('aria-label')).toMatch(/no separate exact form/);
    fireEvent.mouseEnter(r);
    let n = oscs().length;
    down('4');
    advance(50);
    expect(heardSince(n)).toEqual({ low: 0, rel: [0, 400, 700] });
    up('4');
    n = oscs().length;
    down('5');
    advance(50);
    expect(heardSince(n)).toEqual({ low: 0, rel: [0, 400, 700] });
    up('5');
    // the stepper follows the played key (x = degree 2 = D, 200 c): the row, itself rooted at C, now sounds on D
    fireEvent.mouseLeave(r);
    fireEvent.keyDown(window, { key: 'x', code: 'KeyX' });
    fireEvent.keyUp(window, { key: 'x', code: 'KeyX' });
    fireEvent.mouseEnter(r);
    n = oscs().length;
    down('4');
    advance(50);
    expect(heardSince(n)).toEqual({ low: 200, rel: [0, 400, 700] });
    up('4');
    n = oscs().length;
    down('5');
    advance(50);
    expect(heardSince(n)).toEqual({ low: 200, rel: [0, 400, 700] });
    up('5');
    fireEvent.mouseLeave(r);
  });

  it('g: a hexany CPS chip: hold 5 is the same as hold 4', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('Hexany (1 3 5 7, choose 2)');
    vi.useFakeTimers();
    const section = screen.getByRole('region', { name: 'Chords inside this CPS' });
    const first = within(section).getAllByRole('button', { name: /chord / })[0];
    expect(first.getAttribute('aria-label')).toMatch(/no separate exact form/);
    fireEvent.mouseEnter(first);
    let n = oscs().length;
    down('4');
    advance(50);
    const four = heardSince(n);
    up('4');
    n = oscs().length;
    down('5');
    advance(50);
    expect(four.rel.length).toBeGreaterThan(1);
    expect(heardSince(n)).toEqual(four);
    up('5');
    // after a melody key moves the stepper to degree 2, the same shape sounds on a different root, and 5 still equals 4
    fireEvent.mouseLeave(first);
    fireEvent.keyDown(window, { key: 'x', code: 'KeyX' });
    fireEvent.keyUp(window, { key: 'x', code: 'KeyX' });
    fireEvent.mouseEnter(first);
    n = oscs().length;
    down('4');
    advance(50);
    const moved = heardSince(n);
    up('4');
    expect(moved.rel).toEqual(four.rel);
    expect(moved.low).not.toBe(four.low);
    n = oscs().length;
    down('5');
    advance(50);
    expect(heardSince(n)).toEqual(moved);
    up('5');
    fireEvent.mouseLeave(first);
  });
});

describe('Composites panel item (h) and remembered Positional order (i)', () => {
  it('h: four lines per item and the hover lights its notes in the ring; i: Scale order is stored', async () => {
    render(<HarmonicFieldLabPage />);
    // no write on mount
    expect(window.localStorage.getItem('hrifa.harmonic-field-lab.settings.v1')).toBeNull();
    await pickPreset('12-EDO');
    // D major (200, 600, 900 c) to a new composite 1, then G major (700, 1100, 200 c) to it: they share the 200 c note
    const dChip = chip(/^major triad 4:5:6 on 200\.0 c/i);
    fireEvent.mouseEnter(dChip);
    down('-');
    down('0');
    fireEvent.mouseLeave(dChip);
    const gChip = chip(/^major triad 4:5:6 on 700\.0 c/i);
    fireEvent.mouseEnter(gChip);
    down('-');
    down('1');
    fireEvent.mouseLeave(gChip);
    fireEvent.click(railTab(/^Composites/));
    fireEvent.click(screen.getByRole('button', { name: 'Show the items of Composite 1' }));
    const items = screen.getByRole('list', { name: 'Items of Composite 1' });
    const [dItem, gItem] = [...items.querySelectorAll('li')] as HTMLElement[];
    const lines = [...dItem.querySelectorAll('[data-detail]')].map((x) => x.textContent);
    expect(lines).toEqual([
      '4:5:6 major triad on 200.0 c',
      'chord · 3 notes',
      '200.0, 600.0, 900.0 c',
      'Source: 12-EDO',
    ]);
    const ring = () => screen.getByTestId('composite-ring');
    const litAt = () =>
      [...ring().querySelectorAll('[data-kind="lit"]')].map(
        (e) => `${e.getAttribute('cx')},${e.getAttribute('cy')}`
      );
    expect(litAt()).toHaveLength(0);
    fireEvent.mouseEnter(dItem);
    const dLit = litAt();
    expect(dLit).toHaveLength(3);
    fireEvent.mouseLeave(dItem);
    expect(litAt()).toHaveLength(0);
    fireEvent.mouseEnter(gItem);
    const gLit = litAt();
    expect(gLit).toHaveLength(3);
    fireEvent.mouseLeave(gItem);
    // the 200 c note is shared: it lights for BOTH items, and only for that one is the rest different
    expect(dLit.filter((p) => gLit.includes(p))).toHaveLength(1);
    // the composite has 5 merged notes, so hovering one item does not light them all
    expect(ring().querySelectorAll('[data-kind="note"]')).toHaveLength(5);
    // i: nothing is written for the order until it changes; choosing Scale order stores it
    const KEY = 'hrifa.harmonic-field-lab.settings.v1';
    const stored = () =>
      (JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as { positionalOrder?: string })
        .positionalOrder;
    expect(stored()).toBe('smoothest');
    fireEvent.click(railTab(/^Chords/));
    const order = () => screen.getByRole('radiogroup', { name: 'Positional order' });
    expect(within(order()).getByRole('radio', { name: 'Smoothest' })).toBeChecked();
    fireEvent.click(within(order()).getByRole('radio', { name: 'Scale order' }));
    expect(stored()).toBe('scale');
  });
});

describe('the stored Positional order is read back (i)', () => {
  const KEY = 'hrifa.harmonic-field-lab.settings.v1';
  const checked = (name: string) => {
    fireEvent.click(railTab(/^Chords/));
    const group = screen.getByRole('radiogroup', { name: 'Positional order' });
    expect(within(group).getByRole('radio', { name })).toBeChecked();
  };
  it('a stored Scale order is Scale order on load', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ positionalOrder: 'scale' }));
    render(<HarmonicFieldLabPage />);
    checked('Scale order');
  });
  it('a damaged stored value falls back to Smoothest', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ positionalOrder: 'zigzag' }));
    render(<HarmonicFieldLabPage />);
    checked('Smoothest');
  });
});
