import { fireEvent, render, screen, within } from '@test-utils';
import { HarmonicFieldLabMockPage } from './HarmonicFieldLabMock.page';
import { field } from './mockData';
import { PANELS } from './Rail';
import { GLOSSARY, TIPS, tipKeys } from './texts';
import { stripLeft } from './TunerStrip';

const chordCount = () => {
  const rail = screen.getByRole('navigation', { name: 'Analysis panels' });
  return Number(
    within(rail)
      .getByRole('tab', { name: /Chords/ })
      .textContent?.match(/(\d+)$/)?.[1]
  );
};

describe('HarmonicFieldLabMockPage', () => {
  it('mounts: top bar, rail, generation unit, one panel, keyboard dock', () => {
    render(<HarmonicFieldLabMockPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Harmonic Field Lab' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Home/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Field settings' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Pitch circle/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tuner strip' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Subset keys' })).toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('shows live counts in the rail and switches the panel', () => {
    render(<HarmonicFieldLabMockPage />);
    const rail = screen.getByRole('navigation', { name: 'Analysis panels' });
    for (const p of PANELS) {
      expect(within(rail).getByRole('tab', { name: new RegExp(p.label) })).toBeInTheDocument();
    }
    expect(chordCount()).toBe(10);
    expect(within(rail).getByRole('tab', { name: /Keys & Modes/ })).toHaveTextContent('1 of 8');
    fireEvent.click(within(rail).getByRole('tab', { name: /Spectrum/ }));
    expect(screen.getByRole('heading', { name: /Interval spectrum/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tolerance ladder' })).toBeNull();
    fireEvent.click(within(rail).getByRole('tab', { name: /Lattice/ }));
    expect(screen.getByRole('group', { name: /Lattice of the field/ })).toBeInTheDocument();
    fireEvent.click(within(rail).getByRole('tab', { name: /Retuner/ }));
    expect(screen.getByRole('heading', { name: /Why this card won/ })).toBeInTheDocument();
  });

  it('opens the field-settings fold-out with the prime filter', async () => {
    render(<HarmonicFieldLabMockPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Field settings' }));
    const filter = await screen.findByRole('group', { name: 'Prime filter' });
    expect(within(filter).getAllByRole('button', { pressed: true }).length).toBe(25);
    fireEvent.click(within(filter).getByRole('button', { name: '11' }));
    expect(within(filter).getByRole('button', { name: '11' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('textbox', { name: 'Repeat interval' })).toBeInTheDocument();
  });

  it('groups chords by template family and lets the tolerance ladder bring a chord in', () => {
    render(<HarmonicFieldLabMockPage />);
    for (const f of ['Triads', 'Tetrads']) {
      expect(screen.getByRole('region', { name: f })).toBeInTheDocument();
    }
    // inside a section, one row per family
    expect(screen.getByRole('group', { name: 'Triads, Major' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Triads, Septimal' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tetrads, Utonal' })).toBeInTheDocument();
    const before = chordCount();
    fireEvent.click(screen.getByRole('button', { name: 'Raise tolerance' }));
    expect(chordCount()).toBeGreaterThan(before);
  });

  it('opens the template editor', async () => {
    render(<HarmonicFieldLabMockPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit templates' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Template 1 ratios' })).toHaveValue('4:5:6');
  });

  it('renders the mode x degree heat grid and the key rings, and selects a mode row', () => {
    render(<HarmonicFieldLabMockPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Keys & Modes/ }));
    const grid = screen.getByRole('group', { name: 'Mode by degree heat grid' });
    const rows = within(grid).getAllByRole('button');
    expect(rows).toHaveLength(7);
    fireEvent.click(rows[2]);
    expect(rows[2]).toHaveAttribute('aria-pressed', 'true');
    expect(rows[0]).toHaveAttribute('aria-pressed', 'false');
    const keys = screen.getByRole('list', { name: 'Keys' });
    expect(within(keys).getAllByRole('listitem')).toHaveLength(8);
    expect(within(keys).getAllByRole('img', { name: /the whole scale fits/ })).toHaveLength(1);
  });

  it('shows the pointed-at note in the inspector, and opens the full field table', async () => {
    render(<HarmonicFieldLabMockPage />);
    const ring = screen.getByRole('group', { name: /Pitch circle/ });
    fireEvent.click(within(ring).getByRole('button', { name: /^13\/8/ }));
    expect(screen.getByText('pinned')).toBeInTheDocument();
    expect(screen.getAllByText(/2\^-3 13/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('tab', { name: /Field table/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open full table' }));
    const dialog = await screen.findByRole('dialog');
    const table = within(dialog).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(9);
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Cents (c)' }));
    expect(within(table).getByRole('columnheader', { name: /Cents/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it('lists the field in the side column under Step sizes, and a row feeds the inspector', () => {
    render(<HarmonicFieldLabMockPage />);
    const table = screen.getByRole('table', { name: 'Field notes' });
    expect(within(table).getAllByRole('row')).toHaveLength(9);
    expect(within(table).getAllByRole('img', { name: 'in subset' })).toHaveLength(7);
    expect(within(table).getAllByRole('img', { name: 'not in subset' })).toHaveLength(1);
    const row = within(table).getByText('13/8').closest('tr')!;
    fireEvent.mouseEnter(row);
    expect(screen.getAllByText(/2\^-3 13/).length).toBeGreaterThan(0);
    fireEvent.click(row);
    expect(screen.getByText('pinned')).toBeInTheDocument();
  });

  it('puts the method parameters in the column left of the ring', () => {
    render(<HarmonicFieldLabMockPage />);
    expect(screen.getByRole('textbox', { name: 'Starting harmonic' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Latt' }));
    expect(screen.getByRole('textbox', { name: 'Axis 3 generator' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Cust' }));
    expect(screen.getByRole('textbox', { name: /Intervals/ })).toHaveValue(
      '9/8\n5/4\n4/3\n3/2\n5/3\n15/8'
    );
  });

  it('switches the ring to the Fifths view: 5/4 at step +4, 21.5 cents flat; 11/8 off the chain', () => {
    render(<HarmonicFieldLabMockPage />);
    const ring = () => screen.getByRole('group', { name: /Pitch circle/ });
    expect(ring()).toHaveAccessibleName(/chromatic view/);
    fireEvent.click(screen.getByRole('radio', { name: 'Fifths' }));
    expect(ring()).toHaveAccessibleName(/fifths view/);
    expect(
      within(ring()).getByRole('button', { name: /^5\/4.*step 4, -21\.5 cents/ })
    ).toBeInTheDocument();
    expect(
      within(ring()).getByRole('button', { name: /^9\/8.*step 2, [+-]0\.0 cents/ })
    ).toBeInTheDocument();
    expect(
      within(ring()).getByRole('button', { name: /^11\/8.*off the chain/ })
    ).toBeInTheDocument();
  });

  it('lists saved subsets as sparklines, previews on hover and loads on click', () => {
    render(<HarmonicFieldLabMockPage />);
    const list = screen.getByRole('list', { name: 'Saved subsets list' });
    const rows = within(list).getAllByRole('button');
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows[0]).toHaveAttribute('aria-pressed', 'true');
    const tri = rows.find((r) => /Otonal 4:5:6/.test(r.getAttribute('aria-label') ?? ''))!;
    const ring = screen.getByRole('group', { name: /Pitch circle/ });
    expect(ring).toHaveAccessibleName(/7 of 8/);
    fireEvent.mouseEnter(tri);
    expect(ring).toHaveAccessibleName(/3 of 8/);
    fireEvent.mouseLeave(tri);
    expect(ring).toHaveAccessibleName(/7 of 8/);
    fireEvent.click(tri);
    expect(tri).toHaveAttribute('aria-pressed', 'true');
    expect(ring).toHaveAccessibleName(/3 of 8/);
  });

  it('puts a note in the same column in the strip and in every saved row (one shared scale)', () => {
    const { container } = render(<HarmonicFieldLabMockPage />);
    const strip = container.querySelector(
      '[data-testid="strip-plot"] [data-ratio="5/4"]'
    ) as HTMLElement;
    const rows = [
      ...container.querySelectorAll('[class*="sparkCol"][data-ratio="5/4"]'),
    ] as HTMLElement[];
    expect(strip.style.left).toBe(stripLeft(field[2].c));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const r of rows) {
      expect(r.style.left).toBe(strip.style.left);
    }
    // the 100 c reference lines use the same scale
    const lines = container.querySelectorAll('[data-testid="strip-plot"] [data-black]');
    expect(lines).toHaveLength(13);
    expect((lines[4] as HTMLElement).style.left).toBe(stripLeft(400));
    expect((lines[4] as HTMLElement).dataset.black).toBe('false');
    expect((lines[1] as HTMLElement).dataset.black).toBe('true');
  });

  it('opens the glossary drawer and filters it', async () => {
    render(<HarmonicFieldLabMockPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Glossary' }));
    const search = await screen.findByRole('textbox', { name: 'Search the glossary' });
    fireEvent.change(search, { target: { value: 'comma' } });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('Syntonic comma').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('Constant structure')).toBeNull();
  });

  it('collapses the keyboard dock', () => {
    render(<HarmonicFieldLabMockPage />);
    fireEvent.click(screen.getByRole('button', { name: /^Keyboard$/, expanded: true }));
    expect(screen.queryByRole('group', { name: 'Subset keys' })).toBeNull();
  });
});

const KEY = 'hrifa.harmonic-field-lab.mock.layout.v2';
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

  it('pins and unpins from the rail, with a dimmed pin when there is no room', () => {
    render(<HarmonicFieldLabMockPage />);
    expect(columns()).toEqual([]);
    const rail = screen.getByRole('navigation', { name: 'Analysis panels' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Pin Retuner as a column' }));
    const pinBtn = within(rail).getByRole('button', { name: /^Unpin Retuner/ });
    expect(pinBtn).toHaveAttribute('aria-pressed', 'true');
    expect(pinBtn).toHaveAccessibleName('Unpin Retuner (no room at this width)');
    fireEvent.click(pinBtn);
    expect(within(rail).getByRole('button', { name: 'Pin Retuner as a column' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('shows the default four columns on an ultrawide and the switcher skips them', () => {
    setWidth(3840);
    render(<HarmonicFieldLabMockPage />);
    expect(columns()).toEqual([
      { name: 'Keys & Modes', side: 'left', stacked: false },
      { name: 'Chords', side: 'left', stacked: false },
      { name: 'Lattice', side: 'right', stacked: false },
      { name: 'Spectrum', side: 'right', stacked: false },
    ]);
    // the switcher shows the first panel that has no column: the retuner
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: /Why this card won/ })).toBeInTheDocument();
    // each column has its own move and unpin buttons
    const chords = screen.getByRole('region', { name: 'Chords, pinned column' });
    expect(within(chords).getByRole('button', { name: 'Move Chords left' })).toBeEnabled();
    expect(within(chords).getByRole('button', { name: 'Unpin Chords' })).toBeInTheDocument();
    const keys = screen.getByRole('region', { name: 'Keys & Modes, pinned column' });
    expect(within(keys).getByRole('button', { name: 'Move Keys & Modes left' })).toBeDisabled();
  });

  it('keeps only the inner pair at 2560 px and marks the others as having no room', () => {
    setWidth(2560);
    render(<HarmonicFieldLabMockPage />);
    expect(columns()).toEqual([
      { name: 'Chords', side: 'left', stacked: false },
      { name: 'Lattice', side: 'right', stacked: false },
    ]);
    const rail = screen.getByRole('navigation', { name: 'Analysis panels' });
    expect(
      within(rail).getByRole('button', { name: 'Unpin Keys & Modes (no room at this width)' })
    ).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'Unpin Chords' })).toBeInTheDocument();
  });

  it('moves columns: reorder on a side, cross to the other side, unpin; and remembers it', () => {
    setWidth(3840);
    const { unmount } = render(<HarmonicFieldLabMockPage />);
    // Keys is outermost on the left: moving it inward swaps it with Chords
    fireEvent.click(screen.getByRole('button', { name: 'Move Keys & Modes right' }));
    expect(columns().map((c) => c.name)).toEqual(['Chords', 'Keys & Modes', 'Lattice', 'Spectrum']);
    // now Keys is innermost: right crosses the generator to the inner right place
    fireEvent.click(screen.getByRole('button', { name: 'Move Keys & Modes right' }));
    expect(columns()).toEqual([
      { name: 'Chords', side: 'left', stacked: false },
      { name: 'Keys & Modes', side: 'right', stacked: false },
      { name: 'Lattice', side: 'right', stacked: false },
      { name: 'Spectrum', side: 'right', stacked: false },
    ]);
    const spec = screen.getByRole('region', { name: 'Spectrum, pinned column' });
    fireEvent.click(within(spec).getByRole('button', { name: 'Unpin Spectrum' }));
    expect(columns().map((c) => c.name)).toEqual(['Chords', 'Keys & Modes', 'Lattice']);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({
      left: [['chords']],
      right: [['keys'], ['lattice']],
    });
    unmount();
    render(<HarmonicFieldLabMockPage />);
    expect(columns().map((c) => c.name)).toEqual(['Chords', 'Keys & Modes', 'Lattice']);
  });

  it('falls back to the defaults when the stored layout is bad', () => {
    setWidth(3840);
    window.localStorage.setItem(KEY, '{"left":[["nope"]],"right":"x"}');
    render(<HarmonicFieldLabMockPage />);
    expect(columns().map((c) => c.name)).toEqual(['Keys & Modes', 'Chords', 'Lattice', 'Spectrum']);
  });

  it('falls back to the defaults for a column with three panels', () => {
    setWidth(3840);
    window.localStorage.setItem(KEY, '{"left":[["keys","chords","lattice"]],"right":[]}');
    render(<HarmonicFieldLabMockPage />);
    expect(columns().map((c) => c.name)).toEqual(['Keys & Modes', 'Chords', 'Lattice', 'Spectrum']);
  });

  it('migrates a stored v1 layout to one-panel columns', () => {
    setWidth(3840);
    window.localStorage.setItem(KEY_V1, '{"left":["lattice"],"right":["chords","keys"]}');
    render(<HarmonicFieldLabMockPage />);
    expect(columns()).toEqual([
      { name: 'Lattice', side: 'left', stacked: false },
      { name: 'Chords', side: 'right', stacked: false },
      { name: 'Keys & Modes', side: 'right', stacked: false },
    ]);
    expect(columns().every((c) => !c.stacked)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({
      left: [['lattice']],
      right: [['chords'], ['keys']],
    });
  });

  it('stacks two panels into one column, shows both, swaps, moves one out, unstacks and unpins', () => {
    setWidth(3840);
    render(<HarmonicFieldLabMockPage />);
    const region = (name: string) => screen.getByRole('region', { name: `${name}, pinned column` });
    const names = () => columns().map((c) => c.name);
    // only a single panel next to a single panel toward the generator can stack: Chords is innermost, so it cannot
    expect(within(region('Chords')).queryByRole('button', { name: /^Stack/ })).toBeNull();
    fireEvent.click(within(region('Keys & Modes')).getByRole('button', { name: /^Stack Keys/ }));
    expect(columns()).toEqual([
      { name: 'Keys & Modes', side: 'left', stacked: true },
      { name: 'Chords', side: 'left', stacked: true },
      { name: 'Lattice', side: 'right', stacked: false },
      { name: 'Spectrum', side: 'right', stacked: false },
    ]);
    // both panels render in the same column element, each with its own header
    expect(region('Keys & Modes').closest('[data-stack="true"]')).toBe(
      region('Chords').closest('[data-stack="true"]')
    );
    expect(
      within(region('Keys & Modes')).getByRole('heading', { name: /Keys & Modes/ })
    ).toBeInTheDocument();
    expect(within(region('Chords')).getByRole('heading', { name: /Chords/ })).toBeInTheDocument();
    // a stacked panel offers unstack and swap, not stack
    expect(within(region('Chords')).queryByRole('button', { name: /^Stack/ })).toBeNull();
    fireEvent.click(
      within(region('Keys & Modes')).getByRole('button', { name: 'Swap Keys & Modes down' })
    );
    expect(names().slice(0, 2)).toEqual(['Chords', 'Keys & Modes']);
    // moving the top panel right takes it out of the stack as the column on the inner side
    fireEvent.click(within(region('Chords')).getByRole('button', { name: 'Move Chords right' }));
    expect(columns().filter((c) => c.stacked)).toEqual([]);
    expect(names()).toEqual(['Keys & Modes', 'Chords', 'Lattice', 'Spectrum']);
    // stack again, unstack the other one
    fireEvent.click(within(region('Keys & Modes')).getByRole('button', { name: /^Stack Keys/ }));
    fireEvent.click(within(region('Chords')).getByRole('button', { name: 'Unstack Chords' }));
    expect(names()).toEqual(['Chords', 'Keys & Modes', 'Lattice', 'Spectrum']);
    // stack once more; unpinning one panel leaves the other alone in its column
    fireEvent.click(within(region('Chords')).getByRole('button', { name: /^Stack Chords/ }));
    fireEvent.click(
      within(region('Keys & Modes')).getByRole('button', { name: 'Unpin Keys & Modes' })
    );
    expect(columns()).toEqual([
      { name: 'Chords', side: 'left', stacked: false },
      { name: 'Lattice', side: 'right', stacked: false },
      { name: 'Spectrum', side: 'right', stacked: false },
    ]);
  });

  it('has a keyboard-operable splitter between stacked panels, stored per column', () => {
    setWidth(3840);
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys","chords"]],"right":[["lattice"],["spectrum"]]}'
    );
    render(<HarmonicFieldLabMockPage />);
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
    expect(JSON.parse(window.localStorage.getItem(KEY)!).splits).toEqual({ keys: 0.8 });
    fireEvent.doubleClick(bar);
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(JSON.parse(window.localStorage.getItem(KEY)!).splits).toBeUndefined();
  });

  it('remembers a stored split across a reload', () => {
    setWidth(3840);
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys","chords"]],"right":[],"splits":{"keys":0.3}}'
    );
    render(<HarmonicFieldLabMockPage />);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '30');
  });

  it('counts a stack as one column: two columns at 2560 px show all four panels when stacked', () => {
    setWidth(2560);
    window.localStorage.setItem(
      KEY,
      '{"left":[["keys","chords"]],"right":[["lattice","spectrum"]]}'
    );
    render(<HarmonicFieldLabMockPage />);
    expect(columns().map((c) => c.name)).toEqual(['Keys & Modes', 'Chords', 'Lattice', 'Spectrum']);
    expect(columns().every((c) => c.stacked)).toBe(true);
  });
});

describe('texts', () => {
  it('has a plain explanation with an example for every entry, and valid see-also links', () => {
    expect(GLOSSARY.length).toBe(tipKeys.length);
    for (const k of tipKeys) {
      const e = TIPS[k];
      expect(e.text.length).toBeGreaterThan(30);
      expect(e.text).toMatch(/Example|e\.g\./i);
      for (const s of e.see ?? []) {
        expect(tipKeys).toContain(s);
      }
    }
  });
});
