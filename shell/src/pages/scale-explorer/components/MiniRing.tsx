import { fifthLines, ringPoint, semitoneArc } from '../ringGeometry';
import { ARC, OPACITY, ROLE, STROKE, useScaleStyle } from '../useScaleStyle';
import classes from '../ScaleExplorer.module.css';

const C = 50;
const R = 33;
const R_OUTER = 44;
/** The mini ring is drawn at half the main ring's scale, so its arcs are half as heavy. */
const ARC_SCALE = 0.5;

interface MiniRingProps {
  /** The mode's pitch classes, root first. */
  pcs: number[];
  names: string[];
  showFifths: boolean;
  soundingPcs: ReadonlySet<number>;
}

/** Small ring for one mode: its notes, semitone arcs (isolated vs chained), optional fifth marks, root circled. */
export function MiniRing({ pcs, names, showFifths, soundingPcs }: MiniRingProps) {
  const style = useScaleStyle();
  const set = new Set(pcs);
  const at = (pc: number) => ringPoint(pc, C, C, R);
  const sorted = [...pcs].sort((a, b) => a - b);
  return (
    <svg
      viewBox="0 0 100 100"
      width={128}
      height={128}
      role="img"
      aria-label={`Ring view of this mode: ${pcs.map((p) => names[p]).join(', ')}`}
    >
      <circle cx={C} cy={C} r={R} fill="none" stroke={ROLE.border} strokeWidth={STROKE.hairline} />
      {pcs.length > 1 && (
        <polygon
          points={sorted.map((p) => at(p).join(',')).join(' ')}
          fill={style.accent}
          fillOpacity={OPACITY.soft}
          stroke={style.accent}
          strokeWidth={STROKE.hairline}
          strokeLinejoin="round"
        />
      )}
      {Array.from({ length: 12 }, (_, x) => {
        if (!(set.has(x) && set.has((x + 1) % 12))) {
          return null;
        }
        const ch = set.has((x + 11) % 12) || set.has((x + 2) % 12);
        const arc = ch ? ARC.chained : ARC.isolated;
        return (
          <path
            key={x}
            d={semitoneArc(x, C, C, R_OUTER)}
            fill="none"
            stroke={style.accent}
            strokeWidth={arc.width * ARC_SCALE}
            strokeDasharray={arc.dash ? '3 2' : undefined}
            strokeLinecap={ch ? 'butt' : 'round'}
          />
        );
      })}
      {showFifths &&
        fifthLines(set, at, 6.5, 8, 2.6, 0.1).map((f) => (
          <path
            key={f.from}
            d={f.d}
            fill="none"
            stroke={f.kind === 'ok' ? style.fifthPresent : style.fifthMissing}
            strokeWidth={STROKE.hairline}
            strokeLinecap="round"
            markerEnd={f.kind === 'ok' ? 'url(#se-arrow)' : undefined}
          />
        ))}
      {Array.from({ length: 12 }, (_, p) => {
        const c = at(p);
        const on = set.has(p);
        const sounding = soundingPcs.has(p);
        return (
          <g key={p}>
            <circle
              cx={c[0]}
              cy={c[1]}
              r={on ? 6.5 : 3}
              fill={on ? style.accent : ROLE.panel}
              stroke={sounding ? ROLE.text : on ? style.accent : ROLE.border}
              strokeWidth={sounding ? STROKE.mark : STROKE.hairline}
            />
            {on && p === pcs[0] && (
              <circle
                cx={c[0]}
                cy={c[1]}
                r={9.2}
                fill="none"
                stroke={style.accent}
                strokeWidth={STROKE.hairline}
              />
            )}
            {on && (
              <text className={classes.miniText} x={c[0]} y={c[1] + 2.5}>
                {p}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
