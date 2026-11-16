/** M2 page tests: prime factorization in the note card and in the Field table columns (compact table and window). */
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset } from './testUtils';

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

const compact = () => screen.getByRole('table', { name: 'Field notes' });
const card = () =>
  screen.getByRole('img', { name: /^monzo:/ }).closest('div')?.parentElement as HTMLElement;

describe('M2 prime factorization', () => {
  it('row 1: pointing at 15/8 shows its vector, top / bottom and Tenney in the card', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.mouseEnter(within(compact()).getByRole('row', { name: /^15\/8/ }));
    const c = within(card());
    expect(
      c.getByRole('img', { name: 'monzo: exponents of 2, 3 and 5, minus 3, 1 and 1' })
    ).toHaveTextContent('[-3 1 1⟩');
    expect(c.getByRole('img', { name: '3 times 5, over 2 to the 3' })).toHaveTextContent(
      '3·5 / 2³'
    );
    expect(c.getByText('6.91')).toBeInTheDocument();
  });

  it('row 5: the 700 c note of 12-EDO keeps the word irrational and shows dashes for the new rows', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    const rows = within(compact()).getAllByRole('row');
    fireEvent.mouseEnter(rows[8]);
    const c = within(card());
    expect(c.getByText('irrational')).toBeInTheDocument();
    const text = card().textContent ?? '';
    expect(text).toMatch(/top \/ bottom—/);
    expect(text).toMatch(/Tenney—/);
  });

  it('row 8: the table columns for 9/8 and 15/8, in the compact table and in the window', () => {
    render(<HarmonicFieldLabPage />);
    const check = (scope: HTMLElement) => {
      const s = within(scope);
      const r98 = within(s.getByRole('row', { name: /^9\/8/ }));
      expect(r98.getByRole('cell', { name: '3 to the 2, over 2 to the 3' })).toHaveTextContent(
        '3² / 2³'
      );
      expect(
        r98.getByRole('cell', { name: 'monzo: exponents of 2 and 3, minus 3 and 2' })
      ).toHaveTextContent('[-3 2⟩');
      expect(r98.getByText('6.17')).toBeInTheDocument();
      const r158 = within(s.getByRole('row', { name: /^15\/8/ }));
      expect(r158.getByRole('cell', { name: '3 times 5, over 2 to the 3' })).toHaveTextContent(
        '3·5 / 2³'
      );
      expect(r158.getByText('6.91')).toBeInTheDocument();
    };
    check(compact());
    fireEvent.click(screen.getByRole('button', { name: /Open full table/ }));
    check(within(screen.getByRole('dialog')).getByRole('table'));
  });
});
