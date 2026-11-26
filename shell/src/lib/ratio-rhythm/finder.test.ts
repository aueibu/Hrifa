import { describe, expect, it } from 'vitest';
import {
  findZFixes,
  newFinderState,
  runFinder,
  sliceFinder,
  type FinderEvent,
  type FinderResult,
} from './finder';
import { ratioStr, type Ratio } from './ratios';
import { slotRatio } from './ring';
import { isZRelated } from './zring';

const set45 = [0, 9, 18, 27, 35, 36];
const names = (L: number, slots: number[]) =>
  slots.map((s) => ratioStr(slotRatio(L, s) as Ratio)).join(' ');

describe('the 45 ring set (1/1 5/4 ... rooted default)', () => {
  const state = runFinder(set45, 45, { maxMove: 8 });
  it('the cheapest fix costs 5 slots of movement and nothing cheaper works', () => {
    expect(state.done?.reason).toBe('found');
    expect(state.done?.cost).toBe(5);
    expect(state.results.length).toBeGreaterThan(0);
    expect(state.results.every((r) => r.cost === 5)).toBe(true);
  });
  it('moves two notes by 5 slots in total: 1/1 6/5 7/5 5/3 26/15 9/5 with partner 1/1 4/3 7/5 23/15 26/15 9/5', () => {
    const hit = state.results.filter((r) => r.slots.join() === '0,9,18,30,33,36');
    expect(hit.length).toBe(1);
    const r = hit[0];
    // 27 -> 30 (+3) and 35 -> 33 (-2): two notes, 5 slots
    expect(r.delta.filter((d) => d !== 0).length).toBe(2);
    expect(r.delta.reduce((a, d) => a + Math.abs(d), 0)).toBe(5);
    // ring 45 reduces to ring 15 (all slots divisible by 3)
    expect(
      names(
        15,
        r.slots.map((s) => s / 3)
      )
    ).toBe('1/1 6/5 7/5 5/3 26/15 9/5');
    expect(
      names(
        15,
        r.aligned.map((s) => s / 3)
      )
    ).toBe('1/1 4/3 7/5 23/15 26/15 9/5');
    expect(r.shared).toBe(4);
  });
  it('every result is a real Z-pair with its partner', () => {
    for (const r of state.results) {
      expect(isZRelated(r.slots, r.aligned, 45)).toBe(true);
    }
  });
});

describe('the finder runs in slices and can be cancelled', () => {
  it('slices of a few events give the same results as one run', () => {
    const whole = runFinder(set45, 45, { maxMove: 5, progressEvery: 10 });
    const gen = findZFixes(set45, 45, { maxMove: 5, progressEvery: 10 });
    const state = newFinderState();
    let slices = 0;
    for (;;) {
      let budget = 25; // an injected "deadline": 25 events per slice
      const finished = sliceFinder(gen, state, () => budget-- <= 0);
      slices++;
      if (finished) {
        break;
      }
    }
    expect(slices).toBeGreaterThan(5);
    expect(state.results.map((r: FinderResult) => r.slots.join())).toEqual(
      whole.results.map((r) => r.slots.join())
    );
    expect(state.done?.cost).toBe(5);
    expect(state.progress).not.toBeNull();
  });
  it('a deadline inside a partner search cuts it short and the same candidate is redone, with the same results', () => {
    const whole = runFinder(set45, 45, { maxMove: 5 });
    let calls = 0;
    const shouldStop = () => ++calls % 2 === 0; // fires on every second check, never reads a clock
    const gen = findZFixes(set45, 45, { maxMove: 5, shouldStop });
    const state = newFinderState();
    let slices = 0;
    // each slice runs until the injected check fires, as a frame deadline would
    while (!sliceFinder(gen, state, shouldStop)) {
      slices++;
    }
    expect(calls).toBeGreaterThan(0);
    expect(slices).toBeGreaterThan(0);
    expect(state.results.map((r) => r.slots.join())).toEqual(
      whole.results.map((r) => r.slots.join())
    );
    expect(state.done?.cost).toBe(5);
    expect(state.done?.abortedSearches).toBe(0);
  });
  it('searches that hit their step budget are counted in abortedSearches (cheapest not proven)', () => {
    const s = runFinder(set45, 45, { maxMove: 5, partnerCap: 50 });
    expect(s.done?.abortedSearches).toBeGreaterThan(0);
    expect(runFinder(set45, 45, { maxMove: 5 }).done?.abortedSearches).toBe(0);
  });
  it('stops testing a level once maxResults is reached', () => {
    const few = runFinder(set45, 45, { maxMove: 8, maxResults: 2 });
    const all = runFinder(set45, 45, { maxMove: 8 });
    expect(few.results.length).toBe(2);
    expect(few.done?.tested).toBeLessThan(all.done?.tested ?? 0);
  });
  it('a candidate budget stops it with reason budget', () => {
    const s = runFinder(set45, 45, { maxMove: 8, maxCandidates: 30 });
    expect(s.done?.reason).toBe('budget');
    expect(s.done?.candidates).toBe(30);
    expect(s.results).toEqual([]);
  });
  it('stopping the generator cancels it (no more work after return)', () => {
    const gen = findZFixes(set45, 45, { maxMove: 8, progressEvery: 1 });
    const events: FinderEvent[] = [];
    events.push(gen.next().value as FinderEvent);
    events.push(gen.next().value as FinderEvent);
    gen.return();
    expect(gen.next().done).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['progress', 'progress']);
  });
  it('gives up with reason exhausted when the limit is too small', () => {
    const s = runFinder(set45, 45, { maxMove: 2 });
    expect(s.done?.reason).toBe('exhausted');
    expect(s.done?.cost).toBeNull();
  });
});

describe('the worked example on 72 (1/1 10/9 9/8 5/4 3/2)', () => {
  const A = [0, 8, 9, 18, 36];
  it('adding one onset with no movement works at pulse 36, 54 and 56 (slots 35, 53, 55)', () => {
    const s = runFinder(A, 72, { maxMove: 0, addOne: true, maxResults: 100 });
    expect(s.done?.cost).toBe(0);
    const added = s.results.map((r) => r.added).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(added.map((x) => (x ?? 0) + 1)).toEqual([36, 54, 56]);
  });
  it('moving alone needs 8 slots', () => {
    const s = runFinder(A, 72, { maxMove: 9 });
    expect(s.done?.cost).toBe(8);
  });
});
