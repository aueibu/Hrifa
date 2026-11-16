/**
 * M1 (Scala-tools arc): the Pairs panel (interval matrix). Scenario rows 10 to 14 (hover, pin, sounding and click reach the
 * matrix through the shared lab state), the color control and the search. The lib numbers are tested in
 * `src/lib/harmonic-field/intervalPairs.test.ts`; here only the wiring is.
 */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';

vi.setConfig({ testTimeout: 20_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const cells = () => screen.getAllByTestId('matrix-cell');
const cell = (from: number, to: number) =>
  cells().find((c) => c.dataset.from === String(from) && c.dataset.to === String(to))!;
const head = (axis: 'row' | 'col', n: number) =>
  screen.getAllByTestId(`matrix-${axis}-head`).find((h) => h.dataset.degree === String(n))!;

function openMatrix() {
  fireEvent.click(within(rail()).getByRole('tab', { name: /^Pairs/ }));
}
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

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

describe('Pairs panel', () => {
  it('is its own rail entry (the Spectrum panel is unchanged); the grid has an empty diagonal, a content table and steps', () => {
    render(<HarmonicFieldLabPage />);
    const tab = within(rail()).getByRole('tab', { name: /^Pairs/ });
    expect(tab.textContent).toMatch(/[0-9]+ intervals/);
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Spectrum/ }));
    expect(screen.queryByTestId('matrix-grid')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Matrix' })).toBeNull();
    openMatrix();
    const n = screen.getAllByTestId('matrix-col-head').length;
    expect(n).toBeGreaterThan(2);
    expect(cells()).toHaveLength(n * (n - 1));
    expect(screen.getAllByTestId('matrix-row').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('matrix-steps-row')).toHaveLength(n - 1);
    // a wrap-around cell is marked, and sits below the diagonal
    const wraps = cells().filter((c) => c.dataset.wrap === 'true');
    expect(wraps.length).toBe((n * (n - 1)) / 2);
    expect(wraps.every((c) => Number(c.dataset.to) < Number(c.dataset.from))).toBe(true);
  });

  it('color: Off is plain, Error sets a severity on every cell, Interval tints only repeated intervals', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    expect(cells().every((c) => !c.hasAttribute('data-sev') && !c.hasAttribute('data-tint'))).toBe(
      true
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Error' }));
    expect(cells().every((c) => /^[0-4]$/.test(c.dataset.sev ?? ''))).toBe(true);
    expect(cells().every((c) => !c.hasAttribute('data-tint'))).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Interval' }));
    expect(cells().every((c) => !c.hasAttribute('data-sev'))).toBe(true);
    expect(cells().every((c) => c.dataset.tint === 'wheel')).toBe(true);
    // equal intervals share a fill, and the fill is built from mark roles only
    const fills = new Map<string, Set<string>>();
    for (const c of cells()) {
      const key = /: ([^,]+),/.exec(c.getAttribute('aria-label')!)![1];
      fills.set(key, (fills.get(key) ?? new Set()).add(c.style.getPropertyValue('--mx-fill')));
    }
    expect([...fills.values()].every((f) => f.size === 1)).toBe(true);
    // the interval text is always in the cell
    expect(cells().every((c) => (c.textContent ?? '').length > 0)).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(cells().some((c) => c.hasAttribute('data-sev') || c.hasAttribute('data-tint'))).toBe(
      false
    );
  });

  it('picking a table row outlines its cells and the others step back; the figures appear', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    const first = screen.getAllByTestId('matrix-row')[0];
    fireEvent.click(within(first).getByRole('button'));
    const yes = cells().filter((c) => c.dataset.match === 'yes');
    expect(yes.length).toBeGreaterThan(0);
    expect(cells().filter((c) => c.dataset.match === 'no').length).toBe(
      cells().length - yes.length
    );
    const result = within(screen.getByTestId('matrix-result'));
    // a heading, then one labeled row per figure (no sentence built from inline pieces)
    for (const name of [
      /^Places?$/,
      'Degrees with it above them',
      'Covered degrees',
      'Used more than once',
      'Highest coverage',
    ]) {
      expect(result.getByText(name)).toBeInTheDocument();
    }
    expect(result.getByText(/^\d+ of \d+$/)).toBeInTheDocument();
    fireEvent.click(within(first).getByRole('button'));
    expect(cells().some((c) => c.dataset.match)).toBe(false);
  });

  it('search: a ratio finds its cells; a size nothing matches says so', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.change(screen.getByRole('textbox', { name: 'Interval to find' }), {
      target: { value: '3/2' },
    });
    const yes = cells().filter((c) => c.dataset.match === 'yes');
    expect(yes.length).toBeGreaterThan(0);
    expect(
      yes.every((c) => /\b701\.9 c\b|\b70[12]\.\d c\b/.test(c.getAttribute('aria-label')!))
    ).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Find tolerance in cents' }), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Interval to find' }), {
      target: { value: '1.5' },
    });
    expect(screen.getByText(/Nothing within 0 c of 1\.5 c/)).toBeInTheDocument();
  });
});

