/** M8b: the Relative pitches generator's modal (redesign 3): a ring copy in the middle, ratio bands round it. */
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

const mainRing = () => screen.getByRole('group', { name: /^Pitch circle/ });
const ringNotes = () =>
  within(mainRing()).getAllByRole('button', { name: /^\S+, -?\d+\.\d cents/ });
const half = (ratio: string) =>
  screen.getAllByTestId('relative-half').find((h) => h.getAttribute('data-ratio') === ratio)!;
// M8e: Shift+click a ring note opens the picker (a plain click toggles the subset)
const openOn = (el: Element) => fireEvent.click(el, { shiftKey: true });
const openRel = () => {
  render(<HarmonicFieldLabPage />);
  fireEvent.click(screen.getByRole('radio', { name: 'Rel' }));
};

describe('M8b relative modal', () => {
  it('Shift+click on 1/1 opens the modal with a ring copy and no Remove button', () => {
    openRel();
    expect(ringNotes()).toHaveLength(1);
    expect(screen.queryByTestId('relative-menu')).toBeNull();
    openOn(ringNotes()[0]);
    expect(screen.getByTestId('relative-menu')).toBeTruthy();
    expect(screen.getByText('From 1/1')).toBeTruthy();
    // the center is a copy of the ring (a second pitch circle), not 1/1 text
    expect(within(screen.getByTestId('relative-ring')).getByRole('group')).toBeTruthy();
    // the opening view (full-screen, 9 ring places): levels 1 to 3 (6 + 12 + 30) and the next six odd-limit rings, each ratio one cell
    expect(screen.getAllByTestId('relative-half')).toHaveLength(154);
    expect(screen.queryByTestId('relative-remove')).toBeNull();
  });

  it('Shift+click opens the modal without toggling the subset; a plain click toggles the subset', () => {
    openRel();
    expect(ringNotes()[0].getAttribute('aria-label')).toContain('in subset');
    openOn(ringNotes()[0]);
    expect(screen.getByTestId('relative-menu')).toBeTruthy();
    // a subset toggle would have taken 1/1 out of the subset
    expect(ringNotes()[0].getAttribute('aria-label')).toContain('in subset');
    fireEvent.keyDown(screen.getByTestId('relative-menu'), { key: 'Escape' });
    fireEvent.click(ringNotes()[0]);
    expect(screen.queryByTestId('relative-menu')).toBeNull();
    expect(ringNotes()[0].getAttribute('aria-label')).not.toContain('in subset');
  });

  it('hovering the 3/2 cell reads out above and ghosts on the inner ring; a click adds; a repeat says so; Escape closes', () => {
    openRel();
    openOn(ringNotes()[0]);
    expect(screen.queryByTestId('relative-ghost')).toBeNull();
    fireEvent.mouseEnter(half('3/2'));
    expect(screen.getByTestId('relative-line').textContent).toBe('3/2 above 1/1 = 3/2 (702.0 c)');
    const ghost = screen.getByTestId('relative-ghost');
    expect(screen.getByTestId('relative-ring').contains(ghost)).toBe(true);
    expect(ghost.getAttribute('data-tone')).toBe('above');
    expect(screen.getByTestId('relative-dir').getAttribute('data-dir')).toBe('above');
    // Alt held: the same cell reads below, live, and the ghost turns teal
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    expect(screen.getByTestId('relative-dir').getAttribute('data-dir')).toBe('below');
    expect(screen.getByTestId('relative-half-selected').getAttribute('data-dir')).toBe('below');
    expect(screen.getByTestId('relative-line').textContent).toContain('3/2 below 1/1 = 4/3');
    expect(screen.getByTestId('relative-ghost').getAttribute('data-tone')).toBe('below');
    fireEvent.keyUp(window, { key: 'Alt', altKey: false });
    expect(screen.getByTestId('relative-dir').getAttribute('data-dir')).toBe('above');
    // none on the main ring
    expect(within(mainRing()).queryByTestId('relative-ghost')).toBeNull();
    fireEvent.click(half('3/2'));
    expect(
      within(mainRing()).getAllByRole('button', { name: /^\S+, -?\d+\.\d cents/ })
    ).toHaveLength(2);
    expect(screen.getByTestId('relative-menu')).toBeTruthy();
    fireEvent.click(half('3/2'));
    expect(screen.getByTestId('relative-line').textContent).toBe(
      'That pitch is already in the field.'
    );
    fireEvent.keyDown(screen.getByTestId('relative-menu'), { key: 'Escape' });
    expect(screen.queryByTestId('relative-menu')).toBeNull();
  });

  it('a click with Alt held adds the note below: 4/3 (and does not pin)', () => {
    openRel();
    openOn(ringNotes()[0]);
    fireEvent.click(half('3/2'), { altKey: true });
    const names = ringNotes().map((n) => n.getAttribute('aria-label')!.split(',')[0]);
    expect(names).toContain('4/3');
    expect(names).not.toContain('3/2');
  });

  it('the Bands toggle turns the bands: from the source note by default, Fixed puts unison at noon', () => {
    openRel();
    openOn(ringNotes()[0]);
    fireEvent.click(half('3/2'));
    openOn(ringNotes().find((n) => n.getAttribute('aria-label')!.startsWith('3/2'))!);
    const bands = () => screen.getByRole('group', { name: /^Relative pitches menu/ });
    // 3/2 is 702 of 1200 cents: about 210.6 degrees clockwise
    expect(Number(bands().getAttribute('data-band-rotation'))).toBeCloseTo(210.6, 0);
    fireEvent.click(screen.getByRole('radio', { name: 'Fixed' }));
    expect(Number(bands().getAttribute('data-band-rotation'))).toBe(0);
    fireEvent.click(screen.getByRole('radio', { name: 'Bands: From note' }));
    expect(Number(bands().getAttribute('data-band-rotation'))).toBeCloseTo(210.6, 0);
  });

  it('key 1 in Relative mode does not open the modal', () => {
    openRel();
    fireEvent.mouseEnter(ringNotes()[0]);
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.queryByTestId('relative-menu')).toBeNull();
  });
});
