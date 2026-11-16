/** M7b step 2 through the page: preset browser, breadcrumb and modified dot, Update / Save as new, notice, subset rows, Unassigned. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { resetDeveloperOptionsCache, writeDeveloperOptions } from './state/developerOptions';
import { KEY_GENERATORS } from './state/persist';
import { openBrowser, pickPreset, presetButton, subsetList } from './testUtils';

// whole-page renders are slow in jsdom; under a full parallel run some take over the 5 s default
vi.setConfig({ testTimeout: 15_000 });

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 170));
  });
const typeSlow = async (el: HTMLElement, value: string) => {
  type(el, value);
  await settle();
};
const key = (el: HTMLElement, k: string) => fireEvent.keyDown(el, { key: k });
const stored = () =>
  JSON.parse(window.localStorage.getItem(KEY_GENERATORS) ?? '{}') as {
    presets?: { id: string; name: string; folder: string }[];
    subsets?: { id: string; owner: string; name: string; pitches: unknown[] }[];
  };
const rowNames = () =>
  within(subsetList())
    .queryAllByRole('button', { name: /^Rename / })
    .map((b) => b.getAttribute('aria-label')!.replace(/^Rename /, ''));
/** Divisions box of the EDO method. */
const divisions = () => screen.getByRole('textbox', { name: 'Divisions' });
const addButton = () => screen.getByRole('button', { name: 'Add subset' });
/** The full path line under the Preset control (the control itself shows only the name). */
const crumb = () => screen.getByTestId('preset-path');

beforeEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});
afterEach(() => window.localStorage.clear());

