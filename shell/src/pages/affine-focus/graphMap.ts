import type {
  ClosureEdge,
  ClosureGraph,
  ClosureNode,
  TrajectoryStep,
} from '../../lib/affine-focus';
import { radixHex } from '../../theme/radix';
import { defaultThemeTokens } from '../../theme/tokens';
import type { GraphMapLayout } from './state';

export type GraphLabelMode = 'auto' | 'path' | 'all' | 'none';

export interface GraphNodeLayout {
  node: ClosureNode;
  x: number;
  y: number;
  r: number;
  angle: number;
  label: string;
  isOnTrajectory: boolean;
  trajectoryIndices: number[];
  inDegree: number;
  outDegree: number;
}

export interface GraphEdgeLayout {
  edge: ClosureEdge;
  pathD: string;
  isOnTrajectory: boolean;
  isSelfLoop: boolean;
  isMutual: boolean;
}

export interface GraphRingGuide {
  generation: number;
  radius: number;
  count: number;
  labelX: number;
  labelY: number;
  showLabel: boolean;
}

export interface GraphColumnGuide {
  generation: number;
  x: number;
  count: number;
}

export interface UniverseGraphLayout {
  mode: GraphMapLayout;
  width: number;
  height: number;
  cx: number;
  cy: number;
  viewBox: string;
  maxGeneration: number;
  rings: GraphRingGuide[];
  columns: GraphColumnGuide[];
  nodes: GraphNodeLayout[];
  edges: GraphEdgeLayout[];
  nodeById: Map<string, GraphNodeLayout>;
}

export interface SvgPalette {
  bg: string;
  guide: string;
  text: string;
  textMuted: string;
  edge: string;
  edgeTrajectory: string;
  edgeSelected: string;
  nodeFill: string;
  nodeStroke: string;
  seedFill: string;
  trajectoryFill: string;
  selectedStroke: string;
  attractorStroke: string;
}

export const DEFAULT_EXPORT_PALETTE: SvgPalette = {
  bg: defaultThemeTokens.dark[9],
  guide: defaultThemeTokens.dark[7],
  text: defaultThemeTokens.dark[0],
  textMuted: defaultThemeTokens.dark[2],
  edge: defaultThemeTokens.dark[4],
  edgeTrajectory: radixHex('dark', 'blue', 9),
  edgeSelected: radixHex('dark', 'green', 9),
  nodeFill: defaultThemeTokens.dark[8],
  nodeStroke: defaultThemeTokens.dark[4],
  seedFill: radixHex('dark', 'yellow', 9),
  trajectoryFill: radixHex('dark', 'blue', 9),
  selectedStroke: radixHex('dark', 'green', 9),
  attractorStroke: radixHex('dark', 'cyan', 9),
};

function fmt(n: number): string {
  return n.toFixed(1);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatNodeSetLabel(node: ClosureNode): string {
  return `{${node.pitches.map((p) => p.label).join(', ')}}`;
}

function edgeOpacityForCount(edgeCount: number): number {
  if (edgeCount <= 80) {
    return 0.42;
  }
  if (edgeCount <= 300) {
    return 0.28;
  }
  if (edgeCount <= 1200) {
    return 0.16;
  }
  return 0.1;
}

function computeQuadraticEdgePath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  cx: number,
  cy: number,
  parallelIndex: number,
  parallelTotal: number,
  isMutual: boolean,
  mode: GraphMapLayout
): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-3) {
    return `M ${fmt(sx)} ${fmt(sy)} L ${fmt(tx)} ${fmt(ty)}`;
  }

  // Unit perpendicular vector pointing to the "left" of source -> target
  const nx = -dy / dist;
  const ny = dx / dist;
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;

  const centeredIdx = parallelIndex - (parallelTotal - 1) / 2;
  let offset = centeredIdx * 16;

  if (parallelTotal === 1) {
    if (isMutual) {
      offset = Math.min(28, Math.max(10, dist * 0.13));
    } else if (mode === 'radial') {
      // Gently curve edges away from passing straight through the seed center
      const toCenterX = cx - mx;
      const toCenterY = cy - my;
      const side = toCenterX * nx + toCenterY * ny;
      const sign = side >= 0 ? -1 : 1;
      offset = sign * Math.min(24, Math.max(8, dist * 0.08));
    } else {
      offset = Math.min(20, Math.max(6, dist * 0.06));
    }
  } else if (isMutual && Math.abs(offset) < 8) {
    offset += offset >= 0 ? 10 : -10;
  }

  const ctrlX = mx + nx * offset;
  const ctrlY = my + ny * offset;
  return `M ${fmt(sx)} ${fmt(sy)} Q ${fmt(ctrlX)} ${fmt(ctrlY)} ${fmt(tx)} ${fmt(ty)}`;
}

