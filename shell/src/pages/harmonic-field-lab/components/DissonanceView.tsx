/**
 * The Dissonance curve view: Sethares roughness of two harmonic tones over one repeat, the field's notes marked on it,
 * the smooth intervals (dips) named. The curve is computed once per repeat (1 c steps) in the lab's analyses.
 */
import { useMemo, useState, type PointerEvent } from 'react';
import { dissonanceAt, heCurveAt, heRange } from '../../../lib/harmonic-field';
import { NEAR_X, layoutChartLabels } from '../state/chartLabelLayout';
import { useLabDeveloperOptions } from '../state/developerOptions';
import { useHeCurve } from '../state/entropy';
import { SVG_FS_SMALL } from '../state/typeScale';
import { OutsideCount, useGhosts } from './GhostMarks';
import { HeBlurSlider } from './HeBlurSlider';
import { ModeChevron, rootLabel, useModeRoot } from './ModeRoot';
import { Num, Row, Tip, noteHandlers, useLab } from './ui';
import labClasses from './lab.module.css';
import classes from './panels.module.css';

const W = 360;
const H = 252;
const ML = 8;
const MR = 8;
const MT = 22;
/** Bottom margin: the tick row under the baseline, then the label band (3 lanes) for note ratios and dip names. */
const MB = 54;
const PW = W - ML - MR;
const PH = H - MT - MB;
/** Center y of the first label lane, under the tick row. */
const BAND_Y = MT + PH + 22;

