/**
 * M7b: the chord library dialog, rendered inside `LabProvider` with the Chords panel (not the whole page). jsdom applies no CSS
 * module, so what a test cannot prove here: that each sentence really stays on one line, how wide the rows and the filter row
 * are, what the dimmed rows and the tooltips look like, and how fast 313 headings feel in a browser. The CSS is checked by eye.
 */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHORD_LIBRARY_CREDIT,
  DEFAULT_TEMPLATES,
  FOLD_REASON,
  libraryEntries,
  libraryShapes,
} from '../../../lib/harmonic-field';
import type { Lab } from '../state/context';
import { LabProvider } from '../state/LabProvider';
import { MAX_TEMPLATES, type Action } from '../state/labState';
import { TIPS } from '../texts';
import { MAX_CHECKED } from './ChordLibrary';
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
  render(
    <LabProvider>
      <ChordsPanel />
      <Probe />
    </LabProvider>
  );
  if (setup.length) {
    send(...setup);
  }
}
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
const rowsOf = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('listitem')
    .filter((li) => li.className.includes('row'));
const textOf = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const without = (text: string) => ({
  type: 'templates/set' as const,
  templates: DEFAULT_TEMPLATES.filter((t) => t.text !== text).map((t) => ({ ...t })),
});
const matched = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll('button[aria-expanded]')].reduce((sum, b) => {
    const m = /(\d+) (?:entry matches|entries match)/.exec(textOf(b as HTMLElement));
    return sum + (m ? Number(m[1]) : 0);
  }, 0);

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
        "376 chords in 297 shapes (399 names in Scala's list); 16 cannot be found in this repeat"
      )
    ).toBeInTheDocument();
    // every shape starts collapsed: 313 headings, no rows
    expect(dialog.querySelectorAll('button[aria-expanded="false"]')).toHaveLength(313);
    expect(dialog.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(0);
    expect(rowsOf(dialog)).toHaveLength(0);
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
    expect(textOf(h)).toContain('· 4 entries');
    expect(textOf(h)).toContain('4 entries match');
    fireEvent.click(h);
    expect(h).toHaveAttribute('aria-expanded', 'true');
    const rows = within(
      within(dialog).getByRole('list', { name: 'Entries of 4:5:6:7' })
    ).getAllByRole('listitem');
    expect(rows.map((r) => textOf(r).split(' ')[0])).toEqual([
      '4:5:6:7',
      '5:6:7:8',
      '6:7:8:10',
      '7:8:10:12',
    ]);
    expect(textOf(rows[0])).toContain('Harmonic Dominant Seventh');
    expect(textOf(rows[1])).toContain('1st inversion');
    expect(textOf(rows[0])).toMatch(/4 notes · odd 7 · prime 7/);
  });

  it('a folding entry is dimmed with the reason and its Add and Check do nothing', async () => {
    mount([without('10:12:15')]);
    const dialog = await openLibrary();
    search(dialog, 'Triunisonus');
    fireEvent.click(head(dialog, '1:2:3 Triunisonus'));
    const row = rowsOf(dialog)[0];
    expect(row).toHaveAttribute('data-folds', 'true');
    expect(within(row).getByText(FOLD_REASON)).toBeInTheDocument();
    const add = within(row).getByRole('button', { name: 'Add 1:2:3' });
    const check = within(row).getByRole('button', { name: 'Check 1:2:3' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(check).toHaveAttribute('aria-disabled', 'true');
    const before = lab.state.templates;
    fireEvent.click(add);
    fireEvent.click(check);
    expect(lab.state.templates).toBe(before);
    expect(within(row).queryByTestId('check-line')).toBeNull();
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
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear checks' }));
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
    expect(within(dialog).getByText(hint)).toBeInTheDocument();
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

  it(`keeps at most ${MAX_CHECKED} rows checked: one more replaces the oldest`, async () => {
    mount(major5());
    const dialog = await openLibrary();
    const singles = libraryShapes(libraryEntries(1200), 1200)
      .filter((s) => s.entries.length === 1 && !s.entries[0].folds)
      .slice(0, MAX_CHECKED + 1)
      .map((s) => s.entries[0].text);
    expect(singles).toHaveLength(MAX_CHECKED + 1);
    // plain DOM queries: 313 headings make role queries very slow in jsdom
    for (const text of singles) {
      fireEvent.click(
        dialog.querySelector(`button[aria-label="Check all 1 of ${text}"]`) as HTMLElement
      );
    }
    expect(dialog.querySelectorAll('[data-testid="check-line"]')).toHaveLength(MAX_CHECKED);
    // the first one lost its line (its shape is open, its row has none), the last has one
    const rowOf = (text: string) =>
      [...dialog.querySelectorAll('li[data-folds]')].find(
        (r) => textOf(r as HTMLElement).split(' ')[0] === text
      ) as HTMLElement;
    expect(rowOf(singles[0]).querySelector('[data-testid="check-line"]')).toBeNull();
    expect(rowOf(singles[MAX_CHECKED]).querySelector('[data-testid="check-line"]')).not.toBeNull();
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
    expect(textOf(head(dialog, '4:5:6:7 Harmonic Dominant Seventh'))).toMatch(
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
