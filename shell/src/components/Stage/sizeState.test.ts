import { describe, expect, it } from 'vitest';
import { withMeasure } from './sizeState';

describe('withMeasure', () => {
  it('records the first measurement', () => {
    expect(withMeasure({}, 'a', 40, 20)).toEqual({ a: { width: 'regular', height: 'short' } });
  });

  it('returns the same record when the class does not change', () => {
    const s = withMeasure({}, 'a', 40, 20);
    expect(withMeasure(s, 'a', 41, 21)).toBe(s);
  });

  it('holds the previous class inside the hysteresis band and flips outside it', () => {
    const s = withMeasure({}, 'a', 43, 20); // wide
    expect(s.a.width).toBe('wide');
    expect(withMeasure(s, 'a', 41.7, 20)).toBe(s); // 0.3 below 42: held
    expect(withMeasure(s, 'a', 41.2, 20).a.width).toBe('regular');
  });

  it('keeps modules apart', () => {
    const s = withMeasure(withMeasure({}, 'a', 10, 10), 'b', 50, 50);
    expect(s.a.width).toBe('narrow');
    expect(s.b.width).toBe('wide');
  });
});
