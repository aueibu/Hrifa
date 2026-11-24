import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionIcon,
  AppShell,
  Group,
  MantineThemeProvider,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import {
  addWorkspace,
  buildStageRegistry,
  deleteWorkspace,
  DockStage,
  duplicateWorkspace,
  PanelsMenu,
  renameWorkspace,
  setActiveWorkspace,
  type StageApi,
} from '../components/Stage/dock';
import { Surface } from '../components/Surface/Surface';
import type { Workspace } from '../lib/stage';
import { AudioEngineProvider } from './composition-workbench/audio/AudioEngineProvider';
import { ChordPanelBridge } from './composition-workbench/chordInput/ChordPanelBridge';
import { compactWorkbenchTheme } from './composition-workbench/compactTheme';
import { CompositionCanvas } from './composition-workbench/components/CompositionCanvas';
import { CompositionInspector } from './composition-workbench/components/CompositionInspector';
import { CompositionSettingsPanel } from './composition-workbench/components/CompositionSettingsPanel';
import {
  BlankFloor,
  DataBlockEditorSlot,
  EditorTargetGuard,
} from './composition-workbench/components/DataBlockEditorSlot';
import { DeskView } from './composition-workbench/components/DeskView';
import { DeveloperMenu } from './composition-workbench/components/DeveloperMenu';
import { InfoBarActiveContext } from './composition-workbench/components/hoverInfo';
import { NodeInspectorSlotContext } from './composition-workbench/components/NodeHost';
import { ProjectMenu } from './composition-workbench/components/ProjectMenu';
import { TransportBar } from './composition-workbench/components/TransportBar';
import { WorkbenchStatusBar } from './composition-workbench/components/WorkbenchStatusBar';
import { nextFreePosition, type Position } from './composition-workbench/compositionLayout';
import type { CompositionOutputRef } from './composition-workbench/compositionRouting';
import { CompositionSettingsProvider } from './composition-workbench/compositionSettings';
import {
  acceptsCompositionInspectorTarget,
  acceptsCompositionInstances,
  acceptsNodeRouteStates,
  compositionInstanceLabel,
  createDefaultNodeRouteState,
  defaultCompositionInstances,
  defaultMixerPorts,
  migrateCompositionInstances,
  newMixerChannelId,
  type CompositionInspectorTarget,
  type CompositionNodeId,
  type CompositionNodeInstance,
  type NodeRouteStates,
} from './composition-workbench/compositionWorkspace';
import { DeskProvider } from './composition-workbench/desk';
import { recordChange, recordGroup } from './composition-workbench/history';
import { useStageBoxRem } from './composition-workbench/layout/useStageBoxRem';
import {
  WORKBENCH_KINDS,
  WorkbenchPanelsContext,
  type WorkbenchPanelNodes,
} from './composition-workbench/layout/workbenchPanels';
import {
  acceptsWorkspaceStore,
  bringPanelForward,
  DATA_BLOCK_EDITOR_PANEL,
  defaultWorkbenchWorkspaces,
  NODE_DETAIL_PANEL,
  parseStoredWorkspaces,
  workspaceForCanvas,
} from './composition-workbench/layout/workbenchWorkspaces';
import { PreviewRegistryProvider } from './composition-workbench/previewRegistry';
import { isReloading } from './composition-workbench/reloading';
import {
  createEvaluationStore,
  EvaluationStoreContext,
} from './composition-workbench/runtime/evaluationStore';
import { NodeEvaluationRunner } from './composition-workbench/runtime/NodeEvaluationRunner';
import { nodeEvaluators } from './composition-workbench/runtime/nodeEvaluators';
import { NodeInstanceHost } from './composition-workbench/runtime/NodeInstanceHost';
import { nodePorts } from './composition-workbench/runtime/nodePorts';
import { nodeRegistry } from './composition-workbench/runtime/nodeRegistry';
import { createOutputStore } from './composition-workbench/runtime/outputStore';
import { deleteState } from './composition-workbench/runtime/stateStore';
import { useOutputs } from './composition-workbench/runtime/useOutputs';
import { signalTypeFor, signalTypeRegistry } from './composition-workbench/signalTypes';
import {
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from './composition-workbench/usePersistentState';
import { WorkbenchSessions } from './composition-workbench/WorkbenchSessions';
import classes from './composition-workbench/CompositionWorkbench.module.css';

function uniqueId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

/**
 * Removes an instance's stored state and records each removed raw value in the history, so undoing
 * the delete can write them back before the node remounts (its hooks read storage only once).
 * Call inside recordGroup so the removal is one step with the instance list change.
 */
function removeCompositionInstanceStorage(instance: CompositionNodeInstance) {
  // A project open has already written the opened project's keys; removing any now would delete them.
  if (isReloading()) {
    return;
  }
  const keys = nodeRegistry[instance.nodeId].stateKeys.map((base) =>
    compositionInstanceStateKey(base, instance.id)
  );
  try {
    keys.forEach((key) => {
      const previous = localStorage.getItem(key);
      localStorage.removeItem(key);
      if (previous !== null) {
        recordChange({ key, previous, next: null }, { coalesce: false });
      }
    });
  } catch {
    // Removing the in-memory instance still succeeds when storage is unavailable.
  }
  // The store drops the keys and refuses writes to them until an undo restores the stored values, so a
  // late write from a view or runner that is still unmounting cannot bring the state back.
  keys.forEach(deleteState);
}

/** The workbench's panels, registered once: the Stage parks what is not showing (never display: none). */
const WORKBENCH_REGISTRY = buildStageRegistry(WORKBENCH_KINDS, []);

export function CompositionWorkbenchPage() {
  const [activeCompositionInstanceId, setActiveCompositionInstanceId] = usePersistentState<
    string | null
  >(
    compositionStateKeys.activeCompositionNode,
    'interference',
    (value): value is string | null => value === null || typeof value === 'string'
  );
  const [compositionInspectorTarget, setCompositionInspectorTarget] =
    usePersistentState<CompositionInspectorTarget>(
      compositionStateKeys.compositionInspectorTarget,
      { kind: 'node', instanceId: 'interference' },
      acceptsCompositionInspectorTarget
    );
  // The bottom panel targets a node (the active one) or, when this is set, a desk data-block.
  const [editorTarget, setEditorTarget] = usePersistentState<string | null>(
    compositionStateKeys.editorTarget,
    null,
    (value): value is string | null => value === null || typeof value === 'string'
  );
  const [compositionInstances, setCompositionInstances] = usePersistentState<
    CompositionNodeInstance[]
  >(
    compositionStateKeys.compositionInstances,
    defaultCompositionInstances,
    acceptsCompositionInstances,
    migrateCompositionInstances,
    // Add, remove and move are discrete actions, never merged with a neighbour.
    { coalesce: false }
  );
  // The inspector element the active node's setup controls are portaled into.
  const [nodeInspectorSlot, setNodeInspectorSlot] = useState<HTMLElement | null>(null);
  // The center's layout: this project's workspaces (Canvas, Desk, Edit and the person's own). A project with none
  // starts with the defaults; the key is never an undo step.
  const [workspaceStore, setWorkspaceStore] = usePersistentState(
    compositionStateKeys.workspaces,
    defaultWorkbenchWorkspaces,
    acceptsWorkspaceStore,
    parseStoredWorkspaces
  );
  const workspace: Workspace = workspaceStore.workspaces[workspaceStore.active];
  const updateWorkspace = useCallback(
    (fn: (s: Workspace) => Workspace) =>
      setWorkspaceStore((store) => {
        const current = store.workspaces[store.active];
        const next = fn(current);
        return next === current
          ? store
          : { ...store, workspaces: { ...store.workspaces, [store.active]: next } };
      }),
    [setWorkspaceStore]
  );
  // The Stage's functions, for the callbacks below (show a panel, which also expands its docker) and the Panels menu.
  const stageBox = useStageBoxRem();
  const stageApiRef = useRef<StageApi | null>(null);
  const [stageApi, setStageApi] = useState<StageApi | null>(null);
  const onStageApi = useCallback((api: StageApi | null) => {
    stageApiRef.current = api;
    setStageApi(api);
  }, []);
  const [inspectorOpen, setInspectorOpen] = usePersistentState<boolean>(
    compositionStateKeys.inspectorOpen,
    true,
    (value): value is boolean => typeof value === 'boolean'
  );
  // The settings panel is docked like the inspector and remembers whether it was open.
  const [settingsOpened, setSettingsOpened] = usePersistentState<boolean>(
    compositionStateKeys.settingsOpen,
    false,
    (value): value is boolean => typeof value === 'boolean'
  );
  // Published outputs live outside React: a publish reaches only the nodes that read them.
  const [outputStore] = useState(createOutputStore);
  // Each placed node's latest evaluation, written by its runner and read by its view.
  const [evaluationStore] = useState(createEvaluationStore);
  const publishedCompositionOutputs = useOutputs(outputStore);
  const [nodeRouteStates, setNodeRouteStates] = usePersistentState<NodeRouteStates>(
    compositionStateKeys.nodeRouteStates,
    { melodicization: createDefaultNodeRouteState(nodePorts.melodicization!) },
    acceptsNodeRouteStates
  );
  // While a data-block is open nothing else is selected: no node counts as active or highlighted.
  const nodeShown = editorTarget === null;
  const shownInstanceId = nodeShown ? activeCompositionInstanceId : null;
  const shownInspectorTarget = useMemo<CompositionInspectorTarget>(
    () => (nodeShown ? compositionInspectorTarget : { kind: 'canvas' }),
    [nodeShown, compositionInspectorTarget]
  );
  // The panel is blank when neither a data-block nor an existing node is open.
  const panelBlank =
    nodeShown && !compositionInstances.some((instance) => instance.id === shownInstanceId);

  // Undoing an add, or a stored id for a removed node, can leave the active node missing.
  // The panel then goes blank: no other node is ever promoted in its place.
  useEffect(() => {
    if (
      activeCompositionInstanceId !== null &&
      !compositionInstances.some((instance) => instance.id === activeCompositionInstanceId)
    ) {
      setActiveCompositionInstanceId(null);
    }
  }, [activeCompositionInstanceId, compositionInstances, setActiveCompositionInstanceId]);

  // The same for the inspector target (selection is not history, so this is never a step).
  useEffect(() => {
    if (
      compositionInspectorTarget.kind !== 'canvas' &&
      !compositionInstances.some(
        (instance) => instance.id === compositionInspectorTarget.instanceId
      )
    ) {
      setCompositionInspectorTarget({ kind: 'canvas' });
    }
  }, [compositionInspectorTarget, compositionInstances, setCompositionInspectorTarget]);

  // Outputs published by a node that is gone (an undone add) must not linger as sources.
  useEffect(() => {
    const live = compositionInstances.map((instance) => instance.id);
    outputStore.prune(live);
    evaluationStore.prune(live);
  }, [compositionInstances, outputStore, evaluationStore]);

  // The front tab of the Detail docker follows the exclusive target (a data-block, or a node): when the target flips, the
  // matching panel comes to the front in every workspace (expanding nothing). A click on the other tab does not change
  // the target, and stays until the target flips again.
  const editorOpen = editorTarget !== null;
  // Starts at the mount value, so a reload keeps the stored tab choice; the rule applies only when the target flips.
  const lastEditorOpen = useRef<boolean>(editorOpen);
  useEffect(() => {
    if (lastEditorOpen.current === editorOpen) {
      return;
    }
    lastEditorOpen.current = editorOpen;
    const panel = editorOpen ? DATA_BLOCK_EDITOR_PANEL : NODE_DETAIL_PANEL;
    setWorkspaceStore((store) => bringPanelForward(store, panel));
  }, [editorOpen, setWorkspaceStore]);

  // The latest data-block target, read by the stable bindNodePort below.
  const editorTargetRef = useRef(editorTarget);
  editorTargetRef.current = editorTarget;

  const bindNodePort = useCallback(
    (
      instanceId: string,
      nodeId: CompositionNodeId,
      port: string,
      source: CompositionOutputRef | null
    ) => {
      setNodeRouteStates((current) => {
        const ports = nodeRegistry[nodeId].ports ?? [];
        const receiver = current[instanceId] ?? createDefaultNodeRouteState(ports);
        const existing = receiver[port];
        const preferredSignalType =
          ports.find((candidate) => candidate.id === port)?.signalType ?? 'numeric';
        const sourcePacket = source ? outputStore.get(source)?.packet : undefined;
        // A port with its own declared preference (Melodicization's rhythm/pitch inlets) always
        // gets the Quick Adjust panel relevant to what IT expects, regardless of the connected
        // source's own domain — e.g. plugging Arithmetic's `duration`-domain output into the
        // Pitches inlet must still surface the Pitch Quick Adjust (with its "Read as MIDI notes"
        // conversion), not the Rhythm panel, even though `duration` alone would read as rhythm.
        // Only a port with no strong preference (Arithmetic's generic `numeric` A/B inlets)
        // defers to whatever the connected source actually is.
        const sourceSignalType = source ? signalTypeFor(sourcePacket) : preferredSignalType;
        const signalType =
          preferredSignalType === 'numeric' ? sourceSignalType : preferredSignalType;
        const treatment =
          existing && existing.signalType === signalType
            ? existing.treatment
            : signalTypeRegistry[signalType].default;
        return {
          ...current,
          [instanceId]: {
            ...receiver,
            [port]: { source: source ?? undefined, signalType, treatment },
          },
        };
      });
      // Wiring is not a request to open anything: while a data-block is open, leave what is open alone.
      if (editorTargetRef.current === null) {
        setCompositionInspectorTarget({ kind: 'route', instanceId, port });
        setActiveCompositionInstanceId(instanceId);
      }
    },
    [outputStore, setActiveCompositionInstanceId, setCompositionInspectorTarget, setNodeRouteStates]
  );

  const addMixerChannel = useCallback(
    (instanceId: string) => {
      setNodeRouteStates((current) => ({
        ...current,
        [instanceId]: {
          ...current[instanceId],
          ...createDefaultNodeRouteState([{ id: newMixerChannelId(), signalType: 'numeric' }]),
        },
      }));
    },
    [setNodeRouteStates]
  );

  const removeMixerChannel = useCallback(
    (instanceId: string, port: string) => {
      setNodeRouteStates((current) => {
        const receiver = current[instanceId];
        if (!receiver || !(port in receiver) || Object.keys(receiver).length <= 1) {
          return current;
        }
        return {
          ...current,
          [instanceId]: Object.fromEntries(
            Object.entries(receiver).filter(([key]) => key !== port)
          ),
        };
      });
      setCompositionInspectorTarget((target) =>
        target.kind === 'route' && target.instanceId === instanceId && target.port === port
          ? { kind: 'node', instanceId }
          : target
      );
    },
    [setCompositionInspectorTarget, setNodeRouteStates]
  );

  const updateRouteTreatment = useCallback(
    (instanceId: string, port: string, treatment: unknown) => {
      setNodeRouteStates((current) => {
        const receiver = current[instanceId];
        const binding = receiver?.[port];
        if (!receiver || !binding) {
          return current;
        }
        return { ...current, [instanceId]: { ...receiver, [port]: { ...binding, treatment } } };
      });
    },
    [setNodeRouteStates]
  );

  // Stable identities: the canvas memoizes its cards on these callbacks.
  const selectCompositionNode = useCallback(
    (instanceId: string) => {
      setActiveCompositionInstanceId(instanceId);
      setCompositionInspectorTarget({ kind: 'node', instanceId });
      setEditorTarget(null);
      // Opening a node brings its panel forward and expands its docker if it was collapsed.
      stageApiRef.current?.show(NODE_DETAIL_PANEL);
    },
    [setActiveCompositionInstanceId, setCompositionInspectorTarget, setEditorTarget]
  );
  const openDataBlockEditor = useCallback(
    (dataBlockId: string) => {
      setEditorTarget(dataBlockId);
      stageApiRef.current?.show(DATA_BLOCK_EDITOR_PANEL);
    },
    [setEditorTarget]
  );
  // The open data-block is gone: the panel goes blank (nothing open), not back to a node.
  const clearEditorTarget = useCallback(() => {
    setEditorTarget(null);
    setActiveCompositionInstanceId(null);
    setCompositionInspectorTarget({ kind: 'canvas' });
  }, [setEditorTarget, setActiveCompositionInstanceId, setCompositionInspectorTarget]);
  const selectCompositionRoute = useCallback(
    (instanceId: string, port: string) => {
      setActiveCompositionInstanceId(instanceId);
      setCompositionInspectorTarget({ kind: 'route', instanceId, port });
      setEditorTarget(null);
    },
    [setActiveCompositionInstanceId, setCompositionInspectorTarget, setEditorTarget]
  );

  function addCompositionNode(
    nodeId: CompositionNodeId,
    position?: Position,
    dataBlockId?: string
  ) {
    const instanceId = uniqueId(nodeId);
    // The instance and its route state are one undo step.
    recordGroup(() => {
      setCompositionInstances((current) => [
        ...current,
        {
          id: instanceId,
          nodeId,
          ...(position ?? nextFreePosition(current)),
          ...(dataBlockId ? { dataBlockId } : {}),
        },
      ]);
      const ports = nodeId === 'mixer' ? defaultMixerPorts() : nodeRegistry[nodeId].ports;
      if (ports) {
        setNodeRouteStates((current) => ({
          ...current,
          [instanceId]: createDefaultNodeRouteState(ports),
        }));
      }
    });
    selectCompositionNode(instanceId);
  }

  function removeCompositionNode(instanceId: string) {
    const removed = compositionInstances.find((candidate) => candidate.id === instanceId);
    if (!removed) {
      return;
    }
    const remaining = compositionInstances.filter((candidate) => candidate.id !== instanceId);
    // The instance, its route state and its stored per-node state are one undo step.
    recordGroup(() => {
      removeCompositionInstanceStorage(removed);
      setCompositionInstances(remaining);
      outputStore.prune(remaining.map((candidate) => candidate.id));
      evaluationStore.prune(remaining.map((candidate) => candidate.id));
      if (nodeRegistry[removed.nodeId].ports) {
        setNodeRouteStates((current) => {
          const next = { ...current };
          delete next[instanceId];
          return next;
        });
      }
    });
    // Whatever is open stays open; only removing the open node blanks the panel.
    if (instanceId === activeCompositionInstanceId) {
      setActiveCompositionInstanceId(null);
      setCompositionInspectorTarget({ kind: 'canvas' });
    }
  }

  // Used for both drops (one card or a whole selection) and Tidy.
  function placeCompositionNodes(positions: Record<string, Position>) {
    setCompositionInstances((current) =>
      current.map((instance) => ({ ...instance, ...(positions[instance.id] ?? {}) }))
    );
  }

  // What each panel shows; the Stage places them (workbenchPanels.tsx). They read the page's state as the old
  // split pane did, so a page render updates them.
  const panelNodes: WorkbenchPanelNodes = {
    canvas: (
      <>
        <CompositionCanvas
          activeInstanceId={shownInstanceId}
          selected={shownInspectorTarget}
          instances={compositionInstances}
          routes={nodeRouteStates}
          outputs={publishedCompositionOutputs}
          onSelectNode={selectCompositionNode}
          onSelectRoute={selectCompositionRoute}
          onSelectCanvas={() => setCompositionInspectorTarget({ kind: 'canvas' })}
          onMoveNodes={placeCompositionNodes}
          onTidy={placeCompositionNodes}
          onAddNode={addCompositionNode}
        />
      </>
    ),
    desk: (
      <DeskView
        onOpenDataBlock={(dataBlock) => openDataBlockEditor(dataBlock.id)}
        onMakeSource={(dataBlock) => {
          addCompositionNode('data-block-source', undefined, dataBlock.id);
          // Back to a workspace that shows the canvas, where the new source node appears.
          const target = workspaceForCanvas(workspaceStore);
          if (target !== null) {
            setWorkspaceStore((store) => setActiveWorkspace(store, target));
          }
        }}
      />
    ),
    nodeDetail: (
      <div className={classes.detailBody}>
        {panelBlank && <BlankFloor />}
        {compositionInstances.map((instance) => (
          <NodeInstanceHost
            key={instance.id}
            store={outputStore}
            instanceId={instance.id}
            nodeId={instance.nodeId}
            instanceLabel={compositionInstanceLabel(instance, compositionInstances)}
            dataBlockId={instance.dataBlockId}
            shown={shownInstanceId === instance.id}
            routeState={nodeRouteStates[instance.id]}
            onBind={bindNodePort}
            onAddChannel={addMixerChannel}
            onRemoveChannel={removeMixerChannel}
          />
        ))}
        {compositionInstances.length === 0 && (
          <Surface p="lg">
            <Title order={2} size="h4">
              No nodes placed
            </Title>
            <Text c="dimmed" size="sm" mt="xs">
              Use Add node on the canvas, or right-click it, to place one.
            </Text>
          </Surface>
        )}
      </div>
    ),
    dataBlockEditor: (
      <div className={classes.nodeHost}>
        <DataBlockEditorSlot dataBlockId={editorTarget} onMissing={clearEditorTarget} />
      </div>
    ),
  };

  return (
    <CompositionSettingsProvider>
      <DeskProvider>
        <AudioEngineProvider>
          <PreviewRegistryProvider>
            <MantineThemeProvider theme={compactWorkbenchTheme}>
              <InfoBarActiveContext.Provider value>
                <EvaluationStoreContext.Provider value={evaluationStore}>
                  <EditorTargetGuard dataBlockId={editorTarget} onMissing={clearEditorTarget} />
                  {/* Every placed node is evaluated and publishes here, whether or not its view is
                    mounted. Before the panels, so a view reads its evaluation on its first render. */}
                  {compositionInstances.map(
                    (instance) =>
                      instance.nodeId in nodeEvaluators && (
                        <NodeEvaluationRunner
                          key={instance.id}
                          outputStore={outputStore}
                          evaluationStore={evaluationStore}
                          instanceId={instance.id}
                          nodeId={instance.nodeId as keyof typeof nodeEvaluators}
                          instanceLabel={compositionInstanceLabel(instance, compositionInstances)}
                          dataBlockId={instance.dataBlockId}
                          routeState={nodeRouteStates[instance.id]}
                        />
                      )
                  )}
                  {/* The page-level sessions (chord, data-block editor, input scope, selection chain) sit
                    above the Stage and every editor, with no key, so nothing below remounts. */}
                  <WorkbenchSessions
                    inspectorTarget={shownInspectorTarget}
                    dataBlockId={editorTarget}
                  >
                    {/* Shows the Chords panel while the Chords tool wants it, and reports the person closing it. */}
                    <ChordPanelBridge workspace={workspace} api={stageApi} />
                    <AppShell
                      header={{ height: 56 }}
                      footer={{ height: 39 }}
                      padding="md"
                      className={classes.workbench}
                    >
                      <AppShell.Header>
                        <div className={classes.headerBar}>
                          <Group gap="xs" wrap="nowrap">
                            <Tooltip label="Back to Workbench">
                              <ActionIcon
                                component={Link}
                                to="/"
                                variant="subtle"
                                size="lg"
                                aria-label="Back to Workbench"
                              >
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  aria-hidden
                                >
                                  <path d="M15 18l-6-6 6-6" />
                                </svg>
                              </ActionIcon>
                            </Tooltip>
                            <Title order={1} className={classes.visuallyHidden}>
                              Composition Workbench
                            </Title>
                          </Group>
                          <TransportBar selectedInstanceId={shownInstanceId} />
                          <Group gap="xs" wrap="nowrap" justify="flex-end">
                            <DeveloperMenu />
                            <ProjectMenu />
                            <ColorSchemeToggle />
                          </Group>
                        </div>
                      </AppShell.Header>
                      <AppShell.Main
                        style={{ paddingBottom: 'var(--app-shell-footer-offset, 0px)' }}
                      >
                        <Stack gap="md">
                          <>
                            <div
                              className={classes.compositionWorkspace}
                              data-inspector={inspectorOpen}
                              data-settings={settingsOpened}
                            >
                              {inspectorOpen && (
                                <div className={classes.inspectorColumn}>
                                  <CompositionInspector
                                    selected={shownInspectorTarget}
                                    activeInstanceId={shownInstanceId}
                                    dataBlockId={editorTarget}
                                    outputs={publishedCompositionOutputs}
                                    instances={compositionInstances}
                                    routes={nodeRouteStates}
                                    onRemoveNode={removeCompositionNode}
                                    onNodeSlot={setNodeInspectorSlot}
                                    onRouteTreatment={updateRouteTreatment}
                                  />
                                </div>
                              )}
                              <div className={classes.stageColumn} ref={stageBox.ref}>
                                <NodeInspectorSlotContext.Provider value={nodeInspectorSlot}>
                                  <WorkbenchPanelsContext.Provider value={panelNodes}>
                                    <DockStage
                                      registry={WORKBENCH_REGISTRY}
                                      workspace={workspace}
                                      update={updateWorkspace}
                                      widthRem={stageBox.widthRem}
                                      heightRem={stageBox.heightRem}
                                      onApi={onStageApi}
                                    />
                                  </WorkbenchPanelsContext.Provider>
                                </NodeInspectorSlotContext.Provider>
                              </div>
                              {settingsOpened && (
                                <div className={classes.settingsColumn}>
                                  <CompositionSettingsPanel
                                    onClose={() => setSettingsOpened(false)}
                                  />
                                </div>
                              )}
                            </div>
                          </>
                        </Stack>
                      </AppShell.Main>
                      <AppShell.Footer>
                        <WorkbenchStatusBar
                          inspectorOpen={inspectorOpen}
                          onToggleInspector={() => setInspectorOpen((open) => !open)}
                          settingsOpen={settingsOpened}
                          onToggleSettings={() => setSettingsOpened((open) => !open)}
                          workspaces={{
                            store: workspaceStore,
                            onActivate: (id) =>
                              setWorkspaceStore((st) => setActiveWorkspace(st, id)),
                            onAdd: () => setWorkspaceStore((st) => addWorkspace(st)),
                            onRename: (id, name) =>
                              setWorkspaceStore((st) => renameWorkspace(st, id, name)),
                            onDuplicate: (id) =>
                              setWorkspaceStore((st) => duplicateWorkspace(st, id)),
                            onDelete: (id) => setWorkspaceStore((st) => deleteWorkspace(st, id)),
                          }}
                          panelsMenu={
                            <PanelsMenu
                              registry={WORKBENCH_REGISTRY.meta}
                              workspace={workspace}
                              api={stageApi}
                            />
                          }
                        />
                      </AppShell.Footer>
                    </AppShell>
                  </WorkbenchSessions>
                </EvaluationStoreContext.Provider>
              </InfoBarActiveContext.Provider>
            </MantineThemeProvider>
          </PreviewRegistryProvider>
        </AudioEngineProvider>
      </DeskProvider>
    </CompositionSettingsProvider>
  );
}
