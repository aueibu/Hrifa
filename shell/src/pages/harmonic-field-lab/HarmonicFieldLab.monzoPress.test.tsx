/**
 * M9e: the Monzo matrix paints on press. Hovering only previews (the painted cells stay, the hovered cell is outlined); a click
 * sets one cell and does not add; a drag paints a stroke; Esc during a stroke restores the monzo before the press and keeps the
 * picker open; Enter adds. One page render for all the cases.
 */
import { act, fireEvent, render, screen } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('M9e monzo paints on press', () => {
  it('hover previews, click sets, drag paints, Esc cancels, Enter adds', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('radio', { name: 'Rel' }));
    const ringNote = Array.from(
      screen
        .getByRole('group', { name: /^Pitch circle/ })
        .querySelectorAll<HTMLElement>('[role="button"]')
    ).find((b) => /^\S+, -?\d+\.\d cents/.test(b.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(ringNote, { shiftKey: true });
    fireEvent.click(screen.getByRole('radio', { name: 'Monzo' }));
    const frame = () =>
      act(() => {
        vi.advanceTimersByTime(40);
      });
    frame();
    const matrix = screen.getByTestId('monzo-matrix');
    const rowH = parseFloat(
      (screen.getAllByTestId('monzo-value')[0] as HTMLElement).style.height || '12'
    );
    const cellW = parseFloat(matrix.style.width) / 13;
    matrix.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }) as DOMRect;
    const at = (col: number, value: number) => ({
      clientX: (col + 0.5) * cellW,
      clientY: (12 - value + 0.5) * rowH,
    });
    /** The painted exponent of each column. */
    const painted = () =>
      Array.from(matrix.querySelectorAll('[data-testid="monzo-strip"]')).map((c) =>
        Number(c.querySelector('[data-now="true"]')?.getAttribute('data-value'))
      );
    const ringCount = () =>
      document.querySelectorAll('[aria-label^="Pitch circle"] [role="button"]').length;
    const zeros = Array.from({ length: 13 }, () => 0);

    // K1: hovering outlines the cell and leaves the painted monzo alone
    fireEvent.mouseEnter(matrix);
    fireEvent.mouseMove(matrix, at(1, 1));
    frame();
    expect(painted()).toEqual(zeros);
    expect(matrix.querySelectorAll('[data-hover="true"]')).toHaveLength(1);
    fireEvent.mouseMove(matrix, at(2, -1));
    frame();
    expect(painted()).toEqual(zeros);
    expect(matrix.querySelector('[data-hover="true"]')?.getAttribute('data-value')).toBe('-1');

    // K2: a click sets that one cell and adds nothing
    const before = ringCount();
    fireEvent.mouseDown(matrix, at(1, 1));
    fireEvent.mouseUp(matrix, at(1, 1));
    frame();
    expect(painted()).toEqual([0, 1, ...zeros.slice(2)]);
    expect(ringCount()).toBe(before);

    // K3 and K5: a drag from column 2 to column 5 paints both ends and fills the columns the pointer skipped (3 and 4) on the
    // straight path; Esc puts back the monzo before the press and the picker stays open
    fireEvent.mouseDown(matrix, at(2, 2));
    fireEvent.mouseMove(matrix, { ...at(5, -2), buttons: 1 });
    frame();
    expect(painted()).toEqual([0, 1, 2, 1, -1, -2, ...zeros.slice(6)]);
    fireEvent.keyDown(window, { key: 'Escape' });
    frame();
    expect(painted()).toEqual([0, 1, ...zeros.slice(2)]);
    fireEvent.mouseUp(matrix);
    expect(screen.getByTestId('monzo-matrix')).toBeInTheDocument();

    // a stroke ends when the button is already up on a move (released outside the window), and on window blur
    fireEvent.mouseDown(matrix, at(5, 2));
    fireEvent.mouseMove(matrix, { ...at(6, 3), buttons: 0 });
    fireEvent.mouseMove(matrix, { ...at(7, 3), buttons: 1 });
    frame();
    expect(painted()).toEqual([0, 1, 0, 0, 0, 2, ...zeros.slice(6)]);
    fireEvent.mouseDown(matrix, at(5, 2));
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    fireEvent.mouseMove(matrix, { ...at(6, 3), buttons: 1 });
    frame();
    expect(painted()).toEqual([0, 1, 0, 0, 0, 2, ...zeros.slice(6)]);
    fireEvent.mouseDown(matrix, at(5, 0));
    fireEvent.mouseUp(matrix);
    frame();
    expect(painted()).toEqual([0, 1, ...zeros.slice(2)]);

    // K6: Enter adds the painted monzo
    fireEvent.keyDown(document.body, { key: 'Enter' });
    frame();
    expect(ringCount()).toBe(before + 1);

    // K4: Ctrl paints a straight line from the press cell; columns the line stops covering return to their snapshot; release commits
    fireEvent.click(screen.getByTestId('monzo-reset'));
    frame();
    fireEvent.mouseDown(matrix, { ...at(1, 2), ctrlKey: true });
    fireEvent.mouseMove(matrix, { ...at(4, -2), ctrlKey: true, buttons: 1 });
    frame();
    expect(painted()).toEqual([0, 2, 1, -1, -2, ...zeros.slice(5)]);
    fireEvent.mouseMove(matrix, { ...at(2, -2), ctrlKey: true, buttons: 1 });
    frame();
    expect(painted()).toEqual([0, 2, -2, ...zeros.slice(3)]);
    fireEvent.mouseUp(matrix);
    frame();
    expect(painted()).toEqual([0, 2, -2, ...zeros.slice(3)]);

    // K8: = pins the previewed interval while a cell is hovered, else the painted one
    fireEvent.click(screen.getByTestId('monzo-reset'));
    frame();
    for (const [col, value] of [
      [0, -4],
      [1, 4],
      [2, -1],
    ]) {
      fireEvent.mouseDown(matrix, at(col, value));
      fireEvent.mouseUp(matrix);
    }
    frame();
    fireEvent.mouseMove(matrix, at(3, 1));
    frame();
    fireEvent.keyDown(window, { key: '=', code: 'Equal' });
    frame();
    const pins = () =>
      screen.getAllByTestId('pin-card').map((c) => c.getAttribute('aria-label') ?? '');
    expect(pins()).toHaveLength(1);
    expect(pins()[0]).toContain('[-4 4 -1 1>');
    fireEvent.mouseLeave(matrix);
    frame();
    fireEvent.keyDown(window, { key: '=', code: 'Equal' });
    frame();
    expect(pins()).toHaveLength(2);
    expect(pins()[1]).toContain('[-4 4 -1>');

    // K13 / K14: Alt shows the inverse; painting in the shown view stores the negative; Alt + double-click adds the SHOWN value
    fireEvent.click(screen.getByTestId('monzo-reset'));
    frame();
    // 81/80 = [-4 4 -1>
    for (const [col, value] of [
      [0, -4],
      [1, 4],
      [2, -1],
    ]) {
      fireEvent.mouseDown(matrix, at(col, value));
      fireEvent.mouseUp(matrix);
    }
    frame();
    const m8180 = [-4, 4, -1, ...zeros.slice(3)];
    const m8081 = [4, -4, 1, ...zeros.slice(3)];
    expect(painted()).toEqual(m8180);
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    frame();
    expect(painted()).toEqual(m8081);
    // painting the shown +1 on the 7 column stores -1: after release the matrix shows -1 there
    fireEvent.mouseDown(matrix, at(3, 1));
    fireEvent.mouseUp(matrix);
    frame();
    expect(painted()).toEqual([4, -4, 1, 1, ...zeros.slice(4)]);
    fireEvent.keyUp(window, { key: 'Alt', altKey: false });
    frame();
    expect(painted()).toEqual([-4, 4, -1, -1, ...zeros.slice(4)]);
    // put the 7 column back to 0 (Alt not held), then Alt + double-click on a 0 cell adds 80/81 (160/81 folded), not 81/80
    fireEvent.mouseDown(matrix, at(3, 0));
    fireEvent.mouseUp(matrix);
    frame();
    expect(painted()).toEqual(m8180);
    const n0 = ringCount();
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    frame();
    fireEvent.doubleClick(matrix, { ...at(4, 0), altKey: true });
    frame();
    expect(ringCount()).toBe(n0 + 1);
    expect(
      document.querySelector('[aria-label^="Pitch circle"] [aria-label^="160/81"]')
    ).not.toBeNull();
    fireEvent.keyUp(window, { key: 'Alt', altKey: false });
    frame();
    expect(painted()).toEqual(m8180);
  });

  it('M9f: the header band splits the painted 81/80 (32 / 50 / 18, L2: 26 / 65 / 9)', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('radio', { name: 'Rel' }));
    const ringNote = Array.from(
      screen
        .getByRole('group', { name: /^Pitch circle/ })
        .querySelectorAll<HTMLElement>('[role="button"]')
    ).find((b) => /^\S+, -?\d+\.\d cents/.test(b.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(ringNote, { shiftKey: true });
    fireEvent.click(screen.getByRole('radio', { name: 'Monzo' }));
    const frame = () =>
      act(() => {
        vi.advanceTimersByTime(40);
      });
    frame();
    const matrix = screen.getByTestId('monzo-matrix');
    const rowH = parseFloat(
      (screen.getAllByTestId('monzo-value')[0] as HTMLElement).style.height || '12'
    );
    const cellW = parseFloat(matrix.style.width) / 13;
    matrix.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }) as DOMRect;
    const pcts = () =>
      Array.from(screen.getAllByTestId('monzo-split-pct')).map((e) => e.textContent ?? '');
    const bandTop = () => screen.getByTestId('monzo-split').style.height;
    const matrixTop = () => matrix.style.top;
    // nothing painted: every percent blank, the band is there
    expect(pcts().every((t) => t === '')).toBe(true);
    const band0 = bandTop();
    const top0 = matrixTop();
    for (const [col, value] of [
      [0, -4],
      [1, 4],
      [2, -1],
    ]) {
      fireEvent.mouseDown(matrix, {
        clientX: (col + 0.5) * cellW,
        clientY: (12 - value + 0.5) * rowH,
      });
      fireEvent.mouseUp(matrix);
    }
    frame();
    expect(pcts().slice(0, 4)).toEqual(['32', '50', '18', '']);
    expect(screen.getByTestId('monzo-split-total').textContent).toBe('12.66');
    // the band and the matrix do not move
    expect(bandTop()).toBe(band0);
    expect(matrixTop()).toBe(top0);
    fireEvent.click(screen.getByRole('radio', { name: 'L2' }));
    frame();
    expect(pcts().slice(0, 4)).toEqual(['26', '65', '9', '']);
    expect(screen.getByTestId('monzo-split-total').textContent).toBe('7.85');
    fireEvent.click(screen.getByRole('radio', { name: 'L-inf' }));
    frame();
    expect(pcts().slice(0, 4)).toEqual(['', 'max', '', '']);
    fireEvent.click(screen.getByRole('radio', { name: 'L1' }));
    fireEvent.click(screen.getByTestId('monzo-octaves'));
    frame();
    expect(pcts().slice(0, 4)).toEqual(['', '73', '27', '']);
    expect(matrixTop()).toBe(top0);
  });
});

