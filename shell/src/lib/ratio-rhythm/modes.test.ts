import { describe, expect, it } from 'vitest';
import {
  commonGrid,
  equalCycles,
  equalPulse,
  fingerprint,
  modeTable,
  oddHarmonicForm,
  rerootMode,
} from './modes';
import { parseRatios, ratioStr } from './ratios';
import { gapsOf, linearRing, rotateRing } from './ring';

const example = parseRatios('1/1 10/9 9/8 5/4 3/2').ratios;

describe('Canon 3 mode table', () => {
  const table = modeTable(example);
  const expected: [string, string[], number, number[]][] = [
    ['1/1', ['1/1', '10/9', '9/8', '5/4', '3/2'], 72, [8, 1, 9, 18, 36]],
    ['10/9', ['1/1', '81/80', '9/8', '27/20', '9/5'], 80, [1, 9, 18, 36, 16]],
    ['9/8', ['1/1', '10/9', '4/3', '16/9', '160/81'], 81, [9, 18, 36, 16, 2]],
    ['5/4', ['1/1', '6/5', '8/5', '16/9', '9/5'], 45, [9, 18, 8, 1, 9]],
    ['3/2', ['1/1', '4/3', '40/27', '3/2', '5/3'], 54, [18, 8, 1, 9, 18]],
  ];
  it.each(expected)('root %s', (root, ratios, L, gaps) => {
    const m = table.find((x) => ratioStr(x.root) === root)!;
    expect(m.ratios.map(ratioStr)).toEqual(ratios);
    expect(m.ring.L).toBe(L);
    expect(m.gaps).toEqual(gaps);
  });
  it('fingerprint is 72, 80, 81, 45, 54', () => {
    expect(fingerprint(example)).toEqual([72, 80, 81, 45, 54]);
  });
  it('odd-harmonic form is {5, 9, 27, 45, 81}, the same in every mode', () => {
    expect(oddHarmonicForm(example)).toEqual([5, 9, 27, 45, 81]);
    for (const root of example) {
      expect(oddHarmonicForm(rerootMode(example, root)!.ratios)).toEqual([5, 9, 27, 45, 81]);
    }
  });
});

describe('rotation vs re-rooting are different operations', () => {
  it('rotating onto 9/8 keeps ring 72; re-rooting gives ring 81 with other gaps', () => {
    const ring = linearRing(example)!;
    const rot = rotateRing(ring, -ring.slots[2]);
    expect(rot.L).toBe(72);
    expect(gapsOf(rot.slots, rot.L)).toEqual([9, 18, 36, 8, 1]);
    const re = rerootMode(example, example[2])!;
    expect(re.ring.L).toBe(81);
    expect(re.gaps).toEqual([9, 18, 36, 16, 2]);
  });
});

describe('equal cycles vs equal pulse', () => {
  it('common grid is 6,480', () => {
    expect(commonGrid(example)).toBe(6480n);
    const ec = equalCycles(example);
    expect(ec).not.toBeNull();
    if (!ec) {
      return;
    }
    expect(ec.grid).toBe(6480);
    expect(ec.modes[0].slots).toEqual([0, 720, 810, 1620, 3240]);
    expect(ec.modes[2].slots).toEqual([0, 720, 2160, 5040, 6320]);
  });
  it('equal-pulse lengths are 72, 80, 81, 90, 108 tatums', () => {
    const ep = equalPulse(example)!;
    expect(ep.map((m) => m.length)).toEqual([72, 80, 81, 90, 108]);
    expect(ep.map((m) => m.rootHarmonic)).toEqual([72, 80, 81, 90, 108]);
    expect(ep[0].slots).toEqual([0, 8, 9, 18, 36]);
    expect(ep[3].slots).toEqual([0, 18, 54, 70, 72]);
    expect(ep[4].slots).toEqual([0, 36, 52, 54, 72]);
  });
  it('equal pulse onsets are the equal-cycle onsets scaled by the mode length', () => {
    const ep = equalPulse(example)!;
    const modes = modeTable(example);
    ep.forEach((m, i) => {
      const f = m.length / modes[i].ring.L;
      expect(modes[i].ring.slots.map((s) => s * f)).toEqual(m.slots);
    });
  });
});
