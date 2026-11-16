/** M8c step 2: the right-click menu, the Composites panel (rename, items, Open as tab, delete) and the shelf's Add selected. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roughnessOf } from '../../lib/harmonic-field';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { addSubsetNamed, pickPreset, ungroupShapes } from './testUtils';

vi.setConfig({ testTimeout: 15_000 });

const down = (key: string) => fireEvent.keyDown(window, { key });
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const MAJORS = /^major triad 4:5:6 on /i;
const chips = () => screen.getAllByRole('button', { name: MAJORS });
const popup = () => screen.queryByRole('dialog', { name: /^Send to composite/ });
const tabs = () => within(screen.getByRole('tablist', { name: 'Tunings' })).getAllByRole('tab');
const header = () =>
  screen.getByText(
    (_, el) =>
      /paramNote/.test(el?.className ?? '') &&
      /Triads: composite, 3 notes/.test(el?.textContent ?? '')
  );
const railTab = (name: RegExp) => within(rail()).getByRole('tab', { name });

/** Send chip number `k` to a NEW composite with the keyboard path (hover, -, 0). */
function sendNew(k: number) {
  const c = chips()[k];
  fireEvent.mouseEnter(c);
  down('-');
  down('0');
  fireEvent.mouseLeave(c);
}

beforeEach(() => {
  window.localStorage.clear();
  ungroupShapes();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('right-click menu', () => {
  it('lists the three most recent composites, a divider, New composite and All composites; only on sources', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    [0, 1, 2, 3].forEach(sendNew);
    expect(popup()).toBeNull();
    const target = chips()[4];
    fireEvent.mouseEnter(target);
    // a source: the browser menu is replaced; elsewhere (no source under the pointer) it is left alone
    expect(fireEvent.contextMenu(target)).toBe(false);
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Send to composite/ }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Stash on shelf',
      'Send to composite›',
      '4 Composite 4',
      '3 Composite 3',
      '2 Composite 2',
      'New composite',
      'All composites›',
    ]);
    const divider = document.querySelector('.mantine-Menu-divider');
    expect(divider).not.toBeNull();
    expect(divider!.previousElementSibling).toBe(items[4]);
    expect(divider!.nextElementSibling).toBe(items[5]);
    // New composite makes composite 5 and sends the chord to it
    fireEvent.click(items[5]);
    fireEvent.mouseLeave(target);
    expect(railTab(/^Composites/)).toHaveTextContent('5 composites');
    expect(fireEvent.contextMenu(screen.getByRole('navigation', { name: 'Analysis panels' }))).toBe(
      true
    );
  });
});

describe('provenance and right-click', () => {
  it('a shelf chord stashed in a 3/1 (Bohlen-Pierce) tab keeps its generator, tab and repeat when sent from an octave tab', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('Bohlen–Pierce (13 ED 3/1)');
    const sketch = screen.getByRole('group', { name: 'Sketch a chord' });
    fireEvent.click(within(sketch).getByRole('button', { name: 'Stash' }));
    fireEvent.click(screen.getByRole('button', { name: 'New tuning' }));
    fireEvent.click(railTab(/^Shelf/));
    const slot = within(screen.getByRole('list', { name: 'Chord shelf' })).getAllByRole(
      'listitem'
    )[0];
    fireEvent.mouseEnter(slot);
    down('-');
    down('0');
    fireEvent.mouseLeave(slot);
    const raw = JSON.parse(window.localStorage.getItem('hrifa.harmonic-field-lab.composites.v1')!);
    const item = raw.composites[0].items[0];
    expect(item.rep.c).toBeCloseTo(1901.955, 2);
    expect(item.source.tab).toMatch(/Bohlen/);
    expect(item.source.gen.rep).toBe('3/1');
  });

  it('a merely focused ring note does not take the browser context menu; the mouse over it does', async () => {
    render(<HarmonicFieldLabPage />);
    const ring = screen.getByRole('group', { name: /^Pitch circle/ });
    const dotBtn = within(ring).getAllByRole('button')[1];
    act(() => dotBtn.focus());
    // right-click somewhere else: untouched
    expect(fireEvent.contextMenu(screen.getByRole('navigation', { name: 'Analysis panels' }))).toBe(
      true
    );
    // the pointer on a note: the send menu
    fireEvent.mouseOver(dotBtn);
    fireEvent.mouseEnter(dotBtn);
    expect(fireEvent.contextMenu(dotBtn)).toBe(false);
    expect(await screen.findByRole('menuitem', { name: /^Send to composite/ })).toBeInTheDocument();
  });
});

