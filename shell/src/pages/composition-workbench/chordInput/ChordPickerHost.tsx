import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Text } from '@mantine/core';
import { useCanvasTakeoverElement } from '../components/canvasTakeover';
import type { ChordHost } from '../noteEditorPreferences';
import classes from './ChordPickerHost.module.css';

/**
 * The frame around the chord picker body, in one of two named slots, never a free window:
 *  - `dock`: the frame fills its Stage slot (the clip editor's Stage; the editor builds this element as the picker
 *    module's render, so width, position and stacking belong to the Stage). This is the default;
 *  - `takeover`: the stage's canvas takeover slot (components/canvasTakeover.tsx), covering the canvas (desk) area
 *    while the roll stays visible. In this host the editor takes the picker module out of the Stage layout.
 * The body (ChordPicker) is the same in both and takes no host-specific props: the host only frames it and offers the
 * switch between the two. Without a takeover slot to portal into (no stage around the editor) a requested takeover is
 * shown as the dock.
 */
export function ChordPickerHost({
  host,
  onHostChange,
  onClose,
  children,
}: {
  host: ChordHost;
  onHostChange(host: ChordHost): void;
  /** Absent while there is nothing to dismiss. */
  onClose?(): void;
  children: ReactNode;
}) {
  const slot = useCanvasTakeoverElement();
  const shown: ChordHost = host === 'takeover' && slot ? 'takeover' : 'dock';

  const frame = (
    <section
      className={classes.frame}
      data-chord-host={shown}
      aria-label={shown === 'dock' ? 'Chord picker dock' : 'Chord picker takeover'}
      // Marks the editor's key scope (Esc), which a portal would otherwise leave.
      data-note-editor-scope=""
    >
      <div className={classes.header}>
        {/* The dock's Stage strip already names the module. */}
        {shown === 'takeover' ? (
          <Text size="xs" fw={600}>
            Chords
          </Text>
        ) : (
          <span />
        )}
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
  return shown === 'takeover' && slot ? createPortal(frame, slot) : frame;
}
