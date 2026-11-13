/**
 * One note as one mark, drawn in a single SVG so every part shares one centre line and one coordinate system.
 * Every note is a line of the same length. Its error is colour painted onto the line from the tip toward the
 * centre: sharp (pink) from the top down, flat (cyan) from the bottom up. The coloured length grows with the
 * error and covers the whole half-line at `full` cents (50 by default). It is widest at the tip: line width up
 * to 10 c, widening to 10 px at 50 c and beyond. A sounding note gets a blue dot at its middle.
 */
import classes from './mock.module.css';

/** SVG width: room for the widest taper (10 px) and the sounding dot (10 px). */
const W = 12;
const CX = W / 2;
const LINE = 2;

/** Width of the coloured part at the tip for a deviation of `abs` cents. */
export const taperWidth = (abs: number) => LINE + Math.min(8, Math.max(0, (abs - 10) * 0.2));

/** Length of the coloured part in px: the share of the half-line the error covers (capped at `full` cents). */
export const errorLength = (abs: number, half: number, full = 50) => Math.min(1, abs / full) * half;

export interface NoteMarkProps {
  /** Signed deviation in cents (positive = sharp). */
  dev: number;
  /** Height of the drawing in px, and the y of the line's middle. */
  height: number;
  mid: number;
  /** Half the line length in px. */
  half: number;
  /** Cents that colour the whole half-line. */
  full?: number;
  /** Draw the error (off for a note that is not in a saved subset). */
  showError?: boolean;
  lit?: boolean;
  pinned?: boolean;
  /** Radius of the sounding dot. */
  dotR?: number;
}

export function NoteMark({
  dev,
  height,
  mid,
  half,
  full = 50,
  showError = true,
  lit = false,
  pinned = false,
  dotR = 5,
}: NoteMarkProps) {
  const abs = Math.abs(dev);
  const len = errorLength(abs, half, full);
  const tipW = taperWidth(abs) / 2;
  const near = LINE / 2;
  const sharp = dev >= 0;
  const tip = sharp ? mid - half : mid + half;
  const inner = sharp ? tip + len : tip - len;
  const bar = `${CX - tipW},${tip} ${CX + tipW},${tip} ${CX + near},${inner} ${CX - near},${inner}`;
  return (
    <svg
      className={classes.mark}
      width={W}
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      aria-hidden="true"
      data-testid="note-mark"
    >
      <rect
        className={classes.markLine}
        x={CX - near}
        y={mid - half}
        width={LINE}
        height={half * 2}
      />
      {showError && len >= 0.5 && (
        <polygon
          className={sharp ? classes.markSharp : classes.markFlat}
          points={bar}
          data-dir={sharp ? 'sharp' : 'flat'}
        />
      )}
      {pinned && (
        <rect
          className={classes.markPin}
          x={CX - near - 2.5}
          y={mid - half - 2.5}
          width={LINE + 5}
          height={half * 2 + 5}
        />
      )}
      {lit && <circle className={classes.markDot} cx={CX} cy={mid} r={dotR} />}
    </svg>
  );
}
