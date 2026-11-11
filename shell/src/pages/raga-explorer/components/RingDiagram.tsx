import { useState } from 'react';
import { label as theoryLabel, type TokenMap } from '../theory';

export interface RingDiagramProps {
  /** Pitch classes (0-11) this raga/context actually uses -- drawn filled. */
  usedPcs: number[];
  /** This raga's own token map, so a used pitch gets its real swara name rather than a generic enharmonic list. */
  tokenMap?: TokenMap;
  /** Pitch classes currently held as a browse "must include" filter -- drawn with a blue selection ring. */
  filterPcs?: number[];
  /** Pitch classes currently held as a browse "must NOT include" filter -- drawn with a red slash. */
  excludePcs?: number[];
  /** The pitch class of the note currently sounding, if any -- drawn pulsing. */
  highlightPc?: number | null;
  /** Present -> the ring is clickable (filter mode, left click = include). Absent -> read-only display. */
  onTogglePc?: (pc: number) => void;
  /** Present alongside `onTogglePc` -> right click toggles the same pitch as an "exclude" filter instead. */
  onExcludePc?: (pc: number) => void;
  /** Marks each used pitch with two small dots on its own radial spoke, colinear with the node: a teal dot
   * pulled inside the main ring for its "fifth above" (p+7 mod 12, the ascending direction) and a grape/purple
   * dot pushed outside the main ring for its "fifth below" (p-7 mod 12, descending). Each is filled when that
   * pitch is also used and hollow (outline only) when it's not. Sitting on the radial line straight through the
   * node -- rather than off to either side of it -- keeps each dot read as belonging only to its own note, not as
   * pointing at a neighboring one; every note's teal dots also line up into one implied inner ring (and the grape
   * dots into one implied outer ring) since they all sit at the same two radii. A note with only its teal dot
   * hollow is an "imperfection" (missing its fifth above specifically); one with both dots hollow is "detached"
   * (no fifth either way) and also gets a dashed red ring for emphasis. Hovering any note also draws a line to
   * its fifth above (teal) and fifth below (purple), each grey if that target pitch isn't used -- so the dots
   * give an always-visible summary and the hover lines show exactly which note each one refers to. */
  showFifths?: boolean;
  size?: number;
  title?: string;
}

const RADIUS_OUTER = 42;

/** The 12-tone chromatic ring: Sa at the top (12 o'clock), running clockwise. A click-to-filter widget when
 * `onTogglePc` is given (the "click pitches to find a raga" browse mode), otherwise a read-only picture of one
 * raga's own pitch-class set. */
function pointOf(pc: number, cx: number, cy: number, radius: number) {
  // pc=0 (Sa) at 12 o'clock, running clockwise -- angle 0 is straight up, no offset needed.
  const angle = (pc / 12) * 2 * Math.PI;
  return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
}

