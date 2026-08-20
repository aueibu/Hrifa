import { resolvePeriodicityDiagramStyle } from '../../../theme/diagram';
import type { BlockPoint, UnisonVectorCandidate } from '../periodicityBlock';

interface LatticeDiagramProps {
  uv1: UnisonVectorCandidate;
  uv2: UnisonVectorCandidate;
  points: BlockPoint[];
  ci: number;
  cj: number;
  cycles: number[][];
}

/**
 * The actual (i,j) lattice of every reachable generator-combination in a
 * window around the block, with this block's own points picked out from the
 * rest, the sealed fundamental parallelogram (area = |det| = block size)
 * drawn first, and the current traversal path drawn as arrows on top — the
 * way a Fokker block is classically drawn. The lattice-spanning vectors in
 * (i,j)-space are simply the two unison vectors themselves (e1=uv1, e2=uv2):
 * a comma IS a lattice point, and adding it must return the same class, so
 * it must be one of the two generators of the closing sublattice.
 */
export function LatticeDiagram({ uv1, uv2, points, ci, cj, cycles }: LatticeDiagramProps) {
  const S = resolvePeriodicityDiagramStyle();
  const D = uv1.m * uv2.n - uv1.n * uv2.m;
  const e1: [number, number] = [uv1.m, uv1.n];
  const e2: [number, number] = [uv2.m, uv2.n];

  // The classic Erlich-style fundamental parallelogram corner: the SAME
  // corner buildPeriodicityBlock itself uses for this shift (floor of the
  // local coordinates, not nearest-round — using round() here was a real
  // bug in the source history: it agrees with floor() only when both
  // fractional parts are below 0.5, so the drawn parallelogram could
  // silently jump to a neighboring cell that isn't where the plotted notes
  // actually came from. See periodicityBlock.test.ts for the invariant this
  // must hold.
  const rawA = (uv2.n * ci - uv2.m * cj) / D;
  const rawB = (-uv1.n * ci + uv1.m * cj) / D;
  const ra = Math.floor(rawA);
  const rb = Math.floor(rawB);
  const corner: [number, number] = [ra * e1[0] + rb * e2[0], ra * e1[1] + rb * e2[1]];
  const pCorners: [number, number][] = [
    corner,
    [corner[0] + e1[0], corner[1] + e1[1]],
    [corner[0] + e1[0] + e2[0], corner[1] + e1[1] + e2[1]],
    [corner[0] + e2[0], corner[1] + e2[1]],
  ];

  const is = points.map((p) => p.i).concat(pCorners.map((p) => p[0]));
  const js = points.map((p) => p.j).concat(pCorners.map((p) => p[1]));
  const minI = Math.min(...is) - 1;
  const maxI = Math.max(...is) + 1;
  const minJ = Math.min(...js) - 1;
  const maxJ = Math.max(...js) + 1;
  const spanI = Math.max(1, maxI - minI);
  const spanJ = Math.max(1, maxJ - minJ);
  const size = 190;
  const pad = 14;
  const scale = Math.min((size - 2 * pad) / spanI, (size - 2 * pad) / spanJ);
  const toX = (i: number) => pad + (i - minI) * scale;
  const toY = (j: number) => size - pad - (j - minJ) * scale;
  const memberSet = new Set(points.map((p) => `${p.i},${p.j}`));

  const gridDots: React.ReactNode[] = [];
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      if (memberSet.has(`${i},${j}`)) {
        continue;
      }
      gridDots.push(<circle key={`${i},${j}`} cx={toX(i)} cy={toY(j)} r={1.5} fill={S.dimPoint} />);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={190}
      height={190}
      style={{
        background: 'var(--mantine-color-body)',
        border: `1px solid ${S.neutral}`,
        borderRadius: 4,
      }}
    >
      {minI <= 0 && maxI >= 0 && (
        <line x1={toX(0)} y1={0} x2={toX(0)} y2={size} stroke={S.neutral} strokeWidth={0.7} />
      )}
      {minJ <= 0 && maxJ >= 0 && (
        <line x1={0} y1={toY(0)} x2={size} y2={toY(0)} stroke={S.neutral} strokeWidth={0.7} />
      )}
      <polygon
        points={pCorners.map((p) => `${toX(p[0])},${toY(p[1])}`).join(' ')}
        fill={S.unisonVector2}
        fillOpacity={S.parallelogramFill}
        stroke={S.unisonVector2}
        strokeWidth={1.4}
      />
      {gridDots}
      {cycles.map((cyc, cIdx) => {
        const color = S.cyclePalette[cIdx % S.cyclePalette.length];
        return cyc.map((idx, k) => {
          const p = points[idx];
          const nxt = points[cyc[(k + 1) % cyc.length]];
          const closing = k === cyc.length - 1;
          const x1 = toX(p.i);
          const y1 = toY(p.j);
          const x2 = toX(nxt.i);
          const y2 = toY(nxt.j);
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const mx = x1 + (x2 - x1) * 0.6;
          const my = y1 + (y2 - y1) * 0.6;
          return (
            <g key={`${cIdx}-${k}`} opacity={0.85}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={1.6}
                strokeDasharray={closing ? '3,2' : undefined}
              />
              <path
                d={`M${mx},${my} L${mx - 6 * Math.cos(ang - 0.4)},${my - 6 * Math.sin(ang - 0.4)} L${mx - 6 * Math.cos(ang + 0.4)},${my - 6 * Math.sin(ang + 0.4)} Z`}
                fill={color}
              />
            </g>
          );
        });
      })}
      {points.map((p) => (
        <circle
          key={`${p.i},${p.j}`}
          cx={toX(p.i)}
          cy={toY(p.j)}
          r={4}
          fill={`hsl(${Math.floor(p.pitch * 360)},65%,50%)`}
          stroke={S.origin}
          strokeWidth={0.7}
        />
      ))}
      <text x={4} y={size - 4} fontSize={8} fill={S.dimPoint}>
        i (gen 1) &rarr;
      </text>
      <text x={4} y={10} fontSize={8} fill={S.dimPoint}>
        j (gen 2) &uarr;
      </text>
    </svg>
  );
}
