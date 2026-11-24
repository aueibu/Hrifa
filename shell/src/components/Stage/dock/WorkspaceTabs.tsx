/**
 * The workspace meta-tab strip (design 5.4), a presentational skeleton: one tab per workspace in `store.order`, the
 * active one marked; the page owns the store and applies the pure operations in workspaceStore.ts through the callbacks.
 *
 * Keyboard: the tablist has one Tab stop (the active tab); arrows, Home and End move focus without activating; Enter or
 * Space activate (a button click). Like the docker strips, the "+" button and the menu button are NOT in the tablist: the
 * menu (Rename, Duplicate, Delete) belongs to the ACTIVE workspace. Delete is disabled for the last workspace. Rename asks
 * for a name (the shared prompt: empty and taken names refused).
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ActionIcon, Menu } from '@mantine/core';
import type { WorkspaceId, WorkspaceStore } from '../../../lib/stage';
import { StripTool } from '../../InspectorKit';
import { DownIcon } from '../icons';
import { NamePrompt } from './NamePrompt';
import { isRoveKey, roveFocus } from './tabKeys';
import { takenWorkspaceNames } from './workspaceStore';
import classes from './dock.module.css';

export interface WorkspaceTabsProps {
  store: WorkspaceStore;
  onActivate(id: WorkspaceId): void;
  /** Add a workspace (a copy of the active one, "Workspace N"; see `addWorkspace`). */
  onAdd(): void;
  onRename(id: WorkspaceId, name: string): void;
  onDuplicate(id: WorkspaceId): void;
  onDelete(id: WorkspaceId): void;
}

export function WorkspaceTabs({
  store,
  onActivate,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
}: WorkspaceTabsProps) {
  const list = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState<WorkspaceId | null>(null);
  // focus goes to the active tab after an action that changes which one it is (add, duplicate, delete)
  const refocus = useRef<'tab' | 'menu' | null>(null);
  useEffect(() => {
    if (refocus.current === 'tab') {
      list.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    } else if (refocus.current === 'menu') {
      menuButton.current?.focus();
    }
    refocus.current = null;
  });

  const active = store.workspaces[store.active];
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (
      el.getAttribute('role') === 'tab' &&
      isRoveKey(e.key) &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey
    ) {
      e.preventDefault();
      roveFocus(e.currentTarget, el, e.key);
    }
  };

  return (
    <div className={classes.workspaces} data-workspace-strip>
      {/* roving tabindex lives on the tabs, not the list */}
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        ref={list}
        role="tablist"
        aria-label="Workspaces"
        className={classes.workspaceTabs}
        onKeyDown={onKeyDown}
      >
        {store.order.map((id) => {
          const isActive = id === store.active;
          return (
            <div
              key={id}
              role="presentation"
              className={classes.workspaceTabWrap}
              data-active={isActive}
            >
              <button
                type="button"
                role="tab"
                className={classes.workspaceTab}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                data-workspace-id={id}
                onClick={() => onActivate(id)}
              >
                {store.workspaces[id].name}
              </button>
            </div>
          );
        })}
      </div>
      <ActionIcon
        size="sm"
        variant="subtle"
        color="gray"
        aria-label="Add workspace"
        title="Add workspace"
        onClick={() => {
          refocus.current = 'tab';
          onAdd();
        }}
      >
        +
      </ActionIcon>
      {active && (
        <Menu position="top-end" withinPortal returnFocus={false}>
          <Menu.Target>
            <StripTool label={`Menu for ${active.name}`} ref={menuButton}>
              <DownIcon />
            </StripTool>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setRenaming(active.id)}>Rename...</Menu.Item>
            <Menu.Item
              onClick={() => {
                refocus.current = 'tab';
                onDuplicate(active.id);
              }}
            >
              Duplicate
            </Menu.Item>
            <Menu.Item
              color="red"
              disabled={store.order.length <= 1}
              onClick={() => {
                refocus.current = 'tab';
                onDelete(active.id);
              }}
            >
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
      {renaming !== null && store.workspaces[renaming] && (
        <NamePrompt
          opened
          title="Rename workspace"
          label="Workspace name"
          initial={store.workspaces[renaming].name}
          taken={takenWorkspaceNames(store, renaming)}
          noun="workspace"
          confirmLabel="Rename"
          onConfirm={(name) => {
            onRename(renaming, name);
            setRenaming(null);
            refocus.current = 'menu';
          }}
          onCancel={() => {
            setRenaming(null);
            refocus.current = 'menu';
          }}
        />
      )}
    </div>
  );
}
