/**
 * The Preset control (M7b step 2): a button showing the breadcrumb of the generator this tab belongs to (with a dot when it
 * is modified), opening a popover browser: a search box on top (flat results, each with its folder path), a collapsible
 * folder tree below (Built-in, My presets, Recent, Untitled), and a one-line info line for the highlighted row.
 * Keyboard (focus stays in the search box): Up/Down move, Right/Left open/close a folder, Enter picks, typing searches.
 * Choosing a preset is `preset/open`. User presets are renamed, moved and deleted from their row.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ActionIcon, Button, Popover, TextInput } from '@mantine/core';
import { PRESETS, listFolders, splitFolder } from '../../../lib/harmonic-field';
import { parseOwner } from '../state/generatorLibrary';
import {
  buildTree,
  foldersAbove,
  nodeId,
  ownerPath,
  ROOT_MINE,
  searchPresets,
  visibleRows,
  type PresetNode,
  type Row,
} from '../state/presetTree';
import { CloseIcon } from './icons';
import { Num, Tip, useLab } from './ui';
import classes from './lab.module.css';

/** A folder path box with the existing folders suggested (a native datalist). */
export function FolderInput({
  value,
  onChange,
  suggestions,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: readonly string[];
  onEnter?: () => void;
}) {
  const id = useId();
  return (
    <>
      <TextInput
        size="xs"
        aria-label="Folder"
        placeholder="Folder, e.g. Pools/Seven (optional)"
        list={id}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            onEnter();
          }
        }}
      />
      <datalist id={id}>
        {suggestions.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </>
  );
}

function EditRow({
  node,
  onDone,
  onMoved,
}: {
  node: PresetNode;
  onDone: () => void;
  onMoved: (folder: string) => void;
}) {
  const { state, dispatch } = useLab();
  const [name, setName] = useState(node.label);
  const [folder, setFolder] = useState(node.folder);
  const folders = useMemo(
    () => listFolders(state.library.presets.map((p) => p.folder)),
    [state.library.presets]
  );
  const save = () => {
    if (node.userId) {
      if (name.trim() && name.trim() !== node.label) {
        dispatch({ type: 'preset/rename', id: node.userId, name });
      }
      if (folder !== node.folder) {
        dispatch({ type: 'preset/move', id: node.userId, folder });
        onMoved(folder);
      }
    }
    onDone();
  };
  return (
    <div className={classes.pbEdit}>
      <TextInput
        size="xs"
        aria-label="Preset name"
        value={name}
        data-autofocus
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            save();
          }
        }}
      />
      <FolderInput value={folder} onChange={setFolder} suggestions={folders} onEnter={save} />
      <span className={classes.inline}>
        <Button size="compact-xs" variant="default" onClick={save}>
          Save
        </Button>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={onDone}>
          Cancel
        </Button>
      </span>
    </div>
  );
}

