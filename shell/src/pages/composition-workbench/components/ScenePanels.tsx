import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Button,
  Menu,
  Popover,
  SegmentedControl,
  Select,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useCompositionSettings } from '../compositionSettings';
import { EnsureDataBlockOps, useDataBlockOps } from '../dataBlockOps';
import { dataBlockUsers } from '../dataBlocks/dataBlockRefs';
import {
  auditionRefusal,
  dataBlockTypes,
  type AuditionContext,
  type StoredDataBlock,
} from '../dataBlocks/registry';
import { newDataBlockId, useDesk } from '../desk';
import { recordGroup } from '../history';
import { formatLength, formatPosition, parseLength, parsePosition } from '../meterTime';
import { rationalToNumber, type Rational } from '../musicalTime';
import { transportRhythmContext } from '../rhythmRealization';
import { modifierProblems } from '../scene/evaluateScene';
import { HARMONIZE_ID, MELODICIZE_ID, getModifierDef, modifierDefs } from '../scene/modifiers';
import { outlinerRows, type OutlinerRow } from '../scene/outlinerRows';
import {
  addChildEmpty,
  addCollection,
  addEmpty,
  addModifier,
  applyAll,
  duplicateObject,
  duplicateObjectLinked,
  applyModifier,
  moveModifier,
  removeModifier,
  setModifierMute,
  setModifierParam,
  setModifierRef,
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
  type ModifierInstance,
  type ObjectMapping,
} from '../scene/sceneTypes';
import { useSceneEvaluation, useScenePlayback } from '../scene/useScenePlayback';
import { layerSound } from '../sounds';
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
      {object && <DuplicateButtons objectId={id} deskReason={deskReason} />}
      {object && (
        <ModifiersSection
          objectId={id}
          modifiers={object.modifiers}
          blocks={blocks}
          deskReason={deskReason}
          apply={apply}
        />
      )}
      <div className={classes.line} title={message || heardRefusal || ''} role="status">
        {message || heardRefusal || ''}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------- Modifiers */

/** A number the person typed, or null when it is not one. */
function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  return trimmed === '' || !Number.isFinite(value) ? null : value;
}

const ALLOCATION_OPTIONS = [
  { value: 'cycle', label: 'Cycle' },
  { value: 'cycle-rhythm', label: 'Cycle Rhythm' },
  { value: 'zip', label: 'Zip' },
  { value: 'cartesian', label: 'Cartesian' },
];

const APPLY_BELOW = 'Apply the modifiers above it first.';

/**
 * The modifier stack of the selected object (O3-ii, a thin slice): Add Modifier and Apply All on top,
 * then one card per modifier in stack order. Every edit is one op from `scene/sceneOps.ts` through the
 * panel's `apply`, which sends the refusal to the status line. Each card has the same slots whatever
 * is in them (a problem line that is always present), so nothing changes height on an edit.
 */
