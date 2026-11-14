/** Pitch circle, glanceable stats and step-size bars to its right, and the note inspector under them. */
import { useMemo } from 'react';
import {
  ActionIcon,
  NativeSelect,
  Popover,
  SegmentedControl,
  TextInput,
  VisuallyHidden,
} from '@mantine/core';
import { parseInterval, type FifthsLayout } from '../../../lib/harmonic-field';
import { fieldRowsOf, fifthsFor, spectrumOf } from '../state/derive';
import type { RingView } from '../state/labState';
import { FieldCompact } from './FieldPanel';
import { GearIcon } from './icons';
import { Num, Row, Tip, noteHandlers, signed, useLab } from './ui';
import classes from './lab.module.css';

const SIZE = 300;
const C = SIZE / 2;
const R = 104;
/** Ring radius in the Fifths view (smaller: it carries step names, ratios and offsets outside). */
const RF = 92;
const CHAINS = ['12', '17', '19', '31'];
/** Note names for the 12-step chain with 3/2, D-flat to F-sharp (steps -5 to +6); other lengths show the step number. */
const CHAIN12 = ['D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯'];

/** Marks of one note on the ring: where, how big, and the label lines. */
interface Mark {
  x: number;
  y: number;
  lx: number;
  ly: number;
  /** Position round the ring as a fraction of a turn (clockwise from the top), for the subset polygon's order. */
  turn: number;
  offset?: number;
  offChain?: boolean;
}

function marksFor(
  view: RingView,
  cents: readonly number[],
  repC: number,
  L: FifthsLayout | null
): Mark[] {
  if (view === 'chromatic' || !L) {
    const polar = (c: number, r: number) => {
      const a = (c / repC) * 2 * Math.PI - Math.PI / 2;
      return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
    };
    return cents.map((c) => {
      const p = polar(c, R);
      const l = polar(c, R + 20);
      return { x: p.x, y: p.y, lx: l.x, ly: l.y, turn: c / repC };
    });
  }
  return L.notes.map((p) => {
    const a = p.turn * 2 * Math.PI - Math.PI / 2;
    const r = p.offChain ? RF - 30 : RF - 20 * p.stack;
    const rl = RF + 24;
    return {
      x: C + r * Math.cos(a),
      y: C + r * Math.sin(a),
      lx: C + rl * Math.cos(a),
      ly: C + rl * Math.sin(a),
      turn: p.turn,
      offset: p.offset,
      offChain: p.offChain,
    };
  });
}

