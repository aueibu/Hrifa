import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { HarmonicFieldLabApp } from './HarmonicFieldLabApp';
import { makeTab, presetGen } from './state/labState';
import { KEY_SETTINGS, KEY_SUBSETS, KEY_TABS, saveSubsets } from './state/persist';

const stored = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown;
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const ringCount = () =>
  /(\d+) of (\d+) notes selected/.exec(ring().getAttribute('aria-label')!)!.slice(1).map(Number);
const dot = (name: RegExp) => within(ring()).getByRole('button', { name });
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
/** Let the typing pause long enough for a debounced field (120 ms) to commit. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 170));
  });
const typeSlow = async (el: HTMLElement, value: string) => {
  type(el, value);
  await settle();
};

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('live generation', () => {
  it('opens on Harmonics 8-15 with every note selected', () => {
    render(<HarmonicFieldLabPage />);
    expect(ringCount()).toEqual([8, 8]);
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue('Harmonics 8–15');
    expect(screen.getByRole('tab', { name: 'Harmonics 8–15' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('a preset rebuilds the field and selects everything', () => {
    render(<HarmonicFieldLabPage />);
    type(screen.getByRole('combobox', { name: 'Preset' }), '19-EDO');
    expect(ringCount()).toEqual([19, 19]);
    expect(screen.getByRole('tab', { name: '19-EDO' })).toBeInTheDocument();
  });

  it('method tabs and their parameters rebuild the field: the starting harmonic, then EDO divisions', async () => {
    render(<HarmonicFieldLabPage />);
    await typeSlow(screen.getByRole('textbox', { name: 'Starting harmonic' }), '16');
    expect(ringCount()[1]).toBe(16);
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue(''); // edited by hand
    fireEvent.click(screen.getByRole('radio', { name: 'EDO' }));
    expect(ringCount()).toEqual([12, 12]); // a new method selects everything
    await typeSlow(screen.getByRole('textbox', { name: 'Divisions' }), '7');
    // the selection follows its pitches (as in the prototype): only 1/1 is shared by 12-EDO and 7-EDO
    expect(ringCount()).toEqual([1, 7]);
    // the value can be cleared and retyped without the field snapping back
    const div = screen.getByRole('textbox', { name: 'Divisions' });
    await typeSlow(div, '');
    expect(div).toHaveValue('');
    await typeSlow(div, '5');
    expect(ringCount()[1]).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(ringCount()).toEqual([5, 5]);
  });

  it('the repeat interval and the prime filter (the gear) rebuild the field; a bad interval is shown inline, not thrown', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Field settings' }));
    const rep = await screen.findByRole('textbox', { name: /Repeat interval/ });
    await typeSlow(rep, '3/');
    expect(screen.getByRole('alert')).toHaveTextContent(/Repeat interval: cannot read "3\/"/);
    expect(ringCount()).toEqual([8, 8]); // the old field stays
    await typeSlow(rep, '3/1');
    expect(screen.queryByRole('alert')).toBeNull();
    const all3 = ringCount()[1];
    // 7 off: the notes with a factor of 7 go, the others stay
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Prime filter' })).getByRole('button', { name: '7' })
    );
    expect(ringCount()[1]).toBeLessThan(all3);
    const popover = within(screen.getByRole('group', { name: 'Prime filter' }).parentElement!);
    fireEvent.click(popover.getByRole('button', { name: 'None' }));
    expect(ringCount()[1]).toBe(2); // 1/1 and 2/1 (inside a 3/1 repeat)
    fireEvent.click(popover.getByRole('button', { name: 'All' }));
    expect(ringCount()[1]).toBeGreaterThan(1);
  });

  it('lattice axes and a bad generator: the message names the axis', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('radio', { name: 'Latt' }));
    const before = ringCount()[1];
    await typeSlow(screen.getByRole('textbox', { name: 'Axis 2 generator' }), 'zz');
    expect(screen.getByRole('alert')).toHaveTextContent(/Axis 2: cannot read the generator "zz"/);
    expect(ringCount()[1]).toBe(before);
    await typeSlow(screen.getByRole('textbox', { name: 'Axis 2 generator' }), '5/4');
    expect(screen.queryByRole('alert')).toBeNull();
    // a MOS chip sets the count of axis 1
    fireEvent.click(screen.getByRole('button', { name: 'Use 7 notes on axis 1' }));
    expect(screen.getByRole('textbox', { name: 'Axis 1 count' })).toHaveValue('7');
  });
});

describe('tabs', () => {
  it('adds, renames, switches and closes tuning tabs', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'New tuning' }));
    expect(screen.getAllByRole('tab', { name: /Harmonics 8–15/ })).toHaveLength(2);
    // the new tab is active; change it so the two differ
    type(screen.getByRole('combobox', { name: 'Preset' }), '19-EDO');
    const tabs = within(screen.getByRole('tablist', { name: 'Tunings' }));
    expect(tabs.getByRole('tab', { name: '19-EDO' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.doubleClick(tabs.getByRole('tab', { name: '19-EDO' }));
    const box = screen.getByRole('textbox', { name: /Rename tab/ });
    type(box, 'nineteen');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(tabs.getByRole('tab', { name: 'nineteen' })).toBeInTheDocument();
    // switching back brings the other collection (and its note count)
    fireEvent.click(tabs.getAllByRole('tab', { name: /Harmonics 8–15/ })[0]);
    expect(ringCount()).toEqual([8, 8]);
    // Escape cancels a rename
    fireEvent.doubleClick(tabs.getByRole('tab', { name: 'nineteen' }));
    const box2 = screen.getByRole('textbox', { name: /Rename tab/ });
    type(box2, 'discard');
    fireEvent.keyDown(box2, { key: 'Escape' });
    expect(tabs.queryByRole('tab', { name: 'discard' })).toBeNull();
    expect(tabs.getByRole('tab', { name: 'nineteen' })).toBeInTheDocument();
    // close it
    fireEvent.click(tabs.getByRole('button', { name: 'Close nineteen' }));
    expect(tabs.queryByRole('tab', { name: 'nineteen' })).toBeNull();
    expect(tabs.queryByRole('button', { name: /^Close/ })).toBeNull(); // the last tab has no close mark
  });

  it('Alt+2 switches to the second tab', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'New tuning' }));
    type(screen.getByRole('combobox', { name: 'Preset' }), '12-EDO');
    fireEvent.keyDown(document.body, { key: '1', altKey: true });
    expect(ringCount()).toEqual([8, 8]);
    fireEvent.keyDown(document.body, { key: '2', altKey: true });
    expect(ringCount()).toEqual([12, 12]);
  });
});

describe('live selection', () => {
  it('a plain click on a ring note toggles it and does not pin', () => {
    render(<HarmonicFieldLabPage />);
    expect(dot(/^5\/4/)).toHaveAccessibleName(/in subset/);
    fireEvent.click(dot(/^5\/4/));
    expect(dot(/^5\/4/)).not.toHaveAccessibleName(/in subset/);
    expect(ringCount()).toEqual([7, 8]);
    expect(screen.queryByText('pinned')).toBeNull();
    fireEvent.click(dot(/^5\/4/));
    expect(ringCount()).toEqual([8, 8]);
  });

  it('Alt+click (and Alt+Enter) pins a note without toggling it; the pinned label unpins', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(dot(/^5\/4/), { altKey: true });
    expect(ringCount()).toEqual([8, 8]);
    expect(screen.getByText('pinned')).toBeInTheDocument();
    expect(dot(/^5\/4/)).toHaveAccessibleName(/pinned/);
    // Alt+click again unpins
    fireEvent.click(dot(/^5\/4/), { altKey: true });
    expect(screen.queryByText('pinned')).toBeNull();
    expect(ringCount()).toEqual([8, 8]);
    // keyboard: Enter toggles, Alt+Enter pins
    fireEvent.keyDown(dot(/^3\/2/), { key: 'Enter', altKey: true });
    expect(ringCount()).toEqual([8, 8]);
    expect(screen.getByText('pinned')).toBeInTheDocument();
    fireEvent.keyDown(dot(/^3\/2/), { key: 'Enter' });
    expect(ringCount()).toEqual([7, 8]);
    fireEvent.click(screen.getByRole('button', { name: 'Unpin this note' }));
    expect(screen.queryByText('pinned')).toBeNull();
  });

  it('Alt+click pins from the strip and the field table too, and never toggles', () => {
    render(<HarmonicFieldLabPage />);
    const strip = screen.getByRole('region', { name: 'Tuner strip' });
    fireEvent.click(within(strip).getByRole('button', { name: /^3\/2/ }), { altKey: true });
    expect(ringCount()).toEqual([8, 8]);
    expect(screen.getByText('pinned')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Field notes' });
    fireEvent.click(within(table).getByText('7/4').closest('tr')!, { altKey: true });
    expect(ringCount()).toEqual([8, 8]);
    expect(within(table).getByText('7/4').closest('tr')).toHaveAttribute('data-pin', 'true');
  });

  it('strip and field table clicks toggle too; the full table checkbox does as well', async () => {
    render(<HarmonicFieldLabPage />);
    const strip = screen.getByRole('region', { name: 'Tuner strip' });
    fireEvent.click(within(strip).getByRole('button', { name: /^3\/2/ }));
    expect(ringCount()).toEqual([7, 8]);
    const table = screen.getByRole('table', { name: 'Field notes' });
    fireEvent.click(within(table).getByText('7/4').closest('tr')!);
    expect(ringCount()).toEqual([6, 8]);
    fireEvent.click(screen.getByRole('button', { name: 'Open full table' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Include 3/2' }));
    expect(ringCount()).toEqual([7, 8]);
    expect(within(dialog).getByRole('checkbox', { name: 'Include 3/2' })).toBeChecked();
  });

  it('All, None and Invert, and the mode stepper', () => {
    render(<HarmonicFieldLabPage />);
    const bar = within(screen.getByRole('group', { name: 'Note selection' }));
    fireEvent.click(bar.getByRole('button', { name: 'None' }));
    expect(ringCount()).toEqual([0, 8]);
    fireEvent.click(dot(/^1\/1/));
    fireEvent.click(dot(/^5\/4/));
    fireEvent.click(dot(/^3\/2/));
    fireEvent.click(bar.getByRole('button', { name: 'Invert' }));
    expect(ringCount()).toEqual([5, 8]);
    fireEvent.click(bar.getByRole('button', { name: 'All' }));
    expect(ringCount()).toEqual([8, 8]);
    expect(bar.getByText('mode')).toBeInTheDocument();
    fireEvent.click(bar.getByRole('button', { name: 'Next mode' }));
    expect(bar.getByText(/9\/8/)).toBeInTheDocument();
    fireEvent.click(bar.getByRole('button', { name: 'Previous mode' }));
    fireEvent.click(bar.getByRole('button', { name: 'Previous mode' }));
    expect(bar.getByText(/15\/8/)).toBeInTheDocument();
  });

  it('odd-limit Select and nearest-scale Select (m-ED and a library scale)', () => {
    render(<HarmonicFieldLabPage />);
    const bar = within(screen.getByRole('group', { name: 'Note selection' }));
    // the odd limit is an entry of the scale menu; it shows its own number box and the one Select applies it
    expect(bar.queryByRole('textbox', { name: 'Max odd limit' })).toBeNull();
    type(bar.getByRole('combobox', { name: 'Scale to match' }), 'odd');
    type(bar.getByRole('textbox', { name: 'Max odd limit' }), '5');
    fireEvent.click(bar.getByRole('button', { name: 'Select' }));
    expect(ringCount()).toEqual([3, 8]);
    expect(screen.getByRole('status')).toHaveTextContent(/Picked 3 notes with odd limit 5/);
    // nearest 3 equal divisions of the octave
    type(bar.getByRole('combobox', { name: 'Scale to match' }), 'ed');
    type(bar.getByRole('textbox', { name: 'Equal divisions' }), '4');
    fireEvent.click(bar.getAllByRole('button', { name: 'Select' })[0]);
    expect(ringCount()).toEqual([4, 8]);
    expect(screen.getByRole('status')).toHaveTextContent(/Picked 4 notes/);
    // a library scale of 7 notes in an 8-note field: the message reports the result
    type(bar.getByRole('combobox', { name: 'Scale to match' }), 'w:Ionian (major)');
    fireEvent.click(bar.getAllByRole('button', { name: 'Select' })[0]);
    expect(screen.getByRole('status')).toHaveTextContent(/Picked 7 notes: max ±/);
    expect(ringCount()).toEqual([7, 8]);
  });

  it('the Fifths ring takes its generator from the ring menu; a bad generator is flagged and 3/2 is used', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('radio', { name: 'Fifths' }));
    expect(dot(/^5\/4/)).toHaveAccessibleName(/step 4/);
    fireEvent.click(screen.getByRole('button', { name: 'Ring menu' }));
    const gen = await screen.findByRole('textbox', { name: /Generator/ });
    type(gen, 'junk');
    expect(screen.getByText(/Cannot read this interval; using 3\/2/)).toBeInTheDocument();
    expect(dot(/^5\/4/)).toHaveAccessibleName(/step 4/);
    type(gen, '4/3');
    expect(dot(/^5\/4/)).toHaveAccessibleName(/step -4/);
  });

  it('the strip compares to JI with an odd limit, to m-EDO, and to a picked scale once there is one', async () => {
    render(<HarmonicFieldLabPage />);
    const strip = screen.getByRole('region', { name: 'Tuner strip' });
    const compare = within(strip).getByRole('combobox', { name: 'Compare to' });
    expect(
      within(strip).getByRole('button', { name: /^5\/4, -13.7 cents from M3/ })
    ).toBeInTheDocument();
    type(compare, 'ji');
    await typeSlow(within(strip).getByRole('textbox', { name: 'Odd limit' }), '5');
    expect(
      within(strip).getByRole('button', { name: /^5\/4, 0.0 cents from 5\/4/ })
    ).toBeInTheDocument();
    type(compare, 'medo');
    await typeSlow(within(strip).getByRole('textbox', { name: 'Divisions of the repeat' }), '19');
    expect(screen.getByTestId('strip-plot')).toHaveAttribute(
      'title',
      expect.stringContaining('19-EDO')
    );
    expect(within(compare).getByRole('option', { name: 'Picked scale' })).toBeDisabled();
    const bar = within(screen.getByRole('group', { name: 'Note selection' }));
    type(bar.getByRole('combobox', { name: 'Scale to match' }), 'w:Ionian (major)');
    fireEvent.click(bar.getAllByRole('button', { name: 'Select' })[0]);
    expect(compare).toHaveValue('picked');
    expect(screen.getByTestId('strip-plot')).toHaveAttribute(
      'title',
      expect.stringContaining('Ionian')
    );
  });

  it('stats, shape, step sizes and the compact field table follow the selection', () => {
    render(<HarmonicFieldLabPage />);
    const notes = () => screen.getByText('Notes').closest('div')!;
    expect(notes()).toHaveTextContent('8/8');
    fireEvent.click(dot(/^11\/8/));
    expect(notes()).toHaveTextContent('7/8');
    const table = screen.getByRole('table', { name: 'Field notes' });
    expect(within(table).getAllByRole('img', { name: 'in subset' })).toHaveLength(7);
    expect(within(table).getAllByRole('img', { name: 'not in subset' })).toHaveLength(1);
    expect(screen.getByText('Prime limit').closest('div')).toHaveTextContent('13');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(notes()).toHaveTextContent('0/8');
    expect(screen.getByText('Prime limit').closest('div')).toHaveTextContent('–');
  });
});

describe('saved subsets', () => {
  const save = async (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Save current subset' }));
    type(await screen.findByRole('textbox', { name: 'Subset name' }), name);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  };
  const list = () => screen.getByRole('list', { name: 'Saved subsets list' });

  it('saves with a name, previews on hover, loads on click, renames and deletes; the list is stored', async () => {
    render(<HarmonicFieldLabPage />);
    expect(within(list()).getByText(/Nothing saved yet/)).toBeInTheDocument();
    fireEvent.click(dot(/^11\/8/));
    fireEvent.click(dot(/^13\/8/));
    await save('No 11 or 13');
    const row = within(list()).getByRole('button', { name: /^No 11 or 13: 6 notes/ });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(stored(KEY_SUBSETS)).toHaveLength(1);
    // change the selection; the saved row is no longer the loaded one, hover previews it on the ring
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(row).toHaveAttribute('aria-pressed', 'false');
    fireEvent.mouseEnter(row);
    expect(ringCount()).toEqual([6, 8]);
    fireEvent.mouseLeave(row);
    expect(ringCount()).toEqual([8, 8]);
    fireEvent.click(row);
    expect(ringCount()).toEqual([6, 8]);
    expect(row).toHaveAttribute('aria-pressed', 'true');
    // rename
    fireEvent.click(within(list()).getByRole('button', { name: 'Rename No 11 or 13' }));
    const nm = await screen.findByRole('textbox', { name: 'New name' });
    type(nm, 'Quiet');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(within(list()).getByRole('button', { name: /^Quiet: 6 notes/ })).toBeInTheDocument();
    expect((stored(KEY_SUBSETS) as { name: string }[])[0].name).toBe('Quiet');
    // delete
    fireEvent.click(within(list()).getByRole('button', { name: 'Delete Quiet' }));
    expect(within(list()).getByText(/Nothing saved yet/)).toBeInTheDocument();
    expect(stored(KEY_SUBSETS)).toEqual([]);
  });

  it('shows only the current collection by default; All lists the others, and loading one switches the tab to it', async () => {
    render(<HarmonicFieldLabPage />);
    type(screen.getByRole('combobox', { name: 'Preset' }), '12-EDO');
    fireEvent.click(within(ring()).getAllByRole('button')[7]);
    await save('twelve');
    type(screen.getByRole('combobox', { name: 'Preset' }), 'Harmonics 8–15');
    expect(within(list()).getByText(/None for this collection/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'All' }));
    const other = within(list()).getByRole('button', { name: /^twelve: .*another collection/ });
    fireEvent.click(other);
    expect(ringCount()[1]).toBe(12);
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue('12-EDO');
  });

  it('exports the current subset as a .scl download', () => {
    const blobs: Blob[] = [];
    const urlApi = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const prev = [urlApi.createObjectURL, urlApi.revokeObjectURL];
    urlApi.createObjectURL = (b: Blob) => {
      blobs.push(b);
      return 'blob:test';
    };
    urlApi.revokeObjectURL = () => undefined;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    try {
      render(<HarmonicFieldLabPage />);
      fireEvent.click(screen.getByRole('button', { name: 'None' }));
      fireEvent.click(dot(/^1\/1/));
      fireEvent.click(dot(/^5\/4/));
      fireEvent.click(dot(/^3\/2/));
      fireEvent.click(screen.getByRole('button', { name: 'Export .scl' }));
      expect(click).toHaveBeenCalledTimes(1);
      expect(blobs).toHaveLength(1);
      return blobs[0].text().then((t) => {
        expect(t).toContain('3\n');
        expect(t).toMatch(/ 5\/4\n 3\/2\n 2\/1\n$/);
      });
    } finally {
      [urlApi.createObjectURL, urlApi.revokeObjectURL] = prev;
      click.mockRestore();
    }
  });

  it('export is disabled with nothing selected', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(screen.getByRole('button', { name: 'Export .scl' })).toBeDisabled();
  });
});

describe('persistence through the page', () => {
  it('remembers tabs, the subset, tolerance, panel and dock across a reload', () => {
    const first = render(<HarmonicFieldLabPage />);
    type(screen.getByRole('combobox', { name: 'Preset' }), '19-EDO');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    fireEvent.click(dot(/^1\/1/));
    fireEvent.click(within(rail()).getByRole('tab', { name: /Keys & Modes/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Keyboard$/, expanded: true }));
    first.unmount();
    expect(stored(KEY_TABS)).toMatchObject({
      active: 0,
      list: [{ snap: { gen: 'edo', edoN: 19 } }],
    });
    expect((stored(KEY_SETTINGS) as { panel: string; dockOpen: boolean }).panel).toBe('keys');
    render(<HarmonicFieldLabPage />);
    expect(ringCount()).toEqual([1, 19]);
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue('19-EDO');
    expect(screen.getByRole('heading', { name: /Keys & Modes/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Subset keys' })).toBeNull();
  });

  it('does not write defaults over stored data before restoring it', () => {
    const snap = { gen: 'edo', rep: '2/1', edoN: 31, selCents: [0], mode: 0 };
    window.localStorage.setItem(
      KEY_TABS,
      JSON.stringify({ active: 0, list: [{ id: 't1', name: 'mine', snap }] })
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<HarmonicFieldLabPage />);
    expect(ringCount()).toEqual([1, 31]);
    const tabWrites = setItem.mock.calls
      .filter((c) => c[0] === KEY_TABS)
      .map((c) => JSON.parse(c[1]) as { list: { name: string; snap: { edoN: number } }[] });
    // nothing is written on mount: the stored tab is exactly as it was
    expect(tabWrites).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem(KEY_TABS)!).list[0].name).toBe('mine');
    setItem.mockRestore();
  });

  it('opens on the defaults when the stored tabs are junk', () => {
    window.localStorage.setItem(KEY_TABS, '{"list":[1,2,3]}');
    window.localStorage.setItem(KEY_SETTINGS, '[]');
    render(<HarmonicFieldLabPage />);
    expect(ringCount()).toEqual([8, 8]);
  });
});

/* ------------------------------------------------------------------------------------------------- audio */
describe('sound', () => {
  let contexts: FakeCtx[] = [];
  const ctx = () => contexts[0];
  const oscs = () => contexts.flatMap((c) => c.oscs);
  const live = () => oscs().filter((o) => o.stopAt === null);
  const key = (k: string, type: 'keyDown' | 'keyUp' = 'keyDown') =>
    fireEvent[type](document.body, { key: k });
  const dockKey = (re: RegExp) =>
    within(screen.getByRole('group', { name: 'Subset keys' })).getByRole('button', { name: re });

  beforeEach(() => {
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
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('makes no AudioContext until a note is played, then holds a voice while a computer key is down', () => {
    render(<HarmonicFieldLabPage />);
    expect(contexts).toHaveLength(0);
    key('x'); // the second key: 9/8
    expect(contexts).toHaveLength(1);
    expect(live()).toHaveLength(1);
    expect(live()[0].frequency.events[0].v).toBeCloseTo(261.6256 * (9 / 8), 3);
    // holding does not retrigger
    fireEvent.keyDown(document.body, { key: 'x', repeat: true });
    expect(live()).toHaveLength(1);
    key('x', 'keyUp');
    expect(live()).toHaveLength(0);
  });

  it('everything sounding lights green in every view: ring, strip, dock, field table, lattice, dissonance', () => {
    render(<HarmonicFieldLabPage />);
    key('c'); // 5/4
    expect(dot(/^5\/4/)).toHaveAccessibleName(/sounding/);
    expect(dockKey(/^5\/4/)).toHaveAttribute('data-lit', 'true');
    expect(dockKey(/^5\/4/)).toHaveAttribute('aria-pressed', 'true');
    const strip = screen.getByRole('region', { name: 'Tuner strip' });
    expect(within(strip).getByRole('button', { name: /^5\/4/ })).toHaveAttribute(
      'data-lit',
      'true'
    );
    expect(within(strip).getByRole('button', { name: /^9\/8/ })).toHaveAttribute(
      'data-lit',
      'false'
    );
    const table = screen.getByRole('table', { name: 'Field notes' });
    expect(within(table).getByText('5/4').closest('tr')).toHaveAttribute('data-lit', 'true');
    // the lattice (Visualizer 1) and the dissonance curve (Visualizer 3) show it too
    fireEvent.click(within(rail()).getByRole('tab', { name: /Visualizer 1/ }));
    const panel = () => within(screen.getByRole('tabpanel'));
    expect(panel().getByRole('button', { name: /^5\/4.*sounding/ })).toBeInTheDocument();
    fireEvent.click(within(rail()).getByRole('tab', { name: /Visualizer 3/ }));
    expect(document.querySelectorAll('[class*="dissMark"][data-state="lit"]')).toHaveLength(1);
    key('c', 'keyUp');
    expect(document.querySelectorAll('[class*="dissMark"][data-state="lit"]')).toHaveLength(0);
    fireEvent.click(within(rail()).getByRole('tab', { name: /Visualizer 1/ }));
    expect(panel().queryByRole('button', { name: /^5\/4.*sounding/ })).toBeNull();
  });

  it('mouse: pressing a dock key sounds it until the pointer is released anywhere', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.pointerDown(dockKey(/^3\/2/), { button: 0 });
    expect(live()).toHaveLength(1);
    expect(dot(/^3\/2/)).toHaveAccessibleName(/sounding/);
    fireEvent.pointerUp(window);
    expect(live()).toHaveLength(0);
    expect(dot(/^3\/2/)).not.toHaveAccessibleName(/sounding/);
  });

  it('the last dock key is the repeat, one octave up (the root again)', () => {
    render(<HarmonicFieldLabPage />);
    const keys = within(screen.getByRole('group', { name: 'Subset keys' })).getAllByRole('button');
    expect(keys).toHaveLength(9);
    fireEvent.pointerDown(keys[8], { button: 0 });
    expect(live()[0].frequency.events[0].v).toBeCloseTo(523.2512, 3);
    fireEvent.pointerUp(window);
  });

  it('does not play while typing in a field', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Field settings' }));
    const rep = await screen.findByRole('textbox', { name: /Repeat interval/ });
    fireEvent.keyDown(rep, { key: 'z' });
    expect(contexts).toHaveLength(0);
  });

  it('no stuck notes: blur, a hidden tab, switching tabs, Stop and unmount all silence everything', () => {
    const view = render(<HarmonicFieldLabPage />);
    key('z');
    key('c');
    expect(live()).toHaveLength(2);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(live()).toHaveLength(0);
    expect(dot(/^1\/1/)).not.toHaveAccessibleName(/sounding/);
    // hidden tab
    key('z');
    expect(live()).toHaveLength(1);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(live()).toHaveLength(0);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    // another tab
    key('z');
    fireEvent.click(screen.getByRole('button', { name: 'New tuning' }));
    expect(live()).toHaveLength(0);
    // a key released after its voice was silenced does nothing odd
    key('z', 'keyUp');
    expect(live()).toHaveLength(0);
    // Stop
    key('v');
    key('b');
    expect(live()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(live()).toHaveLength(0);
    // unmount
    key('n');
    expect(live()).toHaveLength(1);
    view.unmount();
    expect(ctx().closed).toBe(true);
    expect(live()).toHaveLength(0);
  });

  it('Play scale schedules the notes and the repeat, lights each while it sounds, and ends dark', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'scale' }));
    expect(oscs()).toHaveLength(9);
    expect(dot(/^1\/1/)).not.toHaveAccessibleName(/sounding/);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(dot(/^1\/1/)).toHaveAccessibleName(/sounding/);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(dot(/^1\/1/)).not.toHaveAccessibleName(/sounding/);
    expect(dot(/^9\/8/)).toHaveAccessibleName(/sounding/);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(document.querySelectorAll('[aria-label*="sounding"]')).toHaveLength(0);
  });

  it('Play chord plays the highlighted chord (clicking a chord chip highlights and sounds it), else the whole subset', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'chord' }));
    expect(oscs()).toHaveLength(8); // nothing highlighted: the whole subset
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    const before = oscs().length;
    const chip =
      screen.getAllByRole('button', { name: /^major triad.*4:5:6|^4:5:6/i })[0] ??
      screen.getAllByRole('button', { name: /4:5:6/ })[0];
    fireEvent.click(chip);
    expect(oscs().length - before).toBe(3);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    // the chord's notes are outlined on the ring
    expect(ring().querySelectorAll('[data-chord="true"]')).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'chord' }));
    expect(oscs().length - before).toBe(6);
    // clicking again lets go of it
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('the Harmonic wave (7 partials) uses a periodic wave; the volume and 1/1 Hz settings are kept', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sound settings' }));
    type(await screen.findByRole('combobox', { name: 'Wave' }), 'harmonic');
    await typeSlow(screen.getByRole('textbox', { name: '1/1 Hz' }), '220');
    key('z');
    expect(ctx().waves).toHaveLength(1);
    expect(live()[0].wave).toBe(ctx().waves[0]);
    expect(live()[0].frequency.events[0].v).toBeCloseTo(220, 3);
    key('z', 'keyUp');
    expect((stored(KEY_SETTINGS) as { wave: string; baseHz: number }).wave).toBe('harmonic');
    expect((stored(KEY_SETTINGS) as { baseHz: number }).baseHz).toBe(220);
  });

  it('a key released with Shift held (the key name changed) does not stick: keys are matched by their physical code', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.keyDown(document.body, { key: ',', code: 'Comma' });
    expect(live()).toHaveLength(1);
    fireEvent.keyUp(document.body, { key: '<', code: 'Comma', shiftKey: true });
    expect(live()).toHaveLength(0);
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ' });
    fireEvent.keyUp(document.body, { key: 'Z', code: 'KeyZ', shiftKey: true });
    expect(live()).toHaveLength(0);
    // the other way round: pressed with Shift, released without
    fireEvent.keyDown(document.body, { key: 'X', code: 'KeyX', shiftKey: true });
    expect(live()).toHaveLength(1);
    fireEvent.keyUp(document.body, { key: 'x', code: 'KeyX' });
    expect(live()).toHaveLength(0);
  });

  it('unrelated re-renders do not touch the master volume (it is set only when it changes)', () => {
    render(<HarmonicFieldLabPage />);
    key('z');
    const master = ctx().gains[0].gain;
    const before = master.events.length;
    fireEvent.mouseEnter(dot(/^9\/8/));
    fireEvent.mouseLeave(dot(/^9\/8/));
    fireEvent.click(dot(/^13\/8/));
    expect(master.events).toHaveLength(before);
    key('z', 'keyUp');
  });

  it('the full field table has a play button for one note', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open full table' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Play 5/4' }));
    expect(oscs()).toHaveLength(1);
    expect(oscs()[0].frequency.events[0].v).toBeCloseTo(261.6256 * 1.25, 3);
  });
});

