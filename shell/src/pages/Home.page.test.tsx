import { render, screen, userEvent } from '@test-utils';
import { applets } from '../data/applets';
import { HomePage } from './Home.page';

describe('HomePage', () => {
  it('renders every applet by default', () => {
    render(<HomePage />);
    expect(screen.getByText(`${applets.length} applets`)).toBeInTheDocument();
    applets.forEach((applet) => {
      expect(screen.getByText(applet.title)).toBeInTheDocument();
    });
  });

  it('narrows results by search term', async () => {
    const user = userEvent.setup();
    render(<HomePage />);
    const input = screen.getByPlaceholderText('Search the workbench');
    await user.type(input, 'color');

    expect(screen.getByText('Color Checker')).toBeInTheDocument();
    expect(screen.queryByText('Hrifa Edel')).not.toBeInTheDocument();
  });

  it('filters by category chip', async () => {
    const user = userEvent.setup();
    render(<HomePage />);
    await user.click(screen.getByRole('radio', { name: 'language' }));

    expect(screen.getByText('Username Seeds')).toBeInTheDocument();
    expect(screen.queryByText('Hrifa Edel')).not.toBeInTheDocument();
  });
});
