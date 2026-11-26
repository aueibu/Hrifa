import { useState } from 'react';
import { fireEvent, render, screen } from '@test-utils';
import { describe, expect, it, vi } from 'vitest';
import { formatLength, formatPosition, parsePosition } from '../meterTime';
import { rational, type Rational } from '../musicalTime';
import { PositionScrub } from './PositionScrub';

const at = (text: string, meter = '4/4'): Rational => {
  const parsed = parsePosition(text, meter);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

function Harness({
  start,
  meter = '4/4',
  kind = 'position',
  onCommit,
  onError,
}: {
  start: Rational;
  meter?: string;
  kind?: 'position' | 'length';
  onCommit: (value: Rational) => void;
  onError?: (message: string) => void;
}) {
  const [value, setValue] = useState(start);
  return (
    <PositionScrub
      aria-label="Start"
      value={value}
      meter={meter}
      kind={kind}
      defaultValue={rational(0)}
      info="Start help."
      onError={onError}
      onCommit={(next) => {
        setValue(next);
        onCommit(next);
        return null;
      }}
    />
  );
}

const spin = () => screen.getByRole('spinbutton', { name: 'Start' });
const shown = () => spin().getAttribute('aria-valuetext');
const part = (name: string) => spin().querySelector(`[data-part="${name}"]`) as HTMLElement;

/** Press on a part, move by `steps` of 6 px to the right (negative: left), release. */
function drag(name: string, steps: number) {
  fireEvent.pointerDown(part(name), { button: 0, clientX: 100, clientY: 50 });
  fireEvent.pointerMove(spin(), { clientX: 100 + steps * 6, clientY: 50 });
  fireEvent.pointerUp(spin(), { button: 0, clientX: 100 + steps * 6, clientY: 50 });
}

function type(text: string) {
  fireEvent.pointerDown(spin(), { button: 0, clientX: 10 });
  fireEvent.pointerUp(spin(), { button: 0, clientX: 10 });
  const input = screen.getByRole('textbox', { name: 'Start' });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('PositionScrub drags', () => {
  const cases: [string, string, number, string, string?][] = [
    ['bar', '2.3.2.00', 1, '3.3.2.00'],
    ['beat', '2.4.2.00', 1, '3.1.2.00'],
    ['tick', '2.3.4.00', 1, '2.4.1.00'],
    ['percent', '2.3.2.99', 1, '2.3.3.00'],
    ['tick', '1.7.2.00', 1, '2.1.1.00', '7/8'],
    ['bar', '3.1.1.00', -1, '2.1.1.00'],
  ];
  it.each(cases)('%s drag on %s by %i gives %s', (name, from, steps, to, meter = '4/4') => {
    render(<Harness start={at(from, meter)} meter={meter} onCommit={() => {}} />);
    expect(part(name)).toBeInTheDocument();
    drag(name, steps);
    expect(shown()).toBe(to);
  });

  it('shows four parts and steps from the drag start, not the last step (no drift)', () => {
    render(<Harness start={at('1.1.1.00')} onCommit={() => {}} />);
    expect(shown()).toBe('1.1.1.00');
    fireEvent.pointerDown(part('beat'), { button: 0, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(spin(), { clientX: 130, clientY: 50 });
    expect(shown()).toBe('2.2.1.00');
    fireEvent.pointerMove(spin(), { clientX: 112, clientY: 50 });
    expect(shown()).toBe('1.3.1.00');
    fireEvent.pointerUp(spin(), { button: 0, clientX: 112 });
  });

  it('left stops at 1.1.1.00 and commits nothing once there', () => {
    const onCommit = vi.fn();
    render(<Harness start={at('1.1.1.00')} onCommit={onCommit} />);
    drag('bar', -4);
    expect(shown()).toBe('1.1.1.00');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a Duration counts from 0 and stops at 0.0.0.00', () => {
    render(<Harness start={rational(1)} kind="length" onCommit={() => {}} />);
    expect(shown()).toBe(formatLength(rational(1), '4/4'));
    drag('beat', -3);
    expect(shown()).toBe('0.0.0.00');
  });
});

describe('PositionScrub text entry', () => {
  it('a bare 2 is 2.1.1.00 and 1.3.5 is 1.4.1.00', () => {
    const onCommit = vi.fn();
    render(<Harness start={at('1.1.1.00')} onCommit={onCommit} />);
    type('2');
    expect(shown()).toBe('2.1.1.00');
    type('1.3.5');
    expect(shown()).toBe('1.4.1.00');
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('1/4n commits exactly one quarter note', () => {
    const onCommit = vi.fn();
    render(<Harness start={at('3.1.1.00')} onCommit={onCommit} />);
    type('1/4n');
    expect(onCommit).toHaveBeenCalledWith(rational(1));
    expect(shown()).toBe(formatPosition(rational(1), '4/4'));
  });

  it('a refusal goes to onError and the old value stays', () => {
    const onCommit = vi.fn();
    const onError = vi.fn();
    render(<Harness start={at('2.1.1.00')} onCommit={onCommit} onError={onError} />);
    type('0.1.1');
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/from 1/));
    expect(onCommit).not.toHaveBeenCalled();
    expect(shown()).toBe('2.1.1.00');
  });

  it('an off-grid triplet clicked into and committed unchanged is not written back', () => {
    const onCommit = vi.fn();
    render(<Harness start={rational(1, 3)} onCommit={onCommit} />);
    expect(shown()).toBe('1.1.2.33');
    fireEvent.pointerDown(spin(), { button: 0, clientX: 10 });
    fireEvent.pointerUp(spin(), { button: 0, clientX: 10 });
    const input = screen.getByRole('textbox', { name: 'Start' });
    expect(input).toHaveValue('1.1.2.33');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    // Blur does the same.
    fireEvent.pointerDown(spin(), { button: 0, clientX: 10 });
    fireEvent.pointerUp(spin(), { button: 0, clientX: 10 });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Start' }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(shown()).toBe('1.1.2.33');
  });

  it('Escape cancels, double-click resets, and the hover text gives the exact ratio', () => {
    const onCommit = vi.fn();
    render(<Harness start={rational(1, 3)} onCommit={onCommit} />);
    expect(spin().parentElement?.getAttribute('data-info')).toBe('Start help. = 1/12n');
    fireEvent.pointerDown(spin(), { button: 0, clientX: 10 });
    fireEvent.pointerUp(spin(), { button: 0, clientX: 10 });
    const input = screen.getByRole('textbox', { name: 'Start' });
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.doubleClick(spin());
    expect(onCommit).toHaveBeenCalledWith(rational(0));
    expect(shown()).toBe('1.1.1.00');
  });
});
