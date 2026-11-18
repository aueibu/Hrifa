import type {
  ClosureGraph,
  TrajectoryStep,
  TransformConfig,
  TransformResult,
} from '../../lib/affine-focus';

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

export function buildExportMermaid(closure: ClosureGraph): string {
  const idMap = new Map<string, string>();
  const lines: string[] = ['graph TD'];
  closure.nodes.forEach((n, idx) => {
    const mId = safeMermaidId(n.id, idx);
    idMap.set(n.id, mId);
    const label = n.pitches.map((p) => p.label).join(' · ');
    lines.push(`  ${mId}["{${label}} (gen ${n.generation})"]`);
  });
  for (const e of closure.edges) {
    const s = idMap.get(e.source);
    const t = idMap.get(e.target);
    if (s && t) {
      lines.push(`  ${s} -->|"${e.operationLabel}"| ${t}`);
    }
  }
  return lines.join('\n');
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
