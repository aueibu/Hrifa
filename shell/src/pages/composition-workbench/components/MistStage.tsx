import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Group, NumberInput, Text } from '@mantine/core';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { cyclesOf, periodOf, type MistField, type MistSettings } from '../mist';
import classes from './SwirlingMists.module.css';

// Red is reserved for the playhead, so strata cycle through the other categorical hues.
const strataHues = [
  'cyan',
  'green',
  'yellow',
  'violet',
  'pink',
  'blue',
  'orange',
  'teal',
  'lime',
  'indigo',
  'grape',
];
export const strataColor = (index: number) =>
  `var(--mark-${strataHues[index % strataHues.length]})`;

// One SVG: the scrolling ridgeline on the left, the live vertical slice on the right.
const plotLeft = 40;
const plotRight = 980;
const sliceAxisX = 1090;
const viewWidth = 1250;
const rowPitch = 54;
const ridgeHeight = 70;
const plotTop = 24;
/** Fewest points a curve is drawn with, and the most; more cycles in view get more points up to the cap. */
const curvePoints = 360;
const maxCurvePoints = 2000;
const pointsPerCycle = 8;
/** Fewest plot units a cycle may take before the curve is drawn as a band instead. */
const minCycleWidth = 4;
const labelGap = 15;
/** Where "now" sits across the ridgeline: the past scrolls off the left, the future arrives from the right. */
const nowFraction = 0.35;
const maxTicksPerRow = 400;
/** Fewest plot units between repeat boundaries, and between a row's loop restarts, before they are left out. */
const minCycleSpacing = 28;
const minRestartSpacing = 14;
const maxWindows = 24;
export const fallbackViewSpan = 64;

/** Spreads label positions apart so neighbours never overlap, keeping their order. */
function relaxLabels(ys: number[], top: number, bottom: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed = order.map((entry) => entry.y);
  for (let k = 1; k < placed.length; k += 1) {
    placed[k] = Math.max(placed[k], placed[k - 1] + labelGap);
  }
  for (let k = placed.length - 1; k >= 0; k -= 1) {
    const limit = k === placed.length - 1 ? bottom : placed[k + 1] - labelGap;
    placed[k] = Math.min(placed[k], limit);
  }
  const result = new Array<number>(ys.length);
  order.forEach((entry, k) => {
    result[entry.i] = Math.max(top, placed[k]);
  });
  return result;
}

const formatNumber = (value: number) => String(Number(value.toFixed(2)));

export interface MistStageProps {
  instanceId: string;
  settings: MistSettings;
  field: MistField;
  /** Seconds per sample step while the audio preview sounds, so the stage can follow it. */
  stepSeconds: number;
  audioPlaying: boolean;
  /** One full repeat of the field in positions, when it has one. */
  repeat?: number;
  /** Positions shown across the ridgeline; null fits one full repeat. */
  span: number | null;
  onSpan(span: number | null): void;
  /** Positions advanced per second while running; null passes the shortest period in about 2 seconds. */
  speed: number | null;
  onSpeed(speed: number | null): void;
}

/**
 * The field running on its own clock, independent of audio and of the sampling window. The curves
 * scroll past a fixed "now" line and the slice on the right shows every stratum's value at now, so the
 * different periods can be watched drifting against each other. Each row is labelled with its period
 * and ticks where its loop restarts. Audio, when it plays, drives the same position.
 */
