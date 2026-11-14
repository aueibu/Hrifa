import { describe, expect, it } from 'vitest';
import { parseInterval, rotateSubset, type Note } from '../../../lib/harmonic-field';
import { KEYS, dockKeyCount, isTyping, slotOfKey, slotTarget } from './keymap';
import {
  LightCounter,
  absHz,
  chordPlan,
  fieldScalePlan,
  relHz,
  scalePlan,
  slotPitch,
  subsetChordPlan,
  type PitchBase,
} from './plan';

const N = (s: string) => parseInterval(s) as Note;
const field = ['1/1', '9/8', '5/4', '3/2'].map(N);
const OCT = N('2/1');
const rel = rotateSubset(field, [0, 1, 2, 3], 0, OCT);
const base: PitchBase = { baseHz: 100, rootC: 0, modeAtBase: true };

describe('keymap', () => {
  it('maps the three rows left to right, case-insensitively', () => {
    expect(slotOfKey('z')).toBe(0);
    expect(slotOfKey('Z')).toBe(0);
    expect(slotOfKey(',')).toBe(7);
    expect(slotOfKey('a')).toBe(10);
    expect(slotOfKey("'")).toBe(20);
    expect(slotOfKey(']')).toBe(KEYS.length - 1);
    for (const k of ['Enter', ' ', '1', 'Shift', '', 'ab']) {
      expect(slotOfKey(k)).toBe(-1);
    }
  });

  it('degree i mod n, repeat floor(i / n)', () => {
    expect(slotTarget(0, 4)).toEqual({ deg: 0, oct: 0 });
    expect(slotTarget(3, 4)).toEqual({ deg: 3, oct: 0 });
    expect(slotTarget(4, 4)).toEqual({ deg: 0, oct: 1 });
    expect(slotTarget(9, 4)).toEqual({ deg: 1, oct: 2 });
    expect(slotTarget(0, 0)).toBeNull();
    expect(slotTarget(-1, 4)).toBeNull();
    expect(slotTarget(KEYS.length, 4)).toBeNull();
    expect(slotTarget(1.5, 4)).toBeNull();
  });

  it('draws the notes plus the repeat, up to the keys there are', () => {
    expect(dockKeyCount(7)).toBe(8);
    expect(dockKeyCount(0)).toBe(1);
    expect(dockKeyCount(100)).toBe(KEYS.length);
  });

  it('does not play while typing in a field', () => {
    const el = (tag: string, type?: string) => {
      const e = document.createElement(tag);
      if (type) {
        (e as HTMLInputElement).type = type;
      }
      return e;
    };
    expect(isTyping(el('input', 'text'))).toBe(true);
    expect(isTyping(el('textarea'))).toBe(true);
    expect(isTyping(el('select'))).toBe(true);
    expect(isTyping(el('input', 'checkbox'))).toBe(false);
    expect(isTyping(el('input', 'range'))).toBe(false);
    expect(isTyping(el('button'))).toBe(false);
    expect(isTyping(null)).toBe(false);
    expect(isTyping(document)).toBe(false);
  });
});

