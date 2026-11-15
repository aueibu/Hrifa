/** Fill cards on the page: open the modal, defaults, preview, uncheck a row, Apply, the 24-card cap message. */
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { defaultGen } from './state/generate';
import { makeTab } from './state/labState';
import { saveRetuner } from './state/persist';
import { defaultRetSettings, type RetCard } from './state/retuner';
import { cardFromTab } from './state/retunerCards';

vi.setConfig({ testTimeout: 15_000 });

const jiCard = (name: string, notes: string[]): RetCard => ({
  ...(cardFromTab(
    makeTab('t1', { ...defaultGen(), method: 'custom', custom: notes.join('\n'), rep: '2/1' })
  ) as RetCard),
  name,
});
const MAJOR = ['9/8', '5/4', '4/3', '3/2', '5/3', '15/8'];
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const openRetuner = () => fireEvent.click(within(rail()).getByRole('tab', { name: /^Retuner/ }));
const rows = () =>
  within(screen.getByRole('list', { name: 'Candidate cards' })).getAllByRole('listitem');

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('Fill cards (page)', () => {
  it('opens with Modes + Keys checked and Subsets off, previews, unchecks a row, applies, and closes', () => {
    saveRetuner([jiCard('Home', MAJOR)], defaultRetSettings());
    render(<HarmonicFieldLabPage />);
    openRetuner();
    fireEvent.click(screen.getByRole('button', { name: 'Fill cards...' }));
    const dlg = screen.getByRole('dialog');
    expect(
      within(dlg).getByRole('checkbox', { name: 'Modes of the current subset' })
    ).toBeChecked();
    expect(within(dlg).getByRole('checkbox', { name: 'Keys that fit the field' })).toBeChecked();
    const subsets = within(dlg).getByRole('checkbox', { name: "This generator's subsets" });
    expect(subsets).not.toBeChecked();
    const n = rows().length;
    expect(n).toBeGreaterThan(0);
    expect(within(dlg).getAllByText(/^(retuned|different) notes$/)).toHaveLength(n);
    expect(within(dlg).getByRole('status')).toHaveTextContent(
      `${n} card${n === 1 ? '' : 's'} will be added.`
    );
    // uncheck the first row
    const first = within(rows()[0]).getByRole('checkbox');
    fireEvent.click(first);
    expect(within(dlg).getByRole('status')).toHaveTextContent(`${n - 1} card`);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // the existing card stays first; the new ones follow
    expect(screen.getByRole('textbox', { name: 'Name of card 0' })).toHaveValue('Home');
    expect(screen.getByRole('textbox', { name: `Name of card ${n - 1}` })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: `Name of card ${n}` })).toBeNull();
  });

  it('adds what fits under the 24-card cap and says how many would not', () => {
    const cards = Array.from({ length: 23 }, (_, i) =>
      jiCard(`C${i}`, MAJOR.slice(0, 2 + (i % 4)))
    );
    saveRetuner(cards, defaultRetSettings());
    render(<HarmonicFieldLabPage />);
    openRetuner();
    fireEvent.click(screen.getByRole('button', { name: 'Fill cards...' }));
    const dlg = screen.getByRole('dialog');
    const total = rows().length;
    expect(total).toBeGreaterThan(1);
    expect(within(dlg).getByRole('status')).toHaveTextContent(
      `1 card will be added; ${total - 1} would exceed the 24-card limit.`
    );
    fireEvent.click(within(dlg).getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('textbox', { name: 'Name of card 23' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name of card 24' })).toBeNull();
  });
});
