import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Popover, SegmentedControl, Select, Switch, Text, TextInput } from '@mantine/core';
import { useCompositionSettings } from '../compositionSettings';
import { EnsureDataBlockOps, useDataBlockOps } from '../dataBlockOps';
import { dataBlockUsers } from '../dataBlocks/dataBlockRefs';
import { auditionRefusal, dataBlockTypes, type StoredDataBlock } from '../dataBlocks/registry';
import { newDataBlockId, useDesk } from '../desk';
import { recordGroup } from '../history';
import { formatLength, formatPosition, parseLength, parsePosition } from '../meterTime';
import { rationalToNumber, type Rational } from '../musicalTime';
import { outlinerRows, type OutlinerRow } from '../scene/outlinerRows';
import {
  addChildEmpty,
  addCollection,
  addEmpty,
  createScene,
  deleteSummary,
  deleteSelected,
  renameBlock,
  setMapping,
  setMute,
  setParent,
  setPrimaryData,
  setTimeSpan,
  type SceneOpResult,
} from '../scene/sceneOps';
import { useSceneSession } from '../scene/sceneSession';
import {
  collectionDataOf,
  objectDataOf,
  sceneDataOf,
  type ObjectMapping,
} from '../scene/sceneTypes';
import { useSceneEvaluation, useScenePlayback } from '../scene/useScenePlayback';
import { DataBlockMenu } from './DataBlockMenu';
import classes from './ScenePanels.module.css';

/**
 * The Outliner and Properties panels (workbench O2a, a thin slice). Both read the desk's data-blocks
 * and the viewer's scene session (`scene/sceneSession.ts`), so each renders from the contexts above the
 * Stage with nothing from the page. Every edit is one pure op from `scene/sceneOps.ts`, applied as one
 * undo-grouped desk write.
 */

const NO_DESK = 'The desk is not accepting changes right now.';

/** The shared state of both panels: the scene, its rows, the selection and the one apply. */
export function useSceneEditor() {
  const desk = useDesk();
  const ops = useDataBlockOps();
  const [session, updateSession] = useSceneSession();
  const blocks = desk.allDataBlocks;
  const { latestDataBlockList, applyDataBlockList } = desk;
  const scenes = useMemo(() => blocks.filter((block) => sceneDataOf(block)), [blocks]);
  const scene = scenes.find((block) => block.id === session.activeSceneId) ?? null;
  const rows = useMemo(() => (scene ? outlinerRows(blocks, scene.id) : []), [blocks, scene]);
  const selectedRow = rows.find((row) => row.id === session.selectedId) ?? null;
  const selected = selectedRow ? blocks.find((block) => block.id === selectedRow.id) : undefined;
  const writable = !desk.loading && !desk.locked;

  /** Runs an op on the LATEST list and applies the result as one undo step. */
  function commit(run: (list: readonly StoredDataBlock[]) => SceneOpResult): SceneOpResult {
    const result = run(latestDataBlockList());
    if (!result.ok) {
      return result;
    }
    let accepted = true;
    recordGroup(() => {
      accepted = applyDataBlockList(result.blocks);
    });
    return accepted ? result : { ok: false, error: NO_DESK };
  }

  /** Delete through the existing path, as one undo step. */
  function remove(id: string): SceneOpResult {
    const before = latestDataBlockList();
    const next = deleteSelected({ dataBlocks: before, instances: ops.project.instances }, id);
    let accepted = true;
    recordGroup(() => {
      accepted = applyDataBlockList(next.dataBlocks);
    });
    return accepted
      ? { ok: true, blocks: next.dataBlocks, created: [] }
      : { ok: false, error: NO_DESK };
  }

  return {
    blocks,
    scenes,
    scene,
    rows,
    selectedRow,
    selected,
    writable,
    session,
    updateSession,
    commit,
    remove,
    project: ops.project,
  };
}

/* --------------------------------------------------------------------------------------- Outliner */

const quarters = (value: Rational) => rationalToNumber(value);

export function OutlinerPanel() {
  return (
    <EnsureDataBlockOps>
      <OutlinerBody />
    </EnsureDataBlockOps>
  );
}

