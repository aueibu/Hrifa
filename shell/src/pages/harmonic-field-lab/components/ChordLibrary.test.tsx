/**
 * M7b: the chord library dialog, rendered inside `LabProvider` with the Chords panel (not the whole page). jsdom applies no CSS
 * module, so what a test cannot prove here: that each sentence really stays on one line, how wide the rows and the filter row
 * are, what the dimmed rows and the tooltips look like, and how fast 313 headings feel in a browser. The CSS is checked by eye.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHORD_LIBRARY_CREDIT,
  DEFAULT_TEMPLATES,
  FOLD_EDIT_NOTE,
  FOLD_ROW_NOTE,
  libraryEntries,
} from '../../../lib/harmonic-field';
import type { Lab } from '../state/context';
import { LabProvider } from '../state/LabProvider';
import { MAX_TEMPLATES, type Action } from '../state/labState';
import { TIPS } from '../texts';
import { ChordsPanel } from './ChordsPanel';
import { useLab } from './ui';

// 313 headings per render: heavy in jsdom, and under a parallel run some tests pass the 5 s default
vi.setConfig({ testTimeout: 30_000 });

let lab: Lab;
function Probe() {
  lab = useLab();
  return null;
}
const send = (...actions: Action[]) =>
  act(() => {
    for (const a of actions) {
      lab.dispatch(a);
    }
  });

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

/** The 5-limit major scale, all notes selected, tolerance 0. */
const major5 = (): Action[] => [
  { type: 'gen/custom', custom: '9/8\n5/4\n4/3\n3/2\n5/3\n15/8', rep: '2/1' },
  { type: 'sel/all' },
  { type: 'ui', patch: { tol: 0 } },
];

function mount(setup: Action[] = []) {
  const view = render(
    <LabProvider>
      <ChordsPanel />
      <Probe />
    </LabProvider>
  );
  if (setup.length) {
    send(...setup);
  }
  return view;
}
const closeLibrary = async (dialog: HTMLElement) => {
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Chord library' })).toBeNull());
};
const openLibrary = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Chord library' }));
  return screen.findByRole('dialog', { name: 'Chord library' });
};
const search = (dialog: HTMLElement, text: string) =>
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Search chords' }), {
    target: { value: text },
  });
/** The heading button of a shape, found by its root position text and name. */
const head = (dialog: HTMLElement, start: string) =>
  within(dialog).getByRole('button', { name: new RegExp(`^${start.replace(/[()/]/g, '\\$&')}`) });
/**
 * The entry rows (`tr[data-folds]`), including the rows of one-entry shapes, which are listed at the base level with no heading;
 * a Check line is the spanning row directly under its entry (`lineRow`).
 */
const rowsOf = (scope: HTMLElement) => [...scope.querySelectorAll<HTMLElement>('tr[data-folds]')];
const lineRow = (row: HTMLElement) => row.nextElementSibling as HTMLElement | null;
const textOf = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
/** The ratio text of an entry row (its first cell: the cells are not separated by spaces in the row's text). */
const ratioOf = (row: HTMLElement) => textOf(row.querySelector('td') as HTMLElement);
/** A shape's heading row: the heading button holds the ratio only, the name and the counts are in the cells beside it. */
const headRow = (button: HTMLElement) => button.closest('tr') as HTMLElement;
const without = (text: string) => ({
  type: 'templates/set' as const,
  templates: DEFAULT_TEMPLATES.filter((t) => t.text !== text).map((t) => ({ ...t })),
});
/** The matching entries listed: each heading says how many of its entries match, and a one-entry shape has no heading (its base-level row is a match or is dimmed). */
const matched = (dialog: HTMLElement) => {
  const inHeadings = [...dialog.querySelectorAll<HTMLElement>('button[aria-expanded]')].reduce(
    (sum, b) => {
      const m = /(\d+) (?:entry matches|entries match)/.exec(textOf(headRow(b)));
      return sum + (m ? Number(m[1]) : 0);
    },
    0
  );
  const singles = rowsOf(dialog).filter(
    (r) => r.closest('tbody[aria-label]') === null && r.getAttribute('data-match') === 'true'
  );
  return inHeadings + singles.length;
};

