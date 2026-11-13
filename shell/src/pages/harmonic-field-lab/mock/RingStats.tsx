/** Pitch circle, glanceable stats and step-size bars to its right, and the note inspector under them. */
import { useMemo, useState } from 'react';
import {
  ActionIcon,
  NativeSelect,
  Popover,
  SegmentedControl,
  TextInput,
  VisuallyHidden,
} from '@mantine/core';
import { GearIcon } from './icons';
import {
  CHAIN12,
  LIT_FIELD,
  fifthsAt,
  analysis,
  cs,
  field,
  fieldRows,
  prop,
  rel,
  repC,
  savedSubsets,
  spectrum,
} from './mockData';
import { Num, Row, Tip, signed, useLab } from './ui';
import classes from './mock.module.css';

const SIZE = 300;
const C = SIZE / 2;
const R = 104;
/** Ring radius in the Fifths view (smaller: it carries step names, ratios and offsets outside). */
const RF = 92;
const polar = (c: number, r = R) => {
  const a = (c / repC) * 2 * Math.PI - Math.PI / 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};

export type RingView = 'chromatic' | 'fifths';
const CHAINS = ['12', '17', '19', '31'];

/** Marks of one note on the ring: where, how big, and the label lines. */
interface Mark {
  x: number;
  y: number;
  lx: number;
  ly: number;
  offset?: number;
  offChain?: boolean;
}

function marksFor(view: RingView, steps: number): Mark[] {
  if (view === 'chromatic') {
    return field.map((n) => {
      const p = polar(n.c);
      const l = polar(n.c, R + 20);
      return { x: p.x, y: p.y, lx: l.x, ly: l.y };
    });
  }
  const L = fifthsAt(steps);
  return L.notes.map((p) => {
    const a = p.turn * 2 * Math.PI - Math.PI / 2;
    const r = p.offChain ? RF - 30 : RF - 20 * p.stack;
    const rl = RF + 24;
    return {
      x: C + r * Math.cos(a),
      y: C + r * Math.sin(a),
      lx: C + rl * Math.cos(a),
      ly: C + rl * Math.sin(a),
      offset: p.offset,
      offChain: p.offChain,
    };
  });
}

