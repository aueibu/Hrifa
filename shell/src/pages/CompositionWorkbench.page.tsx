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
  addScreenset,
  buildStageRegistry,
  deleteScreenset,
  DockStage,
  duplicateScreenset,
  PanelsMenu,
  renameScreenset,
  setActiveScreenset,
  type StageApi,
} from '../components/Stage/dock';
import { Surface } from '../components/Surface/Surface';
import type { Screenset } from '../lib/stage';
import { AudioEngineProvider } from './composition-workbench/audio/AudioEngineProvider';
import { ChordPanelBridge } from './composition-workbench/chordInput/ChordPanelBridge';
import { compactWorkbenchTheme } from './composition-workbench/compactTheme';
import {
  BlankFloor,
  ClipEditorSlot,
  ClipTargetGuard,
} from './composition-workbench/components/ClipEditorSlot';
import { CompositionCanvas } from './composition-workbench/components/CompositionCanvas';
import { CompositionInspector } from './composition-workbench/components/CompositionInspector';
import { CompositionSettingsPanel } from './composition-workbench/components/CompositionSettingsPanel';
import { DeskView } from './composition-workbench/components/DeskView';
import { DeveloperMenu } from './composition-workbench/components/DeveloperMenu';
import { InfoBarActiveContext } from './composition-workbench/components/hoverInfo';
import { ModuleInspectorSlotContext } from './composition-workbench/components/ModuleHost';
import { ProjectMenu } from './composition-workbench/components/ProjectMenu';
import { TransportBar } from './composition-workbench/components/TransportBar';
import { WorkbenchStatusBar } from './composition-workbench/components/WorkbenchStatusBar';
import { nextFreePosition, type Position } from './composition-workbench/compositionLayout';
import type { CompositionOutputRef } from './composition-workbench/compositionRouting';
import { CompositionSettingsProvider } from './composition-workbench/compositionSettings';
import {
  acceptsCompositionInspectorTarget,
  acceptsCompositionInstances,
  acceptsModuleRouteStates,
  compositionInstanceLabel,
  createDefaultModuleRouteState,
  defaultCompositionInstances,
  defaultMixerPorts,
  migrateCompositionInstances,
  newMixerChannelId,
  type CompositionInspectorTarget,
  type CompositionModuleId,
  type CompositionModuleInstance,
  type ModuleRouteStates,
} from './composition-workbench/compositionWorkspace';
import { DeskProvider } from './composition-workbench/desk';
import { evaluatePatch } from './composition-workbench/evaluator';
import { createDefaultPatch } from './composition-workbench/examples';
import { recordChange, recordGroup } from './composition-workbench/history';
import { useStageBoxRem } from './composition-workbench/layout/useStageBoxRem';
import {
  WORKBENCH_KINDS,
  WorkbenchPanelsContext,
  type WorkbenchPanelNodes,
} from './composition-workbench/layout/workbenchPanels';
import {
  acceptsScreensetStore,
  bringPanelForward,
  CLIP_EDITOR_PANEL,
  MODULE_DETAIL_PANEL,
  parseStoredScreensets,
  screensetForCanvas,
  seedStoreFromStorage,
} from './composition-workbench/layout/workbenchScreensets';
import type { PatchDocument } from './composition-workbench/model';
import { loadSavedPatch } from './composition-workbench/persistence';
import { PreviewRegistryProvider } from './composition-workbench/previewRegistry';
import { isReloading } from './composition-workbench/reloading';
import {
  createEvaluationStore,
  EvaluationStoreContext,
} from './composition-workbench/runtime/evaluationStore';
import { ModuleEvaluationRunner } from './composition-workbench/runtime/ModuleEvaluationRunner';
import { moduleEvaluators } from './composition-workbench/runtime/moduleEvaluators';
import { ModuleInstanceHost } from './composition-workbench/runtime/ModuleInstanceHost';
import { modulePorts } from './composition-workbench/runtime/modulePorts';
import { moduleRegistry } from './composition-workbench/runtime/moduleRegistry';
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
 * the delete can write them back before the module remounts (its hooks read storage only once).
 * Call inside recordGroup so the removal is one step with the instance list change.
 */