describe('matrix responsiveness (scenario rows 10 to 14)', () => {
  it('row 10: hovering a degree lights its row and its column', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.mouseEnter(head('row', 3));
    expect(head('row', 3)).toHaveAttribute('data-hot', 'true');
    expect(head('col', 3)).toHaveAttribute('data-hot', 'true');
    const hot = cells().filter((c) => c.dataset.hot === 'true');
    expect(hot.length).toBeGreaterThan(0);
    expect(hot.every((c) => c.dataset.from === '3' || c.dataset.to === '3')).toBe(true);
    fireEvent.mouseLeave(head('row', 3));
    expect(head('col', 3)).toHaveAttribute('data-hot', 'false');
  });

  it('row 11: hovering a cell sets the shared chord hover: its two degrees and the mirror cell light', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.mouseEnter(cell(1, 3));
    expect(cell(1, 3)).toHaveAttribute('data-chord', 'true');
    expect(cell(3, 1)).toHaveAttribute('data-chord', 'true');
    expect(cells().filter((c) => c.dataset.chord === 'true')).toHaveLength(2);
    expect(screen.getByTestId('matrix-status').textContent).toMatch(/^Degree 1 to degree 3:/);
    fireEvent.mouseLeave(cell(1, 3));
    expect(cells().some((c) => c.dataset.chord === 'true')).toBe(false);
  });

  it('row 13: Alt+click on a degree header pins it (and does not toggle it)', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    const before = screen.getAllByTestId('matrix-col-head').length;
    fireEvent.click(head('col', 2), { altKey: true });
    expect(head('col', 2)).toHaveAttribute('data-pin', 'true');
    expect(head('row', 2)).toHaveAttribute('data-pin', 'true');
    expect(screen.getAllByTestId('matrix-col-head')).toHaveLength(before);
    expect(
      cells()
        .filter((c) => c.dataset.pin === 'true')
        .every((c) => c.dataset.from === '2' || c.dataset.to === '2')
    ).toBe(true);
    fireEvent.click(head('col', 2), { altKey: true });
    expect(head('col', 2)).toHaveAttribute('data-pin', 'false');
  });

  it('rows 12 and 14: clicking a cell plays the two notes with the upper above the lower, and both cells light while they sound', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    openMatrix();
    // the wrap-around cell below the diagonal: from the higher degree up to the next repeat
    const wrap = cells().find((c) => c.dataset.wrap === 'true')!;
    const label = wrap.getAttribute('aria-label')!;
    const size = Number(/, (\d+\.\d) c,/.exec(label)![1]);
    const from = wrap.dataset.from!;
    const to = wrap.dataset.to!;
    const start = oscs().length;
    fireEvent.click(wrap);
    advance(100);
    const heard = oscs()
      .slice(start)
      .map(hz)
      .sort((a, b) => a - b);
    expect(heard).toHaveLength(2);
    expect(1200 * Math.log2(heard[1] / heard[0])).toBeCloseTo(size, 0); // rising, never the inversion
    expect(wrap).toHaveAttribute('data-lit', 'true');
    expect(cell(Number(to), Number(from))).toHaveAttribute('data-lit', 'true'); // the mirror
    expect(head('row', Number(from))).toHaveAttribute('data-lit', 'true');
    // a pair that does not sound stays dark
    expect(cells().filter((c) => c.dataset.lit === 'true')).toHaveLength(2);
    advance(3000);
    expect(cells().some((c) => c.dataset.lit === 'true')).toBe(false);
  });

  it('row 12: while a pair sounds, the content-table rows of its interval light', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    openMatrix();
    expect(screen.getAllByTestId('matrix-row').some((r) => r.dataset.lit === 'true')).toBe(false);
    fireEvent.click(cell(1, 2));
    advance(100);
    expect(screen.getAllByTestId('matrix-row').some((r) => r.dataset.lit === 'true')).toBe(true);
    advance(3000);
    expect(screen.getAllByTestId('matrix-row').some((r) => r.dataset.lit === 'true')).toBe(false);
  });
});

