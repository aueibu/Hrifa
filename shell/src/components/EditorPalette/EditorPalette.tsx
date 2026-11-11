import { Menu, Tooltip, UnstyledButton } from '@mantine/core';
import { actionEnabled, type EditorAction, type EditorActionContext, type EditorTool } from './types';
import classes from './EditorPalette.module.css';

interface EditorPaletteProps {
  tools?: EditorTool[];
  activeTool?: string;
  onToolChange?(id: string): void;
  actions?: EditorAction[];
  context: EditorActionContext;
}

function hint(label: string, shortcut?: string) {
  return shortcut ? `${label} (${shortcut.toUpperCase()})` : label;
}

/** A vertical strip at an editor's edge: tools above, one-shot actions below. */
export function EditorPalette({
  tools = [],
  activeTool,
  onToolChange,
  actions = [],
  context,
}: EditorPaletteProps) {
  if (!tools.length && !actions.length) {
    return null;
  }
  return (
    <div className={classes.palette} role="toolbar" aria-orientation="vertical" aria-label="Editor tools">
      {tools.length > 0 && (
        <div className={classes.group} role="radiogroup" aria-label="Tool">
          {tools.map((tool) => (
            <Tooltip key={tool.id} label={hint(tool.label, tool.shortcut)} position="left" withArrow={false}>
              <UnstyledButton
                className={classes.tool}
                role="radio"
                aria-checked={tool.id === activeTool}
                data-active={tool.id === activeTool || undefined}
                onClick={() => onToolChange?.(tool.id)}
              >
                {tool.label}
              </UnstyledButton>
            </Tooltip>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div className={classes.group}>
          {actions.map((action) => (
            <Tooltip key={action.id} label={hint(action.label, action.shortcut)} position="left" withArrow={false}>
              <UnstyledButton
                className={classes.action}
                disabled={!actionEnabled(action, context)}
                onClick={() => action.run(context)}
              >
                {action.label}
              </UnstyledButton>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

interface EditorContextMenuProps {
  /** Where the menu opens, in viewport pixels; null is closed. */
  at: { x: number; y: number } | null;
  onClose(): void;
  actions: EditorAction[];
  context: EditorActionContext;
}

/** The right-click menu: the same actions as the palette, disabled when they do not apply. */
export function EditorContextMenu({ at, onClose, actions, context }: EditorContextMenuProps) {
  return (
    <Menu opened={at !== null} onClose={onClose} position="bottom-start" offset={0} withinPortal>
      <Menu.Target>
        <span
          aria-hidden="true"
          style={{ position: 'fixed', left: at?.x ?? 0, top: at?.y ?? 0, width: 0, height: 0 }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {actions.map((action) => (
          <Menu.Item
            key={action.id}
            disabled={!actionEnabled(action, context)}
            rightSection={action.shortcut ? action.shortcut.toUpperCase() : undefined}
            onClick={() => action.run(context)}
          >
            {action.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
