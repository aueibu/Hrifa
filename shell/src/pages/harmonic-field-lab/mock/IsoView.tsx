/**
 * The Isomorphic keyboard view: a hex grid where one step right is generator 1 and one step up and to the right is
 * generator 2. Each hexagon shows the field note nearest its pitch (within the tolerance) or stays blank.
 */
import { NativeSelect } from '@mantine/core';
import { fmtRatio } from '../../../lib/harmonic-field';
import type { VizId } from './layout';
import { LIT_FIELD, field, isoFor, selectedSet } from './mockData';
import { Num, Row, Tip, useLab } from './ui';
import { ISO_G1, ISO_G2, ISO_TOLS, useViz } from './vizState';
import classes from './panels.module.css';

const COLS = 10;
const ROWS = 6;
const R = 18;
const HW = Math.sqrt(3) * R;
const W = (COLS + 0.5) * HW + 8;
const H = (ROWS - 1) * 1.5 * R + 2 * R + 8;

const hexPoints = (cx: number, cy: number) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k + 30);
    return `${(cx + (R - 1) * Math.cos(a)).toFixed(1)},${(cy + (R - 1) * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const sgn = (x: number) => (x > 0 ? '+' : '') + x.toFixed(1);

export function IsoBody({ id }: { id: VizId }) {
  const lab = useLab();
  const viz = useViz();
  const s = viz.settings(id);
  const cells = isoFor(s.isoG1, s.isoG2, s.isoTol);
  const shown = lab.hover ?? lab.pin;
  const found = new Set(cells.filter((c) => c.note !== null).map((c) => c.note));
  const blank = cells.filter((c) => c.note === null).length;
  const toggle = (n: number) => lab.setPin(lab.pin === n ? null : n);
  return (
    <>
      <div className={classes.vizTools}>
        <Tip k="isoG1" as="control">
          <NativeSelect
            size="xs"
            aria-label="Right step (generator 1)"
            value={s.isoG1}
            onChange={(e) => viz.patch(id, { isoG1: e.currentTarget.value })}
            data={[...ISO_G1]}
            w={76}
          />
        </Tip>
        <Tip k="isoG2" as="control">
          <NativeSelect
            size="xs"
            aria-label="Up-right step (generator 2)"
            value={s.isoG2}
            onChange={(e) => viz.patch(id, { isoG2: e.currentTarget.value })}
            data={[...ISO_G2]}
            w={76}
          />
        </Tip>
        <Tip k="isoTol" as="control">
          <NativeSelect
            size="xs"
            aria-label="Match within"
            value={String(s.isoTol)}
            onChange={(e) => viz.patch(id, { isoTol: Number(e.currentTarget.value) })}
            data={ISO_TOLS.map((t) => ({ value: String(t), label: `within ${t} c` }))}
            w={104}
          />
        </Tip>
      </div>
      <Tip k="isoHex" as="control" block>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={classes.isoSvg}
          role="group"
          aria-label="Isomorphic keyboard: hexagons holding the field notes"
        >
          {cells.map((c) => {
            const cx = 4 + HW / 2 + c.col * HW + (c.row % 2 ? HW / 2 : 0);
            const cy = H - 4 - R - c.row * 1.5 * R;
            const n = c.note;
            const lit = n !== null && LIT_FIELD.has(n);
            const on = n !== null && selectedSet.has(n);
            const state = n === null ? 'blank' : on ? 'on' : 'off';
            const ratio = n === null ? '' : fmtRatio(field[n]);
            return (
              <g key={`${c.col}-${c.row}`}>
                <polygon
                  className={classes.isoHex}
                  data-state={state}
                  data-chord={n !== null && lab.chord.has(n) ? 'true' : undefined}
                  data-sel={n !== null && shown === n ? 'true' : undefined}
                  points={hexPoints(cx, cy)}
                  role={n === null ? undefined : 'button'}
                  tabIndex={n === null ? undefined : 0}
                  aria-label={
                    n === null
                      ? undefined
                      : `${ratio}${on ? ', in subset' : ''}${lit ? ', sounding' : ''}, ${sgn(c.err)} c from the pitch`
                  }
                  onMouseEnter={n === null ? undefined : () => lab.setHover(n)}
                  onMouseLeave={n === null ? undefined : () => lab.setHover(null)}
                  onFocus={n === null ? undefined : () => lab.setHover(n)}
                  onBlur={n === null ? undefined : () => lab.setHover(null)}
                  onClick={n === null ? undefined : () => toggle(n)}
                  onKeyDown={
                    n === null
                      ? undefined
                      : (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle(n);
                          }
                        }
                  }
                />
                {n !== null && (
                  <text
                    className={classes.isoLabel}
                    data-state={state}
                    x={cx}
                    y={cy + (lit ? 8 : 3.5)}
                    textAnchor="middle"
                    pointerEvents="none"
                  >
                    {ratio}
                  </text>
                )}
                {lit && <circle className={classes.isoDot} cx={cx} cy={cy - 5} r={3.6} />}
              </g>
            );
          })}
        </svg>
      </Tip>
      <div className={classes.verdicts}>
        <Row name={<Tip k="isoReadout">Notes shown</Tip>}>
          <Num>
            {found.size} of {field.length}
          </Num>{' '}
          <Num muted>· {blank} blank</Num>
        </Row>
        <Row name="Steps">
          right <Num>{s.isoG1}</Num>, up-right <Num>{s.isoG2}</Num>
        </Row>
      </div>
    </>
  );
}