export function RingDiagram({
  usedPcs,
  tokenMap,
  filterPcs = [],
  excludePcs = [],
  highlightPc,
  onTogglePc,
  onExcludePc,
  showFifths = false,
  size = 220,
  title,
}: RingDiagramProps) {
  const used = new Set(usedPcs);
  const filtered = new Set(filterPcs);
  const excluded = new Set(excludePcs);
  const cx = 50;
  const cy = 50;
  const interactive = !!onTogglePc;
  const [hoveredPc, setHoveredPc] = useState<number | null>(null);

  // The line from a hovered note to its fifth above/below, pulled back off both end circles so it doesn't run
  // under the labels; padStart/padEnd are the two nodes' own radii plus a little clearance.
  function fifthLine(from: number, to: number, padStart: number, padEnd: number) {
    const a = pointOf(from, cx, cy, RADIUS_OUTER);
    const b = pointOf(to, cx, cy, RADIUS_OUTER);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    return {
      x1: a.x + ux * padStart,
      y1: a.y + uy * padStart,
      x2: b.x - ux * padEnd,
      y2: b.y - uy * padEnd,
    };
  }

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title ?? 'Chromatic pitch-class ring'}
      style={{ overflow: 'visible' }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={RADIUS_OUTER}
        fill="none"
        stroke="var(--mantine-color-default-border)"
        strokeWidth={1}
      />
      {Array.from({ length: 12 }, (_, pc) => {
        const { x, y } = pointOf(pc, cx, cy, RADIUS_OUTER);
        const isUsed = used.has(pc);
        const isFiltered = filtered.has(pc);
        const isExcluded = excluded.has(pc);
        const isHighlighted = highlightPc === pc;
        const isSa = pc === 0;
        const text = tokenMap
          ? theoryLabel(pc, tokenMap).replace(/\(\d+\)$/, '')
          : theoryLabel(pc).replace(/\(\d+\)$/, '');
        const r = isSa ? 8.5 : 7.5;
        // Fifth-above/below status, only meaningful (and only drawn) for a used pitch. Both dots sit on this
        // node's own radial spoke so they stay colinear with it: the ascending (above) dot pulled inward from
        // RADIUS_OUTER toward the center, the descending (below) dot pushed outward past it. In the node's local
        // (post-translate) frame, "inward"/"outward" are the negative/positive of its own outward unit vector
        // from pointOf.
        const angle = (pc / 12) * 2 * Math.PI;
        const outwardX = Math.sin(angle);
        const outwardY = -Math.cos(angle);
        const aboveUsed = showFifths && isUsed && used.has((pc + 7) % 12);
        const belowUsed = showFifths && isUsed && used.has((pc + 5) % 12);
        const isDetached = showFifths && isUsed && !aboveUsed && !belowUsed;
        const aboveDotOffset = 30 - RADIUS_OUTER; // negative: absolute radius 30, inside the ring
        const belowDotOffset = 14; // positive: absolute radius RADIUS_OUTER+14, outside the ring
        const dotR = 2.2;
        return (
          <g
            key={pc}
            transform={`translate(${x} ${y})`}
            onClick={interactive ? () => onTogglePc?.(pc) : undefined}
            onContextMenu={
              interactive && onExcludePc
                ? (e) => {
                    e.preventDefault();
                    onExcludePc(pc);
                  }
                : undefined
            }
            onMouseEnter={showFifths ? () => setHoveredPc(pc) : undefined}
            onMouseLeave={showFifths ? () => setHoveredPc((cur) => (cur === pc ? null : cur)) : undefined}
            style={{ cursor: interactive ? 'pointer' : 'default' }}
            role={interactive ? 'button' : undefined}
            aria-pressed={interactive ? isFiltered || isExcluded : undefined}
            aria-label={
              interactive
                ? `Pitch class ${pc}${isSa ? ' (Sa)' : ''}. Left click to include, right click to exclude.`
                : undefined
            }
          >
            {isFiltered && (
              <circle
                r={r + 3}
                fill="none"
                stroke="var(--mark-blue)"
                strokeWidth={1.5}
              />
            )}
            {isExcluded && (
              <>
                <circle
                  r={r + 3}
                  fill="none"
                  stroke="var(--mark-red)"
                  strokeWidth={1.5}
                />
                <line
                  x1={-(r + 3) * 0.7}
                  y1={-(r + 3) * 0.7}
                  x2={(r + 3) * 0.7}
                  y2={(r + 3) * 0.7}
                  stroke="var(--mark-red)"
                  strokeWidth={1.5}
                />
              </>
            )}
            {isHighlighted && (
              <circle r={r + 5} fill="none" stroke="var(--mark-orange)" strokeWidth={2}>
                <animate
                  attributeName="r"
                  values={`${r + 3};${r + 6};${r + 3}`}
                  dur="0.9s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
            {isDetached && (
              <circle
                r={r + 0.8}
                fill="none"
                stroke="var(--mark-red)"
                strokeWidth={1.2}
                strokeDasharray="1.5 1.2"
              />
            )}
            <circle
              r={r}
              fill={
                isUsed
                  ? isSa
                    ? 'var(--mark-orange)'
                    : 'var(--mark-blue)'
                  : 'var(--mantine-color-body)'
              }
              stroke={isUsed ? 'transparent' : 'var(--mantine-color-dimmed)'}
              strokeWidth={1}
              opacity={isUsed ? 1 : 0.5}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={isUsed ? 5.6 : 4.6}
              fontWeight={isUsed ? 700 : 400}
              fill={isUsed ? 'var(--mantine-color-white)' : 'var(--mantine-color-dimmed)'}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {text}
            </text>
            {showFifths && isUsed && (
              <>
                <circle
                  cx={outwardX * aboveDotOffset}
                  cy={outwardY * aboveDotOffset}
                  r={dotR}
                  fill={aboveUsed ? 'var(--mark-teal)' : 'var(--mantine-color-body)'}
                  stroke="var(--mark-teal)"
                  strokeWidth={0.8}
                >
                  <title>{aboveUsed ? '5th above: present' : '5th above: missing (imperfection)'}</title>
                </circle>
                <circle
                  cx={outwardX * belowDotOffset}
                  cy={outwardY * belowDotOffset}
                  r={dotR}
                  fill={belowUsed ? 'var(--mark-grape)' : 'var(--mantine-color-body)'}
                  stroke="var(--mark-grape)"
                  strokeWidth={0.8}
                >
                  <title>{belowUsed ? '5th below: present' : '5th below: missing'}</title>
                </circle>
              </>
            )}
          </g>
        );
      })}
      {showFifths &&
        hoveredPc !== null &&
        (() => {
          const above = (hoveredPc + 7) % 12;
          const below = (hoveredPc + 5) % 12;
          const startPad = (hoveredPc === 0 ? 8.5 : 7.5) + 1.5;
          const abovePad = (above === 0 ? 8.5 : 7.5) + 1.5;
          const belowPad = (below === 0 ? 8.5 : 7.5) + 1.5;
          const aboveLine = fifthLine(hoveredPc, above, startPad, abovePad);
          const belowLine = fifthLine(hoveredPc, below, startPad, belowPad);
          return (
            <>
              <line
                {...aboveLine}
                stroke={used.has(above) ? 'var(--mark-teal)' : 'var(--mantine-color-dimmed)'}
                strokeWidth={1}
                strokeDasharray={used.has(above) ? undefined : '2 1.5'}
                opacity={0.9}
              />
              <line
                {...belowLine}
                stroke={used.has(below) ? 'var(--mark-grape)' : 'var(--mantine-color-dimmed)'}
                strokeWidth={1}
                strokeDasharray={used.has(below) ? undefined : '2 1.5'}
                opacity={0.9}
              />
            </>
          );
        })()}
    </svg>
  );
}
