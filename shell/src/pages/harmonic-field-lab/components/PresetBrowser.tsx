/**
 * The Preset control (M7b step 2): a button showing the NAME of the generator this tab belongs to (with a dot when it is
 * modified; the full path sits in `PresetCrumb`, a small wrapping line under the control, and under it the preset's
 * description), opening a popover browser: a search box on top (flat results, each with its folder path; user folders and
 * descriptions match too) and a collapsible folder tree below (Built-in, My presets, Recent, Auto-saved). The highlighted row
 * (mouse or keyboard) shows its description in a fixed info line at the bottom edge of the picker (content, not a tooltip: the
 * Developer "Tooltips" switch does not hide it).
 * Keyboard (focus stays in the search box): Up/Down move, Right/Left open/close a folder, Enter picks, typing searches.
 * Choosing a preset is `preset/open`. User presets are renamed, moved, described and deleted from their row; user folders
 * (M5, under My presets only) are created from the header, renamed and described from their row, and deleted from their row
 * after a confirmation that names the presets and folders inside (they go too). The name at the end of the breadcrumb
 * (`PresetCrumb`) renames a user preset in place.
 */
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ActionIcon, Button, Popover, TextInput, VisuallyHidden } from '@mantine/core';
import { PRESETS, splitFolder } from '../../../lib/harmonic-field';
import { deleteFolderQuestion, folderList, orderFolderSuggestions } from '../state/folderRecords';
import { MAX_DESCRIPTION, parseOwner, type UserPreset } from '../state/generatorLibrary';
import type { Action } from '../state/labState';
import {
  buildTree,
  foldersAbove,
  nodeId,
  ownerPath,
  ROOT_MINE,
  searchTree,
  visibleRows,
  type FolderNode,
  type PresetNode,
  type Row,
} from '../state/presetTree';
import { DescriptionLine } from './DescriptionLine';
import { CloseIcon } from './icons';
import { Hint, Num, Tip, useLab } from './ui';
import descClasses from './description.module.css';
import classes from './lab.module.css';

