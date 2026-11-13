/**
 * The Dissonance curve view: Sethares roughness of two harmonic tones over one repeat, the field's notes marked on it,
 * the smooth intervals (dips) named. The curve is computed once per repeat (1 c steps) in the lab's analyses.
 */
import { useMemo, useState, type PointerEvent } from 'react';
import { Num, Row, Tip, useLab } from './ui';
import classes from './panels.module.css';

const W = 360;
const H = 232;
const ML = 8;
const MR = 8;
const MT = 22;
const MB = 34;
const PW = W - ML - MR;
const PH = H - MT - MB;

export function DissonanceBody() {
  const lab = useLab();
  const { field, repC, repText, ratios } = lab.base;
  const { curve: dissCurve, dips: dissDips } = lab.an.diss;
  const xOf = (c: number) => ML + (c / repC) * PW;
  const yOf = (d: number) => MT + PH * (1 - d / (dissCurve.max || 1));
  const path = useMemo(
    () =>
      dissCurve.cents
        .map(
          (c, k) => `${k ? 'L' : 'M'}${xOf(c).toFixed(1)} ${yOf(dissCurve.values[k]).toFixed(1)}`
        )
        .join(' '),
    [dissCurve, repC]
  );
  const fieldCents = field.map((n) => n.c);
  // the dip at the far end is the repeat itself (an octave, a tritave ...), not a second unison: name it by the repeat's ratio
  const dipName = (d: { idx: number; ratio: string }) =>
    d.idx === dissCurve.cents.length - 1 ? repText : d.ratio;
  const [at, setAt] = useState<number | null>(null);
  const shownIdx = at ?? null;
  const move = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setAt(Math.min(dissCurve.cents.length - 1, Math.round(frac * (dissCurve.cents.length - 1))));
  };
  const selected = lab.hover ?? lab.pin;
  return (
    <>
      <Tip k="dissAxes" as="control" block>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={classes.chartSvg}
          role="group"
          aria-label="Dissonance curve: roughness of two tones against the interval between them, 0 to 1200 cents"
        >
          <text className={classes.chartTick} x={ML} y={11}>
            rougher
          </text>
          <line className={classes.chartGrid} x1={ML} x2={W - MR} y1={yOf(0)} y2={yOf(0)} />
          <rect
            className={classes.chartHit}
            x={ML}
            y={MT}
            width={PW}
            height={PH}
            onPointerMove={move}
            onPointerLeave={() => setAt(null)}
          />
          {fieldCents.map((c, i) => {
            const state = lab.sounding.has(i) ? 'lit' : lab.selected.has(i) ? 'on' : 'off';
            return (
              <g key={i}>
                <line
                  className={classes.dissMark}
                  data-state={state}
                  data-sel={selected === i ? 'true' : undefined}
                  x1={xOf(c)}
                  x2={xOf(c)}
                  y1={MT}
                  y2={yOf(0)}
                />
                <rect
                  className={classes.chartHit}
                  x={xOf(c) - 4}
                  y={MT}
                  width={8}
                  height={PH}
                  onMouseEnter={() => lab.setHover(i)}
                  onMouseLeave={() => lab.setHover(null)}
                  onClick={() => lab.clickNote(i)}
                />
                {state !== 'off' && (
                  <text
                    className={classes.dissNote}
                    data-state={state}
                    x={xOf(c)}
                    y={H - 16}
                    textAnchor="middle"
                  >
                    {ratios[i]}
                  </text>
                )}
              </g>
            );
          })}
          <path className={classes.dissLine} d={path} />
          {dissDips.map((d) => (
            <g key={d.idx}>
              <circle className={classes.dissDip} cx={xOf(d.c)} cy={yOf(d.d)} r={2} />
              <text
                className={classes.dissDipLabel}
                x={xOf(d.c)}
                y={yOf(d.d) - 6}
                textAnchor={
                  d.idx === 0 ? 'start' : d.idx === dissCurve.cents.length - 1 ? 'end' : 'middle'
                }
              >
                {dipName(d)}
              </text>
            </g>
          ))}
          {shownIdx !== null && (
            <g pointerEvents="none">
              <line
                className={classes.dissHair}
                x1={xOf(shownIdx)}
                x2={xOf(shownIdx)}
                y1={MT}
                y2={yOf(0)}
              />
              <circle
                className={classes.dissCursor}
                cx={xOf(shownIdx)}
                cy={yOf(dissCurve.values[shownIdx])}
                r={3}
              />
            </g>
          )}
          {[0, repC / 4, repC / 2, (3 * repC) / 4, repC].map((c) => (
            <text
              key={c}
              className={classes.chartTick}
              x={xOf(c)}
              y={H - 3}
              textAnchor={c === 0 ? 'start' : c === repC ? 'end' : 'middle'}
            >
              {Math.round(c)}
            </text>
          ))}
        </svg>
      </Tip>
      <div className={classes.verdicts} aria-live="polite">
        <Row name={<Tip k="dissReadout">Interval</Tip>}>
          {shownIdx === null ? (
            <Num muted>point at the curve</Num>
          ) : (
            <Num>{dissCurve.cents[shownIdx].toFixed(0)} c</Num>
          )}
        </Row>
        <Row name="Roughness">
          {shownIdx === null ? (
            <Num muted>peak {dissCurve.max.toFixed(2)}</Num>
          ) : (
            <Num>
              {dissCurve.values[shownIdx].toFixed(2)}{' '}
              <Num muted>
                ({Math.round((dissCurve.values[shownIdx] / dissCurve.max) * 100)} % of peak)
              </Num>
            </Num>
          )}
        </Row>
        <Row name={<Tip k="dissDips">Smooth intervals</Tip>}>
          <Num>{dissDips.map(dipName).join('  ')}</Num>
        </Row>
        <Row name={<Tip k="dissMarks">Marks</Tip>}>
          bright: in subset, green: sounding, faint: left out
        </Row>
      </div>
    </>
  );
}
