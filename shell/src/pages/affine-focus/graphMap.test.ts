import { describe, expect, it } from 'vitest';
import {
  appendTrajectoryStep,
  computeClosure,
  computeImmediateFamily,
  createInitialTrajectory,
  getPresetGamut,
  parseSeedInput,
  type TransformConfig,
} from '../../lib/affine-focus';
import { buildMermaidDiagram } from './export';
import { buildFullEdgeMapSvg, computeUniverseGraphLayout } from './graphMap';

function make12EdoTriadSetup() {
  const gamut = getPresetGamut('12-edo');
  const seed = parseSeedInput('0, 4, 7', gamut).pitches;
  const config: TransformConfig = {
    gamut,
    domain: 'gamut-steps',
    rule: 'dual-focus',
    multiplier: -1,
    multiplierPlus: 1,
    multiplierMinus: -1,
    multipliers: [5],
    dualConstraint: 'swap',
    offsetMode: 'positive',
    folding: 'folded',
    quantize: 'exact',
    identity: 'unordered-set',
    focusPolicy: 'current-members',
    customFoci: [],
  };
  const closure = computeClosure(seed, config);
  let trajectory = createInitialTrajectory(seed, config);
  const firstOp = computeImmediateFamily(seed, seed, config)[0];
  trajectory = appendTrajectoryStep(trajectory, firstOp);
  return { closure, trajectory };
}

describe('graphMap & Mermaid builder', () => {
  it('computes radial rings and column layouts covering 100% of nodes and edges', () => {
    const { closure, trajectory } = make12EdoTriadSetup();

    const radial = computeUniverseGraphLayout(closure, trajectory, 'radial');
    expect(radial.nodes).toHaveLength(closure.nodes.length);
    expect(radial.edges).toHaveLength(closure.edges.length);

    const seedLayout = radial.nodeById.get(closure.seedId);
    expect(seedLayout).toBeDefined();
    expect(seedLayout?.x).toBe(radial.cx);
    expect(seedLayout?.y).toBe(radial.cy);

    // Outer generations have strictly larger ring radii
    for (let i = 1; i < radial.rings.length; i += 1) {
      expect(radial.rings[i].radius).toBeGreaterThan(radial.rings[i - 1].radius);
    }

    // Walked trajectory edge is flagged
    expect(radial.edges.some((e) => e.isOnTrajectory)).toBe(true);

    const columns = computeUniverseGraphLayout(closure, trajectory, 'columns');
    expect(columns.nodes).toHaveLength(closure.nodes.length);
    expect(columns.edges).toHaveLength(closure.edges.length);
    for (let i = 1; i < columns.columns.length; i += 1) {
      expect(columns.columns[i].x).toBeGreaterThan(columns.columns[i - 1].x);
    }

    const svg = buildFullEdgeMapSvg(radial, { title: 'Test Edge Map' });
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('id="traj-arrow"');
    expect(svg).toContain('Test Edge Map');
  });

  it('builds full and sliced Mermaid diagrams with seed/trajectory highlights', () => {
    const { closure, trajectory } = make12EdoTriadSetup();

    const full = buildMermaidDiagram(closure, { slice: 'full', trajectory });
    expect(full.nodeCount).toBe(closure.nodes.length);
    expect(full.edgeCount).toBe(closure.edges.length);
    expect(full.code).toContain('graph TD');
    expect(full.code).toContain('classDef seedNode');
    expect(full.code).toContain('classDef trajNode');

    const slicedGen = buildMermaidDiagram(closure, {
      slice: 'max-gen',
      maxGeneration: 1,
      direction: 'LR',
    });
    expect(slicedGen.code).toContain('graph LR');
    expect(slicedGen.nodeCount).toBeLessThan(full.nodeCount);
    expect(slicedGen.nodeCount).toBe(closure.nodes.filter((n) => n.generation <= 1).length);

    const trajOnly = buildMermaidDiagram(closure, { slice: 'trajectory', trajectory });
    expect(trajOnly.nodeCount).toBeGreaterThanOrEqual(2);
    expect(trajOnly.nodeCount).toBeLessThan(full.nodeCount);
  });
});
