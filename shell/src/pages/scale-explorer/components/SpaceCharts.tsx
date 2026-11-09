import { noteNames } from '../chords';
import type { PrimeConvention } from '../pitchSets';
import {
  edgeOffset,
  NODE_PACK,
  phaseCircle,
  scatterGroups,
  strength,
  TONNETZ,
  tonnetzEdges,
  tonnetzPc,
  tonnetzStart,
  tonnetzTriangles,
  tonnetzViewBox,
  tonnetzXY,
} from '../spaces';
import { SPECTRUM_COMPONENTS } from '../spectrum';
import { OPACITY, ROLE, STROKE, useScaleStyle } from '../useScaleStyle';
import type { SpectrumSet } from './SpectrumChart';
import classes from '../Spaces.module.css';

const SHARP = noteNames(false);

interface TonnetzChartProps {
  sets: SpectrumSet[];
  onToggle: (pc: number) => void;
}

/** The Tonnetz lattice: fifths left to right, major thirds up and right, minor thirds up and left. */
export function TonnetzChart({ sets, onToggle }: TonnetzChartProps) {
  const style = useScaleStyle();
  const nS = sets.length;
  const members = sets.map((s) => new Set(s.abs));
  const p0 = tonnetzStart(sets[0].abs);
  const { cols, rows, r } = TONNETZ;
  const box = tonnetzViewBox();
  const pack = NODE_PACK[nS > 5 ? 5 : nS];

  return (
    <svg
      className={classes.chart}
      viewBox={`0 0 ${box.width} ${box.height}`}
      role="img"
      aria-label="Tonnetz lattice"
    >
      {tonnetzTriangles(p0, members).flatMap((t, ti) =>
        t.sets.map((qi) => (
          <polygon
            key={`${ti}-${qi}`}
            fill={style.slotColor(sets[qi].slot)}
            fillOpacity={OPACITY.faint}
            points={t.points.map((p) => p.join(',')).join(' ')}
          />
        ))
      )}
      {tonnetzEdges(p0, members).flatMap((e, ei) =>
        e.sets.map((qi) => {
          const off = edgeOffset(qi, nS);
          return (
            <line
              key={`${ei}-${qi}`}
              stroke={style.slotColor(sets[qi].slot)}
              strokeWidth={STROKE.mark}
              strokeOpacity={OPACITY.strong}
              strokeLinecap="round"
              x1={e.from[0] + e.normal[0] * off}
              y1={e.from[1] + e.normal[1] * off}
              x2={e.to[0] + e.normal[0] * off}
              y2={e.to[1] + e.normal[1] * off}
            />
          );
        })
      )}
      {Array.from({ length: rows }, (_, j) =>
        Array.from({ length: cols }, (_, i) => {
          const pc = tonnetzPc(p0, i, j);
          const P = tonnetzXY(i, j);
          return (
            <g
              key={`${i}-${j}`}
              className={classes.node}
              role="button"
              tabIndex={0}
              aria-label={`${SHARP[pc]}, pitch class ${pc}`}
              onClick={() => onToggle(pc)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(pc);
                }
              }}
            >
              <title>{`${SHARP[pc]} (${pc})`}</title>
              <circle
                fill={ROLE.panel}
                stroke={ROLE.border}
                strokeWidth={STROKE.hairline}
                className={classes.nodeBase}
                cx={P[0]}
                cy={P[1]}
                r={r}
              />
              {nS === 1 ? (
                members[0].has(pc) ? (
                  <>
                    <circle fill={style.slotColor(sets[0].slot)} cx={P[0]} cy={P[1]} r={r - 3} />
                    <text className={classes.nodeLabelOn} x={P[0]} y={P[1] + 4} textAnchor="middle">
                      {SHARP[pc]}
                    </text>
                  </>
                ) : (
                  <text className={classes.label} x={P[0]} y={P[1] + 3}>
                    {SHARP[pc]}
                  </text>
                )
              ) : (
                <>
                  {sets.map((o, qi) => {
                    const ang = ((pack[2][qi] - 90) * Math.PI) / 180;
                    const cx = P[0] + r * pack[1] * Math.cos(ang);
                    const cy = P[1] + r * pack[1] * Math.sin(ang);
                    const dr = r * pack[0] * 0.92;
                    return members[qi].has(pc) ? (
                      <circle key={qi} fill={style.slotColor(o.slot)} cx={cx} cy={cy} r={dr} />
                    ) : (
                      <circle
                        key={qi}
                        fill="none"
                        stroke={ROLE.border}
                        strokeWidth={STROKE.hairline}
                        cx={cx}
                        cy={cy}
                        r={dr}
                      />
                    );
                  })}
                  <text className={classes.label} x={P[0]} y={P[1] + r + 9}>
                    {SHARP[pc]}
                  </text>
                </>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

interface SetClassMapProps {
  sets: SpectrumSet[];
  kx: number;
  ky: number;
  conv: PrimeConvention;
  onToggleCompare: (z: number[]) => void;
}

const MAP_W = 440;
const MAP_H = 380;
const L = 44;
const T = 14;
const W = MAP_W - L - 14;
const H = MAP_H - T - 44;
const px = (v: number) => L + v * W;
const py = (v: number) => T + (1 - v) * H;

const componentLabel = (k: number) =>
  `${SPECTRUM_COMPONENTS[k - 1].id} ${SPECTRUM_COMPONENTS[k - 1].name} (strength)`;

/** Every set class of the loaded size, placed by how strongly it bunches at two Fourier components. */
export function SetClassMap({ sets, kx, ky, conv, onToggleCompare }: SetClassMapProps) {
  const style = useScaleStyle();
  const n = sets[0].abs.length;
  const groups = scatterGroups(n, kx, ky, conv);
  return (
    <svg
      className={classes.chart}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      role="img"
      aria-label="Every set class of this size placed by two Fourier components"
    >
      {[0, 1, 2, 3, 4].map((t) => {
        const v = t / 4;
        return (
          <g key={t}>
            <line
              stroke={ROLE.border}
              strokeWidth={STROKE.hairline}
              strokeDasharray="2 3"
              x1={px(0)}
              y1={py(v)}
              x2={px(1)}
              y2={py(v)}
            />
            <line
              stroke={ROLE.border}
              strokeWidth={STROKE.hairline}
              strokeDasharray="2 3"
              x1={px(v)}
              y1={py(0)}
              x2={px(v)}
              y2={py(1)}
            />
            <text className={`${classes.label} ${classes.labelEnd}`} x={L - 8} y={py(v) + 3}>
              {v.toFixed(2)}
            </text>
            <text className={classes.label} x={px(v)} y={T + H + 13}>
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}
      <text className={`${classes.label} ${classes.labelStrong}`} x={L + W / 2} y={T + H + 32}>
        {componentLabel(kx)}
      </text>
      <text
        className={`${classes.label} ${classes.labelStrong}`}
        transform={`translate(11 ${T + H / 2}) rotate(-90)`}
      >
        {componentLabel(ky)}
      </text>
      {groups.map((g) => {
        const multi = g.rows.length > 1;
        const names =
          g.rows
            .slice(0, 5)
            .map((r) => `[${r.key}]`)
            .join(', ') + (g.rows.length > 5 ? ' and more' : '');
        return (
          <circle
            key={`${g.x}-${g.y}`}
            className={classes.point}
            data-multi={multi}
            cx={px(g.x)}
            cy={py(g.y)}
            r={multi ? 5.2 : 4.2}
            onClick={() => onToggleCompare(g.rows[0].z)}
          >
            <title>
              {names}
              {multi
                ? ' share this point (same interval content). Click to compare the first.'
                : ' Click to compare.'}
            </title>
          </circle>
        );
      })}
      {sets.map((o, qi) => {
        const x = strength(o.abs, kx);
        const y = strength(o.abs, ky);
        return (
          <g key={qi}>
            <circle
              className={classes.marker}
              fill={style.slotColor(o.slot)}
              cx={px(x)}
              cy={py(y)}
              r={8}
            />
            {qi === 0 && (
              <text className={classes.markerLabel} x={px(x)} y={py(y) - 12}>
                Loaded
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** How many distinct points the map shows for a given size and pair of components. */
export const scatterPointCount = (n: number, kx: number, ky: number, conv: PrimeConvention) =>
  scatterGroups(n, kx, ky, conv).length;

const CW = 140;
const CH = 120;
const PR = 38;

/** One circle per Fourier component: the notes wrapped around k times, with an arrow to their average position. */
export function PhaseCircles({ sets }: { sets: SpectrumSet[] }) {
  const style = useScaleStyle();
  return (
    <svg
      className={classes.chart}
      viewBox="0 0 420 250"
      role="img"
      aria-label="Phase circles for components 1 to 6"
    >
      {[1, 2, 3, 4, 5, 6].map((k) => {
        const cx0 = 14 + ((k - 1) % 3) * CW + CW / 2;
        const cy0 = 8 + Math.floor((k - 1) / 3) * CH + 52;
        const comp = SPECTRUM_COMPONENTS[k - 1];
        return (
          <g key={k}>
            <circle
              fill="none"
              stroke={ROLE.border}
              strokeWidth={STROKE.hairline}
              cx={cx0}
              cy={cy0}
              r={PR}
            />
            {Array.from({ length: 12 }, (_, p) => {
              const a = (2 * Math.PI * k * p) / 12 - Math.PI / 2;
              return (
                <circle
                  key={p}
                  fill={ROLE.border}
                  cx={cx0 + PR * Math.cos(a)}
                  cy={cy0 + PR * Math.sin(a)}
                  r={1.8}
                />
              );
            })}
            {sets.map((o, qi) => {
              const rr = PR - qi * 4.5;
              const pc = phaseCircle(o.abs, k);
              const tx = cx0 + PR * pc.mean[0];
              const ty = cy0 + PR * pc.mean[1];
              return (
                <g key={qi}>
                  {pc.marks.map((m, mi) => (
                    <circle
                      key={mi}
                      fill={style.slotColor(o.slot)}
                      cx={cx0 + rr * m[0]}
                      cy={cy0 + rr * m[1]}
                      r={2.8}
                    />
                  ))}
                  <line
                    stroke={style.slotColor(o.slot)}
                    strokeWidth={STROKE.mark}
                    strokeLinecap="round"
                    x1={cx0}
                    y1={cy0}
                    x2={tx}
                    y2={ty}
                  />
                  <circle fill={style.slotColor(o.slot)} cx={tx} cy={ty} r={3.4}>
                    <title>{`${o.name}, ${comp.id}: strength ${pc.strength.toFixed(2)}`}</title>
                  </circle>
                </g>
              );
            })}
            <text className={`${classes.label} ${classes.labelStrong}`} x={cx0} y={cy0 + PR + 16}>
              {`${comp.id} ${comp.name}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
