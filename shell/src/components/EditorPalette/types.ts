/**
 * Shared editor chrome: a tool palette, a right-click menu and key shortcuts, all driven by the same
 * lists. An editor (piano roll today; the rhythm grid, curve editor and texture canvas later) is
 * given tools and actions by its owner and renders them; it does not define them.
 *
 * Tools and actions are different controls (THEMING.md, "State grammar"):
 * - A **tool** is a mode that stays active and changes what a click does. Mutually exclusive, so it
 *   follows the Tab class.
 * - An **action** does something once to the current selection. It has no persistent active look.
 */
export interface EditorActionContext {
  /** Ids of the selected items, as the editor reports them (a chord's notes count once). */
  selectedIds: string[];
}

export interface EditorTool {
  id: string;
  label: string;
  /** One plain key, matched when the editor has focus. */
  shortcut?: string;
}

export interface EditorAction {
  id: string;
  label: string;
  /** One plain key, matched when the editor has focus. */
  shortcut?: string;
  /** Defaults to "needs at least one selected item". */
  enabled?(context: EditorActionContext): boolean;
  run(context: EditorActionContext): void;
}

export function actionEnabled(action: EditorAction, context: EditorActionContext): boolean {
  return action.enabled ? action.enabled(context) : context.selectedIds.length > 0;
}

/** The action or tool a key press triggers, if any. Plain keys only: no modifiers, so typing is safe. */
export function shortcutMatch<T extends { shortcut?: string }>(
  entries: T[],
  event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }
): T | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return undefined;
  }
  const key = event.key.toLowerCase();
  return entries.find((entry) => entry.shortcut?.toLowerCase() === key);
}
