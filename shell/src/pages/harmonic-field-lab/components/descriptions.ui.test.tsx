/**
 * M5b: the descriptions UI. The shelf card (second line, notepad, one tooltip order), the preset Edit row, the line under the
 * breadcrumb, the browser info line and search, New folder, folder rename and delete. jsdom applies no CSS module, so a layout
 * rule is checked in the CSS source (the same way ChordCard.test.tsx checks `nowrap`); what the card looks like on screen is
 * for the human to judge.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ratioNote, sketchPitches } from '../../../lib/harmonic-field';
import { emptyShelf, stashChord } from '../state/chordShelf';
import { LAB_DEVELOPER_KEY, resetDeveloperOptionsCache } from '../state/developerOptions';
import { createFolder, describeFolder } from '../state/folderRecords';
import { genFromPreset, presetByName } from '../state/generate';
import { emptyLibrary, saveUserPreset, type GenLibrary } from '../state/generatorLibrary';
import { LabProvider } from '../state/LabProvider';
import { libraryToStored } from '../state/libraryStore';
import { KEY_CHORDSHELF, KEY_GENERATORS } from '../state/persist';
import { shelfToStored } from '../state/shelfStore';
import { LibraryActions } from './LibraryBar';
import { PresetBrowser, PresetCrumb } from './PresetBrowser';
import { ShelfPanel } from './ShelfPanel';

const NBSP = String.fromCharCode(0xa0);
const plain = (s: string | null | undefined) => (s ?? '').replaceAll(NBSP, ' ');
const css = (file: string) => readFileSync(join(__dirname, file), 'utf8');
const rule = (source: string, selector: string) =>
  new RegExp(`${selector.replace(/[[\]().]/g, '\\$&')} \\{[^}]*\\}`).exec(source)?.[0] ?? '';

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

beforeEach(() => {
  // jsdom has no `document.fonts`, which Mantine's autosizing Textarea listens to (every browser has it)
  if (!('fonts' in document)) {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { addEventListener: () => undefined, removeEventListener: () => undefined },
    });
  }
  window.localStorage.clear();
  window.localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify({ tooltipDelay: 0 }));
  resetDeveloperOptionsCache();
});
afterEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});

/* ------------------------------------------------------------------------------------------------ the shelf card */
const stashed = (names: string[]) => {
  let sh = emptyShelf();
  for (const name of names) {
    sh = stashChord(sh, {
      name,
      pitches: sketchPitches(ratioNote(1, 1), '4:5:6')!,
      template: '4:5:6',
      rootDeg: 0,
      tol: 18,
      date: '',
      refHz: 261.6256,
      frame: 'parallel',
      parent: null,
      source: null,
    });
  }
  return sh;
};
const storedChords = () =>
  (
    JSON.parse(window.localStorage.getItem(KEY_CHORDSHELF) ?? '{}') as {
      chords?: { name: string; description?: string }[];
    }
  ).chords ?? [];
const cards = () => screen.getAllByTestId('slot-card');

function renderShelf(names: string[]) {
  window.localStorage.setItem(KEY_CHORDSHELF, JSON.stringify(shelfToStored(stashed(names))));
  return render(
    <LabProvider>
      <ShelfPanel />
    </LabProvider>
  );
}

