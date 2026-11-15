/**
 * M8d step 2 through the page: the `-` popup's As in field | Exact slider and stats panel, `E`, the right-click menu (Stash on
 * shelf, Shift+click = the other mode), the shelf chord that is always fixed, the positional Scale order, the composite item's
 * detail lines, and the CPS chips (scenarios a to g).
 */
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset } from './testUtils';

vi.setConfig({ testTimeout: 20_000 });

const COMPOSITES_KEY = 'hrifa.harmonic-field-lab.composites.v1';
const SHELF_KEY = 'hrifa.harmonic-field-lab.chordshelf.v1';
const down = (key: string, init: object = {}) => fireEvent.keyDown(window, { key, ...init });
const popup = () => screen.queryByRole('dialog', { name: 'Send to composite' });
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const railTab = (name: RegExp) => within(rail()).getByRole('tab', { name });
const chip = (re: RegExp) => screen.getAllByRole('button', { name: re })[0];
const sketch = () => screen.getByRole('group', { name: 'Sketch a chord' });
const slider = (name: string) => within(popup()!).getByRole('radio', { name });
const pitchText = () => within(popup()!).getByRole('group', { name: 'Pitch values' }).textContent;
const EDO_MAJOR = /^major triad 4:5:6 on (1\/1|0\.0 c)/i;

interface StoredItem {
  label: string;
  pitches: { c: number }[];
  detail?: Record<string, unknown>;
}
const composites = () =>
  (
    JSON.parse(window.localStorage.getItem(COMPOSITES_KEY) ?? '{"composites":[]}') as {
      composites: { id: number; items: StoredItem[] }[];
    }
  ).composites;
