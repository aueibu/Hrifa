import type { CSSProperties, KeyboardEvent } from 'react';
import type { SemitoneStats } from '../pitchSets';
import { fifthLines, ringPoint, semitoneArc } from '../ringGeometry';
import { ARC, OPACITY, ROLE, STROKE, useScaleStyle } from '../useScaleStyle';
import classes from '../ScaleExplorer.module.css';

const CX = 160;
const CY = 160;
const R = 120;
const ARC_R = 151;
const NODE_R = 25;

/** Dot packing for 2-5 sets around one pitch class: [dot radius share, offset share, angles]. */
const PACK: Record<number, [number, number, number[]]> = {
  2: [0.5, 0.5, [0, 180]],
  3: [0.4641, 0.5359, [0, 120, 240]],
  4: [0.4142, 0.5858, [0, 90, 180, 270]],
  5: [0.3702, 0.6298, [0, 72, 144, 216, 288]],
};

export interface RingCompare {
  slot: number;
  abs: number[];
}

export interface PitchRingProps {
  selection: number[];
  compares: RingCompare[];
  names: string[];
  showFifths: boolean;
  /** Pitch classes of the inverted set (dashed outline), when inverting around a fixed axis. */
  inverted: ReadonlySet<number>;
  semis: SemitoneStats;
  /** Pitch classes sounding now. */
  soundingPcs: ReadonlySet<number>;
  /** Which dot lights while a comparison previews: 0 is the loaded set, k is the k-th comparison. */
  soundingDot: number | null;
  onToggle: (pc: number) => void;
}

const at = (pc: number) => ringPoint(pc, CX, CY, R);
const polyPoints = (pts: [number, number][]) => pts.map((p) => p.join(',')).join(' ');

