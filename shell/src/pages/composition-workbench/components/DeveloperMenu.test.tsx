import { render, screen, userEvent } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEVELOPER_OPTIONS_KEY, readDeveloperOptions } from '../developerOptions';
import { historyChangeCount, resetHistory } from '../history';
import { DeveloperMenu } from './DeveloperMenu';

beforeEach(() => {
  localStorage.clear();
  resetHistory();
});

describe('DeveloperMenu', () => {
  it('renders the switch on by default and toggles it, persisting outside history', async () => {
    const user = userEvent.setup();
    render(<DeveloperMenu />);
    await user.click(screen.getByRole('button', { name: 'Developer' }));
    const toggle = await screen.findByRole('switch', { name: /Open transport and sounds too/ });
    expect(toggle).toBeChecked();
    expect(screen.getByText('Off keeps your current tempo, metronome, and voices.')).toBeVisible();

    const before = historyChangeCount();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(readDeveloperOptions().openIncludesSettings).toBe(false);
    expect(JSON.parse(localStorage.getItem(DEVELOPER_OPTIONS_KEY)!)).toEqual({
      openIncludesSettings: false,
      chordAnchorLabel: 'on-note',
      chordPreviewGate: 'click',
    });
    expect(historyChangeCount()).toBe(before);
  });

  it('switches the chord anchor label between on the note and beside it', async () => {
    const user = userEvent.setup();
    render(<DeveloperMenu />);
    await user.click(screen.getByRole('button', { name: 'Developer' }));
    expect(readDeveloperOptions().chordAnchorLabel).toBe('on-note');
    await user.click(await screen.findByLabelText('Beside it'));
    expect(readDeveloperOptions().chordAnchorLabel).toBe('side');
    await user.click(screen.getByLabelText('On the note'));
    expect(readDeveloperOptions().chordAnchorLabel).toBe('on-note');
  });

  it('switches the chord preview gate between click and Ctrl+click', async () => {
    const user = userEvent.setup();
    render(<DeveloperMenu />);
    await user.click(screen.getByRole('button', { name: 'Developer' }));
    expect(readDeveloperOptions().chordPreviewGate).toBe('click');
    await user.click(await screen.findByLabelText('Ctrl+click'));
    expect(readDeveloperOptions().chordPreviewGate).toBe('ctrl-click');
    await user.click(screen.getByLabelText('On click'));
    expect(readDeveloperOptions().chordPreviewGate).toBe('click');
  });
});
