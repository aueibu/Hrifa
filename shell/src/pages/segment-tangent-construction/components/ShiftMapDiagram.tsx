import { resolvePeriodicityDiagramStyle } from '../../../theme/diagram';
import { localCoords, type UnisonVectorCandidate } from '../periodicityBlock';
import { clipLineToBox, hashHue } from '../shiftMapGeometry';

interface ShiftMapDiagramProps {
  uv1: UnisonVectorCandidate;
  uv2: UnisonVectorCandidate;
  range?: number;
  ci: number;
  cj: number;
  onShift: (ci: number, cj: number) => void;
}

const STEPS = 48;

/**
 * Every valid placement of a comma pair, as an exact taxicab-free cell
 * tiling: block membership is a closed-form floor() test on local
 * coordinates (see `localCoords`), so the cell fill and boundary lines are
 * the real algebraic tiling, not a sampled/traced approximation of one.
 */
export function ShiftMapDiagram({ uv1, uv2, range = 1.5, ci, cj, onShift }: ShiftMapDiagramProps) {
  const S = resolvePeriodicityDiagramStyle();
  const size = 220;
  const scale = size / (2 * range);
  const toPx = (x: number, y: number): [number, number] => [
    (x + range) * scale,
    size - (y + range) * scale,
  ];
  const e1: [number, number] = [uv1.m, uv1.n];
  const e2: [number, number] = [uv2.m, uv2.n];

  const cells: React.ReactNode[] = [];
  const cell = size / STEPS;
  for (let row = 0; row < STEPS; row++) {
    for (let col = 0; col < STEPS; col++) {
      const cellCi = -range + (col + 0.5) * ((2 * range) / STEPS);
      const cellCj = range - (row + 0.5) * ((2 * range) / STEPS);
      const [a, b] = localCoords(uv1, uv2, cellCi, cellCj);
      const label = `${Math.floor(a)},${Math.floor(b)}`;
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={col * cell}
          y={row * cell}
          width={cell + 0.5}
          height={cell + 0.5}
          fill={`hsl(${hashHue(label)},60%,72%)`}
        />
      );
    }
  }

  const corners: [number, number][] = [
    [-range, -range],
    [range, -range],
    [-range, range],
    [range, range],
  ];
  const as = corners.map(([x, y]) => localCoords(uv1, uv2, x, y)[0]);
  const bs = corners.map(([x, y]) => localCoords(uv1, uv2, x, y)[1]);
  const aMin = Math.floor(Math.min(...as));
  const aMax = Math.ceil(Math.max(...as));
  const bMin = Math.floor(Math.min(...bs));
  const bMax = Math.ceil(Math.max(...bs));

  const boundaryLines: React.ReactNode[] = [];
  for (let k = aMin; k <= aMax; k++) {
    const seg = clipLineToBox([uv1.m * k, uv1.n * k], e2, range);
    if (seg) {
      const [p1, p2] = seg.map((pt) => toPx(pt[0], pt[1]));
      boundaryLines.push(<line key={`a${k}`} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} />);
    }
  }
  for (let k = bMin; k <= bMax; k++) {
    const seg = clipLineToBox([uv2.m * k, uv2.n * k], e1, range);
    if (seg) {
      const [p1, p2] = seg.map((pt) => toPx(pt[0], pt[1]));
      boundaryLines.push(<line key={`b${k}`} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} />);
    }
  }

  const originCorners: [number, number][] = [
    [0, 0],
    [e1[0], e1[1]],
    [e1[0] + e2[0], e1[1] + e2[1]],
    [e2[0], e2[1]],
  ];
  const [ox, oy] = toPx(0, 0);
  const [mx, my] = toPx(ci, cj);

  const handleClick = (evt: React.MouseEvent<SVGSVGElement>) => {
    const rect = evt.currentTarget.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const nextCi = (x / rect.width) * (2 * range) - range;
    const nextCj = range - (y / rect.height) * (2 * range);
    onShift(Number(nextCi.toFixed(2)), Number(nextCj.toFixed(2)));
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={220}
      height={220}
      style={{ border: `1px solid ${S.neutral}`, cursor: 'crosshair' }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Click to jump the shift to this placement"
      onKeyDown={(evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          onShift(ci, cj);
        }
      }}
    >
      {cells}
      <g stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.6} color={S.neutral}>
        {boundaryLines}
      </g>
      <polygon
        points={originCorners.map((p) => toPx(p[0], p[1]).join(',')).join(' ')}
        fill="none"
        stroke={S.origin}
        strokeWidth={1.6}
        strokeDasharray="4,2"
      />
      <circle cx={ox} cy={oy} r={2} fill={S.origin} />
      <circle cx={mx} cy={my} r={4} fill={S.marker} stroke={S.origin} strokeWidth={1.5} />
    </svg>
  );
}