function computeSelfLoopPath(
  x: number,
  y: number,
  cx: number,
  cy: number,
  nodeR: number,
  loopIndex: number,
  mode: GraphMapLayout
): string {
  let baseAngle = -Math.PI / 2;
  if (mode === 'radial') {
    const dx = x - cx;
    const dy = y - cy;
    if (Math.hypot(dx, dy) > 1) {
      baseAngle = Math.atan2(dy, dx);
    }
  }
  const angle = baseAngle + loopIndex * 0.35;
  const loopDist = nodeR + 15;
  const spread = 0.55;
  const c1x = x + Math.cos(angle - spread) * loopDist;
  const c1y = y + Math.sin(angle - spread) * loopDist;
  const c2x = x + Math.cos(angle + spread) * loopDist;
  const c2y = y + Math.sin(angle + spread) * loopDist;
  const ax = x + Math.cos(angle - 0.15) * (nodeR * 0.7);
  const ay = y + Math.sin(angle - 0.15) * (nodeR * 0.7);
  const bx = x + Math.cos(angle + 0.15) * (nodeR * 0.7);
  const by = y + Math.sin(angle + 0.15) * (nodeR * 0.7);
  return `M ${fmt(ax)} ${fmt(ay)} C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(bx)} ${fmt(by)}`;
}

