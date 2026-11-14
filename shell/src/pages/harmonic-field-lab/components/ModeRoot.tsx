/**
 * The mode-root marker: one bold chevron in `--text` (no colour of its own), the same shape in every view that shows
 * single notes. `ModeChevron` is the SVG form (tip at a point, pointing a given way), `RootGlyph` the small inline form
 * for table rows. The root is the subset's mode root (`base.idx[base.mode]`); with no notes selected there is none.
 */
import { MODE_ROOT_TIP } from '../texts';
import { useLab } from './ui';
import classes from './lab.module.css';

/** The field index of the mode root, or null when nothing is selected. */
export function useModeRoot(): number | null {
  const { base } = useLab();
  return base.idx.length ? (base.idx[base.mode % base.idx.length] ?? null) : null;
}

/** ", mode root" for an aria-label when `i` is the root, else an empty string. */
export const rootLabel = (root: number | null, i: number): string =>
  root === i ? ', mode root' : '';

/**
 * A chevron whose tip is at (x, y) and that points `deg` degrees clockwise from "right" (90 = down, 180 = left). The
 * arms trail behind the tip. `scale` shrinks it (the stroke is kept from going hair-thin).
 */
export function ModeChevron({
  x,
  y,
  deg,
  scale = 1,
}: {
  x: number;
  y: number;
  deg: number;
  scale?: number;
}) {
  return (
    <path
      className={classes.modeChevron}
      data-testid="mode-root"
      d="M-6 -5.5L0 0L-6 5.5"
      strokeWidth={Math.max(1.5, 2.6 * scale) / scale}
      transform={`translate(${x} ${y}) rotate(${deg}) scale(${scale})`}
      aria-hidden="true"
    />
  );
}

/**
 * The marker for a note on a ring: a chevron outside the note's dot pointing in toward the ring centre `(cx, cy)`, its
 * tip `gap` from the dot centre. Labels avoid its box (`chevronBox` in state/labelLayout.ts).
 */
export const RING_GAP = 8;
export function RingChevron({
  cx,
  cy,
  x,
  y,
  gap = RING_GAP,
}: {
  cx: number;
  cy: number;
  x: number;
  y: number;
  gap?: number;
}) {
  const a = Math.atan2(y - cy, x - cx);
  return (
    <ModeChevron
      x={x + gap * Math.cos(a)}
      y={y + gap * Math.sin(a)}
      deg={(a * 180) / Math.PI + 180}
    />
  );
}

/** Small inline glyph for table rows and other HTML: a chevron pointing right, with the tooltip as its title. */
export function RootGlyph() {
  return (
    <svg
      className={classes.modeGlyph}
      data-testid="mode-root"
      viewBox="0 0 10 10"
      width="10"
      height="10"
      role="img"
      aria-label="mode root"
    >
      <title>{MODE_ROOT_TIP}</title>
      <path d="M3 1.5L7 5L3 8.5" />
    </svg>
  );
}
