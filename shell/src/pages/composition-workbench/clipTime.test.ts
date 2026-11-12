import { describe, expect, it } from 'vitest';
import {
  formatLength,
  formatPosition,
  parseLength,
  parsePosition,
  TICKS_PER_QUARTER,
} from './clipTime';
import { rational } from './musicalTime';

describe('bars.beats.ticks', () => {
  it('uses one ticks-per-quarter constant', () => {
    expect(TICKS_PER_QUARTER).toBe(960);
  });

  it('formats positions from 1.1.0 in the meter of the clip', () => {
    expect(formatPosition(rational(0), '4/4')).toBe('1.1.0');
    expect(formatPosition(rational(4), '4/4')).toBe('2.1.0');
    expect(formatPosition(rational(5, 2), '4/4')).toBe('1.3.480');
    // 7/8: a bar is 3.5 quarters, a beat half a quarter (480 ticks).
    expect(formatPosition(rational(7, 2), '7/8')).toBe('2.1.0');
    expect(formatPosition(rational(1, 2), '7/8')).toBe('1.2.0');
    expect(formatPosition(rational(1, 4), '7/8')).toBe('1.1.240');
    // The same quarter position reads differently in 6/8 and 3/4.
    expect(formatPosition(rational(3), '6/8')).toBe('2.1.0');
    expect(formatPosition(rational(3), '3/4')).toBe('2.1.0');
    expect(formatPosition(rational(3, 2), '6/8')).toBe('1.4.0');
    expect(formatPosition(rational(3, 2), '3/4')).toBe('1.2.480');
  });

  it('formats lengths counted from zero', () => {
    expect(formatLength(rational(4), '4/4')).toBe('1.0.0');
    expect(formatLength(rational(9, 2), '4/4')).toBe('1.0.480');
    expect(formatLength(rational(7, 2), '7/8')).toBe('1.0.0');
    expect(formatLength(rational(3, 4), '4/4')).toBe('0.0.720');
  });

  it('round-trips every tick of a position and a length, in several meters', () => {
    for (const meter of ['4/4', '7/8', '3/4', '5/16', '2/2']) {
      for (const ticks of [0, 1, 239, 480, 959, 960, 1921, 5000, 23041]) {
        const quarters = rational(ticks, TICKS_PER_QUARTER);
        expect(parsePosition(formatPosition(quarters, meter), meter)).toEqual({
          ok: true,
          value: quarters,
        });
        expect(parseLength(formatLength(quarters, meter), meter)).toEqual({
          ok: true,
          value: quarters,
        });
      }
    }
  });

  it('parses exact rational positions', () => {
    expect(parsePosition('2.2.480', '4/4')).toEqual({ ok: true, value: rational(11, 2) });
    expect(parsePosition(' 1.1.0 ', '4/4')).toEqual({ ok: true, value: rational(0) });
    expect(parseLength('2.1.0', '4/4')).toEqual({ ok: true, value: rational(9) });
  });

  it('rejects nonsense with a message instead of clamping', () => {
    for (const text of ['', '1.1', 'a.b.c', '1.1.0.0', '-1.1.0', '1.1.-5', '1,1,0']) {
      expect(parsePosition(text, '4/4')).toMatchObject({ ok: false });
    }
    expect(parsePosition('0.1.0', '4/4')).toMatchObject({ ok: false, error: /count from 1/ });
    expect(parsePosition('1.0.0', '4/4')).toMatchObject({ ok: false, error: /count from 1/ });
    expect(parsePosition('1.5.0', '4/4')).toMatchObject({ ok: false, error: /4 beats/ });
    expect(parsePosition('1.1.960', '4/4')).toMatchObject({ ok: false, error: /0 to 959/ });
    // A beat of 7/8 is 480 ticks.
    expect(parsePosition('1.1.480', '7/8')).toMatchObject({ ok: false, error: /0 to 479/ });
    expect(parseLength('1.4.0', '4/4')).toMatchObject({ ok: false, error: /0 to 3/ });
    expect(parseLength('1.0.960', '4/4')).toMatchObject({ ok: false });
  });

  it('rejects absurdly large numbers with a message', () => {
    expect(parsePosition('99999999999999999999.1.0', '4/4')).toMatchObject({
      ok: false,
      error: /cannot go past/,
    });
    expect(parseLength('1000000.0.0', '4/4')).toMatchObject({ ok: false, error: /cannot go past/ });
    expect(parseLength('72001.0.0', '4/4')).toMatchObject({ ok: false, error: /cannot go past/ });
    expect(parseLength('72000.1.0', '4/4')).toMatchObject({ ok: false, error: /cannot go past/ });
    expect(parseLength('72000.0.0', '4/4')).toMatchObject({ ok: true });
  });
});