export const MistStage = memo(function MistStage({
  instanceId,
  settings,
  field,
  stepSeconds,
  audioPlaying,
  repeat,
  span: spanSetting,
  onSpan,
  speed: speedSetting,
  onSpeed,
}: MistStageProps) {
  const engine = useAudioEngine();
  const startedAt = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.clock(instanceId)?.startedAtMs
  );
  const audioFollowing = audioPlaying && startedAt !== undefined && stepSeconds > 0;

  // Any positive span is allowed, from a sliver of one pass to many repeats. Nothing is drawn per
  // position (the curves are a fixed number of points and the tick marks thin out with zoom), so a
  // huge span costs no more than a small one.
  const fitted = repeat !== undefined && repeat > 0 ? repeat : fallbackViewSpan;
  const span = spanSetting !== null && spanSetting > 0 ? spanSetting : fitted;
  // By default the shortest cycle takes about two seconds to pass, slow enough to follow the waves
  // however wide the view is.
  const periods = field.strataIndices
    .map((index) => settings.strata[index])
    .filter((stratum) => stratum.speed !== 0)
    .map((stratum) => 1 / (Math.abs(stratum.speed) * cyclesOf(stratum)));
  const speed = speedSetting ?? (periods.length ? Math.min(...periods) / 2 : span / 16);

  const [position, setPosition] = useState(settings.start);
  const [running, setRunning] = useState(false);
  const clock = useRef<number | null>(null);

  useEffect(() => {
    if (!running && !audioFollowing) {
      clock.current = null;
      return undefined;
    }
    let frame = requestAnimationFrame(function tick(time) {
      const last = clock.current ?? time;
      clock.current = time;
      if (audioFollowing) {
        setPosition(settings.start + ((time - startedAt) / 1000 / stepSeconds) * settings.stride);
      } else {
        setPosition((current) => current + ((time - last) / 1000) * speed);
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running, audioFollowing, speed, startedAt, stepSeconds, settings.start, settings.stride]);

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);

  const rows = field.strataIndices.length;
  const viewStart = position - nowFraction * span;
  const viewEnd = viewStart + span;
  const x = (s: number) => plotLeft + ((s - viewStart) / span) * (plotRight - plotLeft);
  const nowX = x(position);

  // The field repeats exactly every `cycleLength` positions, so the numbers shown wrap there (the
  // picture is a window onto a repeating signal and is already continuous across the repeat). The
  // position itself is kept unwrapped, which keeps the animation and audio-follow simple.
  const cycleLength = repeat !== undefined && repeat > 0 ? repeat : undefined;
  const wrap = (s: number) => (cycleLength ? ((s % cycleLength) + cycleLength) % cycleLength : s);
  const cycleNumber = cycleLength ? Math.floor(position / cycleLength) + 1 : 1;

  // The sampling window (what the outputs contain), marked as a thin bar along the top of the plot
  // wherever it falls in the view, once per repeat. Nothing is drawn through the curves.
  const pxPerPosition = (plotRight - plotLeft) / span;
  const stepCount = Math.max(0, Math.floor(settings.steps));
  const windows: [number, number][] = [];
  if (stepCount > 0) {
    const lastStep = settings.start + (stepCount - 1) * settings.stride;
    const low = Math.min(settings.start, lastStep);
    const high = Math.max(settings.start, lastStep);
    const first = cycleLength ? Math.floor((viewStart - high) / cycleLength) : 0;
    const last = cycleLength ? Math.ceil((viewEnd - low) / cycleLength) : 0;
    if (cycleLength && high - low >= cycleLength) {
      // The window is at least one full repeat long, so every repeat's copy overlaps the next and
      // together they cover everything. Draw only the copy that holds "now".
      const shift = Math.floor((position - low) / cycleLength) * cycleLength;
      windows.push([low + shift, high + shift]);
    } else {
      for (let n = first; n <= last && windows.length < maxWindows; n += 1) {
        const shift = cycleLength ? n * cycleLength : 0;
        windows.push([low + shift, high + shift]);
      }
    }
  }
  // Where each repeat begins, so the wrap is visible as well as numbered. Only when the boundaries
  // are far enough apart to tell apart; the cycle counter always says where you are.
  const cycleStarts: number[] = [];
  if (cycleLength && cycleLength * pxPerPosition >= minCycleSpacing) {
    for (
      let n = Math.ceil(viewStart / cycleLength);
      n * cycleLength <= viewEnd && cycleStarts.length < 200;
      n += 1
    ) {
      cycleStarts.push(n);
    }
  }

  const maxAmplitude = Math.max(
    1e-9,
    ...field.strataIndices.map((index) => Math.abs(settings.strata[index].amplitude))
  );
  const plotHeight = plotTop + Math.max(1, rows) * rowPitch + 32;
  const plotBottom = plotHeight - 26;
  const rowBase = (k: number) => plotTop + ridgeHeight * 0.5 + k * rowPitch;
  // A stratum's shape scaled by its amplitude, around its own row (the center only matters on the slice).
  const waveOf = (index: number, s: number) =>
    settings.strata[index].amplitude * field.wave(index, s);

  // The slice: mapped values at now, unrounded so the dots glide.
  const outLow = Math.min(settings.mapLow, settings.mapHigh);
  const outHigh = Math.max(settings.mapLow, settings.mapHigh);
  const outSpan = outHigh - outLow || 1;
  const sliceY = (mapped: number) =>
    plotBottom - ((mapped - outLow) / outSpan) * (plotBottom - plotTop);
  const here = field.at(position);
  const dotYs = here.mapped.map(sliceY);
  const labelYs = relaxLabels(
    dotYs.map((y) => y + 4),
    plotTop + 4,
    plotBottom + 4
  );
  const ticks = [outLow, (outLow + outHigh) / 2, outHigh];

  function pan(event: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg || drag.current === null || audioFollowing) {
      return;
    }
    const box = svg.getBoundingClientRect();
    const viewDx = ((event.clientX - drag.current) / box.width) * viewWidth;
    drag.current = event.clientX;
    setPosition((current) => current - (viewDx / (plotRight - plotLeft)) * span);
  }

  if (rows === 0) {
    return (
      <Text size="sm" c="dimmed">
        Enable a stratum to see the mist.
      </Text>
    );
  }

  return (
    <>
      <div className={classes.plot}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewWidth} ${plotHeight}`}
          style={{ aspectRatio: `${viewWidth} / ${plotHeight}` }}
          role="img"
          aria-label={`${rows} strata over ${formatNumber(span)} positions, with a vertical slice at position ${formatNumber(wrap(position))}${cycleLength ? `, cycle ${cycleNumber}` : ''}`}
        >
          {windows.map(([from, to], index) => (
            <rect
              key={`window:${index}`}
              x={x(from)}
              y={plotBottom + 3}
              width={Math.max(3, x(to) - x(from))}
              height={5}
              className={classes.stepBand}
            >
              <title>{`Snapshot window: positions ${formatNumber(from)} to ${formatNumber(to)}, the values in the outputs`}</title>
            </rect>
          ))}
          {cycleStarts.map((n) => (
            <g key={`cycle:${n}`}>
              <line
                x1={x(n * (cycleLength ?? 0))}
                x2={x(n * (cycleLength ?? 0))}
                y1={plotTop - 8}
                y2={plotBottom}
                className={classes.cycleLine}
              />
              {(cycleLength ?? 0) * pxPerPosition >= 3 * minCycleSpacing && (
                <text x={x(n * (cycleLength ?? 0)) + 4} y={plotTop - 10}>
                  {`cycle ${n + 1} ↻`}
                </text>
              )}
            </g>
          ))}
          {field.strataIndices.map((index, k) => {
            const stratum = settings.strata[index];
            const base = rowBase(k);
            // How many cycles of this stratum are in view decides how it can be drawn. A fixed number of
            // points would land at nearly the same phase of consecutive cycles whenever the spacing
            // came close to a cycle's length, drawing a slow wave that is not in the data (aliasing). So
            // the curve gets several points per cycle, and when the cycles are too packed to tell apart
            // (under minCycleWidth plot units each) it is drawn as a band spanning its amplitude.
            const cyclesInView = Math.abs(stratum.speed) * cyclesOf(stratum) * span;
            const dense = cyclesInView * minCycleWidth > plotRight - plotLeft;
            const pointCount = Math.min(
              maxCurvePoints,
              Math.max(curvePoints, Math.ceil(cyclesInView * pointsPerCycle))
            );
            const half = (Math.abs(stratum.amplitude) / maxAmplitude) * (ridgeHeight * 0.5);
            const points = dense
              ? []
              : Array.from({ length: pointCount }, (_, i) => {
                  const s = viewStart + (span * i) / (pointCount - 1);
                  return `${x(s).toFixed(1)},${(base - (waveOf(index, s) / maxAmplitude) * (ridgeHeight * 0.5)).toFixed(1)}`;
                });
            // Where this stratum's pass restarts: the passes elapsed, phase + speed * s, is a whole
            // number.
            const period = periodOf(stratum);
            const restarts: number[] = [];
            // Left out when the passes are too short to tell apart at this zoom.
            if (period !== undefined && period * pxPerPosition >= minRestartSpacing) {
              const a = stratum.phase + stratum.speed * viewStart;
              const b = stratum.phase + stratum.speed * viewEnd;
              const first = Math.ceil(Math.min(a, b));
              const last = Math.floor(Math.max(a, b));
              if (last - first < maxTicksPerRow) {
                for (let n = first; n <= last; n += 1) {
                  restarts.push((n - stratum.phase) / stratum.speed);
                }
              }
            }
            const wavePoint = waveOf(index, position) / maxAmplitude;
            return (
              <g key={index}>
                <polygon
                  points={
                    dense
                      ? `${plotLeft},${base + 6} ${plotLeft},${base - half} ${plotRight},${base - half} ${plotRight},${base + 6}`
                      : `${plotLeft},${base + 6} ${points.join(' ')} ${plotRight},${base + 6}`
                  }
                  fill="var(--panel-well)"
                  stroke="none"
                />
                {dense && (
                  <rect
                    x={plotLeft}
                    y={base - half}
                    width={plotRight - plotLeft}
                    height={Math.max(2, 2 * half)}
                    fill={strataColor(index)}
                    className={classes.denseBand}
                  >
                    <title>{`${Math.round(cyclesInView)} cycles in view, too many to draw one by one. Zoom in (a smaller View span) to see the wave.`}</title>
                  </rect>
                )}
                {restarts.map((s) => (
                  <line
                    key={s}
                    x1={x(s)}
                    x2={x(s)}
                    y1={base - 6}
                    y2={base + 6}
                    stroke={strataColor(index)}
                    className={classes.restart}
                  />
                ))}
                {!dense && (
                  <polyline
                    points={points.join(' ')}
                    className={classes.ridge}
                    fill="none"
                    stroke={strataColor(index)}
                  />
                )}
                <circle
                  cx={nowX}
                  cy={base - wavePoint * (ridgeHeight * 0.5)}
                  r={5}
                  className={classes.dot}
                  fill={strataColor(index)}
                />
                <text x={plotLeft - 8} y={base + 4} textAnchor="end">
                  {index + 1}
                </text>
                <text x={plotRight} y={base - ridgeHeight * 0.5 + 6} textAnchor="end">
                  {period === undefined ? 'static' : `period ${formatNumber(period)}`}
                  {dense ? ` · ${Math.round(cyclesInView)} cycles in view` : ''}
                </text>
              </g>
            );
          })}
          <line
            x1={nowX}
            x2={nowX}
            y1={plotTop - 8}
            y2={plotBottom}
            className={audioFollowing ? classes.cursorPlaying : classes.cursor}
          />
          <text x={plotLeft} y={plotHeight - 6}>
            {formatNumber(wrap(viewStart))}
          </text>
          <text x={nowX} y={plotHeight - 6} textAnchor="middle">
            {`now ${formatNumber(wrap(position))}`}
          </text>
          <text x={plotRight} y={plotHeight - 6} textAnchor="end">
            {formatNumber(wrap(viewEnd))}
          </text>
          <rect
            x={plotLeft}
            y={plotTop - 8}
            width={plotRight - plotLeft}
            height={plotBottom - plotTop + 8}
            className={classes.scrub}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = event.clientX;
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) {
                pan(event);
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />

          <text
            x={sliceAxisX - 70}
            y={plotTop - 10}
            textAnchor="middle"
            className={classes.sliceTitle}
          >
            now
          </text>
          <line
            x1={sliceAxisX}
            x2={sliceAxisX}
            y1={plotTop}
            y2={plotBottom}
            className={classes.sliceAxis}
          />
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={sliceAxisX - 6}
                x2={sliceAxisX + 6}
                y1={sliceY(tick)}
                y2={sliceY(tick)}
                className={classes.sliceAxis}
              />
              <text x={sliceAxisX - 12} y={sliceY(tick) + 4} textAnchor="end">
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {field.strataIndices.map((index, k) => (
            <g key={index}>
              <line
                x1={sliceAxisX + 10}
                y1={dotYs[k]}
                x2={sliceAxisX + 26}
                y2={labelYs[k] - 4}
                className={classes.leader}
                stroke={strataColor(index)}
              />
              <circle
                cx={sliceAxisX}
                cy={dotYs[k]}
                r={7}
                className={classes.dot}
                fill={strataColor(index)}
              />
              <text x={sliceAxisX + 30} y={labelYs[k]} className={classes.sliceLabel}>
                {index + 1} · {formatNumber(here.mapped[k])}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Button
          size="xs"
          variant={running ? 'filled' : 'default'}
          disabled={audioFollowing}
          onClick={() => setRunning((current) => !current)}
        >
          {running ? '❚❚ Pause' : '▶ Run'}
        </Button>
        <NumberInput
          size="xs"
          w="6.5rem"
          label="Speed / s"
          aria-label="Positions advanced per second"
          step={0.5}
          decimalScale={3}
          value={speedSetting ?? Number(speed.toFixed(3))}
          onChange={(value) => {
            const next = typeof value === 'number' ? value : Number(value);
            onSpeed(Number.isFinite(next) && value !== '' ? next : null);
          }}
        />
        <NumberInput
          size="xs"
          w="6.5rem"
          label="View span"
          aria-label="Positions shown across the plot"
          decimalScale={6}
          step={Math.max(0.001, Number((span / 20).toPrecision(1)))}
          value={Number(span.toFixed(6))}
          onChange={(value) => {
            // Anything above 0 is taken as typed; a half-typed or empty value waits for the next key.
            const next = typeof value === 'number' ? value : Number(value);
            if (value !== '' && Number.isFinite(next) && next > 0) {
              onSpan(next);
            }
          }}
        />
        <Button
          size="xs"
          variant="default"
          disabled={!repeat}
          title={
            repeat
              ? `Show one full repeat of the field: ${formatNumber(repeat)} positions`
              : 'This field does not repeat'
          }
          onClick={() => {
            onSpan(null);
            onSpeed(null);
          }}
        >
          Fit repeat{repeat ? ` (${formatNumber(repeat)})` : ''}
        </Button>
        <NumberInput
          size="xs"
          w="6.5rem"
          label="Position"
          aria-label="Position of the now line"
          decimalScale={2}
          disabled={running || audioFollowing}
          value={Number(wrap(position).toFixed(2))}
          onChange={(value) => {
            const next = typeof value === 'number' ? value : Number(value);
            if (Number.isFinite(next) && value !== '') {
              // Typing a position stays in the current cycle.
              setPosition(
                cycleLength ? Math.floor(position / cycleLength) * cycleLength + next : next
              );
            }
          }}
        />
        <Text size="xs" ff="monospace" pb={6} aria-live="off">
          {cycleLength
            ? `cycle ${cycleNumber} · ${formatNumber(wrap(position))} of ${formatNumber(cycleLength)}`
            : `${formatNumber(position)} · does not repeat`}
        </Text>
        <Button
          size="xs"
          variant="default"
          disabled={audioFollowing}
          onClick={() => setPosition(settings.start)}
        >
          Back to start
        </Button>
        <Text size="xs" c="dimmed" pb={6}>
          Drag the plot to move through time.
        </Text>
      </Group>
    </>
  );
});
