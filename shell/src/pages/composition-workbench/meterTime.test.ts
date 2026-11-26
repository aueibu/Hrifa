import { describe, expect, it } from 'vitest';
import {
  barQuarters,
  formatLength,
  formatPosition,
  MAX_DATA_BLOCK_BARS,
  parseLength,
  parsePosition,
  partAt,
  stepTime,
  type TimePart,
} from './meterTime';
import { rational, type Rational } from './musicalTime';

const pos = (text: string, meter = '4/4'): Rational => {
  const result = parsePosition(text, meter);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};
const len = (text: string, meter = '4/4'): Rational => {
  const result = parseLength(text, meter);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};
const step = (
  text: string,
  part: TimePart,
  direction: 1 | -1,
  meter = '4/4',
  kind: 'position' | 'length' = 'position'
) => {
  const parse = kind === 'position' ? pos : len;
  const format = kind === 'position' ? formatPosition : formatLength;
  return format(stepTime(parse(text, meter), meter, kind, part, direction), meter);
};

describe('format: BARs.BEATs.TICKs.%', () => {
  it('a position counts from 1; the origin is 1.1.1.00', () => {
    expect(formatPosition(rational(0), '4/4')).toBe('1.1.1.00');
    expect(formatPosition(rational(4), '4/4')).toBe('2.1.1.00');
    expect(formatPosition(rational(1), '4/4')).toBe('1.2.1.00');
    expect(formatPosition(rational(5, 2), '4/4')).toBe('1.3.3.00');
  });

  it('a length counts from 0; the origin is 0.0.0.00', () => {
    expect(formatLength(rational(0), '4/4')).toBe('0.0.0.00');
    expect(formatLength(rational(4), '4/4')).toBe('1.0.0.00');
    expect(formatLength(rational(1), '4/4')).toBe('0.1.0.00');
    expect(formatLength(rational(3, 4), '4/4')).toBe('0.0.3.00');
  });

  it('a tick is a sixteenth: 4 per beat in x/4, 2 in x/8, 1 in x/16', () => {
    expect(formatPosition(rational(1, 2), '7/8')).toBe('1.2.1.00');
    expect(formatPosition(rational(1, 4), '7/8')).toBe('1.1.2.00');
    expect(formatPosition(rational(7, 2), '7/8')).toBe('2.1.1.00');
    expect(formatPosition(rational(1, 4), '7/16')).toBe('1.2.1.00');
    expect(formatPosition(rational(3), '6/8')).toBe('2.1.1.00');
    expect(formatPosition(rational(3), '3/4')).toBe('2.1.1.00');
    expect(formatPosition(rational(3, 2), '6/8')).toBe('1.4.1.00');
    expect(formatPosition(rational(3, 2), '3/4')).toBe('1.2.3.00');
  });

  it('shows the nearest percent, carrying at 100, and never changes the value', () => {
    const third = rational(1, 3);
    expect(formatLength(third, '4/4')).toBe('0.0.1.33');
    expect(third).toEqual(rational(1, 3));
    expect(formatPosition(rational(1, 3), '4/4')).toBe('1.1.2.33');
    // 799.9 percent of a quarter's 1/400 grid rounds up to the next tick.
    expect(formatLength(rational(7999, 4000), '4/4')).toBe('0.2.0.00');
    expect(formatLength(rational(39999, 4000), '4/4')).toBe('2.2.0.00');
  });

  it('refuses a negative value', () => {
    expect(() => formatPosition(rational(-1), '4/4')).toThrow(RangeError);
    expect(() => formatLength(rational(-1), '4/4')).toThrow(RangeError);
  });
});

