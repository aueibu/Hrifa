export interface IntervalBarChartProps {
  /** Signed semitone steps between consecutive notes (canonical-chain steps, one shorter than the token list). */
  steps: number[];
  /** The note each step starts from, same length as `steps`, for the tooltip. */
  fromTokens: string[];
  toTokens: string[];
  color: string;
  height?: number;
}

/** A small bar chart of the signed melodic step size between each consecutive pair of notes: a rise draws up from
 * the centre line, a fall draws down, and the bar's height is the interval size in semitones -- so a run of small
 * steps, a single big leap, and a zig-zag (vakra) all have a distinct, comparable shape at a glance. */
export function IntervalBarChart({
  steps,
  fromTokens,
  toTokens,
  color,
  height = 90,
}: IntervalBarChartProps) {
  const width = Math.max(160, steps.length * 26);
  const maxAbs = Math.max(4, ...steps.map((s) => Math.abs(s)));
  const mid = height / 2;
  const scale = (height / 2 - 8) / maxAbs;
  const barW = Math.min(18, (width / Math.max(1, steps.length)) * 0.6);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Interval bar chart"
    >
      <line
        x1={0}
        y1={mid}
        x2={width}
        y2={mid}
        stroke="var(--mantine-color-default-border)"
        strokeWidth={1}
      />
      {steps.map((s, i) => {
        const x = ((i + 0.5) / steps.length) * width;
        const barH = Math.abs(s) * scale;
        const y = s >= 0 ? mid - barH : mid;
        return (
          <g key={i}>
            <rect
              x={x - barW / 2}
              y={y}
              width={barW}
              height={Math.max(1, barH)}
              fill={color}
              opacity={0.85}
              rx={1.5}
            >
              <title>
                {fromTokens[i]} &rarr; {toTokens[i + 1] ?? toTokens[i]}: {s >= 0 ? '+' : ''}
                {s}
              </title>
            </rect>
            <text
              x={x}
              y={s >= 0 ? y - 2 : y + barH + 9}
              textAnchor="middle"
              fontSize={7}
              fill="var(--mantine-color-dimmed)"
            >
              {s >= 0 ? '+' : ''}
              {s}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
