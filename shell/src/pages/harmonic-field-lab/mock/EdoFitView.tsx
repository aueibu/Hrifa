/** The EDO fit view: for every n from 5 to 72, how far the subset's notes are from the nearest step of n-EDO. */
import { useState } from 'react';
import type { VizId } from './layout';
import { edoBest, edoRows } from './mockData';
import { Num, Row, Tip } from './ui';
import { useViz } from './vizState';
import classes from './panels.module.css';

const W = 360;
const H = 224;
const ML = 30;
const MR = 6;
const MT = 16;
const MB = 24;
const PW = W - ML - MR;
const PH = H - MT - MB;
const N0 = edoRows[0].n;
const N1 = edoRows[edoRows.length - 1].n;
const COL = PW / (N1 - N0 + 1);

/** Top of the chart in cents: the tallest bar, capped at 60 and rounded up to 10 (at least 20); taller bars are clipped. */
const Y_MAX = Math.max(
  20,
  Math.ceil(Math.min(60, Math.max(...edoRows.map((r) => r.worst))) / 10) * 10
);
const yOf = (c: number) => MT + PH * (1 - Math.min(1, c / Y_MAX));
const xOf = (n: number) => ML + (n - N0) * COL;
const pct = (x: number) => `${Math.round(x * 100)} %`;

export function EdoFitBody({ id }: { id: VizId }) {
  const viz = useViz();
  const pick = viz.settings(id).edoPick;
  const [hover, setHover] = useState<number | null>(null);
  const shown = edoRows.find((r) => r.n === (hover ?? pick ?? edoBest[0])) ?? edoRows[0];
  const best = new Set(edoBest);
  const choose = (n: number) => viz.patch(id, { edoPick: pick === n ? null : n });
  return (
    <>
      <Tip k="edoChart" as="control" block>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={classes.chartSvg}
          role="group"
          aria-label={`EDO fit chart: worst error of the subset in n-EDO for n ${N0} to ${N1}`}
        >
          {[0, Y_MAX / 2, Y_MAX].map((c) => (
            <g key={c}>
              <line className={classes.chartGrid} x1={ML} x2={W - MR} y1={yOf(c)} y2={yOf(c)} />
              <text className={classes.chartTick} x={ML - 4} y={yOf(c) + 3.5} textAnchor="end">
                {c}
              </text>
            </g>
          ))}
          <text className={classes.chartTick} x={2} y={9}>
            cents
          </text>
          {[12, 24, 36, 48, 60, 72].map((n) => (
            <text
              key={n}
              className={classes.chartTick}
              x={xOf(n) + COL / 2}
              y={H - 8}
              textAnchor="middle"
            >
              {n}
            </text>
          ))}
          {edoRows.map((r) => {
            const top = yOf(r.worst);
            const state =
              pick === r.n ? 'pick' : hover === r.n ? 'hover' : best.has(r.n) ? 'best' : 'plain';
            return (
              <g key={r.n}>
                <rect
                  className={classes.edoBar}
                  data-state={state}
                  x={xOf(r.n) + COL * 0.14}
                  y={top}
                  width={COL * 0.72}
                  height={Math.max(0.5, yOf(0) - top)}
                />
                <circle
                  className={classes.edoMean}
                  cx={xOf(r.n) + COL / 2}
                  cy={yOf(r.mean)}
                  r={1.1}
                />
              </g>
            );
          })}
          {edoBest.map((n) => {
            const r = edoRows.find((x) => x.n === n)!;
            return (
              <text
                key={n}
                className={classes.edoBestLabel}
                x={xOf(n) + COL / 2}
                y={Math.max(MT - 3, yOf(r.worst) - 4)}
                textAnchor="middle"
              >
                {n}
              </text>
            );
          })}
          {edoRows.map((r) => (
            <rect
              key={r.n}
              className={classes.chartHit}
              x={xOf(r.n)}
              y={MT}
              width={COL}
              height={PH}
              onMouseEnter={() => setHover(r.n)}
              onMouseLeave={() => setHover(null)}
              onClick={() => choose(r.n)}
            />
          ))}
        </svg>
      </Tip>
      <div className={classes.verdicts} aria-live="polite">
        <Row name={<Tip k="edoReadout">n-EDO</Tip>}>
          <Num>{shown.n}</Num> <Num muted>step {shown.step.toFixed(1)} c</Num>
        </Row>
        <Row name="Worst error">
          <Num>{shown.worst.toFixed(1)} c</Num>
        </Row>
        <Row name="Mean error">
          <Num>{shown.mean.toFixed(1)} c</Num>
        </Row>
        <Row name={<Tip k="edoRelative">Worst vs one step</Tip>}>
          <Num>{pct(shown.worstRel)}</Num>
        </Row>
        <Row name={<Tip k="edoBestRow">Best fits</Tip>}>
          <span className={classes.vizChips}>
            {edoBest.map((n) => (
              <button
                key={n}
                type="button"
                className={classes.vizChip}
                aria-pressed={pick === n}
                onClick={() => choose(n)}
              >
                {n}
              </button>
            ))}
          </span>
        </Row>
      </div>
    </>
  );
}