describe('shelf card description', () => {
  it('adds, cancels, edits in place and removes a description; the stored slot has the field only while it is set', () => {
    renderShelf(['A', 'B']);
    // scenario 2: no description anywhere: no extra row, no data-desc
    for (const c of cards()) {
      expect(within(c).queryByTestId('card-description')).toBeNull();
      expect(c.querySelector('[data-desc]')).toBeNull();
    }
    // the notepad opens the box on the card's second line
    fireEvent.click(screen.getByRole('button', { name: 'Add a description to A' }));
    const box = screen.getByRole('textbox', { name: 'Description of A' });
    expect(within(cards()[0]).getByTestId('card-description')).toContainElement(box);
    // Escape cancels: nothing stored, the row goes away again
    fireEvent.change(box, { target: { value: 'never kept' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Description of A' })).toBeNull();
    expect(within(cards()[0]).queryByTestId('card-description')).toBeNull();
    // Enter keeps (scenario 1)
    fireEvent.click(screen.getByRole('button', { name: 'Add a description to A' }));
    const box2 = screen.getByRole('textbox', { name: 'Description of A' });
    fireEvent.change(box2, { target: { value: '  bright cadence   chord ' } });
    fireEvent.keyDown(box2, { key: 'Enter' });
    expect(within(cards()[0]).getByTestId('card-description')).toHaveTextContent(
      'bright cadence chord'
    );
    // only the first card got one
    expect(within(cards()[1]).queryByTestId('card-description')).toBeNull();
    expect(storedChords().map((c) => c.description)).toEqual(['bright cadence chord', undefined]);
    expect('description' in storedChords()[1]).toBe(false);
    // the notepad now says Edit (its accent state is the data-has attribute)
    const pad = screen.getByRole('button', { name: 'Edit the description of A' });
    expect(pad).toHaveAttribute('data-has', 'true');
    // clicking the description line itself edits it; leaving the box keeps the text
    fireEvent.click(within(cards()[0]).getByRole('button', { name: 'bright cadence chord' }));
    const box3 = screen.getByRole('textbox', { name: 'Description of A' });
    expect(box3).toHaveValue('bright cadence chord');
    fireEvent.change(box3, { target: { value: 'darker' } });
    fireEvent.blur(box3);
    expect(storedChords()[0].description).toBe('darker');
    // empty removes it (scenario 3): the field is gone from the stored slot, the row is gone from the card
    fireEvent.click(screen.getByRole('button', { name: 'Edit the description of A' }));
    const box4 = screen.getByRole('textbox', { name: 'Description of A' });
    fireEvent.change(box4, { target: { value: '   ' } });
    fireEvent.keyDown(box4, { key: 'Enter' });
    expect('description' in storedChords()[0]).toBe(false);
    expect(within(cards()[0]).queryByTestId('card-description')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a description to A' })).not.toHaveAttribute(
      'data-has'
    );
  });

  it('a description of 400 characters is cut at 300 on save; the box takes at most 300', () => {
    renderShelf(['A']);
    fireEvent.click(screen.getByRole('button', { name: 'Add a description to A' }));
    const box = screen.getByRole('textbox', { name: 'Description of A' });
    expect(box).toHaveAttribute('maxlength', '300');
    fireEvent.change(box, { target: { value: 'x'.repeat(400) } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(storedChords()[0].description).toHaveLength(300);
  });

  it('the buttons are two rows: up, down (with the select box) over description, copy, trash', () => {
    renderShelf(['A']);
    const rows = [...cards()[0].querySelectorAll('[class*="cardActionRow"]')];
    expect(rows).toHaveLength(2);
    const names = (row: Element) =>
      [...row.querySelectorAll('button, input')].map(
        (b) => b.getAttribute('aria-label') ?? b.textContent
      );
    expect(names(rows[0])).toEqual(['Select A', 'Move A up', 'Move A down']);
    expect(names(rows[1])).toEqual(['Add a description to A', 'Reload A as a new tab', 'Delete A']);
  });

  it('the line is one line cut with an ellipsis, and its grid item can shrink (CSS source: jsdom applies no CSS module)', () => {
    const panels = css('panels.module.css');
    const desc = rule(panels, '.cardDesc');
    for (const decl of [
      'overflow: hidden',
      'text-overflow: ellipsis',
      'white-space: nowrap',
      'min-width: 0',
      'grid-area: desc',
    ]) {
      expect(desc, decl).toContain(decl);
    }
    const line = rule(css('description.module.css'), '.line');
    for (const decl of ['overflow: hidden', 'text-overflow: ellipsis', 'white-space: nowrap']) {
      expect(line, decl).toContain(decl);
    }
    // a described shelf card has the description as its second row: name, description, subtitle (stat spans them), pitches, steps
    expect(panels).toContain("'ring desc stat'");
    expect(panels).not.toContain("'ring desc desc stat'");
    // the tooltip's description is the one line that may wrap; its siblings keep nowrap
    expect(rule(panels, '.hintDesc')).toContain('white-space: normal');
    expect(rule(panels, '.hintNote')).toContain('white-space: nowrap');
    expect(rule(panels, '.hintLine')).toContain('white-space: nowrap');
  });

  it('a shelf card stacks name, description, subtitle, pitches, steps one per row at EVERY width (CSS source); chip cards keep their wide layout', () => {
    const panels = css('panels.module.css');
    // the stacked layout: the shelf card's own rule (outside any container query)
    const stacked = rule(panels, '.card[data-static]');
    expect(stacked).toContain("'ring title stat'");
    expect(stacked).toContain("'ring subtitle stat'");
    expect(stacked).toContain("'ring pitches pitches'");
    expect(stacked).toContain("'ring steps steps'");
    expect(rule(panels, '.card[data-static][data-desc]')).toContain("'ring desc stat'");
    // the wide (container query) block never selects a shelf card: every .card rule in it excludes data-static
    const start = panels.indexOf('@container (min-width: 30rem)');
    const end = panels.indexOf('.patHead {');
    expect(start).toBeGreaterThan(0);
    const wide = panels.slice(start, end);
    expect(wide).not.toMatch(/\.card\[data-static\]/);
    const selectors = [...wide.matchAll(/^\s+(\.card[^{]*)\{/gm)].map((m) => m[1].trim());
    expect(selectors.length).toBeGreaterThanOrEqual(4);
    for (const sel of selectors) {
      expect(sel, sel).toContain(':not([data-static])');
    }
    // a chip (non-shelf) card keeps its two-row wide layout
    expect(wide).toContain("'ring title pitches stat'");
  });

  it('the card tooltip reads Title, description, subtitle, Pitches:, Steps: (a card with no description has no description line)', async () => {
    renderShelf(['A', 'B']);
    fireEvent.click(screen.getByRole('button', { name: 'Add a description to A' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Description of A' }), {
      target: { value: 'bright cadence chord' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Description of A' }), { key: 'Enter' });

    fireEvent.mouseEnter(within(cards()[0]).getByTestId('card-pitches'));
    await wait(50);
    const tip = screen.getAllByRole('tooltip').at(-1) as HTMLElement;
    const text = plain(tip.textContent);
    let from = 0;
    for (const s of ['A', 'bright cadence chord', '4:5:6 on 1/1 · 3 notes', 'Pitches:', 'Steps:']) {
      const i = text.indexOf(s, from);
      expect(i, `${s} after position ${from} in "${text}"`).toBeGreaterThanOrEqual(0);
      from = i + s.length;
    }
    expect(text.startsWith('A')).toBe(true);
    // the same order in the DOM, one block per line
    const lines = [
      tip.querySelector('[data-testid="hint-description"]'),
      tip.querySelector('[data-testid="hint-subtitle"]'),
      ...tip.querySelectorAll('[class*="hintLine"]'),
    ];
    expect(lines.map((l) => plain(l?.textContent))).toEqual([
      'bright cadence chord',
      '4:5:6 on 1/1 · 3 notes',
      expect.stringMatching(/^Pitches:/),
      expect.stringMatching(/^Steps:/),
    ]);

    // the second card: no description, so no description line (Title, subtitle, Pitches:, Steps:)
    fireEvent.mouseLeave(within(cards()[0]).getByTestId('card-pitches'));
    fireEvent.mouseEnter(within(cards()[1]).getByTestId('card-steps'));
    await wait(50);
    const tip2 = screen.getAllByRole('tooltip').at(-1) as HTMLElement;
    expect(tip2.querySelector('[data-testid="hint-description"]')).toBeNull();
    expect(plain(tip2.textContent).startsWith('B4:5:6 on 1/1 · 3 notes')).toBe(true);
  });
});

/* ------------------------------------------------------------------------------- presets, folders and the browser */
const H = genFromPreset(presetByName('Harmonics 8–15')!);
const withPreset = (lib: GenLibrary, name: string, folder: string, description?: string) =>
  saveUserPreset(lib, { name, folder, description, gen: { ...H, preset: '' } }).lib;
const seed = (lib: GenLibrary) =>
  window.localStorage.setItem(KEY_GENERATORS, JSON.stringify(libraryToStored(lib)));
const storedLib = () =>
  JSON.parse(window.localStorage.getItem(KEY_GENERATORS) ?? '{}') as {
    presets?: { name: string; folder: string; description?: string }[];
    folders?: { path: string; description?: string }[];
  };

function renderBrowser() {
  return render(
    <LabProvider>
      <PresetBrowser />
      <PresetCrumb />
    </LabProvider>
  );
}
const trigger = () => screen.getByRole('button', { name: /^Preset:/ });
const search = () => screen.getByRole('combobox', { name: 'Search presets' });
const openBrowser = () => {
  if (!screen.queryByRole('combobox', { name: 'Search presets' })) {
    fireEvent.click(trigger());
  }
  return search();
};
const searchFor = (q: string) => fireEvent.change(openBrowser(), { target: { value: q } });
const results = () =>
  within(screen.getByRole('listbox', { name: 'Preset search results' })).queryAllByRole('option');
const rowOf = (label: RegExp | string) =>
  results().find((r) =>
    typeof label === 'string' ? r.textContent?.startsWith(label) : label.test(r.textContent ?? '')
  ) as HTMLElement;
const infoLine = () => document.querySelector('[class*="pbInfo"]') as HTMLElement;

describe('preset and folder descriptions', () => {
  it('the preset Edit row has a Description box: saved, found by search, shown in the info line (scenario 4)', () => {
    seed(withPreset(emptyLibrary(), 'Seven-limit pool', 'Pools/Seven'));
    renderBrowser();
    searchFor('seven');
    fireEvent.click(screen.getByRole('button', { name: 'Edit preset Seven-limit pool' }));
    const box = screen.getByRole('textbox', { name: 'Preset description' });
    expect(box).toHaveAttribute('maxlength', '300');
    fireEvent.change(box, { target: { value: 'ratios up to 7 over 1/1' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(storedLib().presets?.[0].description).toBe('ratios up to 7 over 1/1');
    // the name and folder are untouched
    expect(storedLib().presets?.[0]).toMatchObject({
      name: 'Seven-limit pool',
      folder: 'Pools/Seven',
    });
    // search finds the preset by its description, and the info line shows it when the row is active
    searchFor('over 1/1');
    expect(results().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Seven-limit pool'),
    ]);
    fireEvent.mouseEnter(rowOf('Seven-limit pool'));
    expect(infoLine()).toHaveTextContent('ratios up to 7 over 1/1');
  });

  it('the line under the breadcrumb: a faint prompt, edited in place, Escape cancels, empty removes; a built-in preset shows its note read-only', () => {
    seed(withPreset(emptyLibrary(), 'Seven-limit pool', 'Pools/Seven'));
    renderBrowser();
    // a built-in preset (the default tab): its fixed note, nothing to click
    const builtin = screen.getByTestId('preset-description');
    expect(builtin.textContent?.length).toBeGreaterThan(0);
    expect(within(builtin).queryByRole('button')).toBeNull();
    // open the user preset
    searchFor('seven');
    fireEvent.click(rowOf('Seven-limit pool'));
    const line = () => screen.getByTestId('preset-description');
    expect(line()).toHaveTextContent('Add a description');
    fireEvent.click(within(line()).getByRole('button'));
    const box = screen.getByRole('textbox', { name: 'Description of Seven-limit pool' });
    fireEvent.change(box, { target: { value: 'dropped' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(line()).toHaveTextContent('Add a description');
    expect(storedLib().presets?.[0].description).toBeUndefined();
    // Enter keeps it
    fireEvent.click(within(line()).getByRole('button'));
    const box2 = screen.getByRole('textbox', { name: 'Description of Seven-limit pool' });
    fireEvent.change(box2, { target: { value: 'ratios up to 7' } });
    fireEvent.keyDown(box2, { key: 'Enter' });
    expect(line()).toHaveTextContent('ratios up to 7');
    expect(storedLib().presets?.[0].description).toBe('ratios up to 7');
    // empty removes it: the prompt is back and the stored field is gone
    fireEvent.click(within(line()).getByRole('button'));
    const box3 = screen.getByRole('textbox', { name: 'Description of Seven-limit pool' });
    fireEvent.change(box3, { target: { value: '' } });
    fireEvent.blur(box3);
    expect(line()).toHaveTextContent('Add a description');
    expect('description' in (storedLib().presets?.[0] ?? {})).toBe(false);
  });

  it('New folder appears at once with count 0 and is stored; a taken name is refused inline (scenario 5)', () => {
    renderBrowser();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const name = screen.getByRole('textbox', { name: 'New folder name' });
    fireEvent.change(name, { target: { value: 'Drones' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(storedLib().folders).toEqual([{ path: 'Drones' }]);
    const row = screen.getByRole('treeitem', { name: /Drones/ });
    expect(row).toHaveAttribute('aria-level', '2');
    expect(within(row).getByText('0')).toBeInTheDocument();
    // the form closed; making it again is refused with the reducer's sentence, inline
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const again = screen.getByRole('textbox', { name: 'New folder name' });
    fireEvent.change(again, { target: { value: 'Drones' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain(
      'A folder named Drones already exists.'
    );
    expect(storedLib().folders).toEqual([{ path: 'Drones' }]);
    // a built-in name is refused too
    fireEvent.change(again, { target: { value: 'Equal divisions' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent(/built-in/);
  });

  it('a folder row: edit gives it a description (info line, search); delete asks first and names what goes with the folder', () => {
    let lib = createFolder(emptyLibrary(), 'Drones').lib;
    lib = withPreset(lib, 'Pedal', 'Pools/Seven');
    seed(lib);
    renderBrowser();
    // built-in folders have no edit or delete
    openBrowser();
    expect(screen.queryByRole('button', { name: /^Edit folder Built-in/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete folder Built-in/ })).toBeNull();
    // Pools and Seven hold a preset: delete is NOT dimmed; it asks first, naming what goes, and Keep changes nothing
    searchFor('pools');
    const busy = screen.getByRole('button', { name: 'Delete folder Seven' });
    expect(busy).not.toHaveAttribute('aria-disabled');
    fireEvent.click(busy);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Delete Pools/Seven, its 1 preset? Subsets stay under Auto-saved.'
    );
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(storedLib().folders).toEqual([{ path: 'Drones' }]);
    expect(storedLib().presets).toHaveLength(1);
    // the top folder counts what is below it (1 preset, 1 folder)
    fireEvent.click(screen.getByRole('button', { name: 'Delete folder Pools' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Delete Pools, its 1 preset and 1 folder? Subsets stay under Auto-saved.'
    );
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Keep' }));
    // describe Drones (scenario 6)
    searchFor('drones');
    fireEvent.click(screen.getByRole('button', { name: 'Edit folder Drones' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Folder description' }), {
      target: { value: 'pedal tones' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(storedLib().folders).toEqual([{ path: 'Drones', description: 'pedal tones' }]);
    searchFor('pedal');
    const hits = results().map((r) => r.textContent ?? '');
    expect(hits.some((t) => t.startsWith('Drones'))).toBe(true);
    fireEvent.mouseEnter(rowOf('Drones'));
    expect(infoLine()).toHaveTextContent('pedal tones');
    // Drones is empty: the question is just Delete Drones?; confirming removes the folder and its record (scenario 9)
    searchFor('drones');
    fireEvent.click(screen.getByRole('button', { name: 'Delete folder Drones' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/^Delete Drones\?/);
    expect(screen.getByRole('alert').textContent).not.toContain('Subsets');
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Delete' }));
    expect(storedLib().folders).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Delete folder Drones' })).toBeNull();
    // the preset folder goes with what is inside (Pools: Pedal, Seven), the other folder is untouched
    searchFor('pools');
    fireEvent.click(screen.getByRole('button', { name: 'Delete folder Pools' }));
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Delete' }));
    expect(storedLib().presets ?? []).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Delete folder Pools' })).toBeNull();
  });

  it('rename: the presets stay inside and keep their descriptions; a name that exists is refused under the row', () => {
    let lib = describeFolder(createFolder(emptyLibrary(), 'Drones').lib, 'Drones', 'low notes').lib;
    lib = withPreset(lib, 'Pedal', 'Drones', 'keep me');
    lib = withPreset(lib, 'Other', 'Pools');
    seed(lib);
    renderBrowser();
    searchFor('drones');
    // refused: Pools already exists (implied by a preset)
    fireEvent.click(screen.getByRole('button', { name: 'Edit folder Drones' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Folder name' }), {
      target: { value: 'Pools' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain(
      'A folder named Pools already exists.'
    );
    expect(storedLib().folders?.map((f) => f.path)).toEqual(['Drones']);
    // renamed: the preset's folder text, the record and both descriptions follow
    fireEvent.click(screen.getByRole('button', { name: 'Edit folder Drones' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Folder name' }), {
      target: { value: 'Pedal tones' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(storedLib().folders).toEqual([{ path: 'Pedal tones', description: 'low notes' }]);
    const pedal = storedLib().presets?.find((p) => p.name === 'Pedal');
    expect(pedal).toMatchObject({ folder: 'Pedal tones', description: 'keep me' });
    expect(screen.queryAllByText('A folder named Pools already exists.')).toHaveLength(0);
  });

  describe('the Folder box suggests every folder, the typed match on top', () => {
    const renderBar = () => {
      let lib = createFolder(emptyLibrary(), 'Drones').lib;
      lib = createFolder(lib, 'Sevenths').lib;
      seed(withPreset(lib, 'P', 'Pools/Seven'));
      render(
        <LabProvider>
          <LibraryActions />
        </LabProvider>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save as new' }));
      return screen.getByRole('combobox', { name: 'Folder' });
    };
    const options = () => screen.queryAllByRole('option').map((o) => o.textContent);

    it('a folder that exists only as a record is offered; an empty box lists all in the normal order', () => {
      const box = renderBar();
      expect(options()).toEqual([]); // the list opens when the box is used
      fireEvent.focus(box);
      expect(options()).toEqual(['Drones', 'Pools', 'Pools/Seven', 'Sevenths']);
    });

    it('typed Pools/Seven puts it first and still lists the other folders beneath it', () => {
      const box = renderBar();
      fireEvent.focus(box);
      fireEvent.change(box, { target: { value: 'Pools/Seven' } });
      expect(options()).toEqual(['Pools/Seven', 'Drones', 'Pools', 'Sevenths']);
    });

    it('typed seven (contains) puts the matching folders first (starts with, then contains), the rest below', () => {
      const box = renderBar();
      fireEvent.focus(box);
      fireEvent.change(box, { target: { value: 'seven' } });
      expect(options()).toEqual(['Sevenths', 'Pools/Seven', 'Drones', 'Pools']);
    });

    it('the box stays free text: a path that is no folder is kept and every folder is still listed; a click takes a folder', () => {
      const box = renderBar();
      fireEvent.focus(box);
      fireEvent.change(box, { target: { value: 'Brand/New' } });
      expect(box).toHaveValue('Brand/New');
      expect(options()).toEqual(['Drones', 'Pools', 'Pools/Seven', 'Sevenths']);
      fireEvent.click(screen.getByRole('option', { name: 'Pools' }));
      expect(box).toHaveValue('Pools');
      expect(options()).toEqual([]); // taking one closes the list
    });

    it('arrow keys and Enter take a folder; Enter with none highlighted still saves', () => {
      const box = renderBar();
      fireEvent.focus(box);
      fireEvent.keyDown(box, { key: 'ArrowDown' });
      fireEvent.keyDown(box, { key: 'ArrowDown' });
      fireEvent.keyDown(box, { key: 'Enter' });
      expect(box).toHaveValue('Pools');
      // not highlighted: Enter is the save (a new preset in the typed folder)
      fireEvent.change(box, { target: { value: 'Typed/Here' } });
      fireEvent.keyDown(box, { key: 'Enter' });
      expect(storedLib().presets?.map((p) => p.folder)).toContain('Typed/Here');
    });
  });

  it('the preset Edit row uses the same Folder box (an ordered list, nothing filtered)', () => {
    seed(withPreset(withPreset(emptyLibrary(), 'P', 'Pools/Seven'), 'Q', 'Drones'));
    renderBrowser();
    searchFor('Q');
    fireEvent.click(screen.getByRole('button', { name: 'Edit preset Q' }));
    const box = screen.getByRole('combobox', { name: 'Folder' });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'drones' } });
    const folders = within(screen.getByRole('listbox', { name: 'Folders' }));
    expect(folders.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Drones',
      'Pools',
      'Pools/Seven',
    ]);
  });
});

/* ----------------------------------------------------------------------- the line under the breadcrumb: four lines */
describe('preset description under the breadcrumb: up to four lines', () => {
  it('the text clamps at 4 lines with an ellipsis (CSS source); the shelf card description stays one line', () => {
    const desc = css('description.module.css');
    const clamp = rule(desc, '.clamp');
    for (const decl of [
      'display: -webkit-box',
      '-webkit-box-orient: vertical',
      '-webkit-line-clamp: 4',
      'overflow: hidden',
    ]) {
      expect(clamp, decl).toContain(decl);
    }
    // a built-in preset's note is clamped the same way
    const stat = rule(desc, '.static');
    for (const decl of ['display: -webkit-box', '-webkit-line-clamp: 4', 'overflow: hidden']) {
      expect(stat, decl).toContain(decl);
    }
    expect(stat).not.toContain('nowrap');
    // the button that holds a multi-line text may wrap (the one-line .line keeps nowrap, checked above)
    expect(rule(desc, '.line[data-lines]')).toContain('white-space: normal');
    expect(rule(css('panels.module.css'), '.cardDesc')).toContain('white-space: nowrap');
  });

  it('under the breadcrumb the text is the 4-line kind and its edit box is a multi-line field; the shelf card box is one line', () => {
    seed(withPreset(emptyLibrary(), 'Seven-limit pool', 'Pools/Seven', 'x '.repeat(80)));
    renderBrowser();
    searchFor('seven');
    fireEvent.click(rowOf('Seven-limit pool'));
    const line = within(screen.getByTestId('preset-description')).getByRole('button');
    expect(line).toHaveAttribute('data-lines', '4');
    fireEvent.click(line);
    const box = screen.getByRole('textbox', { name: 'Description of Seven-limit pool' });
    expect(box.tagName).toBe('TEXTAREA');
    expect(box).toHaveAttribute('maxlength', '300');
    // Enter keeps (no line break is typed), Escape cancels, leaving keeps, empty removes
    fireEvent.change(box, { target: { value: 'first line   second' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(storedLib().presets?.[0].description).toBe('first line second');
    expect(screen.queryByRole('textbox', { name: /Description of/ })).toBeNull();
    fireEvent.click(within(screen.getByTestId('preset-description')).getByRole('button'));
    const box2 = screen.getByRole('textbox', { name: 'Description of Seven-limit pool' });
    fireEvent.change(box2, { target: { value: 'dropped' } });
    fireEvent.keyDown(box2, { key: 'Escape' });
    expect(storedLib().presets?.[0].description).toBe('first line second');
    fireEvent.click(within(screen.getByTestId('preset-description')).getByRole('button'));
    const box3 = screen.getByRole('textbox', { name: 'Description of Seven-limit pool' });
    fireEvent.change(box3, { target: { value: 'kept by leaving' } });
    fireEvent.blur(box3);
    expect(storedLib().presets?.[0].description).toBe('kept by leaving');
    fireEvent.click(within(screen.getByTestId('preset-description')).getByRole('button'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Description of Seven-limit pool' }), {
      target: { value: '' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Description of Seven-limit pool' }));
    expect('description' in (storedLib().presets?.[0] ?? {})).toBe(false);
  });

  it('the shelf card description keeps its one-line box', () => {
    renderShelf(['A']);
    fireEvent.click(screen.getByRole('button', { name: 'Add a description to A' }));
    const box = screen.getByRole('textbox', { name: 'Description of A' });
    expect(box.tagName).toBe('INPUT');
    fireEvent.change(box, { target: { value: 'one line' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(within(cards()[0]).getByRole('button', { name: 'one line' })).not.toHaveAttribute(
      'data-lines'
    );
  });
});

/* ------------------------------------------------------------------------ rename the preset in the breadcrumb */
describe('the preset name at the end of the breadcrumb renames in place', () => {
  const twoPresets = () =>
    seed(
      withPreset(
        withPreset(emptyLibrary(), 'Seven-limit pool', 'Pools/Seven'),
        'Other',
        'Pools/Seven'
      )
    );
  const openFirst = () => {
    searchFor('seven-limit');
    fireEvent.click(rowOf('Seven-limit pool'));
  };

  it('a built-in preset name is not clickable', () => {
    renderBrowser();
    expect(
      within(screen.getByTestId('preset-path')).queryByRole('button', { name: /^Rename/ })
    ).toBeNull();
  });

  it('click, type, Enter renames (stored, shown in the path and on the Preset button); the click does not open the browser', () => {
    twoPresets();
    renderBrowser();
    openFirst();
    // the browser closed after picking; clicking the name must not bring it back
    expect(screen.queryByRole('combobox', { name: 'Search presets' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Seven-limit pool' }));
    expect(screen.queryByRole('combobox', { name: 'Search presets' })).toBeNull();
    const box = screen.getByRole('textbox', { name: 'Preset name' });
    expect(box).toHaveValue('Seven-limit pool');
    fireEvent.change(box, { target: { value: 'Seven bright' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(storedLib().presets?.[0].name).toBe('Seven bright');
    expect(screen.queryByRole('textbox', { name: 'Preset name' })).toBeNull();
    expect(screen.getByTestId('preset-path')).toHaveTextContent(
      'My presets > Pools > Seven > Seven bright'
    );
    expect(trigger()).toHaveAccessibleName(/Seven bright/);
  });

  it('Escape cancels; leaving keeps a good name', () => {
    twoPresets();
    renderBrowser();
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Seven-limit pool' }));
    const box = screen.getByRole('textbox', { name: 'Preset name' });
    fireEvent.change(box, { target: { value: 'dropped' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(storedLib().presets?.[0].name).toBe('Seven-limit pool');
    expect(screen.queryByRole('textbox', { name: 'Preset name' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Seven-limit pool' }));
    const box2 = screen.getByRole('textbox', { name: 'Preset name' });
    fireEvent.change(box2, { target: { value: 'Left alone' } });
    fireEvent.blur(box2);
    expect(storedLib().presets?.[0].name).toBe('Left alone');
  });

  it('an empty name and a name already taken in that folder are refused under the breadcrumb, the box stays open', () => {
    twoPresets();
    renderBrowser();
    openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Seven-limit pool' }));
    const box = screen.getByRole('textbox', { name: 'Preset name' });
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTestId('preset-rename-refusal')).toHaveTextContent(
      'Give the preset a name.'
    );
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'other' } });
    expect(screen.queryByTestId('preset-rename-refusal')).toBeNull();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTestId('preset-rename-refusal')).toHaveTextContent(
      'A preset named other already exists in Pools/Seven.'
    );
    expect(storedLib().presets?.map((p) => p.name)).toEqual(['Seven-limit pool', 'Other']);
    // a free name goes through and the message goes away
    fireEvent.change(box, { target: { value: 'Free name' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.queryByTestId('preset-rename-refusal')).toBeNull();
    expect(storedLib().presets?.[0].name).toBe('Free name');
  });
});

/* ------------------------------------------------------------------------------------- delete controls: danger hover */
describe('every delete or remove control carries the one shared danger-hover class', () => {
  const lab = css('lab.module.css');
  /** Every control whose accessible name starts with Delete, Remove or Confirm delete (the buttons' own text counts too). */
  const deleteControls = (root: ParentNode = document) =>
    [...root.querySelectorAll('button, [role="button"]')].filter((b) =>
      /^(Delete|Remove|Confirm delete)/.test(b.getAttribute('aria-label') ?? b.textContent ?? '')
    );
  const hasDanger = (el: Element) => /dangerHover/.test(el.getAttribute('class') ?? '');

  it('the rule lives in one place: danger color on hover and keyboard focus, never on a disabled control (CSS source)', () => {
    const block = /\.dangerHover:hover[^{]*\{[^}]*\}/.exec(lab)?.[0] ?? '';
    expect(block).toContain('.dangerHover:focus-visible');
    expect(block).toContain('color: var(--text-danger)');
    expect(block).toContain(":not([aria-disabled='true'])");
    expect(block).toContain(':not(:disabled)');
    expect(block).toContain(':not([data-disabled])');
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    // there is no second hover rule for a delete control anywhere else
    expect(lab.match(/dangerHover/g)?.length).toBeLessThanOrEqual(4);
  });

  it('the shelf: the chord trash, its Delete? confirm and Delete all (and its confirm)', () => {
    renderShelf(['A', 'B']);
    const before = deleteControls(document);
    expect(before.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Delete all chords',
      'Delete A',
      'Delete B',
    ]);
    expect(before.every(hasDanger)).toBe(true);
    // the confirm that replaces the trash
    fireEvent.click(screen.getByRole('button', { name: 'Delete A' }));
    const confirm = screen.getByRole('button', { name: 'Confirm delete A' });
    expect(hasDanger(confirm)).toBe(true);
    // Delete all, second click
    fireEvent.click(screen.getByRole('button', { name: 'Delete all chords' }));
    const all = screen.getByRole('button', { name: /^Confirm delete all/ });
    expect(hasDanger(all)).toBe(true);
  });

  it('the preset browser: preset x, its confirm Delete, folder x, its confirm Delete', () => {
    seed(withPreset(createFolder(emptyLibrary(), 'Drones').lib, 'Pedal', 'Pools/Seven'));
    renderBrowser();
    const list = () => screen.getByRole('listbox', { name: 'Preset search results' });
    const confirmButtons = () =>
      screen
        .getAllByRole('alert')
        .flatMap((a) => [...a.querySelectorAll('button')])
        .filter((b) => b.textContent === 'Delete');
    // the preset row: its x, then the confirm that replaces nothing but appears beside it
    searchFor('pedal');
    const preset = deleteControls(list()).filter((b) =>
      /Delete preset/.test(b.getAttribute('aria-label') ?? '')
    );
    expect(preset.map((b) => b.getAttribute('aria-label'))).toEqual(['Delete preset Pedal']);
    expect(preset.every(hasDanger)).toBe(true);
    fireEvent.click(preset[0]);
    expect(confirmButtons()).toHaveLength(1);
    expect(confirmButtons().every(hasDanger)).toBe(true);
    // the folder row: its x and its confirm
    searchFor('seven');
    const folder = deleteControls(list()).filter((b) =>
      /Delete folder/.test(b.getAttribute('aria-label') ?? '')
    );
    expect(folder.map((b) => b.getAttribute('aria-label'))).toEqual(['Delete folder Seven']);
    expect(folder.every(hasDanger)).toBe(true);
    fireEvent.click(folder[0]);
    const both = confirmButtons();
    expect(both.length).toBeGreaterThanOrEqual(1);
    expect(both.every(hasDanger)).toBe(true);
  });

  it('the library bar has no delete control of its own (its notice buttons only dismiss)', () => {
    render(
      <LabProvider>
        <LibraryActions />
      </LabProvider>
    );
    expect(deleteControls(document)).toEqual([]);
  });
});
