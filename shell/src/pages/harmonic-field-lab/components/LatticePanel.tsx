/**
 * The Lattice view of a visualizer panel: the prime lattice of the field in 2D (a flat drawing, SVG) or 3D (three.js,
 * loaded on first use). Both use the same three prime axes; a note that uses another prime is drawn on a stem (hollow
 * ring at its base, dashed segment per hidden prime, the note at the tip, a chip naming the primes). Lit notes and the
 * highlighted chord show in both.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { ActionIcon, Checkbox, NativeSelect, SegmentedControl } from '@mantine/core';
import { chooseAxes3d, fmtHidden, rankAxes3d, type HiddenPrime } from '../../../lib/harmonic-field';
import {
  cpsFactorNames,
  effectiveLatMode,
  genAxisNames,
  latAvail,
  lattice2dOf,
  lattice3dOf,
  latticeAltOf,
  stemHue,
  type AltLattice2dView,
  type Lattice2dView,
} from '../state/derive';
import type { VizId } from '../state/layout';
import type { LatMode } from '../state/vizState';
import { TIPS } from '../texts';
import type { SceneState } from './Lattice3D';
import { Num, Row, Tip, noteHandlers, useLab, useViz } from './ui';
import { hasWebGL } from './webgl';
import classes from './panels.module.css';

const Lattice3D = lazy(() => import('./Lattice3D'));

const AUTO = 'auto';

/** The chip's own example, worked out for this prime and power. */
function primePowerExample(h: HiddenPrime): string {
  const a = Math.abs(h.exp);
  const power = a === 1 ? String(h.prime) : `${h.prime}^${a}`;
  return h.exp > 0
    ? `Here: ${fmtHidden(h)} means the note has ${a === 1 ? 'one factor' : `${a} factors`} of ${h.prime} on top (${power} in the numerator).`
    : `Here: ${fmtHidden(h)} means the note has ${a === 1 ? 'one factor' : `${a} factors`} of ${h.prime} underneath (${power} in the denominator).`;
}
const choiceValue = (axes: readonly number[]) => axes.join(',');
const choiceLabel = (axes: readonly number[]) => axes.join('·');

const PLACED_BY: Record<LatMode, string> = {
  prime: 'prime exponents',
  gen: 'generator steps',
  cps: 'CPS factors',
};

