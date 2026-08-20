import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, AppShell, Button, Group, Stack, Tabs, Text, Textarea, Title } from '@mantine/core';
import { ColorSchemeToggle } from '../components/ColorSchemeToggle/ColorSchemeToggle';
import { Surface } from '../components/Surface/Surface';
import { AudioEngineProvider } from './composition-workbench/audio/AudioEngineProvider';
import { ArithmeticModule } from './composition-workbench/components/ArithmeticModule';
import { CompositionInspector } from './composition-workbench/components/CompositionInspector';
import { CompositionLaneGrid } from './composition-workbench/components/CompositionLaneGrid';
import { InterferenceModule } from './composition-workbench/components/InterferenceModule';
import { MelodicizationModule } from './composition-workbench/components/MelodicizationModule';
import { ModuleLibrary } from './composition-workbench/components/ModuleLibrary';
import { ModulePatch } from './composition-workbench/components/ModulePatch';
import { PacketInspector } from './composition-workbench/components/PacketInspector';
import { PitchListModule } from './composition-workbench/components/PitchListModule';
import {
  outputRefKey,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from './composition-workbench/compositionRouting';
import {
  acceptsCompositionInspectorTarget,
  acceptsCompositionInstances,
  acceptsModuleRouteStates,
  compositionInstanceLabel,
  createDefaultModuleRouteState,
  defaultCompositionInstances,
  nextAvailableRow,
  type CompositionInspectorTarget,
  type CompositionLaneId,
  type CompositionModuleId,
  type CompositionModuleInstance,
  type ModuleRouteStates,
} from './composition-workbench/compositionWorkspace';
import { evaluatePatch } from './composition-workbench/evaluator';
import { createDefaultPatch } from './composition-workbench/examples';
import type { ModuleDefinition, PatchDocument } from './composition-workbench/model';
import {
  exportPatch,
  importPatch,
  loadSavedPatch,
  compositionWorkbenchStorageKey,
  savePatch,
} from './composition-workbench/persistence';
import { moduleDefinitions } from './composition-workbench/registry';
import { signalTypeFor, signalTypeRegistry, type SignalTypeId } from './composition-workbench/signalTypes';
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
  interference: [
    compositionStateKeys.interferenceDrafts,
    compositionStateKeys.interferenceGrouping,
    compositionStateKeys.interferenceUnit,
    compositionStateKeys.interferenceVolume,
    compositionStateKeys.interferenceMetronome,
    compositionStateKeys.interferenceMetronomeVolume,
  ],
  'pitch-list': [
    compositionStateKeys.pitchFormat,
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
};

const routedModulePorts: Partial<Record<CompositionModuleId, { id: string; signalType: SignalTypeId }[]>> = {
  melodicization: [
    { id: 'rhythm', signalType: 'rhythm' },
    { id: 'pitches', signalType: 'pitch' },
  ],
  arithmetic: [
    { id: 'a', signalType: 'numeric' },
    { id: 'b', signalType: 'numeric' },
  ],
};

function removeCompositionInstanceStorage(instance: CompositionModuleInstance) {
  try {
    instanceStateKeys[instance.moduleId].forEach((key) =>
      localStorage.removeItem(compositionInstanceStateKey(key, instance.id, instance.moduleId))
    );
  } catch {
    // Removing the in-memory instance still succeeds when storage is unavailable.
  }
}

export function CompositionWorkbenchPage() {
  const [patch, setPatch] = useState<PatchDocument>(() => loadSavedPatch(createDefaultPatch));
  const [selectedId, setSelectedId] = usePersistentState<string | null>(
    compositionStateKeys.selectedConstructionModule,
    'rhythm-generator',
    (value): value is string | null => value === null || typeof value === 'string'
  );
  const [jsonText, setJsonText] = useState('');
  const [managementStatus, setManagementStatus] = useState('');
  const [activeView, setActiveView] = usePersistentState<'composition' | 'construction'>(
    compositionStateKeys.activeView,
    'composition',
    (value): value is 'composition' | 'construction' =>
      value === 'composition' || value === 'construction'
  );
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
    acceptsCompositionInstances
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
        const preferredSignalType = ports.find((candidate) => candidate.id === port)?.signalType ?? 'numeric';
        const sourcePacket = source ? compositionOutputs[outputRefKey(source)]?.packet : undefined;
        // A port with its own declared preference (Melodicization's rhythm/pitch inlets) always
        // gets the Quick Adjust panel relevant to what IT expects, regardless of the connected
        // source's own domain — e.g. plugging Arithmetic's `duration`-domain output into the
        // Pitches inlet must still surface the Pitch Quick Adjust (with its "Read as MIDI notes"
        // conversion), not the Rhythm panel, even though `duration` alone would read as rhythm.
        // Only a port with no strong preference (Arithmetic's generic `numeric` A/B inlets)
        // defers to whatever the connected source actually is.
        const sourceSignalType = source ? signalTypeFor(sourcePacket) : preferredSignalType;
        const signalType = preferredSignalType === 'numeric' ? sourceSignalType : preferredSignalType;
        const treatment =
          existing && existing.signalType === signalType
            ? existing.treatment
            : signalTypeRegistry[signalType].default;
        return {
          ...current,
          [instanceId]: { ...receiver, [port]: { source: source ?? undefined, signalType, treatment } },
        };
      });
      setCompositionInspectorTarget({ kind: 'route', instanceId, port });
      setActiveCompositionInstanceId(instanceId);
    },
    [compositionOutputs, setActiveCompositionInstanceId, setCompositionInspectorTarget, setModuleRouteStates]
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

  useEffect(() => {
    if (!savePatch(patch)) {
      setManagementStatus('Patch changed, but local persistence is unavailable.');
    }
  }, [patch]);

  function updateParameter(id: string, key: string, value: unknown) {
    setPatch((current) => ({
      ...current,
      instances: current.instances.map((instance) =>
        instance.id === id
          ? { ...instance, parameters: { ...instance.parameters, [key]: value } }
          : instance
      ),
    }));
  }

  function connect(toInstanceId: string, toPort: string, source: string | null) {
    setPatch((current) => {
      const connections = current.connections.filter(
        (connection) => !(connection.toInstanceId === toInstanceId && connection.toPort === toPort)
      );
      if (!source) {
        return { ...current, connections };
      }
      const [fromInstanceId, fromPort] = source.split('|');
      return {
        ...current,
        connections: [
          ...connections,
          {
            id: uniqueId('connection'),
            fromInstanceId,
            fromPort,
            toInstanceId,
            toPort,
          },
        ],
      };
    });
  }

  function addModule(definition: ModuleDefinition) {
    const id = uniqueId(definition.id);
    setPatch((current) => ({
      ...current,
      instances: [
        ...current.instances,
        {
          id,
          definitionId: definition.id,
          definitionVersion: definition.version,
          parameters: structuredClone(definition.defaultParameters),
          order: Math.max(-1, ...current.instances.map((instance) => instance.order)) + 1,
        },
      ],
    }));
    setSelectedId(id);
  }

  function duplicateModule(id: string) {
    const source = patch.instances.find((instance) => instance.id === id);
    if (!source) {
      return;
    }
    const copyId = uniqueId(source.definitionId);
    setPatch((current) => ({
      ...current,
      instances: [
        ...current.instances,
        {
          ...source,
          id: copyId,
          parameters: structuredClone(source.parameters),
          order: Math.max(-1, ...current.instances.map((instance) => instance.order)) + 1,
        },
      ],
    }));
    setSelectedId(copyId);
  }

  function deleteModule(id: string) {
    setPatch((current) => ({
      ...current,
      instances: current.instances
        .filter((instance) => instance.id !== id)
        .map((instance, index) => ({ ...instance, order: index })),
      connections: current.connections.filter(
        (connection) => connection.fromInstanceId !== id && connection.toInstanceId !== id
      ),
    }));
    if (selectedId === id) {
      setSelectedId(null);
    }
  }

  function exportJson() {
    const value = exportPatch(patch);
    setJsonText(value);
    const blob = new Blob([value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'composition-workbench-patch.v1.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setManagementStatus('Versioned patch JSON exported and copied into the import editor.');
  }

  function importJson() {
    try {
      const imported = importPatch(jsonText);
      setPatch(imported);
      setSelectedId(imported.instances[0]?.id ?? null);
      setManagementStatus('Compatible patch JSON imported.');
    } catch (error) {
      setManagementStatus(error instanceof Error ? error.message : 'Patch import failed.');
    }
  }

  function resetPatch() {
    const next = createDefaultPatch();
    setPatch(next);
    setSelectedId('rhythm-generator');
    setJsonText('');
    try {
      localStorage.removeItem(compositionWorkbenchStorageKey);
    } catch {
      // The in-memory reset still succeeds.
    }
    setManagementStatus('Construction example restored.');
  }

  const selected = selectedId ? evaluation.modules.get(selectedId) : undefined;
  const publishedCompositionOutputs = Object.values(compositionOutputs);

  function selectCompositionModule(instanceId: string) {
    setActiveCompositionInstanceId(instanceId);
    setCompositionInspectorTarget({ kind: 'module', instanceId });
  }

  function addCompositionModule(moduleId: CompositionModuleId, laneId: CompositionLaneId) {
    const instanceId = uniqueId(moduleId);
    setCompositionInstances((current) => [
      ...current,
      { id: instanceId, moduleId, laneId, row: nextAvailableRow(current, laneId) },
    ]);
    const ports = routedModulePorts[moduleId];
    if (ports) {
      setModuleRouteStates((current) => ({
        ...current,
        [instanceId]: createDefaultModuleRouteState(ports),
      }));
    }
    selectCompositionModule(instanceId);
  }

  function removeCompositionModule(instanceId: string) {
    const removed = compositionInstances.find((candidate) => candidate.id === instanceId);
    if (!removed) {
      return;
    }
    const remaining = compositionInstances.filter((candidate) => candidate.id !== instanceId);
    removeCompositionInstanceStorage(removed);
    setCompositionInstances(remaining);
    setCompositionOutputs((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, output]) => output.ref.instanceId !== instanceId)
      )
    );
    if (routedModulePorts[removed.moduleId]) {
      setModuleRouteStates((current) => {
        const next = { ...current };
        delete next[instanceId];
        return next;
      });
    }
    if (remaining[0]) {
      selectCompositionModule(remaining[0].id);
    } else {
      setActiveCompositionInstanceId(null);
      setCompositionInspectorTarget({ kind: 'lane', laneId: removed.laneId });
    }
  }

  return (
    <AudioEngineProvider>
      <AppShell header={{ height: { base: 112, sm: 56 } }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between" className={classes.headerContent}>
            <Group gap="sm">
              <Anchor component={Link} to="/" size="sm">
                &larr; Workbench
              </Anchor>
              <Text c="dimmed">/</Text>
              <Title order={1} size="h4">
                Composition Workbench
              </Title>
            </Group>
            <ColorSchemeToggle />
          </Group>
        </AppShell.Header>
        <AppShell.Main>
          <Stack gap="md">
            <div>
              <Text c="dimmed" size="sm">
                Work directly with a compositional procedure. Open Construction when you need to
                inspect or alter the machinery beneath it.
              </Text>
            </div>

            {evaluation.errors.map((error) => (
              <Surface key={error} p="sm">
                <Text c="red">{error}</Text>
              </Surface>
            ))}

            <Tabs
              value={activeView}
              onChange={(value) => value && setActiveView(value as 'composition' | 'construction')}
            >
              <Tabs.List aria-label="Workbench view">
                <Tabs.Tab value="composition">Composition</Tabs.Tab>
                <Tabs.Tab value="construction">Construction</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="composition" pt="md">
                <div className={classes.compositionWorkspace}>
                  <Surface className={classes.moduleRail}>
                    <div className={classes.moduleRailContent}>
                      <CompositionLaneGrid
                        activeInstanceId={activeCompositionInstanceId}
                        selected={compositionInspectorTarget}
                        instances={compositionInstances}
                        routes={moduleRouteStates}
                        outputs={publishedCompositionOutputs}
                        onSelectModule={selectCompositionModule}
                        onSelectRoute={(instanceId, port) => {
                          setActiveCompositionInstanceId(instanceId);
                          setCompositionInspectorTarget({ kind: 'route', instanceId, port });
                        }}
                        onSelectLane={(laneId) =>
                          setCompositionInspectorTarget({ kind: 'lane', laneId })
                        }
                      />
                      <CompositionInspector
                        selected={compositionInspectorTarget}
                        outputs={publishedCompositionOutputs}
                        instances={compositionInstances}
                        routes={moduleRouteStates}
                        onModuleLane={(instanceId, laneId) =>
                          setCompositionInstances((current) =>
                            current.map((instance) =>
                              instance.id === instanceId ? { ...instance, laneId } : instance
                            )
                          )
                        }
                        onModuleRow={(instanceId, row) =>
                          setCompositionInstances((current) =>
                            current.map((instance) =>
                              instance.id === instanceId ? { ...instance, row } : instance
                            )
                          )
                        }
                        onAddModule={addCompositionModule}
                        onRemoveModule={removeCompositionModule}
                        onRouteTreatment={updateRouteTreatment}
                      />
                    </div>
                  </Surface>
                  {compositionInstances.map((instance) => {
                    const instanceLabel = compositionInstanceLabel(instance, compositionInstances);
                    const routeState =
                      moduleRouteStates[instance.id] ??
                      createDefaultModuleRouteState(routedModulePorts[instance.moduleId] ?? []);
                    return (
                      <div key={instance.id} hidden={activeCompositionInstanceId !== instance.id}>
                        {instance.moduleId === 'interference' ? (
                          <InterferenceModule
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
                              bindModulePort(instance.id, instance.moduleId, port, source)
                            }
                            onOutputsChange={reconcileCompositionOutputs}
                          />
                        ) : (
                          <MelodicizationModule
                            instanceId={instance.id}
                            instanceLabel={instanceLabel}
                            outputs={publishedCompositionOutputs}
                            routeState={routeState}
                            onBind={(port, source) =>
                              bindModulePort(instance.id, instance.moduleId, port, source)
                            }
                            onOutputsChange={reconcileCompositionOutputs}
                          />
                        )}
                      </div>
                    );
                  })}
                  {compositionInstances.length === 0 && (
                    <Surface p="lg">
                      <Title order={2} size="h4">
                        No modules placed
                      </Title>
                      <Text c="dimmed" size="sm" mt="xs">
                        Select a numbered lane and add a module from its Inspector.
                      </Text>
                    </Surface>
                  )}
                </div>
              </Tabs.Panel>

              <Tabs.Panel value="construction" pt="md">
                <Stack gap="md">
                  <Group justify="space-between" align="end">
                    <div>
                      <Title order={2} size="h3">
                        Construction
                      </Title>
                      <Text c="dimmed" size="sm">
                        Inspect typed packets, provenance, connections, and the reusable operations
                        beneath modules.
                      </Text>
                      <Text c="dimmed" size="xs">
                        Scalars broadcast. Zip stops at the shortest stream; Cycle repeats shorter
                        streams; Cartesian makes every combination up to 256 frames.
                      </Text>
                    </div>
                    <Group gap="xs">
                      <Button variant="default" onClick={resetPatch}>
                        Reset construction
                      </Button>
                      <Button variant="default" onClick={exportJson}>
                        Export JSON
                      </Button>
                    </Group>
                  </Group>
                  <div className={classes.workspace}>
                    <div className={classes.stickyColumn}>
                      <Stack gap="md">
                        <ModuleLibrary definitions={moduleDefinitions} onAdd={addModule} />
                        <Surface>
                          <Stack gap="sm">
                            <Title order={2} size="h4">
                              Patch management
                            </Title>
                            <Textarea
                              label="Versioned patch JSON"
                              description="Paste a compatible schema-version 1 patch, or export the current patch here."
                              rows={8}
                              value={jsonText}
                              onChange={(event) => setJsonText(event.currentTarget.value)}
                            />
                            <Button variant="default" onClick={importJson}>
                              Import JSON
                            </Button>
                            {managementStatus && (
                              <Text size="xs" c="dimmed" aria-live="polite">
                                {managementStatus}
                              </Text>
                            )}
                          </Stack>
                        </Surface>
                      </Stack>
                    </div>
                    <ModulePatch
                      patch={patch}
                      evaluated={evaluation.modules}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onParameter={updateParameter}
                      onConnect={connect}
                      onDuplicate={duplicateModule}
                      onDelete={deleteModule}
                    />
                    <div className={`${classes.inspector} ${classes.stickyColumn}`}>
                      <PacketInspector module={selected} />
                    </div>
                  </div>
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </AppShell.Main>
      </AppShell>
    </AudioEngineProvider>
  );
}