export function PitchRing({ view, steps }: { view: RingView; steps: number }) {
  const lab = useLab();
  const marks = useMemo(() => marksFor(view, steps), [view, steps]);
  const chord = [...lab.chord].sort((a, b) => a - b).map((i) => marks[i]);
  const shown = lab.hover ?? lab.pin;
  // hovering a saved subset previews it; otherwise the loaded one is the selection
  const selected = useMemo(
    () => new Set(lab.preview ?? savedSubsets[lab.loaded].idx),
    [lab.preview, lab.loaded]
  );
  const L = view === 'fifths' ? fifthsAt(steps) : null;
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={classes.ringSvg}
      role="group"
      aria-label={`Pitch circle, ${view} view: ${selected.size} of ${field.length} notes selected; 1/1, 5/4 and 3/2 sounding`}
    >
      <circle className={classes.ringLine} cx={C} cy={C} r={view === 'fifths' ? RF : R} />
      {L?.positions.map((p) => {
        const a = p.turn * 2 * Math.PI - Math.PI / 2;
        const name = steps === 12 ? CHAIN12[p.step - L.lo] : String(p.step);
        return (
          <g key={p.step} aria-hidden="true">
            <line
              className={classes.tickLine}
              x1={C + (RF - 3) * Math.cos(a)}
              y1={C + (RF - 3) * Math.sin(a)}
              x2={C + (RF + 3) * Math.cos(a)}
              y2={C + (RF + 3) * Math.sin(a)}
            />
            {steps <= 19 && (
              <text
                className={classes.chainLabel}
                x={C + (RF - 12) * Math.cos(a)}
                y={C + (RF - 12) * Math.sin(a)}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {name}
              </text>
            )}
          </g>
        );
      })}
      <polygon className={classes.chordFill} points={chord.map((p) => `${p.x},${p.y}`).join(' ')} />
      {field.map((n, i) => {
        const m = marks[i];
        const lit = LIT_FIELD.has(i);
        const on = selected.has(i);
        const inChord = lab.chord.has(i);
        const extra =
          m.offset !== undefined
            ? `, step ${L!.notes[i].step}, ${m.offset >= 0 ? '+' : ''}${m.offset.toFixed(1)} cents${m.offChain ? ', off the chain' : ''}`
            : '';
        return (
          <g key={i}>
            {shown === i && <circle className={classes.selRing} cx={m.x} cy={m.y} r={12} />}
            <circle
              className={lit ? classes.dotLit : on ? classes.dotOn : classes.dotOff}
              data-chord={inChord ? 'true' : undefined}
              data-off={m.offChain ? 'true' : undefined}
              cx={m.x}
              cy={m.y}
              r={lit ? 8 : m.offChain ? 4 : 5.5}
              tabIndex={0}
              role="button"
              aria-label={`${fieldRows[i].ratio}, ${n.c.toFixed(1)} cents${on ? ', in subset' : ''}${lit ? ', sounding' : ''}${extra}`}
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
              x={m.lx}
              y={m.ly}
              className={classes.svgLabel}
              data-on={on}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {fieldRows[i].ratio}
              {m.offset !== undefined && (
                <tspan className={classes.offLabel} x={m.lx} dy="10">
                  {m.offChain ? 'off' : signed(m.offset)}
                </tspan>
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The ring with its header: caption, the view toggle (Chromatic | Fifths) centred over the ring, and the ring menu. */
export function RingPanel() {
  const [view, setView] = useState<RingView>('chromatic');
  const [steps, setSteps] = useState(12);
  return (
    <div className={classes.ringBox}>
      <div className={classes.ringHead}>
        <span className={classes.ringCap}>
          <Tip k="pitchCircle">Pitch circle</Tip>
        </span>
        <Tip k="ringView" as="control">
          <SegmentedControl
            size="xs"
            aria-label="Ring view"
            value={view}
            onChange={(v) => setView(v as RingView)}
            data={[
              { value: 'chromatic', label: 'Chromatic' },
              { value: 'fifths', label: 'Fifths' },
            ]}
          />
        </Tip>
        <span className={classes.ringHeadEnd}>
          <Tip k="ringMenu" as="control">
            <Popover position="bottom-end" width={220} transitionProps={{ duration: 0 }}>
              <Popover.Target>
                <ActionIcon variant="default" size="sm" aria-label="Ring menu">
                  <GearIcon />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <div className={classes.formStack}>
                  <TextInput
                    size="xs"
                    label="Generator (stacked)"
                    defaultValue="3/2"
                    description="Fixed at 3/2 in this mock"
                    readOnly
                  />
                  <NativeSelect
                    size="xs"
                    label="Chain length"
                    data={CHAINS}
                    value={String(steps)}
                    onChange={(e) => setSteps(Number(e.currentTarget.value))}
                  />
                </div>
              </Popover.Dropdown>
            </Popover>
          </Tip>
        </span>
      </div>
      <PitchRing view={view} steps={steps} />
    </div>
  );
}

const maxStep = Math.max(...analysis.groups.map((g) => g.size));
const ordinal = (n: number) =>
  n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

/** The row of the note pointed at (or clicked): a small readout card; dashes until something is pointed at. */
function Inspector() {
  const lab = useLab();
  const i = lab.hover ?? lab.pin;
  const r = i === null ? null : fieldRows[i];
  const dash = <span className={classes.kvName}>&ndash;</span>;
  return (
    <Tip k="inspector" as="control" block>
      <div className={classes.inspector} aria-live="polite">
        <div className={classes.inspHead}>
          {r ? (
            <>
              <Num>{r.ratio}</Num>
              {lab.pin === i && <span className={classes.pinned}>pinned</span>}
            </>
          ) : (
            <span className={classes.kvName}>Point at or click a note</span>
          )}
        </div>
        <Row name="cents">{r ? <Num>{r.cents.toFixed(2)}</Num> : dash}</Row>
        <Row name="monzo">{r ? <Num>{r.monzo}</Num> : dash}</Row>
        <Row name="12-EDO">{r ? <Num>{r.vs12}</Num> : dash}</Row>
        <Row name="vs JI">{r ? <Num>{r.vsJI}</Num> : dash}</Row>
      </div>
    </Tip>
  );
}

/** Glanceable basics beside the ring, and the note inspector. */
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
      </div>
      <Inspector />
    </div>
  );
}

/** Beside the strip: the shape verdicts and the step-size bars (their letters are the ones under the strip). */
export function ShapeStats() {
  return (
    <div className={classes.side}>
      <section className={classes.sideBlock} aria-label="Shape">
        <h3 className={classes.sideHead}>
          <Tip k="shape">Shape</Tip>
        </h3>
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
      </section>
      <section className={classes.sideBlock} aria-label="Step sizes">
        <h3 className={classes.sideHead}>
          <Tip k="stepBars">Step sizes (c)</Tip>
        </h3>
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
      </section>
    </div>
  );
}

export { rel };