export function PresetBrowser() {
  const { state, owner, modified, dispatch } = useLab();
  const lib = state.library;
  const uid = useId();
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const roots = useMemo(() => buildTree(lib), [lib]);
  const searching = query.trim() !== '';
  const rows: Row[] = useMemo(
    () =>
      searching
        ? searchPresets(roots, query).map((node) => ({
            node,
            depth: 0,
            expanded: false,
            parent: null,
          }))
        : visibleRows(roots, open),
    [roots, query, searching, open]
  );
  const activeIndex = Math.max(
    0,
    rows.findIndex((r) => r.node.id === active)
  );
  const activeRow = rows[activeIndex] as Row | undefined;

  const show = (next: boolean) => {
    if (next) {
      const above = foldersAbove(lib, owner);
      setOpen(new Set(above));
      setQuery('');
      setEditing(null);
      setConfirming(null);
      // land on the current generator's row when it is in the tree
      const target = owner
        ? visibleRows(roots, new Set(above)).find(
            (r) => r.node.kind === 'preset' && r.node.owner === owner && r.node.path[0] !== 'Recent'
          )
        : undefined;
      setActive(target?.node.id ?? nodeId('f', ['Built-in']));
    }
    setOpened(next);
  };

  useEffect(() => {
    if (opened) {
      input.current?.focus();
    }
  }, [opened]);
  useEffect(() => {
    const el = list.current?.querySelector('[data-active="true"]');
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [active, rows.length]);

  /** After a move: open the new folders and stay on the preset (its row has a new id). */
  const followTo = (folder: string, key: string) => {
    const dirs = [ROOT_MINE, ...splitFolder(folder)];
    setOpen((cur) => new Set([...cur, ...dirs.map((_, i) => nodeId('f', dirs.slice(0, i + 1)))]));
    setActive(nodeId('p', dirs, key));
  };
  const pick = (n: PresetNode) => {
    dispatch({ type: 'preset/open', owner: n.owner });
    setOpened(false);
  };
  const toggle = (id: string, on?: boolean) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (on === undefined ? next.has(id) : !on) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const move = (to: number) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, to))];
    if (r) {
      setActive(r.node.id);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const row = activeRow;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(activeIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(activeIndex - 1);
        break;
      case 'ArrowRight':
        if (!searching && row && row.node.kind === 'folder') {
          e.preventDefault();
          if (!row.expanded) {
            toggle(row.node.id, true);
          } else {
            move(activeIndex + 1);
          }
        }
        break;
      case 'ArrowLeft':
        if (!searching && row) {
          e.preventDefault();
          if (row.node.kind === 'folder' && row.expanded) {
            toggle(row.node.id, false);
          } else if (row.parent) {
            setActive(row.parent);
          }
        }
        break;
      case 'Enter':
        if (row) {
          e.preventDefault();
          if (row.node.kind === 'folder') {
            toggle(row.node.id);
          } else {
            pick(row.node);
          }
        }
        break;
      default:
    }
  };

  const crumb = owner ? ownerPath(lib, owner).join(' > ') : '';
  const label = crumb || '(edited by hand)';
  const info = activeRow?.node.info ?? '';
  const ownerKind = owner ? parseOwner(owner) : null;
  const infoPreset =
    ownerKind?.kind === 'builtin' ? PRESETS.find((p) => p.name === ownerKind.ref)?.info : undefined;

  return (
    <Tip k="preset" as="control" block extra={infoPreset}>
      <Popover
        opened={opened}
        onChange={show}
        position="bottom-start"
        width={360}
        transitionProps={{ duration: 0 }}
      >
        <Popover.Target>
          <Button
            variant="default"
            size="xs"
            fullWidth
            justify="space-between"
            aria-label={`Preset: ${label}${modified ? ' (modified)' : ''}`}
            className={classes.pbTrigger}
            onClick={() => show(!opened)}
            rightSection={<span aria-hidden="true">&#9662;</span>}
          >
            <span className={classes.pbLabelWrap}>
              <span className={classes.pbLabel}>{label}</span>
              {modified && (
                <span className={classes.pbDot} aria-hidden="true" data-modified="true" />
              )}
            </span>
          </Button>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          <div className={classes.pb}>
            <TextInput
              ref={input}
              size="xs"
              role="combobox"
              aria-label="Search presets"
              aria-expanded="true"
              aria-controls={`${uid}-list`}
              aria-activedescendant={activeRow ? `${uid}-${activeIndex}` : undefined}
              placeholder="Search presets"
              value={query}
              onChange={(e) => {
                setQuery(e.currentTarget.value);
                setActive(null);
              }}
              onKeyDown={onKeyDown}
            />
            <div
              id={`${uid}-list`}
              ref={list}
              className={classes.pbList}
              role={searching ? 'listbox' : 'tree'}
              aria-label={searching ? 'Preset search results' : 'Presets'}
            >
              {rows.length === 0 && <div className={classes.pbEmpty}>No preset matches.</div>}
              {rows.map((r, i) => {
                const n = r.node;
                const isActive = i === activeIndex;
                const isOwn = n.kind === 'preset' && n.owner === owner && n.path[0] !== 'Recent';
                const user = n.kind === 'preset' && n.userId !== null;
                if (n.kind === 'preset' && editing === n.id) {
                  return (
                    <EditRow
                      key={n.id}
                      node={n}
                      onDone={() => setEditing(null)}
                      onMoved={(f) => followTo(f, n.owner)}
                    />
                  );
                }
                const count = n.count;
                return (
                  <div
                    key={n.id}
                    id={`${uid}-${i}`}
                    role={searching ? 'option' : 'treeitem'}
                    aria-selected={isActive}
                    aria-level={searching ? undefined : r.depth + 1}
                    aria-expanded={n.kind === 'folder' ? r.expanded : undefined}
                    className={classes.pbRow}
                    data-active={isActive}
                    data-current={isOwn || undefined}
                    data-kind={n.kind}
                    style={{ paddingInlineStart: `calc(0.375rem + ${r.depth} * 0.875rem)` }}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(n.id)}
                    onClick={() => {
                      setActive(n.id);
                      if (n.kind === 'folder') {
                        toggle(n.id);
                      } else {
                        pick(n);
                      }
                    }}
                  >
                    <span className={classes.pbChev} aria-hidden="true">
                      {n.kind === 'folder' ? (r.expanded ? '▾' : '▸') : ''}
                    </span>
                    <span className={classes.pbName}>
                      <span>{n.label}</span>
                      {searching && n.kind === 'preset' && (
                        <span className={classes.pbPath}>{n.path.join(' > ')}</span>
                      )}
                    </span>
                    {(count > 0 || user) && (
                      <span title={`${count} subset${count === 1 ? '' : 's'}`}>
                        <Num muted>{count}</Num>
                      </span>
                    )}
                    {n.kind === 'preset' && user && n.userId && (
                      <span className={classes.pbActions}>
                        <Tip k="presetEdit" as="control">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="xs"
                            aria-label={`Edit preset ${n.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirming(null);
                              setEditing(n.id);
                            }}
                          >
                            <span aria-hidden="true">&#9998;</span>
                          </ActionIcon>
                        </Tip>
                        <Tip k="presetDelete" as="control">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="xs"
                            aria-label={`Delete preset ${n.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirming(n.id);
                            }}
                          >
                            <CloseIcon />
                          </ActionIcon>
                        </Tip>
                      </span>
                    )}
                    {n.kind === 'preset' && n.userId && confirming === n.id && (
                      <span
                        className={classes.pbConfirm}
                        role="alert"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Delete? Subsets stay under Untitled.
                        <Button
                          size="compact-xs"
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'preset/delete', id: n.userId! });
                            setConfirming(null);
                          }}
                        >
                          Delete
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="gray"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirming(null);
                          }}
                        >
                          Keep
                        </Button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className={classes.pbInfo} aria-live="polite">
              {info}
            </div>
          </div>
        </Popover.Dropdown>
      </Popover>
    </Tip>
  );
}
