/**
 * The legend of the signed error scale (H-38), used by the Modes grid and the Pairs Error coloring: one gradient strip from flat (cyan)
 * through exact (neutral) to sharp (orange), with the band edges (−30, −15, −5, 0, +5, +15, +30 c) as labeled ticks. The strip's colors are
 * the band tiles' own fills, so it follows the tile look and the color scheme.
 */
import { errorStripPosition } from '../state/intervalColor';
import { signedBandTile, type TileLook, type TileScheme } from '../state/tileColors';
import classes from './panels.module.css';

/** Eight equal segments (bands −4..−1 and +1..+4), exact at the center; the ticks sit on the segment edges. */
const TICKS = [-30, -15, -5, 0, 5, 15, 30] as const;
const tickText = (v: number) => (v === 0 ? '0' : v > 0 ? `+${v}` : `−${-v}`);

export function SignedErrorLegend({
  look,
  outline,
  scheme,
  label,
  mark,
}: {
  look: TileLook;
  outline: boolean;
  scheme: TileScheme;
  label: string;
  /** The hovered signed error in cents: a tick on the strip (an outward wedge past +-30 c). */
  mark?: number | null;
}) {
  const at = mark === null || mark === undefined ? null : errorStripPosition(mark);
  const fill = (band: number) => signedBandTile(look, outline, band, scheme).fill;
  // each band's color at its segment's center; exact (neutral) exactly at the middle
  const stops = [
    ...[-4, -3, -2, -1].map((b, i) => `${fill(b)} ${(i + 0.5) * 12.5}%`),
    `${fill(0)} 50%`,
    ...[1, 2, 3, 4].map((b, i) => `${fill(b)} ${(i + 4.5) * 12.5}%`),
  ];
  return (
    <span className={classes.errStrip} aria-label={label} role="img">
      <span className={classes.errStripEnds} aria-hidden="true">
        <span>flat</span>
        <span>sharp</span>
      </span>
      <span
        className={classes.errStripBar}
        style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}
        aria-hidden="true"
      >
        {at && (
          <span
            className={classes.errStripMark}
            style={{ left: `${at.pos * 100}%` }}
            data-beyond={at.beyond === 0 ? undefined : at.beyond}
            data-testid="error-strip-mark"
          />
        )}
      </span>
      <span className={classes.errStripTicks} aria-hidden="true">
        {TICKS.map((v, i) => (
          <span key={v} className={classes.errStripTick} style={{ left: `${(i + 1) * 12.5}%` }}>
            {tickText(v)}
          </span>
        ))}
      </span>
    </span>
  );
}
