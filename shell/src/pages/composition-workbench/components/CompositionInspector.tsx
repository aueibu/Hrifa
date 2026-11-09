import { Badge, Button, Group, Stack, Text, Title } from '@mantine/core';
import {
  boundOutput,
  describeOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import {
  compositionInstanceLabel,
  mixerPortLabels,
  type CompositionInspectorTarget,
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
  /** The module open in the main panel; a selected cable makes its receiver active. */
  activeInstanceId: string | null;
  outputs: PublishedCompositionOutput[];
  instances: CompositionModuleInstance[];
  routes: ModuleRouteStates;
  onRemoveModule(instanceId: string): void;
  onRouteTreatment(instanceId: string, port: string, treatment: unknown): void;
}

const moduleDescriptions: Record<CompositionModuleId, string> = {
  interference: 'Authors inter-onset duration streams and their resultant.',
  'pitch-list': 'Authors ordered pitch groups and pitch-class material.',
  melodicization: 'Combines treated rhythm and pitch inputs into note events.',
  arithmetic: 'Combines two numeric inputs with an OM-style operator, plus an optional modulo post-process.',
  fractioning: 'Authors a rhythmic resultant by fractioning around the axis of symmetry (Schillinger ch. 4), distinct from binary synchronization.',
  'pair-composition': 'Pairs a fractioning statement with a binary-synchronization statement into a balanced, expanded, or contracted phrase (Schillinger ch. 5).',
  'scale-construction': 'Authors a pitch-interval sequence and its melodic-form permutations (Schillinger Book II ch. 1-2).',
  'rhythm-householder': 'Alters a rhythm along a bias axis while keeping its attack count and span: reflects the duration vector (Householder), or re-places attacks against an accent or early/late axis.',
  mixer: 'Auditions several ideas together: each connected channel loops on its own cycle, so the mix becomes a meta interference pattern. A preview layer before arranging, not a timeline.',
  'scale-evolution': 'Synchronizes an interval sequence with its own circular permutations within one shared period, evolving richer scale families (Schillinger Book I ch. 13 / Book II ch. 3 §A).',
};

function portLabel(port: string) {
  return port.charAt(0).toUpperCase() + port.slice(1);
}

/** Upper part: the canvas and its cables. Shows Quick Adjust for the selected cable. */
function CanvasPart({
  selected,
  outputs,
  instances,
  routes,
  onRouteTreatment,
}: Pick<
  CompositionInspectorProps,
  'selected' | 'outputs' | 'instances' | 'routes' | 'onRouteTreatment'
>) {
  const route = selected.kind === 'route' ? selected : undefined;
  const binding = route ? routes[route.instanceId]?.[route.port] : undefined;
  if (!route || !binding) {
    return (
      <Stack gap="xs">
        <div>
          <Text className={classes.heading} size="xs" c="dimmed" fw={700} tt="uppercase">
            Canvas &amp; cables
          </Text>
          <Title order={3} size="h5">
            Patch canvas
          </Title>
        </div>
        <Text size="xs" c="dimmed">
          Select a cable to adjust how its material is treated between modules.
        </Text>
      </Stack>
    );
  }

  const routeState = routes[route.instanceId]!;
  const receiver = instances.find((candidate) => candidate.id === route.instanceId);
  const destinationLabel = receiver
    ? compositionInstanceLabel(receiver, instances)
    : 'Missing receiver';
  const output = boundOutput(outputs, binding.source);
  const sourceLabel =
    describeOutputRef(outputs, binding.source) ??
    (binding.source ? `Missing source · ${binding.source.port}` : 'No source');
  // A mixer channel is named by its position (Ch 2), never by its internal id.
  const routePortLabel =
    receiver?.moduleId === 'mixer'
      ? (mixerPortLabels(routeState).find((port) => port.id === route.port)?.label ?? route.port)
      : portLabel(route.port);

  const definition = signalTypeRegistry[binding.signalType];
  const treatment = binding.treatment;
  const update = (value: unknown) => onRouteTreatment(route.instanceId, route.port, value);

  return (
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
        {sourceLabel} → {destinationLabel} · {routePortLabel}
      </div>

      {binding.signalType === 'pitch' && (
        <PitchTreatmentEditor treatment={treatment as never} source={output?.packet} onChange={update} />
      )}
      {binding.signalType === 'rhythm' && (
        <RhythmTreatmentEditor treatment={treatment as never} source={output?.packet} onChange={update} />
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
  );
}

/** Lower part: the module being edited in the main panel. */
function ModulePart({
  activeInstanceId,
  instances,
  onRemoveModule,
}: Pick<CompositionInspectorProps, 'activeInstanceId' | 'instances' | 'onRemoveModule'>) {
  const instance = instances.find((candidate) => candidate.id === activeInstanceId);
  if (!instance) {
    return (
      <Stack gap="xs">
        <Text className={classes.heading} size="xs" c="dimmed" fw={700} tt="uppercase">
          Module
        </Text>
        <Text size="xs" c="dimmed">
          Select a module on the canvas.
        </Text>
      </Stack>
    );
  }
  const moduleName = compositionInstanceLabel(instance, instances);
  return (
    <Stack gap="sm">
      <div>
        <Text className={classes.heading} size="xs" c="dimmed" fw={700} tt="uppercase">
          Module
        </Text>
        <Title order={3} size="h5">
          {moduleName} module
        </Title>
      </div>
      <Text size="sm">{moduleDescriptions[instance.moduleId]}</Text>
      <Button variant="light" color="red" onClick={() => onRemoveModule(instance.id)}>
        Remove {moduleName}
      </Button>
    </Stack>
  );
}

/** Two stacked parts: canvas and cables above, the active module below. */
export function CompositionInspector(props: CompositionInspectorProps) {
  return (
    <div className={classes.panel}>
      <div className={classes.part}>
        <CanvasPart {...props} />
      </div>
      <div className={classes.part}>
        <ModulePart {...props} />
      </div>
    </div>
  );
}