/**
 * A folder path box with the existing folders suggested in a list under it. The list NEVER filters (a native datalist does,
 * so it is not used): the folder the typed text names goes on top (exact, then starts with, then contains, each in the
 * normal order) and every other folder follows in the normal order (`orderFolderSuggestions`). The box is free text: a path
 * that is not a folder yet stays usable. The list is plain content under the box (no floating layer), so it works inside the
 * browser row and inside the Save as new popover without clipping or closing the popover. Arrow keys move over it, Enter on a
 * highlighted folder takes it (Enter on none runs `onEnter`), a click takes one.
 */
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
  const [shown, setShown] = useState(false);
  const [hi, setHi] = useState(-1);
  const ordered = useMemo(() => orderFolderSuggestions(suggestions, value), [suggestions, value]);
  const open = shown && ordered.length > 0;
  const take = (f: string) => {
    onChange(f);
    setShown(false);
    setHi(-1);
  };
  return (
    <div className={classes.folderBox}>
      <TextInput
        size="xs"
        role="combobox"
        aria-label="Folder"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && hi >= 0 ? `${id}-${hi}` : undefined}
        placeholder="Folder, e.g. Pools/Seven (optional)"
        value={value}
        onFocus={() => setShown(true)}
        onBlur={() => {
          setShown(false);
          setHi(-1);
        }}
        onChange={(e) => {
          onChange(e.currentTarget.value);
          setShown(true);
          setHi(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (ordered.length > 0) {
              e.preventDefault();
              setShown(true);
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setHi((cur) => Math.max(-1, Math.min(ordered.length - 1, cur + step)));
            }
          } else if (e.key === 'Enter') {
            if (open && hi >= 0) {
              e.preventDefault();
              e.stopPropagation();
              take(ordered[hi]);
            } else if (onEnter) {
              onEnter();
            }
          }
        }}
      />
      {open && (
        <div id={`${id}-list`} role="listbox" aria-label="Folders" className={classes.folderList}>
          {ordered.map((f, i) => (
            <div
              key={f}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === hi}
              tabIndex={-1}
              className={classes.folderOpt}
              data-active={i === hi || undefined}
              // mouse down must not blur the box (that would close the list before the click lands)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => take(f)}
            >
              {f}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sends library actions from a browser row and remembers which row sent them (`key`), so a refusal in `state.refusal` shows
 * under that row; `ok` runs once the actions left no refusal (the folder was made or renamed).
 */
type Run = (key: string, actions: Action | Action[], ok?: () => void) => void;

function EditRow({
  node,
  run,
  onDone,
  onMoved,
}: {
  node: PresetNode;
  run: Run;
  onDone: () => void;
  onMoved: (folder: string) => void;
}) {
  const { state } = useLab();
  const [name, setName] = useState(node.label);
  const [folder, setFolder] = useState(node.folder);
  const [description, setDescription] = useState(node.description ?? '');
  const folders = useMemo(() => folderList(state.library), [state.library]);
  const save = () => {
    if (node.userId) {
      const actions: Action[] = [];
      if (name.trim() && name.trim() !== node.label) {
        actions.push({ type: 'preset/rename', id: node.userId, name });
      }
      if (folder !== node.folder) {
        actions.push({ type: 'preset/move', id: node.userId, folder });
      }
      if (description.trim() !== (node.description ?? '')) {
        actions.push({ type: 'preset/describe', id: node.userId, description });
      }
      if (actions.length > 0) {
        run(node.id, actions);
      }
      if (folder !== node.folder) {
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
      <Tip k="presetDescription" as="control" block>
        <TextInput
          size="xs"
          aria-label="Preset description"
          placeholder="Description (optional)"
          maxLength={MAX_DESCRIPTION}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              save();
            }
          }}
        />
      </Tip>
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

/** The edit row of a user folder: its name (a rename keeps the presets inside) and its description. */
function FolderEditRow({
  node,
  run,
  onDone,
  onRenamed,
}: {
  node: FolderNode;
  run: Run;
  onDone: () => void;
  onRenamed: (from: string, to: string) => void;
}) {
  const path = node.userPath ?? '';
  const segs = splitFolder(path);
  const leaf = segs[segs.length - 1] ?? '';
  const parent = segs.slice(0, -1).join('/');
  const [name, setName] = useState(leaf);
  const [description, setDescription] = useState(node.description ?? '');
  const save = () => {
    const next = name.trim();
    const actions: Action[] = [];
    // the description goes first, on the old path: the rename then carries the record (and its description) along
    if (description.trim() !== (node.description ?? '')) {
      actions.push({ type: 'folder/describe', path, description });
    }
    const to = parent ? `${parent}/${next}` : next;
    const renaming = next !== '' && next !== leaf;
    if (renaming) {
      actions.push({ type: 'folder/rename', from: path, to });
    }
    if (actions.length > 0) {
      run(node.id, actions, renaming ? () => onRenamed(path, to) : undefined);
    }
    onDone();
  };
  return (
    <div className={classes.pbEdit}>
      <TextInput
        size="xs"
        aria-label="Folder name"
        value={name}
        data-autofocus
        autoFocus
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            save();
          }
        }}
      />
      <TextInput
        size="xs"
        aria-label="Folder description"
        placeholder="Description (optional)"
        maxLength={MAX_DESCRIPTION}
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            save();
          }
        }}
      />
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

/** A user preset's description line under the breadcrumb: click to edit in place; a faint prompt when it has none. */
function UserPresetDescription({ preset }: { preset: UserPreset }) {
  const { dispatch } = useLab();
  const [editing, setEditing] = useState(false);
  const description = preset.description ?? '';
  return (
    <Hint k="presetDescription" dynamic={description || undefined} disabled={editing}>
      <div className={classes.pbDesc} data-testid="preset-description">
        <DescriptionLine
          value={description}
          editing={editing}
          onEditingChange={setEditing}
          onSave={(text) => dispatch({ type: 'preset/describe', id: preset.id, description: text })}
          label={`Description of ${preset.name}`}
          prompt="Add a description"
          lines={4}
        />
      </div>
    </Hint>
  );
}

/** The line under the breadcrumb: a user preset's own description (editable), a built-in preset's fixed note (read-only). */
function PresetDescription() {
  const { state, owner } = useLab();
  const o = owner ? parseOwner(owner) : null;
  if (o?.kind === 'builtin') {
    const info = PRESETS.find((p) => p.name === o.ref)?.info;
    return info ? (
      <div className={classes.pbDesc} data-testid="preset-description">
        <span className={descClasses.static}>{info}</span>
      </div>
    ) : null;
  }
  if (o?.kind === 'user') {
    const preset = state.library.presets.find((x) => x.id === o.ref);
    return preset ? <UserPresetDescription key={preset.id} preset={preset} /> : null;
  }
  return null;
}

/**
 * The last segment of the breadcrumb when it is a USER preset's name: click it to rename in place (Enter or leaving keeps,
 * Escape cancels). The reducer's `preset/rename` refuses an empty name and a name taken in the same folder; its reason
 * (`state.refusal`) shows under the breadcrumb and the box stays open for another try. The box and the name sit OUTSIDE the
 * Preset button and its popover (the crumb is a sibling of the control), so a click here cannot open the browser.
 */
function CrumbName({ preset }: { preset: UserPreset }) {
  const { state, dispatch } = useLab();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(preset.name);
  const [pending, setPending] = useState(false);
  const refusal = pending ? state.refusal?.reason : undefined;
  // the rename went through (no refusal after it): close the box
  useEffect(() => {
    if (pending && !state.refusal) {
      setPending(false);
      setEditing(false);
    }
  }, [pending, state.refusal]);
  const keep = () => {
    const next = name.trim();
    if (next === preset.name) {
      setEditing(false);
      setPending(false);
      return;
    }
    setPending(true);
    dispatch({ type: 'preset/rename', id: preset.id, name });
  };
  const cancel = () => {
    setEditing(false);
    setPending(false);
  };
  if (!editing) {
    return (
      <Hint k="presetRename">
        <button
          type="button"
          className={`${classes.crumbName} ${classes.autoName}`}
          aria-label={`Rename ${preset.name}`}
          onClick={() => {
            setName(preset.name);
            setPending(false);
            setEditing(true);
          }}
        >
          {preset.name}
        </button>
      </Hint>
    );
  }
  return (
    <>
      <TextInput
        className={classes.crumbEdit}
        size="xs"
        aria-label="Preset name"
        value={name}
        data-autofocus
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setName(e.currentTarget.value);
          setPending(false);
        }}
        onBlur={() => {
          // leaving keeps a good name; a refused one is dropped (the old name stays)
          const next = name.trim();
          if (next === preset.name || refusal !== undefined) {
            cancel();
          } else {
            keep();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            keep();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            cancel();
          }
        }}
      />
      {refusal && (
        <div className={classes.pbRefusal} role="alert" data-testid="preset-rename-refusal">
          {refusal}
        </div>
      )}
    </>
  );
}