describe('Find box: a slash or colon is a ratio, anything else is cents', () => {
  const find = () => screen.getByRole('textbox', { name: 'Interval to find' });
  const yes = () => cells().filter((c) => c.dataset.match === 'yes');
  const setup = () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find tolerance in cents' }), {
      target: { value: '3' },
    });
  };

  it('"700", "700 c" and "700c" find exactly what "3/2" finds (the lab default scale; the five cells of the 5-limit major scale are in intervalPairs.test.ts)', () => {
    setup();
    fireEvent.change(find(), { target: { value: '3/2' } });
    const ratio = yes().length;
    expect(ratio).toBeGreaterThan(0);
    for (const t of ['700', '700 c', '700c']) {
      fireEvent.change(find(), { target: { value: t } });
      expect(yes()).toHaveLength(ratio);
    }
  });

  it('"3" is 3 cents: nothing is near', () => {
    setup();
    fireEvent.change(find(), { target: { value: '3' } });
    expect(yes()).toHaveLength(0);
    expect(screen.getByText(/Nothing within 3 c of 3 c/)).toBeInTheDocument();
  });

  it("junk shows the can't-read message", () => {
    setup();
    fireEvent.change(find(), { target: { value: 'abc' } });
    expect(screen.getByText(/Write a ratio such as 3\/2/)).toBeInTheDocument();
  });
});

describe('Color mode survives a refresh', () => {
  it('Error is restored after remounting', () => {
    const first = render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.click(screen.getByRole('radio', { name: 'Error' }));
    first.unmount();
    render(<HarmonicFieldLabPage />);
    openMatrix();
    expect(screen.getByRole('radio', { name: 'Error' })).toBeChecked();
    expect(cells().every((c) => /^[0-4]$/.test(c.dataset.sev ?? ''))).toBe(true);
  });
});

describe('search and pick edge cases', () => {
  const find = () => screen.getByRole('textbox', { name: 'Interval to find' });
  const tolBox = () => screen.getByRole('textbox', { name: 'Find tolerance in cents' });
  const yesCount = () => cells().filter((c) => c.dataset.match === 'yes').length;

  it('an empty tolerance box uses the lab default (shown as the placeholder), not 0', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    const def = tolBox().getAttribute('placeholder')!;
    expect(Number(def)).toBeGreaterThan(0);
    fireEvent.change(tolBox(), { target: { value: '' } });
    fireEvent.change(find(), { target: { value: '1.5' } });
    expect(screen.queryByText(/within 0 c/)).toBeNull();
    fireEvent.change(tolBox(), { target: { value: 'abc' } });
    expect(screen.queryByText(/within 0 c/)).toBeNull();
  });

  it('a negative cents search is reduced into the repeat like a ratio (-100 c finds what 1100 c finds)', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.change(find(), { target: { value: '1100 c' } });
    const direct = yesCount();
    fireEvent.change(find(), { target: { value: '-100 c' } });
    expect(yesCount()).toBe(direct);
  });

  it('the picked row follows its interval: removing a degree never outlines a different interval', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    const rowsBefore = screen.getAllByTestId('matrix-row');
    const first = rowsBefore[0];
    const sizeOf = (r: HTMLElement) => r.querySelectorAll('td')[1].textContent;
    const size = sizeOf(first);
    fireEvent.click(within(first).getByRole('button'));
    fireEvent.click(head('col', 1));
    const picked = screen.getAllByTestId('matrix-row').filter((r) => r.dataset.pick === 'true');
    expect(picked.every((r) => sizeOf(r) === size)).toBe(true);
    // hover cleared after the click removed the header
    fireEvent.mouseLeave(head('col', 1));
    expect(head('col', 1)).toHaveAttribute('data-hot', 'false');
  });
});

