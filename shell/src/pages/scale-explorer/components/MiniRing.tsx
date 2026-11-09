import { fifthLines, ringPoint, semitoneArc } from '../ringGeometry';
import classes from '../ScaleExplorer.module.css';

const C = 50;
const R = 33;
const R_OUTER = 44;

interface MiniRingProps {
  /** The mode's pitch classes, root first. */
  pcs: number[];
  names: string[];
  showFifths: boolean;
  soundingPcs: ReadonlySet<number>;
}

/** Small ring for one mode: its notes, semitone arcs (isolated vs chained), optional fifth marks, root circled. */
export function MiniRing({ pcs, names, showFifths, soundingPcs }: MiniRingProps) {
  const set = new Set(pcs);
  const at = (pc: number) => ringPoint(pc, C, C, R);
  const sorted = [...pcs].sort((a, b) => a - b);
  return (
    <svg
      viewBox="0 0 100 100"
      width={64}
      height={64}
      role="img"
      aria-label={`Ring view of this mode: ${pcs.map((p) => names[p]).join(', ')}`}
    >
      <circle className={classes.miniGuide} cx={C} cy={C} r={R} />
      {pcs.length > 1 && (
        <polygon
          className={classes.miniPoly}
          points={sorted.map((p) => at(p).join(',')).join(' ')}
        />
      )}
      {Array.from({ length: 12 }, (_, x) => {
        if (!(set.has(x) && set.has((x + 1) % 12))) {
          return null;
        }
        const ch = set.has((x + 11) % 12) || set.has((x + 2) % 12);
        return (
          <path
            key={x}
            className={classes.miniArc}
            data-chain={ch}
            d={semitoneArc(x, C, C, R_OUTER)}
          />
        );
      })}
      {showFifths &&
        fifthLines(set, at, 6.5, 8, 2.6, 0.1).map((f) => (
          <path
            key={f.from}
            className={`${classes.fifth} ${classes.miniFifth}`}
            data-kind={f.kind}
            d={f.d}
            markerEnd={f.kind === 'ok' ? 'url(#se-arrow)' : undefined}
          />
        ))}
      {Array.from({ length: 12 }, (_, p) => {
        const c = at(p);
        const on = set.has(p);
        return (
          <g key={p}>
            <circle
              className={classes.miniNode}
              data-on={on}
              data-sound={soundingPcs.has(p)}
              cx={c[0]}
              cy={c[1]}
              r={on ? 6.5 : 3}
            />
            {on && p === pcs[0] && (
              <circle className={classes.miniRoot} cx={c[0]} cy={c[1]} r={9.2} />
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
