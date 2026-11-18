import { Button, SegmentedControl } from '@mantine/core';
import type {
  GamutPitch,
  TraceConnectionMode,
  TraceRegisterMode,
  TrajectoryStep,
  TrajectoryVoiceTrace,
  TransformConfig,
  TransformResult,
} from '../../../lib/affine-focus';
import { formatSignedCents, signedErrorColorVar } from '../state';
import { MiniRing } from './MiniRing';
import { TrajectoryTraceStrip } from './TrajectoryTraceStrip';
import classes from '../AffineFocus.module.css';

function formatStepsLine(pitches: readonly GamutPitch[], repeatCents: number): string {
  if (pitches.length < 2) {
    return 'singleton';
  }
  const sorted = [...pitches].sort((a, b) => a.foldedCents - b.foldedCents);
  const gaps = sorted.map((p, idx) => {
    const next = sorted[idx + 1];
    const diff = next
      ? next.foldedCents - p.foldedCents
      : repeatCents - p.foldedCents + sorted[0].foldedCents;
    return diff.toFixed(1);
  });
  return `steps ${gaps.join(', ')} c`;
}

export function FamilyTrajectoryView({
  config,
  family,
  selectedOpId,
  trajectory,
  trace,
  traceConnectMode,
  traceRegisterMode,
  activeTrajectoryIndex,
  playingStepIndex,
  onChangeTraceConnectMode,
  onChangeTraceRegisterMode,
  onHoverOp,
  onSelectOp,
  onStepTrajectory,
  onJumpTrajectory,
  onPlayPitches,
  onPlayAlternation,
  onPlayTrajectory,
  onPlayTrajectoryStep,
}: {
  config: TransformConfig;
  family: readonly TransformResult[];
  selectedOpId: string | null;
  trajectory: readonly TrajectoryStep[];
  trace: TrajectoryVoiceTrace;
  traceConnectMode: TraceConnectionMode;
  traceRegisterMode: TraceRegisterMode;
  activeTrajectoryIndex: number;
  playingStepIndex: number | null;
  onChangeTraceConnectMode: (mode: TraceConnectionMode) => void;
  onChangeTraceRegisterMode: (mode: TraceRegisterMode) => void;
  onHoverOp: (op: TransformResult | null) => void;
  onSelectOp: (op: TransformResult) => void;
  onStepTrajectory: (op: TransformResult) => void;
  onJumpTrajectory: (index: number) => void;
  onPlayPitches: (pitches: readonly GamutPitch[]) => void;
  onPlayAlternation: (src: readonly GamutPitch[], tgt: readonly GamutPitch[]) => void;
  onPlayTrajectory: () => void;
  onPlayTrajectoryStep: (index: number) => void;
}) {
  const R = config.gamut.repeatCents;

  return (
    <>
      {/* Trajectory Chain Box */}
      <div className={classes.trajectoryBox} data-testid="trajectory-chain">
        <div className={classes.sectionHead}>
          <span>{`Walked Trajectory Chain (${trajectory.length} ${trajectory.length === 1 ? 'state' : 'states'})`}</span>
          <div className={classes.cardActionsCol}>
            <Button
              size="compact-xs"
              variant="default"
              onClick={onPlayTrajectory}
              aria-label="Play trajectory chain"
            >
              ▶ Play chain
            </Button>
            {trajectory.length > 1 && (
              <Button size="compact-xs" variant="subtle" onClick={() => onJumpTrajectory(0)}>
                Reset to seed
              </Button>
            )}
          </div>
        </div>
        <div className={classes.trajectoryRow}>
          {trajectory.map((step, idx) => (
            <span key={`traj-${step.index}`} className={classes.cardActionsCol}>
              {idx > 0 && <span className={classes.trajArrow}>{`—[${step.operationLabel}]→`}</span>}
              <button
                type="button"
                className={classes.trajChip}
                data-active={idx === activeTrajectoryIndex}
                onClick={() => {
                  onJumpTrajectory(idx);
                  onPlayTrajectoryStep(idx);
                }}
              >
                <strong>{`S${idx}`}</strong>
                <span className={classes.tabularNum}>
                  {`{${step.pitches.map((p) => p.label).join(', ')}}`}
                </span>
              </button>
            </span>
          ))}
        </div>

        {/* Voice Trace Controls + Strip */}
        <div className={classes.traceControlsRow}>
          <div className={classes.traceToggleGroup}>
            <span className={classes.mutedLabel}>Voices</span>
            <SegmentedControl
              size="xs"
              aria-label="Voice connection mode"
              value={traceConnectMode}
              onChange={(v) => onChangeTraceConnectMode(v === 'smoothest' ? 'smoothest' : 'map')}
              data={[
                { label: 'Follow map', value: 'map' },
                { label: 'Smoothest', value: 'smoothest' },
              ]}
            />
          </div>
          <div className={classes.traceToggleGroup}>
            <span className={classes.mutedLabel}>Register</span>
            <SegmentedControl
              size="xs"
              aria-label="Trace register mode"
              value={traceRegisterMode}
              onChange={(v) => onChangeTraceRegisterMode(v === 'fold' ? 'fold' : 'accumulate')}
              data={[
                { label: 'Accumulate', value: 'accumulate' },
                { label: 'Fold [0, R)', value: 'fold' },
              ]}
            />
          </div>
        </div>

        <TrajectoryTraceStrip
          trajectory={trajectory}
          trace={trace}
          gamut={config.gamut}
          activeTrajectoryIndex={activeTrajectoryIndex}
          playingStepIndex={playingStepIndex}
          onSelectStep={(idx) => {
            onJumpTrajectory(idx);
            onPlayTrajectoryStep(idx);
          }}
        />
      </div>

      {/* Immediate Family Cards (ChordCard pattern) */}
      <div className={classes.sectionHead}>
        <span>{`Immediate Transform Family (${family.length} focus ${family.length === 1 ? 'operation' : 'operations'})`}</span>
        <span className={classes.mutedLabel}>
          Hover to preview on ring · Click to inspect · Step → to chain
        </span>
      </div>

      <div className={classes.cardList} data-testid="family-card-list">
        {family.map((op) => {
          const isSelected = op.operationId === selectedOpId;
          const pitchStr = op.outputPitches.map((p) => p.label).join('  ');
          const stepsStr = formatStepsLine(op.outputPitches, R);
          const hasSnapErr =
            config.quantize === 'snap-to-gamut' && Math.abs(op.maxSnapErrorCents) >= 0.05;

          return (
            <div
              key={op.operationId}
              role="button"
              tabIndex={0}
              className={classes.opCard}
              data-testid="family-op-card"
              data-selected={isSelected}
              onMouseEnter={() => onHoverOp(op)}
              onMouseLeave={() => onHoverOp(null)}
              onClick={() => onSelectOp(op)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectOp(op);
                }
              }}
            >
              <MiniRing
                targetPitches={op.outputPitches}
                sourcePitches={op.sourcePitches}
                focusPitches={op.focusPitches}
                repeatCents={R}
              />

              <div className={classes.cardTitleCol}>
                <span className={classes.cardTitle}>{op.operationLabel}</span>
                <span className={classes.cardSubtitle}>
                  {`${op.formulaDisplay} · ${op.outputPitches.length} ${op.outputPitches.length === 1 ? 'note' : 'notes'}`}
                </span>
              </div>

              <div className={classes.cardPitchesCol}>
                <span className={classes.cardPitches}>{pitchStr}</span>
                <span className={classes.cardSteps}>
                  {config.folding === 'unfolded'
                    ? `unfolded: ${op.unfoldedPitches.map((p) => p.label).join('  ')}`
                    : stepsStr}
                </span>
              </div>

              <div className={classes.cardStatCol}>
                <span
                  style={{
                    color: hasSnapErr
                      ? signedErrorColorVar(op.maxSnapErrorCents)
                      : op.isSelfLoop
                        ? 'var(--mark-yellow)'
                        : 'var(--text)',
                    fontWeight: 600,
                  }}
                >
                  {hasSnapErr
                    ? formatSignedCents(op.maxSnapErrorCents)
                    : op.isSelfLoop
                      ? 'self-loop'
                      : 'exact'}
                </span>
                <span className={classes.mutedLabel}>
                  {`${op.invariantCount} fixed · Δ ${op.totalVoiceLeadingCents.toFixed(0)} c`}
                </span>
              </div>

              <div className={classes.cardActionsCol}>
                <Button
                  size="compact-xs"
                  variant="default"
                  title="Audition transformed chord"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayPitches(op.outputPitches);
                  }}
                >
                  ▶
                </Button>
                <Button
                  size="compact-xs"
                  variant="default"
                  title="Alternate Source ↔ Target"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayAlternation(op.sourcePitches, op.outputPitches);
                  }}
                >
                  ⇄
                </Button>
                <Button
                  size="compact-xs"
                  variant="light"
                  title="Step to this set in Trajectory Chain"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStepTrajectory(op);
                  }}
                >
                  Step →
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