function removeCompositionInstanceStorage(instance: CompositionModuleInstance) {
  // A project open has already written the opened project's keys; removing any now would delete them.
  if (isReloading()) {
    return;
  }
  const keys = moduleRegistry[instance.moduleId].stateKeys.map((base) =>
    compositionInstanceStateKey(base, instance.id, instance.moduleId)
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
  const [patch] = useState<PatchDocument>(() => loadSavedPatch(createDefaultPatch));
  const [activeCompositionInstanceId, setActiveCompositionInstanceId] = usePersistentState<
    string | null
  >(
    compositionStateKeys.activeCompositionModule,
    'interference',
    (value): value is string | null => value === null || typeof value === 'string'
  );
  const [compositionInspectorTarget, setCompositionInspectorTarget] =
    usePersistentState<CompositionInspectorTarget>(
      compositionStateKeys.compositionInspectorTarget,
      { kind: 'module', instanceId: 'interference' },
      acceptsCompositionInspectorTarget
    );
  // The bottom panel targets a module (the active one) or, when this is set, a desk clip.
  const [editorClipTarget, setEditorClipTarget] = usePersistentState<string | null>(
    compositionStateKeys.editorClipTarget,
    null,
    (value): value is string | null => value === null || typeof value === 'string'
  );
  const [compositionInstances, setCompositionInstances] = usePersistentState<
    CompositionModuleInstance[]
  >(
    compositionStateKeys.compositionInstances,
    defaultCompositionInstances,
    acceptsCompositionInstances,
    migrateCompositionInstances,
    // Add, remove and move are discrete actions, never merged with a neighbour.
    { coalesce: false }
  );
  // The inspector element the active module's setup controls are portaled into.
  const [moduleInspectorSlot, setModuleInspectorSlot] = useState<HTMLElement | null>(null);
  // The center's layout: this project's screensets (Canvas, Desk, Edit and the person's own). A project with none
  // seeds them once from its old split, collapse and view keys; the key is never an undo step.
  const [screensetStore, setScreensetStore] = usePersistentState(
    compositionStateKeys.screensets,
    seedStoreFromStorage,
    acceptsScreensetStore,
    parseStoredScreensets
  );
  const screenset: Screenset = screensetStore.screensets[screensetStore.active];
  const updateScreenset = useCallback(
    (fn: (s: Screenset) => Screenset) =>
      setScreensetStore((store) => {
        const current = store.screensets[store.active];
        const next = fn(current);
        return next === current
          ? store
          : { ...store, screensets: { ...store.screensets, [store.active]: next } };
      }),
    [setScreensetStore]
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
  // Published outputs live outside React: a publish reaches only the modules that read them.
  const [outputStore] = useState(createOutputStore);
  // Each placed module's latest evaluation, written by its runner and read by its view.
  const [evaluationStore] = useState(createEvaluationStore);
  const publishedCompositionOutputs = useOutputs(outputStore);
  const [moduleRouteStates, setModuleRouteStates] = usePersistentState<ModuleRouteStates>(
    compositionStateKeys.moduleRouteStates,
    { melodicization: createDefaultModuleRouteState(modulePorts.melodicization!) },
    acceptsModuleRouteStates
  );
  const evaluation = useMemo(() => evaluatePatch(patch), [patch]);
  // While a clip is open nothing else is selected: no module counts as active or highlighted.
  const moduleShown = editorClipTarget === null;
  const shownInstanceId = moduleShown ? activeCompositionInstanceId : null;
  const shownInspectorTarget = useMemo<CompositionInspectorTarget>(
    () => (moduleShown ? compositionInspectorTarget : { kind: 'canvas' }),
    [moduleShown, compositionInspectorTarget]
  );
  // The panel is blank when neither a clip nor an existing module is open.
  const panelBlank =
    moduleShown && !compositionInstances.some((instance) => instance.id === shownInstanceId);

  // Undoing an add, or a stored id for a removed module, can leave the active module missing.
  // The panel then goes blank: no other module is ever promoted in its place.
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

  // Outputs published by a module that is gone (an undone add) must not linger as sources.
  useEffect(() => {
    const live = compositionInstances.map((instance) => instance.id);
    outputStore.prune(live);
    evaluationStore.prune(live);
  }, [compositionInstances, outputStore, evaluationStore]);

  // The front tab of the Detail docker follows the exclusive target (a clip, or a module): when the target flips, the
  // matching panel comes to the front in every screenset (expanding nothing). A click on the other tab does not change
  // the target, and stays until the target flips again.
  const clipOpen = editorClipTarget !== null;
  // Starts at the mount value, so a reload keeps the stored tab choice; the rule applies only when the target flips.
  const lastClipOpen = useRef<boolean>(clipOpen);
  useEffect(() => {
    if (lastClipOpen.current === clipOpen) {
      return;
    }
    lastClipOpen.current = clipOpen;
    const panel = clipOpen ? CLIP_EDITOR_PANEL : MODULE_DETAIL_PANEL;
    setScreensetStore((store) => bringPanelForward(store, panel));
  }, [clipOpen, setScreensetStore]);

  // The latest clip target, read by the stable bindModulePort below.
  const editorClipTargetRef = useRef(editorClipTarget);
  editorClipTargetRef.current = editorClipTarget;

  const bindModulePort = useCallback(
    (
      instanceId: string,
      moduleId: CompositionModuleId,
      port: string,
      source: CompositionOutputRef | null
    ) => {
      setModuleRouteStates((current) => {
        const ports = moduleRegistry[moduleId].ports ?? [];
        const receiver = current[instanceId] ?? createDefaultModuleRouteState(ports);
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
      // Wiring is not a request to open anything: while a clip is open, leave what is open alone.
      if (editorClipTargetRef.current === null) {
        setCompositionInspectorTarget({ kind: 'route', instanceId, port });
        setActiveCompositionInstanceId(instanceId);
      }
    },
    [
      outputStore,
      setActiveCompositionInstanceId,
      setCompositionInspectorTarget,
      setModuleRouteStates,
    ]
  );

  const addMixerChannel = useCallback(
    (instanceId: string) => {
      setModuleRouteStates((current) => ({
        ...current,
        [instanceId]: {
          ...current[instanceId],
          ...createDefaultModuleRouteState([{ id: newMixerChannelId(), signalType: 'numeric' }]),
        },
      }));
    },
    [setModuleRouteStates]
  );

  const removeMixerChannel = useCallback(
    (instanceId: string, port: string) => {
      setModuleRouteStates((current) => {
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
          ? { kind: 'module', instanceId }
          : target
      );
    },
    [setCompositionInspectorTarget, setModuleRouteStates]
  );

  const updateRouteTreatment = useCallback(
    (instanceId: string, port: string, treatment: unknown) => {
      setModuleRouteStates((current) => {
        const receiver = current[instanceId];
        const binding = receiver?.[port];
        if (!receiver || !binding) {
          return current;
        }
        return { ...current, [instanceId]: { ...receiver, [port]: { ...binding, treatment } } };
      });
    },
    [setModuleRouteStates]
  );

  // Stable identities: the canvas memoizes its cards on these callbacks.
  const selectCompositionModule = useCallback(
    (instanceId: string) => {
      setActiveCompositionInstanceId(instanceId);
      setCompositionInspectorTarget({ kind: 'module', instanceId });
      setEditorClipTarget(null);
      // Opening a module brings its panel forward and expands its docker if it was collapsed.
      stageApiRef.current?.show(MODULE_DETAIL_PANEL);
    },
    [setActiveCompositionInstanceId, setCompositionInspectorTarget, setEditorClipTarget]
  );
  const openClipEditor = useCallback(
    (snippetId: string) => {
      setEditorClipTarget(snippetId);
      stageApiRef.current?.show(CLIP_EDITOR_PANEL);
    },
    [setEditorClipTarget]
  );
  // The open clip is gone: the panel goes blank (nothing open), not back to a module.
  const clearClipTarget = useCallback(() => {
    setEditorClipTarget(null);
    setActiveCompositionInstanceId(null);
    setCompositionInspectorTarget({ kind: 'canvas' });
  }, [setEditorClipTarget, setActiveCompositionInstanceId, setCompositionInspectorTarget]);
  const selectCompositionRoute = useCallback(
    (instanceId: string, port: string) => {
      setActiveCompositionInstanceId(instanceId);
      setCompositionInspectorTarget({ kind: 'route', instanceId, port });
      setEditorClipTarget(null);
    },
    [setActiveCompositionInstanceId, setCompositionInspectorTarget, setEditorClipTarget]
  );

  function addCompositionModule(
    moduleId: CompositionModuleId,
    position?: Position,
    snippetId?: string
  ) {
    const instanceId = uniqueId(moduleId);
    // The instance and its route state are one undo step.
    recordGroup(() => {
      setCompositionInstances((current) => [
        ...current,
        {
          id: instanceId,
          moduleId,
          ...(position ?? nextFreePosition(current)),
          ...(snippetId ? { snippetId } : {}),
        },
      ]);
      const ports = moduleId === 'mixer' ? defaultMixerPorts() : moduleRegistry[moduleId].ports;
      if (ports) {
        setModuleRouteStates((current) => ({
          ...current,
          [instanceId]: createDefaultModuleRouteState(ports),
        }));
      }
    });
    selectCompositionModule(instanceId);
  }

  function removeCompositionModule(instanceId: string) {
    const removed = compositionInstances.find((candidate) => candidate.id === instanceId);
    if (!removed) {
      return;
    }
    const remaining = compositionInstances.filter((candidate) => candidate.id !== instanceId);
    // The instance, its route state and its stored per-module state are one undo step.
    recordGroup(() => {
      removeCompositionInstanceStorage(removed);
      setCompositionInstances(remaining);
      outputStore.prune(remaining.map((candidate) => candidate.id));
      evaluationStore.prune(remaining.map((candidate) => candidate.id));
      if (moduleRegistry[removed.moduleId].ports) {
        setModuleRouteStates((current) => {
          const next = { ...current };
          delete next[instanceId];
          return next;
        });
      }
    });
    // Whatever is open stays open; only removing the open module blanks the panel.
    if (instanceId === activeCompositionInstanceId) {
      setActiveCompositionInstanceId(null);
      setCompositionInspectorTarget({ kind: 'canvas' });
    }
  }

  // Used for both drops (one card or a whole selection) and Tidy.
  function placeCompositionModules(positions: Record<string, Position>) {
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
          routes={moduleRouteStates}
          outputs={publishedCompositionOutputs}
          onSelectModule={selectCompositionModule}
          onSelectRoute={selectCompositionRoute}
          onSelectCanvas={() => setCompositionInspectorTarget({ kind: 'canvas' })}
          onMoveModules={placeCompositionModules}
          onTidy={placeCompositionModules}
          onAddModule={addCompositionModule}
        />
      </>
    ),
    desk: (
      <DeskView
        onOpenClip={(snippet) => openClipEditor(snippet.id)}
        onMakeSource={(snippet) => {
          addCompositionModule('snippet', undefined, snippet.id);
          // Back to a screenset that shows the canvas, where the new source module appears.
          const target = screensetForCanvas(screensetStore);
          if (target !== null) {
            setScreensetStore((store) => setActiveScreenset(store, target));
          }
        }}
      />
    ),
    moduleDetail: (
      <div className={classes.detailBody}>
        {panelBlank && <BlankFloor />}
        {compositionInstances.map((instance) => (
          <ModuleInstanceHost
            key={instance.id}
            store={outputStore}
            instanceId={instance.id}
            moduleId={instance.moduleId}
            instanceLabel={compositionInstanceLabel(instance, compositionInstances)}
            snippetId={instance.snippetId}
            shown={shownInstanceId === instance.id}
            routeState={moduleRouteStates[instance.id]}
            onBind={bindModulePort}
            onAddChannel={addMixerChannel}
            onRemoveChannel={removeMixerChannel}
          />
        ))}
        {compositionInstances.length === 0 && (
          <Surface p="lg">
            <Title order={2} size="h4">
              No modules placed
            </Title>
            <Text c="dimmed" size="sm" mt="xs">
              Use Add module on the canvas, or right-click it, to place one.
            </Text>
          </Surface>
        )}
      </div>
    ),
    clipEditor: (
      <div className={classes.moduleHost}>
        <ClipEditorSlot snippetId={editorClipTarget} onMissing={clearClipTarget} />
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
                  <ClipTargetGuard snippetId={editorClipTarget} onMissing={clearClipTarget} />
                  {/* Every placed module is evaluated and publishes here, whether or not its view is
                    mounted. Before the panels, so a view reads its evaluation on its first render. */}
                  {compositionInstances.map(
                    (instance) =>
                      instance.moduleId in moduleEvaluators && (
                        <ModuleEvaluationRunner
                          key={instance.id}
                          outputStore={outputStore}
                          evaluationStore={evaluationStore}
                          instanceId={instance.id}
                          moduleId={instance.moduleId as keyof typeof moduleEvaluators}
                          instanceLabel={compositionInstanceLabel(instance, compositionInstances)}
                          snippetId={instance.snippetId}
                          routeState={moduleRouteStates[instance.id]}
                        />
                      )
                  )}
                  {/* The page-level sessions (chord, clip editor, input scope, selection chain) sit
                    above the Stage and every editor, with no key, so nothing below remounts. */}
                  <WorkbenchSessions
                    inspectorTarget={shownInspectorTarget}
                    clipId={editorClipTarget}
                  >
                    {/* Shows the Chords panel while the Chords tool wants it, and reports the person closing it. */}
                    <ChordPanelBridge screenset={screenset} api={stageApi} />
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
                          {evaluation.errors.map((error) => (
                            <Surface key={error} p="sm">
                              <Text c="red">{error}</Text>
                            </Surface>
                          ))}

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
                                    clipId={editorClipTarget}
                                    outputs={publishedCompositionOutputs}
                                    instances={compositionInstances}
                                    routes={moduleRouteStates}
                                    onRemoveModule={removeCompositionModule}
                                    onModuleSlot={setModuleInspectorSlot}
                                    onRouteTreatment={updateRouteTreatment}
                                  />
                                </div>
                              )}
                              <div className={classes.stageColumn} ref={stageBox.ref}>
                                <ModuleInspectorSlotContext.Provider value={moduleInspectorSlot}>
                                  <WorkbenchPanelsContext.Provider value={panelNodes}>
                                    <DockStage
                                      registry={WORKBENCH_REGISTRY}
                                      screenset={screenset}
                                      update={updateScreenset}
                                      widthRem={stageBox.widthRem}
                                      heightRem={stageBox.heightRem}
                                      onApi={onStageApi}
                                    />
                                  </WorkbenchPanelsContext.Provider>
                                </ModuleInspectorSlotContext.Provider>
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
                          screensets={{
                            store: screensetStore,
                            onActivate: (id) =>
                              setScreensetStore((st) => setActiveScreenset(st, id)),
                            onAdd: () => setScreensetStore((st) => addScreenset(st)),
                            onRename: (id, name) =>
                              setScreensetStore((st) => renameScreenset(st, id, name)),
                            onDuplicate: (id) =>
                              setScreensetStore((st) => duplicateScreenset(st, id)),
                            onDelete: (id) => setScreensetStore((st) => deleteScreenset(st, id)),
                          }}
                          panelsMenu={
                            <PanelsMenu
                              registry={WORKBENCH_REGISTRY.meta}
                              screenset={screenset}
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