describe('parse: normalizing', () => {
  it('fills missing trailing parts with the minimum', () => {
    expect(formatPosition(pos('2'), '4/4')).toBe('2.1.1.00');
    expect(formatLength(len('2'), '4/4')).toBe('2.0.0.00');
    expect(formatPosition(pos('2.3'), '4/4')).toBe('2.3.1.00');
    expect(formatLength(len('2.3'), '4/4')).toBe('2.3.0.00');
    expect(formatPosition(pos('1.1.1.5'), '4/4')).toBe('1.1.1.05');
  });

  it('carries over-range parts up', () => {
    expect(formatPosition(pos('1.3.5'), '4/4')).toBe('1.4.1.00');
    expect(formatPosition(pos('1.1.1.150'), '4/4')).toBe('1.1.2.50');
    expect(formatPosition(pos('1.5.1'), '4/4')).toBe('2.1.1.00');
    expect(formatLength(len('0.0.9'), '4/4')).toBe('0.2.1.00');
    expect(formatLength(len('0.8.0', '7/8'), '7/8')).toBe('1.1.0.00');
    expect(formatPosition(pos('1.8.1', '7/8'), '7/8')).toBe('2.1.1.00');
  });

  it('a Start under 1 in any of bar, beat or tick is an error; a Duration may use 0', () => {
    for (const text of ['0.1.1.00', '1.0.1.00', '1.1.0.00', '1.1.0', '0']) {
      const result = parsePosition(text, '4/4');
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/from 1/);
    }
    expect(parseLength('0.0.0.00', '4/4')).toEqual({ ok: true, value: rational(0) });
  });

  it('rejects text that is not time, negatives, and anything past the bar cap', () => {
    for (const text of ['', 'abc', '-1', '1.-1', '1.1.1.1.1', '1..1', '1.5x', '1.1.1.0.5']) {
      expect(parsePosition(text, '4/4').ok).toBe(false);
      expect(parseLength(text, '4/4').ok).toBe(false);
    }
    expect(parsePosition(`${MAX_DATA_BLOCK_BARS + 2}`, '4/4').ok).toBe(false);
    expect(parsePosition(`${MAX_DATA_BLOCK_BARS}.1.1.00`, '4/4').ok).toBe(true);
    expect(parseLength(`${MAX_DATA_BLOCK_BARS}`, '4/4')).toEqual({
      ok: true,
      value: rational(4 * MAX_DATA_BLOCK_BARS),
    });
    expect(parseLength(`${MAX_DATA_BLOCK_BARS}.0.0.01`, '4/4').ok).toBe(false);
    expect(parseLength('99999999999999999999', '4/4').ok).toBe(false);
  });
});

describe('ratios', () => {
  const table: [string, string, string, string][] = [
    // text, meter, Start, Duration
    ['1/4n', '4/4', '1.2.1.00', '0.1.0.00'],
    ['1/4', '4/4', '1.2.1.00', '0.1.0.00'],
    ['1/4b', '4/4', '1.2.1.00', '0.1.0.00'],
    ['1/4b', '7/8', '1.2.2.50', '0.1.1.50'],
    ['3/16n', '4/4', '1.1.4.00', '0.0.3.00'],
    ['1/3n', '4/4', '1.2.2.33', '0.1.1.33'],
  ];
  it.each(table)('%s in %s is Start %s and Duration %s', (text, meter, start, duration) => {
    expect(formatPosition(pos(text, meter), meter)).toBe(start);
    expect(formatLength(len(text, meter), meter)).toBe(duration);
  });

  it('returns the exact rational: 1/4n is one quarter, 1/3n is 4/3, 1/4b in 7/8 is 7/8', () => {
    expect(len('1/4n')).toEqual(rational(1));
    expect(len('1/3n')).toEqual(rational(4, 3));
    expect(len('1/4b', '7/8')).toEqual(rational(7, 8));
    expect(len('1/2B', '3/4')).toEqual(rational(3, 2));
  });

  it('a ratio needs a slash; a bare integer is a bar count', () => {
    expect(formatLength(len('1'), '4/4')).toBe('1.0.0.00');
  });

  it('rejects a zero divisor, non-integers, a stray suffix and anything over the cap', () => {
    for (const text of [
      '1/0n',
      '1/0b',
      '1.5/4n',
      '1/4.5',
      '1/4x',
      '/4',
      '1/',
      '1/4nn',
      '1/4 b b',
    ]) {
      expect(parsePosition(text, '4/4').ok).toBe(false);
      expect(parseLength(text, '4/4').ok).toBe(false);
    }
    expect(len('0/4n')).toEqual(rational(0));
    expect(parseLength(`${MAX_DATA_BLOCK_BARS + 1}/1b`, '4/4').ok).toBe(false);
    expect(parseLength(`${MAX_DATA_BLOCK_BARS}/1b`, '4/4').ok).toBe(true);
  });
});

