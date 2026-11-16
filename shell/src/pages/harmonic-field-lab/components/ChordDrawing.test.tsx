import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChordDrawing } from './ShelfPanel';

describe('ChordDrawing root chevron', () => {
  it('marks the root once for a chord with notes, and not for an empty chord', () => {
    const { container, rerender } = render(
      <ChordDrawing cents={[0, 386.3, 702]} repC={1200} rootCents={0} />
    );
    expect(container.querySelectorAll('[data-testid="chord-root"]')).toHaveLength(1);
    rerender(<ChordDrawing cents={[]} repC={1200} rootCents={undefined} />);
    expect(container.querySelectorAll('[data-testid="chord-root"]')).toHaveLength(0);
  });
});