describe('large window (rows 19 to 21)', () => {
  it('opens with the grid; a cell click inside it reaches the lab state; the picked row and color survive closing', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.click(screen.getByRole('button', { name: 'Open Pairs in a large window' }));
    const win = screen.getByRole('dialog');
    const inWin = within(win).getAllByTestId('matrix-cell');
    expect(inWin.length).toBeGreaterThan(2);
    const start = oscs().length;
    fireEvent.click(inWin[0]);
    advance(100);
    expect(oscs().length - start).toBe(2);
    expect(inWin[0]).toHaveAttribute('data-lit', 'true');
    // pick a row and a color inside the window, close, reopen
    fireEvent.click(within(within(win).getAllByTestId('matrix-row')[0]).getByRole('button'));
    fireEvent.click(within(win).getByRole('radio', { name: 'Error' }));
    fireEvent.keyDown(win, { key: 'Escape' });
    advance(50);
    expect(screen.queryByRole('dialog')).toBeNull();
    const panelCells = screen.getAllByTestId('matrix-cell');
    expect(panelCells.some((c) => c.dataset.match === 'yes')).toBe(true);
    expect(panelCells.every((c) => /^[0-4]$/.test(c.dataset.sev ?? ''))).toBe(true);
  });

  it('row 20: hovering a header and Alt+clicking a degree number inside the window reach the lab state', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.click(screen.getByRole('button', { name: 'Open Pairs in a large window' }));
    const win = within(screen.getByRole('dialog'));
    const h = (n: number) =>
      win.getAllByTestId('matrix-col-head').find((x) => x.dataset.degree === String(n))!;
    fireEvent.mouseEnter(h(2));
    expect(h(2)).toHaveAttribute('data-hot', 'true');
    fireEvent.mouseLeave(h(2));
    fireEvent.click(h(2), { altKey: true });
    expect(h(2)).toHaveAttribute('data-pin', 'true');
  });
});

describe('polish: dots, dimming and the Find clear button', () => {
  const find = () => screen.getByRole('textbox', { name: 'Interval to find' }) as HTMLInputElement;

  it('a table dot has exactly the style of its interval cells (Interval mode), and is not dimmed with them', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.click(screen.getByRole('radio', { name: 'Interval' }));
    const rows = screen.getAllByTestId('matrix-row');
    expect(rows.length).toBeGreaterThan(1);
    for (const row of [rows[0], rows[rows.length - 1]]) {
      const swatch = within(row).getByTestId('matrix-swatch');
      fireEvent.mouseEnter(row);
      const mine = cells().filter((c) => c.dataset.match === 'yes');
      expect(mine.length).toBeGreaterThan(0);
      for (const c of mine) {
        const fill = c.style.getPropertyValue('--mx-fill');
        expect(fill).toContain('color-mix');
        expect(swatch.style.getPropertyValue('--mx-fill')).toBe(fill);
      }
      expect(swatch.dataset.match).toBeUndefined();
      fireEvent.mouseLeave(row);
    }
  });

  it('Error mode shows no dot in the table', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    fireEvent.click(screen.getByRole('radio', { name: 'Error' }));
    expect(screen.queryAllByTestId('matrix-swatch')).toHaveLength(0);
  });

  it('Clear Find: absent when empty, present after typing; a click clears the text, keeps the tolerance, drops the result and focuses the box', () => {
    render(<HarmonicFieldLabPage />);
    openMatrix();
    expect(screen.queryByRole('button', { name: 'Clear Find' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find tolerance in cents' }), {
      target: { value: '7' },
    });
    fireEvent.change(find(), { target: { value: '3/2' } });
    expect(screen.getByTestId('matrix-result')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Find' }));
    expect(find().value).toBe('');
    expect(screen.queryByTestId('matrix-result')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear Find' })).toBeNull();
    expect(document.activeElement).toBe(find());
    expect(
      (screen.getByRole('textbox', { name: 'Find tolerance in cents' }) as HTMLInputElement).value
    ).toBe('7');
  });
});
