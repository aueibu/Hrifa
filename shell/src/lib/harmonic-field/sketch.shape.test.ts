import { describe, expect, it } from 'vitest';
import { parseInterval } from './intervals';
import { chordShape, exactShape, placeShape, realizeTemplate, sketchShape } from './sketch';
import type { Note } from './types';

const N = (s: string) => parseInterval(s) as Note;
/** A 12-EDO field built by hand: steps of 100 cents (irrational notes). */
const edo: Note[] = Array.from({ length: 12 }, (_, i) => ({ m: null, c: i * 100 }));
const OCT = N('2/1');
const cents = (ns: readonly Note[]) => ns.map((n) => Math.round(n.c * 10) / 10);

describe('shapes', () => {
  it('exactShape is the template over its root; placeShape puts it on a note', () => {
    expect(cents(exactShape('4:5:6')!)).toEqual([0, 386.3, 702]);
    expect(cents(placeShape(edo[2], exactShape('4:5:6')!))).toEqual([200, 586.3, 902]);
    expect(exactShape('junk')).toBeNull();
  });

  it('chordShape is root position: field notes as intervals above the root, ascending, a member below it lifted by the repeat', () => {
    expect(cents(chordShape(edo, OCT, 0, [0, 4, 7])!)).toEqual([0, 400, 700]);
    expect(cents(chordShape(edo, OCT, 9, [9, 1, 4])!)).toEqual([0, 400, 700]);
    // G major, G(700) B(1100) D(200): stacked above G the D is 1400, not the chip's 200
    const g = chordShape(edo, OCT, 7, [7, 11, 2])!;
    expect(cents(g)).toEqual([0, 400, 700]);
    expect(cents(placeShape(edo[7], g))).toEqual([700, 1100, 1400]);
    expect(chordShape(edo, OCT, 99, [0])).toBeNull();
    // rigid: 4:5:6 as 12-EDO has it, moved to a 200 c note
    expect(cents(placeShape(edo[2], chordShape(edo, OCT, 0, [0, 4, 7])!))).toEqual([200, 600, 900]);
  });

  it('realizeTemplate snaps each pitch to the nearest field note within tolerance, else stays exact', () => {
    expect(cents(realizeTemplate(edo, OCT, edo[0], '4:5:6', 18)!)).toEqual([0, 400, 700]);
    // 7/4 (968.8 c) is 31 c from 1000: outside an 18 c tolerance, so it stays exact
    expect(cents(realizeTemplate(edo, OCT, edo[0], '4:5:6:7', 18)!)).toEqual([0, 400, 700, 968.8]);
    expect(cents(realizeTemplate(edo, OCT, edo[0], '4:5:6:7', 40)!)).toEqual([0, 400, 700, 1000]);
  });

  it('sketchShape: exact ignores the realization; field uses the armed shape, else the realized template', () => {
    const armed = chordShape(edo, OCT, 0, [0, 3, 7])!;
    expect(cents(sketchShape(edo, OCT, edo[0], '4:5:6', armed, 18, 'field')!)).toEqual([
      0, 300, 700,
    ]);
    expect(cents(sketchShape(edo, OCT, edo[0], '4:5:6', armed, 18, 'exact')!)).toEqual([
      0, 386.3, 702,
    ]);
    expect(cents(sketchShape(edo, OCT, edo[0], '4:5:6', null, 18, 'field')!)).toEqual([
      0, 400, 700,
    ]);
    expect(cents(sketchShape(edo, OCT, undefined, '4:5:6', null, 18, 'field')!)).toEqual([
      0, 386.3, 702,
    ]);
  });
});
