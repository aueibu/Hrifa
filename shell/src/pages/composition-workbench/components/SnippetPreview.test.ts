import { describe, expect, it } from 'vitest';
import { packet } from '../model';
import { rhythmBars } from './SnippetPreview';

function durations(values: unknown[]) {
  return packet(
    'list',
    'duration',
    values.map((value, index) => ({ id: `d:${index}`, value, provenance: [] }))
  );
}

describe('rhythmBars', () => {
  it('sizes each block by its length and fills the width', () => {
    const bars = rhythmBars(durations([2, 1, 1]))!;
    expect(bars).toHaveLength(3);
    expect(bars[0].x).toBe(0);
    // The first block is twice as long as the second, less the same one-unit gap.
    expect(bars[0].width + 1).toBeCloseTo((bars[1].width + 1) * 2, 6);
    const last = bars[2];
    expect(last.x + last.width + 1).toBeCloseTo(200, 6);
  });

  it('draws a rest, a negative length, as a rest of the same size', () => {
    const bars = rhythmBars(durations([1, -2, 1]))!;
    expect(bars.map((bar) => bar.rest)).toEqual([false, true, false]);
    expect(bars[1].width + 1).toBeCloseTo((bars[0].width + 1) * 2, 6);
  });

  it('declines anything that is not a plain duration list', () => {
    expect(rhythmBars(durations([]))).toBeNull();
    expect(rhythmBars(durations([1, 'x']))).toBeNull();
    expect(rhythmBars(durations([1, 0]))).toBeNull();
    expect(rhythmBars(packet('list', 'integer', [{ id: 'a', value: 1, provenance: [] }]))).toBeNull();
  });
});
