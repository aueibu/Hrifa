/**
 * The Live roughness view: the Sethares roughness of what sounds now. It shows the total, one bar per pair of sounding
 * notes (roughest first) and the next-note curve (the total if one more tone were added at each interval above the lowest
 * sounding note, over one repeat). Runtime only: it reads `sounding`, `soundingMarks` and `soundingGhosts` from the lab
 * state (field lights, held keys, held chord and shelf previews, Sketch holds and off-field ghosts all flow through them)
 * and recomputes at most once per animation frame. The maths is `liveRoughness` in the lib.
 *
 * A hovered note (`lab.hover`) or a pinned note (`lab.pin`) counts as a one-note chord, silently. Faint marks on the
 * curve show every other field note at its interval above the lowest shown note, with its pair roughness.
 *
 * Pitches: every sounding note as played (`soundingPitches`: cents above 1/1 from the engine's real Hz, stacked octaves
 * kept); a hovered chord card gives its own pitch list. Register (viz setting): `Shape` puts the lowest shown note
 * at POSITIONAL_BASE_HZ (the total equals the chord card's `roughnessOf`), `Pitch` uses `ui.baseHz * 2 ** (c / 1200)`.
 * The lowest shown note is the curve's reference.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { SegmentedControl } from '@mantine/core';
import {
  POSITIONAL_BASE_HZ,
  curveMinima,
  fieldMarks,
  liveRoughness,
} from '../../../lib/harmonic-field';
import { layoutChartLabels } from '../state/chartLabelLayout';
import { ghostKey } from '../state/ghosts';
import type { VizId } from '../state/layout';
import { SVG_FS_SMALL } from '../state/typeScale';
import { ROUGH_REGISTERS, type RoughRegister } from '../state/vizState';
import { Num, Row, Tip, useLab, useViz } from './ui';
import labClasses from './lab.module.css';
import classes from './panels.module.css';

const W = 360;
const H = 220;
const ML = 8;
const MR = 8;
const MT = 22;
/** Bottom margin: tick row, then the label band (3 lanes) for the dip names. */
const MB = 54;
const PW = W - ML - MR;
const PH = H - MT - MB;
/** Centre y of the first label lane, under the tick row. */
const BAND_Y = MT + PH + 22;
/** The last sounding chord stays (dimmed) this long after its last note is released ... */
export const LINGER_MS = 1500;
/** ... then fades out completely over this long (CSS `--live-fade-end` is the same value). */
export const FADE_OUT_MS = 500;

interface Tone {
  /** Cents above 1/1. */
  c: number;
  label: string;
  /** Field index when the tone is a field note, else -1 (a ghost). */
  idx: number;
}

/** A value that follows `value` at most once per animation frame (a timer where there is no frame callback). */
function useFrameValue<T>(value: T): T {
  const [shown, setShown] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  const pending = useRef<{ cancel: () => void } | null>(null);
  useEffect(() => {
    if (Object.is(shown, value) || pending.current) {
      return;
    }
    const done = () => {
      pending.current = null;
      setShown(latest.current);
    };
    if (typeof requestAnimationFrame === 'function') {
      const h = requestAnimationFrame(done);
      pending.current = { cancel: () => cancelAnimationFrame(h) };
    } else {
      const h = setTimeout(done, 16);
      pending.current = { cancel: () => clearTimeout(h) };
    }
  }, [value, shown]);
  useEffect(
    () => () => {
      pending.current?.cancel();
      pending.current = null;
    },
    []
  );
  return shown;
}

/**
 * One value slot of a readout row: a fixed-width box (set by `--live-slot-N` in CSS, never by its text) holding two
 * layers in the same place with the same elements and classes: an invisible blank (placeholder: same elements, never shown) and the data layer. Nothing moves between idle, sounding, hover and linger.
 */
function StatSlot({
  slot,
  children,
  testId,
  title,
}: {
  slot: '1' | '2' | '3';
  children: ReactNode;
  testId?: string;
  title?: string;
}) {
  return (
    <span className={classes.liveSlot} data-slot={slot}>
      <span
        aria-hidden="true"
        className={`${classes.liveIdleText} ${classes.liveBlank}`}
        data-layer="placeholder"
      >
        <Num muted>{'\u00a0'}</Num>
      </span>
      <span className={classes.liveData} data-layer="data" data-testid={testId} title={title}>
        {children}
      </span>
    </span>
  );
}

