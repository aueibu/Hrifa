import { describe, expect, it } from 'vitest';
import { layoutChartLabels, type ChartDip } from './chartLabelLayout';
import { boxesOverlap } from './labelLayout';

const O = { bandY: 200, x0: 8, x1: 352 };
const dip = (x: number, text = '3/2', extra: Partial<ChartDip> = {}): ChartDip => ({
  x,
  y: 100,
  text,
  isFirst: false,
  isLast: false,
  ...extra,
});

describe('layoutChartLabels', () => {
  it('a well-spaced set stays in lane 0, under each dot', () => {
    const p = layoutChartLabels([dip(60), dip(160), dip(260)], O);
    expect(p.map((x) => x!.lane)).toEqual([0, 0, 0]);
    expect(p.map((x) => x!.x)).toEqual([60, 160, 260]);
    expect(p.every((x) => x!.scale === 1)).toBe(true);
    // all in the band (below its top), the leader only because the dot is far above
    expect(p.every((x) => x!.y > O.bandY)).toBe(true);
  });
  it('a dot sitting right on the band needs no leader', () => {
    const p = layoutChartLabels([dip(100, '3/2', { y: 196 })], O);
    expect(p[0]!.lane).toBe(0);
    expect(p[0]!.leader).toBe(false);
  });
  it('two dips 14 units apart go to different lanes and the lower one has a leader', () => {
    const p = layoutChartLabels([dip(100, '5/4'), dip(114, '3/2')], O);
    expect(p[0]!.lane).toBe(0);
    expect(p[1]!.lane).toBe(1);
    expect(p[1]!.leader).toBe(true);
    expect(p[1]!.y - p[0]!.y).toBeCloseTo(11);
    expect(boxesOverlap(p[0]!.box, p[1]!.box)).toBe(false);
  });
  it('clamps at the plot edges: first anchors start, last anchors end, others slide inside', () => {
    const p = layoutChartLabels(
      [dip(8, '9/8', { isFirst: true }), dip(4, '7/4'), dip(352, '2/1', { isLast: true })],
      O
    );
    expect(p[0]!.anchor).toBe('start');
    expect(p[0]!.x).toBe(8);
    expect(p[2]!.anchor).toBe('end');
    expect(p[2]!.x).toBe(352);
    for (const q of p) {
      expect(q!.box.x - q!.box.w / 2).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(q!.box.x + q!.box.w / 2).toBeLessThanOrEqual(352 + 1e-9);
    }
  });
  it('a crowded set shrinks, then drops, and never overlaps', () => {
    const many = Array.from({ length: 12 }, (_, k) => dip(100 + k * 3, '16/15'));
    const p = layoutChartLabels(many, O);
    expect(p.some((x) => x === null)).toBe(true);
    const kept = p.filter((x) => x !== null);
    for (let a = 0; a < kept.length; a++) {
      for (let b = a + 1; b < kept.length; b++) {
        expect(boxesOverlap(kept[a]!.box, kept[b]!.box)).toBe(false);
      }
    }
    // a pair that only fits when shrunk is shrunk (not dropped): three long names in three lanes plus a fourth
    const four = layoutChartLabels(
      [100, 101, 102, 103].map((x) => dip(x, '1234567')),
      O
    );
    expect(four.filter((x) => x !== null)).toHaveLength(3);
  });

  it('note labels are placed first, so a dip name never takes their spot (and gets the next lane)', () => {
    const p = layoutChartLabels([dip(100, '7/6'), dip(104, '1/1', { first: true })], O);
    expect(p[1]!.lane).toBe(0);
    expect(p[0]!.lane).toBe(1);
    expect(boxesOverlap(p[0]!.box, p[1]!.box)).toBe(false);
  });
  it('7/6 and 6/5 dips (267 and 316 c on a 344-wide plot) go to different lanes', () => {
    const xOf = (c: number) => 8 + (c / 1200) * 344;
    const p = layoutChartLabels([dip(xOf(267), '7/6'), dip(xOf(316), '6/5')], O);
    expect(p.map((q) => q!.lane)).toEqual([0, 1]);
    expect(p[1]!.leader).toBe(true);
  });
});