describe('the button and the header', () => {
  it('sits beside Edit templates and opens the dialog with the credit and the summary', async () => {
    mount();
    const edit = screen.getByRole('button', { name: 'Edit templates' });
    const lib = screen.getByRole('button', { name: 'Chord library' });
    expect(edit.closest('[data-tipk]')?.parentElement).toBe(
      lib.closest('[data-tipk]')?.parentElement
    );
    const dialog = await openLibrary();
    expect(within(dialog).getByText(CHORD_LIBRARY_CREDIT)).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "376 chords in 297 shapes (399 names in Scala's list); 16 collapse octaves in this repeat (they can be added; the finder skips them here)"
      )
    ).toBeInTheDocument();
    // 313 shapes: the 38 with several entries start collapsed under a heading; the 275 with one entry have no heading and are
    // listed at the base level as plain rows
    expect(dialog.querySelectorAll('button[aria-expanded="false"]')).toHaveLength(38);
    expect(dialog.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(0);
    expect(rowsOf(dialog)).toHaveLength(275);
    expect(dialog.querySelectorAll('tbody[aria-label] tr[data-folds]')).toHaveLength(0);
    // one table, the columns in order, each header a sort button
    expect(within(dialog).getAllByRole('table')).toHaveLength(1);
    const columns = [...dialog.querySelectorAll('thead th')].map((th) => textOf(th as HTMLElement));
    expect(columns).toEqual(['Ratio', 'Chord', 'Actions', 'Notes', 'Odd', 'Prime']);
    expect(dialog.querySelectorAll('thead th[aria-sort] button')).toHaveLength(5);
    expect(within(dialog).getByRole('separator', { name: 'Resize the ring panel' })).toBeVisible();
  });

  it('the credit sentence is in the glossary entry', () => {
    expect(TIPS.chordLibrary.text).toContain(CHORD_LIBRARY_CREDIT);
  });
});

describe('shapes and rows', () => {
  it('dominant seventh: the 4:5:6:7 heading says 4 entries; opening it lists the four rows in order', async () => {
    mount();
    const dialog = await openLibrary();
    search(dialog, 'dominant seventh');
    const h = head(dialog, '4:5:6:7 Harmonic Dominant Seventh');
    expect(textOf(headRow(h))).toContain('· 4 entries');
    expect(textOf(headRow(h))).toContain('4 entries match');
    // the whole heading row toggles, not only its button
    fireEvent.click(headRow(h));
    expect(h).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(headRow(h));
    expect(h).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(h);
    expect(h).toHaveAttribute('aria-expanded', 'true');
    const rows = rowsOf(within(dialog).getByRole('rowgroup', { name: 'Entries of 4:5:6:7' }));
    expect(rows.map(ratioOf)).toEqual(['4:5:6:7', '5:6:7:8', '6:7:8:10', '7:8:10:12']);
    expect(textOf(rows[0])).toContain('Harmonic Dominant Seventh');
    expect(textOf(rows[1])).toContain('1st inversion');
    expect(textOf(rows[0])).toMatch(/4 notes · odd 7 · prime 7/);
  });

  it('a folding row has no note line under it, Add works on it (rows 13b, 13c, 13d), Check does not', async () => {
    mount([without('10:12:15')]);
    const dialog = await openLibrary();
    search(dialog, 'Triunisonus');
    // a shape with one entry has no heading: its row is listed at the base level
    expect(within(dialog).queryByRole('button', { name: /^1:2:3 Triunisonus/ })).toBeNull();
    const row = rowsOf(dialog)[0];
    expect(row).toHaveAttribute('data-folds', 'true');
    expect(row.closest('tbody')).not.toHaveAttribute('aria-label');
    // the folding note line under the row was removed: nothing sits under it, the reason is the tooltip of the disabled Check
    expect(lineRow(row)).toBeNull();
    expect(within(row).queryByText(FOLD_ROW_NOTE)).toBeNull();
    // the only icons in the row are the two icon buttons (Add, Check)
    expect([...row.querySelectorAll('svg')].every((s) => s.closest('button') !== null)).toBe(true);
    const add = within(row).getByRole('button', { name: 'Add 1:2:3' });
    const check = within(row).getByRole('button', { name: 'Check 1:2:3' });
    expect(add).not.toHaveAttribute('aria-disabled');
    expect(check).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(check);
    expect(lineRow(row)).toBeNull();
    expect(within(dialog).queryByTestId('check-line')).toBeNull();
    expect(lab.state.ui.libChecked).toEqual([]);
    fireEvent.click(add);
    expect(lab.state.templates.at(-1)).toEqual({
      text: '1:2:3',
      name: 'Triunisonus',
      family: expect.any(String),
    });
    // the Add message shows where the other Add messages show
    expect(
      within(dialog).getByText(
        'Added 1:2:3 (not used by the finder in this repeat: octave notes merge).'
      )
    ).toHaveAttribute('data-kind', 'note');
    expect(within(rowsOf(dialog)[0]).getByText('in your templates')).toBeInTheDocument();
    // Edit templates: the row of 1:2:3 has the quiet note, the 4:5:6 row does not
    await closeLibrary(dialog);
    fireEvent.click(screen.getByRole('button', { name: 'Edit templates' }));
    const editor = await screen.findByRole('dialog', { name: 'Chord templates' });
    const rowOfRatios = (text: string) =>
      within(editor).getByDisplayValue(text).closest('[class*="editorRow"]') as HTMLElement;
    expect(rowOfRatios('1:2:3').nextElementSibling).toHaveTextContent(FOLD_EDIT_NOTE);
    expect(rowOfRatios('4:5:6').nextElementSibling?.textContent ?? '').not.toContain(
      FOLD_EDIT_NOTE
    );
  });
});