const centsOf = (it: StoredItem) => it.pitches.map((p) => Math.round(p.c * 10) / 10);

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('the - popup mode and the right-click menu (a, b, c, d)', () => {
  it('a: as in field sends C E G; b: Exact (slider or E) sends 0, 386.3, 702 and the preview shows it first; E only while open; c: the shelf switch seeds the popup', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    const major = chip(EDO_MAJOR);
    fireEvent.mouseEnter(major);
    // a: the shelf switch is on As in field, so the popup opens on it and shows the field's notes as text
    down('-');
    expect(slider('As in field')).toBeChecked();
    expect(slider('As in field')).toBeEnabled();
    expect(pitchText()).toMatch(/0\.0 c.*400\.0 c.*700\.0 c/);
    expect(pitchText()).not.toMatch(/5\/4/);
    down('0');
    expect(composites()).toHaveLength(1);
    expect(centsOf(composites()[0].items[0])).toEqual([0, 400, 700]);
    // the popup of composite 1: the item is already there in As in field
    down('-');
    const row1 = () => within(popup()!).getByRole('button', { name: /^1: Composite 1/ });
    expect(row1()).toHaveAccessibleName(/already in composite 1/);
    expect(within(popup()!).getAllByTestId('merged-count')[0]).toHaveTextContent(
      '3 merged notes now'
    );
    // b: E flips to Exact: text shows ratios and monzos, the preview changes before any digit is pressed
    down('e');
    expect(slider('Exact')).toBeChecked();
    expect(pitchText()).toMatch(/386\.3 c.*5\/4.*\[2\^-2 5\]/);
    expect(pitchText()).toMatch(/702\.0 c.*3\/2/);
    expect(row1()).toHaveAccessibleName(/1 new, 2 common/);
    expect(
      within(row1()).getByTestId('composite-ring').querySelectorAll('[data-kind="added"]')
    ).toHaveLength(1);
    // the slider does the same as E
    fireEvent.click(slider('As in field'));
    expect(row1()).toHaveAccessibleName(/already in composite 1/);
    fireEvent.click(slider('Exact'));
    down('1');
    expect(popup()).toBeNull();
    expect(composites()[0].items).toHaveLength(2);
    expect(centsOf(composites()[0].items[1])).toEqual([0, 386.3, 702]);
    // E does nothing while the popup is closed (and flipping it in the popup never touched the shelf switch)
    down('e');
    expect(popup()).toBeNull();
    expect(within(sketch()).getByRole('radio', { name: 'As in field' })).toBeChecked();
    down('-');
    expect(slider('As in field')).toBeChecked();
    down('Escape');
    // c: the shelf switch on Exact: the popup opens on Exact
    fireEvent.click(within(sketch()).getByRole('radio', { name: 'Exact' }));
    down('-');
    expect(slider('Exact')).toBeChecked();
    down('Escape');
    // right-click: both entries; the default follows the shelf (Exact), Shift+click sends in the OTHER mode (as in field)
    expect(fireEvent.contextMenu(major)).toBe(false);
    expect(await screen.findByRole('menuitem', { name: /^Stash on shelf/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Send to composite/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^New composite/ }), {
      shiftKey: true,
    });
    expect(composites()).toHaveLength(2);
    expect(centsOf(composites()[1].items[0])).toEqual([0, 400, 700]);
    expect(expectedKinds(composites()[1].items[0])).toBe(true);
    expect(fireEvent.contextMenu(major)).toBe(false);
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Send to composite/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^New composite/ }));
    expect(composites()).toHaveLength(3);
    expect(centsOf(composites()[2].items[0])).toEqual([0, 386.3, 702]);
    // Shift+click and "already in it": composite 3 holds the Exact version only, so with the menu on Exact its entry is in it
    // for a plain click but a Shift+click (the field version) is still valid, so the entry stays enabled and says so
    expect(fireEvent.contextMenu(major)).toBe(false);
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Send to composite/ }));
    const c3 = await screen.findByRole('menuitem', { name: /^3 Composite 3/ });
    expect(c3).toHaveTextContent(/already in it; Shift\+click sends the other mode/);
    expect(c3).not.toHaveAttribute('data-disabled');
    fireEvent.click(c3, { shiftKey: true });
    expect(composites()[2].items).toHaveLength(2);
    expect(centsOf(composites()[2].items[1])).toEqual([0, 400, 700]);
    // now both versions are in it: disabled
    expect(fireEvent.contextMenu(major)).toBe(false);
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Send to composite/ }));
    expect(await screen.findByRole('menuitem', { name: /^3 Composite 3/ })).toHaveAttribute(
      'data-disabled'
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    // item 8: Stash on shelf from the same menu
    expect(fireEvent.contextMenu(major)).toBe(false);
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Stash on shelf/ }));
    const shelf = JSON.parse(window.localStorage.getItem(SHELF_KEY) ?? '{}') as {
      chords: { template: string; pitches: { c: number }[] }[];
    };
    expect(shelf.chords).toHaveLength(1);
    expect(shelf.chords[0].template).toBe('4:5:6');
    expect(shelf.chords[0].pitches.map((p) => Math.round(p.c))).toEqual([0, 400, 700]);
    // the stashed shelf chord is FIXED even with the shelf switch on Exact: slider disabled with the reason, stored notes sent
    fireEvent.mouseLeave(major);
    fireEvent.click(railTab(/^Shelf/));
    const slot = within(screen.getByRole('list', { name: 'Chord shelf' })).getAllByRole(
      'listitem'
    )[0];
    fireEvent.mouseEnter(slot);
    down('-');
    expect(slider('Exact')).toBeDisabled();
    expect(slider('As in field')).toBeDisabled();
    expect(within(popup()!).getByTestId('send-mode-note')).toHaveTextContent(
      /stashed shelf chord always sends exactly the pitches it was stashed with/
    );
    expect(pitchText()).toMatch(/400\.0 c/);
    expect(pitchText()).not.toMatch(/386\.3/);
    down('e');
    expect(slider('Exact')).toBeDisabled();
    down('0');
    expect(centsOf(composites()[3].items[0])).toEqual([0, 400, 700]);
  });
});

