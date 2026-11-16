/** M9 step 2: the Positional section of the Chords panel (12-EDO C major scenarios), playing, arming, hold 4 and the pentatonic case. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset, ungroupShapes } from './testUtils';

vi.setConfig({ testTimeout: 15_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const running = () => oscs().filter((o) => o.stopAt === null);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const down = (key: string) => fireEvent.keyDown(window, { key });
const up = (key: string) => fireEvent.keyUp(window, { key });
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const noteDots = () => within(ring()).getAllByRole('button');
const sketch = () => screen.getByRole('group', { name: 'Sketch a chord' });
const template = () =>
  within(sketch()).getByRole<HTMLSelectElement>('combobox', { name: 'Sketch template' });
const rows = () =>
  within(screen.getByRole('list', { name: 'Positional chords 2-2' })).getAllByTestId(
    'positional-row'
  );
const row = (label: string) =>
  within(screen.getByRole('list', { name: 'Positional chords 2-2' })).getByRole('button', {
    name: new RegExp(`^${label},`),
  });
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];
const C4 = 261.6256;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

/** The cents above the lowest sounding voice of what started since `from`. */
const heardSince = (from: number) =>
  oscs()
    .slice(from)
    .map(hz)
    .sort((x, y) => x - y);
const centsOf = (h: number[]) => h.map((x) => Math.round(cents(x, h[0])));

async function openScale(idx: number[]) {
  render(<HarmonicFieldLabPage />);
  await pickPreset('12-EDO');
  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  idx.forEach((i) => fireEvent.click(noteDots()[i]));
}

