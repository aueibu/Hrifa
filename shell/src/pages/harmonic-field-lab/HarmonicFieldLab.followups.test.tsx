/** M6 follow-ups through the page: Duplicate tab, CPS chords, Period, Shift-click chords, key rings, scale preview, lattice modes. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { KEY_SETTINGS, KEY_TABS } from './state/persist';

// whole-page renders are slow in jsdom; under a full parallel run some take over the 5 s default
vi.setConfig({ testTimeout: 15_000 });

const stored = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown;
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const count = () =>
  /(\d+) of (\d+) notes selected/.exec(ring().getAttribute('aria-label')!)!.slice(1).map(Number);
const dot = (name: RegExp) => within(ring()).getByRole('button', { name });
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const preset = (name: string) => type(screen.getByRole('combobox', { name: 'Preset' }), name);
const HEXANY = 'Hexany (1 3 5 7, choose 2)';
const modeText = () => screen.getByText(/mode/, { selector: 'span' });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
/** Frequencies of everything scheduled so far, in time order. */
const heard = () =>
  oscs()
    .slice()
    .sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0))
    .map((o) => Math.round((o.frequency.events[0].v ?? 0) * 10) / 10);

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

describe('Duplicate tab', () => {
  it('copies the selection into "<name> copy" after the tab, makes it active, and stores it', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(dot(/^9\/8/)); // 7 of 8
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate tab' }));
    const tabs = within(screen.getByRole('tablist', { name: 'Tunings' }));
    expect(tabs.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Harmonics 8–15',
      'Harmonics 8–15 copy',
    ]);
    expect(tabs.getByRole('tab', { name: 'Harmonics 8–15 copy' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(count()).toEqual([7, 8]);
    const raw = stored(KEY_TABS) as { active: number; list: { name: string | null }[] };
    expect(raw.active).toBe(1);
    expect(raw.list[1].name).toBe('Harmonics 8–15 copy');
    // the original keeps its own selection
    fireEvent.click(tabs.getByRole('tab', { name: 'Harmonics 8–15' }));
    expect(count()).toEqual([7, 8]);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(tabs.getByRole('tab', { name: 'Harmonics 8–15 copy' }));
    expect(count()).toEqual([7, 8]);
  });
});

describe('Period stat', () => {
  it('shows the repeat as a ratio with its cents', () => {
    render(<HarmonicFieldLabPage />);
    expect(screen.getByText('2/1 (1200.00 c)')).toBeInTheDocument();
    expect(document.querySelector('[data-tipk="period"]')).not.toBeNull();
  });
});

describe('Shift-click a chord chip', () => {
  it('makes the chord the subset, rooted on the chord root, and keeps no highlight', () => {
    render(<HarmonicFieldLabPage />);
    const chip = screen.getAllByRole('button', { name: /^major triad 4:5:6 on /i })[0];
    const root = /on (\S+): notes/.exec(chip.getAttribute('aria-label')!)![1];
    fireEvent.click(chip, { shiftKey: true });
    expect(count()).toEqual([3, 8]);
    expect(modeText()).toHaveTextContent(root);
    expect(oscs()).toHaveLength(0); // no sound on Shift-click
    expect(ring().querySelectorAll('[data-chord="true"]')).toHaveLength(0);
  });

  it('a plain click still plays and highlights', () => {
    render(<HarmonicFieldLabPage />);
    const chip = screen.getAllByRole('button', { name: /^major triad 4:5:6 on /i })[0];
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(oscs()).toHaveLength(3);
    expect(count()).toEqual([8, 8]);
  });
});

describe('CPS chord list', () => {
  const section = () => screen.getByRole('region', { name: 'Chords inside this CPS' });
  const otonal = () => within(section()).getByRole('group', { name: 'CPS otonal chords' });
  const utonal = () => within(section()).getByRole('group', { name: 'CPS utonal chords' });

  it('is shown for the CPS method only', () => {
    render(<HarmonicFieldLabPage />);
    expect(screen.queryByRole('region', { name: 'Chords inside this CPS' })).toBeNull();
    preset(HEXANY);
    expect(section()).toBeInTheDocument();
    preset('19-EDO');
    expect(screen.queryByRole('region', { name: 'Chords inside this CPS' })).toBeNull();
  });

  it('lists four otonal and four utonal chips named by their factors', () => {
    render(<HarmonicFieldLabPage />);
    preset(HEXANY);
    const chips = (g: HTMLElement) => within(g).getAllByRole('button', { name: /chord / });
    expect(chips(otonal())).toHaveLength(4);
    expect(chips(utonal())).toHaveLength(4);
    // factors 1 3 5 7: the notes sharing the factor 1 vary over 3, 5, 7
    expect(within(otonal()).getByRole('button', { name: /chord 3:5:7:/ })).toBeInTheDocument();
    expect(
      within(utonal()).getByRole('button', { name: /chord 1\/1:1\/3:1\/5:/ })
    ).toBeInTheDocument();
    expect(document.querySelector('[data-tipk="cpsChords"]')).not.toBeNull();
    expect(document.querySelector('[data-tipk="otonal"]')).not.toBeNull();
    expect(document.querySelector('[data-tipk="utonal"]')).not.toBeNull();
  });

  it('click plays and highlights (sticky, lit in the views); Shift-click makes it the subset', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    preset(HEXANY);
    const chip = within(otonal()).getByRole('button', { name: /chord 3:5:7:/ });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(oscs()).toHaveLength(3);
    expect(ring().querySelectorAll('[data-chord="true"]')).toHaveLength(3);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelectorAll('[aria-label*="sounding"]').length).toBeGreaterThanOrEqual(3);
    // click again clears the highlight
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(ring().querySelectorAll('[data-chord="true"]')).toHaveLength(0);
    // Shift-click: the three notes become the subset, with the lowest as root
    const other = within(utonal()).getAllByRole('button', { name: /chord / })[0];
    fireEvent.click(other, { shiftKey: true });
    expect(count()).toEqual([3, 6]);
    expect(modeText()).toHaveTextContent('1/1');
    expect(ring().querySelectorAll('[data-chord="true"]')).toHaveLength(0);
  });
});

