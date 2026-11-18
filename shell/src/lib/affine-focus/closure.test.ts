import { describe, expect, it } from 'vitest';
import {
  appendTrajectoryStep,
  applyFocusTransform,
  computeClosure,
  computeImmediateFamily,
  createInitialTrajectory,
  findShortestTransformPath,
  getPresetGamut,
  parseSeedInput,
  searchDualFocusMaps,
  traceTrajectoryVoices,
  truncateTrajectoryAt,
  type TransformConfig,
} from './index';

function baseConfig(overrides: Partial<TransformConfig> = {}): TransformConfig {
  return {
    gamut: getPresetGamut('12-edo'),
    domain: 'gamut-steps',
    rule: 'single-focus',
    multiplier: 5,
    multiplierPlus: 1,
    multiplierMinus: -1,
    multipliers: [1, 5, 7],
    dualConstraint: 'swap',
    offsetMode: 'positive',
    folding: 'folded',
    quantize: 'exact',
    identity: 'unordered-set',
    focusPolicy: 'current-members',
    customFoci: [],
    ...overrides,
  };
}

describe('affine-focus M2: closure, SCC orbits, dual-focus solver & trajectory', () => {
  it('computes finite BFS closure without duplicate nodes and detects saturation', () => {
    const edo12 = getPresetGamut('12-edo');
    const seed = parseSeedInput('0, 4, 7', edo12).pitches;
    const cfg = baseConfig({ gamut: edo12, multiplier: 5 });
    const graph = computeClosure(seed, cfg);

    expect(graph.saturated).toBe(true);
    expect(graph.terminationReason).toBe('saturated');
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(graph.generations[0]).toEqual([graph.seedId]);
    expect(graph.sccs.length).toBeGreaterThan(0);
  });

  it('distinguishes safety-limit truncation from true saturation', () => {
    const edo12 = getPresetGamut('12-edo');
    const seed = parseSeedInput('0, 1, 4, 6', edo12).pitches;
    const cfg = baseConfig({ gamut: edo12, multiplier: 5, focusPolicy: 'all-gamut' });
    const truncated = computeClosure(seed, cfg, { maxNodes: 3, maxEdges: 100, maxGeneration: 10 });

    expect(truncated.saturated).toBe(false);
    expect(truncated.terminationReason).toBe('maxNodes');
    expect(truncated.saturationGeneration).toBeNull();
  });

  it('computes dual-focus edge reflection (P/L/R Tonnetz closure) and shortest transform paths', () => {
    const edo12 = getPresetGamut('12-edo');
    const seed = parseSeedInput('0, 4, 7', edo12).pitches;
    const cfg = baseConfig({
      gamut: edo12,
      rule: 'dual-focus',
      focusPolicy: 'current-members',
    });
    const graph = computeClosure(seed, cfg);

    // Major/minor triads under P, L, R form a single reversible 24-triad Hexatonic/Weitzmann/Tonnetz groupoid component!
    expect(graph.saturated).toBe(true);
    expect(graph.nodes.length).toBe(24);
    expect(graph.sccs).toHaveLength(1);
    expect(graph.sccs[0].isAttractor).toBe(true);

    // Shortest path from C major {0,4,7} to F minor {0,5,8} under P/L/R takes 2 edge reflections:
    // {0,4,7} --P(0,7)--> {0,3,7} --R(0,3)--> {0,3,8} --L(0,8)--> {0,5,8} (or similar shortest path)
    const targetNode = graph.nodes.find((n) => n.pitches.map((p) => p.index).join(',') === '0,5,8');
    expect(targetNode).toBeDefined();
    const path = findShortestTransformPath(graph, graph.seedId, targetNode!.id);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    expect(path![0].source).toBe(graph.seedId);
    expect(path![path!.length - 1].target).toBe(targetNode!.id);
  });

  it('searches dual-focus affine maps satisfying fix-both, swap, and preserve-axis', () => {
    const edo12 = getPresetGamut('12-edo');
    const seed = parseSeedInput('0, 4, 7', edo12).pitches;

    const swapMaps = searchDualFocusMaps(
      0,
      7,
      seed,
      baseConfig({ dualConstraint: 'swap' }),
      null,
      true
    );
    expect(swapMaps.length).toBeGreaterThan(0);
    // g(x) = 11x + 7 mod 12 swaps 0 <-> 7 and maps {0, 4, 7} -> {0, 3, 7}
    const plrP = swapMaps.find((m) => m.a === 11 && m.b === 7);
    expect(plrP).toBeDefined();
    expect(plrP!.transformedSeed.map((p) => p.index)).toEqual([0, 3, 7]);

    const fixMaps = searchDualFocusMaps(
      0,
      6,
      seed,
      baseConfig({ dualConstraint: 'fix-both' }),
      null,
      true
    );
    // Maps fixing both 0 and 6 in mod 12 include a=1,b=0 and a=7,b=0
    expect(fixMaps.some((m) => m.a === 1 && m.b === 0)).toBe(true);
    expect(fixMaps.some((m) => m.a === 7 && m.b === 0)).toBe(true);
  });

  it('manages step-by-step trajectory chains and rewinding', () => {
    const ji7 = getPresetGamut('7-ji-ptolemy');
    const seed = parseSeedInput('1/1, 5/4, 3/2', ji7).pitches;
    const cfg = baseConfig({ gamut: ji7, domain: 'gamut-steps', multiplier: 2 });

    let traj = createInitialTrajectory(seed, cfg);
    expect(traj).toHaveLength(1);

    const fam1 = computeImmediateFamily(traj[0].pitches, seed, cfg);
    traj = appendTrajectoryStep(traj, fam1[0]);
    expect(traj).toHaveLength(2);
    expect(traj[1].pitches.map((p) => p.label)).toEqual(['1/1', '9/8', '3/2']);

    traj = truncateTrajectoryAt(traj, 0);
    expect(traj).toHaveLength(1);
  });

  it('traces voices through a trajectory under Map vs Smoothest and Accumulate vs Fold', () => {
    const edo12 = getPresetGamut('12-edo');
    const seed = parseSeedInput('0, 4, 7', edo12).pitches;
    const cfg = baseConfig({
      gamut: edo12,
      domain: 'gamut-steps',
      rule: 'dual-focus',
      dualConstraint: 'swap',
      folding: 'folded',
    });

    // Step 1: Dual-Focus P on {0, 7} -> {0, 3, 7} (C->G, E->Eb, G->C)
    const step1 = applyFocusTransform(seed, [seed[0], seed[2]], cfg);
    // Step 2: Dual-Focus L on {0, 3} -> {0, 3, 8} (C->Eb, Eb->C, G->Ab)
    const step2 = applyFocusTransform(
      step1.outputPitches,
      [step1.outputPitches[0], step1.outputPitches[1]],
      cfg
    );

    let traj = createInitialTrajectory(seed, cfg);
    traj = appendTrajectoryStep(traj, step1);
    traj = appendTrajectoryStep(traj, step2);

    // 1. Map + Fold: follows rule swaps inside [0, 1200)
    const mapFold = traceTrajectoryVoices(traj, 1200, 'map', 'fold');
    expect(mapFold.voices.map((v) => v.points.map((p) => p.cents))).toEqual([
      [0, 700, 800],
      [400, 300, 0],
      [700, 0, 300],
    ]);

    // 2. Map + Accumulate: shortest-arc drift across octaves
    const mapAcc = traceTrajectoryVoices(traj, 1200, 'map', 'accumulate');
    expect(mapAcc.voices.map((v) => v.points.map((p) => p.cents))).toEqual([
      [0, -500, -400],
      [400, 300, 0],
      [700, 1200, 1500],
    ]);
    expect(mapAcc.stepCents).toEqual([
      [0, 400, 700],
      [-500, 300, 1200],
      [-400, 0, 1500],
    ]);

    // 3. Smoothest + Accumulate: holds common tones cleanly
    const smoothAcc = traceTrajectoryVoices(traj, 1200, 'smoothest', 'accumulate');
    expect(smoothAcc.voices.map((v) => v.points.map((p) => p.cents))).toEqual([
      [0, 0, 0],
      [400, 300, 300],
      [700, 700, 800],
    ]);

    // Focus markers on S0 should mark {0, 7} (indices 0 and 2)
    expect(smoothAcc.voices.map((v) => v.points[0].isFocusForNext)).toEqual([true, false, true]);
  });

  it('handles degenerate cardinality collapse cleanly in voice traces', () => {
    const edo12 = getPresetGamut('12-edo');
    const seed = parseSeedInput('0, 4, 7', edo12).pitches;
    const cfg = baseConfig({ gamut: edo12, multiplier: 0 });
    const collapse = applyFocusTransform(seed, [seed[1]], cfg); // collapses onto {4}

    let traj = createInitialTrajectory(seed, cfg);
    traj = appendTrajectoryStep(traj, collapse);

    const trace = traceTrajectoryVoices(traj, 1200, 'smoothest', 'accumulate');
    expect(trace.voices.map((v) => v.points[1].cents)).toEqual([400, 400, 400]);
    expect(trace.stepCents[1]).toEqual([400]);
  });
});
