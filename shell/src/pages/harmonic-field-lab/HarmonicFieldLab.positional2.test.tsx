/** M9 step 2: the Sketch row's Positional group, stash provenance, send to composite, and the patterns editor. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset } from './testUtils';

vi.setConfig({ testTimeout: 15_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const down = (key: string) => fireEvent.keyDown(window, { key });
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const railTab = (name: RegExp) => within(rail()).getByRole('tab', { name });
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const noteDots = () => within(ring()).getAllByRole('button');
const sketch = () => screen.getByRole('group', { name: 'Sketch a chord' });
const template = () =>
  within(sketch()).getByRole<HTMLSelectElement>('combobox', { name: 'Sketch template' });
const rowBtn = (label: string) =>
  within(screen.getByRole('list', { name: 'Positional chords 2-2' })).getByRole('button', {
    name: new RegExp(`^${label},`),
  });
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SHELF_KEY = 'hrifa.harmonic-field-lab.chordshelf.v1';
const PATTERNS_KEY = 'hrifa.harmonic-field-lab.patterns.v1';

async function openC12() {
  render(<HarmonicFieldLabPage />);
  await pickPreset('12-EDO');
  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  MAJOR.forEach((i) => fireEvent.click(noteDots()[i]));
}

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

describe('Sketch row, Positional group', () => {
  it('picking a pattern makes the row positional (line, Play sketch, switch off); a ratio template clears it even when unchanged', async () => {
    vi.useFakeTimers();
    await openC12();
    expect(template().value).toBe('4:5:6');
    const groups = Array.from(template().querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toContain('Positional');
    fireEvent.change(template(), { target: { value: 'pos:2-2' } });
    expect(template().value).toBe('pos:2-2');
    expect(screen.getByTestId('sketch-line').textContent).toMatch(
      /^2-2 on 1 · 7 of 12-EDO · 400-300 c/
    );
    expect(within(sketch()).getByRole('radio', { name: 'Exact' })).toBeDisabled();
    expect(within(sketch()).getByText(/has no separate exact ratios/)).toBeTruthy();
    // Play sketch plays C E G (Parallel)
    const n = oscs().length;
    fireEvent.click(within(sketch()).getByRole('button', { name: 'Play sketch' }));
    advance(100);
    const h = oscs()
      .slice(n)
      .map(hz)
      .sort((a, b) => a - b);
    expect(h.map((x) => Math.round(cents(x, h[0])))).toEqual([0, 400, 700]);
    // stepping the root moves the positional chord
    fireEvent.click(within(sketch()).getByRole('button', { name: 'Next root degree' }));
    expect(screen.getByTestId('sketch-line').textContent).toMatch(
      /^2-2 on 2 · 7 of 12-EDO · 300-400 c/
    );
    // the ratio template that is already the row's text (4:5:6) still takes the row out of positional mode
    fireEvent.change(template(), { target: { value: '4:5:6' } });
    expect(template().value).toBe('4:5:6');
    expect(screen.queryByTestId('sketch-line')).toBeNull();
    expect(within(sketch()).getByRole('radio', { name: 'Exact' })).toBeEnabled();
  });
});

describe('stash provenance and send to composite', () => {
  it('a stash from a positional row stores the pattern; the slot shows it; the Stash button and = do the same', async () => {
    await openC12();
    fireEvent.click(screen.getByRole('button', { name: 'Stash 2-2 on 2 on the shelf' }));
    let stored = JSON.parse(window.localStorage.getItem(SHELF_KEY) ?? '{}') as {
      chords: { pattern?: string; template: string; pitches: { c: number }[]; rootDeg: number }[];
    };
    expect(stored.chords).toHaveLength(1);
    expect(stored.chords[0]).toMatchObject({ pattern: '2-2', template: '2-2 on 2', rootDeg: 1 });
    expect(stored.chords[0].pitches.map((p) => Math.round(p.c))).toEqual([200, 500, 900]);
    // the Sketch row and the = key stash the picked positional chord with its pattern too
    fireEvent.change(template(), { target: { value: 'pos:2-3' } });
    fireEvent.click(within(sketch()).getByRole('button', { name: 'Stash' }));
    down('=');
    stored = JSON.parse(window.localStorage.getItem(SHELF_KEY) ?? '{}');
    expect(stored.chords.map((c) => [c.pattern, c.template])).toEqual([
      ['2-2', '2-2 on 2'],
      ['2-3', '2-3 on 1'],
      ['2-3', '2-3 on 1'],
    ]);
    // the shelf slot line shows the pattern's display text
    fireEvent.click(railTab(/^Shelf/));
    const list = screen.getByRole('list', { name: 'Chord shelf' });
    expect(within(list).getAllByText(/3 notes · 2-2 on 2/).length).toBe(1);
    expect(within(list).getAllByText(/3 notes · 2-3 on 1/).length).toBe(2);
    // playing the slot arms its pattern in the Sketch row
    fireEvent.click(within(list).getByRole('button', { name: 'Play Chord 3' }));
    fireEvent.click(within(list).getByRole('button', { name: 'Play Chord 1' }));
    fireEvent.click(railTab(/^Chords/));
    expect(template().value).toBe('pos:2-2');
  });

  it('the - popup sends a positional row to a new composite as a chord', async () => {
    await openC12();
    const r = rowBtn('2-2 on 3');
    fireEvent.mouseEnter(r);
    down('-');
    expect(screen.getByRole('dialog', { name: /^Send to composite/ }).textContent).toMatch(
      /2-2 on 3/
    );
    down('0');
    fireEvent.mouseLeave(r);
    expect(railTab(/^Composites/)).toHaveTextContent('1 composite');
    fireEvent.click(railTab(/^Composites/));
    fireEvent.click(screen.getByRole('button', { name: 'Show the items of Composite 1' }));
    const items = screen.getByRole('list', { name: 'Items of Composite 1' });
    expect(within(items).getByText(/^chord · 3 notes$/)).toBeTruthy();
    expect(within(items).getByText('2-2 on 3')).toBeTruthy();
    expect(
      within(items).getByRole('button', { name: /^Remove 2-2 on 3 from Composite 1/ })
    ).toBeTruthy();
  });
});

describe('Positional patterns editor', () => {
  it('adds, refuses invalid and duplicate with a reason, edits, reorders, deletes and restores defaults; no write on mount', async () => {
    render(<HarmonicFieldLabPage />);
    expect(window.localStorage.getItem(PATTERNS_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit templates' }));
    const editor = () => within(screen.getByRole('group', { name: 'Positional patterns' }));
    const values = () =>
      editor()
        .getAllByRole<HTMLInputElement>('textbox')
        .filter((t) => /^Pattern \d+$/.test(t.getAttribute('aria-label') ?? ''))
        .map((t) => t.value);
    const DEFAULTS = ['2-2', '2-2-2', '2-2-2-2', '2-3', '3-2', '1-1', '3-3'];
    expect(values()).toEqual(DEFAULTS);
    const draft = () => editor().getByRole('textbox', { name: 'New pattern' });
    const add = () => fireEvent.click(editor().getByRole('button', { name: 'Add pattern' }));
    // valid
    fireEvent.change(draft(), { target: { value: '2-3-2' } });
    add();
    expect(values()).toEqual([...DEFAULTS, '2-3-2']);
    expect((draft() as HTMLInputElement).value).toBe('');
    expect(window.localStorage.getItem(PATTERNS_KEY)).toContain('2-3-2');
    // invalid: a visible reason, nothing added
    fireEvent.change(draft(), { target: { value: 'abc' } });
    add();
    expect(editor().getByRole('alert').textContent).toMatch(/"abc" is not a pattern/);
    expect(values()).toHaveLength(8);
    // duplicate
    fireEvent.change(draft(), { target: { value: '2-2' } });
    add();
    expect(editor().getByRole('alert').textContent).toMatch(/2-2 is already in the list/);
    expect(values()).toHaveLength(8);
    // edit in place (Enter keeps it)
    const first = editor().getByRole('textbox', { name: 'Pattern 1' });
    fireEvent.change(first, { target: { value: '1-2-1' } });
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(values()[0]).toBe('1-2-1');
    expect(screen.queryByRole('alert')).toBeNull();
    // reorder
    fireEvent.click(editor().getByRole('button', { name: 'Move pattern 3-3 up' }));
    expect(values().slice(5, 7)).toEqual(['3-3', '1-1']);
    // delete
    fireEvent.click(editor().getByRole('button', { name: 'Delete pattern 2-3-2' }));
    expect(values()).toHaveLength(7);
    // the Sketch group follows the list
    // (the dialog hides the panel from the accessibility tree, so look it up in the document)
    const sketchOpts = Array.from(
      document.querySelectorAll(
        'select[aria-label="Sketch template"] optgroup[label="Positional"] option'
      )
    ).map((o) => o.textContent);
    expect(sketchOpts).toContain('1-2-1');
    // Restore defaults
    fireEvent.click(editor().getByRole('button', { name: 'Restore defaults' }));
    expect(values()).toEqual(DEFAULTS);
  });
});