beforeEach(() => {
  window.localStorage.clear();
  ungroupShapes();
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

describe('Positional section (12-EDO C major, pattern 2-2)', () => {
  it('lists 7 rows with the naming; plays Parallel and Relative; arms the Sketch; hold 4 places the same shape', async () => {
    vi.useFakeTimers();
    await openScale(MAJOR);
    expect(rows()).toHaveLength(7);
    // the main label and the tail
    const on1 = row('2-2 on 1');
    expect(on1.getAttribute('aria-label')).toMatch(/^2-2 on 1, 7 of 12-EDO · 400-300 c/);
    // Parallel (default): the chord's own root on 1/1, so `2-2 on 2` (D F A) plays 0, 300, 700 c
    let n = oscs().length;
    fireEvent.click(row('2-2 on 2'));
    advance(100);
    let h = heardSince(n);
    expect(centsOf(h)).toEqual([0, 300, 700]);
    expect(h[0]).toBeCloseTo(C4, 1);
    // a sticky highlight; the row armed the Sketch row with the pattern at its degree
    expect(row('2-2 on 2').getAttribute('aria-pressed')).toBe('true');
    expect(sketch().getAttribute('data-armed')).toBe('true');
    expect(template().value).toBe('pos:2-2');
    expect(screen.getByTestId('sketch-line').textContent).toMatch(/^2-2 on 2/);
    // pitches in cents and the step sizes, no generator name and no 'armed from a chord'
    expect(screen.getByTestId('sketch-steps').textContent).toMatch(/steps 300.0, 400.0 c/);
    expect(screen.getByTestId('sketch-info').textContent).not.toMatch(/12-EDO|armed from/);
    // `2-2 on 1` in Parallel is C E G
    n = oscs().length;
    fireEvent.click(row('2-2 on 1'));
    advance(100);
    expect(centsOf(heardSince(n))).toEqual([0, 400, 700]);
    // Relative: real pitches, D F A = 200, 500, 900 c (on 261.63 Hz C)
    down('0');
    n = oscs().length;
    fireEvent.click(row('2-2 on 2'));
    advance(100);
    h = heardSince(n);
    expect(centsOf(h)).toEqual([0, 300, 700]);
    expect(h[0]).toBeCloseTo(C4 * 2 ** (200 / 1200), 1);
    // hold 4 on a note: the same shape (0, 300, 700 c above it) on that note, and hold 5 gives the same pitches
    const g = noteDots()[7];
    fireEvent.mouseEnter(g);
    down('4');
    advance(100);
    h = running()
      .map(hz)
      .sort((x, y) => x - y);
    expect(centsOf(h)).toEqual([0, 300, 700]);
    expect(h[0]).toBeCloseTo(C4 * 2 ** (700 / 1200), 1);
    up('4');
    down('5');
    advance(100);
    h = running()
      .map(hz)
      .sort((x, y) => x - y);
    expect(centsOf(h)).toEqual([0, 300, 700]);
    up('5');
    fireEvent.mouseLeave(g);
    // hovering a row and holding 1 plays it
    const r1 = row('2-2 on 1');
    fireEvent.mouseEnter(r1);
    down('1');
    expect(running()).toHaveLength(3);
    up('1');
    fireEvent.mouseLeave(r1);
    expect(running()).toHaveLength(0);
  });

  it('the pentatonic case: 2-2 on 2 is D G C (200, 700, 1200 c) and has 5 rows', async () => {
    vi.useFakeTimers();
    await openScale(PENTA);
    expect(rows()).toHaveLength(5);
    down('0');
    const n = oscs().length;
    fireEvent.click(row('2-2 on 2'));
    advance(100);
    const h = heardSince(n);
    expect(centsOf(h)).toEqual([0, 500, 1000]);
    expect(h[0]).toBeCloseTo(C4 * 2 ** (200 / 1200), 1);
    expect(row('2-2 on 2').getAttribute('aria-label')).toMatch(
      /^2-2 on 2, 5 of 12-EDO · 500-500 c/
    );
  });

  it('a subset with too few notes shows a hint instead of rows', async () => {
    await openScale([0]);
    expect(screen.queryAllByTestId('positional-row')).toHaveLength(0);
    expect(screen.getAllByText(/Select at least 2 notes/).length).toBeGreaterThan(0);
  });

  it('twin rows (same notes) are separate: each plays and arms; hold 1 on a row arms the Sketch', async () => {
    vi.useFakeTimers();
    await openScale([0, 4, 7, 11]);
    expect(rows()).toHaveLength(4);
    // 2-2 on 1 and 2-2 on 3 share the same two notes in a 4-note subset
    let n = oscs().length;
    fireEvent.click(row('2-2 on 1'));
    advance(100);
    expect(oscs().length - n).toBe(3);
    expect(row('2-2 on 1').getAttribute('aria-pressed')).toBe('true');
    n = oscs().length;
    fireEvent.click(row('2-2 on 3'));
    advance(100);
    expect(oscs().length - n).toBe(3);
    expect(row('2-2 on 3').getAttribute('aria-pressed')).toBe('true');
    expect(row('2-2 on 1').getAttribute('aria-pressed')).toBe('false');
    expect(template().value).toBe('pos:2-2');
    // clicking the picked twin lets go
    fireEvent.click(row('2-2 on 3'));
    expect(row('2-2 on 3').getAttribute('aria-pressed')).toBe('false');
    // hold 1 on a row arms it like a chord chip
    fireEvent.change(template(), { target: { value: '4:5:6' } });
    const r = row('2-2 on 2');
    fireEvent.mouseEnter(r);
    down('1');
    expect(template().value).toBe('pos:2-2');
    expect(sketch().getAttribute('data-armed')).toBe('true');
    up('1');
    fireEvent.mouseLeave(r);
  });

  it('the Sketch row says so and does nothing when the pattern is too big for the subset', async () => {
    await openScale([0, 4, 7]);
    fireEvent.change(template(), { target: { value: 'pos:3-3' } });
    expect(within(sketch()).getByText(/too few for 3-3/)).toBeTruthy();
    expect(within(sketch()).getByRole('button', { name: 'Play sketch' })).toBeDisabled();
    expect(within(sketch()).getByRole('button', { name: 'Stash' })).toBeDisabled();
  });
});
