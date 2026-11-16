/**
 * M8f page tests: silent root keys in Chords mode (a to e, g), pattern groups and folds that survive a reload (h to k), and the
 * Composites row (m). 12-EDO is the full chromatic set, so degree n of the stepper is (n-1)*100 c.
 */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { KEY_SETTINGS } from './state/persist';
import { pickPreset, ungroupShapes } from './testUtils';

vi.setConfig({ testTimeout: 30_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const press = (key: string, code: string, extra: KeyboardEventInit = {}) =>
  fireEvent.keyDown(window, { key, code, ...extra });
const release = (key: string, code: string) => fireEvent.keyUp(window, { key, code });
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const sketch = () => screen.getByRole('group', { name: 'Sketch a chord' });
const rootText = () => within(sketch()).getByText(/^root/).textContent;
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const C4 = 261.6256;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const EDO_MAJOR = /^major triad 4:5:6 on (1\/1|0\.0 c)/i;
const folded = (name: string | RegExp) =>
  screen.getByRole('button', { name }).getAttribute('aria-expanded') === 'false';

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

describe('silent root keys in Chords mode', () => {
  it('a, c, d, e, g: the melody keys move the stepper and make no sound; shelf keys play; Notes mode is as before', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    // a stashed shelf chord for the chord key (made while still in Notes mode)
    press('=', 'Equal');
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Keyboard mode' })).getByRole('radio', {
        name: 'Chords',
      })
    );
    vi.useFakeTimers();
    const n0 = oscs().length;
    expect(rootText()).toMatch(/^root 1/);
    // a: x moves the stepper to degree 2, silently, and releasing leaves it there
    press('x', 'KeyX');
    expect(rootText()).toMatch(/^root 2/);
    release('x', 'KeyX');
    expect(rootText()).toMatch(/^root 2/);
    // c: an octave up (h = the 13th key of 12 notes) is the same degree as the first
    press('h', 'KeyH');
    release('h', 'KeyH');
    expect(rootText()).toMatch(/^root 1/);
    press('c', 'KeyC');
    release('c', 'KeyC');
    expect(rootText()).toMatch(/^root 3/);
    // key repeat and typing do nothing (g)
    press('x', 'KeyX', { repeat: true });
    expect(rootText()).toMatch(/^root 3/);
    fireEvent.keyDown(screen.getAllByRole('textbox')[0], { key: 'x', code: 'KeyX' });
    expect(rootText()).toMatch(/^root 3/);
    advance(100);
    expect(oscs().length).toBe(n0); // no voice at all
    // d: the shelf chord key still plays, the stepper stays
    press('q', 'KeyQ');
    advance(50);
    expect(oscs().length).toBeGreaterThan(n0);
    expect(rootText()).toMatch(/^root 3/);
    release('q', 'KeyQ');
    // b: the silent root is where hold 4 puts the chip (degree 3 = 200 c)
    const chip = screen.getAllByRole('button', { name: EDO_MAJOR })[0];
    fireEvent.mouseEnter(chip);
    const n1 = oscs().length;
    fireEvent.keyDown(window, { key: '4' });
    advance(50);
    const h = oscs()
      .slice(n1)
      .map(hz)
      .sort((p, q) => p - q);
    expect(Math.round(cents(h[0], C4))).toBe(200);
    expect(h.map((x) => Math.round(cents(x, h[0])))).toEqual([0, 400, 700]);
    fireEvent.keyUp(window, { key: '4' });
    fireEvent.mouseLeave(chip);
    // a, c on the table's setup: the 12-EDO major subset (7 notes); z is degree 1, c degree 3, and a (the 8th key) wraps to degree 1
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    const dots = within(screen.getByRole('group', { name: /^Pitch circle/ })).getAllByRole(
      'button'
    );
    [0, 2, 4, 5, 7, 9, 11].forEach((i) => fireEvent.click(dots[i]));
    press('c', 'KeyC');
    release('c', 'KeyC');
    expect(rootText()).toMatch(/^root 3/);
    press('z', 'KeyZ');
    release('z', 'KeyZ');
    expect(rootText()).toMatch(/^root 1/);
    press('c', 'KeyC');
    release('c', 'KeyC');
    press('a', 'KeyA');
    release('a', 'KeyA');
    expect(rootText()).toMatch(/^root 1/);
    // linked melody: with a shelf chord's source linked (its subset is not this tab's), a silent root key still uses THIS tab's degrees
    fireEvent.click(screen.getByRole('checkbox', { name: 'Linked melody' }));
    press('c', 'KeyC');
    release('c', 'KeyC');
    press('q', 'KeyQ');
    advance(50);
    release('q', 'KeyQ');
    advance(2000);
    const n3 = oscs().length;
    press('x', 'KeyX');
    advance(100);
    release('x', 'KeyX');
    expect(rootText()).toMatch(/^root 2/);
    expect(oscs().length).toBe(n3);
    // e: Notes mode plays the note and moves the stepper
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Keyboard mode' })).getByRole('radio', {
        name: 'Notes',
      })
    );
    const n2 = oscs().length;
    press('x', 'KeyX');
    advance(50);
    release('x', 'KeyX');
    expect(oscs().length).toBeGreaterThan(n2);
    expect(rootText()).toMatch(/^root 2/);
  });
});

