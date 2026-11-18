import type { GamutPitch } from '../../../lib/affine-focus';
import classes from '../AffineFocus.module.css';

export const DRAWING_R = 0.75;
export const DRAWING_DOT_R = (2.6 * 72) / 64 / 36;
const ROOT_TIP = DRAWING_R + DRAWING_DOT_R + 0.045;
const ROOT_ARM = 0.17;
const ROOT_STROKE = 0.026;
const ROOT_SCALE = ROOT_ARM / 6;

export function ModeChevronSvg({
  x,
  y,
  deg,
  scale = 1,
  strokeWidth,
  testId = 'focus-chevron',
}: {
  x: number;
  y: number;
  deg: number;
  scale?: number;
  strokeWidth?: number;
  testId?: string;
}) {
  return (
    <path
      className={classes.modeChevron}
      data-testid={testId}
      d="M-6 -5.5L0 0L-6 5.5"
      strokeWidth={(strokeWidth ?? Math.max(1.5, 2.6 * scale)) / scale}
      transform={`translate(${x} ${y}) rotate(${deg}) scale(${scale})`}
      aria-hidden="true"
    />
  );
}

/**
 * Small card ring modeled directly on Harmonic Field Lab's ChordDrawing (ShelfPanel.tsx):
 * viewBox -1..1, DRAWING_R = 0.75, DRAWING_DOT_R = 0.08125, with the target polygon in --mark-blue,
 * optional source ghost polygon in --text-muted, and inward ModeChevron(s) marking the focus anchor(s).
 */
export function MiniRing({
  targetPitches,
  sourcePitches,
  focusPitches,
  repeatCents,
}: {
  targetPitches: readonly GamutPitch[];
  sourcePitches?: readonly GamutPitch[];
  focusPitches?: readonly GamutPitch[];
  repeatCents: number;
}) {
  const R = repeatCents > 0 ? repeatCents : 1200;

  const toPt = (c: number) => {
    const a = (2 * Math.PI * (((c % R) + R) % R)) / R;
    return { a, x: Math.sin(a) * DRAWING_R, y: -Math.cos(a) * DRAWING_R };
  };

  const targetPts = [...targetPitches]
    .sort((a, b) => a.foldedCents - b.foldedCents)
    .map((p) => toPt(p.foldedCents));

  const sourcePts = sourcePitches
    ? [...sourcePitches]
        .sort((a, b) => a.foldedCents - b.foldedCents)
        .map((p) => toPt(p.foldedCents))
    : [];

  const focusAngles = (focusPitches ?? []).map(
    (fp) => (2 * Math.PI * (((fp.foldedCents % R) + R) % R)) / R
  );

  return (
    <svg className={classes.drawing} viewBox="-1 -1 2 2" aria-hidden="true">
      <circle className={classes.drawingRing} r={DRAWING_R} />
      {sourcePts.length > 1 && (
        <polygon
          className={classes.drawingSourceShape}
          points={sourcePts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')}
        />
      )}
      {targetPts.length > 1 && (
        <polygon
          className={classes.drawingShape}
          points={targetPts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')}
        />
      )}
      {sourcePts.map((p, idx) => (
        <circle
          key={`s-${idx}`}
          className={classes.drawingAmbientDot}
          cx={p.x}
          cy={p.y}
          r={DRAWING_DOT_R * 0.75}
        />
      ))}
      {targetPts.map((p, idx) => (
        <circle
          key={`t-${idx}`}
          className={classes.drawingDot}
          cx={p.x}
          cy={p.y}
          r={DRAWING_DOT_R}
        />
      ))}
      {focusAngles.map((ang, idx) => (
        <ModeChevronSvg
          key={`f-${idx}`}
          x={Math.sin(ang) * ROOT_TIP}
          y={-Math.cos(ang) * ROOT_TIP}
          deg={(ang * 180) / Math.PI + 90}
          scale={ROOT_SCALE}
          strokeWidth={ROOT_STROKE}
        />
      ))}
    </svg>
  );
}
