/** M1b (Scala-tools arc): the Modes pop-out, scenarios rows 22 and 23: the same grid in a large window, every interaction the same. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { TIPS } from './texts';

vi.setConfig({ testTimeout: 15_000 });

const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const openModes = () => fireEvent.click(within(rail()).getByRole('tab', { name: /^Modes/ }));
const popOut = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Open Modes in a large window' }));

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  vi.useRealTimers();
});

describe('Modes pop-out (rows 22 and 23)', () => {
  it('opens a dialog with the same grid, legend and signs; a row click inside it selects the mode; Escape closes it', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    openModes();
    const panelRows = screen.getAllByTestId('mode-row');
    popOut();
    const win = within(screen.getByRole('dialog'));
    const rows = win.getAllByTestId('mode-row');
    expect(rows).toHaveLength(panelRows.length);
    expect(win.getAllByTestId('mode-tile')).toHaveLength(panelRows.length * panelRows.length);
    expect(win.getByLabelText('Heat grid legend')).toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('[class*="modesBig"]')).not.toBeNull();
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(rows[2]);
    expect(win.getAllByTestId('mode-row')[2]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    // the choice survives closing
    expect(screen.getAllByTestId('mode-row')[2]).toHaveAttribute('aria-pressed', 'true');
  });

  it('the button has a tooltip entry in the help form', () => {
    expect(TIPS.modesPopOut.term).toBe('Open Modes in a large window');
    expect(TIPS.modesPopOut.text).toContain('the same Modes grid full size');
  });
});