describe('pattern groups, folds and the Composites row', () => {
  it('h, i, j, k, m: stacked groups ranked inside themselves, folds remembered, ring left of the text column', async () => {
    const view = render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    const dots = within(screen.getByRole('group', { name: /^Pitch circle/ })).getAllByRole(
      'button'
    );
    [0, 2, 4, 5, 7, 9, 11].forEach((i) => fireEvent.click(dots[i]));
    // h, j: one group per default pattern, seven full rows each, ranks 1..7 inside the group
    const names = screen
      .getAllByRole('group', { name: /^Pattern / })
      .map((g) => g.getAttribute('aria-label'));
    expect(names).toEqual(
      ['2-2', '2-2-2', '2-2-2-2', '2-3', '3-2', '1-1', '3-3'].map((p) => `Pattern ${p}`)
    );
    expect(screen.queryByRole('combobox', { name: 'Positional pattern' })).toBeNull();
    for (const p of ['2-2', '3-3']) {
      const rows = within(
        screen.getByRole('list', { name: `Positional chords ${p}` })
      ).getAllByTestId('positional-row');
      expect(rows).toHaveLength(7);
      expect(
        rows.map((li) => Number(/#(\d)/.exec(li.textContent ?? '')?.[1])).sort((a, b) => a - b)
      ).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(rows[0].textContent).not.toMatch(/12-EDO/); // M8h: no generator name on the card
    }
    // fold 2-3 only: that group closes, the others stay open, and nothing was written before the fold
    // nothing written beyond the fixture's own groupShapes: false
    expect(window.localStorage.getItem(KEY_SETTINGS)).toBe('{"groupShapes":false}');
    fireEvent.click(screen.getByRole('button', { name: 'Pattern 2-3' }));
    expect(folded('Pattern 2-3')).toBe(true);
    expect(screen.queryByRole('list', { name: 'Positional chords 2-3' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Positional chords 2-2' })).toBeInTheDocument();
    // i: fold Positional; the count stays in the header
    fireEvent.click(screen.getByRole('button', { name: 'Positional' }));
    expect(folded('Positional')).toBe(true);
    expect(screen.queryByRole('list', { name: 'Positional chords 2-2' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Positional' }).closest('h3')).toHaveTextContent(
      /Positional\s*49/
    );
    // k: fold Triads and one family row of Tetrads; the other size stays open
    fireEvent.click(screen.getByRole('button', { name: 'Triads' }));
    expect(folded('Triads')).toBe(true);
    expect(screen.queryAllByRole('group', { name: /^Triads, / })).toHaveLength(0);
    expect(screen.getAllByRole('group', { name: /^Tetrads, / }).length).toBeGreaterThan(0);
    // one family row folds on its own: only its chips go, the other families of Tetrads keep theirs
    const famBtns = screen.getAllByRole('button', { name: /\(Tetrads\)$/ });
    expect(famBtns.length).toBeGreaterThan(1);
    const famChips = (b: HTMLElement) =>
      within(b.closest('[role="group"]') as HTMLElement).getAllByRole('button').length - 1;
    const others = famBtns.slice(1).map(famChips);
    expect(famChips(famBtns[0])).toBeGreaterThan(0);
    fireEvent.click(famBtns[0]);
    expect(famBtns[0]).toHaveAttribute('aria-expanded', 'false');
    // (the buttons of a row: its fold button, then its chips and their stash buttons)
    expect(famChips(famBtns[0])).toBe(0);
    expect(famBtns.slice(1).map(famChips)).toEqual(others);
    // reload: the folds come back, the rest is open
    view.unmount();
    render(<HarmonicFieldLabPage />);
    expect(folded('Positional')).toBe(true);
    expect(folded('Triads')).toBe(true);
    expect(screen.getByRole('button', { name: 'Tetrads' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    const stored = JSON.parse(window.localStorage.getItem(KEY_SETTINGS) ?? '{}') as {
      folds?: Record<string, boolean>;
    };
    expect(stored.folds).toMatchObject({ positional: true, 'size:Triads': true, 'pos:2-3': true });
    // open Positional again: Pattern 2-3 is still folded inside it
    fireEvent.click(screen.getByRole('button', { name: 'Positional' }));
    expect(folded('Pattern 2-3')).toBe(true);
    expect(screen.getByRole('list', { name: 'Positional chords 2-2' })).toBeInTheDocument();
    // the whole families group folds every family away
    fireEvent.click(screen.getByRole('button', { name: 'Ratio chords' }));
    expect(screen.queryAllByRole('group', { name: /^Tetrads, / })).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Tetrads' })).toBeNull();
    // m: Composites row: number, ring, then a text column holding the name above the buttons
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Composites/ }));
    fireEvent.click(screen.getByRole('button', { name: 'New composite' }));
    const ring = screen.getByTestId('composite-ring');
    const body = ring.nextElementSibling as HTMLElement;
    expect(body).not.toBeNull();
    const nameBtn = within(body).getByRole('button', { name: 'Rename Composite 1' });
    const itemsBtn = within(body).getByRole('button', { name: /items of Composite 1/ });
    expect(within(body).getByText(/0 notes · 0 items/)).toBeInTheDocument();
    expect(
      nameBtn.compareDocumentPosition(itemsBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(ring.previousElementSibling?.textContent).toBe('1');
  });
});
