import { fireEvent, render, screen, within } from '@test-utils';
import { HarmonicFieldLabMockPage } from './HarmonicFieldLabMock.page';
import { PANELS } from './Rail';
import { GLOSSARY, TIPS, tipKeys } from './texts';

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
    for (const f of ['Triads', 'Sevenths & tetrads']) {
      expect(screen.getByRole('region', { name: f })).toBeInTheDocument();
    }
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
    fireEvent.click(screen.getByRole('tab', { name: /Field table/ }));
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
