/** M6: lattice axes picker, subset polygon, chord template editor, glossary search, .scl import, pin colour. */
import { act, fireEvent, render, screen, waitFor, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { KEY_CHORDFINDER } from './state/persist';

const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const dot = (name: RegExp) => within(ring()).getByRole('button', { name });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 170));
  });
const stored = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown;
const polygonPoints = () =>
  (screen.getByTestId('subset-polygon').getAttribute('points') ?? '').split(' ').filter(Boolean)
    .length;

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('lattice axes picker', () => {
  const axes = () => screen.getByRole('combobox', { name: 'Lattice axes (primes)' });
  const openLattice = () => fireEvent.click(within(rail()).getByRole('tab', { name: /Lattice/ }));

  it('starts on Auto, lists the choices with how many selected notes sit on the grid', () => {
    render(<HarmonicFieldLabPage />);
    openLattice();
    expect(axes()).toHaveValue('auto');
    const options = within(axes())
      .getAllByRole('option')
      .map((o) => o.textContent);
    // Harmonics 8-15 use 3 5 7 11 13; all 8 selected notes: 3 5 7 leaves 11/8 and 13/8 on stems
    expect(options[0]).toMatch(/^Auto: .* \(\d+\/8 on grid\)$/);
    expect(options[1]).toMatch(/ — \d\/8 on grid$/);
    expect(options).toHaveLength(1 + 10);
    // the list is sorted by fit, best first
    const fits = options.slice(1).map((o) => Number(/(\d)\/8 on grid/.exec(o ?? '')?.[1]));
    expect([...fits].sort((a, b) => b - a)).toEqual(fits);
  });

  it('Auto follows the subset; picking a triple keeps it until Auto is chosen again', () => {
    render(<HarmonicFieldLabPage />);
    openLattice();
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    for (const r of [/^1\/1/, /^11\/8/, /^13\/8/, /^3\/2/]) {
      fireEvent.click(dot(r));
    }
    // 1/1, 11/8, 13/8, 3/2: 3 11 13 holds all four
    expect(within(rail()).getByRole('tab', { name: /Lattice/ })).toHaveTextContent('2D 3·11·13');
    expect(within(axes()).getAllByRole('option')[0]).toHaveTextContent('Auto: 3·11·13 (4/4');
    // pick another triple: it stays when the subset changes
    type(axes(), '3,5,7');
    expect(axes()).toHaveValue('3,5,7');
    fireEvent.click(dot(/^5\/4/));
    expect(axes()).toHaveValue('3,5,7');
    expect(within(rail()).getByRole('tab', { name: /Lattice/ })).toHaveTextContent('2D 3·5·7');
    // Auto again: back to the best fit of the new subset
    type(axes(), 'auto');
    expect(axes()).toHaveValue('auto');
    // 1/1 11/8 13/8 3/2 5/4: 3 5 11 and 3 11 13 both hold 4 of 5 at the same distance; the default order picks 3 5 11
    expect(within(rail()).getByRole('tab', { name: /Lattice/ })).toHaveTextContent('2D 3·5·11');
  });

  it('stores null for Auto and the triple for a pick (per visualizer)', async () => {
    render(<HarmonicFieldLabPage />);
    openLattice();
    type(axes(), '3,5,11');
    await waitFor(() =>
      expect(
        (stored('hrifa.harmonic-field-lab.settings.v1') as { viz: { viz1: { axes3: unknown } } })
          .viz.viz1.axes3
      ).toEqual([3, 5, 11])
    );
    type(axes(), 'auto');
    await waitFor(() =>
      expect(
        (stored('hrifa.harmonic-field-lab.settings.v1') as { viz: { viz1: { axes3: unknown } } })
          .viz.viz1.axes3
      ).toBeNull()
    );
  });

  it('the prime-power chip names the hidden prime and carries a tooltip target', () => {
    render(<HarmonicFieldLabPage />);
    openLattice();
    type(axes(), '3,5,7');
    const row = screen.getByText('Off-axis').closest('div')!;
    expect(row).toHaveTextContent('11⁺¹');
    expect(row.querySelector('[data-tipk="primePower"]')).not.toBeNull();
  });
});

describe('subset polygon on the ring', () => {
  it('joins the selected notes, follows clicks, and exists in the Fifths view', () => {
    render(<HarmonicFieldLabPage />);
    expect(polygonPoints()).toBe(8);
    fireEvent.click(dot(/^5\/4/));
    expect(polygonPoints()).toBe(7);
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(polygonPoints()).toBe(0);
    fireEvent.click(dot(/^1\/1/));
    fireEvent.click(dot(/^3\/2/));
    fireEvent.click(dot(/^5\/4/));
    expect(polygonPoints()).toBe(3);
    fireEvent.click(screen.getByRole('radio', { name: 'Fifths' }));
    expect(polygonPoints()).toBe(3);
  });

  it('is drawn under the chord polygon', () => {
    render(<HarmonicFieldLabPage />);
    const polys = [...ring().querySelectorAll('polygon')];
    expect(polys).toHaveLength(2);
    expect(polys[0]).toHaveAttribute('data-testid', 'subset-polygon');
  });
});

