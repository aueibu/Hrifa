import { render, screen } from '@test-utils';
import {
  InspectorSection,
  ModuleActiveContext,
  ModuleInspectorContent,
  ModuleInspectorSlotContext,
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
