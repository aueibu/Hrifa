/**
 * One splitter, used for both kinds (column width: a vertical bar; stack share: a horizontal bar). A separator with
 * aria-valuenow, keyboard (the keys it is given) and pointer drag with pointer capture. It knows nothing about layouts:
 * the Stage supplies what a key press and a drag do, and looks the column up when the action runs, never before.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import classes from './stage.module.css';

/** What a drag does: called with the pointer's offset in px from where it started. */
export type DragMove = (dxPx: number, dyPx: number) => void;

export interface SplitterProps {
  /** The bar's own orientation: `vertical` between columns, `horizontal` between stacked slots. */
  orientation: 'vertical' | 'horizontal';
  label: string;
  valueNow: number;
  valueMin: number;
  valueMax: number;
  valueText?: string;
  keys: readonly string[];
  onKey(key: string): void;
  /** Begin a drag: return its move handler, or null to refuse. */
  onDragStart(target: HTMLElement): DragMove | null;
}

export function Splitter({
  orientation,
  label,
  valueNow,
  valueMin,
  valueMax,
  valueText,
  keys,
  onKey,
  onDragStart,
}: SplitterProps) {
  const drag = useRef<{ x: number; y: number; move: DragMove } | null>(null);
  const [dragging, setDragging] = useState(false);

  const end = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={valueNow}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuetext={valueText}
      className={classes.splitter}
      data-orientation={orientation}
      data-drag={dragging}
      onKeyDown={(e: KeyboardEvent) => {
        if (keys.includes(e.key)) {
          e.preventDefault();
          onKey(e.key);
        }
      }}
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        const move = onDragStart(e.currentTarget);
        if (!move) {
          return;
        }
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          // capture can fail for synthetic pointers; the drag still works while the pointer stays over the bar
        }
        drag.current = { x: e.clientX, y: e.clientY, move };
        setDragging(true);
      }}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (d && e.buttons === 0 && e.pointerType !== 'touch') {
          end(); // the button was released somewhere we did not see
          return;
        }
        if (d) {
          d.move(e.clientX - d.x, e.clientY - d.y);
        }
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span className={classes.grip} />
    </div>
  );
}
