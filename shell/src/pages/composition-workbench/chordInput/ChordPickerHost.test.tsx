import { render, screen } from '@test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ChordPickerHost } from './ChordPickerHost';

// The dock's width, splitter and persistence moved to the clip editor's Stage (editorStage.ts; the editor tests
// cover its splitter, its saved layout and the old preference's migration). This is the frame only.
describe('the chord picker frame', () => {
  it('is the dock without a takeover slot, with no splitter of its own', () => {
    render(
      <ChordPickerHost host="dock" onHostChange={() => undefined}>
        <span>body</span>
      </ChordPickerHost>
    );
    expect(document.querySelector('[data-chord-host="dock"]')).not.toBeNull();
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('shows a requested takeover as the dock when there is no takeover slot', () => {
    render(
      <ChordPickerHost host="takeover" onHostChange={() => undefined}>
        <span>body</span>
      </ChordPickerHost>
    );
    expect(document.querySelector('[data-chord-host="dock"]')).not.toBeNull();
    expect(document.querySelector('[data-chord-host="takeover"]')).toBeNull();
  });

  it('offers the switch to the takeover and, only when given, a close button', () => {
    const onHostChange = vi.fn();
    const { rerender } = render(
      <ChordPickerHost host="dock" onHostChange={onHostChange}>
        <span>body</span>
      </ChordPickerHost>
    );
    screen.getByRole('button', { name: 'Expand over canvas' }).click();
    expect(onHostChange).toHaveBeenCalledWith('takeover');
    expect(screen.queryByRole('button', { name: 'Close chord picker' })).toBeNull();
    rerender(
      <ChordPickerHost host="dock" onHostChange={onHostChange} onClose={() => undefined}>
        <span>body</span>
      </ChordPickerHost>
    );
    expect(screen.getByRole('button', { name: 'Close chord picker' })).toBeInTheDocument();
  });
});
