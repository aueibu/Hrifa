import { describe, expect, it } from 'vitest';
import { catalog } from './pitchSets';
import {
  edgeOffset,
  phaseCircle,
  scatterGroups,
  strength,
  tonnetzEdges,
  tonnetzPc,
  tonnetzStart,
  tonnetzStats,
  tonnetzTriangles,
} from './spaces';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

describe('Tonnetz', () => {
  it('starts the fifths axis at the bottom of the longest chain of fifths', () => {
    // F C G D A E B is one chain, so the major scale starts at F
    expect(tonnetzStart(MAJOR)).toBe(5);
    expect(tonnetzStart([0, 4, 7])).toBe(0);
    expect(tonnetzStart([])).toBe(0);
  });

  it('lays fifths along a and major thirds along b', () => {
    expect(tonnetzPc(0, 1, 0)).toBe(7);
    expect(tonnetzPc(0, 0, 1)).toBe(4);
    expect(tonnetzPc(0, 1, 1)).toBe(11);
  });

  it('finds the triads of a set as filled triangles', () => {
    const p0 = tonnetzStart(MAJOR);
    const tris = tonnetzTriangles(p0, [new Set(MAJOR)]);
    // the lattice repeats pitch classes, so each of the six diatonic triads shows up at least once
    expect(tris.length).toBeGreaterThanOrEqual(6);
    expect(tonnetzTriangles(p0, [new Set([0, 2, 6])])).toEqual([]);
  });

  it('draws edges only between notes both present, and lists which sets own them', () => {
    const edges = tonnetzEdges(0, [new Set([0, 7]), new Set([0, 4, 7])]);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.some((e) => e.sets.length === 2)).toBe(true);
    expect(edges.some((e) => e.sets.length === 1 && e.sets[0] === 1)).toBe(true);
  });

  it('fans overlapping edges symmetrically', () => {
    expect([0, 1, 2].map((i) => edgeOffset(i, 3))).toEqual([-3.2, 0, 3.2]);
    expect(edgeOffset(0, 1)).toBe(0);
  });

  it('counts connected pieces and major and minor triads', () => {
    expect(tonnetzStats(MAJOR)).toEqual({ pieces: 1, maj: 3, min: 3 });
    expect(tonnetzStats([0, 4, 7])).toEqual({ pieces: 1, maj: 1, min: 0 });
    expect(tonnetzStats([0, 2, 6]).pieces).toBeGreaterThan(1);
  });
});

describe('set-class map', () => {
  it('measures strength from 0 to 1', () => {
    expect(strength([0, 2, 4, 6, 8, 10], 6)).toBeCloseTo(1);
    expect(strength([0, 4, 8], 3)).toBeCloseTo(1);
    expect(strength([0, 3, 6, 9], 1)).toBeCloseTo(0);
    expect(strength([], 1)).toBe(0);
  });

  it('puts every class on the map, and classes with the same interval vector on the same point', () => {
    const rows = catalog(6, true, 'rahn');
    const groups = scatterGroups(6, 5, 3, 'rahn');
    expect(groups.reduce((s, g) => s + g.rows.length, 0)).toBe(rows.length);
    expect(groups.length).toBeLessThan(rows.length);
    const groupOf = (key: string) => groups.findIndex((g) => g.rows.some((r) => r.key === key));
    rows.forEach((r) => {
      rows
        .filter((o) => o.icv.join() === r.icv.join())
        .forEach((o) => expect(groupOf(o.key)).toBe(groupOf(r.key)));
    });
  });

  it('puts Z-related partners on exactly the same point', () => {
    // 4-Z15 and 4-Z29 share an interval vector
    const groups = scatterGroups(4, 5, 3, 'rahn');
    const holding = (forte: string) => groups.find((g) => g.rows.some((r) => r.forte === forte));
    expect(holding('4-Z15')).toBeDefined();
    expect(holding('4-Z15')).toBe(holding('4-Z29'));
  });
});

describe('phase circles', () => {
  it('has strength 1 and points straight up for a single note on pitch class 0', () => {
    const c = phaseCircle([0], 1);
    expect(c.strength).toBeCloseTo(1);
    expect(c.mean[0]).toBeCloseTo(0);
    expect(c.mean[1]).toBeCloseTo(-1);
  });

  it('keeps strength under transposition but moves the phase', () => {
    const a = phaseCircle(MAJOR, 5);
    const b = phaseCircle(
      MAJOR.map((p) => (p + 1) % 12),
      5
    );
    expect(b.strength).toBeCloseTo(a.strength);
    expect(b.mean[0]).not.toBeCloseTo(a.mean[0]);
  });

  it('puts the diatonic set strongest on component 5', () => {
    const s = [1, 2, 3, 4, 5, 6].map((k) => phaseCircle(MAJOR, k).strength);
    expect(Math.max(...s)).toBe(s[4]);
  });
});