describe('typing, storage and other windows', () => {
  it('a typed repeat is rebuilt once typing pauses: "3/" followed at once by "3/2" never shows an error or rebuilds', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Field settings' }));
    const rep = await screen.findByRole('textbox', { name: /Repeat interval/ });
    type(rep, '3/');
    expect(screen.queryByRole('alert')).toBeNull(); // not committed yet
    type(rep, '3/2');
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(rep).toHaveValue('3/2');
    expect(screen.getByText(/repeat/).closest('span')).toHaveTextContent('3/2');
  });

  it('Enter commits at once, and so does leaving the field', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Field settings' }));
    const rep = await screen.findByRole('textbox', { name: /Repeat interval/ });
    type(rep, '3');
    fireEvent.keyDown(rep, { key: 'Enter' });
    expect(screen.getByText(/repeat/).closest('span')).toHaveTextContent('3/1');
    type(rep, '4');
    fireEvent.blur(rep);
    expect(screen.getByText(/repeat/).closest('span')).toHaveTextContent('4/1');
  });

  it('a number typed digit by digit commits once: 16 never passes through 1', async () => {
    render(<HarmonicFieldLabPage />);
    const h = screen.getByRole('textbox', { name: 'Starting harmonic' });
    type(h, '1');
    type(h, '16');
    expect(ringCount()[1]).toBe(8); // nothing yet
    await settle();
    expect(ringCount()[1]).toBe(16);
  });

  it('a tab restored with a broken repeat shows the message, keeps its stored selection, and gets it back when fixed', async () => {
    const snap = {
      gen: 'harmonic',
      h: 8,
      rep: '2/',
      selCents: [0, 386.3137138648, 701.9550008654],
      mode: 0,
    };
    window.localStorage.setItem(
      KEY_TABS,
      JSON.stringify({ active: 0, list: [{ id: 't1', name: null, snap }] })
    );
    render(<HarmonicFieldLabPage />);
    expect(ringCount()).toEqual([0, 0]);
    expect(screen.getByRole('alert')).toHaveTextContent(/Repeat interval/);
    fireEvent.click(screen.getByRole('button', { name: 'Field settings' }));
    await typeSlow(await screen.findByRole('textbox', { name: /Repeat interval/ }), '2/1');
    expect(ringCount()).toEqual([3, 8]);
    expect(
      (stored(KEY_TABS) as { list: { snap: { selCents: number[] } }[] }).list[0].snap.selCents
    ).toHaveLength(3);
  });

  it('subsets saved in another window arrive through the storage event, so this window cannot wipe them', async () => {
    render(<HarmonicFieldLabPage />);
    const here = makeTab('t1', presetGen());
    saveSubsets([
      { id: 's1', name: 'From the other window', gen: here.gen, selCents: [0, 701.955], mode: 0 },
    ]);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY_SUBSETS }));
    });
    const list = screen.getByRole('list', { name: 'Saved subsets list' });
    expect(
      within(list).getByRole('button', { name: /^From the other window: 2 notes/ })
    ).toBeInTheDocument();
    // saving here adds to it instead of replacing it
    fireEvent.click(screen.getByRole('button', { name: 'Save current subset' }));
    type(await screen.findByRole('textbox', { name: 'Subset name' }), 'mine');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      (stored(KEY_SUBSETS) as { name: string; id: string }[]).map((x) => [x.id, x.name])
    ).toEqual([
      ['s1', 'From the other window'],
      ['s2', 'mine'],
    ]);
  });

  it('says so when a subset cannot be stored (storage full or blocked)', async () => {
    render(<HarmonicFieldLabPage />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save current subset' }));
    type(await screen.findByRole('textbox', { name: 'Subset name' }), 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const list = screen.getByRole('list', { name: 'Saved subsets list' });
    expect(within(list).getByRole('alert')).toHaveTextContent(/Not stored/);
    // the subset itself is still there for this session
    expect(within(list).getByRole('button', { name: /^x: 8 notes/ })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('the frozen lab (embedding, tests)', () => {
  it('stores nothing and never creates an AudioContext', () => {
    let made = 0;
    class Spy extends FakeCtx {
      constructor() {
        super();
        made++;
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = Spy;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      render(<HarmonicFieldLabApp frozen />);
      fireEvent.keyDown(document.body, { key: 'z' });
      fireEvent.click(screen.getByRole('button', { name: 'scale' }));
      fireEvent.click(dot(/^5\/4/));
      expect(made).toBe(0);
      expect(setItem.mock.calls.map((c) => c[0])).toEqual([]);
    } finally {
      setItem.mockRestore();
      delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    }
  });
});
