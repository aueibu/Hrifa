import { resolvePeriodicityDiagramStyle } from '../../../theme/diagram';
import type { UnisonVectorCandidate } from '../periodicityBlock';

interface VectorDiagramProps {
  uv1: UnisonVectorCandidate;
  uv2: UnisonVectorCandidate;
  det: number;
}

/**
 * The two unison vectors in the abstract generator (m,n) plane, and the
 * parallelogram they span — its area IS the determinant/block size, so a
 * thin (near-parallel) shape directly shows why a block came out small.
 */
export function VectorDiagram({ uv1, uv2, det }: VectorDiagramProps) {
  const S = resolvePeriodicityDiagramStyle();
  const size = 110;
  const cx = size / 2;
  const cy = size / 2;
  const maxMag = Math.max(Math.abs(uv1.m), Math.abs(uv1.n), Math.abs(uv2.m), Math.abs(uv2.n), 1);
  const scale = (size / 2 - 14) / maxMag;
  const p1: [number, number] = [cx + uv1.m * scale, cy - uv1.n * scale];
  const p2: [number, number] = [cx + uv2.m * scale, cy - uv2.n * scale];
  const p3: [number, number] = [cx + (uv1.m + uv2.m) * scale, cy - (uv1.n + uv2.n) * scale];

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={110}
      height={110}
      style={{
        background: 'var(--mantine-color-body)',
        border: `1px solid ${S.neutral}`,
        borderRadius: 4,
      }}
    >
      <line x1={0} y1={cy} x2={size} y2={cy} stroke={S.neutral} strokeWidth={0.5} />
      <line x1={cx} y1={0} x2={cx} y2={size} stroke={S.neutral} strokeWidth={0.5} />
      <polygon
        points={`${cx},${cy} ${p1[0]},${p1[1]} ${p3[0]},${p3[1]} ${p2[0]},${p2[1]}`}
        fill={S.unisonVector1}
        fillOpacity={S.parallelogramFill}
        stroke="none"
      />
      <line x1={cx} y1={cy} x2={p1[0]} y2={p1[1]} stroke={S.unisonVector1} strokeWidth={1.6} />
      <circle cx={p1[0]} cy={p1[1]} r={2.5} fill={S.unisonVector1} />
      <line x1={cx} y1={cy} x2={p2[0]} y2={p2[1]} stroke={S.unisonVector2} strokeWidth={1.6} />
      <circle cx={p2[0]} cy={p2[1]} r={2.5} fill={S.unisonVector2} />
      <circle cx={cx} cy={cy} r={2} fill={S.origin} />
      <text x={size - 4} y={size - 4} fontSize={9} textAnchor="end" fill={S.origin}>
        det={det}
      </text>
    </svg>
  );
}
