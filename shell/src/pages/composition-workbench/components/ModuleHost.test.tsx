import { render, screen } from '@test-utils';
import {
  HelpTip,
  InspectorSection,
  ModuleActiveContext,
  ModuleInspectorContent,
  ModuleInspectorSlotContext,
  ModuleNotices,
} from './ModuleHost';

function Setup({ slot, active }: { slot: HTMLElement | null; active: boolean }) {
  return (
    <ModuleInspectorSlotContext.Provider value={slot}>
      <ModuleActiveContext.Provider value={active}>
        <div data-testid="panel">
          <ModuleInspectorContent>
            <InspectorSection label="Grid">
              <span>grid controls</span>
            </InspectorSection>
          </ModuleInspectorContent>
        </div>
      </ModuleActiveContext.Provider>
    </ModuleInspectorSlotContext.Provider>
  );
}

describe('ModuleInspectorContent', () => {
  it('renders into the inspector slot when the module is active', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    render(<Setup slot={slot} active />);

    expect(slot).toHaveTextContent('grid controls');
    expect(screen.getByTestId('panel')).not.toHaveTextContent('grid controls');
    slot.remove();
  });

  it('falls back to the panel when the inspector is hidden', () => {
    render(<Setup slot={null} active />);
    // Setup controls must never become unreachable.
    expect(screen.getByTestId('panel')).toHaveTextContent('grid controls');
  });

  it('renders nothing for a module that is not active', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    render(<Setup slot={slot} active={false} />);

    expect(slot).toBeEmptyDOMElement();
    expect(screen.queryByText('grid controls')).not.toBeInTheDocument();
    slot.remove();
  });
});

describe('help tooltips and notices', () => {
  it('shows a help label and a section title with the help text kept out of the layout', () => {
    render(
      <InspectorSection label="Grouping" help="How the rhythm is divided">
        <HelpTip help="An explanation">Phase</HelpTip>
      </InspectorSection>
    );
    // The labels are there; the explanations are tooltips, not lines of text in the panel.
    expect(screen.getByText('Grouping')).toBeTruthy();
    expect(screen.getByText('Phase')).toBeTruthy();
    expect(screen.queryByText('An explanation')).toBeNull();
    expect(screen.queryByText('How the rhythm is divided')).toBeNull();
  });

  it('lists notices with their tone, and shows nothing when there are none', () => {
    const { container, rerender } = render(
      <ModuleNotices
        items={[
          { tone: 'error', text: 'Could not read 2x' },
          { tone: 'warning', text: 'Step 3 ends with a tie' },
        ]}
      />
    );
    const notices = [...container.querySelectorAll('p')];
    expect(notices.map((notice) => notice.textContent)).toEqual([
      'Could not read 2x',
      'Step 3 ends with a tie',
    ]);
    expect(notices.map((notice) => notice.getAttribute('data-tone'))).toEqual(['error', 'warning']);
    rerender(<ModuleNotices items={[]} />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });
});
