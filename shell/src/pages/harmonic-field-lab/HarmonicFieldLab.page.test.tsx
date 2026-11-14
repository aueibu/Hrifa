import { fireEvent, render, screen, waitFor, within } from '@test-utils';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';

const KEY = 'hrifa.harmonic-field-lab.layout.v1';
const KEY_MOCK_V3 = 'hrifa.harmonic-field-lab.mock.layout.v3';
const KEY_V2 = 'hrifa.harmonic-field-lab.mock.layout.v2';
const KEY_V1 = 'hrifa.harmonic-field-lab.mock.layout.v1';
const columns = () =>
  screen.queryAllByRole('region', { name: /, pinned column$/ }).map((r) => ({
    name: r.getAttribute('aria-label')!.replace(', pinned column', ''),
    side: r.getAttribute('data-side'),
    stacked: r.closest('[data-stack]') !== null,
  }));

describe('pinned panel columns', () => {
  const setWidth = (px: number) => {
    window.innerWidth = px;
  };
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    setWidth(1024);
    window.localStorage.clear();
  });

  it('pins from the rail through a Pin left or Pin right menu, and unpins; a dimmed pin when there is no room', async () => {
    render(<HarmonicFieldLabPage />);
    expect(columns()).toEqual([]);
    const rail = screen.getByRole('navigation', { name: 'Analysis panels' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Pin Retuner as a column' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin right' }));
    const pinBtn = within(rail).getByRole('button', { name: /^Unpin Retuner/ });
    expect(pinBtn).toHaveAttribute('aria-pressed', 'true');
    expect(pinBtn).toHaveAccessibleName('Unpin Retuner (no room at this width)');
    fireEvent.click(pinBtn);
    expect(within(rail).getByRole('button', { name: 'Pin Retuner as a column' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('pins on the inner end of the chosen side', async () => {
    setWidth(3840);
    render(<HarmonicFieldLabPage />);
    const rail = screen.getByRole('navigation', { name: 'Analysis panels' });
    fireEvent.click(within(rail).getByRole('button', { name: /^Pin Visualizer 2 – EDO fit/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin left' }));
    expect(columns().map((c) => [c.name, c.side])).toEqual([
      ['Keys', 'left'],
      ['Chords', 'left'],
      ['Visualizer 2 – EDO fit', 'left'],
      ['Visualizer 1 – Lattice', 'right'],
      ['Spectrum', 'right'],
    ]);
  });

  it('shows the default four columns on an ultrawide and the switcher skips them', () => {
    setWidth(3840);
    render(<HarmonicFieldLabPage />);
    expect(columns()).toEqual([
      { name: 'Keys', side: 'left', stacked: false },
      { name: 'Chords', side: 'left', stacked: false },
      { name: 'Visualizer 1 – Lattice', side: 'right', stacked: false },
      { name: 'Spectrum', side: 'right', stacked: false },
    ]);
    // the switcher shows the first panel that has no column: Modes (the default layout has no Modes column)
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Mode by degree heat grid' })).toBeInTheDocument();
    // each column has its own move and unpin buttons
    const chords = screen.getByRole('region', { name: 'Chords, pinned column' });
    expect(within(chords).getByRole('button', { name: 'Move Chords left' })).toBeEnabled();
    expect(within(chords).getByRole('button', { name: 'Unpin Chords' })).toBeInTheDocument();
    const keys = screen.getByRole('region', { name: 'Keys, pinned column' });
    expect(within(keys).getByRole('button', { name: 'Move Keys left' })).toBeDisabled();
  });

  it('keeps only the inner pair at 2560 px and marks the others as having no room', () => {
    setWidth(2560);
    render(<HarmonicFieldLabPage />);
    expect(columns()).toEqual([
      { name: 'Chords', side: 'left', stacked: false },
      { name: 'Visualizer 1 – Lattice', side: 'right', stacked: false },
    ]);
    const rail = screen.getByRole('navigation', { name: 'Analysis panels' });
    expect(
      within(rail).getByRole('button', { name: 'Unpin Keys (no room at this width)' })
    ).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'Unpin Chords' })).toBeInTheDocument();
  });

  it('moves columns: reorder on a side, cross to the other side, unpin; and remembers it', () => {
    setWidth(3840);
    const { unmount } = render(<HarmonicFieldLabPage />);
    // Keys is outermost on the left: moving it inward swaps it with Chords
    fireEvent.click(screen.getByRole('button', { name: 'Move Keys right' }));
    expect(columns().map((c) => c.name)).toEqual([
      'Chords',
      'Keys',
      'Visualizer 1 – Lattice',
      'Spectrum',
    ]);
    // now Keys is innermost: right crosses the generator to the inner right place
    fireEvent.click(screen.getByRole('button', { name: 'Move Keys right' }));
    expect(columns()).toEqual([
      { name: 'Chords', side: 'left', stacked: false },
      { name: 'Keys', side: 'right', stacked: false },
      { name: 'Visualizer 1 – Lattice', side: 'right', stacked: false },
      { name: 'Spectrum', side: 'right', stacked: false },
    ]);
    const spec = screen.getByRole('region', { name: 'Spectrum, pinned column' });
    fireEvent.click(within(spec).getByRole('button', { name: 'Unpin Spectrum' }));
    expect(columns().map((c) => c.name)).toEqual(['Chords', 'Keys', 'Visualizer 1 – Lattice']);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({
      left: [['chords']],
      right: [['keys'], ['viz1']],
      keysModesSplit: true,
    });
    unmount();
    render(<HarmonicFieldLabPage />);
    expect(columns().map((c) => c.name)).toEqual(['Chords', 'Keys', 'Visualizer 1 – Lattice']);
  });

  it('falls back to the defaults when the stored layout is bad', () => {
    setWidth(3840);
    window.localStorage.setItem(KEY, '{"left":[["nope"]],"right":"x"}');
    render(<HarmonicFieldLabPage />);
    expect(columns().map((c) => c.name)).toEqual([
      'Keys',
      'Chords',
      'Visualizer 1 – Lattice',
      'Spectrum',
    ]);
  });

  it('keeps the first three panels of a column with four, and drops only the extra one', () => {
    setWidth(3840);
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys","chords","viz1","viz2"]],"right":[],"keysModesSplit":true}'
    );
    render(<HarmonicFieldLabPage />);
    expect(columns().map((c) => c.name)).toEqual(['Keys', 'Chords', 'Visualizer 1 – Lattice']);
  });

  it('drops an unknown panel id but keeps the rest of the stored layout (a future panel does not wipe it)', () => {
    setWidth(3840);
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys"],["future-panel","chords"]],"right":[["viz1"]],"keysModesSplit":true}'
    );
    render(<HarmonicFieldLabPage />);
    expect(columns().map((c) => [c.name, c.side])).toEqual([
      ['Keys', 'left'],
      ['Chords', 'left'],
      ['Visualizer 1 – Lattice', 'right'],
    ]);
  });

  it('migrates the mock layout key (v3) once, then uses its own key', () => {
    setWidth(3840);
    window.localStorage.setItem(KEY_MOCK_V3, '{"left":[["retuner"]],"right":[["spectrum"]]}');
    render(<HarmonicFieldLabPage />);
    expect(columns().map((c) => [c.name, c.side])).toEqual([
      ['Retuner', 'left'],
      ['Spectrum', 'right'],
    ]);
    // read from the mock key; nothing is written until the layout changes
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('migrates a stored v1 layout to one-panel columns', () => {
    setWidth(3840);
    window.localStorage.setItem(KEY_V1, '{"left":["lattice"],"right":["chords","keys"]}');
    render(<HarmonicFieldLabPage />);
    // the old combined Keys & Modes panel gets Modes below it in its column
    expect(columns()).toEqual([
      { name: 'Visualizer 1 – Lattice', side: 'left', stacked: false },
      { name: 'Chords', side: 'right', stacked: false },
      { name: 'Keys', side: 'right', stacked: true },
      { name: 'Modes', side: 'right', stacked: true },
    ]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('stacks two panels into one column, shows both, swaps, moves one out, unstacks and unpins', async () => {
    setWidth(3840);
    render(<HarmonicFieldLabPage />);
    const region = (name: string) => screen.getByRole('region', { name: `${name}, pinned column` });
    const names = () => columns().map((c) => c.name);
    const stackWithMenu = async (name: string, target: string) => {
      fireEvent.click(
        within(region(name)).getByRole('button', { name: `Stack ${name} with another panel` })
      );
      fireEvent.click(await screen.findByRole('menuitem', { name: target }));
    };
    // every pinned panel offers the menu; it lists the other panels that are alone in their column, with their side
    fireEvent.click(
      within(region('Chords')).getByRole('button', { name: 'Stack Chords with another panel' })
    );
    expect((await screen.findAllByRole('menuitem')).map((m) => m.textContent)).toEqual([
      'Keys (left, 1 of 3)',
      'Visualizer 1 – Lattice (right, 1 of 3)',
      'Spectrum (right, 1 of 3)',
    ]);
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Escape' });
    await stackWithMenu('Keys', 'Chords (left, 1 of 3)');
    // the moved panel is at the bottom
    expect(columns()).toEqual([
      { name: 'Chords', side: 'left', stacked: true },
      { name: 'Keys', side: 'left', stacked: true },
      { name: 'Visualizer 1 – Lattice', side: 'right', stacked: false },
      { name: 'Spectrum', side: 'right', stacked: false },
    ]);
    // both panels render in the same column element, each with its own header
    expect(region('Keys').closest('[data-stack="true"]')).toBe(
      region('Chords').closest('[data-stack="true"]')
    );
    expect(within(region('Keys')).getByRole('heading', { name: /Keys/ })).toBeInTheDocument();
    expect(within(region('Chords')).getByRole('heading', { name: /Chords/ })).toBeInTheDocument();
    // a stacked panel offers unstack and swap
    expect(
      within(region('Chords')).getByRole('button', { name: 'Unstack Chords' })
    ).toBeInTheDocument();
    fireEvent.click(
      within(region('Chords')).getByRole('button', { name: 'Move Chords down in the stack' })
    );
    expect(names().slice(0, 2)).toEqual(['Keys', 'Chords']);
    // moving the top panel right takes it out of the stack as the column on the inner side
    fireEvent.click(within(region('Keys')).getByRole('button', { name: 'Move Keys right' }));
    expect(columns().filter((c) => c.stacked)).toEqual([]);
    expect(names()).toEqual(['Chords', 'Keys', 'Visualizer 1 – Lattice', 'Spectrum']);
    // stack again, unstack the lower one
    await stackWithMenu('Chords', 'Keys (left, 1 of 3)');
    fireEvent.click(within(region('Chords')).getByRole('button', { name: 'Unstack Chords' }));
    expect(names()).toEqual(['Chords', 'Keys', 'Visualizer 1 – Lattice', 'Spectrum']);
    // stack once more; unpinning one panel leaves the other alone in its column
    await stackWithMenu('Chords', 'Keys (left, 1 of 3)');
    fireEvent.click(within(region('Keys')).getByRole('button', { name: 'Unpin Keys' }));
    expect(columns()).toEqual([
      { name: 'Chords', side: 'left', stacked: false },
      { name: 'Visualizer 1 – Lattice', side: 'right', stacked: false },
      { name: 'Spectrum', side: 'right', stacked: false },
    ]);
  });

  it('pins Dissonance and stacks it with Lattice through the menu: both panels end up in one column', async () => {
    setWidth(3840);
    render(<HarmonicFieldLabPage />);
    const rail = screen.getByRole('navigation', { name: 'Analysis panels' });
    fireEvent.click(
      within(rail).getByRole('button', { name: /^Pin Visualizer 3 – Dissonance curve/ })
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin left' }));
    const dissonance = screen.getByRole('region', {
      name: 'Visualizer 3 – Dissonance curve, pinned column',
    });
    // it is on the left of the generator: stack it with Lattice, which is on the right
    fireEvent.click(
      within(dissonance).getByRole('button', {
        name: 'Stack Visualizer 3 – Dissonance curve with another panel',
      })
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Visualizer 1 – Lattice (right, 1 of 3)' })
    );
    expect(columns()).toEqual([
      { name: 'Keys', side: 'left', stacked: false },
      { name: 'Chords', side: 'left', stacked: false },
      { name: 'Visualizer 1 – Lattice', side: 'right', stacked: true },
      { name: 'Visualizer 3 – Dissonance curve', side: 'right', stacked: true },
      { name: 'Spectrum', side: 'right', stacked: false },
    ]);
    expect(JSON.parse(window.localStorage.getItem(KEY)!).right[0]).toEqual(['viz1', 'viz3']);
  });

  it('pins an unpinned visualizer from the switcher header', async () => {
    setWidth(3840);
    render(<HarmonicFieldLabPage />);
    // the switcher shows Modes first; choose Visualizer 2 (it has no column either)
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Analysis panels' })).getByRole('tab', {
        name: /Visualizer 2/,
      })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /^Pin Visualizer 2 – EDO fit left or right/ })
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin right' }));
    expect(columns().map((c) => [c.name, c.side])).toContainEqual([
      'Visualizer 2 – EDO fit',
      'right',
    ]);
    expect(columns().findIndex((c) => c.name === 'Visualizer 2 – EDO fit')).toBe(2);
  });

  it('stacks all three visualizers in one column through the menu, with two splitters; a fourth panel is refused', async () => {
    setWidth(3840);
    window.localStorage.setItem(KEY, '{"left":[["chords"]],"right":[["viz1"],["viz2"],["viz3"]]}');
    render(<HarmonicFieldLabPage />);
    const region = (name: string) => screen.getByRole('region', { name: `${name}, pinned column` });
    const L = 'Visualizer 1 – Lattice';
    const E = 'Visualizer 2 – EDO fit';
    const D = 'Visualizer 3 – Dissonance curve';
    const open = (name: string) =>
      fireEvent.click(
        within(region(name)).getByRole('button', { name: `Stack ${name} with another panel` })
      );
    open(E);
    fireEvent.click(await screen.findByRole('menuitem', { name: `${L} (right, 1 of 3)` }));
    // the second stacking sees the two-panel column, labelled with its size
    open(D);
    const items = (await screen.findAllByRole('menuitem')).map((m) => m.textContent);
    expect(items).toContain(`${L} (right, 2 of 3)`);
    expect(items).toContain(`${E} (right, 2 of 3)`);
    fireEvent.click(screen.getByRole('menuitem', { name: `${L} (right, 2 of 3)` }));
    expect(
      columns()
        .filter((c) => c.stacked)
        .map((c) => c.name)
    ).toEqual([L, E, D]);
    expect(JSON.parse(window.localStorage.getItem(KEY)!).right[0]).toEqual([
      'viz1',
      'viz2',
      'viz3',
    ]);
    // two splitters, one per boundary; each moves only its own neighbours
    const bars = screen.getAllByRole('separator', { name: 'Resize the stacked panels' });
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['33', '67']);
    fireEvent.keyDown(bars[0], { key: 'ArrowDown' });
    expect(bars[0]).toHaveAttribute('aria-valuenow', '38');
    expect(bars[1]).toHaveAttribute('aria-valuenow', '67');
    fireEvent.keyDown(bars[1], { key: 'End' });
    expect(bars[1]).toHaveAttribute('aria-valuenow', '80');
    expect(JSON.parse(window.localStorage.getItem(KEY)!).splits.viz1).toHaveLength(3);
    fireEvent.doubleClick(bars[1]);
    expect(bars[0]).toHaveAttribute('aria-valuenow', '33');
    expect(JSON.parse(window.localStorage.getItem(KEY)!).splits).toBeUndefined();
    // a three-panel column is full: Chords has nothing left to stack with
    expect(
      within(region('Chords')).getByRole('button', { name: 'Stack Chords with another panel' })
    ).toBeDisabled();
    // in a three-stack, up and down move a panel one slot
    fireEvent.click(within(region(L)).getByRole('button', { name: `Move ${L} down in the stack` }));
    expect(
      columns()
        .filter((c) => c.stacked)
        .map((c) => c.name)
    ).toEqual([E, L, D]);
    expect(within(region(E)).queryByRole('button', { name: /up in the stack/ })).toBeNull();
    expect(within(region(D)).queryByRole('button', { name: /down in the stack/ })).toBeNull();
  });

  it('has a keyboard-operable splitter between stacked panels, stored per column', () => {
    setWidth(3840);
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys","chords"]],"right":[["viz1"],["spectrum"]],"keysModesSplit":true}'
    );
    render(<HarmonicFieldLabPage />);
    const bar = screen.getByRole('separator', { name: 'Resize the stacked panels' });
    expect(bar).toHaveAttribute('aria-orientation', 'horizontal');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('tabindex', '0');
    // one splitter only: the single columns have none
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect(bar).toHaveAttribute('aria-valuenow', '45');
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    expect(bar).toHaveAttribute('aria-valuenow', '55');
    fireEvent.keyDown(bar, { key: 'Home' });
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    fireEvent.keyDown(bar, { key: 'End' });
    expect(bar).toHaveAttribute('aria-valuenow', '80');
    expect(JSON.parse(window.localStorage.getItem(KEY)!).splits).toEqual({ keys: [0.8, 0.2] });
    fireEvent.doubleClick(bar);
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(JSON.parse(window.localStorage.getItem(KEY)!).splits).toBeUndefined();
  });

  it('remembers a stored split across a reload', () => {
    setWidth(3840);
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys","chords"]],"right":[],"splits":{"keys":0.3},"keysModesSplit":true}'
    );
    render(<HarmonicFieldLabPage />);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '30');
  });

  it('counts a stack as one column: two columns at 2560 px show all four panels when stacked', () => {
    setWidth(2560);
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys","chords"]],"right":[["viz1","spectrum"]],"keysModesSplit":true}'
    );
    render(<HarmonicFieldLabPage />);
    expect(columns().map((c) => c.name)).toEqual([
      'Keys',
      'Chords',
      'Visualizer 1 – Lattice',
      'Spectrum',
    ]);
    expect(columns().every((c) => c.stacked)).toBe(true);
  });
});