function OutlinerBody() {
  const editor = useSceneEditor();
  const { blocks, scenes, scene, rows, selectedRow, writable, session, updateSession } = editor;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const treeRef = useRef<HTMLDivElement>(null);

  // The evaluation and the one play controller are shared with the Arranger (scene/useScenePlayback.ts).
  const evaluation = useSceneEvaluation(blocks, scene?.id ?? null);
  const playback = useScenePlayback(scene?.id ?? null, evaluation);
  const playRefusal = playback.refusal;
  const togglePlay = playback.toggle;

  function report(result: SceneOpResult) {
    setMessage(result.ok ? '' : result.error);
    return result;
  }

  function select(id: string | null) {
    updateSession({ selectedId: id });
  }

  const visible = rows.filter((row) => {
    let parent = row.parentRowId;
    while (parent !== null) {
      if (collapsed.has(parent)) {
        return false;
      }
      parent = rows.find((candidate) => candidate.id === parent)?.parentRowId ?? null;
    }
    return true;
  });

  function addAndSelect(result: SceneOpResult) {
    report(result);
    if (result.ok && result.created[0]) {
      select(result.created[0]);
    }
  }

  const selectedCollection = selectedRow?.kind === 'collection' ? selectedRow.id : null;
  const noScene = 'Create or choose a scene first.';
  const deskReason = writable ? null : NO_DESK;
  const addReason = scene === null ? noScene : deskReason;
  const childReason =
    addReason ?? (selectedRow?.kind === 'object' ? null : 'Select an object to add a child to.');
  const deleteReason =
    deskReason ?? (selectedRow ? null : 'Select an object or a collection first.');
  const summary = selectedRow && confirming ? deleteSummary(blocks, selectedRow.id) : null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (renamingId !== null) {
      return;
    }
    const index = visible.findIndex((row) => row.id === session.selectedId);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      const target = visible[Math.max(0, Math.min(visible.length - 1, index < 0 ? 0 : next))];
      if (target) {
        select(target.id);
      }
    } else if (event.key === 'F2' && selectedRow && writable) {
      event.preventDefault();
      setRenamingId(selectedRow.id);
    } else if (event.key === 'Delete' && selectedRow && deleteReason === null) {
      event.preventDefault();
      setConfirming(true);
    }
  }

  return (
    <section className={classes.panel} aria-label="Outliner">
      <div className={classes.bar}>
        {scenes.length === 0 ? (
          <Text className={classes.sceneName}>No scene yet</Text>
        ) : (
          <Select
            className={classes.picker}
            size="xs"
            aria-label="Scene"
            placeholder="Choose a scene"
            allowDeselect={false}
            data={scenes.map((block) => ({ value: block.id, label: block.name }))}
            value={scene?.id ?? null}
            onChange={(id) => updateSession({ activeSceneId: id, selectedId: null })}
            comboboxProps={{ transitionProps: { duration: 0 } }}
          />
        )}
        <Button
          size="compact-xs"
          variant="default"
          disabled={!writable}
          data-info={deskReason ?? 'Create a scene with an empty root collection and open it.'}
          onClick={() => {
            const result = report(editor.commit((list) => createScene(list, newEnv())));
            if (result.ok) {
              updateSession({ activeSceneId: result.created[0], selectedId: null });
            }
          }}
        >
          New scene
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          disabled={!playback.playing && playRefusal !== null}
          data-info={
            playback.playing
              ? 'Stop the scene'
              : (playRefusal ?? 'Play the scene once through on the transport')
          }
          onClick={togglePlay}
        >
          {playback.playing ? '■ Stop' : '▶ Play'}
        </Button>
      </div>
      <div className={classes.bar}>
        <Button
          size="compact-xs"
          variant="default"
          disabled={addReason !== null}
          data-info={addReason ?? 'Add an empty object to the selected collection, or the scene.'}
          onClick={() =>
            scene &&
            addAndSelect(
              editor.commit((list) => addEmpty(list, newEnv(), scene.id, selectedCollection))
            )
          }
        >
          Add Empty
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          disabled={childReason !== null}
          data-info={childReason ?? 'Add an empty object placed under the selected object.'}
          onClick={() =>
            scene &&
            selectedRow &&
            addAndSelect(
              editor.commit((list) => addChildEmpty(list, newEnv(), scene.id, selectedRow.id))
            )
          }
        >
          Add Child Empty
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          disabled={addReason !== null}
          data-info={addReason ?? 'Add a collection inside the selected collection, or the scene.'}
          onClick={() =>
            scene &&
            addAndSelect(
              editor.commit((list) => addCollection(list, newEnv(), scene.id, selectedCollection))
            )
          }
        >
          Add Collection
        </Button>
        <Popover
          opened={confirming && deleteReason === null}
          onChange={setConfirming}
          position="bottom-end"
          withinPortal={false}
          transitionProps={{ duration: 0 }}
        >
          <Popover.Target>
            <Button
              size="compact-xs"
              variant="default"
              disabled={deleteReason !== null}
              data-info={
                deleteReason ??
                'Delete the selected item. Objects placed under it keep their place.'
              }
              onClick={() => setConfirming((current) => !current)}
            >
              Delete
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            {summary && (
              <>
                <Text size="xs" fw={600}>
                  {deleteLine(summary)}
                </Text>
                <Button
                  size="compact-xs"
                  mt="xs"
                  onClick={() => {
                    setConfirming(false);
                    if (selectedRow) {
                      report(editor.remove(selectedRow.id));
                      select(null);
                    }
                  }}
                >
                  Confirm delete
                </Button>
              </>
            )}
          </Popover.Dropdown>
        </Popover>
      </div>
      <div
        className={classes.line}
        title={message || evaluation?.warnings.join(' ') || playback.status}
        role="status"
      >
        {message || evaluation?.warnings.join(' ') || playback.status}
      </div>
      <div
        ref={treeRef}
        className={classes.tree}
        role="tree"
        aria-label="Scene"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {scene === null ? (
          <Text className={classes.empty}>
            {scenes.length === 0 ? 'No scene yet.' : 'Choose a scene.'}
          </Text>
        ) : rows.length === 0 ? (
          <Text className={classes.empty}>Nothing in this scene yet.</Text>
        ) : (
          visible.map((row) => (
            <OutlinerRowView
              key={row.id}
              row={row}
              selected={row.id === session.selectedId}
              collapsed={collapsed.has(row.id)}
              renaming={renamingId === row.id}
              writable={writable}
              onSelect={() => {
                select(row.id);
                treeRef.current?.focus();
              }}
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (!next.delete(row.id)) {
                    next.add(row.id);
                  }
                  return next;
                })
              }
              onStartRename={() => writable && setRenamingId(row.id)}
              onRename={(name) => {
                setRenamingId(null);
                if (name !== null && name.trim() !== row.name) {
                  report(editor.commit((list) => renameBlock(list, row.id, name)));
                }
                treeRef.current?.focus();
              }}
              onMute={() => report(editor.commit((list) => setMute(list, row.id, !row.mute)))}
            />
          ))
        )}
      </div>
    </section>
  );
}

