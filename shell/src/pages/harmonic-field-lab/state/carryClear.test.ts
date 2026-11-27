import { describe, expect, it } from 'vitest';
import { fmtRatio } from '../../../lib/harmonic-field';
import { activeTab, initialState, labReducer, type LabState } from './labState';

// arcs/harmonic-field-lab/ARC.md, scenarios 1 to 8
const SEVEN = '1 3/2 1170/931 27/16 1755/931 729/512 142155/119168';
const ratios = (s: LabState) => activeTab(s).field.map((n) => fmtRatio(n));
const sortedRatios = (s: LabState) => [...ratios(s)].sort();
const method = (s: LabState, m: 'custom' | 'relative' | 'edo' | 'harmonic') =>
  labReducer(s, { type: 'gen/method', method: m });
const pasted = (): LabState =>
  labReducer(initialState(), { type: 'gen/custom', custom: SEVEN, rep: '2/1' });

describe('carrying a scale between Cust and Rel', () => {
  it('1: a pasted Cust scale arrives in Rel with the same 7 notes', () => {
    const cust = pasted();
    expect(ratios(cust)).toHaveLength(7);
    const rel = method(cust, 'relative');
    expect(activeTab(rel).gen.method).toBe('relative');
    expect(sortedRatios(rel)).toEqual(sortedRatios(cust));
    expect(activeTab(rel).gen.notes).toHaveLength(7);
  });

  it('2: a Rel scale shows in Cust as text, one pitch per line', () => {
    // the default tab is Harmonic, so Rel starts from its notes: Clear for a fresh 1/1
    let s = labReducer(method(initialState(), 'relative'), { type: 'gen/clear' });
    s = labReducer(s, { type: 'relative/add', text: '7/4' });
    s = labReducer(s, { type: 'relative/add', text: '3/2' });
    const cust = method(s, 'custom');
    expect(activeTab(cust).gen.custom).toBe('3/2\n7/4');
    expect(sortedRatios(cust)).toEqual(sortedRatios(s));
  });

  it('3: an EDO field shows in Cust as cents, and builds the same pitches', () => {
    let s = method(initialState(), 'edo');
    s = labReducer(s, { type: 'gen/patch', patch: { edoN: 12 } });
    const cust = labReducer(s, { type: 'gen/makeCust' });
    expect(activeTab(cust).gen.method).toBe('custom');
    const text = activeTab(cust).gen.custom;
    expect(text.split('\n')).toHaveLength(11);
    expect(text.split('\n')[0]).toBe('100c');
    expect(activeTab(cust).field.map((n) => Math.round(n.c))).toEqual(
      activeTab(s).field.map((n) => Math.round(n.c))
    );
  });

  it('4: a ratio field (harmonic) shows in Cust as ratios', () => {
    const s = method(initialState(), 'harmonic');
    const cust = labReducer(s, { type: 'gen/makeCust' });
    expect(activeTab(cust).gen.custom).toMatch(/\d+\/\d+/);
    expect(sortedRatios(cust)).toEqual(sortedRatios(s));
  });

  it('clicking Cust or Rel from a generated mode never overwrites hand-made text', () => {
    const edo = method(pasted(), 'edo');
    const back = method(edo, 'custom');
    expect(activeTab(back).gen.custom).toBe(SEVEN);
    expect(sortedRatios(back)).toEqual(sortedRatios(pasted()));
  });

  it('Make cust replaces Cust text with the field and does nothing in Cust', () => {
    const cust = pasted();
    expect(labReducer(cust, { type: 'gen/makeCust' })).toBe(cust);
    const made = labReducer(method(cust, 'edo'), { type: 'gen/makeCust' });
    expect(activeTab(made).gen.custom.split('\n')[0]).toBe('100c');
  });

  it('7 and 8: Cust to Rel to Cust to Rel loses nothing', () => {
    const a = method(method(pasted(), 'relative'), 'custom');
    expect(sortedRatios(a)).toEqual(sortedRatios(pasted()));
    expect(sortedRatios(method(a, 'relative'))).toEqual(sortedRatios(pasted()));
  });
});

describe('Clear', () => {
  it('5: Cust becomes empty text and a 1-note field', () => {
    const s = labReducer(pasted(), { type: 'gen/clear' });
    expect(activeTab(s).gen.custom).toBe('');
    expect(ratios(s)).toEqual(['1/1']);
  });

  it('6: Rel keeps only 1/1', () => {
    const rel = method(pasted(), 'relative');
    const s = labReducer(rel, { type: 'gen/clear' });
    expect(activeTab(s).gen.notes).toEqual(['1/1']);
    expect(ratios(s)).toEqual(['1/1']);
  });

  it('does nothing in a generated mode', () => {
    const s = method(initialState(), 'edo');
    expect(labReducer(s, { type: 'gen/clear' })).toBe(s);
  });
});