describe('Keys & Modes: incomplete rings and the scale preview', () => {
  const openKeys = () => fireEvent.click(within(rail()).getByRole('tab', { name: /Keys/ }));
  const keyRing = (re: RegExp) =>
    within(screen.getByRole('list', { name: 'Keys' })).getByRole('button', { name: re });
  const pickTwo = () => {
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    fireEvent.click(dot(/^1\/1/));
    fireEvent.click(dot(/^5\/4/));
  };

  it('an incomplete ring selects the notes the field has of that key, and still shows as incomplete', () => {
    render(<HarmonicFieldLabPage />);
    pickTwo();
    openKeys();
    const ringBtn = keyRing(/^Key on 9\/8: 1 scale note/);
    expect(ringBtn).toBeEnabled();
    expect(ringBtn).toHaveAttribute('data-complete', 'false');
    expect(ringBtn).toHaveTextContent('−1');
    fireEvent.click(ringBtn);
    expect(count()).toEqual([1, 8]);
    expect(dot(/^9\/8/)).toHaveAccessibleName(/in subset/);
    expect(modeText()).toHaveTextContent('9/8');
    // complete keys keep their border marker
    expect(keyRing(/^Key on 1\/1: the whole scale fits/)).toHaveAttribute('data-complete', 'true');
  });

  it('Ctrl-click plays the key as a scale: Up, then Up-down once the setting is changed (and stored)', async () => {
    render(<HarmonicFieldLabPage />);
    pickTwo();
    openKeys();
    // key on 3/2: 3/2 15/8, then the root an octave up
    fireEvent.click(keyRing(/^Key on 3\/2: the whole scale fits/), { ctrlKey: true });
    expect(heard()).toEqual([392.4, 490.5, 784.9]);
    expect(count()).toEqual([2, 8]); // a preview does not change the subset
    act(() => {
      contexts.forEach((c) => c.advance(60));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sound settings' }));
    const up = await screen.findByRole('radio', { name: 'Up-down' });
    expect(screen.getByRole('radio', { name: 'Up' })).toBeChecked();
    fireEvent.click(up);
    expect((stored(KEY_SETTINGS) as { scalePreview: string }).scalePreview).toBe('updown');
    contexts.forEach((c) => (c.oscs.length = 0));
    fireEvent.click(keyRing(/^Key on 3\/2: the whole scale fits/), { ctrlKey: true });
    expect(heard()).toEqual([392.4, 490.5, 784.9, 490.5, 392.4]);
  });

  it('Play scale uses the same setting', async () => {
    window.localStorage.setItem(KEY_SETTINGS, JSON.stringify({ scalePreview: 'updown' }));
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'scale' }));
    expect(oscs()).toHaveLength(17); // 8 notes up, the repeat, 8 back down
  });
});