describe('M9f look 1: Fit bars, label click, shift buttons, Rows', () => {
  function setup() {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('radio', { name: 'Rel' }));
    const ringNote = Array.from(
      screen
        .getByRole('group', { name: /^Pitch circle/ })
        .querySelectorAll<HTMLElement>('[role="button"]')
    ).find((b) => /^\S+, -?\d+\.\d cents/.test(b.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(ringNote, { shiftKey: true });
    fireEvent.click(screen.getByRole('radio', { name: 'Monzo' }));
    const frame = () =>
      act(() => {
        vi.advanceTimersByTime(40);
      });
    frame();
    const matrix = screen.getByTestId('monzo-matrix');
    const rowH = parseFloat(
      (screen.getAllByTestId('monzo-value')[0] as HTMLElement).style.height || '12'
    );
    const cellW = parseFloat(matrix.style.width) / 13;
    matrix.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }) as DOMRect;
    const paint = (col: number, value: number) => {
      fireEvent.mouseDown(matrix, {
        clientX: (col + 0.5) * cellW,
        clientY: (12 - value + 0.5) * rowH,
      });
      fireEvent.mouseUp(matrix);
    };
    const painted = () =>
      Array.from(matrix.querySelectorAll('[data-testid="monzo-strip"]')).map((c) =>
        Number(c.querySelector('[data-now="true"]')?.getAttribute('data-value'))
      );
    const comma = () => {
      paint(0, -4);
      paint(1, 4);
      paint(2, -1);
      frame();
    };
    const click = (el: HTMLElement) => {
      fireEvent.click(el);
      frame();
    };
    const up = () => screen.getByTestId('monzo-shift-up') as HTMLButtonElement;
    const down = () => screen.getByTestId('monzo-shift-down') as HTMLButtonElement;
    return { frame, matrix, paint, painted, comma, click, up, down };
  }
  const z = (n: number) => Array.from({ length: n }, () => 0);
  const row = (...v: number[]) => [...v, ...z(13 - v.length)];
  const pctOf = (els: HTMLElement[]) => els.map((b) => Math.round(Number(b.dataset.bar) * 100));

  it('F15 / F16: Fit changes the bars, not the numbers; octaves off draws the ghost', () => {
    const { frame, comma } = setup();
    comma();
    const bars = () => pctOf(screen.getAllByTestId('monzo-split-bar'));
    const pcts = () =>
      screen
        .getAllByTestId('monzo-split-pct')
        .map((e) => e.textContent ?? '')
        .slice(0, 3);
    expect(bars()).toEqual([32, 50, 18]);
    fireEvent.click(screen.getByTestId('monzo-fit'));
    frame();
    expect(bars()).toEqual([63, 100, 37]);
    expect(pcts()).toEqual(['32', '50', '18']);
    fireEvent.click(screen.getByRole('radio', { name: 'L2' }));
    frame();
    expect(bars()).toEqual([40, 100, 13]);
    expect(pcts()).toEqual(['26', '65', '9']);
    fireEvent.click(screen.getByRole('radio', { name: 'L1' }));
    fireEvent.click(screen.getByTestId('monzo-octaves'));
    frame();
    expect(pctOf([screen.getByTestId('monzo-split-ghost')])).toEqual([63]);
    expect(pcts()[0]).toBe('');
    fireEvent.click(screen.getByTestId('monzo-fit'));
    frame();
    expect(pctOf([screen.getByTestId('monzo-split-ghost')])).toEqual([46]);
    expect(screen.queryAllByTestId('monzo-split-bar')).toHaveLength(2);
  });

  it('F17 / F18: Rows is one column of 13, a bar and number only on used primes, same area height', () => {
    const { frame, comma } = setup();
    comma();
    const area = screen.getByTestId('monzo-area').style.height;
    fireEvent.click(screen.getByRole('radio', { name: 'Rows' }));
    frame();
    expect(screen.getByTestId('monzo-area').style.height).toBe(area);
    const rows = screen.getAllByTestId('monzo-row');
    expect(rows.map((r) => r.dataset.prime)).toEqual([
      '2',
      '3',
      '5',
      '7',
      '11',
      '13',
      '17',
      '19',
      '23',
      '29',
      '31',
      '37',
      '41',
    ]);
    // every row keeps its split slot (so the centered grid never jumps sideways); only used primes draw a bar and number
    expect(screen.getAllByTestId('monzo-row-split')).toHaveLength(13);
    expect(rows[3].querySelector('[data-testid="monzo-row-split"]')).not.toBeNull();
    expect(rows[3].querySelector('[data-testid="monzo-row-bar"]')).toBeNull();
    expect(pctOf(screen.getAllByTestId('monzo-row-bar'))).toEqual([32, 50, 18]);
    fireEvent.click(screen.getByTestId('monzo-fit'));
    frame();
    expect(pctOf(screen.getAllByTestId('monzo-row-bar'))).toEqual([63, 100, 37]);
    fireEvent.click(screen.getByTestId('monzo-octaves'));
    frame();
    expect(screen.getAllByTestId('monzo-row-ghost')).toHaveLength(1);
    expect(screen.getAllByTestId('monzo-row-bar')).toHaveLength(2);
  });

  it('F17: the split slot is on every row at 1/1 and after a + click', () => {
    const { frame } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Rows' }));
    frame();
    expect(screen.getAllByTestId('monzo-row-split')).toHaveLength(13);
    fireEvent.click(screen.getAllByRole('button', { name: 'Raise the exponent of 3' })[0]);
    frame();
    expect(screen.getAllByTestId('monzo-row-split')).toHaveLength(13);
    expect(screen.getAllByTestId('monzo-row-bar')).toHaveLength(1);
  });

  it('Enter after a shift or label click adds (ring grows) and does not re-fire the button', () => {
    const { frame, painted, comma, click, up } = setup();
    comma();
    const rings = () =>
      document.querySelectorAll('[aria-label^="Pitch circle"] [role="button"]').length;
    // the mouse press must not move focus onto the button
    expect(fireEvent.mouseDown(up())).toBe(false);
    click(up());
    expect(painted()).toEqual(row(-3, 5, 0));
    const before = rings();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    frame();
    expect(painted()).toEqual(row(-3, 5, 0));
    expect(rings()).toBe(before + 1);
    const label = screen.getAllByTestId('monzo-label')[0];
    expect(fireEvent.mouseDown(label)).toBe(false);
  });

  it('F21: a label click and Reset forget the frozen shift set', () => {
    const { painted, click, comma, up, down } = setup();
    comma();
    click(up());
    expect(painted()).toEqual(row(-3, 5, 0));
    click(screen.getAllByTestId('monzo-label').find((l) => l.dataset.value === '1')!);
    expect(painted()).toEqual(Array.from({ length: 13 }, () => 1));
    click(up());
    expect(painted()).toEqual(Array.from({ length: 13 }, () => 2));
    comma();
    click(up());
    click(screen.getByRole('button', { name: 'Reset' }));
    expect(painted()).toEqual(z(13));
    expect(up().disabled).toBe(true);
    expect(down().disabled).toBe(true);
  });

  it('F19: a label sets all 13 primes (0 clears); with Alt it sets the shown value', () => {
    const { frame, painted, click, comma } = setup();
    const label = (v: number) =>
      screen.getAllByTestId('monzo-label').find((l) => l.dataset.value === String(v))!;
    click(label(1));
    expect(painted()).toEqual(Array.from({ length: 13 }, () => 1));
    click(label(0));
    expect(painted()).toEqual(z(13));
    comma();
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    frame();
    click(label(2));
    expect(painted()).toEqual(Array.from({ length: 13 }, () => 2));
    fireEvent.keyUp(window, { key: 'Alt', altKey: false });
    frame();
    expect(painted()).toEqual(Array.from({ length: 13 }, () => -2));
  });

  it('F20 / F21: shifts round-trip 81/80 and a paint starts a new frozen set', () => {
    const { frame, painted, click, comma, paint, up, down } = setup();
    comma();
    click(up());
    expect(painted()).toEqual(row(-3, 5, 0));
    click(up());
    expect(painted()).toEqual(row(-2, 6, 1));
    click(down());
    expect(painted()).toEqual(row(-3, 5, 0));
    click(down());
    expect(painted()).toEqual(row(-4, 4, -1));
    // 5 passed through 0 above and came back (the set was kept); a paint then starts a new set
    click(up());
    paint(3, 1);
    frame();
    expect(painted()).toEqual(row(-3, 5, 0, 1));
    click(up());
    expect(painted()).toEqual(row(-2, 6, 0, 2));
    // a label click clears the set: everything is 0, so both buttons are disabled
    fireEvent.click(screen.getAllByTestId('monzo-label').find((l) => l.dataset.value === '0')!);
    frame();
    expect(up().disabled).toBe(true);
    expect(down().disabled).toBe(true);
  });

  it('F22: past +/-12 is refused and 1/1 disables both', () => {
    const { frame, painted, click, up, down, paint } = setup();
    expect(up().disabled).toBe(true);
    expect(down().disabled).toBe(true);
    paint(1, 12);
    paint(0, -3);
    frame();
    expect(up().disabled).toBe(true);
    expect(down().disabled).toBe(false);
    click(down());
    expect(painted()).toEqual(row(-4, 11));
    expect(up().disabled).toBe(false);
  });

  it('F23: with Alt held a shift moves the shown view (stores the negative)', () => {
    const { frame, painted, click, comma, up } = setup();
    comma();
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    frame();
    click(up());
    expect(painted()).toEqual(row(5, -3, 2));
    fireEvent.keyUp(window, { key: 'Alt', altKey: false });
    frame();
    expect(painted()).toEqual(row(-5, 3, -2));
  });
});