/** The item's detail has the template and no stored cents list. */
function expectedKinds(it: StoredItem): boolean {
  return it.detail !== undefined && 'template' in it.detail && !('cents' in it.detail);
}

describe('positional chords: Scale order, score and rank, tail (d, e, f)', () => {
  it('d: a positional chord is fixed; e: Scale order lists degrees 1..7 with score and rank; f: stash and composite keep the tail and show it', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    const ringBtns = within(screen.getByRole('group', { name: /^Pitch circle/ })).getAllByRole(
      'button'
    );
    [0, 2, 4, 5, 7, 9, 11].forEach((i) => fireEvent.click(ringBtns[i]));
    const list = () => screen.getByRole('list', { name: 'Positional chords 2-2' });
    const labels = () =>
      within(list())
        .getAllByTestId('positional-row')
        .map((li) => /^(\d-\d on \d)/.exec(li.textContent ?? '')?.[1]);
    // Smoothest (as before): no score shown
    expect(within(list()).queryAllByTestId('positional-score')).toHaveLength(0);
    // e: Scale order
    fireEvent.click(screen.getByRole('radio', { name: 'Scale order' }));
    expect(labels()).toEqual([1, 2, 3, 4, 5, 6, 7].map((d) => `2-2 on ${d}`));
    const rows = within(list()).getAllByTestId('positional-row');
    const ranks = rows.map((li) => Number(/#(\d)/.exec(li.textContent ?? '')?.[1]));
    expect([...ranks].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    rows.forEach((li) => {
      expect(within(li).getByTestId('positional-score').textContent).toMatch(/score \d+\.\d\d/);
    });
    // back to Smoothest: rank order, no score
    fireEvent.click(screen.getByRole('radio', { name: 'Smoothest' }));
    expect(
      within(list())
        .getAllByTestId('positional-row')
        .map((li) => Number(/#(\d)/.exec(li.textContent ?? '')?.[1]))
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // d: the popup on a positional row: slider disabled with the reason, the fixed field notes
    const first = within(list()).getByRole('button', { name: /^2-2 on 1,/ });
    fireEvent.mouseEnter(first);
    down('-');
    expect(slider('Exact')).toBeDisabled();
    expect(within(popup()!).getByTestId('send-mode-note')).toHaveTextContent(
      /positional chord is fixed/
    );
    expect(pitchText()).toMatch(/0\.0 c.*400\.0 c.*700\.0 c/);
    down('0');
    fireEvent.mouseLeave(first);
    // f: the composite item keeps the tail (no stored cents), and the panel shows template/pattern, tail, cents and source
    const item = composites()[0].items[0];
    expect(item.detail).toMatchObject({ pattern: '2-2', tail: '7 of 12-EDO · 400-300 c' });
    expect('cents' in (item.detail ?? {})).toBe(false);
    fireEvent.click(railTab(/^Composites/));
    fireEvent.click(screen.getByRole('button', { name: 'Show the items of Composite 1' }));
    const items = within(screen.getByRole('list', { name: 'Items of Composite 1' }));
    expect(items.getByText('2-2 on 1')).toBeInTheDocument();
    expect(items.getByText('0.0, 400.0, 700.0 c · 7 of 12-EDO · 400-300 c')).toBeInTheDocument();
    expect(items.getByText('Source: 12-EDO')).toBeInTheDocument();
    // f: the stash keeps the tail too
    fireEvent.click(railTab(/^Chords/));
    fireEvent.click(screen.getByRole('button', { name: 'Stash 2-2 on 2 on the shelf' }));
    const shelf = JSON.parse(window.localStorage.getItem(SHELF_KEY) ?? '{}') as {
      chords: { tail?: string; pattern?: string }[];
    };
    expect(shelf.chords[0]).toMatchObject({ pattern: '2-2', tail: '7 of 12-EDO · 300-400 c' });
  });
});

describe('CPS chip roots follow the factor labels (root position)', () => {
  it('otonal 3:5:7 sits on its 3, utonal 1/(3:5:7) on its 1/7 note (this field is normalised so the 3 is 1/1); the chip arms the Sketch with its template', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('Hexany (1 3 5 7, choose 2)');
    const section = screen.getByRole('region', { name: 'Chords inside this CPS' });
    const oto = within(section).getByRole('button', { name: /chord 3:5:7:/ });
    fireEvent.mouseEnter(oto);
    down('-');
    down('0');
    fireEvent.mouseLeave(oto);
    const o = composites()[0].items[0];
    expect(o.detail).toMatchObject({ template: '3:5:7', root: '1/1' });
    expect(centsOf(o)).toEqual([0, 266.9, 884.4]);
    const uto = within(section).getByRole('button', { name: /chord 1\/3:1\/5:1\/7:/ });
    fireEvent.mouseEnter(uto);
    down('-');
    down('0');
    fireEvent.mouseLeave(uto);
    const u = composites()[1].items[0];
    expect(u.detail).toMatchObject({ template: '1/(3:5:7)', root: '5/4' });
    expect(centsOf(u)).toEqual([386.3, 653.2, 968.8]);
    // the + stashes it root first
    fireEvent.click(within(section).getAllByRole('button', { name: /^Stash otonal 3:5:7/ })[0]);
    const shelf = JSON.parse(window.localStorage.getItem(SHELF_KEY) ?? '{}') as {
      chords: { template: string; pitches: { c: number }[] }[];
    };
    expect(shelf.chords[0].template).toBe('3:5:7');
    expect(Math.round(shelf.chords[0].pitches[0].c)).toBe(0);
    // holding 1 on the chip (and clicking it) arms its template in the Sketch row
    fireEvent.mouseEnter(oto);
    down('1');
    fireEvent.keyUp(window, { key: '1' });
    const tpl = () =>
      within(screen.getByRole('group', { name: 'Sketch a chord' })).getByRole<HTMLSelectElement>(
        'combobox',
        { name: 'Sketch template' }
      );
    expect(tpl().value).toBe('3:5:7');
    fireEvent.mouseLeave(oto);
    fireEvent.click(uto);
    expect(tpl().value).toBe('1/(3:5:7)');
    expect(screen.queryByText(/armed from a chord/)).toBeNull();
  });
});

describe('CPS chips behave like ratio chips (g)', () => {
  it('g: the + stashes an otonal chip; - and right-click send it; the popup lists its notes', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('Hexany (1 3 5 7, choose 2)');
    const section = screen.getByRole('region', { name: 'Chords inside this CPS' });
    const otonal = within(
      within(section).getByRole('group', { name: 'CPS otonal chords' })
    ).getAllByRole('button', { name: /chord / });
    const first = otonal[0];
    // - sends it
    fireEvent.mouseEnter(first);
    down('-');
    expect(within(popup()!).getByText(/^Otonal /)).toBeInTheDocument();
    expect(pitchText()).toMatch(/ c/);
    down('0');
    expect(composites()).toHaveLength(1);
    expect(composites()[0].items[0].detail).toMatchObject({ template: expect.any(String) });
    // right-click: the same two entries as a ratio chip
    expect(fireEvent.contextMenu(first)).toBe(false);
    expect(await screen.findByRole('menuitem', { name: /^Stash on shelf/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Send to composite/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^New composite/ }));
    fireEvent.mouseLeave(first);
    expect(composites()).toHaveLength(2);
    // + stashes it
    fireEvent.click(within(section).getAllByRole('button', { name: /^Stash otonal / })[0]);
    const shelf = JSON.parse(window.localStorage.getItem(SHELF_KEY) ?? '{}') as {
      chords: { pitches: unknown[] }[];
    };
    expect(shelf.chords).toHaveLength(1);
    expect(shelf.chords[0].pitches.length).toBeGreaterThanOrEqual(3);
  });
});
