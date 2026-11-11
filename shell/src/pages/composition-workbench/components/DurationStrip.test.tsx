import { render } from '@test-utils';
import { DurationStrip } from './DurationStrip';

describe('DurationStrip grouping ticks', () => {
  const durations = [2, 2, 2, 2];

  it('draws a tick above and below the strip at each boundary, at its share of the length', () => {
    const { container } = render(
      <DurationStrip label="Edited" durations={durations} boundaries={[2, 6]} cyclic={false} />
    );
    const ticks = [...container.querySelectorAll<HTMLElement>('[data-edge]')];
    expect(ticks.map((tick) => tick.dataset.edge)).toEqual(['top', 'bottom', 'top', 'bottom']);
    expect(ticks.map((tick) => tick.style.left)).toEqual(['25%', '25%', '75%', '75%']);
    // They sit inside the strip itself.
    expect(
      ticks.every((tick) => tick.parentElement?.getAttribute('aria-label')?.startsWith('Edited'))
    ).toBe(true);
  });

  it('draws the cycle edges as boundaries, ignores anything outside, and draws nothing without any', () => {
    const edges = render(
      <DurationStrip label="Edited" durations={durations} boundaries={[0, 8]} cyclic={false} />
    );
    expect(
      [...edges.container.querySelectorAll<HTMLElement>('[data-edge="top"]')].map(
        (tick) => tick.style.left
      )
    ).toEqual(['0%', '100%']);
    const outside = render(
      <DurationStrip label="Edited" durations={durations} boundaries={[-1, 9]} cyclic={false} />
    );
    expect(outside.container.querySelectorAll('[data-edge]')).toHaveLength(0);
    const none = render(<DurationStrip label="Plain" durations={durations} cyclic={false} />);
    expect(none.container.querySelectorAll('[data-edge]')).toHaveLength(0);
  });
});
