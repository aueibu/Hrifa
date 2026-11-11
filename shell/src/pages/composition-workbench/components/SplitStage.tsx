import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ActionIcon } from '@mantine/core';
import classes from './SplitStage.module.css';

export const MIN_SPLIT = 0.2;
export const MAX_SPLIT = 0.8;

export function clampSplit(value: number) {
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value));
}

interface SplitStageProps {
  /** Canvas share of the stage height, between MIN_SPLIT and MAX_SPLIT. */
  split: number;
  onSplit(split: number): void;
  collapsed: boolean;
  onCollapsed(collapsed: boolean): void;
  top: ReactNode;
  bottom: ReactNode;
}

/**
 * Canvas above, detail panel below, with a draggable divider. Collapsing the detail panel hides it
 * with CSS only: the module editors inside must stay mounted because they publish their outputs.
 */
export function SplitStage({
  split,
  onSplit,
  collapsed,
  onCollapsed,
  top,
  bottom,
}: SplitStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);

  const moveTo = (clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect && rect.height > 0) {
      onSplit(clampSplit((clientY - rect.top) / rect.height));
    }
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (collapsed || event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      moveTo(event.clientY);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onSplit(clampSplit(split + (event.key === 'ArrowDown' ? 0.05 : -0.05)));
    }
  };

  return (
    <div
      ref={stageRef}
      className={classes.stage}
      style={{ gridTemplateRows: collapsed ? '1fr auto' : `${split}fr auto ${1 - split}fr` }}
    >
      <div className={classes.top}>{top}</div>
      <div className={classes.divider} data-collapsed={collapsed || undefined}>
        <div
          className={classes.grip}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize detail panel"
          aria-valuemin={Math.round(MIN_SPLIT * 100)}
          aria-valuemax={Math.round(MAX_SPLIT * 100)}
          aria-valuenow={Math.round(split * 100)}
          tabIndex={collapsed ? -1 : 0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onKeyDown={onKeyDown}
        />
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label={collapsed ? 'Show detail panel' : 'Hide detail panel'}
          aria-expanded={!collapsed}
          onClick={() => onCollapsed(!collapsed)}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <path d={collapsed ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </ActionIcon>
      </div>
      <div className={classes.bottom} hidden={collapsed}>
        {bottom}
      </div>
    </div>
  );
}
