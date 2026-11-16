/** M8i page test: same-shape chord cards merge into one card with a root count; the chevron, the hold, the switch and what persists. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { KEY_SETTINGS } from './state/persist';
import { pickPreset } from './testUtils';

const SHELF_KEY = 'hrifa.harmonic-field-lab.chordshelf.v1';
const COMPOSITES_KEY = 'hrifa.harmonic-field-lab.composites.v1';
type StoredChord = { template: string; rootDeg?: number | null; pitches: { c: number }[] };
const shelfChords = () =>
  (
    JSON.parse(window.localStorage.getItem(SHELF_KEY) ?? '{"chords":[]}') as {
      chords: StoredChord[];
    }
  ).chords;
const round = (xs: { c: number }[]) => xs.map((p) => Math.round(p.c));

vi.setConfig({ testTimeout: 30_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const C4 = 261.6256;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const GROUPED = /^major triad 4:5:6, the same shape on 12 roots/;
const PER_ROOT = /^major triad 4:5:6 on /;
const stored = () => {
  const raw = window.localStorage.getItem(KEY_SETTINGS);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
};
const toggle = () => screen.getByRole<HTMLInputElement>('switch', { name: 'Group shapes' });

beforeEach(() => {
  window.localStorage.clear();
  contexts = [];
  class TestCtx extends FakeCtx {
    constructor() {
      super();
      contexts.push(this);
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = TestCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  vi.useRealTimers();
});

describe('M8i grouped chord cards (12-EDO, all 12 notes)', () => {
  it('ON by default: x12 card, chevron shows 12 roots, the hold plays at the stepper root, settings persist', async () => {
    const view = render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    // nothing is written on mount; the switch is on
    expect(stored()?.groupShapes).toBeUndefined();
    expect(toggle().checked).toBe(true);
    // one grouped card, no per-root card, the shape (cents above the root) and the root count
    const card = screen.getByRole('button', { name: GROUPED });
    expect(screen.queryAllByRole('button', { name: PER_ROOT })).toHaveLength(0);
    expect(within(card).getByTestId('card-subtitle').textContent).toBe('4:5:6');
    expect(within(card).getByTestId('card-pitches').textContent).toBe('0.0, 400.0, 700.0 c');
    expect(within(card).getByTestId('card-steps').textContent).toBe('steps 400.0, 300.0 c');
    // header counts: n (m): the chords and the unique shapes they make once grouped; the sentence is the title
    const head = (id: string) => document.querySelector(`[data-fold="${id}"]`) as HTMLElement;
    expect(head('families').textContent).toMatch(/Ratio chords\d+ \(\d+\)$/);
    expect(within(head('families')).getByRole('note').getAttribute('aria-label')).toMatch(
      /^\d+ total chords here \(\d+ unique chords once shapes are grouped\)$/
    );
    // the tree guide of the Triads block folds it like the header button (same id, so it is remembered)
    const triads = screen.getByRole('region', { name: 'Triads' });
    const triadBtn = () => within(head('size:Triads')).getByRole('button');
    expect(triadBtn().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(within(triads).getAllByTestId('nest-guide')[0]);
    expect(triadBtn().getAttribute('aria-expanded')).toBe('false');
    expect((stored()?.folds as Record<string, boolean>)['size:Triads']).toBe(true);
    fireEvent.click(within(triads).getAllByTestId('nest-guide')[0]);
    expect(triadBtn().getAttribute('aria-expanded')).toBe('true');
    // expand: the 12 per-root cards appear (nested), each a normal card
    const chevron = screen.getByRole('button', { name: /the 12 roots of major triad$/ });
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(chevron);
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('button', { name: PER_ROOT })).toHaveLength(12);
    expect(
      Object.keys((stored()?.folds as object) ?? {}).filter((k) => k.startsWith('grp:'))
    ).toHaveLength(1);
    // the hold on the grouped card plays at the stepper root (move it to degree 2 with the melody key x)
    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: 'x', code: 'KeyX' });
    fireEvent.mouseEnter(screen.getByRole('button', { name: GROUPED }));
    const from = oscs().length;
    fireEvent.keyDown(window, { key: '4' });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const h = oscs()
      .slice(from)
      .map(hz)
      .sort((a, b) => a - b);
    expect([Math.round(cents(h[0], C4)), ...h.map((x) => Math.round(cents(x, h[0])))]).toEqual([
      100, 0, 400, 700,
    ]);
    fireEvent.keyUp(window, { key: '4' });
    fireEvent.keyUp(window, { key: 'x', code: 'KeyX' });
    vi.useRealTimers();
    // reload: the expansion is remembered
    view.unmount();
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    expect(
      screen
        .getByRole('button', { name: /the 12 roots of major triad$/ })
        .getAttribute('aria-expanded')
    ).toBe('true');
    expect(screen.getAllByRole('button', { name: PER_ROOT })).toHaveLength(12);
    // Collapse all closes everything, the roots too; Expand all opens everything, the roots of every group included
    const grp = () =>
      Object.keys((stored()?.folds as object) ?? {}).filter((k) => k.startsWith('grp:'));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all sections' }));
    expect(grp()).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: PER_ROOT })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Expand all sections' }));
    expect(screen.getByRole('button', { name: GROUPED })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: PER_ROOT })).toHaveLength(12);
    // the ratio groups and the positional groups (one per pattern here) are all expanded
    expect(grp().length).toBeGreaterThan(1);
    expect(
      screen
        .getAllByRole('button', { name: /^(Hide|Show) the \d+ roots of / })
        .every((b) => b.getAttribute('aria-expanded') === 'true')
    ).toBe(true);
  });

  it('OFF: every per-root card as before; remembered across a reload', async () => {
    const view = render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.click(toggle());
    expect(stored()?.groupShapes).toBe(false);
    expect(screen.queryByRole('button', { name: GROUPED })).toBeNull();
    expect(screen.getAllByRole('button', { name: PER_ROOT })).toHaveLength(12);
    view.unmount();
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    expect(toggle().checked).toBe(false);
    // switch off: the bare count
    expect(document.querySelector('[data-fold="families"]')?.textContent).toMatch(
      /Ratio chords\d+$/
    );
    expect(screen.getAllByRole('button', { name: PER_ROOT })).toHaveLength(12);
    expect(screen.queryByRole('button', { name: GROUPED })).toBeNull();
  });

  it('a grouped card acts for the stepper root: + stashes it, - sends it, click arms and picks, shift-click makes it the subset; a positional group follows the stepper too', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    // the melody key c is slot 2: the Sketch stepper moves to degree 3 (200 c)
    fireEvent.keyDown(window, { key: 'c', code: 'KeyC' });
    fireEvent.keyUp(window, { key: 'c', code: 'KeyC' });
    const card = screen.getByRole('button', { name: GROUPED });
    // + stashes the stepper-root version
    fireEvent.click(
      screen.getAllByRole('button', { name: /^Stash 4:5:6 on 200\.0 c on the shelf/ })[0]
    );
    expect(shelfChords()).toHaveLength(1);
    expect(shelfChords()[0].template).toBe('4:5:6');
    expect(round(shelfChords()[0].pitches)).toEqual([200, 600, 900]);
    expect(shelfChords()[0].rootDeg).toBe(2);
    // - sends the same pitches to a new composite
    fireEvent.mouseEnter(card);
    fireEvent.keyDown(window, { key: '-' });
    fireEvent.keyDown(window, { key: '0' });
    fireEvent.mouseLeave(card);
    const sent = (
      JSON.parse(window.localStorage.getItem(COMPOSITES_KEY) ?? '{"composites":[]}') as {
        composites: { items: { pitches: { c: number }[] }[] }[];
      }
    ).composites;
    expect(round(sent[0].items[0].pitches)).toEqual([200, 600, 900]);
    // click: picked, and the Sketch row is armed with the template
    expect(card.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(card);
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(card.getAttribute('data-picked')).toBe('true');
    const sketch = screen.getByRole('group', { name: 'Sketch a chord' });
    expect(
      within(sketch).getByRole<HTMLSelectElement>('combobox', { name: 'Sketch template' }).value
    ).toBe('4:5:6');
    fireEvent.click(card); // un-pick
    // shift-click: the chord's three notes become the subset
    fireEvent.click(card, { shiftKey: true });
    const ring = screen.getByRole('group', { name: /^Pitch circle/ });
    expect(
      /(\d+) of (\d+) notes selected/.exec(ring.getAttribute('aria-label')!)!.slice(1)
    ).toEqual(['3', '12']);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    // positional group: its card stashes the row of the stepper root, and follows when the stepper moves
    const posStash = () =>
      screen.getAllByRole('button', { name: /^Stash 2-2 on \d+ on the shelf/ })[0];
    expect(posStash().getAttribute('aria-label')).toBe('Stash 2-2 on 3 on the shelf');
    fireEvent.click(posStash());
    expect(round(shelfChords()[1].pitches)[0]).toBe(200);
    fireEvent.keyDown(window, { key: 'x', code: 'KeyX' });
    fireEvent.keyUp(window, { key: 'x', code: 'KeyX' });
    expect(posStash().getAttribute('aria-label')).toBe('Stash 2-2 on 2 on the shelf');
    fireEvent.click(posStash());
    expect(round(shelfChords()[2].pitches)[0]).toBe(100);
    expect(shelfChords()[2].rootDeg).toBe(1);
  });
});