describe('pin colour', () => {
  it('a pinned note gets a pin ring (not the selection outline) on the ring and the 2D lattice', () => {
    render(<HarmonicFieldLabPage />);
    expect(ring().querySelector('circle[class*="pinRing"]')).toBeNull();
    fireEvent.click(dot(/^5\/4/), { altKey: true });
    expect(ring().querySelectorAll('circle[class*="pinRing"]')).toHaveLength(1);
    fireEvent.click(within(rail()).getByRole('tab', { name: /Lattice/ }));
    const lattice = screen.getByRole('group', { name: /^Lattice of the field/ });
    expect(lattice.querySelectorAll('circle[class*="pinRing"]')).toHaveLength(1);
    // Alt+click in the lattice pins another note without toggling it
    const ringBefore = ring().getAttribute('aria-label');
    fireEvent.click(within(lattice).getByRole('button', { name: /^3\/2/ }), { altKey: true });
    expect(ring().getAttribute('aria-label')).toBe(ringBefore);
    expect(lattice.querySelectorAll('circle[class*="pinRing"]')).toHaveLength(1);
    // a plain click toggles and does not move the pin
    fireEvent.click(within(lattice).getByRole('button', { name: /^7\/4/ }));
    expect(ring().getAttribute('aria-label')).not.toBe(ringBefore);
    expect(within(ring()).getByRole('button', { name: /^3\/2/ })).toHaveAccessibleName(/pinned/);
  });

  it('the iso keyboard hex pins on Alt+click and toggles on a plain click', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /EDO fit/ }));
    fireEvent.click(screen.getByRole('button', { name: /^View: Visualizer 2 – EDO fit/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Isomorphic keyboard' }));
    const keyboard = screen.getByRole('group', { name: /Isomorphic keyboard: hexagons/ });
    const hex = () => within(keyboard).getAllByRole('button', { name: /^3\/2/ })[0];
    const before = ring().getAttribute('aria-label');
    fireEvent.click(hex(), { altKey: true });
    expect(hex()).toHaveAttribute('data-pin', 'true');
    expect(ring().getAttribute('aria-label')).toBe(before);
    fireEvent.click(hex());
    expect(ring().getAttribute('aria-label')).not.toBe(before);
    expect(hex()).toHaveAttribute('data-pin', 'true');
  });
});

