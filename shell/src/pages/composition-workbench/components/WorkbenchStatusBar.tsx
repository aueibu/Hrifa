import type { ReactNode } from 'react';
import { Text } from '@mantine/core';
import { ActionIcon } from '../../../ui';
import { useHoverInfo } from './hoverInfo';
import classes from './WorkbenchStatusBar.module.css';

/** What the bar says when the pointer is on nothing that has an explanation. */
const idleText = 'Hover over a control, a note or a line for details.';

/**
 * The strip along the bottom of the workbench, after Bitwig's: the inspector toggle and the Panels menu at
 * the left, the explanation of whatever the pointer is on in the middle, and the settings toggle at the
 * right. The middle is driven by `data-info` attributes (see `useHoverInfo`), so only this
 * component updates as the pointer moves. The workspace tabs live in the top header (Blender), not here.
 * The two toggles are view toggles: no fill, an accent icon while the panel is open (THEMING.md).
 */
export function WorkbenchStatusBar({
  inspectorOpen,
  onToggleInspector,
  settingsOpen,
  onToggleSettings,
  panelsMenu,
}: {
  inspectorOpen: boolean;
  onToggleInspector(): void;
  settingsOpen: boolean;
  onToggleSettings(): void;
  /** The Panels menu, placed after the inspector toggle at the left. */
  panelsMenu?: ReactNode;
}) {
  const info = useHoverInfo();
  return (
    <div className={classes.bar}>
      <div className={classes.side}>
        <ActionIcon
          variant="subtle"
          color={inspectorOpen ? 'var(--accent)' : undefined}
          size={32}
          aria-label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          aria-pressed={inspectorOpen}
          data-info={
            inspectorOpen
              ? 'Hide the inspector: the selected node’s settings and routes.'
              : 'Show the inspector: the selected node’s settings and routes.'
          }
          onClick={onToggleInspector}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
        </ActionIcon>
        {panelsMenu}
      </div>
      <Text
        className={classes.info}
        size="sm"
        c={info ? undefined : 'dimmed'}
        truncate
        aria-live="polite"
      >
        {info || idleText}
      </Text>
      <div className={classes.side} data-end="true">
        <ActionIcon
          variant="subtle"
          color={settingsOpen ? 'var(--accent)' : undefined}
          size={32}
          aria-label={settingsOpen ? 'Hide settings' : 'Show settings'}
          aria-pressed={settingsOpen}
          data-info={
            settingsOpen
              ? 'Hide the workbench settings panel.'
              : 'Show the workbench settings panel: pitch tuning (EDO) and the rhythm and metronome sounds.'
          }
          onClick={onToggleSettings}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </ActionIcon>
      </div>
    </div>
  );
}
