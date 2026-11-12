import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Surface } from '../components/Surface/Surface';
import { AudioEngineProvider } from './composition-workbench/audio/AudioEngineProvider';
import { compactWorkbenchTheme } from './composition-workbench/compactTheme';
import { ArithmeticModule } from './composition-workbench/components/ArithmeticModule';
import { CompositionCanvas } from './composition-workbench/components/CompositionCanvas';
import { CompositionInspector } from './composition-workbench/components/CompositionInspector';
import { CompositionSettingsPanel } from './composition-workbench/components/CompositionSettingsPanel';
import { DeskView } from './composition-workbench/components/DeskView';
import { DeveloperMenu } from './composition-workbench/components/DeveloperMenu';
import { FractioningModule } from './composition-workbench/components/FractioningModule';
import { HouseholderModule } from './composition-workbench/components/HouseholderModule';
import { InfoBarActiveContext } from './composition-workbench/components/hoverInfo';
import { InterferenceModule } from './composition-workbench/components/InterferenceModule';
import { MelodicizationModule } from './composition-workbench/components/MelodicizationModule';
import { MixerModule } from './composition-workbench/components/MixerModule';
import {
  ModuleActiveContext,
  ModuleInspectorSlotContext,
} from './composition-workbench/components/ModuleHost';
import { PairCompositionModule } from './composition-workbench/components/PairCompositionModule';
import { PitchListModule } from './composition-workbench/components/PitchListModule';
import { ProjectMenu } from './composition-workbench/components/ProjectMenu';
import { RhythmEditModule } from './composition-workbench/components/RhythmEditModule';
import { RhythmListModule } from './composition-workbench/components/RhythmListModule';
import { ScaleConstructionModule } from './composition-workbench/components/ScaleConstructionModule';
import { ScaleEvolutionModule } from './composition-workbench/components/ScaleEvolutionModule';
import { SnippetSourceModule } from './composition-workbench/components/SnippetSourceModule';
import { SplitStage, clampSplit } from './composition-workbench/components/SplitStage';
import { SwirlingMistsModule } from './composition-workbench/components/SwirlingMistsModule';
import { TransportBar } from './composition-workbench/components/TransportBar';
import {
  WorkbenchStatusBar,
  type WorkspaceView,
} from './composition-workbench/components/WorkbenchStatusBar';
import { nextFreePosition, type Position } from './composition-workbench/compositionLayout';
import {
  outputRefKey,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from './composition-workbench/compositionRouting';
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
import type { PatchDocument } from './composition-workbench/model';
import { loadSavedPatch } from './composition-workbench/persistence';
import { PreviewRegistryProvider } from './composition-workbench/previewRegistry';
import { isReloading } from './composition-workbench/reloading';
import {
  signalTypeFor,
  signalTypeRegistry,
  type SignalTypeId,
} from './composition-workbench/signalTypes';
import {
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from './composition-workbench/usePersistentState';
import classes from './composition-workbench/CompositionWorkbench.module.css';

function uniqueId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

const instanceStateKeys: Record<CompositionModuleId, string[]> = {
  // A snippet module keeps nothing of its own: the desk owns the material.
  snippet: [],
  interference: [
    compositionStateKeys.interferenceDrafts,
    compositionStateKeys.interferenceGrouping,
    compositionStateKeys.interferenceUnit,
    compositionStateKeys.interferenceVolume,
    compositionStateKeys.interferenceMetronome,
    compositionStateKeys.interferenceMetronomeVolume,
  ],
  'rhythm-edit': [
    compositionStateKeys.rhythmEditPattern,
    compositionStateKeys.rhythmEditMode,
    compositionStateKeys.rhythmEditRules,
    compositionStateKeys.rhythmEditLengths,
    compositionStateKeys.rhythmEditGrouping,
    compositionStateKeys.rhythmEditAudition,
    compositionStateKeys.rhythmEditShowTracks,
    compositionStateKeys.rhythmEditFollow,
    compositionStateKeys.rhythmEditCellWidth,
    compositionStateKeys.rhythmEditSettings,
    compositionStateKeys.rhythmEditSound,
    compositionStateKeys.rhythmEditVolume,
  ],
  'rhythm-list': [
    compositionStateKeys.rhythmListText,
    compositionStateKeys.rhythmListLoop,
    compositionStateKeys.rhythmListSound,
    compositionStateKeys.rhythmListVolume,
  ],
  'pitch-list': [
    compositionStateKeys.pitchFormat,
    compositionStateKeys.pitchConvertOnChange,
    compositionStateKeys.pitchValues,
    compositionStateKeys.pitchCatalogOrigins,
    compositionStateKeys.pitchStep,
    compositionStateKeys.pitchGate,
    compositionStateKeys.pitchOctave,
    compositionStateKeys.pitchVolume,
  ],
  melodicization: [
    compositionStateKeys.melodicizationAllocation,
    compositionStateKeys.melodicizationPulse,
    compositionStateKeys.melodicizationArticulation,
    compositionStateKeys.melodicizationTempo,
    compositionStateKeys.melodicizationMeter,
    compositionStateKeys.melodicizationVolume,
    compositionStateKeys.melodicizationPianoRollView,
    compositionStateKeys.melodicizationInspector,
  ],
  arithmetic: [
    compositionStateKeys.arithmeticOperator,
    compositionStateKeys.arithmeticFallbackA,
    compositionStateKeys.arithmeticFallbackB,
    compositionStateKeys.arithmeticCombineStrategy,
    compositionStateKeys.arithmeticModulo,
  ],
  fractioning: [
    compositionStateKeys.fractioningA,
    compositionStateKeys.fractioningB,
    compositionStateKeys.fractioningUnit,
    compositionStateKeys.fractioningVolume,
    compositionStateKeys.fractioningMidiNote,
    compositionStateKeys.fractioningSound,
  ],
  'pair-composition': [
    compositionStateKeys.pairCompositionA,
    compositionStateKeys.pairCompositionB,
    compositionStateKeys.pairCompositionMode,
    compositionStateKeys.pairCompositionUnit,
    compositionStateKeys.pairCompositionVolume,
    compositionStateKeys.pairCompositionMidiNote,
    compositionStateKeys.pairCompositionSound,
  ],
  'scale-construction': [
    compositionStateKeys.scaleConstructionIntervals,
    compositionStateKeys.scaleConstructionRoot,
    compositionStateKeys.scaleConstructionPermutationMode,
    `${compositionStateKeys.scaleConstructionIntervals}.text`,
  ],
  'scale-evolution': [
    compositionStateKeys.scaleEvolutionIntervals,
    compositionStateKeys.scaleEvolutionRoot,
  ],
  'rhythm-householder': [
    compositionStateKeys.householderSettings,
    compositionStateKeys.householderSelected,
    compositionStateKeys.householderUnit,
    compositionStateKeys.householderVolume,
    compositionStateKeys.householderSounds,
  ],
  'swirling-mists': [
    compositionStateKeys.mistSettings,
    compositionStateKeys.mistStep,
    compositionStateKeys.mistGate,
    compositionStateKeys.mistVolume,
    compositionStateKeys.mistViewSpan,
    compositionStateKeys.mistRunSpeed,
  ],
  mixer: [
    compositionStateKeys.mixerChannels,
    compositionStateKeys.mixerVolume,
    compositionStateKeys.mixerRollView,
    compositionStateKeys.mixerRollMode,
    compositionStateKeys.mixerLaneScale,
  ],
};

// The mixer's inlets are its channels, which the receiver's route state owns, so it declares none
// here; an empty list still marks it as a routed module.
const routedModulePorts: Partial<
  Record<CompositionModuleId, { id: string; signalType: SignalTypeId }[]>
> = {
  mixer: [],
  melodicization: [
    { id: 'rhythm', signalType: 'rhythm' },
    { id: 'pitches', signalType: 'pitch' },
  ],
  arithmetic: [
    { id: 'a', signalType: 'numeric' },
    { id: 'b', signalType: 'numeric' },
  ],
  'scale-evolution': [{ id: 'sequence', signalType: 'numeric' }],
  'rhythm-householder': [
    { id: 'rhythm', signalType: 'rhythm' },
    { id: 'axis', signalType: 'numeric' },
  ],
  'rhythm-edit': [{ id: 'rhythm', signalType: 'rhythm' }],
};

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
  try {
    instanceStateKeys[instance.moduleId].forEach((base) => {
      const key = compositionInstanceStateKey(base, instance.id, instance.moduleId);
      const previous = localStorage.getItem(key);
      localStorage.removeItem(key);
      if (previous !== null) {
        recordChange({ key, previous, next: null }, { coalesce: false });
      }
    });
  } catch {
    // Removing the in-memory instance still succeeds when storage is unavailable.
  }
}

/**
 * The view that is not showing. visibility alone is not enough: the canvas's own elements set
 * `visibility: visible`, which wins over a hidden parent, so its nodes showed through the desk.
 * Opacity hides everything under it, and pointer-events keeps it from taking clicks.
 */
const inactiveViewStyle = { opacity: 0, pointerEvents: 'none', visibility: 'hidden' } as const;

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
  const [canvasSplit, setCanvasSplit] = usePersistentState<number>(
    compositionStateKeys.canvasSplit,
    0.6,
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  const [detailCollapsed, setDetailCollapsed] = usePersistentState<boolean>(
    compositionStateKeys.detailCollapsed,
    false,
    (value): value is boolean => typeof value === 'boolean'
  );
  const [workspaceView, setWorkspaceView] = usePersistentState<WorkspaceView>(
    compositionStateKeys.workspaceView,
    'canvas',
    (value): value is WorkspaceView => value === 'canvas' || value === 'desk'
  );
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
  const [compositionOutputs, setCompositionOutputs] = useState<
    Record<string, PublishedCompositionOutput>
  >({});
  const [moduleRouteStates, setModuleRouteStates] = usePersistentState<ModuleRouteStates>(
    compositionStateKeys.moduleRouteStates,
    { melodicization: createDefaultModuleRouteState(routedModulePorts.melodicization!) },
    acceptsModuleRouteStates
  );
  const evaluation = useMemo(() => evaluatePatch(patch), [patch]);

  // Undoing an add, or a stored id for a removed module, can leave the active module missing.
  useEffect(() => {
    if (
      activeCompositionInstanceId !== null &&
      !compositionInstances.some((instance) => instance.id === activeCompositionInstanceId)
    ) {
      setActiveCompositionInstanceId(compositionInstances[0]?.id ?? null);
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
    setCompositionOutputs((current) => {
      const live = Object.entries(current).filter(([, output]) =>
        compositionInstances.some((instance) => instance.id === output.ref.instanceId)
      );
      return live.length === Object.keys(current).length ? current : Object.fromEntries(live);
    });
  }, [compositionInstances]);

  const reconcileCompositionOutputs = useCallback(
    (instanceId: string, outputs: PublishedCompositionOutput[]) => {
      setCompositionOutputs((current) => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([, output]) => output.ref.instanceId !== instanceId)
        ) as Record<string, PublishedCompositionOutput>;
        outputs.forEach((output) => {
          next[outputRefKey(output.ref)] = output;
        });
        const currentKeys = Object.keys(current);
        const nextKeys = Object.keys(next);
        return currentKeys.length === nextKeys.length &&
          nextKeys.every(
            (key) =>
              current[key]?.packet === next[key].packet && current[key]?.label === next[key].label
          )
          ? current
          : next;
      });
    },
    []
  );

  const bindModulePort = useCallback(
    (
      instanceId: string,
      moduleId: CompositionModuleId,
      port: string,
      source: CompositionOutputRef | null
    ) => {
      setModuleRouteStates((current) => {
        const ports = routedModulePorts[moduleId] ?? [];
        const receiver = current[instanceId] ?? createDefaultModuleRouteState(ports);
        const existing = receiver[port];
        const preferredSignalType =
          ports.find((candidate) => candidate.id === port)?.signalType ?? 'numeric';
        const sourcePacket = source ? compositionOutputs[outputRefKey(source)]?.packet : undefined;
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
      setCompositionInspectorTarget({ kind: 'route', instanceId, port });
      setActiveCompositionInstanceId(instanceId);
    },
    [
      compositionOutputs,
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

  const publishedCompositionOutputs = Object.values(compositionOutputs);

  // Stable identities: the canvas memoizes its cards on these callbacks.
  const selectCompositionModule = useCallback(
    (instanceId: string) => {
      setActiveCompositionInstanceId(instanceId);
      setCompositionInspectorTarget({ kind: 'module', instanceId });
      // Opening a module brings its editor back if the detail panel was collapsed.
      setDetailCollapsed(false);
    },
    [setActiveCompositionInstanceId, setCompositionInspectorTarget, setDetailCollapsed]
  );
  const selectCompositionRoute = useCallback(
    (instanceId: string, port: string) => {
      setActiveCompositionInstanceId(instanceId);
      setCompositionInspectorTarget({ kind: 'route', instanceId, port });
    },
    [setActiveCompositionInstanceId, setCompositionInspectorTarget]
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
      const ports = moduleId === 'mixer' ? defaultMixerPorts() : routedModulePorts[moduleId];
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
      if (routedModulePorts[removed.moduleId]) {
        setModuleRouteStates((current) => {
          const next = { ...current };
          delete next[instanceId];
          return next;
        });
      }
    });
    setCompositionOutputs((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, output]) => output.ref.instanceId !== instanceId)
      )
    );
    if (remaining[0]) {
      selectCompositionModule(remaining[0].id);
    } else {
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

  return (
    <CompositionSettingsProvider>
      <DeskProvider>
        <AudioEngineProvider>
          <PreviewRegistryProvider>
            <MantineThemeProvider theme={compactWorkbenchTheme}>
              <InfoBarActiveContext.Provider value>
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
                      <TransportBar selectedInstanceId={activeCompositionInstanceId} />
                      <Group gap="xs" wrap="nowrap" justify="flex-end">
                        <DeveloperMenu />
                        <ProjectMenu />
                        <ColorSchemeToggle />
                      </Group>
                    </div>
                  </AppShell.Header>
                  <AppShell.Main style={{ paddingBottom: 'var(--app-shell-footer-offset, 0px)' }}>
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
                                selected={compositionInspectorTarget}
                                activeInstanceId={activeCompositionInstanceId}
                                outputs={publishedCompositionOutputs}
                                instances={compositionInstances}
                                routes={moduleRouteStates}
                                onRemoveModule={removeCompositionModule}
                                onModuleSlot={setModuleInspectorSlot}
                                onRouteTreatment={updateRouteTreatment}
                              />
                            </div>
                          )}
                          <SplitStage
                            split={clampSplit(canvasSplit)}
                            onSplit={setCanvasSplit}
                            collapsed={detailCollapsed}
                            onCollapsed={setDetailCollapsed}
                            top={
                              <div style={{ display: 'grid', flex: 1, minHeight: 0 }}>
                                {/*
                        Both stay mounted and share one grid cell. The inactive one is only
                        visibility:hidden, never display:none, because the canvas measures its box:
                        collapsing it to zero made it refit to a tiny view when shown again.
                      */}
                                <div
                                  // Height 0 with a full-height minimum: the desk fills the cell but never
                                  // makes the row taller, so it scrolls instead of resizing the canvas.
                                  style={{
                                    gridArea: '1 / 1',
                                    height: 0,
                                    minHeight: '100%',
                                    minWidth: 0,
                                    overflow: 'hidden',
                                    ...(workspaceView === 'desk'
                                      ? { zIndex: 1 }
                                      : inactiveViewStyle),
                                  }}
                                  inert={workspaceView !== 'desk'}
                                >
                                  <DeskView
                                    onMakeSource={(snippet) => {
                                      addCompositionModule('snippet', undefined, snippet.id);
                                      setWorkspaceView('canvas');
                                    }}
                                  />
                                </div>
                                <div
                                  style={{
                                    // A flex column, as the stage's top pane was: the canvas fills it with flex: 1.
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gridArea: '1 / 1',
                                    minHeight: 0,
                                    minWidth: 0,
                                    ...(workspaceView === 'canvas'
                                      ? { zIndex: 1 }
                                      : inactiveViewStyle),
                                  }}
                                  inert={workspaceView !== 'canvas'}
                                >
                                  <CompositionCanvas
                                    activeInstanceId={activeCompositionInstanceId}
                                    selected={compositionInspectorTarget}
                                    instances={compositionInstances}
                                    routes={moduleRouteStates}
                                    outputs={publishedCompositionOutputs}
                                    onSelectModule={selectCompositionModule}
                                    onSelectRoute={selectCompositionRoute}
                                    onSelectCanvas={() =>
                                      setCompositionInspectorTarget({ kind: 'canvas' })
                                    }
                                    onMoveModules={placeCompositionModules}
                                    onTidy={placeCompositionModules}
                                    onAddModule={addCompositionModule}
                                  />
                                </div>
                              </div>
                            }
                            bottom={
                              <ModuleInspectorSlotContext.Provider value={moduleInspectorSlot}>
                                <div className={classes.detailBody}>
                                  {compositionInstances.map((instance) => {
                                    const instanceLabel = compositionInstanceLabel(
                                      instance,
                                      compositionInstances
                                    );
                                    const routeState =
                                      moduleRouteStates[instance.id] ??
                                      createDefaultModuleRouteState(
                                        routedModulePorts[instance.moduleId] ?? []
                                      );
                                    return (
                                      <div
                                        key={instance.id}
                                        className={classes.moduleHost}
                                        hidden={activeCompositionInstanceId !== instance.id}
                                      >
                                        <ModuleActiveContext.Provider
                                          value={activeCompositionInstanceId === instance.id}
                                        >
                                          {instance.moduleId === 'snippet' ? (
                                            <SnippetSourceModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              snippetId={instance.snippetId}
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'interference' ? (
                                            <InterferenceModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'rhythm-list' ? (
                                            <RhythmListModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'pitch-list' ? (
                                            <PitchListModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'arithmetic' ? (
                                            <ArithmeticModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              outputs={publishedCompositionOutputs}
                                              routeState={routeState}
                                              onBind={(port, source) =>
                                                bindModulePort(
                                                  instance.id,
                                                  instance.moduleId,
                                                  port,
                                                  source
                                                )
                                              }
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'mixer' ? (
                                            <MixerModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              outputs={publishedCompositionOutputs}
                                              routeState={routeState}
                                              onBind={(port, source) =>
                                                bindModulePort(
                                                  instance.id,
                                                  instance.moduleId,
                                                  port,
                                                  source
                                                )
                                              }
                                              onAddChannel={() => addMixerChannel(instance.id)}
                                              onRemoveChannel={(port) =>
                                                removeMixerChannel(instance.id, port)
                                              }
                                            />
                                          ) : instance.moduleId === 'swirling-mists' ? (
                                            <SwirlingMistsModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'fractioning' ? (
                                            <FractioningModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'pair-composition' ? (
                                            <PairCompositionModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'scale-construction' ? (
                                            <ScaleConstructionModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'rhythm-edit' ? (
                                            <RhythmEditModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              outputs={publishedCompositionOutputs}
                                              routeState={routeState}
                                              onBind={(port, source) =>
                                                bindModulePort(
                                                  instance.id,
                                                  instance.moduleId,
                                                  port,
                                                  source
                                                )
                                              }
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'rhythm-householder' ? (
                                            <HouseholderModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              outputs={publishedCompositionOutputs}
                                              routeState={routeState}
                                              onBind={(port, source) =>
                                                bindModulePort(
                                                  instance.id,
                                                  instance.moduleId,
                                                  port,
                                                  source
                                                )
                                              }
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : instance.moduleId === 'scale-evolution' ? (
                                            <ScaleEvolutionModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              outputs={publishedCompositionOutputs}
                                              routeState={routeState}
                                              onBind={(port, source) =>
                                                bindModulePort(
                                                  instance.id,
                                                  instance.moduleId,
                                                  port,
                                                  source
                                                )
                                              }
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          ) : (
                                            <MelodicizationModule
                                              instanceId={instance.id}
                                              instanceLabel={instanceLabel}
                                              active={activeCompositionInstanceId === instance.id}
                                              outputs={publishedCompositionOutputs}
                                              routeState={routeState}
                                              onBind={(port, source) =>
                                                bindModulePort(
                                                  instance.id,
                                                  instance.moduleId,
                                                  port,
                                                  source
                                                )
                                              }
                                              onOutputsChange={reconcileCompositionOutputs}
                                            />
                                          )}
                                        </ModuleActiveContext.Provider>
                                      </div>
                                    );
                                  })}
                                  {compositionInstances.length === 0 && (
                                    <Surface p="lg">
                                      <Title order={2} size="h4">
                                        No modules placed
                                      </Title>
                                      <Text c="dimmed" size="sm" mt="xs">
                                        Use Add module on the canvas, or right-click it, to place
                                        one.
                                      </Text>
                                    </Surface>
                                  )}
                                </div>
                              </ModuleInspectorSlotContext.Provider>
                            }
                          />
                          {settingsOpened && (
                            <div className={classes.settingsColumn}>
                              <CompositionSettingsPanel onClose={() => setSettingsOpened(false)} />
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
                      view={workspaceView}
                      onView={setWorkspaceView}
                    />
                  </AppShell.Footer>
                </AppShell>
              </InfoBarActiveContext.Provider>
            </MantineThemeProvider>
          </PreviewRegistryProvider>
        </AudioEngineProvider>
      </DeskProvider>
    </CompositionSettingsProvider>
  );
}
