import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Text } from '@mantine/core';
import { useCanvasTakeoverElement } from '../components/canvasTakeover';
import {
  DEFAULT_CHORD_DOCK_WIDTH,
  MIN_CHORD_DOCK_WIDTH,
  type ChordHost,
} from '../noteEditorPreferences';
import classes from './ChordPickerHost.module.css';

const KEY_STEP = 16;
const FALLBACK_MAX_WIDTH = 960;

/**
 * The slot the chord picker body is shown in. Two named slots, never a free window:
 *  - `dock`: a fixed-width column beside the roll (the default);
 *  - `takeover`: the stage's canvas takeover slot (components/canvasTakeover.tsx), covering the
 *    canvas (desk) area while the roll stays visible.
 * The body (ChordPicker) is the same in both and takes no host-specific props: the host only
 * frames it and offers the switch between the two. Without a takeover slot to portal into (no
 * stage around the editor) a requested takeover is shown as the dock.
 */
export function ChordPickerHost({
  host,
  onHostChange,
  onClose,
  dockWidth = null,
  onDockWidthChange,
  children,
}: {
  host: ChordHost;
  onHostChange(host: ChordHost): void;
  /** Absent while there is nothing to dismiss. */
  onClose?(): void;
  /** The dock's width in pixels, or null for the default (30rem). The takeover ignores it. */
  dockWidth?: number | null;
  /** Called with the new width (once when a drag ends, per key press) or null to reset to the default. */
  onDockWidthChange?(width: number | null): void;
  children: ReactNode;
}) {
  const slot = useCanvasTakeoverElement();
  const shown: ChordHost = host === 'takeover' && slot ? 'takeover' : 'dock';
  const frameRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; startWidth: number; last: number | null } | null>(null);
  // The width while a drag is live; it is handed to the owner once, when the drag ends.
  const [live, setLive] = useState<number | null>(null);
  const width = live ?? dockWidth ?? DEFAULT_CHORD_DOCK_WIDTH;
  // The width of the panel the dock sits in (the editor's work area); 0 while unknown.
  const [panel, setPanel] = useState(0);

  useEffect(() => {
    const parent = frameRef.current?.parentElement;
    if (shown !== 'dock' || !parent) {
      return undefined;
    }
    setPanel(parent.clientWidth);
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      setPanel(entry ? entry.contentRect.width : parent.clientWidth);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [shown]);

  /** At most 60% of the panel the dock sits in (the editor's work area), never below the minimum. */
  function maxWidth() {
    return panel > 0 ? Math.max(MIN_CHORD_DOCK_WIDTH, Math.floor(panel * 0.6)) : FALLBACK_MAX_WIDTH;
  }
  const clampWidth = (value: number) =>
    Math.round(Math.min(maxWidth(), Math.max(MIN_CHORD_DOCK_WIDTH, value)));
  const shownWidth = clampWidth(width);

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    drag.current = { startX: event.clientX, startWidth: shownWidth, last: null };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current) {
      if (event.buttons === 0) {
        // The release was missed (outside the window, lost capture): do not follow a stuck drag.
        pointerEnd(event);
        return;
      }
      // The dock is on the right: dragging left widens it.
      const next = clampWidth(drag.current.startWidth + (drag.current.startX - event.clientX));
      drag.current.last = next;
      setLive(next);
    }
  }
  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current) {
      drag.current = null;
      if (current.last !== null) {
        // Keep the live width until the owner's value arrives, so the dock does not jump back.
        onDockWidthChange?.(current.last);
      }
      setLive(null);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }
  function keyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') {
      next = shownWidth + step;
    } else if (event.key === 'ArrowRight') {
      next = shownWidth - step;
    } else if (event.key === 'Home') {
      next = MIN_CHORD_DOCK_WIDTH;
    } else if (event.key === 'End') {
      next = maxWidth();
    }
    if (next !== null) {
      event.preventDefault();
      onDockWidthChange?.(clampWidth(next));
    }
  }

  const frame = (
    <section
      ref={frameRef}
      style={shown === 'dock' ? { flexBasis: shownWidth, width: shownWidth } : undefined}
      className={classes.frame}
      data-chord-host={shown}
      aria-label={shown === 'dock' ? 'Chord picker dock' : 'Chord picker takeover'}
      // Marks the editor's key scope (Esc), which a portal would otherwise leave.
      data-note-editor-scope=""
    >
      <div className={classes.header}>
        <Text size="xs" fw={600}>
          Chords
        </Text>
        <div className={classes.buttons}>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => onHostChange(shown === 'dock' ? 'takeover' : 'dock')}
          >
            {shown === 'dock' ? 'Expand over canvas' : 'Dock beside roll'}
          </Button>
          {onClose && (
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Close chord picker"
              onClick={onClose}
            >
              Close
            </Button>
          )}
        </div>
      </div>
      <div className={classes.body}>{children}</div>
    </section>
  );
  if (shown === 'takeover' && slot) {
    return createPortal(frame, slot);
  }
  return (
    <>
      {/* The splitter between the roll and the dock: a focusable separator (WAI-ARIA window splitter). */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div
        className={classes.splitter}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chord dock"
        aria-valuenow={shownWidth}
        aria-valuemin={MIN_CHORD_DOCK_WIDTH}
        aria-valuemax={maxWidth()}
        tabIndex={0}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
        onLostPointerCapture={pointerEnd}
        onKeyDown={keyDown}
        onDoubleClick={() => onDockWidthChange?.(null)}
      />
      {frame}
    </>
  );
}