export function PitchRing({ view, steps }: { view: RingView; steps: number }) {
  const lab = useLab();
  const { base, state, selected, sounding, chord } = lab;
  const { field, repC, ratios } = base;
  const L = useMemo(
    () => (view === 'fifths' ? fifthsFor(field, repC, state.ui.ringGen, steps) : null),
    [view, field, repC, state.ui.ringGen, steps]
  );
  const marks = useMemo(
    () =>
      marksFor(
        view,
        field.map((n) => n.c),
        repC,
        L
      ),
    [view, field, repC, L]
  );
  const chordPts = [...chord]
    .filter((i) => i < field.length)
    .sort((a, b) => a - b)
    .map((i) => marks[i]);
  const subsetPts = [...selected]
    .filter((i) => i < field.length)
    .sort((a, b) => marks[a].turn - marks[b].turn || a - b)
    .map((i) => marks[i]);
  const lit = [...sounding].filter((i) => i < field.length).sort((a, b) => a - b);
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={classes.ringSvg}
      role="group"
      aria-label={`Pitch circle, ${view} view: ${selected.size} of ${field.length} notes selected${
        lit.length ? `; ${lit.map((i) => ratios[i]).join(', ')} sounding` : ''
      }`}
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
      <polygon
        className={classes.subsetFill}
        data-testid="subset-polygon"
        points={subsetPts.map((p) => `${p.x},${p.y}`).join(' ')}
      />
      <polygon
        className={classes.chordFill}
        points={chordPts.map((p) => `${p.x},${p.y}`).join(' ')}
      />
      {field.map((n, i) => {
        const m = marks[i];
        const isLit = sounding.has(i);
        const on = selected.has(i);
        const inChord = chord.has(i);
        const extra =
          m.offset !== undefined && L
            ? `, step ${L.notes[i].step}, ${m.offset >= 0 ? '+' : ''}${m.offset.toFixed(1)} cents${m.offChain ? ', off the chain' : ''}`
            : '';
        return (
          <g key={i}>
            {lab.pin === i && <circle className={classes.pinRing} cx={m.x} cy={m.y} r={12} />}
            {lab.hover === i && <circle className={classes.selRing} cx={m.x} cy={m.y} r={12} />}
            <circle
              className={isLit ? classes.dotLit : on ? classes.dotOn : classes.dotOff}
              data-chord={inChord ? 'true' : undefined}
              data-off={m.offChain ? 'true' : undefined}
              cx={m.x}
              cy={m.y}
              r={isLit ? 8 : m.offChain ? 4 : 5.5}
              tabIndex={0}
              role="button"
              aria-label={`${ratios[i]}, ${n.c.toFixed(1)} cents${on ? ', in subset' : ''}${lab.pin === i ? ', pinned' : ''}${isLit ? ', sounding' : ''}${extra}`}
              aria-pressed={on}
              onMouseEnter={() => lab.setHover(i)}
              onMouseLeave={() => lab.setHover(null)}
              onFocus={() => lab.setHover(i)}
              onBlur={() => lab.setHover(null)}
              {...noteHandlers(lab, i)}
            />
            <text
              x={m.lx}
              y={m.ly}
              className={classes.svgLabel}
              data-on={on}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {ratios[i]}
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
  const { state, dispatch } = useLab();
  const { ringView: view, ringSteps: steps, ringGen } = state.ui;
  const genOk = parseInterval(ringGen) !== null;
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
            onChange={(v) =>
              dispatch({ type: 'ui', patch: { ringView: v === 'fifths' ? 'fifths' : 'chromatic' } })
            }
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
                    value={ringGen}
                    error={genOk ? undefined : 'Cannot read this interval; using 3/2'}
                    description="3/2, 4/3, 701.96c or 7&#92;12"
                    onChange={(e) =>
                      dispatch({ type: 'ui', patch: { ringGen: e.currentTarget.value } })
                    }
                  />
                  <NativeSelect
                    size="xs"
                    label="Chain length"
                    data={CHAINS}
                    value={String(steps)}
                    onChange={(e) =>
                      dispatch({ type: 'ui', patch: { ringSteps: Number(e.currentTarget.value) } })
                    }
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

const ordinal = (n: number) =>
  n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

/** The row of the note pointed at (or pinned with Alt+click): a small readout card; dashes until something is pointed at. */
function Inspector() {
  const lab = useLab();
  const { field, repC } = lab.base;
  const rows = useMemo(() => fieldRowsOf(field, repC), [field, repC]);
  const i = lab.hover ?? lab.pin;
  const r = i === null ? null : (rows[i] ?? null);
  const dash = <span className={classes.kvName}>&ndash;</span>;
  return (
    <Tip k="inspector" as="control" block>
      <div className={classes.inspector} aria-live="polite">
        <div className={classes.inspHead}>
          {r ? (
            <>
              <Num>{r.ratio}</Num>
              {lab.pin === i && (
                <Tip k="unpinNote" as="control">
                  <button
                    type="button"
                    className={classes.pinBadge}
                    aria-label="Unpin this note"
                    onClick={() => lab.setPin(null)}
                  >
                    pinned
                  </button>
                </Tip>
              )}
            </>
          ) : (
            <span className={classes.kvName}>Point at a note (Alt+click pins it)</span>
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
  const { base } = useLab();
  const { analysis, field } = base;
  return (
    <div className={classes.stats}>
      <div className={classes.statGrid}>
        <Row name={<Tip k="notes">Notes</Tip>}>
          <Num>
            {base.idx.length}/{field.length}
          </Num>
        </Row>
        <Row name={<Tip k="stepPattern">Steps</Tip>}>
          <Num>{analysis ? analysis.N : '–'}</Num>
        </Row>
        <Row name={<Tip k="primeLimit">Prime limit</Tip>}>
          <Num>{analysis?.primeLimit ?? '–'}</Num>
        </Row>
        <Row name={<Tip k="meanTenney">Mean Tenney</Tip>}>
          <Num>{analysis?.meanTenney != null ? analysis.meanTenney.toFixed(2) : '–'}</Num>
        </Row>
      </div>
      <Inspector />
    </div>
  );
}

/** Beside the strip: the shape verdicts and the step-size bars (their letters are the ones under the strip). */
export function ShapeStats() {
  const { base } = useLab();
  const { analysis } = base;
  const sp = useMemo(() => spectrumOf(base), [base]);
  const maxStep = analysis ? Math.max(...analysis.groups.map((g) => g.size)) : 1;
  return (
    <div className={classes.side}>
      <section className={classes.sideBlock} aria-label="Shape">
        <h3 className={classes.sideHead}>
          <Tip k="shape">Shape</Tip>
        </h3>
        <Row name={<Tip k="propriety">Propriety</Tip>}>{sp ? sp.prop.verdict : '–'}</Row>
        <Row name={<Tip k="constantStructure">Const. structure</Tip>}>
          {sp ? (sp.cs.cs ? 'yes' : 'no') : '–'}
          {sp && !sp.cs.cs && sp.cs.example && (
            <Num muted>
              {' '}
              ({ordinal((sp.cs.example.ks[0] ?? 0) + 1)}/{ordinal((sp.cs.example.ks[1] ?? 0) + 1)})
            </Num>
          )}
        </Row>
        <Row name={<Tip k="variety">Variety</Tip>}>
          <Num>{sp?.spectrum[0]?.variety ?? '–'}</Num>
        </Row>
        <Row name={<Tip k="structure">Structure</Tip>}>
          {!analysis
            ? '–'
            : analysis.structure.kind === 'mos'
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
          {analysis?.groups.map((g) => (
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
      <FieldCompact />
    </div>
  );
}
