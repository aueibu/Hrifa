import {
  formatCents,
  formatFraction,
  type TrajectoryStep,
  type TrajectoryVoiceTrace,
  type TuningGamut,
} from '../../../lib/affine-focus';
import { ModeChevronSvg } from './MiniRing';
import classes from '../AffineFocus.module.css';

const VOICE_HUES = ['blue', 'orange', 'green', 'violet', 'cyan', 'pink', 'red', 'yellow'] as const;
const VOICE_DASHES = [undefined, '6 2.5', '2 2', '9 2.5 2 2.5'] as const;

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
  const R = gamut.repeatCents > 0 ? gamut.repeatCents : 1200;
  const repeatLabel = gamut.repeatRatio ? formatFraction(gamut.repeatRatio) : formatCents(R, 0);

  const W = 640;
  const H = 148;
  const PAD_L = 48;
  const PAD_R = 28;
  const PAD_T = 18;
  const PAD_B = 22;

  const spanC = Math.max(400, trace.maxCents - trace.minCents);
  const padC = Math.max(80, spanC * 0.12);
  const loC = trace.minCents - padC;
  const hiC = trace.maxCents + padC;

  const yAtCents = (c: number) =>
    PAD_T + ((hiC - c) / Math.max(1, hiC - loC)) * (H - PAD_T - PAD_B);

  const stepCount = Math.max(1, trajectory.length);
  const plotW = W - PAD_L - PAD_R;
  const xAtStep = (stepIdx: number) => {
    if (stepCount === 1) {
      return PAD_L + 40;
    }
    if (stepCount <= 4) {
      // Keep short chains well-proportioned across the strip without squeezing
      return PAD_L + (stepIdx / Math.max(1, stepCount - 1)) * Math.min(plotW, stepCount * 150);
    }
    return PAD_L + (stepIdx / (stepCount - 1)) * plotW;
  };

  const minRepK = Math.ceil(loC / R);
  const maxRepK = Math.floor(hiC / R);
  const repeatLines: number[] = [];
  for (let k = minRepK; k <= maxRepK; k += 1) {
    repeatLines.push(k);
  }

  return (
    <div className={classes.traceStripFrame} data-testid="trajectory-trace-strip">
      <svg
        className={classes.traceSvg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Trajectory Voice Register Trace"
      >
        {/* Subtle shading for the fundamental [0, R) home repeat band */}
        <rect
          x={PAD_L - 6}
          y={yAtCents(R)}
          width={W - PAD_L - PAD_R + 12}
          height={Math.max(0, yAtCents(0) - yAtCents(R))}
          fill="color-mix(in srgb, var(--text) 3.5%, transparent)"
        />

        {/* Horizontal repeat boundary gridlines */}
        {repeatLines.map((k) => {
          const y = yAtCents(k * R);
          const lbl =
            k === 0 ? '1/1 (0 c)' : k === 1 ? repeatLabel : k === -1 ? `−${repeatLabel}` : `${k}×R`;
          return (
            <g key={`rep-h-${k}`}>
              <line
                x1={PAD_L - 6}
                y1={y}
                x2={W - PAD_R + 6}
                y2={y}
                stroke="var(--grid)"
                strokeDasharray={k === 0 || k === 1 ? undefined : '2 2'}
                strokeWidth={k === 0 || k === 1 ? '1.15' : '0.8'}
              />
              <text
                x={PAD_L - 10}
                y={y}
                fill="var(--text-muted)"
                fontSize="9"
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
                x={x - 18}
                y={PAD_T - 10}
                width={36}
                height={H - PAD_T - PAD_B + 14}
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
                y1={PAD_T - 4}
                x2={x}
                y2={H - PAD_B + 2}
                stroke={isPlaying ? 'var(--mark-green)' : 'var(--grid)'}
                strokeWidth={isPlaying ? '1.5' : '0.85'}
              />
              <text
                x={x}
                y={H - 6}
                fill={
                  isPlaying ? 'var(--mark-green)' : isActive ? 'var(--text)' : 'var(--text-muted)'
                }
                fontSize="9"
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
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {voice.points.map((pt) => {
                const x = xAtStep(pt.stepIndex);
                const y = yAtCents(pt.cents);
                const showPitchLabel =
                  stepCount <= 6 || pt.stepIndex === 0 || pt.stepIndex === stepCount - 1;
                const wrapK = Math.floor((pt.cents + 1e-4) / R);
                const hasExistingTag = /[+-]\d+R\)/.test(pt.pitch.label);
                const octaveTag =
                  wrapK === 0 || hasExistingTag
                    ? ''
                    : wrapK > 0
                      ? ` (+${wrapK}R)`
                      : ` (−${Math.abs(wrapK)}R)`;
                return (
                  <g key={`v-${voice.voiceId}-s-${pt.stepIndex}`}>
                    {pt.isFocusForNext && (
                      <>
                        <circle
                          cx={x}
                          cy={y}
                          r={6.8}
                          fill="none"
                          stroke="var(--mark-yellow)"
                          strokeWidth="1.5"
                        />
                        <ModeChevronSvg
                          x={x}
                          y={y - 8}
                          deg={90}
                          scale={0.65}
                          testId="trace-focus-chevron"
                        />
                      </>
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={3.8}
                      fill={colorVar}
                      stroke="var(--panel)"
                      strokeWidth="1.15"
                    >
                      <title>{`v${voice.voiceId + 1} · S${pt.stepIndex}: ${pt.pitch.label}${octaveTag} (${pt.cents.toFixed(1)} c)`}</title>
                    </circle>
                    {pt.stepIndex === 0 && (
                      <text
                        x={x - 7}
                        y={y}
                        fill={colorVar}
                        fontSize="9"
                        fontWeight="600"
                        textAnchor="end"
                        dominantBaseline="central"
                      >
                        {`v${voice.voiceId + 1}`}
                      </text>
                    )}
                    {showPitchLabel && (
                      <text
                        x={x + 6}
                        y={y - 5}
                        fill="var(--text)"
                        fontSize="9"
                        dominantBaseline="auto"
                        pointerEvents="none"
                      >
                        {pt.pitch.label}
                        {octaveTag && (
                          <tspan fill="var(--text-muted)" data-testid="trace-octave-tag">
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
            x={PAD_L + 110}
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
