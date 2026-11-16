/** M8h: the three chord kinds (ratio, CPS, positional) render one card structure; positional always shows `#rank · score`. */
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { pickPreset } from './testUtils';

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('M8h chord cards', () => {
  it('ratio, CPS and positional cards share title, pitches, steps and right stat', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('Hexany (1 3 5 7, choose 2)');
    const cps = within(screen.getByRole('region', { name: 'Chords inside this CPS' }));
    const positional = within(
      screen.getByRole('list', { name: 'Positional chords 2-2' })
    ).getAllByTestId('positional-row');
    const ratioFamilies = screen.getByRole('region', { name: 'Ratio chord families' });
    const cards = [
      cps.getAllByRole('button', { name: /chord / })[0],
      positional[0].querySelector('button') as HTMLElement,
      ...within(ratioFamilies).getAllByRole('button', { name: / on / }).slice(0, 1),
    ];
    for (const card of cards) {
      for (const id of ['card-title', 'card-subtitle', 'card-pitches', 'card-steps', 'card-stat']) {
        expect(within(card).getByTestId(id)).toBeTruthy();
      }
      expect(within(card).getByTestId('card-title').textContent).not.toBe('');
      expect(within(card).getByTestId('card-pitches').textContent).toMatch(/\d/);
      expect(within(card).getByTestId('card-steps').textContent).toMatch(
        /^steps (\d+\.\d, )*\d+\.\d c$/
      );
      expect(within(card).getByTestId('card-stat').textContent).not.toBe('');
    }
    expect(within(cards[0]).getByTestId('card-stat').textContent).toMatch(/^\d notes$/);
    // values: the first otonal card, a utonal card, a ratio card, a positional card
    const text = (card: HTMLElement, id: string) => within(card).getByTestId(id).textContent ?? '';
    const oto = within(screen.getByRole('group', { name: 'CPS otonal chords' })).getAllByRole(
      'button',
      { name: /chord / }
    )[0];
    expect(text(oto, 'card-title')).toMatch(/^\d+:\d+:\d+ otonal$/);
    expect(text(oto, 'card-subtitle')).toMatch(/^shares \d+(·\d+)*$/);
    // the steps follow from the pitches: ratios in order, steps = their gaps in cents (1 decimal)
    const ratios = text(oto, 'card-pitches')
      .split(/\s+/)
      .map((r) => {
        const [n, d] = r.split('/').map(Number);
        return n / (d || 1);
      });
    const cents = ratios.map((r) => 1200 * Math.log2(r / ratios[0]));
    const gaps = cents.slice(1).map((c, i) => (c - cents[i]).toFixed(1));
    expect(text(oto, 'card-steps')).toBe(`steps ${gaps.join(', ')} c`);
    const uto = within(screen.getByRole('group', { name: 'CPS utonal chords' })).getAllByRole(
      'button',
      { name: /chord / }
    )[0];
    expect(text(uto, 'card-title')).toMatch(/^1\/\(\d+:\d+:\d+\) utonal$/);
    expect(text(cards[2], 'card-subtitle')).toMatch(/^\d+(:\d+)+ on \S+/);
    expect(text(cards[2], 'card-title')).not.toMatch(/^\d+(:\d+)+$/);
    expect(text(cards[1], 'card-steps')).toMatch(/^steps \d+\.\d, \d+\.\d c$/);
    expect(text(cards[1], 'card-stat')).toMatch(/^#\d+ · \d+\.\d\d$/);
    for (const order of ['Scale order', 'Smoothest']) {
      fireEvent.click(screen.getByRole('radio', { name: order }));
      for (const row of screen.getAllByTestId('positional-row')) {
        expect(within(row).getByTestId('positional-score').textContent).toMatch(
          /^#\d+ · \d+\.\d\d$/
        );
      }
    }
  });
});
