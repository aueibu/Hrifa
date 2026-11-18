import {
  formatCents,
  formatFraction,
  isBijectiveMultiplier,
  type GamutPitch,
  type TransformConfig,
  type TransformResult,
} from '../../../lib/affine-focus';
import { formatSignedCents, signedErrorColorVar } from '../state';
import { ModeChevronSvg } from './MiniRing';
import classes from '../AffineFocus.module.css';

const RING_SIZE = 260;
const RING_C = RING_SIZE / 2;
const RING_R = 88;
const LABEL_R = 113;
const CHEVRON_TIP_R = RING_R + 10;

function polarPoint(cents: number, repeatCents: number, radius = RING_R) {
  const R = repeatCents > 0 ? repeatCents : 1200;
  const norm = ((cents % R) + R) % R;
  const angle = (norm / R) * 2 * Math.PI - Math.PI / 2;
  return {
    angle,
    x: RING_C + radius * Math.cos(angle),
    y: RING_C + radius * Math.sin(angle),
  };
}

export function FocusStage({
  config,
  sourcePitches,
  activeResult,
  soundingLabels,
  onToggleGamutIndex,
}: {
  config: TransformConfig;
  sourcePitches: readonly GamutPitch[];
  activeResult: TransformResult | null;
  soundingLabels: ReadonlySet<string>;
  onToggleGamutIndex: (index: number) => void;
}) {
  const { gamut, domain, folding, quantize, multiplier, rule } = config;
  const R = gamut.repeatCents;
  const N = gamut.pitches.length;

  const sourceIndices = new Set(sourcePitches.map((p) => p.index).filter((i) => i >= 0));
  const targetPitches = activeResult ? activeResult.outputPitches : [];
  const focusPitches = activeResult ? activeResult.focusPitches : [];
  const focusLabels = new Set(focusPitches.map((p) => p.label));

  const sortedSourcePts = [...sourcePitches]
    .sort((a, b) => a.foldedCents - b.foldedCents)
    .map((p) => polarPoint(p.foldedCents, R, RING_R));

  const sortedTargetPts = [...targetPitches]
    .sort((a, b) => a.foldedCents - b.foldedCents)
    .map((p) => polarPoint(p.foldedCents, R, RING_R));

  const bijective = isBijectiveMultiplier(multiplier, N);
  const repeatLabel = gamut.repeatRatio ? formatFraction(gamut.repeatRatio) : formatCents(R, 0);

  // Compute unfolded register window for the 2-lane register strip
  const allUnfoldedCents = [
    0,
    R,
    ...sourcePitches.map((p) => p.unfoldedCents),
    ...(activeResult ? activeResult.unfoldedPitches.map((p) => p.unfoldedCents) : []),
    ...(activeResult ? activeResult.foldedPitches.map((p) => p.foldedCents) : []),
  ];
  const minC = Math.min(...allUnfoldedCents, 0) - 120;
  const maxC = Math.max(...allUnfoldedCents, R) + 120;
  const spanC = Math.max(400, maxC - minC);

  const STRIP_W = 540;
  const STRIP_H = 112;
  const PAD_X = 28;
  const TOP_Y = 30;
  const BOT_Y = 82;

  const xAtCents = (c: number) => PAD_X + ((c - minC) / spanC) * (STRIP_W - 2 * PAD_X);

  const minRepeatK = Math.ceil(minC / R);
  const maxRepeatK = Math.floor(maxC / R);
  const repeatTicks: number[] = [];
  for (let k = minRepeatK; k <= maxRepeatK; k += 1) {
    repeatTicks.push(k);
  }

  return (
    <div className={classes.stageBox} data-testid="focus-stage">
      {/* Left: Main Pitch Ring */}
      <div className={classes.ringPane}>
        <svg
          className={classes.mainRingSvg}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          role="img"
          aria-label="Affine Focus Pitch Ring"
        >
          <circle className={classes.ringTrack} cx={RING_C} cy={RING_C} r={RING_R} />

          {/* Dual-focus symmetry axis line */}
          {rule === 'dual-focus' && focusPitches.length >= 2 && (
            <line
              className={classes.dualAxisLine}
              x1={polarPoint(focusPitches[0].foldedCents, R, RING_R).x}
              y1={polarPoint(focusPitches[0].foldedCents, R, RING_R).y}
              x2={polarPoint(focusPitches[1].foldedCents, R, RING_R).x}
              y2={polarPoint(focusPitches[1].foldedCents, R, RING_R).y}
            />
          )}

          {/* Source set polygon */}
          {sortedSourcePts.length > 1 && (
            <polygon
              className={classes.sourcePolygon}
              points={sortedSourcePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            />
          )}

          {/* Target transformed polygon */}
          {sortedTargetPts.length > 1 && (
            <polygon
              className={classes.targetPolygon}
              points={sortedTargetPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            />
          )}

          {/* Voice-leading arcs from each source voice to its transformed image */}
          {activeResult?.steps.map((st) => {
            if (st.isFixed) {
              return null;
            }
            const p1 = polarPoint(st.source.foldedCents, R, RING_R);
            const p2 = polarPoint(st.result.foldedCents, R, RING_R);
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const cx = RING_C + (mx - RING_C) * 0.55;
            const cy = RING_C + (my - RING_C) * 0.55;
            return (
              <path
                key={`ray-${st.voiceIndex}`}
                className={classes.voiceRay}
                d={`M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`}
              />
            );
          })}

          {/* Ambient gamut dots (clickable to toggle membership in seed) */}
          {gamut.pitches.map((gp) => {
            const pt = polarPoint(gp.foldedCents, R, RING_R);
            const lblPt = polarPoint(gp.foldedCents, R, LABEL_R);
            const inSource = sourceIndices.has(gp.index);
            const inTarget = targetPitches.some((tp) => tp.index === gp.index);
            const isSounding = soundingLabels.has(gp.label);
            const isFocus = focusLabels.has(gp.label);
            const showLabel = N <= 24 || inSource || inTarget || isFocus;

            return (
              <g key={`gp-${gp.index}`}>
                {isSounding && (
                  <circle className={classes.ringSoundingHalo} cx={pt.x} cy={pt.y} r={8.5} />
                )}
                {isFocus && (
                  <circle className={classes.ringFocusHalo} cx={pt.x} cy={pt.y} r={7.5} />
                )}
                <circle
                  className={inSource ? classes.ringSourceDot : classes.ringAmbientDot}
                  cx={pt.x}
                  cy={pt.y}
                  r={inSource ? 4.8 : 3.2}
                  onClick={() => onToggleGamutIndex(gp.index)}
                >
                  <title>{`${gp.label} (${gp.foldedCents.toFixed(1)} c) — click to toggle in seed`}</title>
                </circle>
                {showLabel && (
                  <text
                    className={classes.ringLabelText}
                    x={lblPt.x}
                    y={lblPt.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    data-active={inSource}
                    data-target={inTarget}
                  >
                    {gp.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Target dots (including off-gamut exact pitches as dashed blue rings per UI-CONVENTIONS §5) */}
          {targetPitches.map((tp, idx) => {
            const pt = polarPoint(tp.foldedCents, R, RING_R);
            const isOffGamut = tp.index < 0;
            const lblPt = polarPoint(tp.foldedCents, R, RING_R - 18);
            const isSounding = soundingLabels.has(tp.label);
            return (
              <g key={`tp-${idx}`}>
                {isSounding && (
                  <circle className={classes.ringSoundingHalo} cx={pt.x} cy={pt.y} r={8.5} />
                )}
                <circle
                  className={isOffGamut ? classes.ringTargetGhostDot : classes.ringTargetDot}
                  cx={pt.x}
                  cy={pt.y}
                  r={isOffGamut ? 5.2 : 3.8}
                >
                  <title>{`Target: ${tp.label} (${tp.foldedCents.toFixed(1)} c)`}</title>
                </circle>
                {isOffGamut && (
                  <text
                    className={classes.ringLabelText}
                    x={lblPt.x}
                    y={lblPt.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    data-target="true"
                  >
                    {tp.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Inward ModeChevron markers at the Focus Anchor(s) */}
          {focusPitches.map((fp, idx) => {
            const tip = polarPoint(fp.foldedCents, R, CHEVRON_TIP_R);
            const deg = (tip.angle * 180) / Math.PI + 180;
            return (
              <ModeChevronSvg key={`chev-${idx}`} x={tip.x} y={tip.y} deg={deg} scale={0.95} />
            );
          })}
        </svg>
      </div>

      {/* Right: Glanceable Stats + Unfolded Acoustic Register Strip */}
      <div className={classes.stageRight}>
        <div className={classes.statsStrip}>
          <div className={classes.statBox}>
            <span className={classes.statLabel}>Gamut · Repeat</span>
            <span className={classes.statValue}>{`${N} notes · ${repeatLabel}`}</span>
          </div>
          <div className={classes.statBox}>
            <span className={classes.statLabel}>Domain · Multiplier</span>
            <span className={classes.statValue}>
              {domain === 'gamut-steps'
                ? `${bijective ? 'Bijective' : 'Degenerate'} (a=${multiplier})`
                : `${domain} (a=${multiplier})`}
            </span>
          </div>
          <div className={classes.statBox}>
            <span className={classes.statLabel}>Fixed · Voice-Leading</span>
            <span className={classes.statValue}>
              {activeResult
                ? `${activeResult.invariantCount} fixed · Δ ${activeResult.totalVoiceLeadingCents.toFixed(0)} c`
                : '0 fixed · Δ 0 c'}
            </span>
          </div>
          <div className={classes.statBox}>
            <span className={classes.statLabel}>
              {quantize === 'snap-to-gamut' ? 'Gamut Snap Error' : 'Realization'}
            </span>
            <span
              className={classes.statValue}
              style={{
                color:
                  quantize === 'snap-to-gamut' && activeResult
                    ? signedErrorColorVar(activeResult.maxSnapErrorCents)
                    : 'var(--text)',
              }}
            >
              {quantize === 'snap-to-gamut' && activeResult
                ? Math.abs(activeResult.maxSnapErrorCents) < 0.05
                  ? 'exact (0.0 c)'
                  : `worst ${formatSignedCents(activeResult.maxSnapErrorCents)}`
                : folding === 'folded'
                  ? `exact mod ${repeatLabel}`
                  : 'unfolded register'}
            </span>
          </div>
        </div>

        {/* Unfolded Register Strip */}
        <div className={classes.registerStripBox}>
          <div className={classes.sectionHead}>
            <span>
              {folding === 'folded'
                ? `Acoustic Register Strip (showing unfolded excursion vs. mod ${repeatLabel} fold)`
                : 'Unfolded Acoustic Register Strip (true frequency excursion around focus)'}
            </span>
            <span className={classes.mutedLabel}>
              {activeResult ? activeResult.operationLabel : ''}
            </span>
          </div>
          <svg
            className={classes.registerSvg}
            viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
            role="img"
            aria-label="Unfolded Acoustic Register Strip"
          >
            {/* Horizontal lane tracks */}
            <line
              x1={PAD_X}
              y1={TOP_Y}
              x2={STRIP_W - PAD_X}
              y2={TOP_Y}
              stroke="var(--grid)"
              strokeWidth="1"
            />
            <line
              x1={PAD_X}
              y1={BOT_Y}
              x2={STRIP_W - PAD_X}
              y2={BOT_Y}
              stroke="var(--grid)"
              strokeWidth="1"
            />
            <text x={4} y={TOP_Y} fill="var(--text-muted)" fontSize="9" dominantBaseline="central">
              Src
            </text>
            <text x={4} y={BOT_Y} fill="var(--mark-blue)" fontSize="9" dominantBaseline="central">
              Out
            </text>

            {/* Repeat boundary lines (1/1, 2/1, 4/1, etc.) */}
            {repeatTicks.map((k) => {
              const rx = xAtCents(k * R);
              return (
                <g key={`rep-${k}`}>
                  <line
                    x1={rx}
                    y1={10}
                    x2={rx}
                    y2={STRIP_H - 12}
                    stroke="var(--grid)"
                    strokeDasharray={k === 0 || k === 1 ? undefined : '2 2'}
                    strokeWidth={k === 0 || k === 1 ? '1.25' : '0.8'}
                  />
                  <text
                    x={rx}
                    y={STRIP_H - 3}
                    fill="var(--text-muted)"
                    fontSize="9"
                    textAnchor="middle"
                  >
                    {k === 0 ? '1/1 (0 c)' : k === 1 ? `${repeatLabel}` : `${k}×R`}
                  </text>
                </g>
              );
            })}

            {/* Voice-leading connectors from Source lane (TOP_Y) to Target lane (BOT_Y) */}
            {activeResult?.steps.map((st) => {
              const x1 = xAtCents(st.source.unfoldedCents);
              const targetC =
                folding === 'folded' ? st.result.foldedCents : st.rawUnfolded.unfoldedCents;
              const x2 = xAtCents(targetC);
              const unfoldedX2 = xAtCents(st.rawUnfolded.unfoldedCents);
              return (
                <g key={`strip-vl-${st.voiceIndex}`}>
                  {folding === 'folded' &&
                    Math.abs(st.rawUnfolded.unfoldedCents - st.result.foldedCents) > 1 && (
                      <>
                        <line
                          x1={x1}
                          y1={TOP_Y}
                          x2={unfoldedX2}
                          y2={BOT_Y}
                          stroke="var(--mark-blue)"
                          strokeDasharray="2 2"
                          strokeOpacity="0.45"
                          strokeWidth="1"
                        />
                        <circle
                          cx={unfoldedX2}
                          cy={BOT_Y}
                          r={3.2}
                          fill="none"
                          stroke="var(--mark-blue)"
                          strokeDasharray="2 1"
                          strokeOpacity="0.6"
                        />
                      </>
                    )}
                  <line
                    x1={x1}
                    y1={TOP_Y}
                    x2={x2}
                    y2={BOT_Y}
                    stroke={st.isFixed ? 'var(--mark-yellow)' : 'var(--mark-blue)'}
                    strokeWidth={st.isFixed ? '1.6' : '1.35'}
                  />
                </g>
              );
            })}

            {/* Top lane: Source dots + Focus chevrons */}
            {sourcePitches.map((sp, idx) => {
              const sx = xAtCents(sp.unfoldedCents);
              const isFocus = focusLabels.has(sp.label);
              return (
                <g key={`src-dot-${idx}`}>
                  {isFocus && (
                    <ModeChevronSvg
                      x={sx}
                      y={TOP_Y - 8}
                      deg={90}
                      scale={0.75}
                      testId="strip-focus-chevron"
                    />
                  )}
                  <circle
                    cx={sx}
                    cy={TOP_Y}
                    r={4}
                    fill="var(--text)"
                    stroke={isFocus ? 'var(--mark-yellow)' : 'var(--panel)'}
                    strokeWidth={isFocus ? '1.75' : '1'}
                  />
                  <text x={sx} y={TOP_Y - 13} fill="var(--text)" fontSize="9" textAnchor="middle">
                    {sp.label}
                  </text>
                </g>
              );
            })}

            {/* Bottom lane: Target dots */}
            {activeResult?.steps.map((st) => {
              const targetC =
                folding === 'folded' ? st.result.foldedCents : st.rawUnfolded.unfoldedCents;
              const tx = xAtCents(targetC);
              return (
                <g key={`tgt-dot-${st.voiceIndex}`}>
                  <circle
                    cx={tx}
                    cy={BOT_Y}
                    r={4.2}
                    fill="var(--mark-blue)"
                    stroke="var(--panel)"
                    strokeWidth="1"
                  />
                  <text
                    x={tx}
                    y={BOT_Y + 13}
                    fill="var(--mark-blue)"
                    fontSize="9"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {st.result.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className={classes.legendRow}>
          <span className={classes.legendItem}>
            <span className={classes.legendSwatch} style={{ background: 'var(--text)' }} />
            Source set (click ring dots to toggle)
          </span>
          <span className={classes.legendItem}>
            <span className={classes.legendSwatch} style={{ background: 'var(--mark-yellow)' }} />
            Focus anchor (chevron = invariant pivot)
          </span>
          <span className={classes.legendItem}>
            <span className={classes.legendSwatch} style={{ background: 'var(--mark-blue)' }} />
            Transformed output &amp; voice-leading
          </span>
          <span className={classes.legendItem}>
            <span className={classes.legendSwatch} style={{ background: 'var(--mark-green)' }} />
            Sounding pitch
          </span>
        </div>
      </div>
    </div>
  );
}