export function computeUniverseGraphLayout(
  closure: ClosureGraph,
  trajectory: readonly TrajectoryStep[],
  mode: GraphMapLayout
): UniverseGraphLayout {
  const maxGeneration = Math.max(0, closure.generations.length - 1);
  const nodeCount = closure.nodes.length;

  const trajIndicesByNode = new Map<string, number[]>();
  const trajEdgeKeysExact = new Set<string>();
  const trajEdgeKeysPair = new Set<string>();
  for (let i = 0; i < trajectory.length; i += 1) {
    const step = trajectory[i];
    const existing = trajIndicesByNode.get(step.canonicalKey) ?? [];
    existing.push(step.index);
    trajIndicesByNode.set(step.canonicalKey, existing);
    if (i > 0) {
      const prev = trajectory[i - 1];
      const opId = step.fromStepResult?.operationId ?? '';
      trajEdgeKeysExact.add(`${prev.canonicalKey}=>${step.canonicalKey}::${opId}`);
      trajEdgeKeysPair.add(`${prev.canonicalKey}=>${step.canonicalKey}`);
    }
  }

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  const directedPairSet = new Set<string>();
  const edgesByPair = new Map<string, ClosureEdge[]>();

  for (const e of closure.edges) {
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    const pairKey = `${e.source}=>${e.target}`;
    directedPairSet.add(pairKey);
    const bucket = edgesByPair.get(pairKey);
    if (bucket) {
      bucket.push(e);
    } else {
      edgesByPair.set(pairKey, [e]);
    }
  }

  const baseR = nodeCount <= 32 ? 9.5 : nodeCount <= 120 ? 6.2 : nodeCount <= 400 ? 4.2 : 3.0;

  // Group nodes by generation and sort stably by (sccId, discoveredOrder)
  const nodesByGen = new Map<number, ClosureNode[]>();
  for (const n of closure.nodes) {
    const arr = nodesByGen.get(n.generation);
    if (arr) {
      arr.push(n);
    } else {
      nodesByGen.set(n.generation, [n]);
    }
  }
  for (const arr of nodesByGen.values()) {
    arr.sort((a, b) =>
      a.sccId !== b.sccId ? a.sccId - b.sccId : a.discoveredOrder - b.discoveredOrder
    );
  }

  let width = 1040;
  let height = 1040;
  let cx = 520;
  let cy = 520;
  const rings: GraphRingGuide[] = [];
  const columns: GraphColumnGuide[] = [];
  const nodes: GraphNodeLayout[] = [];
  const nodeById = new Map<string, GraphNodeLayout>();

  if (mode === 'radial') {
    const rMin = maxGeneration <= 1 ? 240 : 78;
    const rMax = 456;

    for (let g = 0; g <= maxGeneration; g += 1) {
      const genNodes = nodesByGen.get(g) ?? [];
      if (g === 0) {
        rings.push({
          generation: 0,
          radius: 0,
          count: genNodes.length,
          labelX: cx,
          labelY: cy,
          showLabel: false,
        });
        genNodes.forEach((n, idx) => {
          const offsetX = genNodes.length === 1 ? 0 : (idx - (genNodes.length - 1) / 2) * 24;
          const trajIndices = trajIndicesByNode.get(n.id) ?? [];
          const layoutNode: GraphNodeLayout = {
            node: n,
            x: cx + offsetX,
            y: cy,
            r: baseR + 2.5,
            angle: -Math.PI / 2,
            label: formatNodeSetLabel(n),
            isOnTrajectory: trajIndices.length > 0,
            trajectoryIndices: trajIndices,
            inDegree: inDeg.get(n.id) ?? 0,
            outDegree: outDeg.get(n.id) ?? 0,
          };
          nodes.push(layoutNode);
          nodeById.set(n.id, layoutNode);
        });
        continue;
      }

      const radius =
        maxGeneration === 1
          ? rMin
          : rMin + ((g - 1) / Math.max(1, maxGeneration - 1)) * (rMax - rMin);
      const ringStep = maxGeneration <= 1 ? rMin : (rMax - rMin) / Math.max(1, maxGeneration - 1);
      const labelAngle = -Math.PI / 4;
      const showLabel = ringStep >= 18 || g === 1 || g === maxGeneration || g % 3 === 0;
      rings.push({
        generation: g,
        radius,
        count: genNodes.length,
        labelX: cx + Math.cos(labelAngle) * radius,
        labelY: cy + Math.sin(labelAngle) * radius,
        showLabel,
      });

      const angleTwist = g * 0.23;
      genNodes.forEach((n, idx) => {
        const angle =
          -Math.PI / 2 + angleTwist + (idx / Math.max(1, genNodes.length)) * Math.PI * 2;
        const trajIndices = trajIndicesByNode.get(n.id) ?? [];
        const r = trajIndices.length > 0 ? baseR + 1.5 : baseR;
        const layoutNode: GraphNodeLayout = {
          node: n,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          r,
          angle,
          label: formatNodeSetLabel(n),
          isOnTrajectory: trajIndices.length > 0,
          trajectoryIndices: trajIndices,
          inDegree: inDeg.get(n.id) ?? 0,
          outDegree: outDeg.get(n.id) ?? 0,
        };
        nodes.push(layoutNode);
        nodeById.set(n.id, layoutNode);
      });
    }
  } else {
    const colCount = maxGeneration + 1;
    const maxPerCol = Math.max(1, ...Array.from(nodesByGen.values(), (arr) => arr.length));
    const colSpacing = colCount <= 6 ? 155 : colCount <= 16 ? 105 : 82;
    const padX = 72;
    const padY = 64;
    width = Math.max(960, (colCount - 1) * colSpacing + padX * 2);
    height = Math.max(600, Math.min(2000, maxPerCol * 18 + padY * 2));
    cx = width / 2;
    cy = height / 2;

    for (let g = 0; g <= maxGeneration; g += 1) {
      const genNodes = nodesByGen.get(g) ?? [];
      const x =
        colCount === 1 ? width / 2 : padX + (g / Math.max(1, colCount - 1)) * (width - padX * 2);
      columns.push({ generation: g, x, count: genNodes.length });

      const usableH = height - padY * 2;
      genNodes.forEach((n, idx) => {
        const y =
          genNodes.length === 1 ? height / 2 : padY + ((idx + 0.5) / genNodes.length) * usableH;
        const trajIndices = trajIndicesByNode.get(n.id) ?? [];
        const r = n.isSeed ? baseR + 2.5 : trajIndices.length > 0 ? baseR + 1.5 : baseR;
        const layoutNode: GraphNodeLayout = {
          node: n,
          x,
          y,
          r,
          angle: 0,
          label: formatNodeSetLabel(n),
          isOnTrajectory: trajIndices.length > 0,
          trajectoryIndices: trajIndices,
          inDegree: inDeg.get(n.id) ?? 0,
          outDegree: outDeg.get(n.id) ?? 0,
        };
        nodes.push(layoutNode);
        nodeById.set(n.id, layoutNode);
      });
    }
  }

  const edges: GraphEdgeLayout[] = [];
  for (const [pairKey, bucket] of edgesByPair.entries()) {
    const first = bucket[0];
    const src = nodeById.get(first.source);
    const tgt = nodeById.get(first.target);
    if (!src || !tgt) {
      continue;
    }
    const isMutual =
      first.source !== first.target && directedPairSet.has(`${first.target}=>${first.source}`);
    bucket.forEach((edge, idx) => {
      const exactTraj = trajEdgeKeysExact.has(`${pairKey}::${edge.operationId}`);
      const fallbackTraj = !exactTraj && trajEdgeKeysPair.has(pairKey);
      const isOnTrajectory = exactTraj || (fallbackTraj && idx === 0);
      const pathD =
        edge.source === edge.target
          ? computeSelfLoopPath(src.x, src.y, cx, cy, src.r, idx, mode)
          : computeQuadraticEdgePath(
              src.x,
              src.y,
              tgt.x,
              tgt.y,
              cx,
              cy,
              idx,
              bucket.length,
              isMutual,
              mode
            );
      edges.push({
        edge,
        pathD,
        isOnTrajectory,
        isSelfLoop: edge.source === edge.target,
        isMutual,
      });
    });
  }

  return {
    mode,
    width,
    height,
    cx,
    cy,
    viewBox: `0 0 ${width} ${height}`,
    maxGeneration,
    rings,
    columns,
    nodes,
    edges,
    nodeById,
  };
}

