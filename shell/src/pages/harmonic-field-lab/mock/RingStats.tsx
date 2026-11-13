/** Pitch circle with glanceable stats and the step-size bars to its right, and the note inspector line beneath. */
import { VisuallyHidden } from '@mantine/core';
import {
  LIT_FIELD,
  analysis,
  cs,
  field,
  fieldRows,
  prop,
  rel,
  repC,
  selectedSet,
  spectrum,
} from './mockData';
import { Num, Row, Tip, useLab } from './ui';
import classes from './mock.module.css';

const SIZE = 240;
const C = SIZE / 2;
const R = 80;
const polar = (c: number, r = R) => {
  const a = (c / repC) * 2 * Math.PI - Math.PI / 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};

export function PitchRing() {
  const lab = useLab();
  const chord = [...lab.chord].sort((a, b) => a - b).map((i) => polar(field[i].c));
  const shown = lab.hover ?? lab.pin;
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={classes.ringSvg}
      role="group"
      aria-label={`Pitch circle: ${rel.length} of ${field.length} notes selected; 1/1, 5/4 and 3/2 sounding`}
    >
      <circle className={classes.ringLine} cx={C} cy={C} r={R} />
      <polygon className={classes.chordFill} points={chord.map((p) => `${p.x},${p.y}`).join(' ')} />
      {field.map((n, i) => {
        const p = polar(n.c);
        const l = polar(n.c, R + 20);
        const lit = LIT_FIELD.has(i);
        const on = selectedSet.has(i);
        const inChord = lab.chord.has(i);
        return (
          <g key={i}>
            {shown === i && <circle className={classes.selRing} cx={p.x} cy={p.y} r={12} />}
            <circle
              className={lit ? classes.dotLit : on ? classes.dotOn : classes.dotOff}
              data-chord={inChord ? 'true' : undefined}
              cx={p.x}
              cy={p.y}
              r={lit ? 8 : 5.5}
              tabIndex={0}
              role="button"
              aria-label={`${fieldRows[i].ratio}, ${n.c.toFixed(1)} cents${on ? ', in subset' : ''}${lit ? ', sounding' : ''}`}
              aria-pressed={lab.pin === i}
              onMouseEnter={() => lab.setHover(i)}
              onMouseLeave={() => lab.setHover(null)}
              onFocus={() => lab.setHover(i)}
              onBlur={() => lab.setHover(null)}
              onClick={() => lab.setPin(lab.pin === i ? null : i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  lab.setPin(lab.pin === i ? null : i);
                }
              }}
            />
            <text
              x={l.x}
              y={l.y}
              className={classes.svgLabel}
              data-on={on}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {fieldRows[i].ratio}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const maxStep = Math.max(...analysis.groups.map((g) => g.size));
const ordinal = (n: number) =>
  n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export function Stats() {
  return (
    <div className={classes.stats}>
      <div className={classes.statGrid}>
        <Row name={<Tip k="notes">Notes</Tip>}>
          <Num>
            {analysis.N}/{field.length}
          </Num>
        </Row>
        <Row name={<Tip k="stepPattern">Steps</Tip>}>
          <Num>{analysis.N}</Num>
        </Row>
        <Row name={<Tip k="primeLimit">Prime limit</Tip>}>
          <Num>{analysis.primeLimit}</Num>
        </Row>
        <Row name={<Tip k="meanTenney">Mean Tenney</Tip>}>
          <Num>{analysis.meanTenney?.toFixed(2)}</Num>
        </Row>
        <Row name={<Tip k="propriety">Propriety</Tip>}>{prop.verdict}</Row>
        <Row name={<Tip k="constantStructure">Const. structure</Tip>}>
          {cs.cs ? 'yes' : 'no'}
          {!cs.cs && cs.example && (
            <Num muted>
              {' '}
              ({ordinal((cs.example.ks[0] ?? 0) + 1)}/{ordinal((cs.example.ks[1] ?? 0) + 1)})
            </Num>
          )}
        </Row>
        <Row name={<Tip k="variety">Variety</Tip>}>
          <Num>{spectrum[0].variety}</Num>
        </Row>
        <Row name={<Tip k="structure">Structure</Tip>}>
          {analysis.structure.kind === 'mos'
            ? `MOS ${analysis.structure.L}L ${analysis.structure.s}s`
            : analysis.structure.kind === 'equal'
              ? 'equal'
              : 'not MOS'}
        </Row>
      </div>
      <div className={classes.statBars}>
        <Tip k="stepBars" as="control" block>
          <ul className={classes.bars} aria-label="Step sizes">
            {analysis.groups.map((g) => (
              <li key={g.letter} className={classes.barRow}>
                <Num muted>{g.letter}</Num>
                <span className={classes.barTrack}>
                  <span
                    className={classes.sizeBar}
                    aria-hidden="true"
                    style={{ width: `${(g.size / maxStep) * 100}%` }}
                  />
                </span>
                <Num>{g.size.toFixed(1)}</Num>
                <VisuallyHidden>cents, </VisuallyHidden>
                <Num muted>&times;{g.count}</Num>
              </li>
            ))}
          </ul>
        </Tip>
      </div>
    </div>
  );
}

/** One line: the row of the note pointed at (or clicked). */
export function Inspector() {
  const lab = useLab();
  const i = lab.hover ?? lab.pin;
  const r = i === null ? null : fieldRows[i];
  return (
    <Tip k="inspector" as="control" block>
      <div className={classes.inspector} aria-live="polite">
        {r ? (
          <>
            <span className={classes.inspName}>
              <Num>{r.ratio}</Num>
              {lab.pin === i && <span className={classes.pinned}>pinned</span>}
            </span>
            <span>
              <span className={classes.kvName}>cents </span>
              <Num>{r.cents.toFixed(2)}</Num>
            </span>
            <span>
              <span className={classes.kvName}>monzo </span>
              <Num>{r.monzo}</Num>
            </span>
            <span>
              <span className={classes.kvName}>12-EDO </span>
              <Num>{r.vs12}</Num>
            </span>
            <span>
              <span className={classes.kvName}>vs JI </span>
              <Num>{r.vsJI}</Num>
            </span>
          </>
        ) : (
          <span className={classes.kvName}>Point at or click a note to read its row here.</span>
        )}
      </div>
    </Tip>
  );
}
