import { describe, expect, it } from 'vitest';
import { makeDocker, setDockerSizing } from '../../../lib/stage';
import { arrangementA, screenset } from '../../../lib/stage/fixtures';
import { layoutTree } from './dockLayout';
import { dockerSizing, toggledSizing } from './dockSizing';

describe('docker sizing', () => {
  const s = screenset(arrangementA);
  const geo = layoutTree(s, 100, 50);

  it('tells fixed from flexible slots, and the root has none', () => {
    expect(dockerSizing(s.tree, 'd3')).toBe('fixed');
    expect(dockerSizing(s.tree, 'd2')).toBe('flexible');
    expect(dockerSizing(s.tree, 'd1')).toBe('flexible');
    expect(dockerSizing(makeDocker('r', 'R'), 'r')).toBeNull();
  });

  it('makes a flexible docker fixed at its measured length', () => {
    const own = geo.dockers.find((p) => p.docker.id === 'd2')!;
    const fixed = toggledSizing(s, geo, 'd2') as { rem: number };
    expect(fixed.rem).toBeCloseTo(own.width, 1);
  });

  it('makes a fixed docker flexible with a weight that keeps its share', () => {
    const back = toggledSizing(s, geo, 'd3') as { weight: number };
    expect(back).toHaveProperty('weight');
    const flexible = setDockerSizing(s, 'd3', back);
    const after = layoutTree(flexible, 100, 50).dockers.find((p) => p.docker.id === 'd3')!;
    const before = geo.dockers.find((p) => p.docker.id === 'd3')!;
    expect(after.width).toBeCloseTo(before.width, 0);
  });

  it('is null for a docker with no slot or an unknown id', () => {
    expect(toggledSizing(s, geo, 'nope')).toBeNull();
  });
});
