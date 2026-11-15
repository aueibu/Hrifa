import { describe, expect, it } from 'vitest';
import { initialState, labReducer, type Action, type LabState } from './labState';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const stash = (s: LabState, c = 0): LabState =>
  run(s, {
    type: 'shelf/stash',
    stash: { pitches: [{ m: null, c }], template: null, rootDeg: 0, date: '2026-11-15' },
  });
const withChords = (n: number) =>
  Array.from({ length: n }).reduce<LabState>((s, _, i) => stash(s, i), initialState());

describe('keys runtime state', () => {
  it('starts at shift 0, page 0, no link; the new ui fields default to Notes and off', () => {
    const s = initialState();
    expect(s.keys).toEqual({ shift: 0, page: 0, link: null });
    expect(s.ui.keyboardMode).toBe('notes');
    expect(s.ui.linkedMelody).toBe(false);
  });

  it('keys/shift moves one repeat at a time and clamps at +/-4', () => {
    let s = initialState();
    for (let i = 0; i < 7; i++) {
      s = run(s, { type: 'keys/shift', by: 1 });
    }
    expect(s.keys.shift).toBe(4);
    expect(run(s, { type: 'keys/shift', by: 1 })).toBe(s);
    s = run(s, { type: 'keys/shift', by: -9 });
    expect(s.keys.shift).toBe(-4);
  });

  it('keys/page pages the shelf by ten and clamps to its pages', () => {
    let s = withChords(12);
    s = run(s, { type: 'keys/page', by: -1 });
    expect(s.keys.page).toBe(0);
    s = run(s, { type: 'keys/page', by: 1 });
    expect(s.keys.page).toBe(1);
    s = run(s, { type: 'keys/page', by: 1 });
    expect(s.keys.page).toBe(1);
    s = run(s, { type: 'keys/page', by: -1 });
    expect(s.keys.page).toBe(0);
    // a one-page shelf has nowhere to go
    expect(run(withChords(10), { type: 'keys/page', by: 1 }).keys.page).toBe(0);
  });

  it('the link ends on a mode change, an option change and a tab switch, but not on an unrelated ui change', () => {
    const linked = run(withChords(1), { type: 'keys/link', id: 'c1' });
    expect(linked.keys.link).toBe('c1');
    expect(run(linked, { type: 'ui', patch: { volume: 0.3 } }).keys.link).toBe('c1');
    expect(run(linked, { type: 'ui', patch: { keyboardMode: 'split' } }).keys.link).toBeNull();
    expect(run(linked, { type: 'ui', patch: { linkedMelody: true } }).keys.link).toBeNull();
    const two = run(linked, { type: 'tab/add' });
    expect(two.active).toBe(1);
    expect(two.keys.link).toBeNull();
    // the shift is a runtime setting: a tab switch keeps it
    const shifted = run(two, { type: 'keys/shift', by: 2 }, { type: 'tab/switch', index: 0 });
    expect(shifted.keys.shift).toBe(2);
  });
});
