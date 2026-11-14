import { describe, expect, it } from 'vitest';
import {
  boxesOverlap,
  chevronBox,
  layoutLabels,
  leaderEnds,
  type LabelItem,
  type LabelOptions,
} from './labelLayout';

const SIZE = 300;
const C = SIZE / 2;
const PAD = 44;
const polar = (cents: number, r: number) => {
  const a = (cents / 1200) * 2 * Math.PI - Math.PI / 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};
const opts = (obstacles: LabelOptions['obstacles'] = []): LabelOptions => ({
  cx: C,
  cy: C,
  laneStep: 22,
  lanes: 3,
  advance: 6.6,
  subAdvance: 5.4,
  lineH: 12,
  subH: 10,
  subDy: 10,
  pad: 5.5,
  obstacles,
  bounds: { x0: -PAD, y0: -PAD, x1: SIZE + PAD, y1: SIZE + PAD },
});

/** Place the labels with the root (index `root`) first and its chevron as an obstacle, as the ring does. */
function run(cents: number[], texts: string[], root: number, sub = false) {
  const order = cents.map((_, i) => i).sort((a, b) => (a === root ? -1 : b === root ? 1 : a - b));
  const dot = polar(cents[root], 104);
  const chev = chevronBox(C, C, dot.x, dot.y, 8);
  const items: LabelItem[] = order.map((i) => ({
    ...polar(cents[i], 134),
    text: texts[i],
    sub: sub ? '+12.3' : undefined,
  }));
  const out = layoutLabels(items, opts([chev]));
  return { out, chev };
}

function expectClean(out: ReturnType<typeof layoutLabels>, chev: ReturnType<typeof chevronBox>) {
  out.forEach((p, i) => {
    expect(p.crowded).toBe(false);
    expect(boxesOverlap(p.box, chev)).toBe(false);
    for (let j = i + 1; j < out.length; j++) {
      expect(boxesOverlap(p.box, out[j].box)).toBe(false);
    }
    expect(p.box.x - p.box.w / 2).toBeGreaterThanOrEqual(-PAD);
    expect(p.box.x + p.box.w / 2).toBeLessThanOrEqual(SIZE + PAD);
  });
}

describe('label layout round a ring', () => {
  it('a sparse field keeps every label on its natural spot, with no leaders', () => {
    const { out } = run([0, 300, 600, 900], ['1/1', '6/5', '7/5', '5/3'], 0);
    // the root's own label may step out for its chevron, the others stay put
    expect(out.slice(1).every((p) => p.lane === 0 && !p.leader && p.scale === 1)).toBe(true);
  });

  it('31-EDO (31 labels): no two label boxes overlap and none touches the root chevron, for any root', () => {
    const cents = Array.from({ length: 31 }, (_, i) => (i * 1200) / 31);
    const texts = cents.map((_, i) => `${String(i).padStart(2, '0')}c31`);
    for (const root of [0, 1, 8, 15, 22, 30]) {
      const { out, chev } = run(cents, texts, root);
      expectClean(out, chev);
    }
  });

  it('19-EDO with a second (offset) line on every label is also clean', () => {
    const cents = Array.from({ length: 19 }, (_, i) => (i * 1200) / 19);
    const texts = cents.map((_, i) => `${i}c31`);
    const { out, chev } = run(cents, texts, 0, true);
    expectClean(out, chev);
  });

  it('JI with 5/4 and 81/64 close together: the one of them moves off its natural spot and gets a leader', () => {
    const cents = [0, 203.9, 386.3, 407.8, 498.0, 701.96, 884.4, 1088.3];
    const texts = ['1/1', '9/8', '5/4', '81/64', '4/3', '3/2', '5/3', '15/8'];
    const { out, chev } = run(cents, texts, 0);
    expectClean(out, chev);
    // after the root, items 2 and 3 are 5/4 and 81/64, 14 px apart on the ring
    expect(out[2].leader || out[3].leader).toBe(true);
  });

  it('the root label clears a chevron placed right on its natural spot', () => {
    const dot = polar(0, 104);
    const chev = chevronBox(C, C, dot.x, dot.y, 8);
    const [p] = layoutLabels([{ ...polar(0, 134), text: '1/1' }], opts([chev]));
    expect(boxesOverlap(p.box, chev)).toBe(false);
  });

  it('shrinks before overlapping when no lane fits, and flags it as crowded only as a last resort', () => {
    const items: LabelItem[] = Array.from({ length: 6 }, () => ({
      ...polar(0, 134),
      text: '81/64',
    }));
    const out = layoutLabels(items, { ...opts(), lanes: 2 });
    expect(out.some((p) => p.scale < 1)).toBe(true);
    expect(out.some((p) => p.crowded)).toBe(true);
  });

  it('leader ends start off the dot and stop short of the label, along the line between them', () => {
    const e = leaderEnds(0, 0, 30, 40);
    expect(Math.hypot(e.x1, e.y1)).toBeCloseTo(7);
    expect(Math.hypot(e.x2 - 30, e.y2 - 40)).toBeCloseTo(7);
    expect(e.x1 / e.y1).toBeCloseTo(0.75);
  });
});
