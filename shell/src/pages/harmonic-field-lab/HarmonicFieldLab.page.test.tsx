import { render, screen } from '@test-utils';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';

describe('HarmonicFieldLabPage', () => {
  it('renders the header, a way back to Home and the coming-soon panel', () => {
    render(<HarmonicFieldLabPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Harmonic Field Lab' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Home/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { name: 'Coming soon' })).toBeInTheDocument();
    expect(screen.getByText(/microtonal note fields/)).toBeInTheDocument();
  });
});
