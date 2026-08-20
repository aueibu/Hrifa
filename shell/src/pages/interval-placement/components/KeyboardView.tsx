import type { ReactNode } from 'react';
import type { IntervalPlacementStyle } from '../../../theme/diagram';
import { intervalColor } from '../visuals';

const WHITE_HEIGHT = 90;
const BLACK_HEIGHT = 56;
const BLACK_WIDTH_RATIO = 0.62;
const BLACK_NOTES = new Set([1, 3, 6, 8, 10]);

interface KeyboardViewProps {
  pitches: number[];
  hoverPitch: number | null;
  baseMidi: number;
  windowSteps: number;
  edoSteps: number;
  style: IntervalPlacementStyle;
  onHoverPitch: (pitch: number | null) => void;
}

/**
 * React port of the source tool's `renderKeyboard`: a 12-EDO piano strip
 * over the active window. White keys are fluid flex cells (not a fixed px
 * width) and black keys are positioned by percentage of the white-key row,
 * so the whole strip always fills its container exactly — no horizontal
 * scrollbar regardless of window width or how many octaves are shown. Idle
 * key colors come from `style.whiteKey`/`blackKey`/`keyDivider` (fixed
 * Mantine palette shades, identical across schemes — see
 * `resolveIntervalPlacementStyle`), not literals: an idle key should always
 * read as ivory/ebony, the way the instrument itself would.
 */
export function KeyboardView({
  pitches,
  hoverPitch,
  baseMidi,
  windowSteps,
  edoSteps,
  style,
  onHoverPitch,
}: KeyboardViewProps) {
  if (edoSteps !== 12) {
    return <div style={{ fontSize: 12, opacity: 0.6 }}>Keyboard view uses 12-EDO.</div>;
  }
  const activeSet = new Set(pitches);
  const steps = Array.from({ length: windowSteps + 1 }, (_, step) => {
    const note = (((baseMidi + step) % 12) + 12) % 12;
    return { step, isBlack: BLACK_NOTES.has(note) };
  });
  const totalWhite = steps.filter((s) => !s.isBlack).length;
  const blackWidthPct = totalWhite > 0 ? (100 / totalWhite) * BLACK_WIDTH_RATIO : 0;

  const whiteKeys: ReactNode[] = [];
  const blackKeys: ReactNode[] = [];
  let whiteIndex = 0;
  steps.forEach(({ step, isBlack }) => {
    const isActive = activeSet.has(step);
    const isHover = hoverPitch === step;
    if (!isBlack) {
      whiteKeys.push(
        <div
          key={step}
          onMouseEnter={() => onHoverPitch(step)}
          onMouseLeave={() => onHoverPitch(null)}
          style={{
            flex: '1 1 0',
            minWidth: 0,
            height: WHITE_HEIGHT,
            borderTop: `1px solid ${style.keyDivider}`,
            borderRight: `1px solid ${style.keyDivider}`,
            borderBottom: `1px solid ${style.keyDivider}`,
            borderLeft: 'none',
            background: isActive ? intervalColor(step, edoSteps, style.isDark) : style.whiteKey,
            outline: isHover ? `2px solid ${style.base.hoverHighlight}` : undefined,
            outlineOffset: -2,
            boxSizing: 'border-box',
            cursor: 'pointer',
          }}
        />
      );
      whiteIndex += 1;
    } else {
      const leftPct = (whiteIndex / totalWhite) * 100 - blackWidthPct / 2;
      blackKeys.push(
        <div
          key={step}
          onMouseEnter={() => onHoverPitch(step)}
          onMouseLeave={() => onHoverPitch(null)}
          style={{
            position: 'absolute',
            left: `${leftPct}%`,
            width: `${blackWidthPct}%`,
            height: BLACK_HEIGHT,
            border: `1px solid ${style.keyDivider}`,
            background: isActive ? intervalColor(step, edoSteps, style.isDark) : style.blackKey,
            outline: isHover ? `2px solid ${style.base.hoverHighlight}` : undefined,
            outlineOffset: -2,
            boxSizing: 'border-box',
            cursor: 'pointer',
            zIndex: 1,
          }}
        />
      );
    }
  });

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', width: '100%' }}>{whiteKeys}</div>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: BLACK_HEIGHT }}>
        {blackKeys}
      </div>
    </div>
  );
}
