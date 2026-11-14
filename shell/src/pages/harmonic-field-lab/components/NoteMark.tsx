/**
 * One note as one mark, drawn in a single SVG so every part shares one centre line and one coordinate system.
 * Every note is a line of the same length. Its error is colour painted onto the line from the tip toward the
 * centre: sharp (orange) from the top down, flat (cyan) from the bottom up. The coloured length grows with the
 * error and covers the whole half-line at `full` cents (50 by default). It is widest at the tip: line width up
 * to 10 c, widening to 10 px at 50 c and beyond. A sounding note gets a green dot at its middle.
 */
import { ModeChevron } from './ModeRoot';
import classes from './lab.module.css';

/** SVG width: room for the widest taper (10 px) and the sounding dot (10 px). */
const W = 12;
const CX = W / 2;
const LINE = 2;

/** Width of the coloured part at the tip for a deviation of `abs` cents: line width up to 10 c, `max` px at 50 c. */
export const taperWidth = (abs: number, max = 10) =>
  LINE + Math.min(1, Math.max(0, (abs - 10) / 40)) * (max - LINE);

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
  /** Widest the coloured tip gets, in px (reached at 50 c). */
  maxTaper?: number;
  /** Draw the error (off for a note that is not in a saved subset). */
  showError?: boolean;
  lit?: boolean;
  pinned?: boolean;
  /** Radius of the sounding dot. */
  dotR?: number;
  /** This note is the mode root: a small `>|<` pair of chevrons either side of the tick, at `rootScale` size. */
  root?: boolean;
  rootScale?: number;
}

export function NoteMark({
  dev,
  height,
  mid,
  half,
  full = 50,
  maxTaper = 10,
  showError = true,
  lit = false,
  pinned = false,
  dotR = 5,
  root = false,
  rootScale = 0.5,
}: NoteMarkProps) {
  const abs = Math.abs(dev);
  const len = errorLength(abs, half, full);
  const tipW = taperWidth(abs, maxTaper) / 2;
  const near = LINE / 2;
  const sharp = dev >= 0;
  const tip = sharp ? mid - half : mid + half;
  const inner = sharp ? tip + len : tip - len;
  const bar = `${CX - tipW},${tip} ${CX + tipW},${tip} ${CX + near},${inner} ${CX - near},${inner}`;
  return (
    <svg
      className={classes.mark}
      style={root ? { overflow: 'visible' } : undefined}
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
      {root && (
        <g data-testid="mode-root-pair">
          {/* centred on the tick's own middle (mid), either side of it; drawn last so it stays above the sounding dot */}
          <ModeChevron x={CX - near - 2.5} y={mid} deg={0} scale={rootScale} />
          <ModeChevron x={CX + near + 2.5} y={mid} deg={180} scale={rootScale} />
        </g>
      )}
    </svg>
  );
}
