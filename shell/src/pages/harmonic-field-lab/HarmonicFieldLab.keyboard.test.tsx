/** M8b page test: the Keyboard mode switch and Linked melody toggle, the dock indicators and labels, and the stored mode. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { KEY_SETTINGS } from './state/persist';

vi.setConfig({ testTimeout: 15_000 });

const made: FakeCtx[] = [];
class TestCtx extends FakeCtx {
  constructor() {
    super();
    made.push(this);
  }
}
const running = () => made.flatMap((c) => c.oscs).filter((o) => o.stopAt === null);
const key = (type: 'keydown' | 'keyup', k: string, code: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: k, code, bubbles: true }));
  });
const stored = () =>
  JSON.parse(window.localStorage.getItem(KEY_SETTINGS) ?? 'null') as {
    keyboardMode?: string;
    linkedMelody?: boolean;
  } | null;
const dock = () => screen.getByRole('region', { name: 'Keyboard' });

beforeEach(() => {
  window.localStorage.clear();
  made.length = 0;
  (window as unknown as { AudioContext: unknown }).AudioContext = TestCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('keyboard modes on the page', () => {
  it('opens in Notes with Oct 0 and no stored setting; the switch, the dock indicators and the key labels follow', () => {
    render(<HarmonicFieldLabPage />);
    expect(stored()).toBeNull(); // nothing is written on mount
    const mode = screen.getByRole('radiogroup', { name: 'Keyboard mode' });
    expect(within(mode).getByRole('radio', { name: 'Notes' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Linked melody' })).not.toBeChecked();
    expect(screen.getByTestId('kb-mode')).toHaveTextContent('Notes');
    expect(screen.getByTestId('oct-shift')).toHaveTextContent('Oct 0');
    expect(within(dock()).queryByTestId('shelf-page')).toBeNull();
    // the dock keys are labeled with the melody keys z x c ...
    const first = within(dock()).getAllByRole('button')[1];
    expect(first).toHaveTextContent('z');

    // the shift is shown, and the labels (a tag and the cents) follow it
    const cents = first.getAttribute('aria-label');
    key('keydown', '.', 'Period');
    key('keyup', '.', 'Period');
    expect(screen.getByTestId('oct-shift')).toHaveTextContent('Oct +1');
    expect(within(dock()).getAllByTestId('key-shift')[0]).toHaveTextContent('+1');
    expect(first.getAttribute('aria-label')).not.toBe(cents);
    expect(first.getAttribute('aria-label')).toMatch(/1200\.0 cents$/);
    key('keydown', ',', 'Comma');
    key('keyup', ',', 'Comma');
    key('keydown', ',', 'Comma');
    key('keyup', ',', 'Comma');
    expect(screen.getByTestId('oct-shift')).toHaveTextContent('Oct -1');

    // Chords: the dock names the mode and the shelf page, the melody keys hide their hints and stay silent
    fireEvent.click(within(mode).getByRole('radio', { name: 'Chords' }));
    expect(screen.getByTestId('kb-mode')).toHaveTextContent('Chords');
    expect(screen.getByTestId('shelf-page')).toHaveTextContent('Shelf 0-0 of 0');
    key('keydown', 'z', 'KeyZ');
    expect(running()).toHaveLength(0);
    key('keyup', 'z', 'KeyZ');
    // the choice is stored (and only now)
    expect(stored()?.keyboardMode).toBe('chords');

    // Split and the Linked melody option are stored too
    fireEvent.click(within(mode).getByRole('radio', { name: 'Split' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Linked melody' }));
    expect(stored()).toMatchObject({ keyboardMode: 'split', linkedMelody: true });
  });

  it('a stored mode is restored; a bad stored mode falls back to Notes', () => {
    window.localStorage.setItem(
      KEY_SETTINGS,
      JSON.stringify({ keyboardMode: 'split', linkedMelody: true })
    );
    const first = render(<HarmonicFieldLabPage />);
    expect(screen.getByTestId('kb-mode')).toHaveTextContent('Split');
    expect(screen.getByRole('checkbox', { name: 'Linked melody' })).toBeChecked();
    first.unmount();
    window.localStorage.setItem(KEY_SETTINGS, JSON.stringify({ keyboardMode: 'nope' }));
    render(<HarmonicFieldLabPage />);
    expect(screen.getByTestId('kb-mode')).toHaveTextContent('Notes');
  });
});