const EMPTY: Tone[] = [];
const TAG = {
  sounding: 'sounding',
  hover: 'hover',
  note: 'note',
  last: 'last chord',
  pinned: 'pinned',
  idle: '',
} as const;

export function RoughnessBody({ id }: { id: VizId }) {
  const lab = useLab();
  const viz = useViz();
  const register: RoughRegister = viz.settings(id).register ?? 'shape';
  const { field, ratios, repC, repText } = lab.base;
  const { sounding, soundingMarks, soundingGhosts, soundingPitches, chord } = lab;
  const baseHz = lab.state.ui.baseHz;
  // every sounding pitch as played (the real Hz, stacked octaves kept), one entry per pitch; the field-index sets are only
  // the fallback for a lit state that carries no pitches (they reduce a note into one repeat)
  const liveRaw = useMemo<Tone[]>(() => {
    const out: Tone[] = [];
    if (soundingPitches.length) {
      for (const p of soundingPitches) {
        const known = p.src >= 0 && p.src < field.length;
        if (Number.isFinite(p.c)) {
          out.push({
            c: p.c,
            label: known ? ratios[p.src] : `${p.c.toFixed(1)} c`,
            idx: known ? p.src : -1,
          });
        }
      }
      return out.sort((a, b) => a.c - b.c);
    }
    const seen = new Set<number>();
    const add = (c: number, label: string, idx: number) => {
      const k = ghostKey(c);
      if (!seen.has(k) && Number.isFinite(c)) {
        seen.add(k);
        out.push({ c, label, idx });
      }
    };
    for (const i of [...sounding, ...soundingMarks]) {
      if (i >= 0 && i < field.length) {
        add(field[i].c, ratios[i], i);
      }
    }
    for (const c of soundingGhosts) {
      add(c, `${c.toFixed(1)} c`, -1);
    }
    return out.sort((a, b) => a.c - b.c);
  }, [soundingPitches, sounding, soundingMarks, soundingGhosts, field, ratios]);
  // one shared empty array: an idle recompute must not look like a change (it would restart the linger timers)
  const live = liveRaw.length ? liveRaw : EMPTY;
  const soundingTones = useFrameValue(live);
  // the hovered chord (the one source of truth is the lab's chord hover: chips, cards, rows, shelf slots, Sketch notes)
  const chordHover = lab.state.chordHover;
  const chordHoverPitches = lab.chordHoverPitches;
  const hoverTones = useMemo<Tone[]>(() => {
    if (chordHoverPitches?.length) {
      // the card's own pitches (stacked octaves kept); a label is the field note at the same place in the repeat
      return chordHoverPitches
        .map((c) => {
          const red = repC > 0 ? ((c % repC) + repC) % repC : c;
          const i = field.findIndex((f) => {
            const fr = repC > 0 ? ((f.c % repC) + repC) % repC : f.c;
            return Math.abs(fr - red) < 0.5;
          });
          return { c, label: i >= 0 ? ratios[i] : `${c.toFixed(1)} c`, idx: i };
        })
        .sort((a, b) => a.c - b.c);
    }
    return chordHover
      ? [...chordHover]
          .filter((i) => i >= 0 && i < field.length)
          .map((i) => ({ c: field[i].c, label: ratios[i], idx: i }))
          .sort((a, b) => a.c - b.c)
      : [];
  }, [chordHover, chordHoverPitches, field, ratios, repC]);
  // a hovered or pinned note is a one-note chord (silent)
  const hoverNote =
    lab.hover !== null && lab.hover >= 0 && lab.hover < field.length ? lab.hover : null;
  const pinNote = lab.pin !== null && lab.pin >= 0 && lab.pin < field.length ? lab.pin : null;
  const noteTone = (i: number | null): Tone[] =>
    i === null ? EMPTY : [{ c: field[i].c, label: ratios[i], idx: i }];
  const hoverNoteTones = useMemo(() => noteTone(hoverNote), [hoverNote, field, ratios]);
  const pinNoteTones = useMemo(() => noteTone(pinNote), [pinNote, field, ratios]);
  // The last sounding chord lingers: dimmed and held until LINGER_MS, then its drawn items fade out over FADE_OUT_MS
  // (the placeholder layer under them never changes) and only then is the stored chord cleared. A new sounding note
  // cancels both timers at once; a hover shows at once and the timeline carries on underneath it.
  const lastSounding = useRef<Tone[]>([]);
  const [stage, setStage] = useState<'dim' | 'out'>('dim');
  const [, bump] = useState(0);
  useEffect(() => {
    if (soundingTones.length) {
      lastSounding.current = soundingTones;
      setStage('dim');
      return;
    }
    if (!lastSounding.current.length) {
      return;
    }
    setStage('dim');
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clear = () => {
      lastSounding.current = [];
      setStage('dim');
      bump((k) => k + 1);
    };
    const timers = [setTimeout(reduce ? clear : () => setStage('out'), LINGER_MS)];
    if (!reduce) {
      timers.push(setTimeout(clear, LINGER_MS + FADE_OUT_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [soundingTones]);
  // read in the render that sees the release, so there is no idle flash between the two
  const linger = soundingTones.length ? null : lastSounding.current;
  // priority: sounding now, the hovered chord, the hovered note, the lingering chord, the pinned note, idle
  const source: 'sounding' | 'hover' | 'note' | 'last' | 'pinned' | 'idle' = soundingTones.length
    ? 'sounding'
    : hoverTones.length
      ? 'hover'
      : hoverNoteTones.length
        ? 'note'
        : linger?.length
          ? 'last'
          : pinNoteTones.length
            ? 'pinned'
            : 'idle';
  const tones =
    source === 'sounding'
      ? soundingTones
      : source === 'hover'
        ? hoverTones
        : source === 'note'
          ? hoverNoteTones
          : source === 'last'
            ? linger!
            : source === 'pinned'
              ? pinNoteTones
              : EMPTY;
  // opacity phase of the drawn items: full while sounding or hovered, dimmed (then fading out) while lingering
  const state: 'idle' | 'sounding' | 'hover' | 'linger' | 'fading' =
    source === 'last'
      ? stage === 'out'
        ? 'fading'
        : 'linger'
      : source === 'note' || source === 'pinned'
        ? 'hover'
        : source;
  const phase = state === 'fading' ? 'out' : state;
  // register: `shape` puts the lowest shown note at the positional cards' 1/1 Hz (the total then equals a chord card's
  // score); `played` keeps the real register (`ui.baseHz * 2 ** (c / 1200)`)
  const off = register === 'shape' && tones.length ? tones[0].c : 0;
  const regHz = register === 'shape' ? POSITIONAL_BASE_HZ : baseHz;
  const r = useMemo(
    () =>
      liveRoughness(
        tones.map((t) => t.c - off),
        regHz,
        { repC }
      ),
    [tones, off, regHz, repC]
  );
  // every field note against the lowest shown note (recomputed only when the shown notes or the field change)
  const marks = useMemo(
    () =>
      fieldMarks(
        field.map((f) => f.c - off),
        tones.map((t) => t.c - off),
        regHz,
        repC
      ),
    [tones, field, off, regHz, repC]
  );
  const dips = useMemo(
    () =>
      r.curve.cents.length > 2 ? curveMinima({ ...r.curve, max: Math.max(...r.curve.values) }) : [],
    [r]
  );
  const n = tones.length;
  const selected = lab.selected;
  const lowC = n ? tones[0].c : 0;
  const lo = n ? Math.min(...r.curve.values) : 0;
  const hi = n ? Math.max(...r.curve.values) : 1;
  const pad = (hi - lo) * 0.06 || 0.1;
  const xOf = (c: number) => ML + (c / repC) * PW;
  const yOf = (v: number) => MT + PH * (1 - (v - (lo - pad)) / (hi + pad - (lo - pad)));
  const path = r.curve.cents
    .map((c, k) => `${k ? 'L' : 'M'}${xOf(c).toFixed(1)} ${yOf(r.curve.values[k]).toFixed(1)}`)
    .join(' ');
  const [at, setAt] = useState<number | null>(null);
  const shown = at !== null && at < r.curve.cents.length ? at : null;
  const move = (e: PointerEvent<SVGRectElement>) => {
    if (!r.curve.cents.length) {
      return;
    }
    const b = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
    setAt(Math.round(frac * (r.curve.cents.length - 1)));
  };
  const key = (e: KeyboardEvent<SVGRectElement>) => {
    const last = r.curve.cents.length - 1;
    if (last < 0) {
      return;
    }
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setAt(
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? last
            : Math.min(last, Math.max(0, (shown ?? 0) + step))
      );
    }
  };
  const pairs = r.pairs
    .map((p) => ({ ...p, name: `${tones[p.i].label} – ${tones[p.j].label}` }))
    .sort((a, b) => b.roughness - a.roughness);
  const biggest = pairs[0]?.roughness || 1;
  const dipName = (d: { idx: number; ratio: string }) =>
    d.idx === r.curve.cents.length - 1 ? repText : d.ratio;
  // dip names live in the band under the plot (state/chartLabelLayout.ts)
  const dipPlaces = layoutChartLabels(
    dips.map((d) => ({
      x: xOf(d.c),
      y: yOf(d.d),
      text: dipName(d),
      isFirst: d.idx === 0,
      isLast: d.idx === r.curve.cents.length - 1,
    })),
    { bandY: BAND_Y, x0: ML, x1: W - MR }
  );
  // the idle hint keeps its words while it fades; no hint for any one-note state
  const hintText =
    'Nothing is sounding. Hold a key, a chord chip or a shelf chord to see how rough it is.';
  const hintVisible = n === 0 || phase === 'out';
  const valueText = (k: number) =>
    `${r.curve.cents[k].toFixed(0)} c above the lowest note: roughness ${r.curve.values[k].toFixed(2)}`;
  return (
    <div
      className={classes.liveRough}
      data-testid="live-roughness"
      data-source={source}
      data-state={state}
    >
      <div className={classes.liveTop} data-testid="live-top">
        <div className={classes.liveHead}>
          <Tip k="liveRoughTotal" as="control">
            <span className={classes.liveStack}>
              {/* placeholder layer: same elements as the data layer below, shown only while idle or fading out */}
              <span aria-hidden="true" className={classes.liveIdleText} data-layer="placeholder">
                <span className={classes.liveTotal} data-muted="true">
                  0.00
                </span>
                <span className={classes.liveCount}>
                  <Num muted>0 notes</Num>
                </span>
              </span>
              <span className={classes.liveData} data-layer="data">
                <span
                  className={classes.liveTotal}
                  data-muted={n ? undefined : 'true'}
                  data-testid="live-total"
                >
                  {n ? r.total.toFixed(2) : '0.00'}
                </span>
                <span className={classes.liveCount}>
                  <Num muted>
                    {n} {n === 1 ? 'note' : 'notes'}
                  </Num>
                </span>
              </span>
            </span>
          </Tip>
          <span className={classes.liveRegister} title="Lower is smoother">
            <SegmentedControl
              size="xs"
              className={labClasses.tinySeg}
              aria-label="Roughness register"
              value={register}
              onChange={(v) =>
                viz.patch(id, { register: ROUGH_REGISTERS.find((x) => x === v) ?? 'shape' })
              }
              data={[
                {
                  label: (
                    <span title="Scored as if the lowest note were middle C, so the same shape always scores the same, like the chord cards.">
                      Shape
                    </span>
                  ),
                  value: 'shape',
                },
                {
                  label: (
                    <span title="Each note scored at the pitch it actually sounds.">Pitch</span>
                  ),
                  value: 'pitch',
                },
              ]}
            />
          </span>
        </div>
      </div>
      <div className={classes.liveChartHost}>
        <Tip k="liveRoughCurve" as="control" block>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className={classes.chartSvg}
            role="group"
            aria-label="Next-note curve: the total roughness if one more note were added, against its interval above the lowest sounding note"
            data-testid="live-curve"
          >
            {/* static frame: always drawn, the same for every number of notes */}
            <text className={classes.chartTick} x={ML} y={11}>
              rougher
            </text>
            <line className={classes.chartGrid} x1={ML} x2={W - MR} y1={MT + PH} y2={MT + PH} />
            {[0, repC / 2, repC].map((c) => (
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
            {/* data layer: fades as a whole over the frame */}
            <g className={classes.liveData}>
              {n > 0 && (
                <line className={classes.chartGrid} x1={ML} x2={W - MR} y1={yOf(lo)} y2={yOf(lo)} />
              )}
              {tones.map((t, k) => {
                const x = t.c - lowC;
                return x <= repC ? (
                  <line
                    key={k}
                    className={classes.liveMark}
                    data-chord={
                      (source === 'sounding' || source === 'last') && t.idx >= 0 && chord.has(t.idx)
                        ? 'true'
                        : undefined
                    }
                    x1={xOf(x)}
                    x2={xOf(x)}
                    y1={MT}
                    y2={yOf(lo)}
                  />
                ) : null;
              })}
              {n > 0 && <path className={classes.dissLine} d={path} />}
              {dips.map((d, k) => {
                const place = dipPlaces[k];
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
                            data-testid="live-dip-leader"
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
              {shown !== null && (
                <g pointerEvents="none">
                  <line
                    className={classes.dissHair}
                    x1={xOf(r.curve.cents[shown])}
                    x2={xOf(r.curve.cents[shown])}
                    y1={MT}
                    y2={yOf(lo)}
                  />
                  <circle
                    className={classes.dissCursor}
                    cx={xOf(r.curve.cents[shown])}
                    cy={yOf(r.curve.values[shown])}
                    r={3}
                  />
                </g>
              )}
            </g>
            {/* faint field notes: part of the data layer, drawn above the hit area so each can carry its own title */}
            <g className={classes.liveData} data-testid="live-field-marks">
              {marks.map((m) => {
                const inSubset = selected.has(m.idx);
                const text = `${ratios[m.idx]} against ${tones[0].label}: roughness ${m.roughness.toFixed(2)}${inSubset ? '' : ' (not in subset)'}`;
                const x = xOf(m.interval);
                return (
                  <g
                    key={m.idx}
                    role="img"
                    aria-label={text}
                    data-testid="live-field-mark"
                    data-subset={inSubset ? 'true' : 'false'}
                  >
                    <title>{text}</title>
                    <line
                      className={classes.liveFieldMark}
                      x1={x}
                      x2={x}
                      y1={yOf(lo) - 9}
                      y2={yOf(lo)}
                    />
                    <line
                      className={classes.liveFieldHit}
                      x1={x}
                      x2={x}
                      y1={yOf(lo) - 9}
                      y2={yOf(lo)}
                    />
                  </g>
                );
              })}
            </g>
            <rect
              className={classes.chartHit}
              x={ML}
              y={MT}
              width={PW}
              height={PH}
              role="slider"
              tabIndex={n ? 0 : -1}
              aria-label="Next-note curve"
              aria-valuemin={0}
              aria-valuemax={repC}
              aria-valuenow={shown === null ? 0 : r.curve.cents[shown]}
              aria-valuetext={shown === null ? 'point at the curve' : valueText(shown)}
              onPointerMove={move}
              onPointerLeave={() => setAt(null)}
              onFocus={() => setAt((a) => a ?? 0)}
              onBlur={() => setAt(null)}
              onKeyDown={key}
            />
          </svg>
        </Tip>
        {source !== 'idle' && (
          <span className={`${classes.liveTag} ${classes.liveData}`} data-testid="live-source">
            {TAG[source]}
          </span>
        )}
        <p
          className={classes.liveHintOverlay}
          data-visible={hintVisible ? 'true' : 'false'}
          aria-hidden={hintVisible ? undefined : 'true'}
          data-testid="live-hint"
        >
          {hintText}
        </p>
      </div>
      <div className={`${classes.verdicts} ${classes.liveVerdicts}`} data-testid="live-verdicts">
        <Row name="Add a note at">
          <StatSlot slot="1">
            {n === 0 ? null : shown === null ? (
              <Num muted>point at the curve</Num>
            ) : (
              <Num>{r.curve.cents[shown].toFixed(0)} c</Num>
            )}
          </StatSlot>
        </Row>
        <Row name="Total then">
          <StatSlot slot="2" testId={shown === null ? undefined : 'live-curve-value'}>
            {n === 0 ? null : shown === null ? (
              <Num muted>now {r.total.toFixed(2)}</Num>
            ) : (
              <Num>{r.curve.values[shown].toFixed(2)}</Num>
            )}
          </StatSlot>
        </Row>
        <Row name="Blends best">
          <StatSlot slot="3" title={dips.map(dipName).join('  ')}>
            {n === 0 ? null : <Num>{dips.map(dipName).join('  ') || '\u2013'}</Num>}
          </StatSlot>
        </Row>
      </div>
      <Tip k="liveRoughPairs" as="control" block>
        <ul
          className={`${classes.livePairs} ${classes.liveData}`}
          aria-label="Roughness by pair of sounding notes"
          tabIndex={pairs.length ? 0 : -1}
          data-testid="live-pairs"
        >
          {pairs.map((p) => (
            <li key={`${p.i}-${p.j}`} className={classes.livePair} data-testid="live-pair">
              <span className={classes.livePairName}>{p.name}</span>
              <span className={classes.liveBarTrack} aria-hidden="true">
                <span
                  className={classes.liveBar}
                  style={{ width: `${Math.max(2, (p.roughness / biggest) * 100)}%` }}
                />
              </span>
              <Num>{p.roughness.toFixed(2)}</Num>
            </li>
          ))}
        </ul>
      </Tip>
    </div>
  );
}
