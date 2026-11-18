import { computeImmediateFamily } from './transform';
import { canonicalPitchListKey, pitchIdentityKey } from './tunings';
import type {
  ClosureEdge,
  ClosureGraph,
  ClosureLimits,
  ClosureNode,
  GamutPitch,
  StronglyConnectedOrbit,
  TransformConfig,
} from './types';

export const DEFAULT_CLOSURE_LIMITS: ClosureLimits = {
  maxNodes: 256,
  maxEdges: 4096,
  maxGeneration: 24,
};

function canonicalizeSeed(pitches: readonly GamutPitch[], config: TransformConfig): GamutPitch[] {
  if (config.identity === 'ordered-tuple') {
    return [...pitches];
  }
  const sorted = [...pitches].sort((a, b) =>
    config.folding === 'folded' ? a.foldedCents - b.foldedCents : a.unfoldedCents - b.unfoldedCents
  );
  const seen = new Set<string>();
  const out: GamutPitch[] = [];
  for (const p of sorted) {
    const k = pitchIdentityKey(p, config.folding);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

export function computeStronglyConnectedOrbits(
  nodes: ClosureNode[],
  edges: ClosureEdge[]
): StronglyConnectedOrbit[] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const rawGroups: string[][] = [];

  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n.id, []);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
  }

  function strongConnect(v: string) {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    const neighbors = adj.get(v) ?? [];
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const group: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        group.push(w);
      } while (w !== v);
      rawGroups.push(group);
    }
  }

  for (const n of nodes) {
    if (!indices.has(n.id)) {
      strongConnect(n.id);
    }
  }

  const nodeToScc = new Map<string, number>();
  rawGroups.forEach((g, idx) => {
    for (const id of g) {
      nodeToScc.set(id, idx);
    }
  });

  for (const n of nodes) {
    n.sccId = nodeToScc.get(n.id) ?? 0;
  }

  return rawGroups.map((nodeIds, id) => {
    const memberSet = new Set(nodeIds);
    let leavesComponent = false;
    let hasInternalEdge = false;
    for (const e of edges) {
      if (memberSet.has(e.source)) {
        if (!memberSet.has(e.target)) {
          leavesComponent = true;
        } else {
          hasInternalEdge = true;
        }
      }
    }
    return {
      id,
      nodeIds,
      isAttractor: !leavesComponent && hasInternalEdge,
      hasCycle: nodeIds.length > 1 || hasInternalEdge,
    };
  });
}

export function computeClosure(
  seedPitches: readonly GamutPitch[],
  config: TransformConfig,
  limits: ClosureLimits = DEFAULT_CLOSURE_LIMITS
): ClosureGraph {
  const canonicalSeed = canonicalizeSeed(seedPitches, config);
  const seedId = canonicalPitchListKey(canonicalSeed, config.identity, config.folding);

  const nodeByKey = new Map<string, ClosureNode>();
  const edgeByKey = new Map<string, ClosureEdge>();
  const edges: ClosureEdge[] = [];

  const seedNode: ClosureNode = {
    id: seedId,
    pitches: canonicalSeed,
    generation: 0,
    discoveredOrder: 0,
    isSeed: true,
    isFixedUnderAnyFocus: false,
    fixedFocusLabels: [],
    sccId: 0,
    parents: [],
  };
  nodeByKey.set(seedId, seedNode);

  const queue: ClosureNode[] = [seedNode];
  let head = 0;
  let terminationReason: ClosureGraph['terminationReason'] = 'saturated';

  while (head < queue.length) {
    const current = queue[head];
    head += 1;

    if (current.generation >= limits.maxGeneration) {
      terminationReason = 'maxGeneration';
      continue;
    }

    const family = computeImmediateFamily(current.pitches, canonicalSeed, config);
    for (const op of family) {
      const targetId = op.canonicalKey;
      const focusLabel =
        config.rule === 'dual-focus' && op.focusPitches.length >= 2
          ? `{${op.focusPitches[0].label},${op.focusPitches[1].label}}`
          : (op.focusPitches[0]?.label ?? '0');

      if (op.isSelfLoop) {
        current.isFixedUnderAnyFocus = true;
        if (!current.fixedFocusLabels.includes(focusLabel)) {
          current.fixedFocusLabels.push(focusLabel);
        }
      }

      if (!nodeByKey.has(targetId)) {
        if (nodeByKey.size >= limits.maxNodes) {
          terminationReason = 'maxNodes';
          continue;
        }
        const nextNode: ClosureNode = {
          id: targetId,
          pitches: op.outputPitches,
          generation: current.generation + 1,
          discoveredOrder: nodeByKey.size,
          isSeed: false,
          isFixedUnderAnyFocus: false,
          fixedFocusLabels: [],
          sccId: 0,
          parents: [current.id],
        };
        nodeByKey.set(targetId, nextNode);
        queue.push(nextNode);
      } else {
        const existing = nodeByKey.get(targetId)!;
        if (current.id !== targetId && !existing.parents.includes(current.id)) {
          existing.parents.push(current.id);
        }
      }

      const edgeId = `${current.id}->${targetId}|${op.operationId}`;
      if (!edgeByKey.has(edgeId)) {
        if (edges.length >= limits.maxEdges) {
          terminationReason = 'maxEdges';
          break;
        }
        const edge: ClosureEdge = {
          id: edgeId,
          source: current.id,
          target: targetId,
          operationId: op.operationId,
          operationLabel: op.operationLabel,
          focusIndices: op.focusIndices,
          focusLabel,
          multiplier: op.multiplierUsed,
          isSelfLoop: op.isSelfLoop,
          result: op,
        };
        edgeByKey.set(edgeId, edge);
        edges.push(edge);
      }
    }

    if (terminationReason === 'maxEdges') {
      break;
    }
  }

  const nodes = [...nodeByKey.values()];
  const maxGen = nodes.reduce((m, n) => Math.max(m, n.generation), 0);
  const generations: string[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (const n of nodes) {
    generations[n.generation].push(n.id);
  }

  const sccs = computeStronglyConnectedOrbits(nodes, edges);
  const saturated = terminationReason === 'saturated';

  return {
    seedId,
    nodes,
    edges,
    generations,
    sccs,
    saturated,
    saturationGeneration: saturated ? maxGen : null,
    terminationReason,
  };
}

/**
 * Finds a shortest directed sequence of transform edges from `fromNodeId` to `toNodeId`.
 */
export function findShortestTransformPath(
  graph: ClosureGraph,
  fromNodeId: string,
  toNodeId: string
): ClosureEdge[] | null {
  if (fromNodeId === toNodeId) {
    return [];
  }
  const adj = new Map<string, ClosureEdge[]>();
  for (const n of graph.nodes) {
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!e.isSelfLoop) {
      adj.get(e.source)?.push(e);
    }
  }

  const visited = new Set<string>([fromNodeId]);
  const prevEdge = new Map<string, ClosureEdge>();
  const queue: string[] = [fromNodeId];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    for (const edge of adj.get(cur) ?? []) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        prevEdge.set(edge.target, edge);
        if (edge.target === toNodeId) {
          const path: ClosureEdge[] = [];
          let stepNode = toNodeId;
          while (stepNode !== fromNodeId) {
            const pe = prevEdge.get(stepNode)!;
            path.unshift(pe);
            stepNode = pe.source;
          }
          return path;
        }
        queue.push(edge.target);
      }
    }
  }

  return null;
}