describe('Expand all and Collapse all', () => {
  it('opens every listed shape, then closes them all; both are kept by the lab', async () => {
    mount(major5());
    const dialog = await openLibrary();
    search(dialog, 'minor triad');
    const listed = within(dialog).getAllByRole('button', { expanded: false });
    const shapes = listed.filter((b) => b.getAttribute('aria-expanded') === 'false').length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Expand all shapes' }));
    expect(lab.state.ui.libOpen).toHaveLength(shapes);
    expect(within(dialog).queryAllByRole('button', { expanded: false })).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Collapse all shapes' }));
    expect(lab.state.ui.libOpen).toHaveLength(0);
    expect(within(dialog).queryAllByRole('button', { expanded: true })).toHaveLength(0);
  });
});

describe('state kept by the lab (rows 16 to 20)', () => {
  it('keeps the search, filters, checks and open shapes when the dialog is closed and reopened', async () => {
    mount(major5());
    let dialog = await openLibrary();
    search(dialog, 'minor triad');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Cardinality min' }), {
      target: { value: '3' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check all 3 of 10:12:15' }));
    expect(within(dialog).getByRole('button', { name: 'Clear checks (3)' })).toBeInTheDocument();
    await closeLibrary(dialog);
    expect(lab.state.ui.libFilters).toMatchObject({ search: 'minor triad', notesMin: 3 });
    expect(lab.state.ui.libChecked).toHaveLength(3);
    expect(lab.state.ui.libOpen).toHaveLength(1);
    dialog = await openLibrary();
    expect(within(dialog).getByRole('textbox', { name: 'Search chords' })).toHaveValue(
      'minor triad'
    );
    expect(within(dialog).getByRole('textbox', { name: 'Cardinality min' })).toHaveValue('3');
    expect(head(dialog, '10:12:15 Minor Triad')).toHaveAttribute('aria-expanded', 'true');
    // the results are recomputed from the subset as it is now
    expect(within(dialog).getAllByTestId('check-line')[0]).toHaveTextContent('2 found');
    send({ type: 'sel/toggle', i: 2 });
    expect(within(dialog).getAllByTestId('check-line')[0]).not.toHaveTextContent('2 found');
  });

  it('is still there after a reload (stored), the dialog itself closed (row 18)', async () => {
    const first = mount(major5());
    const dialog = await openLibrary();
    search(dialog, 'minor triad');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check all 3 of 10:12:15' }));
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Checked only' }));
    first.unmount();
    mount();
    expect(screen.queryByRole('dialog', { name: 'Chord library' })).toBeNull();
    expect(lab.state.ui.libFilters).toMatchObject({ search: 'minor triad', checkedOnly: true });
    expect(lab.state.ui.libChecked).toHaveLength(3);
    const again = await openLibrary();
    expect(within(again).getByRole('switch', { name: 'Checked only' })).toBeChecked();
  });

  it('drops a stored key the library no longer has, silently (row 20)', async () => {
    mount(major5());
    send({ type: 'lib/check', keys: ['no-such-key'] });
    const dialog = await openLibrary();
    expect(within(dialog).queryByRole('button', { name: /^Clear checks/ })).toBeNull();
    expect(within(dialog).queryAllByTestId('check-line')).toHaveLength(0);
  });

  it('Clear checks shows the count and is hidden at 0 (row 16)', async () => {
    mount(major5());
    const dialog = await openLibrary();
    expect(within(dialog).queryByRole('button', { name: /^Clear checks/ })).toBeNull();
    search(dialog, 'minor triad');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check all 3 of 10:12:15' }));
    const clear = within(dialog).getByRole('button', { name: 'Clear checks (3)' });
    expect(clear).toHaveTextContent('Clear checks (3)');
    fireEvent.click(clear);
    expect(within(dialog).queryByRole('button', { name: /^Clear checks/ })).toBeNull();
    expect(lab.state.ui.libChecked).toEqual([]);
  });

  it('Checked only lists the shapes of checked rows, each open with only those rows (row 19)', async () => {
    mount(major5());
    const dialog = await openLibrary();
    search(dialog, 'minor triad');
    fireEvent.click(head(dialog, '10:12:15 Minor Triad'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check 12:15:20' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check 10:12:15' }));
    search(dialog, 'major triad');
    fireEvent.click(head(dialog, '4:5:6 Major Triad'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check 4:5:6' }));
    search(dialog, '');
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Checked only' }));
    expect(within(dialog).getByText('3 checked')).toBeInTheDocument();
    // the Minor Triad shape has two checked rows, so it keeps a heading (open, nothing to fold); the Major Triad shape has one
    // checked row, so it is listed at the base level with no heading
    expect(dialog.querySelectorAll('button[aria-expanded]')).toHaveLength(1);
    expect(dialog.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(1);
    expect(rowsOf(dialog).map(ratioOf).sort()).toEqual(['10:12:15', '12:15:20', '4:5:6']);
    // the heading shows its first listed row and the count of checked rows
    expect(textOf(headRow(head(dialog, '10:12:15')))).toContain('· 2 checked');
    expect(within(dialog).queryByRole('button', { name: /^4:5:6/ })).toBeNull();
    // it narrows what the other filters allow
    search(dialog, 'minor triad');
    expect(rowsOf(dialog)).toHaveLength(2);
    expect(within(dialog).getByText('2 checked')).toBeInTheDocument();
    // off again: the whole library, the header line back
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Checked only' }));
    search(dialog, '');
    expect(within(dialog).getByText(/^376 chords in 297 shapes/)).toBeInTheDocument();
  });
});

describe('Add', () => {
  it('Add on 10:12:15 adds Minor Triad in the family Minor; the row then says it is in your templates', async () => {
    mount([without('10:12:15')]);
    const dialog = await openLibrary();
    search(dialog, 'minor triad');
    fireEvent.click(head(dialog, '10:12:15 Minor Triad'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 10:12:15' }));
    expect(lab.state.templates.at(-1)).toEqual({
      text: '10:12:15',
      name: 'Minor Triad',
      family: 'Minor',
    });
    expect(within(dialog).getByText('Added 1 template.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Add 10:12:15' })).toBeNull();
    const row = rowsOf(dialog)[0];
    expect(within(row).getByText('in your templates')).toBeInTheDocument();
    // it is an ordinary template in the Edit templates list
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit templates' }));
    const editor = await screen.findByRole('dialog', { name: 'Chord templates' });
    expect(within(editor).getByDisplayValue('Minor Triad')).toBeInTheDocument();
    expect(within(editor).getAllByDisplayValue('Minor').length).toBeGreaterThan(0);
  });

  it('Add all 3 on the Minor Triad shape adds the three rows and says so', async () => {
    mount([without('10:12:15')]);
    const dialog = await openLibrary();
    search(dialog, 'minor triad');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add all 3 of 10:12:15' }));
    expect(lab.state.templates.slice(-3).map((t) => t.text)).toEqual([
      '10:12:15',
      '12:15:20',
      '15:20:24',
    ]);
    const msg = within(dialog).getByText('Added 3 templates.');
    expect(msg).toHaveAttribute('data-kind', 'note');
    // every row is in the list now: Add all is replaced by the muted text
    expect(within(dialog).queryByRole('button', { name: 'Add all 3 of 10:12:15' })).toBeNull();
  });

  it('a duplicate is refused with the sentence in the error style, nothing is added', async () => {
    mount();
    const dialog = await openLibrary();
    search(dialog, 'major triad');
    const before = lab.state.templates;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add all 3 of 4:5:6' }));
    const msg = within(dialog).getByText('Same notes as 4:5:6 already in your templates.');
    expect(msg).toHaveAttribute('data-kind', 'err');
    expect(lab.state.templates).toBe(before);
  });

  it('with one free place, Add all 3 is refused as a whole', async () => {
    const fill = Array.from({ length: MAX_TEMPLATES - 1 }, (_, i) => ({
      text: `${1000 + i}:${1001 + i}`,
    }));
    mount([{ type: 'templates/set', templates: fill }]);
    const dialog = await openLibrary();
    search(dialog, 'minor triad');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add all 3 of 10:12:15' }));
    const msg = within(dialog).getByText('Needs 3 free places; you have 1.');
    expect(msg).toHaveAttribute('data-kind', 'err');
    expect(lab.state.templates).toHaveLength(MAX_TEMPLATES - 1);
  });
});

describe('Check', () => {
  it('Minor Triad on the 5-limit major scale: 2 found at tolerance 0, 3 found with the worst error at 25 c; templates untouched', async () => {
    mount(major5());
    const dialog = await openLibrary();
    search(dialog, 'minor triad');
    fireEvent.click(head(dialog, '10:12:15 Minor Triad'));
    const before = lab.state.templates;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check 10:12:15' }));
    expect(within(dialog).getByTestId('check-line')).toHaveTextContent(/^2 found: on 5\/4, 5\/3$/);
    send({ type: 'ui', patch: { tol: 25 } });
    expect(within(dialog).getByTestId('check-line')).toHaveTextContent(
      /^3 found: on 9\/8, 5\/4, 5\/3 \(worst 21\.5 c\)$/
    );
    expect(lab.state.templates).toBe(before);
    // the subset changes too: without 5/4 the Minor Triad has nothing left on 5/4 or 5/3
    send({ type: 'ui', patch: { tol: 0 } }, { type: 'sel/toggle', i: 2 });
    expect(within(dialog).getByTestId('check-line')).toHaveTextContent('none found');
  });

  it('Check on a shape heading checks every entry and opens the shape', async () => {
    mount(major5());
    const dialog = await openLibrary();
    search(dialog, 'minor triad');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check all 3 of 10:12:15' }));
    expect(head(dialog, '10:12:15 Minor Triad')).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getAllByTestId('check-line')).toHaveLength(3);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear checks (3)' }));
    expect(within(dialog).queryAllByTestId('check-line')).toHaveLength(0);
  });

  it('Check is disabled for a subset of 1 note and above 128 notes, with the usual hint', async () => {
    mount([...major5(), { type: 'sel/none' }, { type: 'sel/toggle', i: 0 }]);
    const dialog = await openLibrary();
    search(dialog, 'Triad');
    const hint = 'Chords are found for a subset of 2 to 128 notes. Select a few more notes.';
    expect(within(dialog).getByText(hint)).toBeInTheDocument();
    fireEvent.click(head(dialog, '10:12:15 Minor Triad'));
    const check = within(dialog).getByRole('button', { name: 'Check 10:12:15' });
    expect(check).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(check);
    expect(within(dialog).queryByTestId('check-line')).toBeNull();
    // too many notes: 130 field notes, all selected
    const many = Array.from({ length: 129 }, (_, i) => `${1001 + i}/1000`).join('\n');
    send({ type: 'gen/custom', custom: many, rep: '2/1' }, { type: 'sel/all' });
    // the hint shows in the dialog's status line, and again where the ring panel's roots table would be (a chord is shown now)
    expect(
      within(dialog)
        .getAllByText(hint)
        .some((el) => el.getAttribute('role') === 'status')
    ).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Check 10:12:15' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    // and back to a good subset: Check works again
    send(...major5());
    expect(within(dialog).queryByText(hint)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check 10:12:15' }));
    expect(within(dialog).getByTestId('check-line')).toHaveTextContent('2 found');
  });
});

describe('search and filters', () => {
  it('odd limit up to 9 with exactly 4 notes keeps the 18 entries of the scenario', async () => {
    mount();
    const dialog = await openLibrary();
    const num = (name: string, v: string) =>
      fireEvent.change(within(dialog).getByRole('textbox', { name }), { target: { value: v } });
    num('Cardinality min', '4');
    num('Cardinality max', '4');
    num('Odd limit up to', '9');
    expect(matched(dialog)).toBe(18);
    // a heading says how many of its entries match
    expect(textOf(headRow(head(dialog, '4:5:6:7 Harmonic Dominant Seventh')))).toMatch(
      /· 4 entries · \d entries? match/
    );
  });

  it('the Family select keeps the entries of one family', async () => {
    mount();
    const dialog = await openLibrary();
    const select = within(dialog).getByRole('combobox', { name: 'Family' });
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options[0]).toBe('All (376)');
    expect(options).toHaveLength(1 + 19);
    expect(options.at(-1)).toMatch(/^Library \(/);
    const hendrix = libraryEntries(1200).filter((e) => e.family === 'Hendrix chords');
    expect(options).toContain(`Hendrix chords (${hendrix.length})`);
    fireEvent.change(select, { target: { value: 'Hendrix chords' } });
    expect(matched(dialog)).toBe(hendrix.length);
  });

  it('the search matches a ratio as well as a name', async () => {
    mount();
    const dialog = await openLibrary();
    search(dialog, '10:12:15');
    expect(head(dialog, '10:12:15 Minor Triad')).toBeInTheDocument();
  });
});