describe('visualizer panels', () => {
  const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.innerWidth = 1024;
    window.localStorage.clear();
  });

  it('replaces the Lattice rail panel with three numbered visualizers named by their view, with live summaries', () => {
    render(<HarmonicFieldLabPage />);
    const tab = (re: RegExp) => within(rail()).getByRole('tab', { name: re });
    expect(tab(/Visualizer 1 – Lattice/)).toHaveTextContent(/^Visualizer 1 – Lattice2D 3·5·7$/);
    expect(tab(/Visualizer 2 – EDO fit/)).toHaveTextContent(/^Visualizer 2 – EDO fitbest \d+$/);
    expect(tab(/Visualizer 3 – Dissonance curve/)).toHaveTextContent(
      /^Visualizer 3 – Dissonance curve\d+ dips$/
    );
    expect(within(rail()).getAllByRole('tab')).toHaveLength(8);
  });

  it('switches a visualizer view from its header menu; the panel, rail and stored layout follow', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /EDO fit/ }));
    expect(screen.getByRole('heading', { name: /EDO fit/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /EDO fit chart/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^View: Visualizer 2 – EDO fit/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Isomorphic keyboard' }));
    expect(screen.getByRole('heading', { name: /Isomorphic keyboard/ })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /Isomorphic keyboard: hexagons/ })
    ).toBeInTheDocument();
    expect(within(rail()).getByRole('tab', { name: /Isomorphic keyboard/ })).toBeInTheDocument();
    expect(within(rail()).queryByRole('tab', { name: /EDO fit/ })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(KEY)!).views).toEqual({ viz2: 'iso' });
  });

  it('shows the dissonance curve with its dips labelled', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /Dissonance curve/ }));
    const chart = screen.getByRole('group', { name: /Dissonance curve: roughness/ });
    for (const r of ['6/5', '5/4', '4/3', '3/2', '5/3']) {
      expect(within(chart).getAllByText(r).length).toBeGreaterThan(0);
    }
  });

  it('toggles the lattice to 3D, and shows a static note where there is no WebGL (jsdom)', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /Lattice/ }));
    expect(screen.getByRole('group', { name: /^Lattice of the field/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    expect(screen.queryByRole('group', { name: /^Lattice of the field/ })).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(/needs WebGL/);
    expect(screen.getByRole('combobox', { name: 'Lattice axes (primes)' })).toHaveValue('auto');
    expect(within(rail()).getByRole('tab', { name: /Lattice/ })).toHaveTextContent('3D 3·5·7');
    fireEvent.click(screen.getByRole('radio', { name: '2D' }));
    expect(screen.getByRole('group', { name: /^Lattice of the field/ })).toBeInTheDocument();
  });

  it('opens the view in a large window with its own controls, and closes it', async () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /Lattice/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Visualizer 1 – Lattice in a large window' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('group', { name: /^Lattice of the field/ })
    ).toBeInTheDocument();
    // the pop-out shares the setting: 3D there is 3D in the panel too
    fireEvent.click(within(dialog).getByRole('radio', { name: '3D' }));
    expect(within(dialog).getByRole('note')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('pins a visualizer as a column named after its view; keyboard settings change the grid', () => {
    window.innerWidth = 3840;
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys"]],"right":[["viz3"],["viz2"]],"views":{"viz3":"iso"},"keysModesSplit":true}'
    );
    render(<HarmonicFieldLabPage />);
    const col = screen.getByRole('region', {
      name: 'Visualizer 3 – Isomorphic keyboard, pinned column',
    });
    expect(
      within(col).getByRole('button', { name: 'Move Visualizer 3 – Isomorphic keyboard left' })
    ).toBeEnabled();
    const shown = () => within(col).getAllByRole('button', { name: /, [+-]\d/ }).length;
    const before = shown();
    fireEvent.change(within(col).getByRole('combobox', { name: 'Up-right step (generator 2)' }), {
      target: { value: '5/4' },
    });
    expect(shown()).not.toBe(before);
  });

  it('moves a stored v2 layout to v3: lattice is viz1', () => {
    window.innerWidth = 3840;
    window.localStorage.setItem(
      KEY_V2,
      '{"left":[["keys","chords"]],"right":[["lattice"],["spectrum"]]}'
    );
    render(<HarmonicFieldLabPage />);
    // the mock's combined Keys & Modes panel gets Modes next to it in its stack
    expect(columns().map((c) => c.name)).toEqual([
      'Keys',
      'Modes',
      'Chords',
      'Visualizer 1 – Lattice',
      'Spectrum',
    ]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('drops a bad stored view and keeps the arrangement (the panel shows its default view)', () => {
    window.innerWidth = 3840;
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys"]],"right":[["viz1"]],"views":{"viz1":"nope"},"keysModesSplit":true}'
    );
    render(<HarmonicFieldLabPage />);
    expect(columns().map((c) => c.name)).toEqual(['Keys', 'Visualizer 1 – Lattice']);
  });
});