export function DissonanceBody() {
  const lab = useLab();
  const modeRoot = useModeRoot();
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
  // M9: the harmonic entropy curve behind the roughness curve, on its own vertical scale (the curve's FULL min to max over 0..1200 c,
  // so the unison and octave dips are plotted; `source.lo/hi` are the Fixed color bounds, which leave those dips out, M9c F10); the
  // field's notes are dots at their exact value (the entropy store's single-value cache)
  const [dev] = useLabDeveloperOptions();
  const he = useHeCurve(lab.state.ui.heBlur, dev.heLimit);
  const heFull = useMemo(() => (he.curve ? heRange(he.curve) : null), [he.curve]);
  const heSpan = heFull ? Math.max(1e-9, heFull.max - heFull.min) : 1;
  const yOfHe = (v: number) =>
    MT + PH * (1 - Math.min(1, Math.max(0, (v - (heFull?.min ?? 0)) / heSpan)));
  const hePath = useMemo(
    () =>
      he.curve
        ? dissCurve.cents
            .map(
              (c, k) =>
                `${k ? 'L' : 'M'}${xOf(c).toFixed(1)} ${yOfHe(heCurveAt(he.curve!, c)).toFixed(1)}`
            )
            .join(' ')
        : null,
    [he.curve, heFull, dissCurve, repC]
  );
  const ghosts = useGhosts();
  // each ghost at its exact roughness (the curve's own calculation, not the 1 c grid), clamped into the chart
  const ghostPts = useMemo(
    () =>
      ghosts.map((g) => {
        const d = Math.min(Math.max(dissonanceAt(g.c), 0), dissCurve.max || 1);
        return { c: g.c, d, text: `${g.c.toFixed(1)} c, roughness ${d.toFixed(2)}` };
      }),
    [ghosts, dissCurve]
  );
  const fieldCents = field.map((n) => n.c);
  const heDots = useMemo(
    () => (he.source ? field.map((n) => ({ c: n.c, v: he.source!.at(n.c) })) : []),
    [he.source, field]
  );
  // the notes whose ratio label is drawn: sounding or in the subset
  const labeled = fieldCents.flatMap((_, i) =>
    lab.sounding.has(i) || lab.selected.has(i) ? [i] : []
  );
  const labeledNoteXs = labeled.map((i) => xOf(fieldCents[i]));
  // the dip at the far end is the repeat itself (an octave, a tritave ...), not a second unison: name it by the repeat's ratio
  const dipName = (d: { idx: number; ratio: string }) =>
    d.idx === dissCurve.cents.length - 1 ? repText : d.ratio;
  // ONE layout for every name under the axis: the note ratios first (natural spot under their mark), then the dip names
  // (none within NEAR_X of a drawn note label), all assigned to lanes together
  const dipItems = dissDips.flatMap((d, k) =>
    labeledNoteXs.some((nx) => Math.abs(nx - xOf(d.c)) <= NEAR_X)
      ? []
      : [
          {
            k,
            item: {
              x: xOf(d.c),
              y: yOf(d.d),
              text: dipName(d),
              isFirst: d.idx === 0,
              isLast: d.idx === dissCurve.cents.length - 1,
            },
          },
        ]
  );
  const places = layoutChartLabels(
    [
      ...labeled.map((i) => ({
        x: xOf(fieldCents[i]),
        y: yOf(0),
        text: ratios[i],
        isFirst: false,
        isLast: false,
        first: true,
      })),
      ...dipItems.map((d) => d.item),
    ],
    { bandY: BAND_Y, x0: ML, x1: W - MR }
  );
  const notePlace = new Map(labeled.map((i, n) => [i, places[n]]));
  const dipPlace = new Map(dipItems.map((d, n) => [d.k, places[labeled.length + n]]));
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
      <div className={classes.heHeader} data-testid="he-header">
        <HeBlurSlider />
        {he.building && (
          <span className={classes.heNote} data-testid="he-building">
            Building entropy…
          </span>
        )}
      </div>
      <div className={classes.dissHost}>
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
                    data-pin={lab.pin === i ? 'true' : undefined}
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
                    role="button"
                    tabIndex={0}
                    aria-label={`${ratios[i]}${lab.selected.has(i) ? ', in subset' : ''}${lab.pin === i ? ', pinned' : ''}${rootLabel(modeRoot, i)}`}
                    onFocus={() => lab.setHover(i)}
                    onBlur={() => lab.setHover(null)}
                    {...noteHandlers(lab, i)}
                  />
                  {modeRoot === i && <ModeChevron x={xOf(c)} y={MT - 1} deg={90} scale={0.7} />}
                  {state !== 'off' && notePlace.get(i) && (
                    <>
                      {(notePlace.get(i)!.lane > 0 ||
                        Math.abs(notePlace.get(i)!.x - xOf(c)) > 1) && (
                        <line
                          className={labClasses.labelLeader}
                          data-testid="diss-note-leader"
                          x1={xOf(c)}
                          x2={notePlace.get(i)!.leaderTo.x}
                          y1={yOf(0) + 3}
                          y2={notePlace.get(i)!.leaderTo.y}
                        />
                      )}
                      <text
                        className={classes.dissNote}
                        data-state={state}
                        x={notePlace.get(i)!.x}
                        y={notePlace.get(i)!.y}
                        textAnchor={notePlace.get(i)!.anchor}
                        style={
                          notePlace.get(i)!.scale < 1
                            ? { fontSize: SVG_FS_SMALL * notePlace.get(i)!.scale }
                            : undefined
                        }
                      >
                        {ratios[i]}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
            {hePath && <path className={classes.heLine} d={hePath} data-testid="he-curve" />}
            <path className={classes.dissLine} d={path} />
            {hePath && (
              <text className={classes.heLabel} x={W / 2} y={11} textAnchor="middle">
                Harmonic entropy
              </text>
            )}
            {heDots.map((d, i) => (
              <circle
                key={i}
                className={classes.heDot}
                data-testid="he-dot"
                cx={xOf(d.c)}
                cy={yOfHe(d.v)}
                r={2.5}
                pointerEvents="none"
              >
                <title>{`${ratios[i]}: harmonic entropy ${d.v.toFixed(2)}`}</title>
              </circle>
            ))}
            {ghostPts.map((g) => (
              <g
                key={g.c}
                data-testid="diss-ghost"
                role="img"
                aria-label={`Ghost: ${g.text}`}
                pointerEvents="none"
              >
                <title>{g.text}</title>
                <line
                  className={classes.dissGhostLine}
                  x1={xOf(g.c)}
                  x2={xOf(g.c)}
                  y1={MT}
                  y2={yOf(0)}
                />
                <circle
                  className={classes.dissGhostDot}
                  data-testid="diss-ghost-dot"
                  cx={xOf(g.c)}
                  cy={yOf(g.d)}
                  r={4}
                  pointerEvents="all"
                />
              </g>
            ))}
            {dissDips.map((d, k) => {
              const place = dipPlace.get(k);
              return (
                <g key={d.idx}>
                  <circle className={classes.dissDip} cx={xOf(d.c)} cy={yOf(d.d)} r={2}>
                    <title>{dipName(d)}</title>
                  </circle>
                  {place && (
                    <>
                      {place.leader && (
                        <line
                          className={labClasses.labelLeader}
                          data-testid="diss-dip-leader"
                          x1={xOf(d.c)}
                          x2={place.leaderTo.x}
                          y1={yOf(d.d) + 3}
                          y2={place.leaderTo.y}
                        />
                      )}
                      <text
                        className={classes.dissDipLabel}
                        x={place.x}
                        y={place.y}
                        textAnchor={place.anchor}
                        style={
                          place.scale < 1 ? { fontSize: SVG_FS_SMALL * place.scale } : undefined
                        }
                      >
                        {dipName(d)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
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
                y={MT + PH + 9}
                textAnchor={c === 0 ? 'start' : c === repC ? 'end' : 'middle'}
              >
                {Math.round(c)}
              </text>
            ))}
          </svg>
        </Tip>
        <OutsideCount testId="diss-outside-count" live={false} corner="top" />
      </div>
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
        {he.curve && heFull && (
          <Row name={<Tip k="heCurve">Harmonic entropy</Tip>}>
            {shownIdx === null ? (
              <Num muted>
                {heFull.min.toFixed(2)} to {heFull.max.toFixed(2)}
              </Num>
            ) : (
              <Num>{heCurveAt(he.curve, dissCurve.cents[shownIdx]).toFixed(2)}</Num>
            )}
          </Row>
        )}
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
