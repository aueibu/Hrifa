/**
 * One note as one mark, drawn in a single SVG so every part shares one centre line and one coordinate system:
 * a 2 px line (the note), its error growing straight out of the line's end (sharp up from the top, flat down
 * from the bottom), and, while it sounds, a blue dot at the line's middle. The error starts as wide as the line
 * and tapers out at its far end: line width up to 10 c, three times the line width at 50 c and beyond.
 */
import classes from './mock.module.css';

/** SVG width: room for the widest taper (6 px) plus the sounding dot (10 px). */
const W = 12;
const CX = W / 2;
const LINE = 2;

/** Width of the error bar's far end for a deviation of `abs` cents. */
export const taperWidth = (abs: number) => LINE + Math.min(4, Math.max(0, (abs - 10) * 0.1));

export interface NoteMarkProps {
  /** Signed deviation in cents (positive = sharp). */
  dev: number;
  /** Height of the drawing in px, and the y of the line's middle. */
  height: number;
  mid: number;
  /** Half the line length in px. */
  half: number;
  /** Pixels per cent for the error. */
  scale: number;
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
  scale,
  showError = true,
  lit = false,
  pinned = false,
  dotR = 5,
}: NoteMarkProps) {
  const abs = Math.abs(dev);
  const len = Math.max(1, abs * scale);
  const far = taperWidth(abs) / 2;
  const near = LINE / 2;
  const sharp = dev >= 0;
  // the error starts 0.5 px inside the line so no seam can show where it grows out
  const y0 = sharp ? mid - half + 0.5 : mid + half - 0.5;
  const y1 = sharp ? mid - half - len : mid + half + len;
  const bar = `${CX - near},${y0} ${CX + near},${y0} ${CX + far},${y1} ${CX - far},${y1}`;
  return (
    <svg
      className={classes.mark}
      width={W}
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      aria-hidden="true"
      data-testid="note-mark"
    >
      {showError && abs > 0.05 && (
        <polygon
          className={sharp ? classes.markSharp : classes.markFlat}
          points={bar}
          data-dir={sharp ? 'sharp' : 'flat'}
        />
      )}
      <rect
        className={classes.markLine}
        x={CX - near}
        y={mid - half}
        width={LINE}
        height={half * 2}
      />
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
