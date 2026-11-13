import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  fitColumns,
  move,
  parseLayout,
  pin,
  unpin,
  visiblePins,
  type Layout,
} from './layout';

const px = (w: number) => w / 16;

describe('fitColumns (width in rem to pinned columns)', () => {
  it('fits none at 1700 px, so the page looks as it does without pins', () => {
    expect(fitColumns(px(1100))).toBe(0);
    expect(fitColumns(px(1500))).toBe(0);
    expect(fitColumns(px(1700))).toBe(0);
  });

  it('adds a 24 rem column for every 24.25 rem beyond rail + workspace minimum + switcher', () => {
    expect(fitColumns(px(2560))).toBe(2);
    expect(fitColumns(px(3440))).toBe(4);
    expect(fitColumns(px(3840))).toBe(5);
    // the first column appears at 98.5 + 24.25 = 122.75 rem
    expect(fitColumns(122.74)).toBe(0);
    expect(fitColumns(122.75)).toBe(1);
  });

  it('never goes negative or NaN', () => {
    expect(fitColumns(0)).toBe(0);
    expect(fitColumns(Number.NaN)).toBe(0);
  });
});

describe('visiblePins', () => {
  it('shows the pins nearest the generator first, alternating sides', () => {
    expect([...visiblePins(DEFAULT_LAYOUT, 0)]).toEqual([]);
    expect([...visiblePins(DEFAULT_LAYOUT, 1)]).toEqual(['chords']);
    expect([...visiblePins(DEFAULT_LAYOUT, 2)]).toEqual(['chords', 'lattice']);
    expect([...visiblePins(DEFAULT_LAYOUT, 3)]).toEqual(['chords', 'lattice', 'keys']);
    expect(visiblePins(DEFAULT_LAYOUT, 9).size).toBe(4);
  });
});

describe('arrangement rules', () => {
  const l: Layout = DEFAULT_LAYOUT;

  it('pins on the outer end of the emptier side (right on a tie) and ignores repeats', () => {
    const a = pin(l, 'retuner');
    expect(a).toEqual({ left: ['keys', 'chords'], right: ['lattice', 'spectrum', 'retuner'] });
    expect(pin(a, 'retuner')).toBe(a);
    const b = pin({ left: ['keys'], right: ['lattice', 'spectrum'] }, 'chords');
    expect(b.left).toEqual(['chords', 'keys']);
  });

  it('unpins', () => {
    expect(unpin(l, 'lattice')).toEqual({ left: ['keys', 'chords'], right: ['spectrum'] });
  });

  it('reorders within a side, and the screen edge stops outward moves', () => {
    expect(move(l, 'keys', 'right').left).toEqual(['chords', 'keys']);
    expect(move(l, 'keys', 'left')).toBe(l);
    expect(move(l, 'lattice', 'right').right).toEqual(['spectrum', 'lattice']);
    expect(move(l, 'spectrum', 'right')).toBe(l);
    expect(move(l, 'spectrum', 'left').right).toEqual(['spectrum', 'lattice']);
  });

  it('crosses the generator when moving inward past the innermost column', () => {
    expect(move(l, 'chords', 'right')).toEqual({
      left: ['keys'],
      right: ['chords', 'lattice', 'spectrum'],
    });
    expect(move(l, 'lattice', 'left')).toEqual({
      left: ['keys', 'chords', 'lattice'],
      right: ['spectrum'],
    });
  });
});

describe('parseLayout', () => {
  it('round-trips a good value', () => {
    const v: Layout = { left: ['chords'], right: ['keys', 'lattice'] };
    expect(parseLayout(JSON.stringify(v))).toEqual(v);
    expect(parseLayout(JSON.stringify({ left: [], right: [] }))).toEqual({ left: [], right: [] });
  });

  it('falls back to the defaults for anything invalid', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'not json',
      '5',
      '{"left":1,"right":[]}',
      '{"left":["nope"],"right":[]}',
      '{"left":["chords"],"right":["chords"]}',
      '{"left":["field"],"right":[]}',
    ]) {
      expect(parseLayout(bad)).toBe(DEFAULT_LAYOUT);
    }
  });
});