describe('Composites panel', () => {
  it('rename, items and remove, Open as tab (a NEW Composite tab, others untouched), delete with a confirm', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    expect(railTab(/^Composites/)).toHaveTextContent('0 composites');
    fireEvent.click(railTab(/^Composites/));
    expect(screen.getByText(/No composites yet/)).toBeInTheDocument();
    fireEvent.click(railTab(/^Chords/));
    sendNew(0);
    sendNew(1);
    fireEvent.click(railTab(/^Composites/));
    const panel = within(screen.getByRole('list', { name: 'Composites' }));
    expect(screen.getByTestId('composite-added')).toHaveTextContent(
      /^Added major triad on .* to Composite 2\.$/
    );
    // rename in place
    fireEvent.click(panel.getByRole('button', { name: 'Rename Composite 1' }));
    const box = screen.getByRole('textbox', { name: 'New name' });
    fireEvent.change(box, { target: { value: 'Triads' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(panel.getByRole('button', { name: 'Rename Triads' })).toBeInTheDocument();
    // items: the origin label, then remove
    fireEvent.click(panel.getByRole('button', { name: 'Show the items of Composite 2' }));
    const list = screen.getByRole('list', { name: 'Items of Composite 2' });
    expect(within(list).getByText(/^chord · 3 notes · major triad$/)).toBeInTheDocument();
    expect(within(list).getByText(/^Source: /)).toBeInTheDocument();
    fireEvent.click(
      within(list).getByRole('button', { name: /^Remove major triad on .* from Composite 2/ })
    );
    expect(screen.getByText(/Empty\. Point at a chord/)).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Open Composite 2 as a tab' })).toBeDisabled();
    // Open as tab: a NEW tab with the Composite method, the old tab keeps its field and name
    const before = tabs().map((t) => t.textContent);
    expect(before).toHaveLength(1);
    fireEvent.click(panel.getByRole('button', { name: 'Open Triads as a tab' }));
    expect(tabs()).toHaveLength(2);
    expect(tabs()[0].textContent).toBe(before[0]);
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radio', { name: 'Comp' })).toBeChecked();
    expect(header()).toBeInTheDocument();
    // delete asks twice
    fireEvent.click(panel.getByRole('button', { name: 'Delete Composite 2' }));
    expect(panel.getByRole('button', { name: 'Rename Composite 2' })).toBeInTheDocument();
    fireEvent.click(panel.getByRole('button', { name: 'Confirm delete Composite 2' }));
    expect(panel.queryByRole('button', { name: 'Rename Composite 2' })).toBeNull();
    expect(railTab(/^Composites/)).toHaveTextContent('1 composite');
    // the opened tab is a snapshot: it still shows its notes after the source composite changed
    expect(header()).toBeInTheDocument();
  });

  it('the shelf strip adds the ticked chords to a new composite', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    const stash = screen.getAllByRole('button', { name: /^Stash .* on the shelf/ });
    fireEvent.click(stash[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /^Stash .* on the shelf/ })[1]);
    fireEvent.click(railTab(/^Shelf/));
    const add = screen.getByRole('button', { name: 'Add selected to composite' });
    expect(add).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Chord 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Chord 2' }));
    expect(add).toBeEnabled();
    fireEvent.click(add);
    fireEvent.click(screen.getByRole('menuitem', { name: 'New composite' }));
    expect(railTab(/^Composites/)).toHaveTextContent('1 composite');
    fireEvent.click(railTab(/^Composites/));
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
    // again to the same composite: nothing is lost silently, both are reported as already there
    fireEvent.click(railTab(/^Shelf/));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected to composite' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^1 Composite 1/ }));
    expect(screen.getByText(/Nothing added: all 2 are already in Composite 1/)).toBeInTheDocument();
  });
});