export function shouldShowNodeLabel(
  node: GraphNodeLayout,
  totalNodes: number,
  labelMode: GraphLabelMode
): boolean {
  if (labelMode === 'none') {
    return false;
  }
  if (labelMode === 'all') {
    return true;
  }
  if (labelMode === 'path') {
    return node.node.isSeed || node.isOnTrajectory;
  }
  if (totalNodes <= 45) {
    return true;
  }
  return node.node.isSeed || node.isOnTrajectory;
}

export function buildFullEdgeMapSvg(
  layout: UniverseGraphLayout,
  options: {
    labelMode?: GraphLabelMode;
    selectedNodeId?: string | null;
    palette?: Partial<SvgPalette>;
    title?: string;
  } = {}
): string {
  const palette: SvgPalette = { ...DEFAULT_EXPORT_PALETTE, ...(options.palette ?? {}) };
  const labelMode = options.labelMode ?? 'auto';
  const selectedId = options.selectedNodeId ?? null;
  const totalNodes = layout.nodes.length;
  const baseEdgeOpacity = edgeOpacityForCount(layout.edges.length);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${layout.viewBox}" width="${layout.width}" height="${layout.height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">`,
  ];

  if (options.title) {
    lines.push(`  <title>${escapeXml(options.title)}</title>`);
  }

  lines.push(
    '  <defs>',
    `    <marker id="traj-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
    `      <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="${palette.edgeTrajectory}" />`,
    '    </marker>',
    '  </defs>',
    `  <rect width="${layout.width}" height="${layout.height}" fill="${palette.bg}" />`
  );

  // Guides
  lines.push('  <g class="guides">');
  if (layout.mode === 'radial') {
    for (const ring of layout.rings) {
      if (ring.radius <= 0) {
        continue;
      }
      lines.push(
        `    <circle cx="${fmt(layout.cx)}" cy="${fmt(layout.cy)}" r="${fmt(ring.radius)}" fill="none" stroke="${palette.guide}" stroke-width="1" stroke-dasharray="3 4" />`
      );
      if (ring.showLabel) {
        lines.push(
          `    <text x="${fmt(ring.labelX + 4)}" y="${fmt(ring.labelY - 3)}" fill="${palette.textMuted}" font-size="9">gen ${ring.generation} (${ring.count})</text>`
        );
      }
    }
  } else {
    for (const col of layout.columns) {
      lines.push(
        `    <line x1="${fmt(col.x)}" y1="28" x2="${fmt(col.x)}" y2="${layout.height - 20}" stroke="${palette.guide}" stroke-width="1" stroke-dasharray="3 4" />`,
        `    <text x="${fmt(col.x)}" y="20" text-anchor="middle" fill="${palette.textMuted}" font-size="10">g${col.generation} (${col.count})</text>`
      );
    }
  }
  lines.push('  </g>');

  // Background edges
  lines.push(
    `  <g class="edges-bg" fill="none" stroke="${palette.edge}" stroke-width="1" stroke-opacity="${baseEdgeOpacity}">`
  );
  for (const e of layout.edges) {
    if (e.isOnTrajectory) {
      continue;
    }
    lines.push(`    <path d="${e.pathD}" />`);
  }
  lines.push('  </g>');

  // Trajectory edges
  const trajEdges = layout.edges.filter((e) => e.isOnTrajectory);
  if (trajEdges.length > 0) {
    lines.push(
      `  <g class="edges-traj" fill="none" stroke="${palette.edgeTrajectory}" stroke-width="2.2" marker-end="url(#traj-arrow)">`
    );
    for (const e of trajEdges) {
      lines.push(
        `    <path d="${e.pathD}"><title>${escapeXml(`${e.edge.operationLabel}: ${e.edge.source} -> ${e.edge.target}`)}</title></path>`
      );
    }
    lines.push('  </g>');
  }

  // Nodes
  lines.push('  <g class="nodes">');
  for (const n of layout.nodes) {
    const isSelected = n.node.id === selectedId;
    const fill = n.node.isSeed
      ? palette.seedFill
      : n.isOnTrajectory
        ? palette.trajectoryFill
        : palette.nodeFill;
    const stroke = isSelected
      ? palette.selectedStroke
      : n.node.isFixedUnderAnyFocus
        ? palette.attractorStroke
        : palette.nodeStroke;
    const strokeWidth = isSelected || n.node.isSeed ? 2 : 1.1;
    lines.push(
      `    <circle cx="${fmt(n.x)}" cy="${fmt(n.y)}" r="${fmt(n.r)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"><title>${escapeXml(`${n.label} · gen ${n.node.generation} · Orbit #${n.node.sccId + 1} · deg ${n.inDegree}/${n.outDegree}`)}</title></circle>`
    );
  }
  lines.push('  </g>');

  // Labels
  lines.push('  <g class="labels">');
  for (const n of layout.nodes) {
    if (!shouldShowNodeLabel(n, totalNodes, labelMode) && n.node.id !== selectedId) {
      continue;
    }
    const text = n.node.isSeed
      ? `SEED ${n.label}`
      : n.isOnTrajectory
        ? `S${n.trajectoryIndices.join('/')} ${n.label}`
        : n.label;
    const dy = n.node.isSeed
      ? -(n.r + 6)
      : n.y > layout.cy && layout.mode === 'radial'
        ? n.r + 11
        : -(n.r + 4);
    lines.push(
      `    <text x="${fmt(n.x)}" y="${fmt(n.y + dy)}" text-anchor="middle" fill="${n.node.isSeed ? palette.seedFill : palette.text}" font-size="${totalNodes <= 45 ? 9.5 : 8.5}">${escapeXml(text)}</text>`
    );
  }
  lines.push('  </g>');

  lines.push('</svg>');
  return lines.join('\n');
}
