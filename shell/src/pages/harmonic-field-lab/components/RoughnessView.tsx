/**
 * The Live roughness view: the Sethares roughness of what sounds now. It shows the total, one bar per pair of sounding
 * notes (roughest first) and the next-note curve (the total if one more tone were added at each interval above the lowest
 * sounding note, over one repeat). Runtime only: it reads `sounding`, `soundingMarks` and `soundingGhosts` from the lab
 * state (field lights, held keys, held chord and shelf previews, Sketch holds and off-field ghosts all flow through them)
 * and recomputes at most once per animation frame. The maths is `liveRoughness` in the lib.
 *
 * Register: a note sounding `c` cents above 1/1 is taken at `ui.baseHz * 2 ** (c / 1200)` (the engine's `absHz`, which the
 * chips, shelf, Sketch and key rings use); the lowest sounding note is the curve's reference.
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
import { curveMinima, liveRoughness } from '../../../lib/harmonic-field';
import { ghostKey } from '../state/ghosts';
import { Num, Row, Tip, useLab } from './ui';
import classes from './panels.module.css';

const W = 360;
const H = 200;
const ML = 8;
const MR = 8;
const MT = 22;
const MB = 34;
const PW = W - ML - MR;
const PH = H - MT - MB;
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

export function RoughnessBody() {
  const lab = useLab();
  const { field, ratios, repC, repText } = lab.base;
  const { sounding, soundingMarks, soundingGhosts, chord } = lab;
  const baseHz = lab.state.ui.baseHz;
  // every sounding pitch, one entry per pitch (a field light and a ghost at the same place count once)
  const live = useMemo<Tone[]>(() => {
    const seen = new Set<number>();
    const out: Tone[] = [];
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
  }, [sounding, soundingMarks, soundingGhosts, field, ratios]);
  const soundingTones = useFrameValue(live);
  // the hovered chord (the one source of truth is the lab's chord hover: chips, cards, rows, shelf slots, Sketch notes)
  const chordHover = lab.state.chordHover;
  const hoverTones = useMemo<Tone[]>(
    () =>
      chordHover
        ? [...chordHover]
            .filter((i) => i >= 0 && i < field.length)
            .map((i) => ({ c: field[i].c, label: ratios[i], idx: i }))
            .sort((a, b) => a.c - b.c)
        : [],
    [chordHover, field, ratios]
  );
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
  // priority: sounding now, then the hovered chord, then the lingering chord, then idle
  const source: 'sounding' | 'hover' | 'last' | 'idle' = soundingTones.length
    ? 'sounding'
    : hoverTones.length
      ? 'hover'
      : linger?.length
        ? 'last'
        : 'idle';
  const tones =
    source === 'sounding'
      ? soundingTones
      : source === 'hover'
        ? hoverTones
        : source === 'last'
          ? linger!
          : EMPTY;
  // opacity phase of the drawn items: full while sounding or hovered, dimmed (then fading out) while lingering
  const state: 'idle' | 'sounding' | 'hover' | 'linger' | 'fading' =
    source === 'last' ? (stage === 'out' ? 'fading' : 'linger') : source;
  const phase = state === 'fading' ? 'out' : state;
  const r = useMemo(
    () =>
      liveRoughness(
        tones.map((t) => t.c),
        baseHz,
        { repC }
      ),
    [tones, baseHz, repC]
  );
  const dips = useMemo(
    () =>
      r.curve.cents.length > 2 ? curveMinima({ ...r.curve, max: Math.max(...r.curve.values) }) : [],
    [r]
  );
  const n = tones.length;
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
  // the hint text keeps its words while it fades (two or more notes, and while the last chord fades out)
  const hintRef = useRef('');
  if (n === 0 || phase === 'out') {
    hintRef.current =
      'Nothing is sounding. Hold a key, a chord chip or a shelf chord to see how rough it is.';
  } else if (n === 1) {
    hintRef.current = 'One note sounding. Play two or more to see which pair is roughest.';
  }
  const hintText = hintRef.current;
  const hintVisible = n < 2 || phase === 'out';
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
          <span className={classes.liveHint}>lower is smoother</span>
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
                y={H - 3}
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
                      source !== 'hover' && t.idx >= 0 && chord.has(t.idx) ? 'true' : undefined
                    }
                    x1={xOf(x)}
                    x2={xOf(x)}
                    y1={MT}
                    y2={yOf(lo)}
                  />
                ) : null;
              })}
              {n > 0 && <path className={classes.dissLine} d={path} />}
              {dips.map((d) => (
                <g key={d.idx}>
                  <circle className={classes.dissDip} cx={xOf(d.c)} cy={yOf(d.d)} r={2} />
                  <text
                    className={classes.dissDipLabel}
                    x={xOf(d.c)}
                    y={yOf(d.d) - 6}
                    textAnchor={
                      d.idx === 0 ? 'start' : d.idx === r.curve.cents.length - 1 ? 'end' : 'middle'
                    }
                  >
                    {dipName(d)}
                  </text>
                </g>
              ))}
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
              aria-valuenow={shown === null ? undefined : r.curve.cents[shown]}
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
            {source === 'sounding' ? 'sounding' : source === 'hover' ? 'hover' : 'last chord'}
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
          tabIndex={0}
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
