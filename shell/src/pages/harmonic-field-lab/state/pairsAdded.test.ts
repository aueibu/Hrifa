import { describe, expect, it } from 'vitest';
import { checkAddedPitch, defaultUi, initialState, labReducer as reduce } from './labState';
import { sanitizeSettings } from './persist';

describe('the Pairs added pitches (settings.v1 pairsAdded, H-20)', () => {
  it('default none; old stored data without the field loads as none', () => {
    expect(defaultUi().pairsAdded).toEqual([]);
    expect(sanitizeSettings({ panel: 'keys' }).pairsAdded).toEqual([]);
    expect(sanitizeSettings(null).pairsAdded).toEqual([]);
    for (const bad of ['3/2', 7, {}, true]) {
      expect(sanitizeSettings({ pairsAdded: bad }).pairsAdded).toEqual([]);
    }
  });

  it('round trip keeps the canonical texts', () => {
    const stored = JSON.parse(JSON.stringify({ pairsAdded: ['3/2', '700 c', '5/4'] }));
    expect(sanitizeSettings(stored).pairsAdded).toEqual(['3/2', '700 c', '5/4']);
  });

  it('junk entries dropped, more than 4 cut, a duplicate dropped', () => {
    expect(sanitizeSettings({ pairsAdded: ['3/2', 'abc', 5, '6/4', '5/4'] }).pairsAdded).toEqual([
      '3/2',
      '5/4',
    ]);
    expect(
      sanitizeSettings({ pairsAdded: ['1 c', '2 c', '3 c', '4 c', '5 c'] }).pairsAdded
    ).toEqual(['1 c', '2 c', '3 c', '4 c']);
  });

  it('unknown extra fields are still not kept', () => {
    expect(sanitizeSettings({ pairsAdded: ['3/2'], mystery: 1 })).not.toHaveProperty('mystery');
  });

  it('reducer: add runs the checks against the current subset, remove by index', () => {
    const s0 = initialState();
    const t = s0.tabs[s0.active];
    const note = t.field[t.sel[0]];
    expect(note).toBeDefined();
    const bad = reduce(s0, { type: 'pairs/addPitch', text: 'abc' });
    expect(bad).toBe(s0);
    expect(checkAddedPitch(s0, 'abc')).toMatchObject({ ok: false, kind: 'bad' });
    // a subset note's own place is refused
    expect(checkAddedPitch(s0, `${note.c} c`)).toMatchObject({ ok: false, kind: 'subset' });
    const s1 = reduce(s0, { type: 'pairs/addPitch', text: '123.456' });
    expect(s1.ui.pairsAdded).toEqual(['123.456 c']);
    expect(reduce(s1, { type: 'pairs/addPitch', text: '123.456 c' })).toBe(s1); // duplicate ignored
    expect(reduce(s1, { type: 'pairs/removePitch', index: 5 })).toBe(s1);
    expect(reduce(s1, { type: 'pairs/removePitch', index: 0 }).ui.pairsAdded).toEqual([]);
  });
});
