/**
 * The Lattice view of a visualizer panel: the prime lattice of the field in 2D (a flat drawing, SVG) or 3D (three.js,
 * loaded on first use). Both use the same three prime axes; a note that uses another prime is drawn on a stem (hollow
 * ring at its base, dashed segment per hidden prime, the note at the tip, a chip naming the primes). Lit notes and the
 * highlighted chord show in both.
 */
import { lazy, Suspense, useState } from 'react';
import { ActionIcon, Checkbox, NativeSelect, SegmentedControl } from '@mantine/core';
import { axisChoices3d, fmtHidden } from '../../../lib/harmonic-field';
import type { VizId } from './layout';
import { LIT_FIELD, lattice2dFor, lattice3dFor, stemHue } from './mockData';
import { Num, Row, Tip, useLab } from './ui';
import { useViz } from './vizState';
import { hasWebGL } from './webgl';
import classes from './panels.module.css';

const Lattice3D = lazy(() => import('./Lattice3D'));

const choiceValue = (axes: readonly number[]) => axes.join(',');
const choiceLabel = (axes: readonly number[]) => axes.join(' · ');

function Lattice2D({ axes, labels }: { axes: readonly number[] | null; labels: boolean }) {
  const lab = useLab();
  const L = lattice2dFor(axes);
  const at = new Map(L.pts.map((p) => [p.i, p]));
  // crop the view to the points so the lattice fills the panel
  const xs = L.pts.flatMap((p) => [p.x, p.bx]);
  const ys = L.pts.flatMap((p) => [p.y, p.by]);
  const x0 = Math.min(...xs) - 30;
  const y0 = Math.min(...ys) - 28;
  const box = `${x0} ${y0} ${Math.max(...xs) + 60 - x0} ${Math.max(...ys) + 34 - y0}`;
  return (
    <svg
      viewBox={box}
      className={classes.latticeSvg}
      role="group"
      aria-label="Lattice of the field, notes placed by prime exponents"
    >
      {L.edges.map(([a, b], j) => {
        const pa = at.get(a);
        const pb = at.get(b);
        if (!pa || !pb) {
          return null;
        }
        const chord = lab.chord.has(a) && lab.chord.has(b);
        const both = pa.on && pb.on;
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
        const lit = LIT_FIELD.has(p.i);
        const shown = lab.hover ?? lab.pin;
        return (
          <g key={p.i}>
            {shown === p.i && <circle className={classes.selRing} cx={p.x} cy={p.y} r={13} />}
            <circle
              className={lit ? classes.dotLit : p.on ? classes.dotOn : classes.dotOff}
              data-chord={lab.chord.has(p.i) ? 'true' : undefined}
              cx={p.x}
              cy={p.y}
              r={lit ? 9 : 6}
              tabIndex={0}
              role="button"
              aria-label={`${p.label}${p.chip ? `, off-axis ${p.chip}` : ''}${p.on ? ', in subset' : ''}${lit ? ', sounding' : ''}`}
              onMouseEnter={() => lab.setHover(p.i)}
              onMouseLeave={() => lab.setHover(null)}
              onFocus={() => lab.setHover(p.i)}
              onBlur={() => lab.setHover(null)}
              onClick={() => lab.setPin(lab.pin === p.i ? null : p.i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  lab.setPin(lab.pin === p.i ? null : p.i);
                }
              }}
            />
            {labels && (
              <text
                className={classes.svgLabel}
                data-on={p.on}
                x={p.x + 10}
                y={p.on ? p.y - 10 : p.y + 20}
              >
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

export function LatticeBody({ id, big }: { id: VizId; big?: boolean }) {
  const viz = useViz();
  const s = viz.settings(id);
  const [resetKey, setResetKey] = useState(0);
  const is3d = s.dim === '3d';
  const webgl = hasWebGL();
  const l3 = lattice3dFor(s.axes3);
  const l2 = lattice2dFor(s.axes3);
  const choices = axisChoices3d(lattice3dFor(null).available);
  const off = l2.pts.filter((p) => p.stems.length);
  return (
    <>
      <div className={classes.vizTools}>
        <Tip k="latticeDim" as="control">
          <SegmentedControl
            size="xs"
            aria-label="Lattice dimensions"
            value={s.dim}
            onChange={(v) => viz.patch(id, { dim: v === '3d' ? '3d' : '2d' })}
            data={[
              { label: '2D', value: '2d' },
              { label: '3D', value: '3d' },
            ]}
          />
        </Tip>
        <Tip k="latticeAxes" as="control">
          <NativeSelect
            size="xs"
            aria-label="Lattice axes (primes)"
            value={choiceValue(s.axes3 ?? l3.axes)}
            onChange={(e) => viz.patch(id, { axes3: e.currentTarget.value.split(',').map(Number) })}
            data={choices.map((c) => ({ value: choiceValue(c), label: choiceLabel(c) }))}
            w={104}
          />
        </Tip>
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
      {!is3d ? (
        <Lattice2D axes={s.axes3} labels={s.labels} />
      ) : webgl ? (
        <Tip k="lattice3dView" as="control" block>
          <Suspense
            fallback={<div className={classes.lat3dHost} data-big={big ? 'true' : undefined} />}
          >
            <Lattice3D axes={s.axes3} labels={s.labels} resetKey={resetKey} big={big} />
          </Suspense>
        </Tip>
      ) : (
        <div className={classes.lat3dFallback} role="note">
          The 3D lattice needs WebGL, which this browser or test environment does not provide.
          Switch to 2D to see the same notes flat.
        </div>
      )}
      <div className={classes.verdicts}>
        <Row name="Axes">
          primes <Num>{l3.axes.join(', ')}</Num>
        </Row>
        <Row name={<Tip k="latticeStems">Off-axis</Tip>}>
          {off.length === 0 ? (
            <Num muted>none</Num>
          ) : (
            off.map((p) => (
              <span key={p.i} className={classes.offAxis}>
                <Num>{p.label}</Num>{' '}
                {p.hidden.map((h) => (
                  <span key={h.prime} style={{ color: `var(--mark-${stemHue(h.prime)})` }}>
                    {fmtHidden(h)}{' '}
                  </span>
                ))}
              </span>
            ))
          )}
        </Row>
        <Row name="Notes">
          <Num>{l3.pts.length}</Num> placed; the factor 2 is folded into the repeat
        </Row>
      </div>
    </>
  );
}
