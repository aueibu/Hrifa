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
});
