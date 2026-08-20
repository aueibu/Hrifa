import { Badge, Button, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import type { CompositionOutputRef, PublishedCompositionOutput } from '../compositionRouting';
import {
  compositionLanes,
  compositionInstanceLabel,
  compositionModuleLabels,
  createDefaultModuleRouteState,
  type CompositionInspectorTarget,
  type CompositionLaneId,
  type CompositionModuleInstance,
  type CompositionModuleId,
  type ModuleRouteStates,
} from '../compositionWorkspace';
import { signalTypeRegistry } from '../signalTypes';
import { NumericTreatmentEditor } from './NumericTreatmentEditor';
import { PitchTreatmentEditor } from './PitchTreatmentEditor';
import { RhythmTreatmentEditor } from './RhythmTreatmentEditor';
import classes from './CompositionInspector.module.css';

interface CompositionInspectorProps {
  selected: CompositionInspectorTarget;
  outputs: PublishedCompositionOutput[];
  instances: CompositionModuleInstance[];
  routes: ModuleRouteStates;
  onModuleLane(instanceId: string, lane: CompositionLaneId): void;
  onModuleRow(instanceId: string, row: number): void;
  onAddModule(moduleId: CompositionModuleId, lane: CompositionLaneId): void;
  onRemoveModule(instanceId: string): void;
  onRouteTreatment(instanceId: string, port: string, treatment: unknown): void;
}

function outputFor(outputs: PublishedCompositionOutput[], ref: CompositionOutputRef | undefined) {
  return ref
    ? outputs.find(
        (output) => output.ref.instanceId === ref.instanceId && output.ref.port === ref.port
      )
    : undefined;
}

const moduleDescriptions: Record<CompositionModuleId, string> = {
  interference: 'Authors inter-onset duration streams and their resultant.',
  'pitch-list': 'Authors ordered pitch groups and pitch-class material.',
  melodicization: 'Combines treated rhythm and pitch inputs into note events.',
  arithmetic: 'Combines two numeric inputs with an OM-style operator, plus an optional modulo post-process.',
};

function portLabel(port: string) {
  return port.charAt(0).toUpperCase() + port.slice(1);
}

export function CompositionInspector({
  selected,
  outputs,
  instances,
  routes,
  onModuleLane,
  onModuleRow,
  onAddModule,
  onRemoveModule,
  onRouteTreatment,
}: CompositionInspectorProps) {
  if (selected.kind === 'module') {
    const instance = instances.find((candidate) => candidate.id === selected.instanceId);
    if (!instance) {
      return null;
    }
    const moduleName = compositionInstanceLabel(instance, instances);
    return (
      <div className={classes.root}>
        <Stack gap="sm">
          <div>
            <Text className={classes.heading} size="xs" c="dimmed" fw={700} tt="uppercase">
              Module
            </Text>
            <Title order={3} size="h5">
              {moduleName} module
            </Title>
          </div>
          <div className={classes.contextSummary}>
            <Text size="sm">{moduleDescriptions[instance.moduleId]}</Text>
            <Text size="xs" c="dimmed" mt="xs">
              Edit the module in the main panel. Select a connection or treatment badge to adjust
              material between modules without changing its source.
            </Text>
          </div>
          <Group grow>
            <Select
              label="Lane"
              aria-label={`${moduleName} module lane`}
              value={String(instance.laneId)}
              data={compositionLanes.map((lane) => ({ value: String(lane.id), label: lane.label }))}
              allowDeselect={false}
              onChange={(value) =>
                value && onModuleLane(instance.id, Number(value) as CompositionLaneId)
              }
            />
            <NumberInput
              label="Row"
              aria-label={`${moduleName} module row`}
              min={1}
              step={1}
              value={instance.row}
              onChange={(value) => onModuleRow(instance.id, Math.max(1, Math.trunc(Number(value) || 1)))}
            />
          </Group>
          <Button variant="light" color="red" onClick={() => onRemoveModule(instance.id)}>
            Remove {moduleName}
          </Button>
        </Stack>
      </div>
    );
  }

  if (selected.kind === 'lane') {
    const lane = compositionLanes.find((candidate) => candidate.id === selected.laneId)!;
    const availableModules = Object.keys(compositionModuleLabels) as CompositionModuleId[];
    return (
      <div className={classes.root}>
        <Stack gap="sm">
          <div>
            <Text className={classes.heading} size="xs" c="dimmed" fw={700} tt="uppercase">
              Lane
            </Text>
            <Title order={3} size="h5">
              Lane {lane.label}
            </Title>
          </div>
          <div className={classes.contextSummary}>
            <Text size="sm">{lane.description}</Text>
            <Text size="xs" c="dimmed" mt="xs">
              Lane numbers organize the composition spatially; they do not describe or constrain the
              material passing through them. Module placement does not silently change routing.
            </Text>
          </div>
          <Stack gap="xs">
            <Text size="xs" fw={700}>
              Add module
            </Text>
            {availableModules.map((moduleId) => (
              <Button key={moduleId} variant="light" onClick={() => onAddModule(moduleId, lane.id)}>
                Add {compositionModuleLabels[moduleId]}
              </Button>
            ))}
          </Stack>
        </Stack>
      </div>
    );
  }

  const receiver = instances.find((candidate) => candidate.id === selected.instanceId);
  const routeState = routes[selected.instanceId] ?? createDefaultModuleRouteState([]);
  const destinationLabel = receiver
    ? compositionInstanceLabel(receiver, instances)
    : 'Missing receiver';
  const binding = routeState[selected.port];
  const output = outputFor(outputs, binding?.source);
  const sourceLabel =
    output?.label ?? (binding?.source ? `Missing source · ${binding.source.port}` : 'No source');

  if (!binding) {
    return null;
  }

  const definition = signalTypeRegistry[binding.signalType];
  const treatment = binding.treatment;
  const update = (value: unknown) => onRouteTreatment(selected.instanceId, selected.port, value);

  return (
    <div className={classes.root}>
      <Stack gap="sm">
        <Group justify="space-between" align="start">
          <div>
            <Text className={classes.heading} size="xs" c="dimmed" fw={700} tt="uppercase">
              Route · {definition.label} input
            </Text>
            <Title order={3} size="h5">
              Quick Adjust
            </Title>
          </div>
          <Badge variant={definition.isIdentity(treatment, output?.packet) ? 'outline' : 'light'}>
            {definition.summary(treatment, output?.packet)}
          </Badge>
        </Group>
        <div className={classes.routePath}>
          {sourceLabel} → {destinationLabel} · {portLabel(selected.port)}
        </div>

        {binding.signalType === 'pitch' && (
          <PitchTreatmentEditor treatment={treatment as never} source={output?.packet} onChange={update} />
        )}
        {binding.signalType === 'rhythm' && (
          <RhythmTreatmentEditor treatment={treatment as never} onChange={update} />
        )}
        {binding.signalType === 'numeric' && (
          <NumericTreatmentEditor treatment={treatment as never} onChange={update} />
        )}

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Source material remains unchanged.
          </Text>
          <Button size="compact-xs" variant="default" onClick={() => update(definition.default)}>
            Reset route
          </Button>
        </Group>
      </Stack>
    </div>
  );
}
