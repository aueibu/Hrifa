import { render, screen, userEvent } from '@test-utils';
import { UsernameSeedsPage } from './UsernameSeeds.page';

function renderPage() {
  return render(<UsernameSeedsPage />);
}

describe('UsernameSeedsPage', () => {
  it('renders a live username on load', () => {
    renderPage();
    expect(screen.getByText('Live local time')).toBeInTheDocument();
    expect(screen.getByText(/Local time:/)).toBeInTheDocument();
  });

  it('freezes and resumes', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Freeze' }));
    expect(screen.getByText('Frozen result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByText('Live local time')).toBeInTheDocument();
  });

  it('tests a manual time', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Test another time' }));
    const input = screen.getByLabelText('Time');
    await user.type(input, '09:30');
    await user.click(screen.getByRole('button', { name: 'Test time' }));

    expect(screen.getByText('Manual test time')).toBeInTheDocument();
  });
});