describe('preset browser', () => {
  it('opens with the four folders; search is flat with folder paths; arrows, Enter and Escape work', () => {
    render(<HarmonicFieldLabPage />);
    expect(crumb()).toHaveTextContent('Harmonic series > Harmonics 8–15');
    expect(presetButton()).toHaveTextContent('Harmonics 8–15');
    expect(presetButton()).not.toHaveTextContent('Harmonic series');
    expect(presetButton()).toHaveAccessibleName('Preset: Harmonic series > Harmonics 8–15');
    const box = openBrowser();
    const tree = screen.getByRole('tree', { name: 'Presets' });
    const names = within(tree)
      .getAllByRole('treeitem')
      .map((r) => r.getAttribute('aria-level'));
    expect(names[0]).toBe('1');
    for (const f of ['Built-in', 'My presets', 'Recent', 'Auto-saved']) {
      expect(within(tree).getByRole('treeitem', { name: new RegExp(`^${f}`) })).toBeInTheDocument();
    }
    // the current generator's folder is open and its row is highlighted
    expect(within(tree).getByRole('treeitem', { name: /Harmonics 8–15/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // typing searches everything, flat, each result with its path
    type(box, 'carlos');
    const hits = within(
      screen.getByRole('listbox', { name: 'Preset search results' })
    ).getAllByRole('option');
    expect(hits).toHaveLength(3);
    expect(hits[0]).toHaveTextContent('Built-in > Equal divisions > Non-octave');
    // arrows move, Enter picks
    key(box, 'ArrowDown');
    expect(hits[1]).toHaveAttribute('aria-selected', 'true');
    key(box, 'Enter');
    expect(screen.queryByRole('combobox', { name: 'Search presets' })).toBeNull();
    expect(crumb()).toHaveTextContent('Equal divisions > Non-octave > Carlos Beta (11 ED 3/2)');
    // Escape closes without picking
    const box2 = openBrowser();
    key(box2, 'ArrowDown');
    fireEvent.keyDown(box2, { key: 'Escape' });
    expect(screen.queryByRole('combobox', { name: 'Search presets' })).toBeNull();
    expect(presetButton()).toHaveTextContent('Carlos Beta');
  });

  it('Right and Left open and close a folder, and Left on a preset goes to its folder; the info line follows', () => {
    render(<HarmonicFieldLabPage />);
    const box = openBrowser();
    const tree = () => screen.getByRole('tree', { name: 'Presets' });
    // go to the Built-in row (the open folder's first row) and close, then open it with Right
    const builtin = () => within(tree()).getByRole('treeitem', { name: /^Built-in/ });
    for (let i = 0; i < 8 && builtin().getAttribute('aria-selected') !== 'true'; i++) {
      key(box, 'ArrowUp');
    }
    expect(builtin()).toHaveAttribute('aria-expanded', 'true');
    key(box, 'ArrowLeft');
    expect(builtin()).toHaveAttribute('aria-expanded', 'false');
    key(box, 'ArrowRight');
    expect(builtin()).toHaveAttribute('aria-expanded', 'true');
    key(box, 'ArrowRight'); // already open: onto its first child
    expect(within(tree()).getByRole('treeitem', { name: /^Harmonic series/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    key(box, 'Enter'); // a folder row toggles
    expect(within(tree()).getByRole('treeitem', { name: /^Harmonic series/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    // the info line (bottom edge of the picker) follows the highlighted preset row; it is content, so the off-switch keeps it
    const infoLine = () => document.querySelector('[class*="pbInfo"]') as HTMLElement;
    key(box, 'ArrowRight');
    key(box, 'ArrowDown');
    expect(infoLine()).toHaveTextContent(/overtone|harmonics/i);
    act(() => writeDeveloperOptions({ tooltips: false }));
    expect(infoLine()).toHaveTextContent(/overtone|harmonics/i);
    act(() => writeDeveloperOptions({ tooltips: true }));
  });

  it('shows the breadcrumb and a modified dot when the generator is edited', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    expect(crumb()).toHaveTextContent('Equal divisions > Small (5 to 12) > 12-EDO');
    expect(presetButton()).toHaveTextContent('12-EDO');
    expect(presetButton().querySelector('[data-modified]')).toBeNull();
    await typeSlow(divisions(), '13'); // no 13-EDO preset
    expect(presetButton()).toHaveTextContent('12-EDO');
    expect(presetButton().querySelector('[data-modified]')).not.toBeNull();
    // the dot comes first, before the name
    expect(presetButton().querySelector('[data-modified]')?.nextElementSibling).toHaveTextContent(
      '12-EDO'
    );
    expect(presetButton()).toHaveAccessibleName(/\(modified\)$/);
  });
});

describe('Update preset and Save as new', () => {
  it('Update is disabled for a built-in, with the reason as its tooltip', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    await typeSlow(divisions(), '13');
    const update = screen.getByRole('button', { name: 'Update preset' });
    expect(update).toBeDisabled();
    fireEvent.mouseEnter(update.parentElement!);
    expect(
      await screen.findByText(
        /Built-in presets cannot be changed. Save as new instead./,
        {},
        { timeout: 2000 }
      )
    ).toBeInTheDocument();
  });

  const openSave = (shift = false) =>
    fireEvent.click(screen.getByRole('button', { name: 'Save as new' }), { shiftKey: shift });
  const saveForm = (name: string, folder: string) => {
    type(screen.getByRole('textbox', { name: 'New preset name' }), name);
    type(screen.getByRole('combobox', { name: 'Folder' }), folder);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  };

  it('plain Save as new starts with no subsets; Shift+click copies them', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.click(addButton());
    expect(rowNames()).toEqual(['Subset 1']);
    await typeSlow(divisions(), '24');
    // plain: no subsets, a folder path creates folders
    openSave();
    expect(screen.getByText('Starts with no subsets.')).toBeInTheDocument();
    saveForm('Mine', 'Pools/Seven');
    expect(crumb()).toHaveTextContent('My presets > Pools > Seven > Mine');
    expect(rowNames()).toEqual([]);
    expect(stored().presets?.[0]).toMatchObject({ name: 'Mine', folder: 'Pools/Seven' });
    expect(screen.queryByText(/copied subset/)).toBeNull();
    // Shift+click: the form says it copies, and the copy notice has no Undo
    await pickPreset('12-EDO');
    await typeSlow(divisions(), '24');
    openSave(true);
    expect(screen.getByText(/Copies 1 subset/)).toBeInTheDocument();
    saveForm('Copy', 'Pools');
    expect(rowNames()).toEqual(['Subset 1']);
    expect(screen.getByText(/Saved 'Copy' with 1 copied subset/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    // the dropdown lists both ways
    fireEvent.click(screen.getByRole('button', { name: 'More ways to save as new' }));
    expect(screen.getByRole('menuitem', { name: /empty subset list/ })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /copy 1 subset .*Shift\+click/ })
    ).toBeInTheDocument();
  });

  it('Add on an edited generator says it was kept under Auto-saved; the line can be dismissed and ends on the next edit', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    await typeSlow(divisions(), '13'); // edited
    fireEvent.click(addButton());
    const note = screen.getByText(
      /^Kept automatically as '.+' under Auto-saved\. Use Save as new to name it and move it to My presets\./
    );
    expect(note.closest('[role="status"]')).toHaveAttribute('data-kind', 'fork');
    expect(crumb()).toHaveTextContent(/^Auto-saved > /);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss fork notice' }));
    expect(screen.queryByText(/Kept automatically as/)).toBeNull();
    // an unedited generator adds quietly
    await pickPreset('12-EDO');
    fireEvent.click(addButton());
    expect(screen.queryByText(/Kept automatically as/)).toBeNull();
  });

  it('Update reports what changed; Show removed lists it read-only; Undo restores; a refusal line can be dismissed', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    openSave();
    saveForm('Twelve', '');
    fireEvent.click(addButton());
    await typeSlow(divisions(), '7'); // shares only 1/1 with 12-EDO
    const update = screen.getByRole('button', { name: 'Update preset' });
    expect(update).toBeEnabled();
    fireEvent.click(update);
    const notice = screen.getByText(/^Updated 'Twelve'/).closest('[role="status"]') as HTMLElement;
    expect(notice).toHaveTextContent(/One subset lost 11\.0 pitches on average \(most: 11\)\./);
    expect(stored().subsets?.[0].pitches).toHaveLength(1);
    // review list: the subset, read only
    fireEvent.click(within(notice).getByRole('button', { name: 'Show removed' }));
    const review = screen.getByRole('list', { name: 'Subsets that lost pitches' });
    expect(
      within(review).getByRole('img', {
        name: /Subset 1: 1 pitches kept \(solid\), 11 removed \(dashed\)/,
      })
    ).toBeInTheDocument();
    expect(within(review).queryByRole('textbox')).toBeNull();
    expect(review.querySelectorAll('[data-kind="lost"]')).toHaveLength(11);
    expect(review.querySelectorAll('[data-kind="kept"]')).toHaveLength(1);
    // it is a modal (like the field table): closed on purpose, here with its close button
    const dialog = screen.getByRole('dialog', { name: 'Subsets that lost pitches' });
    expect(dialog).toContainElement(review);
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Undo: the exact previous subset is back and the notice is gone
    fireEvent.click(within(notice).getByRole('button', { name: 'Undo' }));
    expect(screen.queryByText(/^Updated 'Twelve'/)).toBeNull();
    expect(stored().subsets?.[0].pitches).toHaveLength(12);
    // Update again, then dismiss the notice
    fireEvent.click(screen.getByRole('button', { name: 'Update preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(screen.queryByText(/^Updated 'Twelve'/)).toBeNull();
  });
});

describe('subset rows', () => {
  it('Add makes the next row without a name, highlights it, a duplicate highlights the existing row, click the name to rename', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(addButton());
    expect(rowNames()).toEqual(['Subset 1']);
    const li = () => subsetList().querySelector('[data-subset]') as HTMLElement;
    expect(li()).toHaveAttribute('data-flash', 'new');
    // the same selection again: no second row, the existing one is highlighted
    fireEvent.click(addButton());
    expect(rowNames()).toEqual(['Subset 1']);
    expect(li()).toHaveAttribute('data-flash', 'duplicate');
    // a different selection makes Subset 2
    fireEvent.click(
      within(screen.getByRole('group', { name: /^Pitch circle/ })).getAllByRole('button')[1]
    );
    fireEvent.click(addButton());
    expect(rowNames()).toEqual(['Subset 1', 'Subset 2']);
    // rename in place: Enter keeps, Escape cancels
    fireEvent.click(screen.getByRole('button', { name: 'Rename Subset 2' }));
    const box = screen.getByRole('textbox', { name: 'New name' });
    type(box, 'Quiet');
    key(box, 'Escape');
    expect(rowNames()).toEqual(['Subset 1', 'Subset 2']);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Subset 2' }));
    const box2 = screen.getByRole('textbox', { name: 'New name' });
    type(box2, 'Quiet');
    key(box2, 'Enter');
    expect(rowNames()).toEqual(['Subset 1', 'Quiet']);
    expect(stored().subsets?.map((s) => s.name)).toEqual(['Subset 1', 'Quiet']);
  });

  it('only the name text renames: the count and the rest of the row load the subset', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(addButton());
    const rename = screen.getByRole('button', { name: 'Rename Subset 1' });
    expect(rename).toHaveTextContent(/^Subset 1$/);
    // the count sits beside the rename button, not inside it
    const count = within(subsetList()).getByText(/\d+ notes/);
    expect(count.closest('button')).toBeNull();
    expect(rename.contains(count)).toBe(false);
    fireEvent.click(rename);
    expect(screen.getByRole('textbox', { name: 'New name' })).toBeInTheDocument();
  });

  it('rows that do not fully map are dimmed with a side bar whose tooltip says why; a no-match row does nothing; a full row is untouched', async () => {
    const pitch = (c: number) => ({ m: null, c });
    window.localStorage.setItem(
      KEY_GENERATORS,
      JSON.stringify({
        version: 1,
        presets: [],
        untitled: [],
        subsets: [
          {
            id: 's1',
            owner: 'b:gone',
            name: 'Partial',
            pitches: [pitch(0), pitch(123.4)],
            root: pitch(0),
          },
          {
            id: 's2',
            owner: 'b:gone',
            name: 'Nothing',
            pitches: [pitch(77.7), pitch(123.4)],
            root: pitch(77.7),
          },
        ],
        recents: [],
        next: { preset: 1, untitled: 1, subset: 3 },
      })
    );
    render(<HarmonicFieldLabPage />);
    fireEvent.click(addButton()); // a full row for the current generator
    fireEvent.click(screen.getByRole('button', { name: /^Unassigned \(2\)/ }));
    const item = (name: string) =>
      within(subsetList())
        .getByRole('button', { name: new RegExp(`^${name}: `) })
        .closest('li')!;
    expect(item('Subset 1')).not.toHaveAttribute('data-match');
    expect(item('Subset 1').querySelector('[role="img"]')).toBeNull();
    expect(item('Partial')).toHaveAttribute('data-match', 'partial');
    expect(item('Nothing')).toHaveAttribute('data-match', 'none');
    const bar = (name: string) => item(name).querySelector('[role="img"]') as HTMLElement;
    expect(bar('Partial')).toHaveAccessibleName(
      '1 of 2 notes in these settings. Missing: 123.4 c.'
    );
    expect(bar('Nothing')).toHaveAccessibleName('No notes in common with these settings.');
    // the count in the row reads found/total when the row does not fully map (0/n for no match), the plain count otherwise
    expect(within(item('Partial')).getByText(/^1\/2 notes/)).toBeInTheDocument();
    expect(within(item('Nothing')).getByText(/^0\/\d+ notes/)).toBeInTheDocument();
    expect(within(item('Subset 1')).queryByText(/\d+\/\d+ notes/)).toBeNull();
    // the tooltip carries the same sentence
    fireEvent.mouseEnter(bar('Partial').parentElement!);
    expect(
      await screen.findByText(
        /1 of 2 notes in these settings\. Missing: 123\.4 c\./,
        {},
        { timeout: 2000 }
      )
    ).toBeInTheDocument();
    // a no-match row does nothing when clicked; a partial one loads
    const nothing = within(subsetList()).getByRole('button', { name: /^Nothing: / });
    expect(nothing).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(nothing);
    expect(screen.queryByText(/'Nothing' loaded/)).toBeNull();
    expect(item('Nothing')).not.toHaveAttribute('data-flash');
    fireEvent.click(within(subsetList()).getByRole('button', { name: /^Partial: / }));
    expect(screen.getByText(/'Partial' loaded: 1 of 2 pitches/)).toBeInTheDocument();
  });

  it('subsets of a generator vanish when you switch generator and come back with it', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(addButton());
    await pickPreset('12-EDO');
    expect(rowNames()).toEqual([]);
    await pickPreset('Harmonics 8–15');
    expect(rowNames()).toEqual(['Subset 1']);
  });

  it('shows orphaned subsets in a collapsed Unassigned group; loading one reports the pitches the field lacks', () => {
    window.localStorage.setItem(
      KEY_GENERATORS,
      JSON.stringify({
        version: 1,
        presets: [],
        untitled: [],
        subsets: [
          {
            id: 's1',
            owner: 'b:A preset from an older version',
            name: 'Lost one',
            pitches: [
              { m: null, c: 0 },
              { m: null, c: 123.4 },
            ],
            root: { m: null, c: 0 },
          },
        ],
        recents: [],
        next: { preset: 1, untitled: 1, subset: 2 },
      })
    );
    render(<HarmonicFieldLabPage />);
    const group = screen.getByRole('button', { name: /^Unassigned \(1\)/ });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(rowNames()).toEqual([]);
    fireEvent.click(group);
    expect(rowNames()).toEqual(['Lost one']);
    fireEvent.click(
      within(subsetList()).getByRole('button', { name: /^Lost one: (1 of )?2 notes/ })
    );
    const line = screen.getByText(/'Lost one' loaded: 1 of 2 pitches are not in this field\./);
    expect(line).toBeInTheDocument();
    // neutral text: yellow means pinned, so this line is not a warning color
    expect(line).toHaveAttribute('data-kind', 'note');
    // the tab is still on its own generator
    expect(presetButton()).toHaveTextContent('Harmonics 8–15');
    // dismissable
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss message' })[0]);
    expect(screen.queryByText(/pitches are not in this field/)).toBeNull();
  });
});

describe('My presets rows', () => {
  it('rename, move and delete from the row; delete keeps the subsets under Auto-saved', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.click(screen.getByRole('button', { name: 'Save as new' }));
    type(screen.getByRole('textbox', { name: 'New preset name' }), 'Twelve');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(addButton());
    // rename + move
    openBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preset Twelve' }));
    type(screen.getByRole('textbox', { name: 'Preset name' }), 'Dozen');
    type(screen.getByRole('combobox', { name: 'Folder' }), 'A/B');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(stored().presets?.[0]).toMatchObject({ name: 'Dozen', folder: 'A/B' });
    expect(crumb()).toHaveTextContent('My presets > A > B > Dozen');
    // delete asks first, then keeps the subset under Auto-saved
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Dozen' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Subsets stay under Auto-saved/);
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Delete' }));
    expect(stored().presets).toEqual([]);
    expect(stored().subsets?.[0].owner).toMatch(/^u:/);
    expect(rowNames()).toEqual(['Subset 1']);
  });
});