describe('Lattice axis modes', () => {
  const openLattice = () => fireEvent.click(within(rail()).getByRole('tab', { name: /Lattice/ }));
  const modeRadio = (n: string) =>
    within(screen.getByRole('radiogroup', { name: 'Lattice axis mode' })).getByRole('radio', {
      name: n,
    });
  const dimRadio = (n: string) =>
    within(screen.getByRole('radiogroup', { name: 'Lattice dimensions' })).getByRole('radio', {
      name: n,
    });
  const lattice = () => screen.getByRole('group', { name: /^Lattice of the field/ });

  it('Generators and Factors are disabled on a plain field, with a tooltip that says why', () => {
    render(<HarmonicFieldLabPage />);
    openLattice();
    expect(modeRadio('Primes')).toBeChecked();
    expect(modeRadio('Generators')).toBeDisabled();
    expect(modeRadio('Factors')).toBeDisabled();
    expect(document.querySelector('[data-tipk="latticeMode"]')).not.toBeNull();
  });

  it('a CPS offers Factors (not Generators): the star with an axis key, flat only, persisted', () => {
    render(<HarmonicFieldLabPage />);
    preset(HEXANY);
    openLattice();
    expect(modeRadio('Generators')).toBeDisabled();
    expect(modeRadio('Factors')).toBeEnabled();
    fireEvent.click(modeRadio('Factors'));
    expect((stored(KEY_SETTINGS) as { viz: { viz1: { latMode: string } } }).viz.viz1.latMode).toBe(
      'cps'
    );
    expect(lattice().getAttribute('aria-label')).toMatch(/CPS factors/);
    expect(within(lattice()).getAllByTestId('axis-key')).toHaveLength(4);
    expect(within(lattice()).getAllByRole('button')).toHaveLength(6);
    expect(dimRadio('3D')).toBeDisabled();
    expect(screen.queryByRole('combobox', { name: 'Lattice axes (primes)' })).toBeNull();
    expect(within(rail()).getByRole('tab', { name: /Lattice/ })).toHaveTextContent('2D factors');
    // back to primes
    fireEvent.click(modeRadio('Primes'));
    expect(lattice().getAttribute('aria-label')).toMatch(/prime exponents/);
    expect(dimRadio('3D')).toBeEnabled();
  });

  it('a lattice field offers Generators: the grid with one arrow per generator', () => {
    render(<HarmonicFieldLabPage />);
    preset('7-limit 3×3×3 box');
    openLattice();
    expect(modeRadio('Factors')).toBeDisabled();
    fireEvent.click(modeRadio('Generators'));
    expect(lattice().getAttribute('aria-label')).toMatch(/generator steps/);
    expect(within(lattice()).getAllByTestId('axis-key')).toHaveLength(3);
  });

  it('a stored mode the field cannot use draws primes; the setting is kept for when it can', () => {
    render(<HarmonicFieldLabPage />);
    preset(HEXANY);
    openLattice();
    fireEvent.click(modeRadio('Factors'));
    preset('19-EDO');
    // 19-EDO has no monzos: nothing to place, but the mode is not Factors
    expect(modeRadio('Primes')).toBeChecked();
    expect((stored(KEY_SETTINGS) as { viz: { viz1: { latMode: string } } }).viz.viz1.latMode).toBe(
      'cps'
    );
    preset(HEXANY);
    expect(modeRadio('Factors')).toBeChecked();
  });

  it('click toggles, Alt+click pins, hover rings, a sounding note lights, in the factor lattice', () => {
    render(<HarmonicFieldLabPage />);
    preset(HEXANY);
    openLattice();
    fireEvent.click(modeRadio('Factors'));
    const node = (re: RegExp) => within(lattice()).getAllByRole('button', { name: re })[0];
    const before = ring().getAttribute('aria-label');
    fireEvent.click(node(/^1\/1/), { altKey: true });
    expect(ring().getAttribute('aria-label')).toBe(before);
    expect(lattice().querySelectorAll('circle[class*="pinRing"]')).toHaveLength(1);
    fireEvent.mouseEnter(node(/^1\/1/));
    expect(lattice().querySelectorAll('circle[class*="selRing"]')).toHaveLength(1);
    fireEvent.click(node(/^1\/1/));
    expect(ring().getAttribute('aria-label')).not.toBe(before);
    // a sounding note lights in the factor lattice (computer key z plays the first subset note)
    fireEvent.keyDown(document.body, { key: 'z' });
    expect(document.querySelectorAll('[aria-label*="sounding"]').length).toBeGreaterThan(0);
    expect(within(lattice()).getAllByRole('button', { name: /sounding/ }).length).toBeGreaterThan(
      0
    );
    fireEvent.keyUp(document.body, { key: 'z' });
  });
});
