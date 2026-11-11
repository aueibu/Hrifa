import { fireEvent, render, screen } from '@test-utils';
import { InfoBarActiveContext, InfoTooltip } from './hoverInfo';
import { WorkbenchStatusBar, type WorkspaceView } from './WorkbenchStatusBar';

function Harness({
  onToggle = vi.fn(),
  onSettings = vi.fn(),
  open = false,
  settingsOpen = false,
  view = 'canvas' as WorkspaceView,
  onView = vi.fn(),
}) {
  return (
    <InfoBarActiveContext.Provider value>
      <div>
        <button type="button" data-info="Plays the preview">
          <span data-testid="inside-button">Play</span>
        </button>
        <p data-testid="plain">no explanation here</p>
        <InfoTooltip help="Explains the phase">Phase</InfoTooltip>
      </div>
      <WorkbenchStatusBar
        inspectorOpen={open}
        onToggleInspector={onToggle}
        settingsOpen={settingsOpen}
        onToggleSettings={onSettings}
        view={view}
        onView={onView}
      />
    </InfoBarActiveContext.Provider>
  );
}

describe('workbench status bar', () => {
  it('switches the workspace view, marking the current one', () => {
    const onView = vi.fn();
    render(<Harness view="canvas" onView={onView} />);
    expect(screen.getByRole('radio', { name: 'Canvas' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Desk' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: 'Desk' }));
    expect(onView).toHaveBeenCalledWith('desk');
  });

  it('shows what the pointer is on, found from the nearest element with data-info', () => {
    render(<Harness />);
    expect(screen.getByText(/Hover over a control/)).toBeTruthy();
    // Pointing at a child of an element that has info shows that element's info.
    fireEvent.mouseOver(screen.getByTestId('inside-button'));
    expect(screen.getByText('Plays the preview')).toBeTruthy();
    // Pointing at something with none goes back to the idle line.
    fireEvent.mouseOver(screen.getByTestId('plain'));
    expect(screen.queryByText('Plays the preview')).toBeNull();
    expect(screen.getByText(/Hover over a control/)).toBeTruthy();
  });

  it('also follows keyboard focus', () => {
    render(<Harness />);
    fireEvent.focusIn(screen.getByText('Play').closest('button')!);
    expect(screen.getByText('Plays the preview')).toBeTruthy();
  });

  it('shows a help label\'s text in the bar and leaves no pop-up tooltip when the bar is there', () => {
    render(<Harness />);
    fireEvent.mouseOver(screen.getByText('Phase'));
    expect(screen.getByText('Explains the phase')).toBeTruthy();
    // Only the bar shows it: one copy, no tooltip beside it.
    expect(screen.getAllByText('Explains the phase')).toHaveLength(1);
  });

  it('toggles the inspector and opens settings from the ends', () => {
    const onToggle = vi.fn();
    const onSettings = vi.fn();
    const { rerender } = render(<Harness onToggle={onToggle} onSettings={onSettings} open={false} />);
    const toggle = screen.getByRole('button', { name: 'Show inspector' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
    const settings = screen.getByRole('button', { name: 'Show settings' });
    expect(settings.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(settings);
    expect(onSettings).toHaveBeenCalledTimes(1);
    rerender(<Harness onToggle={onToggle} onSettings={onSettings} open settingsOpen />);
    expect(screen.getByRole('button', { name: 'Hide inspector' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Hide settings' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps a pop-up tooltip for help text where there is no bar', () => {
    // Without the provider (other pages, tests) the label still gets its data-info but a tooltip works.
    const { container } = render(<InfoTooltip help="Explains the phase">Phase</InfoTooltip>);
    expect(container.querySelector('[data-info]')?.getAttribute('data-info')).toBe('Explains the phase');
  });
});