export function PitchRing({
  selection,
  compares,
  names,
  showFifths,
  inverted,
  semis,
  soundingPcs,
  soundingDot,
  onToggle,
}: PitchRingProps) {
  const style = useScaleStyle();
  const sel = new Set(selection);
  const nC = compares.length;
  const kD = nC + 1;
  const pack = PACK[kD];
  const cmpMode = nC > 0;
  // Angles are relative to the outward direction at each pitch class, so the loaded dot is always outermost
  // and the pattern turns with the ring.
  const dotAt = (pc: number, i: number): [number, number] => {
    const c0 = at(pc);
    const ang = ((pc * 30 - 90 + pack[2][i]) * Math.PI) / 180;
    return [c0[0] + NODE_R * pack[1] * Math.cos(ang), c0[1] + NODE_R * pack[1] * Math.sin(ang)];
  };
  const dotR = cmpMode ? NODE_R * pack[0] * 0.92 * 0.75 : NODE_R;

  const mainPoints =
    selection.length > 1 ? polyPoints(selection.map((p) => (cmpMode ? dotAt(p, 0) : at(p)))) : '';

  const onKey = (e: KeyboardEvent, pc: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(pc);
    }
  };

  const soundWidth = {
    '--dot-sound-width': `${((dotR * 4) / NODE_R).toFixed(2)}px`,
  } as CSSProperties;

  return (
    <svg
      className={classes.ring}
      data-cmp={cmpMode}
      viewBox="0 0 320 320"
      role="group"
      aria-label="Twelve-note ring"
      style={soundWidth}
    >
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke={ROLE.border}
        strokeWidth={STROKE.hairline}
      />
      <polygon
        points={mainPoints}
        fill={style.accent}
        fillOpacity={OPACITY.soft}
        stroke={style.accent}
        strokeWidth={STROKE.line}
        strokeLinejoin="round"
      />
      {compares.map((c, i) =>
        c.abs.length > 1 ? (
          <polygon
            key={c.slot}
            points={polyPoints(c.abs.map((p) => dotAt(p, i + 1)))}
            fill="none"
            stroke={style.slotColor(c.slot)}
            strokeOpacity={OPACITY.strong}
            strokeWidth={STROKE.line}
            strokeLinejoin="round"
          />
        ) : null
      )}
      <g>
        {semis.edges.map((e) => {
          const arc = e.ch ? ARC.chained : ARC.isolated;
          return (
            <path
              key={e.x}
              d={semitoneArc(e.x, CX, CY, ARC_R)}
              fill="none"
              stroke={style.accent}
              strokeWidth={arc.width}
              strokeDasharray={arc.dash}
              strokeLinecap={e.ch ? 'butt' : 'round'}
            />
          );
        })}
      </g>
      {showFifths && (
        <g>
          {fifthLines(sel, at, 25, 22, 7, 0.1).map((f) => (
            <path
              key={f.from}
              d={f.d}
              fill="none"
              stroke={f.kind === 'ok' ? style.fifthPresent : style.fifthMissing}
              strokeWidth={STROKE.mark}
              strokeLinecap="round"
              markerEnd={f.kind === 'ok' ? 'url(#se-arrow)' : undefined}
            />
          ))}
        </g>
      )}
      {Array.from({ length: 12 }, (_, pc) => {
        const p = at(pc);
        const used = sel.has(pc) || compares.some((c) => c.abs.includes(pc));
        const label = cmpMode ? ringPoint(pc, CX, CY, 150) : null;
        const sounding = soundingPcs.has(pc);
        return (
          <g
            key={pc}
            className={classes.node}
            data-on={sel.has(pc)}
            data-inv={inverted.has(pc)}
            data-sound={!cmpMode && sounding}
            role="button"
            tabIndex={0}
            aria-pressed={sel.has(pc)}
            aria-label={`${names[pc]}, pitch class ${pc}`}
            onClick={() => onToggle(pc)}
            onKeyDown={(e) => onKey(e, pc)}
          >
            <circle className={classes.nodeBg} cx={p[0]} cy={p[1]} r={NODE_R} />
            {cmpMode &&
              (used ? (
                Array.from({ length: kD }, (_, ck) => {
                  const dp = dotAt(pc, ck);
                  const inSet = ck === 0 ? sel.has(pc) : compares[ck - 1].abs.includes(pc);
                  const lit = sounding && soundingDot === ck;
                  const color = style.slotColor(ck === 0 ? 'L' : compares[ck - 1].slot);
                  return (
                    <g key={ck}>
                      <circle
                        cx={dp[0]}
                        cy={dp[1]}
                        r={dotR}
                        fill={inSet ? color : ROLE.panel}
                        stroke={lit ? ROLE.text : inSet ? color : ROLE.border}
                        strokeWidth={lit ? 'var(--dot-sound-width)' : STROKE.line}
                      />
                      {lit && (
                        <circle
                          cx={dp[0]}
                          cy={dp[1]}
                          r={dotR * 1.7}
                          fill="none"
                          stroke={ROLE.text}
                          strokeWidth={STROKE.mark}
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  );
                })
              ) : (
                // nobody uses this pitch class: one centered unfilled ring instead of several tiny empty dots
                <circle
                  cx={p[0]}
                  cy={p[1]}
                  r={dotR}
                  fill={ROLE.panel}
                  stroke={ROLE.border}
                  strokeWidth={STROKE.line}
                />
              ))}
            <text
              className={`${classes.label} ${classes.pcn}`}
              x={label ? label[0] : p[0]}
              y={label ? label[1] + 3 : p[1] - 1}
            >
              {pc}
            </text>
            {!cmpMode && (
              <text className={`${classes.label} ${classes.pcname}`} x={p[0]} y={p[1] + 12}>
                {names[pc]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Marker for the fifth arrows; rendered once per page. */
export function RingMarkerDefs() {
  const style = useScaleStyle();
  return (
    <svg className={classes.defs} width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <marker
          id="se-arrow"
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="4.5"
          markerHeight="4.5"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 z" fill={style.fifthPresent} />
        </marker>
      </defs>
    </svg>
  );
}
