import { useState, type ReactNode } from 'react';
import { Collapse, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { ActionButton, Actions, KitScope, Num, Row, Section, Strip, Tip } from '../../../ui';
import {
  boundOutput,
  describeOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import {
  compositionInstanceLabel,
  mixerPortLabels,
  type CompositionInspectorTarget,
  type CompositionNodeInstance,
  type CompositionNodeId,
  type NodeRouteStates,
} from '../compositionWorkspace';
import { useOptionalDesk } from '../desk';
import { hasNotesProperties } from '../notesProperties';
import { signalTypeRegistry } from '../signalTypes';
import { DataBlockOperatorsPanel } from './DataBlockOperatorsPanel';
import { NotesPropertiesPanel } from './NotesPropertiesPanel';
import { NumericTreatmentEditor } from './NumericTreatmentEditor';
import { PitchTreatmentEditor } from './PitchTreatmentEditor';
import { RhythmTreatmentEditor } from './RhythmTreatmentEditor';
import classes from './CompositionInspector.module.css';

interface CompositionInspectorProps {
  selected: CompositionInspectorTarget;
  /** The node open in the main panel; a selected cable makes its receiver active. */
  activeInstanceId: string | null;
  /** A desk data-block open in the main panel; the lower part then shows it instead of a node. */
  dataBlockId: string | null;
  outputs: PublishedCompositionOutput[];
  instances: CompositionNodeInstance[];
  routes: NodeRouteStates;
  onRemoveNode(instanceId: string): void;
  /** Receives the element the active node's setup controls are portaled into. */
  onNodeSlot(element: HTMLElement | null): void;
  onRouteTreatment(instanceId: string, port: string, treatment: unknown): void;
}

const nodeDescriptions: Record<CompositionNodeId, string> = {
  interference: 'Authors inter-onset duration streams and their resultant.',
  'pitch-list': 'Authors ordered pitch groups and pitch-class material.',
  'rhythm-list': 'Authors a rhythm by typing it, with rests (r1) and ties (2~).',
  'rhythm-edit':
    'Turns attacks of a connected rhythm into rests and ties from a repeating x / r / ~ pattern, keeping every length.',
  melodicization: 'Combines treated rhythm and pitch inputs into note events.',
  arithmetic:
    'Combines two numeric inputs with an OM-style operator, plus an optional modulo post-process.',
  fractioning:
    'Authors a rhythmic resultant by fractioning around the axis of symmetry (Schillinger ch. 4), distinct from binary synchronization.',
  'pair-composition':
    'Pairs a fractioning statement with a binary-synchronization statement into a balanced, expanded, or contracted phrase (Schillinger ch. 5).',
  'scale-construction':
    'Authors a pitch-interval sequence and its melodic-form permutations (Schillinger Book II ch. 1-2).',
  'rhythm-householder':
    'Alters a rhythm along a bias axis while keeping its attack count and span: reflects the duration vector (Householder), or re-places attacks against an accent or early/late axis.',
  'swirling-mists':
    'Layered looping waves sampled into numbers: one chord per step and one melody per stratum, mapped to a range you set.',
  'data-block-source':
    'A data-block from the desk, placed as a source. It refers to a desk data-block and publishes its material unchanged; it may be blank until one is chosen.',
  mixer:
    'Auditions several ideas together: each connected channel loops on its own cycle, so the mix becomes a meta interference pattern. A preview layer before arranging, not a timeline.',
  'scale-evolution':
    'Synchronizes an interval sequence with its own circular permutations within one shared period, evolving richer scale families (Schillinger Book I ch. 13 / Book II ch. 3 §A).',
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
      <Text c="dimmed">Select a cable to adjust how its material is treated between nodes.</Text>
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
    receiver?.nodeId === 'mixer'
      ? (mixerPortLabels(routeState).find((port) => port.id === route.port)?.label ?? route.port)
      : portLabel(route.port);

  const definition = signalTypeRegistry[binding.signalType];
  const treatment = binding.treatment;
  const update = (value: unknown) => onRouteTreatment(route.instanceId, route.port, value);

  return (
    <Stack gap="xs">
      <Text className={classes.heading} c="dimmed" fw={700} tt="uppercase">
        Route · {definition.label} input
      </Text>
      <Row name="Treatment">
        <Num muted={definition.isIdentity(treatment, output?.packet)}>
          {definition.summary(treatment, output?.packet)}
        </Num>
      </Row>
      <div className={classes.routePath}>
        {sourceLabel} → {destinationLabel} · {routePortLabel}
      </div>

      {binding.signalType === 'pitch' && (
        <PitchTreatmentEditor
          treatment={treatment as never}
          source={output?.packet}
          onChange={update}
        />
      )}
      {binding.signalType === 'rhythm' && (
        <RhythmTreatmentEditor
          treatment={treatment as never}
          source={output?.packet}
          onChange={update}
        />
      )}
      {binding.signalType === 'numeric' && (
        <NumericTreatmentEditor treatment={treatment as never} onChange={update} />
      )}

      <Actions>
        <Tip
          as="control"
          term="Reset route"
          text="Return this cable to its default treatment. Source material remains unchanged."
        >
          <ActionButton onClick={() => update(definition.default)}>Reset route</ActionButton>
        </Tip>
      </Actions>
    </Stack>
  );
}

/** Lower part: the node being edited in the main panel. */
function NodePart({
  activeInstanceId,
  dataBlockId,
  instances,
  onRemoveNode,
  onNodeSlot,
}: Pick<
  CompositionInspectorProps,
  'activeInstanceId' | 'dataBlockId' | 'instances' | 'onRemoveNode' | 'onNodeSlot'
>) {
  const dataBlocks = useOptionalDesk()?.dataBlocks ?? [];
  const dataBlock =
    dataBlockId === null ? undefined : dataBlocks.find((entry) => entry.id === dataBlockId);
  if (dataBlockId !== null) {
    // The data-block inspector: which data-block is open, then its properties and actions.
    return dataBlock ? (
      <Stack gap="xs">
        <Title order={3} size="h6">
          {dataBlock.name}
        </Title>
        <Text>
          {dataBlock.payload.packet.kind} | {dataBlock.payload.packet.domain}
        </Text>
        {hasNotesProperties(dataBlock.payload.packet) && (
          <NotesPropertiesPanel key={dataBlock.id} dataBlock={dataBlock} />
        )}
        <DataBlockOperatorsPanel key={`actions:${dataBlock.id}`} dataBlock={dataBlock} />
      </Stack>
    ) : null;
  }
  const instance = instances.find((candidate) => candidate.id === activeInstanceId);
  if (!instance) {
    return <Text c="dimmed">Select a node on the canvas.</Text>;
  }
  const nodeName = compositionInstanceLabel(instance, instances);
  return (
    <Stack gap="xs">
      <Title order={3} size="h6" data-info={nodeDescriptions[instance.nodeId]}>
        {nodeName} node
      </Title>
      <Actions>
        <ActionButton onClick={() => onRemoveNode(instance.id)}>Remove {nodeName}</ActionButton>
      </Actions>
      {/* The active node's setup controls are portaled in here; see NodeHost. */}
      <div ref={onNodeSlot} className={classes.nodeSlot} />
    </Stack>
  );
}

/** A collapsible inspector section: a kit `Section` whose heading is the toggle (the kit has no collapse of its own). */
function Part({ label, children }: { label: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className={classes.part}>
      <Section
        heading={
          <UnstyledButton
            className={classes.partHeader}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              aria-hidden
            >
              <path d={expanded ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
            </svg>
            {label}
          </UnstyledButton>
        }
      >
        <Collapse expanded={expanded} keepMounted>
          {children}
        </Collapse>
      </Section>
    </div>
  );
}

/** Two stacked parts: canvas and cables above, the active node below. */
export function CompositionInspector(props: CompositionInspectorProps) {
  return (
    <KitScope>
      <div className={classes.panel}>
        <Strip title="Inspector" />
        <Part label="Canvas & cables">
          <CanvasPart {...props} />
        </Part>
        <Part label={props.dataBlockId === null ? 'Node' : 'Data-block'}>
          <NodePart {...props} />
        </Part>
      </div>
    </KitScope>
  );
}