function newEnv() {
  return { newId: newDataBlockId, now: new Date().toISOString() };
}

function deleteLine(summary: NonNullable<ReturnType<typeof deleteSummary>>) {
  const placed =
    summary.children === 0
      ? ''
      : ` ${summary.children} ${summary.children === 1 ? 'object' : 'objects'} placed under it keep their place.`;
  if (summary.kind === 'collection') {
    const moved =
      summary.members === 0
        ? ''
        : summary.movesTo
          ? ` Its ${summary.members} ${summary.members === 1 ? 'item moves' : 'items move'} up to ${summary.movesTo}.`
          : '';
    return `Delete ${summary.name}?${moved}`;
  }
  return `Delete ${summary.name}?${placed || ' Data-blocks stay on the desk.'}`;
}

function OutlinerRowView({
  row,
  selected,
  collapsed,
  renaming,
  writable,
  onSelect,
  onToggle,
  onStartRename,
  onRename,
  onMute,
}: {
  row: OutlinerRow;
  selected: boolean;
  collapsed: boolean;
  renaming: boolean;
  writable: boolean;
  onSelect(): void;
  onToggle(): void;
  onStartRename(): void;
  onRename(name: string | null): void;
  onMute(): void;
}) {
  // Enter, Escape and blur all end a rename; only the first counts (focusing the tree on Enter blurs
  // the input, which used to commit a second time and made Escape commit).
  const settledRef = useRef(false);
  useEffect(() => {
    if (renaming) {
      settledRef.current = false;
    }
  }, [renaming]);
  const finishRename = (value: string | null) => {
    if (!settledRef.current) {
      settledRef.current = true;
      onRename(value);
    }
  };
  return (
    <div
      className={`${classes.row} ${row.muted ? classes.rowMuted : ''}`}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.hasChildren ? !collapsed : undefined}
      style={{ paddingLeft: `${0.25 + row.depth * 1}rem` }}
      tabIndex={-1}
      onClick={onSelect}
      onDoubleClick={onStartRename}
    >
      <button
        type="button"
        className={classes.toggle}
        tabIndex={-1}
        disabled={!row.hasChildren}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${row.name}`}
        data-info={
          row.hasChildren
            ? collapsed
              ? 'Show what is inside.'
              : 'Hide what is inside.'
            : undefined
        }
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        {row.hasChildren ? (collapsed ? '▸' : '▾') : ''}
      </button>
      <span className={classes.glyph} aria-hidden>
        {row.kind === 'collection' ? '▤' : '◇'}
      </span>
      {renaming ? (
        <input
          className={classes.rowInput}
          aria-label={`Rename ${row.name}`}
          defaultValue={row.name}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={(event) => finishRename(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              finishRename(event.currentTarget.value);
            } else if (event.key === 'Escape') {
              finishRename(null);
            }
          }}
        />
      ) : (
        <span className={classes.rowName}>{row.name}</span>
      )}
      <span className={classes.rowData}>{row.data}</span>
      <button
        type="button"
        className={`${classes.toggle} ${classes.mute}`}
        tabIndex={-1}
        disabled={!writable}
        aria-pressed={row.mute}
        aria-label={`Mute ${row.name}`}
        data-info={
          row.inheritedMute
            ? 'Silent because a collection around it is muted.'
            : row.mute
              ? 'Unmute'
              : 'Mute'
        }
        onClick={(event) => {
          event.stopPropagation();
          onMute();
        }}
      >
        {row.muted ? '◌' : '◉'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------------------------- Properties */

const PACKET_TYPE_IDS = () =>
  dataBlockTypes()
    .filter((type) => type.payload === 'packet')
    .map((type) => type.id);

const MAPPING_OPTIONS: { value: ObjectMapping; label: string }[] = [
  { value: 'loop', label: 'Loop' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'one-shot', label: 'One-shot' },
];

const NONE = '__none__';

/** A text field that commits on Enter or blur; the reason for a refusal goes to the panel's line. */
function CommitField({
  value,
  ariaLabel,
  disabled,
  info,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  disabled?: boolean;
  info?: string;
  /** Returns the refusal, or null when the edit landed. */
  onCommit(text: string): string | null;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [bad, setBad] = useState(false);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
    setBad(false);
  }
  function commit() {
    if (draft.trim() === value) {
      setBad(false);
      return;
    }
    const problem = onCommit(draft);
    setBad(problem !== null);
    if (problem === null) {
      setDraft(value);
    }
  }
  return (
    <TextInput
      className={classes.grow}
      size="xs"
      aria-label={ariaLabel}
      value={draft}
      error={bad}
      disabled={disabled}
      data-info={info}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
        } else if (event.key === 'Escape') {
          setDraft(value);
          setBad(false);
        }
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={classes.field}>
      <span className={classes.fieldLabel}>{label}</span>
      <div className={classes.controls}>{children}</div>
    </div>
  );
}

export function PropertiesPanel() {
  return (
    <EnsureDataBlockOps>
      <PropertiesBody />
    </EnsureDataBlockOps>
  );
}

function PropertiesBody() {
  const editor = useSceneEditor();
  const { selectedRow, selected, rows, blocks, writable, project } = editor;
  const { settings } = useCompositionSettings();
  const ops = useDataBlockOps();
  const [message, setMessage] = useState('');
  const meter = settings.transport.meter;
  const selectedId = selected?.id;
  useEffect(() => {
    setMessage('');
  }, [selectedId]);

  const object = objectDataOf(selected);
  const collection = collectionDataOf(selected);
  const isObject = object !== null;

  function apply(run: (list: readonly StoredDataBlock[]) => SceneOpResult): string | null {
    const result = editor.commit(run);
    setMessage(result.ok ? '' : result.error);
    return result.ok ? null : result.error;
  }

  if (!selected || !selectedRow || (!object && !collection)) {
    return (
      <section className={classes.panel} aria-label="Properties">
        <Text className={classes.empty}>Select an object or a collection in the Outliner.</Text>
      </section>
    );
  }

  const id = selected.id;
  const deskReason = writable ? null : NO_DESK;
  const objectOnly = (what: string) => (isObject ? null : `A collection has no ${what}.`);
  const lock = (what: string) => deskReason ?? objectOnly(what);

  const primary = object?.primaryDataRef
    ? blocks.find((b) => b.id === object.primaryDataRef?.id)
    : undefined;
  const users = primary ? dataBlockUsers(project, primary.id) : [];
  const mine = users.find((user) => user.ownerId === id && user.slot === 'data');
  const heardRefusal = primary ? auditionRefusal(primary) : null;

  const timeText = (value: Rational | undefined, length: boolean) => {
    if (!value) {
      return '';
    }
    try {
      return length ? formatLength(value, meter) : formatPosition(value, meter);
    } catch {
      return `${quarters(value)} quarter notes`;
    }
  };
  const parentOptions = [
    { value: NONE, label: 'None' },
    ...rows
      .filter((row) => row.kind === 'object' && row.id !== id)
      .map((row) => ({ value: row.id, label: row.name })),
  ];

  return (
    <section className={classes.panel} aria-label="Properties">
      <Field label="Name">
        <CommitField
          ariaLabel="Name"
          value={selected.name}
          disabled={deskReason !== null}
          onCommit={(text) => apply((list) => renameBlock(list, id, text))}
        />
      </Field>
      {object && (
        <>
          <Field label="Parent">
            <Select
              className={classes.grow}
              size="xs"
              aria-label="Parent"
              allowDeselect={false}
              disabled={lock('parent') !== null}
              data-info={
                lock('parent') ??
                'Place this object relative to another object. Its start is then counted from the parent start.'
              }
              data={parentOptions}
              value={
                object?.parentRef && parentOptions.some((o) => o.value === object.parentRef?.id)
                  ? object.parentRef.id
                  : NONE
              }
              onChange={(value) =>
                apply((list) =>
                  setParent(list, id, value === null || value === NONE ? null : value)
                )
              }
              comboboxProps={{ transitionProps: { duration: 0 } }}
            />
          </Field>
          <Field label="Start">
            <CommitField
              ariaLabel="Start"
              value={timeText(object?.timeSpan.start, false)}
              disabled={lock('start') !== null}
              info={
                lock('start') ??
                `Start as bar.beat.tick in ${meter}, counted from the parent start (or the scene start).`
              }
              onCommit={(text) => {
                const parsed = parsePosition(text, meter);
                if (!parsed.ok) {
                  setMessage(parsed.error);
                  return parsed.error;
                }
                return apply((list) => setTimeSpan(list, id, { start: parsed.value }));
              }}
            />
          </Field>
          <Field label="Duration">
            <CommitField
              ariaLabel="Duration"
              value={timeText(object?.timeSpan.duration, true)}
              disabled={lock('duration') !== null}
              info={lock('duration') ?? `Length as bars.beats.ticks in ${meter}.`}
              onCommit={(text) => {
                const parsed = parseLength(text, meter);
                if (!parsed.ok) {
                  setMessage(parsed.error);
                  return parsed.error;
                }
                return apply((list) => setTimeSpan(list, id, { duration: parsed.value }));
              }}
            />
          </Field>
          <Field label="Data">
            <DataBlockMenu
              spec={{ accepts: PACKET_TYPE_IDS() }}
              label={primary?.name ?? 'None'}
              ariaLabel="Data"
              info="The data-block this object plays. None is an Empty: silent."
              selectedId={primary?.id ?? null}
              disabledReason={lock('data')}
              onPick={(row) => apply((list) => setPrimaryData(list, id, row.block.id))}
            />
            <Button
              size="compact-xs"
              variant="default"
              disabled={lock('data') !== null || !object?.primaryDataRef}
              data-info={
                lock('data') ??
                (object?.primaryDataRef
                  ? 'Clear the data: the object becomes an Empty.'
                  : 'Already an Empty.')
              }
              onClick={() => apply((list) => setPrimaryData(list, id, null))}
            >
              None
            </Button>
          </Field>
          <Field label="Users">
            <Text size="xs" c="dimmed" className={classes.grow}>
              {primary ? `Used by ${users.length}` : 'No data'}
            </Text>
            <Button
              size="compact-xs"
              variant="default"
              disabled={!mine || users.length < 2 || deskReason !== null}
              data-info={
                !primary
                  ? 'This object has no data.'
                  : users.length < 2
                    ? 'Only this object uses this data-block, so it is already single user.'
                    : 'Give this object its own copy, named as a variation. The other users keep the original.'
              }
              onClick={() => {
                if (mine) {
                  const result = ops.makeSingleUser(primary?.id ?? '', mine);
                  setMessage(result.ok ? '' : result.error);
                }
              }}
            >
              Make single user
            </Button>
          </Field>
          <Field label="Mapping">
            <SegmentedControl
              size="xs"
              aria-label="Mapping"
              data={MAPPING_OPTIONS}
              value={object?.mapping ?? 'loop'}
              disabled={lock('mapping') !== null}
              data-info={
                lock('mapping') ??
                'Loop repeats the data across the span. Stretch fits one cycle to it. One-shot plays it once.'
              }
              onChange={(value) => apply((list) => setMapping(list, id, value as ObjectMapping))}
            />
          </Field>
        </>
      )}
      <Field label="Mute">
        <Switch
          size="xs"
          aria-label="Mute"
          checked={object?.mute ?? collection?.mute ?? false}
          disabled={deskReason !== null}
          onChange={(event) => apply((list) => setMute(list, id, event.currentTarget.checked))}
        />
      </Field>
      <div className={classes.line} title={message || heardRefusal || ''} role="status">
        {message || heardRefusal || ''}
      </div>
    </section>
  );
}