describe('Composites panel: hover feeds the Live roughness view', () => {
  it('a composite row scores its whole merged gamut, an item its own pitches, leaving is idle', async () => {
    window.localStorage.setItem(
      'hrifa.harmonic-field-lab.layout.v1',
      JSON.stringify({ left: [['keys', 'chords', 'composites']], right: [['viz4']] })
    );
    window.innerWidth = 3840;
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    sendNew(0);
    const second = chips()[1];
    fireEvent.mouseEnter(second);
    down('-');
    down('1');
    fireEvent.mouseLeave(second);
    fireEvent.click(railTab(/^Composites/));
    const row = screen.getByRole('list', { name: 'Composites' }).querySelector('[data-composite]')!;
    const total = () => screen.getByTestId('live-total').textContent;
    const source = () => screen.getByTestId('live-roughness').getAttribute('data-source');
    const head = row.firstElementChild as HTMLElement;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /^Show the items of/ }));
    const items = [...row.querySelectorAll('[data-item]')] as HTMLElement[];
    expect(items).toHaveLength(2);
    const note = (c: number) => ({ m: null, c });
    const centsOfItem = (el: HTMLElement) =>
      (el.querySelector('[data-detail="cents"]')?.textContent ?? '')
        .replace(/ c$/, '')
        .split(',')
        .map((x) => Number(x.trim()));
    const first = centsOfItem(items[0]);
    const secondCents = centsOfItem(items[1]);
    const merged = [
      ...new Set([...first, ...secondCents].map((c) => Math.round(c * 10) / 10)),
    ].sort((a, b) => a - b);
    expect(source()).not.toBe('hover');
    const chevrons = () => within(head).queryAllByTestId('mode-root');
    expect(chevrons()).toHaveLength(0);
    fireEvent.mouseEnter(head);
    expect(chevrons()).toHaveLength(0); // the composite has no root
    expect(source()).toBe('hover');
    expect(total()).toBe(roughnessOf(merged.map(note)).toFixed(2));
    fireEvent.mouseLeave(head);
    fireEvent.mouseEnter(items[0]);
    expect(source()).toBe('hover');
    expect(total()).toBe(roughnessOf(first.map(note)).toFixed(2));
    expect(chevrons()).toHaveLength(1); // a chord item shows its root
    fireEvent.mouseLeave(items[0]);
    expect(chevrons()).toHaveLength(0);
    expect(source()).not.toBe('hover');
    window.innerWidth = 1024;
  });
});

describe('Composites panel: subset item root chevron', () => {
  it('a subset sent from a saved subset shows the chevron at its stored mode root', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    const dots = within(screen.getByRole('group', { name: /^Pitch circle/ })).getAllByRole(
      'button'
    );
    [0, 2, 4, 5, 7, 9, 11].forEach((i) => fireEvent.click(dots[i]));
    fireEvent.click(screen.getByRole('button', { name: 'Next mode' }));
    await addSubsetNamed('dorian');
    const srow = within(screen.getByRole('list', { name: 'Saved subsets list' })).getByRole(
      'button',
      { name: /^dorian/ }
    );
    fireEvent.mouseEnter(srow);
    down('-');
    down('0');
    fireEvent.mouseLeave(srow);
    fireEvent.click(railTab(/^Composites/));
    const row = screen.getByRole('list', { name: 'Composites' }).querySelector('[data-composite]')!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /^Show the items of/ }));
    const item = row.querySelector('[data-item]') as HTMLElement;
    const head = row.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(item);
    const chev = within(head).getAllByTestId('mode-root');
    expect(chev).toHaveLength(1);
    fireEvent.mouseLeave(item);
    expect(within(head).queryAllByTestId('mode-root')).toHaveLength(0);
  });
});