function ModifiersSection({
  objectId,
  modifiers,
  blocks,
  deskReason,
  apply,
}: {
  objectId: string;
  modifiers: ModifierInstance[];
  blocks: readonly StoredDataBlock[];
  deskReason: string | null;
  apply(run: (list: readonly StoredDataBlock[]) => SceneOpResult): string | null;
}) {
  const { settings } = useCompositionSettings();
  const pulseUnit = transportRhythmContext(settings.transport).pulseUnit;
  const rhythm = settings.sounds.rhythm;
  const context = useMemo(
    () => ({ pulseUnit, rhythmSound: layerSound(rhythm, 0) }),
    [pulseUnit, rhythm]
  );
  const problems = useMemo(
    () => modifierProblems(blocks, objectId, context),
    [blocks, objectId, context]
  );

  return (
    <div className={classes.modifiers}>
      <div className={classes.bar}>
        <span className={classes.heading}>Modifiers</span>
        <Menu position="bottom-end" withinPortal={false} transitionProps={{ duration: 0 }}>
          <Menu.Target>
            <Button
              size="compact-xs"
              variant="default"
              disabled={deskReason !== null}
              data-info={deskReason ?? 'Add a modifier at the bottom of the stack. It runs last.'}
            >
              Add Modifier <span aria-hidden>▾</span>
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {modifierDefs().map((def) => (
              <Menu.Item
                key={def.id}
                onClick={() => apply((list) => addModifier(list, newEnv(), objectId, def.id))}
              >
                {def.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <Button
          size="compact-xs"
          variant="default"
          disabled={deskReason !== null || modifiers.length === 0}
          data-info={
            deskReason ??
            (modifiers.length === 0
              ? 'There are no modifiers to apply.'
              : 'Bake the whole stack into a new Notes data-block and clear the stack.')
          }
          onClick={() => apply((list) => applyAll(list, newEnv(), objectId, context))}
        >
          Apply All
        </Button>
      </div>
      <div className={classes.cards}>
        {modifiers.map((modifier, index) => (
          <ModifierCard
            key={modifier.id}
            objectId={objectId}
            modifier={modifier}
            index={index}
            last={index === modifiers.length - 1}
            deskReason={deskReason}
            problem={problems.find((entry) => entry.modifierId === modifier.id)?.text ?? ''}
            context={context}
            blocks={blocks}
            apply={apply}
          />
        ))}
      </div>
    </div>
  );
}

function ModifierCard({
  objectId,
  modifier,
  index,
  last,
  deskReason,
  problem,
  context,
  blocks,
  apply,
}: {
  objectId: string;
  modifier: ModifierInstance;
  blocks: readonly StoredDataBlock[];
  index: number;
  last: boolean;
  deskReason: string | null;
  problem: string;
  context: AuditionContext;
  apply(run: (list: readonly StoredDataBlock[]) => SceneOpResult): string | null;
}) {
  const def = getModifierDef(modifier.type);
  if (!def) {
    return null;
  }
  const id = modifier.id;
  const params = modifier.params;
  const setParam = (key: string, value: unknown) =>
    apply((list) => setModifierParam(list, objectId, id, key, value));
  const numberField = (key: string, label: string, info: string) => (
    <Field label={label}>
      <CommitField
        ariaLabel={`${label} of ${def.label}`}
        value={String(params[key])}
        disabled={deskReason !== null}
        info={deskReason ?? info}
        onCommit={(text) => {
          const value = parseNumber(text);
          return value === null ? 'Enter a number.' : setParam(key, value);
        }}
      />
    </Field>
  );
  const applyReason =
    index > 0 ? APPLY_BELOW : modifier.mute ? 'Turn the modifier on to apply it.' : null;
  const upReason = index === 0 ? 'It is already at the top.' : null;
  const downReason = last ? 'It is already at the bottom.' : null;
  const hasPeriod = 'period' in params;

  return (
    <div className={`${classes.card} ${modifier.mute ? classes.cardMuted : ''}`}>
      <div className={classes.cardHead}>
        <span className={classes.cardName} title={def.label}>
          {def.label}
        </span>
        <Switch
          size="xs"
          aria-label={`${def.label} On`}
          checked={!modifier.mute}
          disabled={deskReason !== null}
          data-info={deskReason ?? 'Play this modifier. Off skips it.'}
          onChange={(event) =>
            apply((list) => setModifierMute(list, objectId, id, !event.currentTarget.checked))
          }
        />
        <Button
          size="compact-xs"
          variant="default"
          aria-label={`Move ${def.label} Up`}
          disabled={deskReason !== null || upReason !== null}
          data-info={deskReason ?? upReason ?? 'Move this modifier up. It runs earlier.'}
          onClick={() => apply((list) => moveModifier(list, objectId, id, 'up'))}
        >
          ▲
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          aria-label={`Move ${def.label} Down`}
          disabled={deskReason !== null || downReason !== null}
          data-info={deskReason ?? downReason ?? 'Move this modifier down. It runs later.'}
          onClick={() => apply((list) => moveModifier(list, objectId, id, 'down'))}
        >
          ▼
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          aria-label={`Apply ${def.label}`}
          disabled={deskReason !== null || index > 0}
          data-info={
            deskReason ??
            applyReason ??
            'Bake this modifier into a new Notes data-block and remove it from the stack.'
          }
          onClick={() => apply((list) => applyModifier(list, newEnv(), objectId, id, context))}
        >
          Apply
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          aria-label={`Remove ${def.label}`}
          disabled={deskReason !== null}
          data-info={deskReason ?? 'Remove this modifier from the stack.'}
          onClick={() => apply((list) => removeModifier(list, objectId, id))}
        >
          ✕
        </Button>
      </div>
      {def.refSlots.map((slot) => {
        const target = modifier.refs[slot.slot]
          ? blocks.find((block) => block.id === modifier.refs[slot.slot]?.id)
          : undefined;
        return (
          <Field key={slot.slot} label={slot.label}>
            <DataBlockMenu
              spec={{ accepts: [...slot.accepts] }}
              label={target?.name ?? 'None'}
              ariaLabel={`${slot.label} of ${def.label}`}
              info="The pitches this modifier works with. A Pitch set gives exact cents."
              selectedId={target?.id ?? null}
              disabledReason={deskReason}
              onPick={(row) =>
                apply((list) => setModifierRef(list, objectId, id, slot.slot, row.block.id))
              }
            />
            <Button
              size="compact-xs"
              variant="default"
              disabled={deskReason !== null || !modifier.refs[slot.slot]}
              data-info={
                deskReason ?? 'Clear the pitch set. The object is silent until one is chosen.'
              }
              onClick={() => apply((list) => setModifierRef(list, objectId, id, slot.slot, null))}
            >
              None
            </Button>
          </Field>
        );
      })}
      {modifier.type === MELODICIZE_ID && (
        <>
          <Field label="Allocation">
            <Select
              className={classes.grow}
              size="xs"
              aria-label={`Allocation of ${def.label}`}
              allowDeselect={false}
              disabled={deskReason !== null}
              data-info={deskReason ?? 'How the pitches are given to the rhythm attacks.'}
              data={ALLOCATION_OPTIONS}
              value={String(params.allocation)}
              onChange={(value) => value !== null && setParam('allocation', value)}
              comboboxProps={{ transitionProps: { duration: 0 } }}
            />
          </Field>
          {numberField(
            'articulationPercent',
            'Length %',
            'Note length as a percent of the time to the next attack, from 1 to 200.'
          )}
        </>
      )}
      {modifier.type === HARMONIZE_ID && (
        <>
          {numberField('voices', 'Voices', 'Pitches per note, from 2 to 8.')}
          {numberField('step', 'Step', 'Members skipped between added pitches, from 1 to 4.')}
        </>
      )}
      {hasPeriod && (
        <>
          <Field label="Repeat">
            <Switch
              size="xs"
              aria-label={`Repeat Every Octave of ${def.label}`}
              checked={params.repeat === true}
              disabled={deskReason !== null}
              data-info={
                deskReason ??
                'Repeat the pitch set every period. Off keeps only the listed pitches.'
              }
              onChange={(event) => setParam('repeat', event.currentTarget.checked)}
            />
          </Field>
          {numberField(
            'period',
            'Period',
            'Cents after which the pitch set repeats. Applies to a Pitch set only: a Pitch classes input always repeats at 1200.'
          )}
        </>
      )}
      <div className={classes.line} title={problem}>
        {problem}
      </div>
    </div>
  );
}

/**
 * Duplicate Object (independent: its own copy of the data-block) and Duplicate Linked (shares the
 * data-block), Blender's Shift+D and Alt+D. The copy lands in the same collection right after the
 * original, in the first free space after it in time, and becomes the selection.
 */
function DuplicateButtons({
  objectId,
  deskReason,
}: {
  objectId: string;
  deskReason: string | null;
}) {
  const editor = useSceneEditor();
  const { updateSession } = editor;
  const duplicate = (linked: boolean) => {
    const result = editor.commit((list) =>
      linked
        ? duplicateObjectLinked(list, newEnv(), objectId)
        : duplicateObject(list, newEnv(), objectId)
    );
    if (result.ok && result.created[0]) {
      updateSession({ selectedId: result.created[0] });
    }
  };
  return (
    <div className={classes.bar}>
      <Button
        size="compact-xs"
        variant="default"
        disabled={deskReason !== null}
        data-info={
          deskReason ?? 'Copy this object with its own copy of the data. It lands right after it.'
        }
        onClick={() => duplicate(false)}
      >
        Duplicate Object
      </Button>
      <Button
        size="compact-xs"
        variant="default"
        disabled={deskReason !== null}
        data-info={
          deskReason ?? 'Copy this object but share its data: an edit to the data shows in both.'
        }
        onClick={() => duplicate(true)}
      >
        Duplicate Linked
      </Button>
    </div>
  );
}
