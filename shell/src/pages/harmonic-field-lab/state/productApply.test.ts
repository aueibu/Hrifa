import { describe, expect, it } from 'vitest';
import { fmtRatio } from '../../../lib/harmonic-field';
import { defaultGen } from './generate';
import { MAX_TABS, activeTab, initialState, labReducer, type LabState } from './labState';

// P1 (SCENARIOS.M8g): the major triad on itself, Up, Steps 1
const P1 = ['1/1', '9/8', '5/4', '3/2', '25/16', '15/8'];
const ratios = (s: LabState) => activeTab(s).field.map((n) => fmtRatio(n));
const selRatios = (s: LabState) => activeTab(s).sel.map((i) => ratios(s)[i]);
const sorted = (a: string[]) => [...a].sort();

const relativeTab = (): LabState => {
  let s = initialState();
  s = labReducer(s, { type: 'gen/method', method: 'relative' });
  return labReducer(s, { type: 'relative/add', text: '7/4' });
};

describe('product/tab', () => {
  it.each([
    ['a non-Relative tab', initialState],
    ['a Relative tab', relativeTab],
  ])('opens a new Relative tab of 1/1 and the products from %s', (_n, make) => {
    const before = make();
    const s = labReducer(before, { type: 'product/tab', pitches: P1 });
    expect(s.tabs).toHaveLength(2);
    expect(s.active).toBe(1);
    expect(s.tabs[0]).toBe(before.tabs[0]);
    expect(activeTab(s).gen.method).toBe('relative');
    expect(sorted(ratios(s))).toEqual(sorted(P1));
    expect(sorted(selRatios(s))).toEqual(sorted(P1));
  });

  it('adds 1/1 when the products leave it out', () => {
    const s = labReducer(initialState(), { type: 'product/tab', pitches: ['9/8', '3/2'] });
    expect(sorted(ratios(s))).toEqual(sorted(['1/1', '9/8', '3/2']));
    expect(sorted(selRatios(s))).toEqual(sorted(['9/8', '3/2']));
  });

  it('refuses at the tab cap and changes nothing but the message', () => {
    let s = initialState();
    while (s.tabs.length < MAX_TABS) {
      s = labReducer(s, { type: 'tab/add' });
    }
    const out = labReducer(s, { type: 'product/tab', pitches: P1 });
    expect(out.tabs).toBe(s.tabs);
    expect(out.relative.message).toMatch(/tabs/);
  });
});

describe('product/replace', () => {
  it('turns a non-Relative tab into a Relative tab of 1/1 and the products', () => {
    const before = initialState();
    const s = labReducer(before, { type: 'product/replace', pitches: P1 });
    expect(s.tabs).toHaveLength(1);
    expect(activeTab(s).gen.method).toBe('relative');
    expect(activeTab(s).gen.preset).toBe('');
    expect(sorted(ratios(s))).toEqual(sorted(P1));
    expect(sorted(selRatios(s))).toEqual(sorted(P1));
    // the saved library is untouched
    expect(s.library).toBe(before.library);
  });

  it('replaces the notes of a Relative tab (the old ones go, 1/1 stays)', () => {
    const s = labReducer(relativeTab(), { type: 'product/replace', pitches: ['9/8', '3/2'] });
    expect(sorted(ratios(s))).toEqual(sorted(['1/1', '9/8', '3/2']));
    expect(activeTab(s).gen.notes).toContain('1/1');
    expect(activeTab(s).gen.notes).not.toContain('7/4');
  });

  it('refuses over the 256-note limit and leaves the field alone', () => {
    const many = Array.from({ length: 300 }, (_, i) => `${1000 + i}/${999}`);
    const before = initialState();
    const s = labReducer(before, { type: 'product/replace', pitches: many });
    expect(activeTab(s).field).toBe(activeTab(before).field);
    expect(s.relative.message).toBeTruthy();
    expect(defaultGen().method).not.toBe('relative');
  });
});