/** The full path of the tab's generator, as one muted line that wraps instead of cutting off, and under it its description. */
export function PresetCrumb() {
  const { state, owner } = useLab();
  const parts = owner ? ownerPath(state.library, owner) : [];
  const auto = owner ? parseOwner(owner)?.kind === 'untitled' : false;
  if (parts.length === 0) {
    return (
      <div className={classes.pbCrumb} data-testid="preset-path">
        (edited by hand)
      </div>
    );
  }
  // an automatically given name (Auto-saved generators) is muted italic until the user names it
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1).map((p) => `${p} > `);
  const o = owner ? parseOwner(owner) : null;
  const userPreset =
    o?.kind === 'user' ? state.library.presets.find((x) => x.id === o.ref) : undefined;
  return (
    <>
      <div className={classes.pbCrumb} data-testid="preset-path">
        {head.join('')}
        {userPreset ? (
          <CrumbName key={userPreset.id} preset={userPreset} />
        ) : (
          <span className={classes.autoName} data-auto={auto || undefined}>
            {last}
          </span>
        )}
      </div>
      <PresetDescription />
    </>
  );
}

/** A refusal sentence under the row that caused it. */
function RowRefusal({ children }: { children: ReactNode }) {
  return (
    <div className={classes.pbRefusal} role="alert">
      {children}
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
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const onOk = useRef<(() => void) | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const roots = useMemo(() => buildTree(lib), [lib]);
  const searching = query.trim() !== '';
  const rows: Row[] = useMemo(
    () =>
      searching
        ? searchTree(roots, query).map((node) => ({
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

  /** Dispatch from a row (or the New folder form): a refusal then shows under that row, and `ok` runs when there is none. */
  const run: Run = (key, actions, ok) => {
    onOk.current = ok ?? null;
    for (const a of Array.isArray(actions) ? actions : [actions]) {
      dispatch(a);
    }
    setPending(key);
  };
  useEffect(() => {
    if (pending !== null && !state.refusal) {
      const f = onOk.current;
      onOk.current = null;
      setPending(null);
      f?.();
    }
  }, [pending, state.refusal]);
  const refusalAt = (key: string): string | undefined =>
    pending === key ? state.refusal?.reason : undefined;

  const show = (next: boolean) => {
    if (next) {
      const above = foldersAbove(lib, owner);
      setOpen(new Set(above));
      setQuery('');
      setEditing(null);
      setConfirming(null);
      setCreating(false);
      setPending(null);
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

  /** The ids of My presets and of every folder above (and including) a user folder path, to open them. */
  const mineIds = (path: string): string[] => {
    const dirs = [ROOT_MINE, ...splitFolder(path)];
    return dirs.map((_, i) => nodeId('f', dirs.slice(0, i + 1)));
  };
  /** After a move: open the new folders and stay on the preset (its row has a new id). */
  const followTo = (folder: string, key: string) => {
    const dirs = [ROOT_MINE, ...splitFolder(folder)];
    setOpen((cur) => new Set([...cur, ...mineIds(folder)]));
    setActive(nodeId('p', dirs, key));
  };
  /** After a folder rename: the open folders below it follow the new name, and the row stays selected. */
  const followRename = (from: string, to: string) => {
    const oldId = nodeId('f', [ROOT_MINE, ...splitFolder(from)]);
    const newId = nodeId('f', [ROOT_MINE, ...splitFolder(to)]);
    setOpen((cur) => {
      const next = new Set<string>();
      for (const id of cur) {
        next.add(
          id === oldId || id.startsWith(`${oldId} > `) ? newId + id.slice(oldId.length) : id
        );
      }
      for (const id of mineIds(to)) {
        next.add(id);
      }
      return next;
    });
    setActive(newId);
  };
  /** A folder found by the search: leave the search and show it in the tree. */
  const reveal = (n: FolderNode) => {
    setQuery('');
    setOpen((cur) => new Set([...cur, ...mineIds(n.userPath ?? '')]));
    setActive(n.id);
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
  const createFolder = () =>
    run('new', { type: 'folder/create', path: newPath }, () => {
      const made = newPath;
      setCreating(false);
      setNewPath('');
      setOpen((cur) => new Set([...cur, ...mineIds(made)]));
      setActive(nodeId('f', [ROOT_MINE, ...splitFolder(made)]));
    });

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
            if (searching) {
              reveal(row.node);
            } else {
              toggle(row.node.id);
            }
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
  const name = (owner ? ownerPath(lib, owner).at(-1) : '') || label;
  // a user preset's or folder's description, else the built-in preset's note (or where the row sits)
  const info = activeRow?.node.description ?? activeRow?.node.info ?? '';
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
              {modified && (
                <span className={classes.pbDot} aria-hidden="true" data-modified="true" />
              )}
              <span
                className={`${classes.pbLabel} ${classes.autoName}`}
                data-auto={ownerKind?.kind === 'untitled' || undefined}
              >
                {name}
              </span>
            </span>
          </Button>
        </Popover.Target>
        <Popover.Dropdown p={0}>
          <div className={classes.pb}>
            <div className={classes.pbHead}>
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
              <Tip k="presetNewFolder" as="control">
                <Button
                  size="compact-xs"
                  variant="default"
                  aria-expanded={creating}
                  onClick={() => {
                    setCreating(!creating);
                    setPending(null);
                  }}
                >
                  New folder
                </Button>
              </Tip>
            </div>
            {creating && (
              <div className={classes.pbNew}>
                <span className={classes.inline}>
                  <TextInput
                    size="xs"
                    aria-label="New folder name"
                    placeholder="Name, or A/B for a folder inside a folder"
                    maxLength={120}
                    value={newPath}
                    data-autofocus
                    autoFocus
                    onChange={(e) => setNewPath(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        createFolder();
                      }
                    }}
                  />
                  <Button size="compact-xs" variant="default" onClick={createFolder}>
                    Create
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => {
                      setCreating(false);
                      setPending(null);
                    }}
                  >
                    Cancel
                  </Button>
                </span>
                {refusalAt('new') && <RowRefusal>{refusalAt('new')}</RowRefusal>}
              </div>
            )}
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
                // a user folder under My presets (not the root, not a built-in or Recent or Auto-saved folder)
                const userFolder = n.kind === 'folder' && !!n.userPath;
                if (n.kind === 'preset' && editing === n.id) {
                  return (
                    <EditRow
                      key={n.id}
                      node={n}
                      run={run}
                      onDone={() => setEditing(null)}
                      onMoved={(f) => followTo(f, n.owner)}
                    />
                  );
                }
                if (n.kind === 'folder' && userFolder && editing === n.id) {
                  return (
                    <FolderEditRow
                      key={n.id}
                      node={n}
                      run={run}
                      onDone={() => setEditing(null)}
                      onRenamed={followRename}
                    />
                  );
                }
                const count = n.count;
                const refusal = refusalAt(n.id);
                return (
                  <Fragment key={n.id}>
                    <div
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
                          if (searching) {
                            reveal(n);
                          } else {
                            toggle(n.id);
                          }
                        } else {
                          pick(n);
                        }
                      }}
                    >
                      <span className={classes.pbChev} aria-hidden="true">
                        {n.kind === 'folder' && !searching ? (r.expanded ? '▾' : '▸') : ''}
                      </span>
                      <span className={classes.pbName}>
                        <span>{n.label}</span>
                        {searching && (
                          <span className={classes.pbPath}>
                            {(n.kind === 'preset' ? n.path : n.path.slice(0, -1)).join(' > ')}
                          </span>
                        )}
                      </span>
                      {(count > 0 || user || userFolder) && (
                        <Hint label={`${count} subset${count === 1 ? '' : 's'}`}>
                          <span>
                            <Num muted>{count}</Num>
                          </span>
                        </Hint>
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
                              className={classes.dangerHover}
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
                      {n.kind === 'folder' && userFolder && n.userPath && (
                        <span className={classes.pbActions}>
                          <Tip k="folderRename" as="control">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="xs"
                              aria-label={`Edit folder ${n.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirming(null);
                                setEditing(n.id);
                              }}
                            >
                              <span aria-hidden="true">&#9998;</span>
                            </ActionIcon>
                          </Tip>
                          <Tip k="folderDelete" as="control">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="xs"
                              className={classes.dangerHover}
                              aria-label={`Delete folder ${n.label}`}
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
                          Delete? Subsets stay under Auto-saved.
                          <Button
                            size="compact-xs"
                            variant="default"
                            className={classes.dangerHover}
                            onClick={(e) => {
                              e.stopPropagation();
                              run(n.id, { type: 'preset/delete', id: n.userId! });
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
                    {n.kind === 'folder' && userFolder && n.userPath && confirming === n.id && (
                      <div className={classes.pbConfirmBlock} role="alert">
                        <span>{deleteFolderQuestion(lib, n.userPath)}</span>
                        <Button
                          size="compact-xs"
                          variant="default"
                          className={classes.dangerHover}
                          onClick={() => {
                            run(n.id, { type: 'folder/delete-tree', path: n.userPath! });
                            setConfirming(null);
                          }}
                        >
                          Delete
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="gray"
                          onClick={() => setConfirming(null)}
                        >
                          Keep
                        </Button>
                      </div>
                    )}
                    {refusal && <RowRefusal>{refusal}</RowRefusal>}
                  </Fragment>
                );
              })}
            </div>
            <div className={classes.pbInfo}>{info}</div>
            <VisuallyHidden aria-live="polite">{info}</VisuallyHidden>
          </div>
        </Popover.Dropdown>
      </Popover>
    </Tip>
  );
}