function Lattice2D({
  L,
  labels,
  mode,
}: {
  L: Lattice2dView & Partial<Pick<AltLattice2dView, 'key'>>;
  labels: boolean;
  mode: LatMode;
}) {
  const lab = useLab();
  const at = new Map(L.pts.map((p) => [p.i, p]));
  // crop the view to the points (and the axis key) so the lattice fills the panel
  const key = L.key ?? [];
  const xs = [
    ...L.pts.flatMap((p) => [p.x, p.bx]),
    ...key.flatMap((k) => [k.x1, k.x2, k.tx - 14, k.tx + 14]),
  ];
  const ys = [...L.pts.flatMap((p) => [p.y, p.by]), ...key.flatMap((k) => [k.y1, k.y2, k.ty])];
  const x0 = Math.min(...xs) - 30;
  const y0 = Math.min(...ys) - 28;
  const box = `${x0} ${y0} ${Math.max(...xs) + 60 - x0} ${Math.max(...ys) + 34 - y0}`;
  return (
    <svg
      viewBox={box}
      className={classes.latticeSvg}
      role="group"
      aria-label={`Lattice of the field, notes placed by ${PLACED_BY[mode]}`}
    >
      {key.map((k, j) => (
        <g key={`key${j}`} data-testid="axis-key">
          <line className={classes.axisKey} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} />
          <text className={classes.axisKeyText} x={k.tx} y={k.ty} textAnchor="middle">
            {k.label}
          </text>
        </g>
      ))}
      {L.edges.map(([a, b], j) => {
        const pa = at.get(a);
        const pb = at.get(b);
        if (!pa || !pb) {
          return null;
        }
        const chord = lab.chord.has(a) && lab.chord.has(b);
        const both = lab.selected.has(a) && lab.selected.has(b);
        return (
          <line
            key={j}
            className={chord ? classes.edgeChord : both ? classes.edgeOn : classes.edgeOff}
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
          />
        );
      })}
      {L.pts.map((p) =>
        p.stems.map((s) => (
          <line
            key={`${p.i}-${s.prime}`}
            className={classes.stem}
            style={{ stroke: `var(--mark-${stemHue(s.prime)})` }}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
          />
        ))
      )}
      {L.pts
        .filter((p) => p.stems.length)
        .map((p) => (
          <circle key={`g${p.i}`} className={classes.ghost} cx={p.bx} cy={p.by} r={4.5} />
        ))}
      {L.pts.map((p) => {
        const lit = lab.sounding.has(p.i);
        const on = lab.selected.has(p.i);
        return (
          <g key={p.i}>
            {lab.pin === p.i && <circle className={classes.pinRing} cx={p.x} cy={p.y} r={13} />}
            {lab.hover === p.i && <circle className={classes.selRing} cx={p.x} cy={p.y} r={13} />}
            <circle
              className={lit ? classes.dotLit : on ? classes.dotOn : classes.dotOff}
              data-chord={lab.chord.has(p.i) ? 'true' : undefined}
              cx={p.x}
              cy={p.y}
              r={lit ? 9 : 6}
              tabIndex={0}
              role="button"
              aria-label={`${p.label}${p.chip ? `, off-axis ${p.chip}` : ''}${on ? ', in subset' : ''}${lit ? ', sounding' : ''}`}
              onMouseEnter={() => lab.setHover(p.i)}
              onMouseLeave={() => lab.setHover(null)}
              onFocus={() => lab.setHover(p.i)}
              onBlur={() => lab.setHover(null)}
              {...noteHandlers(lab, p.i)}
            />
            {labels && (
              <text
                className={classes.svgLabel}
                data-on={on}
                x={p.x + 10}
                y={on ? p.y - 10 : p.y + 20}
              >
                {p.hidden.length > 0 && (
                  <title>
                    {TIPS.primePower.term}. {TIPS.primePower.text}{' '}
                    {p.hidden.map(primePowerExample).join(' ')}
                  </title>
                )}
                {p.label}
                {p.hidden.map((h) => (
                  <tspan
                    key={h.prime}
                    className={classes.svgChip}
                    dx={4}
                    style={{ fill: `var(--mark-${stemHue(h.prime)})` }}
                  >
                    {fmtHidden(h)}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** The 3D lattice with everything it shows taken from the lab (the component itself only reads props). */
function Lattice3DView({
  axes,
  labels,
  resetKey,
  big,
  onError,
}: {
  axes: readonly number[] | null;
  labels: boolean;
  resetKey: number;
  big?: boolean;
  onError: () => void;
}) {
  const lab = useLab();
  const { field, rep, ratios } = lab.base;
  const data = useMemo(() => lattice3dOf(field, rep, axes), [field, rep, axes]);
  const hover = lab.hover;
  const pin = lab.pin;
  const scene = useMemo<SceneState>(
    () => ({
      hover,
      pin,
      chord: lab.chord,
      lit: lab.sounding,
      on: lab.selected,
      labels,
    }),
    [hover, pin, lab.chord, lab.sounding, lab.selected, labels]
  );
  return (
    <Lattice3D
      data={data}
      names={ratios}
      scene={scene}
      onHover={lab.setHover}
      onPick={(i, alt) => (alt ? lab.pinNote(i) : lab.clickNote(i))}
      onError={onError}
      resetKey={resetKey}
      big={big}
    />
  );
}

export function LatticeBody({ id, big }: { id: VizId; big?: boolean }) {
  const viz = useViz();
  const lab = useLab();
  const { field, rep, repText } = lab.base;
  const s = viz.settings(id);
  const [resetKey, setResetKey] = useState(0);
  // generators and factors exist only for fields built that way; the stored mode falls back to primes otherwise
  const avail = useMemo(
    () => latAvail(field, rep, lab.tab.gen.method),
    [field, rep, lab.tab.gen.method]
  );
  const mode = effectiveLatMode(s.latMode, avail);
  const alt = mode !== 'prime';
  const is3d = s.dim === '3d' && !alt;
  // WebGL can be present yet refuse a renderer (context limit); then the same note as for no WebGL is shown
  const [refused, setRefused] = useState(false);
  const webgl = hasWebGL() && !refused;
  // axes ranked by how many of the selected notes sit on the grid; Auto (axes3 null) follows the best one
  const idx = lab.base.idx;
  const ranks = useMemo(() => rankAxes3d(field, rep, idx), [field, rep, idx]);
  const { axes, picked } = chooseAxes3d(ranks, s.axes3);
  const l3 = useMemo(() => lattice3dOf(field, rep, axes), [field, rep, axes]);
  const l2 = useMemo(() => lattice2dOf(field, rep, axes), [field, rep, axes]);
  const gen = lab.tab.gen;
  const altView = useMemo(
    () =>
      alt
        ? latticeAltOf(
            field,
            rep,
            mode === 'gen' ? 'gen' : 'cps',
            mode === 'gen' ? genAxisNames(gen) : cpsFactorNames(gen)
          )
        : null,
    [alt, mode, field, rep, gen]
  );
  const modeNote = [
    avail.gen ? '' : 'Generators is off: this field was not built from generator steps.',
    avail.cps ? '' : 'Factors is off: this field is not a CPS (use the CPS method).',
  ]
    .filter(Boolean)
    .join(' ');
  const fit = (r: { onGrid: number; total: number }) => `${r.onGrid}/${r.total} on grid`;
  const options = [
    {
      value: AUTO,
      label: ranks[0] ? `Auto: ${choiceLabel(ranks[0].axes)} (${fit(ranks[0])})` : 'Auto',
    },
    ...ranks.map((r) => ({
      value: choiceValue(r.axes),
      label: `${choiceLabel(r.axes)} — ${fit(r)}`,
    })),
  ];
  const off = l2.pts.filter((p) => p.stems.length);
  return (
    <>
      <div className={classes.vizTools}>
        <Tip k="latticeMode" as="control" extra={modeNote || undefined}>
          <SegmentedControl
            size="xs"
            aria-label="Lattice axis mode"
            value={mode}
            onChange={(v) =>
              viz.patch(id, { latMode: v === 'gen' ? 'gen' : v === 'cps' ? 'cps' : 'prime' })
            }
            data={[
              { label: 'Primes', value: 'prime' },
              { label: 'Generators', value: 'gen', disabled: !avail.gen },
              { label: 'Factors', value: 'cps', disabled: !avail.cps },
            ]}
          />
        </Tip>
        <Tip
          k="latticeDim"
          as="control"
          extra={alt ? '3D is only for the prime lattice, so it is off in this mode.' : undefined}
        >
          <SegmentedControl
            size="xs"
            aria-label="Lattice dimensions"
            value={is3d ? '3d' : '2d'}
            onChange={(v) => viz.patch(id, { dim: v === '3d' ? '3d' : '2d' })}
            data={[
              { label: '2D', value: '2d' },
              { label: '3D', value: '3d', disabled: alt },
            ]}
          />
        </Tip>
        {!alt && (
          <Tip k="latticeAxes" as="control">
            <NativeSelect
              size="xs"
              aria-label="Lattice axes (primes)"
              value={picked && axes ? choiceValue(axes) : AUTO}
              onChange={(e) =>
                viz.patch(id, {
                  axes3:
                    e.currentTarget.value === AUTO
                      ? null
                      : e.currentTarget.value.split(',').map(Number),
                })
              }
              data={options}
              w={picked ? 150 : 190}
            />
          </Tip>
        )}
        {is3d && (
          <Tip k="lattice3dReset" as="control">
            <ActionIcon
              variant="default"
              size="md"
              aria-label="Reset view"
              onClick={() => setResetKey((k) => k + 1)}
              disabled={!webgl}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
              </svg>
            </ActionIcon>
          </Tip>
        )}
        <Checkbox
          size="xs"
          checked={s.labels}
          onChange={(e) => viz.patch(id, { labels: e.currentTarget.checked })}
          label="Ratios"
        />
      </div>
      {alt ? (
        altView ? (
          <Lattice2D L={altView} labels={s.labels} mode={mode} />
        ) : null
      ) : !is3d ? (
        <Lattice2D L={l2} labels={s.labels} mode="prime" />
      ) : webgl ? (
        <Tip k="lattice3dView" as="control" block>
          <Suspense
            fallback={<div className={classes.lat3dHost} data-big={big ? 'true' : undefined} />}
          >
            <Lattice3DView
              axes={axes}
              labels={s.labels}
              resetKey={resetKey}
              big={big}
              onError={() => setRefused(true)}
            />
          </Suspense>
        </Tip>
      ) : (
        <div className={classes.lat3dFallback} role="note">
          The 3D lattice needs WebGL, which this browser or test environment does not provide.
          Switch to 2D to see the same notes flat.
        </div>
      )}
      <div className={classes.verdicts}>
        {alt && altView ? (
          <>
            <Row name={<Tip k="latticeAltAxes">Axes</Tip>}>
              {mode === 'gen' ? 'generators' : 'factors'}{' '}
              <Num>{altView.names.join(', ') || 'none'}</Num>
            </Row>
            <Row name="Notes">
              <Num>{altView.pts.length}</Num> placed; each note is folded into the repeat{' '}
              <Num>{repText}</Num>
            </Row>
          </>
        ) : (
          <>
            <Row name="Axes">
              primes <Num>{l3.axes.join(', ')}</Num>{' '}
              <Num muted>{picked ? '(picked)' : '(auto)'}</Num>
            </Row>
            <Row name={<Tip k="latticeStems">Off-axis</Tip>}>
              {off.length === 0 ? (
                <Num muted>none</Num>
              ) : (
                off.map((p) => (
                  <span key={p.i} className={classes.offAxis}>
                    <Num>{p.label}</Num>{' '}
                    {p.hidden.map((h) => (
                      <Tip key={h.prime} k="primePower" as="control" extra={primePowerExample(h)}>
                        <span style={{ color: `var(--mark-${stemHue(h.prime)})` }}>
                          {fmtHidden(h)}
                        </span>
                      </Tip>
                    ))}
                  </span>
                ))
              )}
            </Row>
            <Row name="Notes">
              <Num>{l3.pts.length}</Num> placed; each note is folded into the repeat{' '}
              <Num>{repText}</Num>
            </Row>
          </>
        )}
      </div>
    </>
  );
}
