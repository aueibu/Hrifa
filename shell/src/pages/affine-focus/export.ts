import type {
  ClosureGraph,
  TrajectoryStep,
  TransformConfig,
  TransformResult,
} from '../../lib/affine-focus';
import { radixHex } from '../../theme/radix';

export function buildExportJson(
  config: TransformConfig,
  seedText: string,
  family: readonly TransformResult[],
  closure: ClosureGraph,
  trajectory: readonly TrajectoryStep[]
): string {
  return JSON.stringify(
    {
      format: 'hrifa.affine-focus-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      gamut: {
        id: config.gamut.id,
        name: config.gamut.name,
        repeatCents: config.gamut.repeatCents,
        pitches: config.gamut.pitches.map((p) => ({
          index: p.index,
          label: p.label,
          foldedCents: Number(p.foldedCents.toFixed(3)),
        })),
      },
      parameters: {
        seedText,
        domain: config.domain,
        rule: config.rule,
        multiplier: config.multiplier,
        multiplierPlus: config.multiplierPlus,
        multiplierMinus: config.multiplierMinus,
        multipliers: config.multipliers,
        dualConstraint: config.dualConstraint,
        offsetMode: config.offsetMode,
        folding: config.folding,
        quantize: config.quantize,
        identity: config.identity,
        focusPolicy: config.focusPolicy,
      },
      immediateFamily: family.map((f) => ({
        operationLabel: f.operationLabel,
        formula: f.formulaDisplay,
        output: f.outputPitches.map((p) => p.label),
        canonicalKey: f.canonicalKey,
        invariantCount: f.invariantCount,
        totalVoiceLeadingCents: Number(f.totalVoiceLeadingCents.toFixed(2)),
        maxSnapErrorCents: Number(f.maxSnapErrorCents.toFixed(2)),
      })),
      trajectory: trajectory.map((t) => ({
        step: t.index,
        operation: t.operationLabel,
        pitches: t.pitches.map((p) => p.label),
      })),
      closure: {
        saturated: closure.saturated,
        terminationReason: closure.terminationReason,
        nodeCount: closure.nodes.length,
        edgeCount: closure.edges.length,
        sccCount: closure.sccs.length,
        nodes: closure.nodes.map((n) => ({
          id: n.id,
          generation: n.generation,
          sccId: n.sccId,
          pitches: n.pitches.map((p) => p.label),
          isFixedUnderAnyFocus: n.isFixedUnderAnyFocus,
        })),
        edges: closure.edges.map((e) => ({
          source: e.source,
          target: e.target,
          operation: e.operationLabel,
          isSelfLoop: e.isSelfLoop,
        })),
      },
    },
    null,
    2
  );
}

export function buildExportCsv(closure: ClosureGraph): string {
  const header = 'id,generation,sccId,cardinality,isSeed,isFixed,pitches';
  const rows = closure.nodes.map((n) => {
    const pitchStr = n.pitches.map((p) => p.label).join(' ');
    return `"${n.id}",${n.generation},${n.sccId},${n.pitches.length},${n.isSeed},${n.isFixedUnderAnyFocus},"${pitchStr}"`;
  });
  return [header, ...rows].join('\n');
}

function safeMermaidId(id: string, index: number): string {
  return `N${index}_${id.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function escapeMermaidLabel(value: string): string {
  return value.replaceAll('"', "'");
}

export type MermaidSliceMode = 'full' | 'max-gen' | 'orbit' | 'trajectory';

export interface MermaidDiagramOptions {
  direction?: 'TD' | 'LR';
  slice?: MermaidSliceMode;
  maxGeneration?: number;
  sccId?: number;
  trajectory?: readonly TrajectoryStep[];
}

export interface MermaidDiagramResult {
  code: string;
  nodeCount: number;
  edgeCount: number;
}

export function buildMermaidDiagram(
  closure: ClosureGraph,
  options: MermaidDiagramOptions = {}
): MermaidDiagramResult {
  const direction = options.direction ?? 'TD';
  const slice = options.slice ?? 'full';
  const trajectory = options.trajectory ?? [];
  const trajIds = new Set(trajectory.map((t) => t.canonicalKey));

  let allowedIds: Set<string>;
  if (slice === 'max-gen') {
    const cap = options.maxGeneration ?? 3;
    allowedIds = new Set(closure.nodes.filter((n) => n.generation <= cap).map((n) => n.id));
  } else if (slice === 'orbit') {
    const targetScc = options.sccId ?? 0;
    allowedIds = new Set(closure.nodes.filter((n) => n.sccId === targetScc).map((n) => n.id));
  } else if (slice === 'trajectory') {
    allowedIds = new Set<string>(trajIds);
    for (const e of closure.edges) {
      if (trajIds.has(e.source)) {
        allowedIds.add(e.target);
      }
    }
    if (allowedIds.size === 0 && closure.seedId) {
      allowedIds.add(closure.seedId);
    }
  } else {
    allowedIds = new Set(closure.nodes.map((n) => n.id));
  }

  const visibleNodes = closure.nodes.filter((n) => allowedIds.has(n.id));
  const visibleEdges = closure.edges.filter(
    (e) => allowedIds.has(e.source) && allowedIds.has(e.target)
  );

  const idMap = new Map<string, string>();
  const lines: string[] = [`graph ${direction}`];
  const seedMermaidIds: string[] = [];
  const trajMermaidIds: string[] = [];

  visibleNodes.forEach((n, idx) => {
    const mId = safeMermaidId(n.id, idx);
    idMap.set(n.id, mId);
    const label = escapeMermaidLabel(n.pitches.map((p) => p.label).join(' · '));
    const tag = n.isSeed ? 'SEED · ' : '';
    lines.push(`  ${mId}["${tag}{${label}} (g${n.generation})"]`);
    if (n.isSeed) {
      seedMermaidIds.push(mId);
    } else if (trajIds.has(n.id)) {
      trajMermaidIds.push(mId);
    }
  });

  for (const e of visibleEdges) {
    const s = idMap.get(e.source);
    const t = idMap.get(e.target);
    if (s && t) {
      lines.push(`  ${s} -->|"${escapeMermaidLabel(e.operationLabel)}"| ${t}`);
    }
  }

  if (seedMermaidIds.length > 0) {
    lines.push(`  classDef seedNode stroke:${radixHex('dark', 'yellow', 9)},stroke-width:2.5px;`);
    lines.push(`  class ${seedMermaidIds.join(',')} seedNode;`);
  }
  if (trajMermaidIds.length > 0) {
    lines.push(`  classDef trajNode stroke:${radixHex('dark', 'blue', 9)},stroke-width:2px;`);
    lines.push(`  class ${trajMermaidIds.join(',')} trajNode;`);
  }

  return {
    code: lines.join('\n'),
    nodeCount: visibleNodes.length,
    edgeCount: visibleEdges.length,
  };
}

export function buildExportMermaid(closure: ClosureGraph): string {
  return buildMermaidDiagram(closure, { slice: 'full' }).code;
}

export function triggerFileDownload(filename: string, content: string, mime = 'text/plain') {
  if (typeof window === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