describe('plans', () => {
  it('a key plays its degree from the 1/1 Hz, a repeat higher for the next row', () => {
    expect(slotPitch(0, rel, 1200, base)).toEqual({ hz: 100, src: 0 });
    const p2 = slotPitch(2, rel, 1200, base)!;
    expect(p2.src).toBe(2);
    expect(p2.hz).toBeCloseTo(125, 3);
    // slot 4 = the root one repeat up
    expect(slotPitch(4, rel, 1200, base)!.hz).toBeCloseTo(200, 3);
    expect(slotPitch(4, rel, 1200, base)!.src).toBe(0);
    expect(slotPitch(5, [], 1200, base)).toBeNull();
  });

  it('with the mode root NOT at 1/1 Hz, notes keep their absolute pitch', () => {
    const r1 = rotateSubset(field, [0, 1, 2, 3], 2, OCT); // root 5/4
    const fixed: PitchBase = { baseHz: 100, rootC: field[2].c, modeAtBase: false };
    expect(slotPitch(0, r1, 1200, fixed)!.hz).toBeCloseTo(125, 3);
    const atBase: PitchBase = { ...fixed, modeAtBase: true };
    expect(slotPitch(0, r1, 1200, atBase)!.hz).toBeCloseTo(100, 3);
    expect(relHz(fixed, 0)).toBeCloseTo(125, 3);
    expect(absHz(fixed, field[3].c)).toBeCloseTo(150, 3);
  });

  it('Play scale: every note then the repeat, 0.28 s apart, each tagged with its field note', () => {
    const plan = scalePlan(rel, 1200, base);
    expect(plan.map((n) => n.src)).toEqual([0, 1, 2, 3, 0]);
    [100, 112.5, 125, 150, 200].forEach((hz, i) => expect(plan[i].hz).toBeCloseTo(hz, 3));
    plan.forEach((n, i) => expect(n.delay).toBeCloseTo(i * 0.28, 9));
    expect(plan.every((n) => n.dur === 0.26)).toBe(true);
    expect(scalePlan([], 1200, base)).toEqual([]);
  });

  it('Play chord: a highlighted chord at its own pitch, quieter with more notes; else the whole subset', () => {
    const c = chordPlan(field, new Set([3, 0, 2]), base);
    expect(c.map((n) => n.src)).toEqual([0, 2, 3]);
    expect(c.map((n) => Math.round(n.hz))).toEqual([100, 125, 150]);
    expect(c.every((n) => n.delay === 0)).toBe(true);
    expect(c[0].amp).toBeLessThan(1);
    expect(chordPlan(field, new Set([99, -1]), base)).toEqual([]);
    const all = subsetChordPlan(rel, base);
    expect(all).toHaveLength(4);
    expect(all.map((n) => n.src)).toEqual([0, 1, 2, 3]);
  });
});

describe('LightCounter', () => {
  it('lights while any voice sounds that note', () => {
    const l = new LightCounter();
    expect(l.on(3)).toBe(true);
    expect(l.on(3)).toBe(false);
    expect(l.lit()).toEqual([3]);
    expect(l.off(3)).toBe(false);
    expect(l.lit()).toEqual([3]);
    expect(l.off(3)).toBe(true);
    expect(l.lit()).toEqual([]);
    // a stray off never goes negative
    expect(l.off(3)).toBe(false);
    expect(l.on(3)).toBe(true);
    l.clear();
    expect(l.lit()).toEqual([]);
  });
});

describe('scale preview direction', () => {
  const hz = (plan: { hz: number }[]) => plan.map((n) => Math.round(n.hz * 100) / 100);

  it('Up: the subset from the root, then the repeat; Up-down comes back down to the root', () => {
    const up = scalePlan(rel, 1200, base);
    expect(up.map((n) => n.src)).toEqual([0, 1, 2, 3, 0]);
    expect(up.map((n) => n.delay)).toEqual(
      [0, 0.28, 0.56, 0.84, 1.12].map((d) => expect.closeTo(d, 9))
    );
    const ud = scalePlan(rel, 1200, base, 'updown');
    expect(ud.map((n) => n.src)).toEqual([0, 1, 2, 3, 0, 3, 2, 1, 0]);
    expect(hz(ud)).toEqual([100, 112.5, 125, 150, 200, 150, 125, 112.5, 100]);
    // the default is Up
    expect(hz(scalePlan(rel, 1200, base))).toEqual(hz(scalePlan(rel, 1200, base, 'up')));
  });

  it('a field scale climbs from its first note (lifting wrapped notes by the repeat) at their own pitch', () => {
    // a key on 3/2: degrees 3/2, 27/16, 15/8, 9/4 (reduced: 9/8), in degree order
    const f = ['1/1', '9/8', '5/4', '3/2', '27/16', '15/8'].map(N);
    const key = fieldScalePlan(f, [3, 4, 5, 1], 1200, base);
    expect(key.map((n) => n.src)).toEqual([3, 4, 5, 1, 3]);
    expect(hz(key)).toEqual([150, 168.75, 187.5, 225, 300]);
    const ud = fieldScalePlan(f, [3, 4, 5, 1], 1200, base, 'updown');
    expect(ud.map((n) => n.src)).toEqual([3, 4, 5, 1, 3, 1, 5, 4, 3]);
    expect(fieldScalePlan(f, [], 1200, base)).toEqual([]);
    expect(fieldScalePlan(f, [99], 1200, base)).toEqual([]);
  });
});
