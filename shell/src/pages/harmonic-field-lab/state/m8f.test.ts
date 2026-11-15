/** M8f pure tests: fold state in settings.v1, the composite item family, and the silent root keys' slot mapping. */
import { describe, expect, it } from 'vitest';
import { ratioNote } from '../../../lib/harmonic-field';
import { slotTarget } from '../audio/keymap';
import { MAX_FAMILY_CHARS, compositesReduce, emptyComposites, sanitizeDetail } from './composites';
import { compositesToStored, sanitizeComposites } from './compositeStore';
import { MAX_FOLDS, MAX_FOLD_ID, sanitizeFolds, sanitizeSettings } from './persist';

describe('ui.folds in settings.v1 (scenarios i, k)', () => {
  it('absent, old or damaged data is all open; only true entries with a short id survive', () => {
    expect(sanitizeSettings({}).folds).toEqual({});
    expect(sanitizeSettings({ folds: 'x' }).folds).toEqual({});
    expect(sanitizeSettings({ folds: [true] }).folds).toEqual({});
    expect(
      sanitizeFolds({ positional: true, 'size:Triads': true, bad: 'yes', off: false })
    ).toEqual({ positional: true, 'size:Triads': true });
    expect(sanitizeFolds({ ['x'.repeat(MAX_FOLD_ID + 1)]: true, '': true })).toEqual({});
  });

  it('is capped in size', () => {
    expect(MAX_FOLDS).toBe(256);
    const many = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`f${i}`, true]));
    expect(Object.keys(sanitizeFolds(many))).toHaveLength(MAX_FOLDS);
  });

  it('a stored fold comes back through the settings, next to the other prefs', () => {
    const s = sanitizeSettings({ folds: { positional: true }, positionalOrder: 'scale' });
    expect(s.folds).toEqual({ positional: true });
    expect(s.positionalOrder).toBe('scale');
  });
});

describe('composite item family (scenario l)', () => {
  it('is trimmed and cut to 80 characters, and absent when empty or not text', () => {
    expect(sanitizeDetail({ family: '  Septimal ' })?.family).toBe('Septimal');
    expect(sanitizeDetail({ family: 'x'.repeat(200) })?.family).toHaveLength(MAX_FAMILY_CHARS);
    expect('family' in (sanitizeDetail({ family: '   ' }) ?? {})).toBe(false);
    expect('family' in (sanitizeDetail({ family: 7 }) ?? {})).toBe(false);
    // an old detail keeps its shape exactly
    expect(sanitizeDetail({ template: '4:5:6', root: '1/1', pattern: null, tail: null })).toEqual({
      template: '4:5:6',
      root: '1/1',
      pattern: null,
      tail: null,
    });
  });

  it('is written to composites.v1 only when set and read back; old items load unchanged', () => {
    const D = '2026-11-15T10:00:00.000Z';
    const pitches = [ratioNote(1, 1), ratioNote(5, 3), ratioNote(7, 3)];
    const base = { kind: 'chord' as const, label: 'x', pitches, rep: ratioNote(2, 1) };
    let s = compositesReduce(emptyComposites(), {
      type: 'composite/addItem',
      to: 'new',
      item: {
        ...base,
        label: 'with family',
        detail: { template: '3:5:7', root: '3/1', family: 'Septimal' },
      },
      date: D,
    });
    s = compositesReduce(s, {
      type: 'composite/addItem',
      to: 1,
      item: {
        ...base,
        label: 'without',
        pitches: [ratioNote(1, 1), ratioNote(5, 4), ratioNote(3, 2)],
        detail: { template: '4:5:6', root: '1/1' },
      },
      date: D,
    });
    const stored = JSON.stringify(compositesToStored(s));
    const j = JSON.parse(stored) as {
      composites: { items: { detail: Record<string, unknown> }[] }[];
    };
    expect(j.composites[0].items[0].detail.family).toBe('Septimal');
    expect('family' in j.composites[0].items[1].detail).toBe(false);
    const back = sanitizeComposites(JSON.parse(stored));
    expect(back?.list[0].items[0].detail?.family).toBe('Septimal');
    expect(back?.list[0].items[1].detail?.family).toBeUndefined();
  });
});

describe('silent root keys use slotTarget (scenarios a, c)', () => {
  it('x is degree 2 of 7 and the eighth key (a) is degree 1 again', () => {
    expect(slotTarget(1, 7)?.deg).toBe(1);
    expect(slotTarget(0, 7)?.deg).toBe(0);
    expect(slotTarget(7, 7)?.deg).toBe(0);
    expect(slotTarget(0, 0)).toBeNull();
  });
});