describe('stepTime', () => {
  it('bar, beat, tick and percent steps carry (4/4, Start)', () => {
    expect(step('2.3.2.00', 'bar', 1)).toBe('3.3.2.00');
    expect(step('2.4.2.00', 'beat', 1)).toBe('3.1.2.00');
    expect(step('2.3.4.00', 'tick', 1)).toBe('2.4.1.00');
    expect(step('2.3.2.99', 'percent', 1)).toBe('2.3.3.00');
  });

  it('7/8: a tick drag from the last tick of the bar rolls into the next bar', () => {
    expect(step('1.7.2.00', 'tick', 1, '7/8')).toBe('2.1.1.00');
    expect(step('1.1.1.00', 'beat', 1, '7/8')).toBe('1.2.1.00');
    expect(step('1.1.1.00', 'bar', 1, '7/8')).toBe('2.1.1.00');
  });

  it('steps down too, and stops at the minimum', () => {
    expect(step('2.1.1.00', 'tick', -1)).toBe('1.4.4.00');
    expect(step('1.1.1.00', 'bar', -1)).toBe('1.1.1.00');
    expect(step('1.1.1.00', 'percent', -1)).toBe('1.1.1.00');
    expect(step('1.1.2.00', 'beat', -1)).toBe('1.1.1.00');
    expect(step('0.0.0.00', 'tick', -1, '4/4', 'length')).toBe('0.0.0.00');
    expect(step('0.0.0.50', 'tick', -1, '4/4', 'length')).toBe('0.0.0.00');
    expect(step('1.0.0.00', 'bar', -1, '4/4', 'length')).toBe('0.0.0.00');
  });

  it('a length steps from 0 in whole units', () => {
    expect(step('0.0.0.00', 'beat', 1, '4/4', 'length')).toBe('0.1.0.00');
    expect(step('0.3.3.99', 'percent', 1, '4/4', 'length')).toBe('1.0.0.00');
  });

  it('an off-grid value snaps to the nearest percent first, then steps', () => {
    const third = rational(1, 3); // 33.33 percent of a quarter's 1/400 grid: 133.33
    expect(stepTime(third, '4/4', 'length', 'percent', 1)).toEqual(rational(134, 400));
    expect(stepTime(third, '4/4', 'length', 'percent', -1)).toEqual(rational(132, 400));
    expect(stepTime(third, '4/4', 'length', 'tick', 1)).toEqual(rational(233, 400));
  });

  it('never goes above the bar cap', () => {
    const cap = rational(4 * MAX_DATA_BLOCK_BARS);
    expect(stepTime(cap, '4/4', 'length', 'bar', 1)).toEqual(cap);
    expect(stepTime(cap, '4/4', 'position', 'percent', 1)).toEqual(cap);
  });

  it('step units are exact: bar = barQuarters, beat = 4/denominator, tick = 1/4, percent = 1/400', () => {
    const zero = rational(0);
    expect(stepTime(zero, '7/8', 'length', 'bar', 1)).toEqual(barQuarters('7/8'));
    expect(stepTime(zero, '7/8', 'length', 'beat', 1)).toEqual(rational(1, 2));
    expect(stepTime(zero, '4/4', 'length', 'beat', 1)).toEqual(rational(1));
    expect(stepTime(zero, '4/4', 'length', 'tick', 1)).toEqual(rational(1, 4));
    expect(stepTime(zero, '4/4', 'length', 'percent', 1)).toEqual(rational(1, 400));
  });
});

describe('round trips', () => {
  it('format(parse(x)) is x for a canonical position and length', () => {
    for (const meter of ['4/4', '7/8', '3/4', '6/8']) {
      for (const text of ['1.1.1.00', '2.1.1.07', '1.2.1.99', '3.1.1.50']) {
        expect(formatPosition(pos(text, meter), meter)).toBe(text);
      }
      for (const text of ['0.0.0.00', '0.0.0.01', '2.1.0.50', '1.0.1.99']) {
        expect(formatLength(len(text, meter), meter)).toBe(text);
      }
    }
  });

  it('parse(format(q)) is q for a value on the percent grid', () => {
    const q = rational(1237, 400);
    expect(pos(formatPosition(q, '4/4'))).toEqual(q);
    expect(len(formatLength(q, '7/8'), '7/8')).toEqual(q);
  });
});

describe('partAt: the part under a character index', () => {
  const text = '12.3.4.05';
  it('maps each character to its part; a dot belongs to the part on its left', () => {
    expect(partAt(text, 0)).toBe('bar');
    expect(partAt(text, 1)).toBe('bar');
    expect(partAt(text, 2)).toBe('bar');
    expect(partAt(text, 3)).toBe('beat');
    expect(partAt(text, 4)).toBe('beat');
    expect(partAt(text, 5)).toBe('tick');
    expect(partAt(text, 6)).toBe('tick');
    expect(partAt(text, 7)).toBe('percent');
    expect(partAt(text, 8)).toBe('percent');
  });

  it('clamps outside the text', () => {
    expect(partAt(text, -3)).toBe('bar');
    expect(partAt(text, 40)).toBe('percent');
  });
});
