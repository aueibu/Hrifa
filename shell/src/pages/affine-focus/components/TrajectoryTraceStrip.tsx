import { useRef } from 'react';
import {
  formatCents,
  formatFraction,
  type TrajectoryStep,
  type TrajectoryVoiceTrace,
  type TuningGamut,
} from '../../../lib/affine-focus';
import { ModeChevronSvg } from './MiniRing';
import { useContainerWidth } from './useContainerWidth';
import classes from '../AffineFocus.module.css';

const VOICE_HUES = ['blue', 'orange', 'green', 'violet', 'cyan', 'pink', 'red', 'yellow'] as const;
const VOICE_DASHES = [undefined, '6 2.5', '2 2', '9 2.5 2 2.5'] as const;

/**
 * Simple 1D repulsion so stacked labels in the same step column never overlap vertically.
 */
function spreadLabelPositions(
  items: { key: string; rawY: number }[],
  minGap: number,
  minY: number,
  maxY: number
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.rawY - b.rawY);
  const ys = sorted.map((it) => it.rawY);
  for (let i = 1; i < ys.length; i += 1) {
    if (ys[i] - ys[i - 1] < minGap) {
      ys[i] = ys[i - 1] + minGap;
    }
  }
  if (ys.length > 0 && ys[ys.length - 1] > maxY) {
    ys[ys.length - 1] = maxY;
    for (let i = ys.length - 2; i >= 0; i -= 1) {
      if (ys[i + 1] - ys[i] < minGap) {
        ys[i] = ys[i + 1] - minGap;
      }
    }
  }
  const out = new Map<string, number>();
  sorted.forEach((it, idx) => {
    out.set(it.key, Math.max(minY, Math.min(maxY, ys[idx])));
  });
  return out;
}

