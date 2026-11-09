import { label as theoryLabel, mod12, toks, type TokenMap } from '../theory';
import type { PlayingNote } from '../useRagaAudio';

/** Which of the ladder's 13 rungs (0 = Sa .. 12 = upper Sa) a canonical-chain position belongs on. A plain mod12
 * would put the opening Sa (0) and a closing upper Sa (12) on the SAME bottom rung, hiding the very thing the
 * ladder exists to show (rising to the top). A positive multiple of 12 is an upper-octave Sa, so it goes on the
 * top rung; anything else (including a below-Sa excursion, a negative multiple of 12) wraps to its scale degree
 * as normal. Two-octaves-up (24, ...) still collapses to the top rung -- a reasonable simplification for a
 * one-octave ladder, and rare in practice. */
function rungOf(value: number): number {
  return value > 0 && value % 12 === 0 ? 12 : mod12(value);
}

export interface LadderDiagramProps {
  arohaTokens: string[];
  avarohaTokens: string[];
  arohaChain: number[];
  avarohaChain: number[];
  tokenMap: TokenMap;
  playingNote?: PlayingNote | null;
  height?: number;
}

const RUNGS = Array.from({ length: 13 }, (_, i) => i); // Sa(0) .. upper Sa(12)

/** A vertical "rung ladder" from Sa to upper Sa: 13 fixed horizontal rungs (the chromatic degrees), with the
 * aroha's and avaroha's own melodic contour traced left-to-right across them as two coloured paths, so their
 * shape -- straight run, zig-zag (vakra), skipped rungs (bhashanga/varjya) -- reads directly off the rungs. */
export function LadderDiagram({
  arohaTokens,
  avarohaTokens,
  arohaChain,
  avarohaChain,
  tokenMap,
  playingNote,
  height = 360,
}: LadderDiagramProps) {
  const width = 320;
  const leftGutter = 34;
  const railWidth = width - leftGutter - 12;
  const topMargin = 14;
  const rowHeight = (height - topMargin * 2) / 12;
  const yOf = (pc: number) => topMargin + (12 - pc) * rowHeight;

  const trace = (chain: number[], colStart: number, colEnd: number) =>
    chain.map((v, i) => {
      const pc = rungOf(v);
      const x =
        leftGutter +
        colStart +
        (chain.length > 1
          ? (i / (chain.length - 1)) * (colEnd - colStart)
          : (colEnd - colStart) / 2);
      return { x, y: yOf(pc), pc, i };
    });

  const arohaPts = trace(arohaChain, 0, railWidth * 0.46);
  const avarohaPts = trace(avarohaChain, railWidth * 0.54, railWidth);

  const usedPcs = new Set([...arohaChain, ...avarohaChain].map(rungOf));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Sa to upper-Sa rung ladder"
    >
      {/* rungs */}
      {RUNGS.map((pc) => {
        const y = yOf(pc);
        const isEdge = pc === 0 || pc === 12;
        const isUsed = usedPcs.has(pc);
        return (
          <g key={pc}>
            <line
              x1={leftGutter}
              y1={y}
              x2={leftGutter + railWidth}
              y2={y}
              stroke="var(--mantine-color-default-border)"
              strokeWidth={isEdge ? 1.5 : 1}
              opacity={isUsed ? 0.9 : 0.35}
            />
            <text
              x={leftGutter - 6}
              y={y}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={9}
              fontWeight={isUsed ? 700 : 400}
              fill={isUsed ? 'var(--mantine-text-color)' : 'var(--mantine-color-dimmed)'}
            >
              {theoryLabel(mod12(pc), tokenMap).replace(/\(\d+\)$/, '')}
            </text>
          </g>
        );
      })}

      {/* aroha path */}
      <polyline
        points={arohaPts.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="var(--mantine-color-blue-6)"
        strokeWidth={1.75}
      />
      {arohaPts.map((p, i) => (
        <circle
          key={`a${i}`}
          cx={p.x}
          cy={p.y}
          r={playingNote?.part === 'aroha' && playingNote.index === i ? 4.5 : 2.6}
          fill="var(--mantine-color-blue-6)"
          stroke={
            playingNote?.part === 'aroha' && playingNote.index === i
              ? 'var(--mantine-color-orange-5)'
              : 'none'
          }
          strokeWidth={2}
        >
          <title>{arohaTokens[i]}</title>
        </circle>
      ))}

      {/* avaroha path */}
      <polyline
        points={avarohaPts.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="var(--mantine-color-grape-6)"
        strokeWidth={1.75}
      />
      {avarohaPts.map((p, i) => (
        <circle
          key={`v${i}`}
          cx={p.x}
          cy={p.y}
          r={playingNote?.part === 'avaroha' && playingNote.index === i ? 4.5 : 2.6}
          fill="var(--mantine-color-grape-6)"
          stroke={
            playingNote?.part === 'avaroha' && playingNote.index === i
              ? 'var(--mantine-color-orange-5)'
              : 'none'
          }
          strokeWidth={2}
        >
          <title>{avarohaTokens[i]}</title>
        </circle>
      ))}

      {/* column labels */}
      <text
        x={leftGutter + railWidth * 0.23}
        y={height - 2}
        textAnchor="middle"
        fontSize={9}
        fill="var(--mantine-color-blue-6)"
      >
        aroha &#8599;
      </text>
      <text
        x={leftGutter + railWidth * 0.77}
        y={height - 2}
        textAnchor="middle"
        fontSize={9}
        fill="var(--mantine-color-grape-6)"
      >
        avaroha &#8600;
      </text>
    </svg>
  );
}

export function tokensOf(text: string): string[] {
  return toks(text);
}
