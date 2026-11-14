/** The live Retuner panel on the page: stored cards, the keys, why this card won, drift, and the card list controls. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { KEYS } from './audio/keymap';
import { defaultGen } from './state/generate';
import { makeTab } from './state/labState';
import { KEY_RETUNER, saveRetuner } from './state/persist';
import { defaultRetSettings, type RetCard } from './state/retuner';
import { cardFromTab } from './state/retunerCards';

// whole-page renders are slow in jsdom; under a full parallel run some take over the 5 s default
vi.setConfig({ testTimeout: 15_000 });

const jiCard = (name: string, notes: string[]): RetCard => ({
  ...(cardFromTab(
    makeTab('t1', { ...defaultGen(), method: 'custom', custom: notes.join('\n'), rep: '2/1' })
  ) as RetCard),
  name,
});
const A = ['9/8', '5/4', '4/3', '3/2', '5/3', '15/8'];
const B = ['10/9', '5/4', '4/3', '3/2', '5/3', '15/8'];
const slot = (deg: number, oct = 0) => deg + 7 * oct;
const PROGRESSION = [
  [slot(0), slot(2), slot(4)],
  [slot(5), slot(0, 1), slot(2, 1)],
  [slot(5), slot(1), slot(3)],
  [slot(1, 1), slot(4), slot(6)],
  [slot(4), slot(0), slot(2)],
];
const key = (type: 'keydown' | 'keyup', s: number) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: KEYS[s], bubbles: true }));
  });
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('Retuner panel (live)', () => {
  it('plays the progression from stored cards, explains the choice and manages the card list', () => {
    saveRetuner(
      [jiCard('Ptolemy major', A), jiCard('Pythagorean-ish', A), jiCard('10/9 second', B)],
      defaultRetSettings()
    );
    render(<HarmonicFieldLabPage />);
    const tab = within(rail()).getByRole('tab', { name: /^Retuner/ });
    expect(tab).toHaveTextContent('3 cards'); // the count is live, not a mock figure
    fireEvent.click(tab);
    expect(screen.getByRole('textbox', { name: 'Name of card 0' })).toHaveValue('Ptolemy major');
    expect(screen.getByTestId('drift-cents')).toHaveTextContent('0.00 c');

    // switch it on, then play the progression as keys
    const ringBefore = screen
      .getByRole('group', { name: /^Pitch circle/ })
      .getAttribute('aria-label');
    fireEvent.click(screen.getByRole('switch', { name: 'Retuner on' }));
    for (const chord of PROGRESSION) {
      chord.forEach((s) => key('keydown', s));
      chord.forEach((s) => key('keyup', s));
    }
    // I - vi - ii - V - I over the three cards collects the syntonic comma
    expect(screen.getByTestId('drift-cents')).toHaveTextContent('-21.51 c');
    expect(screen.getByTestId('drift-ratio')).toHaveTextContent('80/81');
    // the main views stay on the tab
    expect(screen.getByRole('group', { name: /^Pitch circle/ }).getAttribute('aria-label')).toBe(
      ringBefore
    );

    // why this card won: one row per card, the winner marked, sortable
    const why = screen
      .getAllByRole('table')
      .find((t) => within(t).queryByRole('button', { name: 'Sort by Score' }))!;
    expect(within(why).getAllByRole('row')).toHaveLength(4);
    expect(within(why).getAllByText('chosen')).toHaveLength(1);
    fireEvent.click(within(why).getByRole('button', { name: 'Sort by Score' }));
    expect(within(why).getByRole('columnheader', { name: /Score/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    fireEvent.click(within(why).getByRole('button', { name: 'Sort by Score' }));
    expect(within(why).getByRole('columnheader', { name: /Score/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    );

    // Reset roots: drift back to 0
    fireEvent.click(screen.getByRole('button', { name: 'Reset roots' }));
    expect(screen.getByTestId('drift-cents')).toHaveTextContent('0.00 c');

    // card list: add the current tab, rename it, make it home, delete it
    fireEvent.click(screen.getByRole('button', { name: 'Add current tab as card' }));
    expect(tab).toHaveTextContent('4 cards');
    const name = screen.getByRole('textbox', { name: 'Name of card 3' });
    fireEvent.change(name, { target: { value: 'Harmonics tab' } });
    fireEvent.blur(name);
    fireEvent.click(screen.getByRole('button', { name: 'Make Harmonics tab home' }));
    expect(screen.getByRole('textbox', { name: 'Name of card 0' })).toHaveValue('Harmonics tab');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Harmonics tab' }));
    expect(tab).toHaveTextContent('3 cards');

    // stored: the cards and settings, not the run
    const stored = JSON.parse(window.localStorage.getItem(KEY_RETUNER)!);
    expect(stored.cards.map((c: { name: string }) => c.name)).toEqual([
      'Ptolemy major',
      'Pythagorean-ish',
      '10/9 second',
    ]);
  });
});
