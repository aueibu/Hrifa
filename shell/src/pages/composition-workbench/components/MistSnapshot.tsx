import { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { Text } from '@mantine/core';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { playingStep, type MistSampling, type MistSettings } from '../mist';
import { strataColor } from './MistStage';
import classes from './SwirlingMists.module.css';

const viewWidth = 1250;
const viewHeight = 250;
const left = 56;
const right = 1226;
const top = 18;
const bottom = viewHeight - 38;
const edge = 18;
/** Fewest plot units between neighbouring step lines before they are left out. */
const minStepSpacing = 12;
/** Most x-axis labels, so a long run of steps stays readable. */
const maxAxisLabels = 12;

const formatNumber = (value: number) => String(Number(value.toFixed(3)));

export interface MistSnapshotProps {
  instanceId: string;
  settings: MistSettings;
  sampling: MistSampling;
  /** Seconds each step (chord) lasts in the audio preview, so the playhead can follow it. */
  stepSeconds: number;
  audioPlaying: boolean;
}

/**
 * What the outputs actually contain: every sampled step as a column, every stratum as a dot in it, on
 * the output range (the same value axis as the NOW slice, but rounded as the outputs are). A line joins
 * each stratum's dots, which is that stratum's voice, and a column read downward is one chord. Hover a
 * column for its values.
 */
export const MistSnapshot = memo(function MistSnapshot({
  instanceId,
  settings,
  sampling,
  stepSeconds,
  audioPlaying,
}: MistSnapshotProps) {
  const [hover, setHover] = useState<number | null>(null);
  const count = sampling.positions.length;

  // While the audio preview plays, the step that is sounding gets a playhead. The engine's clock says
  // when the preview started, and step k sounds at k × stepSeconds, as the preview plays them.
  const engine = useAudioEngine();
  const startedAt = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.clock(instanceId)?.startedAtMs
  );
  const following = audioPlaying && startedAt !== undefined && stepSeconds > 0;
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!following) {
      return undefined;
    }
    let frame = requestAnimationFrame(function tick(time) {
      setNow(time);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [following]);
  const playing = following ? playingStep((now - startedAt) / 1000, stepSeconds, count) : undefined;

  const rows = sampling.strataIndices.length;
  if (count === 0 || rows === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nothing is being extracted: enable a stratum and set at least one step.
      </Text>
    );
  }

  const outLow = Math.min(settings.mapLow, settings.mapHigh);
  const outHigh = Math.max(settings.mapLow, settings.mapHigh);
  const outSpan = outHigh - outLow || 1;
  const y = (value: number) => bottom - ((value - outLow) / outSpan) * (bottom - top);
  const x = (step: number) =>
    count > 1 ? left + edge + (step * (right - left - 2 * edge)) / (count - 1) : (left + right) / 2;
  const spacing = count > 1 ? (right - left - 2 * edge) / (count - 1) : right - left;
  const radius = spacing >= 16 ? 5 : spacing >= 7 ? 3.5 : 2.2;
  const ticks = [outLow, (outLow + outHigh) / 2, outHigh];
  const labelEvery = Math.max(1, Math.ceil(count / maxAxisLabels));
  const hovered = hover !== null && hover < count ? hover : null;
  const lastPosition = sampling.positions[count - 1];

  return (
    <>
      <Text size="xs" c="dimmed">
        Extracted: {count} {count === 1 ? 'step' : 'steps'} from {formatNumber(sampling.positions[0])}
        {count > 1 ? ` to ${formatNumber(lastPosition)}, every ${formatNumber(settings.stride)}` : ''}
      </Text>
      <div className={classes.plot}>
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          style={{ aspectRatio: `${viewWidth} / ${viewHeight}` }}
          role="img"
          aria-label={`Extracted values: ${count} steps by ${rows} strata`}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className={classes.snapshotGrid} />
              <text x={left - 10} y={y(tick) + 4} textAnchor="end">
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {spacing >= minStepSpacing &&
            sampling.positions.map((position, step) => (
              <line
                key={`step:${step}`}
                x1={x(step)}
                x2={x(step)}
                y1={top}
                y2={bottom}
                className={step === hovered ? classes.snapshotHover : classes.snapshotStep}
              />
            ))}
          {hovered !== null && spacing < minStepSpacing && (
            <line
              x1={x(hovered)}
              x2={x(hovered)}
              y1={top}
              y2={bottom}
              className={classes.snapshotHover}
            />
          )}
          {sampling.strataIndices.map((index, k) => (
            <g key={index}>
              {count > 1 && (
                <polyline
                  points={sampling.mapped.map((row, step) => `${x(step)},${y(row[k])}`).join(' ')}
                  className={classes.snapshotVoice}
                  stroke={strataColor(index)}
                  fill="none"
                />
              )}
              {sampling.mapped.map((row, step) => (
                <circle
                  key={step}
                  cx={x(step)}
                  cy={y(row[k])}
                  r={step === playing ? radius + 3 : step === hovered ? radius + 1.5 : radius}
                  className={classes.dot}
                  fill={strataColor(index)}
                />
              ))}
            </g>
          ))}
          {playing !== undefined && (
            <line
              x1={x(playing)}
              x2={x(playing)}
              y1={top - 6}
              y2={bottom}
              className={classes.cursorPlaying}
            />
          )}
          {sampling.positions.map((position, step) =>
            step % labelEvery === 0 || step === count - 1 ? (
              <text key={`label:${step}`} x={x(step)} y={viewHeight - 18} textAnchor="middle">
                {formatNumber(position)}
              </text>
            ) : null
          )}
          <text x={left} y={viewHeight - 4}>
            unit
          </text>
          {sampling.positions.map((position, step) => (
            <rect
              key={`hit:${step}`}
              x={x(step) - Math.max(spacing, 8) / 2}
              y={top}
              width={Math.max(spacing, 8)}
              height={bottom - top}
              className={classes.column}
              onMouseEnter={() => setHover(step)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      </div>
      <Text size="xs" c="dimmed" ff="monospace" className={classes.readout}>
        {playing !== undefined
          ? `playing step ${playing + 1} of ${count} · unit ${formatNumber(sampling.positions[playing])} · [${sampling.mapped[playing].map(formatNumber).join(' ')}]`
          : hovered !== null
            ? `step ${hovered + 1} of ${count} · unit ${formatNumber(sampling.positions[hovered])} · [${sampling.mapped[hovered].map(formatNumber).join(' ')}]`
            : `${count} chords (columns) · ${rows} voices (lines)`}
      </Text>
    </>
  );
});
