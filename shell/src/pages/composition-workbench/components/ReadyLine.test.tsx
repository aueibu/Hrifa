import { render } from '@test-utils';
import { describe, expect, it } from 'vitest';
import { ReadyLine } from './ReadyLine';
import type { ReadyValue } from './readyState';

const line = (container: HTMLElement) =>
  container.querySelector('[data-ready-line]') as HTMLElement;
const live = (container: HTMLElement) =>
  container.querySelector('[data-ready-live]') as HTMLElement;

describe('ReadyLine', () => {
  it('Ready is plain text with the action name bold; Waiting and No target carry different icons', () => {
    const ready: ReadyValue = { state: 'ready', text: 'Insert: one chord on the selected note' };
    const { container, rerender } = render(<ReadyLine value={ready} />);
    expect(line(container).querySelector('[data-ready-icon]')).toBeNull();
    expect(line(container).querySelector('b')?.textContent).toBe('Insert:');
    expect(line(container)).toHaveAttribute('title', ready.text);

    rerender(<ReadyLine value={{ state: 'waiting', text: 'Select a note' }} />);
    expect(line(container).querySelector('[data-ready-icon]')).toHaveAttribute(
      'data-ready-icon',
      'waiting'
    );
    rerender(
      <ReadyLine value={{ state: 'no-target', text: 'No target: open a data-block to insert' }} />
    );
    expect(line(container).querySelector('[data-ready-icon]')).toHaveAttribute(
      'data-ready-icon',
      'no-target'
    );
  });

  it('the live region speaks only on a change of state, not on a count change', () => {
    const { container, rerender } = render(
      <ReadyLine value={{ state: 'ready', text: 'Insert: one chord on the selected note' }} />
    );
    expect(live(container)).toHaveAttribute('aria-live', 'polite');
    expect(live(container)).toHaveAttribute('role', 'status');
    // A count change inside Ready: the line changes, the live region does not.
    rerender(
      <ReadyLine
        value={{ state: 'ready', text: 'Insert: one chord on each of 2 selected notes' }}
      />
    );
    expect(line(container)).toHaveTextContent('one chord on each of 2 selected notes');
    expect(live(container).textContent).toBe('Insert: one chord on the selected note');
    // A change of state: it speaks the new text.
    rerender(<ReadyLine value={{ state: 'waiting', text: 'Select a note' }} />);
    expect(live(container).textContent).toBe('Select a note');
  });
});
