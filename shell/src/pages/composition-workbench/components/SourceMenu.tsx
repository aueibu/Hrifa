import { useState, type ReactNode } from 'react';
import { Combobox, Input, InputBase, Menu } from '@mantine/core';
import classes from './SourceMenu.module.css';

/** One selectable output. `path` is its place in the tree: module, output, then bank entry. */
export interface SourceOption {
  value: string;
  label: string;
  path: string[];
  /** Shown as the current value (a source that has gone missing) but never offered as a choice. */
  disabled?: boolean;
}

export interface SourceTreeNode {
  /** Unique within the whole tree; also the open-state key for submenus. */
  key: string;
  label: string;
  /** Set on a node that can be picked itself. */
  option?: SourceOption;
  children: SourceTreeNode[];
}

/**
 * Groups options into a tree of modules and their outputs, like a DAW's track-then-channel menu. A
 * module with a single compatible output collapses to one item named "Module · Output", so the
 * common case stays one click, and only modules with several outputs (or bank entries) open a
 * submenu.
 */
export function buildSourceTree(options: SourceOption[]): SourceTreeNode[] {
  const roots: SourceTreeNode[] = [];
  for (const option of options) {
    let level = roots;
    let key = '';
    option.path.forEach((part, depth) => {
      key = `${key}/${part}`;
      let node = level.find((candidate) => candidate.label === part);
      if (!node) {
        node = { key, label: part, children: [] };
        level.push(node);
      }
      if (depth === option.path.length - 1) {
        node.option = option;
      }
      level = node.children;
    });
  }
  return roots.map(collapse);
}

function collapse(node: SourceTreeNode): SourceTreeNode {
  const children = node.children.map(collapse);
  // A node that is only a stepping stone to one child is merged into it.
  if (!node.option && children.length === 1) {
    const [only] = children;
    return { ...only, key: node.key, label: `${node.label} · ${only.label}` };
  }
  return { ...node, children };
}

interface SourceMenuProps {
  label: string;
  description?: ReactNode;
  placeholder?: string;
  options: SourceOption[];
  value: string | null;
  error?: ReactNode;
  onChange(value: string | null): void;
}

/**
 * A source picker for an inlet: a menu of modules, each opening to its outputs. Replaces a flat
 * dropdown of "Interference · Generator 2"-style rows, which grows unmanageable as patches do.
 */
export function SourceMenu({
  label,
  description,
  placeholder,
  options,
  value,
  error,
  onChange,
}: SourceMenuProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // A submenu opened by a click (or tap) stays open until another is opened or the menu closes;
  // hover alone opens and closes it as the pointer moves.
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const tree = buildSourceTree(options.filter((option) => !option.disabled));
  const selected = options.find((option) => option.value === value);

  // A submenu is open when it, or something inside it, is the open path.
  const isOpen = (key: string) => openKey === key || (openKey?.startsWith(`${key}/`) ?? false);
  const isPinned = (key: string) =>
    pinnedKey !== null && (pinnedKey === key || pinnedKey.startsWith(`${key}/`));
  const parentKey = (key: string) => key.slice(0, key.lastIndexOf('/')) || null;
  const closeAll = () => {
    setOpenKey(null);
    setPinnedKey(null);
  };

  const renderNode = (node: SourceTreeNode): ReactNode => {
    if (!node.children.length && node.option) {
      return (
        <Menu.Item
          key={node.key}
          data-selected={node.option.value === value || undefined}
          leftSection={node.option.value === value ? '✓' : undefined}
          onClick={() => onChange(node.option!.value)}
        >
          {node.label}
        </Menu.Item>
      );
    }
    return (
      <Menu.Sub
        key={node.key}
        position="right-start"
        offset={6}
        opened={isOpen(node.key)}
        onChange={(opened) => {
          if (opened) {
            setOpenKey(node.key);
            // Hovering a different submenu releases a pinned one.
            setPinnedKey((pinned) => (pinned && !isPinned(node.key) ? null : pinned));
          } else if (!isPinned(node.key)) {
            setOpenKey(parentKey(node.key));
          }
        }}
      >
        {/* Opens on hover or ArrowRight; a click opens and pins it, for touch. */}
        <Menu.Sub.Target>
          <Menu.Sub.Item
            onClick={() => {
              setOpenKey(node.key);
              setPinnedKey(node.key);
            }}
          >
            {node.label}
          </Menu.Sub.Item>
        </Menu.Sub.Target>
        <Menu.Sub.Dropdown>
          {node.option && (
            <Menu.Item
              data-selected={node.option.value === value || undefined}
              leftSection={node.option.value === value ? '✓' : undefined}
              onClick={() => onChange(node.option!.value)}
            >
              {node.label}
            </Menu.Item>
          )}
          {node.children.map(renderNode)}
        </Menu.Sub.Dropdown>
      </Menu.Sub>
    );
  };

  return (
    <Menu position="bottom-start" withinPortal onClose={closeAll} closeOnItemClick>
      <Menu.Target>
        <InputBase
          component="button"
          type="button"
          pointer
          label={label}
          description={description}
          error={error}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
        >
          {selected ? (
            <span className={classes.value}>{selected.label}</span>
          ) : (
            <Input.Placeholder>{placeholder}</Input.Placeholder>
          )}
        </InputBase>
      </Menu.Target>
      <Menu.Dropdown className={classes.dropdown}>
        {value !== null && (
          <>
            <Menu.Item c="dimmed" onClick={() => onChange(null)}>
              Disconnect
            </Menu.Item>
            <Menu.Divider />
          </>
        )}
        {tree.length ? tree.map(renderNode) : <Menu.Label>No compatible sources</Menu.Label>}
      </Menu.Dropdown>
    </Menu>
  );
}