export function TrajectoryTraceStrip({
  trajectory,
  trace,
  gamut,
  activeTrajectoryIndex,
  playingStepIndex,
  onSelectStep,
}: {
  trajectory: readonly TrajectoryStep[];
  trace: TrajectoryVoiceTrace;
  gamut: TuningGamut;
  activeTrajectoryIndex: number;
  playingStepIndex: number | null;
  onSelectStep: (stepIndex: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const measuredW = useContainerWidth(frameRef, 960);

  const R = gamut.repeatCents > 0 ? gamut.repeatCents : 1200;
  const repeatLabel = gamut.repeatRatio ? formatFraction(gamut.repeatRatio) : formatCents(R, 0);

  const W = Math.min(720, Math.max(420, measuredW - 8));
  const H = 184;
  const PAD_L = 104;
  const PAD_R = 76;
  const PAD_T = 22;
  const PAD_B = 26;

  const spanC = Math.max(400, trace.maxCents - trace.minCents);
  const padC = Math.max(100, spanC * 0.14);
  const loC = trace.minCents - padC;
  const hiC = trace.maxCents + padC;

  const yAtCents = (c: number) =>
    PAD_T + ((hiC - c) / Math.max(1, hiC - loC)) * (H - PAD_T - PAD_B);

  const stepCount = Math.max(1, trajectory.length);
  const plotW = Math.max(120, W - PAD_L - PAD_R);
  const xAtStep = (stepIdx: number) => {
    if (stepCount === 1) {
      return PAD_L + 12;
    }
    if (stepCount === 2) {
      return PAD_L + stepIdx * Math.min(plotW, 320);
    }
    return PAD_L + (stepIdx / (stepCount - 1)) * plotW;
  };

  const minRepK = Math.ceil(loC / R);
  const maxRepK = Math.floor(hiC / R);
  const repeatLines: number[] = [];
  for (let k = minRepK; k <= maxRepK; k += 1) {
    repeatLines.push(k);
  }

  // Spread repeat axis labels so they never collide when zoomed out across many octaves
  const repeatLabelY = spreadLabelPositions(
    repeatLines.map((k) => ({ key: String(k), rawY: yAtCents(k * R) })),
    12,
    PAD_T,
    H - PAD_B
  );

  // Spread v1, v2, ... labels at S0
  const s0VoiceLabelY = spreadLabelPositions(
    trace.voices.map((v) => ({
      key: String(v.voiceId),
      rawY: yAtCents(v.points[0]?.cents ?? 0),
    })),
    13,
    PAD_T - 4,
    H - PAD_B + 4
  );

  // Per-column spread for pitch + (±kR) labels
  const columnLabelY = new Map<string, number>();
  for (let sIdx = 0; sIdx < stepCount; sIdx += 1) {
    const colItems = trace.voices
      .map((v) => {
        const pt = v.points[sIdx];
        return pt ? { key: `${v.voiceId}:${sIdx}`, rawY: yAtCents(pt.cents) - 2 } : null;
      })
      .filter((x): x is { key: string; rawY: number } => x !== null);
    const spread = spreadLabelPositions(colItems, 13, PAD_T - 6, H - PAD_B + 2);
    for (const [k, val] of spread.entries()) {
      columnLabelY.set(k, val);
    }
  }

  return (
    <div ref={frameRef} className={classes.traceStripFrame} data-testid="trajectory-trace-strip">
      <svg
        className={classes.traceSvg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Trajectory Voice Register Trace"
      >
        {/* Subtle shading for the fundamental [0, R) home repeat band */}
        <rect
          x={PAD_L - 8}
          y={yAtCents(R)}
          width={W - PAD_L - PAD_R + 16}
          height={Math.max(0, yAtCents(0) - yAtCents(R))}
          fill="color-mix(in srgb, var(--text) 3.5%, transparent)"
        />

        {/* Horizontal repeat boundary gridlines */}
        {repeatLines.map((k) => {
          const y = yAtCents(k * R);
          const lblY = repeatLabelY.get(String(k)) ?? y;
          const lbl =
            k === 0 ? '1/1 (0 c)' : k === 1 ? repeatLabel : k === -1 ? `−${repeatLabel}` : `${k}×R`;
          return (
            <g key={`rep-h-${k}`}>
              <line
                x1={66}
                y1={y}
                x2={W - PAD_R + 8}
                y2={y}
                stroke="var(--grid)"
                strokeDasharray={k === 0 || k === 1 ? undefined : '2 2'}
                strokeWidth={k === 0 || k === 1 ? '1.15' : '0.8'}
              />
              <text
                x={60}
                y={lblY}
                fill="var(--text-muted)"
                fontSize="10"
                textAnchor="end"
                dominantBaseline="central"
              >
                {lbl}
              </text>
            </g>
          );
        })}

        {/* Vertical step columns */}
        {trajectory.map((step, sIdx) => {
          const x = xAtStep(sIdx);
          const isActive = sIdx === activeTrajectoryIndex;
          const isPlaying = sIdx === playingStepIndex;
          return (
            <g
              key={`col-${step.index}`}
              className={classes.traceStepCol}
              onClick={() => onSelectStep(sIdx)}
            >
              <rect
                x={x - 20}
                y={PAD_T - 12}
                width={40}
                height={H - PAD_T - PAD_B + 18}
                rx={4}
                fill={
                  isPlaying
                    ? 'color-mix(in srgb, var(--mark-green) 14%, transparent)'
                    : isActive
                      ? 'color-mix(in srgb, var(--text) 7%, transparent)'
                      : 'transparent'
                }
              />
              <line
                x1={x}
                y1={PAD_T - 6}
                x2={x}
                y2={H - PAD_B + 2}
                stroke={isPlaying ? 'var(--mark-green)' : 'var(--grid)'}
                strokeWidth={isPlaying ? '1.5' : '0.9'}
              />
              <text
                x={x}
                y={H - 7}
                fill={
                  isPlaying ? 'var(--mark-green)' : isActive ? 'var(--text)' : 'var(--text-muted)'
                }
                fontSize="11"
                fontWeight={isActive || isPlaying ? '700' : '500'}
                textAnchor="middle"
              >
                {`S${sIdx}`}
              </text>
              <title>{`S${sIdx}: {${step.pitches.map((p) => p.label).join(', ')}} — click to jump & audition`}</title>
            </g>
          );
        })}

        {/* Voice polylines */}
        {trace.voices.map((voice, vIdx) => {
          const hue = VOICE_HUES[vIdx % VOICE_HUES.length];
          const dash = VOICE_DASHES[vIdx % VOICE_DASHES.length];
          const colorVar = `var(--mark-${hue})`;
          const pathD = voice.points
            .map(
              (pt, idx) =>
                `${idx === 0 ? 'M' : 'L'} ${xAtStep(pt.stepIndex).toFixed(1)} ${yAtCents(pt.cents).toFixed(1)}`
            )
            .join(' ');

          return (
            <g key={`v-line-${voice.voiceId}`} data-testid={`trace-voice-${voice.voiceId}`}>
              {voice.points.length > 1 && (
                <path
                  d={pathD}
                  fill="none"
                  stroke={colorVar}
                  strokeDasharray={dash}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {voice.points.map((pt) => {
                const x = xAtStep(pt.stepIndex);
                const y = yAtCents(pt.cents);
                const showPitchLabel =
                  stepCount <= 10 || pt.stepIndex === 0 || pt.stepIndex === stepCount - 1;
                const wrapK = Math.floor((pt.cents + 1e-4) / R);
                const hasExistingTag = /[+-]\d+R\)/.test(pt.pitch.label);
                const octaveTag =
                  wrapK === 0 || hasExistingTag
                    ? ''
                    : wrapK > 0
                      ? ` (+${wrapK}R)`
                      : ` (−${Math.abs(wrapK)}R)`;
                const lblY = columnLabelY.get(`${voice.voiceId}:${pt.stepIndex}`) ?? y;
                const v0Y = s0VoiceLabelY.get(String(voice.voiceId)) ?? y;

                return (
                  <g key={`v-${voice.voiceId}-s-${pt.stepIndex}`}>
                    {pt.isFocusForNext && (
                      <>
                        <circle
                          cx={x}
                          cy={y}
                          r={7.2}
                          fill="none"
                          stroke="var(--mark-yellow)"
                          strokeWidth="1.5"
                        />
                        <ModeChevronSvg
                          x={x}
                          y={y - 9}
                          deg={90}
                          scale={0.68}
                          testId="trace-focus-chevron"
                        />
                      </>
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={4}
                      fill={colorVar}
                      stroke="var(--panel)"
                      strokeWidth="1.2"
                    >
                      <title>{`v${voice.voiceId + 1} · S${pt.stepIndex}: ${pt.pitch.label}${octaveTag} (${pt.cents.toFixed(1)} c)`}</title>
                    </circle>
                    {pt.stepIndex === 0 && (
                      <text
                        x={x - 10}
                        y={v0Y}
                        fill={colorVar}
                        fontSize="10"
                        fontWeight="700"
                        textAnchor="end"
                        dominantBaseline="central"
                      >
                        {`v${voice.voiceId + 1}`}
                      </text>
                    )}
                    {showPitchLabel && (
                      <text
                        x={x + 9}
                        y={lblY}
                        fill="var(--text)"
                        fontSize="11"
                        fontWeight="500"
                        dominantBaseline="central"
                        pointerEvents="none"
                      >
                        {pt.pitch.label}
                        {octaveTag && (
                          <tspan
                            fill="var(--text-muted)"
                            fontSize="10"
                            data-testid="trace-octave-tag"
                          >
                            {octaveTag}
                          </tspan>
                        )}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Subtle empty-chain prompt inside the fixed-height trace area */}
        {trajectory.length === 1 && (
          <text
            x={PAD_L + 90}
            y={H / 2}
            fill="var(--text-muted)"
            fontSize="11"
            dominantBaseline="central"
          >
            Click “Step →” on any operation card below to trace voice movement across the chain.
          </text>
        )}
      </svg>
    </div>
  );
}
