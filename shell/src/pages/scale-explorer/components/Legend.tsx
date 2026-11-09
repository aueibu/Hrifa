import { ColorSwatch } from '@mantine/core';
import { useScaleStyle, type Slot } from '../useScaleStyle';

interface SwatchProps {
  /** Which set the swatch stands for; the loaded set by default. */
  slot?: Slot;
  /** An explicit color, for swatches that are not a set (a chord family, a link distance). */
  color?: string;
}

/** A small color chip for a set, chord family or link distance. */
export function Swatch({ slot = 'L', color }: SwatchProps) {
  const style = useScaleStyle();
  return <ColorSwatch size={10} color={color ?? style.slotColor(slot)} aria-hidden="true" />;
}

interface LineSampleProps {
  color: string;
  width: number;
  dash?: string;
  opacity?: number;
  /** Draw an arrow head at the right end (for fifth arrows). */
  arrow?: boolean;
}

/** A short sample of a chart line, for legends where line style carries the meaning. */
export function LineSample({ color, width, dash, opacity, arrow }: LineSampleProps) {
  return (
    <svg width={26} height={10} aria-hidden="true" focusable="false">
      <line
        x1={1}
        y1={5}
        x2={arrow ? 19 : 25}
        y2={5}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeOpacity={opacity}
      />
      {arrow && <path d="M18,1.5 L25,5 L18,8.5 z" fill={color} />}
    </svg>
  );
}
