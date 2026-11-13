import { fireEvent, render, screen, within } from '@test-utils';
import { HarmonicFieldLabMockPage } from './HarmonicFieldLabMock.page';
import { SECTIONS } from './sections';
import { GLOSSARY, TIPS, tipKeys } from './texts';

describe('HarmonicFieldLabMockPage', () => {
  it('mounts with the top bar, the contents rail and every section', () => {
    render(<HarmonicFieldLabMockPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Harmonic Field Lab' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Home/ })).toHaveAttribute('href', '/');
    for (const s of SECTIONS) {
      expect(screen.getByRole('heading', { level: 2, name: s.title })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Play scale' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Subset keys' })).toBeInTheDocument();
  });

  it('lists every section and block in the rail with a summary', () => {
    render(<HarmonicFieldLabMockPage />);
    const rail = screen.getByRole('navigation', { name: 'Contents' });
    for (const s of SECTIONS) {
      expect(within(rail).getByRole('button', { name: s.title })).toBeInTheDocument();
      for (const b of s.blocks) {
        const item = within(rail).getByTitle(`${b.title}: ${b.summary}`);
        expect(item).toHaveTextContent(b.title);
        expect(item).toHaveTextContent(b.summary);
        expect(document.getElementById(b.id)).not.toBeNull();
      }
    }
    expect(within(rail).getByText('10 found')).toBeInTheDocument();
  });

  it('opens a block in the reader modal', async () => {
    render(<HarmonicFieldLabMockPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Interval spectrum in reader' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('All propriety clashes')).toBeInTheDocument();
  });

  it('collapses an article to its heading and lede', () => {
    render(<HarmonicFieldLabMockPage />);
    const btn = screen.getByRole('button', { name: 'Collapse Scale' });
    expect(document.getElementById('blk-scale-body')).not.toBeNull();
    fireEvent.click(btn);
    expect(document.getElementById('blk-scale-body')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand Scale' })).toHaveAttribute(
      'aria-expanded',
      'false'
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

  it('toggles the keyboard dock', () => {
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