describe('chord templates editor', () => {
  const openEditor = async () => {
    fireEvent.click(within(rail()).getByRole('tab', { name: /Chords/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit templates' }));
    return screen.findByRole('dialog');
  };

  it('edits a family, stores it, and the chord rows regroup', async () => {
    render(<HarmonicFieldLabPage />);
    const dialog = await openEditor();
    expect(within(dialog).getAllByRole('textbox', { name: /ratios$/ })).toHaveLength(12);
    type(within(dialog).getByRole('textbox', { name: 'Template 1 family' }), 'Bright');
    await settle();
    expect(
      (stored(KEY_CHORDFINDER) as { templates: { text: string; family?: string }[] }).templates[0]
    ).toMatchObject({ text: '4:5:6', family: 'Bright' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('group', { name: 'Triads, Bright' })).toBeInTheDocument();
  });

  it('adds a template, flags an unreadable one, removes one, resets, and survives a reload', async () => {
    const { unmount } = render(<HarmonicFieldLabPage />);
    const dialog = await openEditor();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add template' }));
    expect(within(dialog).getAllByRole('textbox', { name: /ratios$/ })).toHaveLength(13);
    type(within(dialog).getByRole('textbox', { name: 'Template 13 ratios' }), '8:10:12:14');
    await settle();
    type(within(dialog).getByRole('textbox', { name: 'Template 13 family' }), 'Mine');
    await settle();
    // an unreadable template is flagged and the finder skips it
    type(within(dialog).getByRole('textbox', { name: 'Template 2 ratios' }), 'nonsense');
    await settle();
    expect(within(dialog).getByText(/is not a template/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Remove 3:5:7 triad/ }));
    const saved = stored(KEY_CHORDFINDER) as { templates: { text: string }[] };
    expect(saved.templates.map((t) => t.text)).toContain('8:10:12:14');
    expect(saved.templates.map((t) => t.text)).not.toContain('3:5:7');
    unmount();

    // a reload shows the edited list
    render(<HarmonicFieldLabPage />);
    const again = await openEditor();
    expect(within(again).getAllByRole('textbox', { name: /ratios$/ })).toHaveLength(12);
    expect(within(again).getByDisplayValue('8:10:12:14')).toBeInTheDocument();
    fireEvent.click(within(again).getByRole('button', { name: 'Reset list' }));
    expect(within(again).getAllByRole('textbox', { name: /ratios$/ })).toHaveLength(12);
    expect(within(again).queryByDisplayValue('8:10:12:14')).toBeNull();
    expect(within(again).getByDisplayValue('3:5:7')).toBeInTheDocument();
  });

  it('bad stored data falls back to the defaults', async () => {
    window.localStorage.setItem(KEY_CHORDFINDER, '{"templates":[1,2,"x"]}');
    render(<HarmonicFieldLabPage />);
    const dialog = await openEditor();
    expect(within(dialog).getAllByRole('textbox', { name: /ratios$/ })).toHaveLength(12);
  });
});

describe('glossary', () => {
  const open = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Glossary' }));
    return screen.findByRole('dialog', { name: 'Glossary' });
  };

  it('lists every entry and filters by what you type', async () => {
    render(<HarmonicFieldLabPage />);
    const dialog = await open();
    const total = within(dialog).getAllByRole('term').length;
    expect(total).toBeGreaterThan(100);
    type(within(dialog).getByRole('textbox', { name: 'Search the glossary' }), 'comma');
    const some = within(dialog).getAllByRole('term').length;
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(total);
    type(within(dialog).getByRole('textbox', { name: 'Search the glossary' }), 'zzzzqq');
    expect(within(dialog).queryAllByRole('term')).toHaveLength(0);
    expect(within(dialog).getByText(/No entry matches/)).toBeInTheDocument();
  });

  it('has the new entries (prime-power chip, pin) and see-also links that jump', async () => {
    render(<HarmonicFieldLabPage />);
    const dialog = await open();
    type(within(dialog).getByRole('textbox', { name: 'Search the glossary' }), 'prime-power');
    expect(within(dialog).getByText(/Prime-power chip/)).toBeInTheDocument();
    const see = within(dialog).getAllByRole('button', { name: /Off-axis notes/ })[0];
    fireEvent.click(see);
    await waitFor(() => expect(within(dialog).getAllByRole('term').length).toBeGreaterThan(5));
  });
});

describe('.scl import', () => {
  const file = (text: string) => new File([text], 'x.scl', { type: 'text/plain' });
  const load = async (text: string) => {
    fireEvent.click(screen.getByRole('radio', { name: 'Cust' }));
    const before = ring().getAttribute('aria-label');
    const input = screen.getByLabelText('Scala file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file(text)], configurable: true });
    fireEvent.change(input);
    await settle();
    return before;
  };

  it('loads a valid file as a custom list with its last pitch as the repeat', async () => {
    render(<HarmonicFieldLabPage />);
    await load('! t.scl\nmy scale\n 3\n!\n 9/8\n 5/4\n 2/1\n');
    expect(screen.queryByText('That file has no pitches.')).toBeNull();
    const table = screen.getByRole('table', { name: 'Field notes' });
    for (const r of ['1/1', '9/8', '5/4']) {
      expect(within(table).getByText(r)).toBeInTheDocument();
    }
    expect(within(table).queryByText('3/2')).toBeNull();
  });

  it('says so when a file has no pitches, and leaves the field alone', async () => {
    render(<HarmonicFieldLabPage />);
    const before = await load('! empty\nnothing here\n 0\n');
    expect(screen.getByRole('alert')).toHaveTextContent('That file has no pitches.');
    expect(ring().getAttribute('aria-label')).toBe(before);
  });

  it('reports unreadable pitches inline instead of throwing', async () => {
    render(<HarmonicFieldLabPage />);
    await load('bad\n 2\n 9/8\n banana\n');
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });
});

describe('Keys & Modes: click to select', () => {
  it('a complete key ring makes that key the subset with its root as the mode root; an incomplete one selects what the field has', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    fireEvent.click(dot(/^1\/1/));
    fireEvent.click(dot(/^5\/4/));
    fireEvent.click(within(rail()).getByRole('tab', { name: /Keys/ }));
    const keys = screen.getByRole('list', { name: 'Keys' });
    // 1/1 + 5/4 moved to 3/2 gives 3/2 + 15/8, both in the field
    const onFifth = within(keys).getByRole('button', {
      name: /^Key on 3\/2: the whole scale fits/,
    });
    expect(onFifth).toBeEnabled();
    const onSecond = within(keys).getByRole('button', { name: /^Key on 9\/8: 1 scale note/ });
    expect(onSecond).toBeEnabled();
    expect(onSecond).toHaveAttribute('data-complete', 'false');
    expect(onFifth).toHaveAttribute('data-complete', 'true');
    fireEvent.click(onFifth);
    expect(ring().getAttribute('aria-label')).toMatch(/2 of 8 notes selected/);
    expect(dot(/^3\/2/)).toHaveAccessibleName(/in subset/);
    expect(dot(/^15\/8/)).toHaveAccessibleName(/in subset/);
    expect(dot(/^1\/1/)).not.toHaveAccessibleName(/in subset/);
    // the root of the mode is 3/2
    expect(screen.getByText(/mode/, { selector: 'span' })).toHaveTextContent(/3\/2/);
  });

  it('clicking a heat-grid row makes that mode current', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /Keys/ }));
    const grid = screen.getByRole('group', { name: 'Mode by degree heat grid' });
    const rows = within(grid).getAllByRole('button');
    fireEvent.click(rows[2]);
    expect(screen.getByText(/mode/, { selector: 'span' })).toHaveTextContent(/5\/4/);
  });
});
