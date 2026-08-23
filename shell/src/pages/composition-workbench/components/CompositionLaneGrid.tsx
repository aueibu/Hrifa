import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Group, Text, Title, UnstyledButton } from '@mantine/core';
import {
  outputRefKey,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import {
  compositionInstanceLabel,
  compositionLanes,
  type CompositionInspectorTarget,
  type CompositionLaneId,
  type CompositionModuleId,
  type CompositionModuleInstance,
  type ModuleRouteStates,
} from '../compositionWorkspace';
import { signalTypeRegistry } from '../signalTypes';
import { FlowCell, type FlowCellPort } from './FlowCell';
import classes from './CompositionLaneGrid.module.css';

interface CompositionLaneGridProps {
  activeInstanceId: string | null;
  selected: CompositionInspectorTarget;
  instances: CompositionModuleInstance[];
  routes: ModuleRouteStates;
  outputs: PublishedCompositionOutput[];
  onSelectModule(instanceId: string): void;
  onSelectRoute(instanceId: string, port: string): void;
  onSelectLane(laneId: CompositionLaneId): void;
}

interface InstanceLayout {
  instance: CompositionModuleInstance;
  moduleRow: number;
}

interface RouteDescriptor {
  id: string;
  receiver: InstanceLayout;
  port: string;
  binding: CompositionOutputRef;
  output?: PublishedCompositionOutput;
  source?: InstanceLayout;
  bypassed: boolean;
  summary: string;
  identity: boolean;
}

const routedModulePorts: Partial<Record<CompositionModuleId, { id: string; label: string }[]>> = {
  melodicization: [
    { id: 'rhythm', label: 'Rhythm' },
    { id: 'pitches', label: 'Pitch' },
  ],
  arithmetic: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  'scale-evolution': [{ id: 'sequence', label: 'Sequence' }],
};

interface FlowPoint {
  x: number;
  y: number;
}

interface MeasuredFlowLayout {
  width: number;
  height: number;
  ports: Record<string, FlowPoint>;
}

function outputFor(outputs: PublishedCompositionOutput[], ref: CompositionOutputRef | undefined) {
  return ref
    ? outputs.find(
        (output) => output.ref.instanceId === ref.instanceId && output.ref.port === ref.port
      )
    : undefined;
}

function createLayout(instances: CompositionModuleInstance[]) {
  const layouts = instances.map((instance) => ({ instance, moduleRow: instance.row }));
  const maxRow = layouts.reduce((max, layout) => Math.max(max, layout.moduleRow), 0);
  return { layouts, rowCount: Math.max(5, maxRow) };
}

function inletElementKey(instanceId: string, port: string) {
  return `in:${instanceId}:${port}`;
}

function outletElementKey(ref: CompositionOutputRef) {
  return `out:${outputRefKey(ref)}`;
}

function sameMeasuredLayout(current: MeasuredFlowLayout | null, next: MeasuredFlowLayout) {
  if (!current || current.width !== next.width || current.height !== next.height) {
    return false;
  }
  const currentKeys = Object.keys(current.ports);
  const nextKeys = Object.keys(next.ports);
  return (
    currentKeys.length === nextKeys.length &&
    nextKeys.every(
      (key) =>
        current.ports[key]?.x === next.ports[key].x && current.ports[key]?.y === next.ports[key].y
    )
  );
}

function outputShortLabel(output: PublishedCompositionOutput, index: number) {
  if (output.ref.port === 'resultant') {
    return 'R';
  }
  if (output.ref.port === 'pitches') {
    return 'P';
  }
  if (output.ref.port === 'notes') {
    return 'N';
  }
  if (output.ref.port === 'result') {
    return '=';
  }
  if (output.ref.port.startsWith('generator:')) {
    return `G${index}`;
  }
  return output.ref.port.slice(0, 2).toUpperCase();
}

export function CompositionLaneGrid({
  activeInstanceId,
  selected,
  instances,
  routes,
  outputs,
  onSelectModule,
  onSelectRoute,
  onSelectLane,
}: CompositionLaneGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const connectionsRef = useRef<SVGSVGElement>(null);
  const [measuredLayout, setMeasuredLayout] = useState<MeasuredFlowLayout | null>(null);
  const { layouts, rowCount } = createLayout(instances);
  const layoutById = new Map(layouts.map((layout) => [layout.instance.id, layout]));
  const descriptors: RouteDescriptor[] = layouts.flatMap((layout) => {
    const ports = routedModulePorts[layout.instance.moduleId];
    const routeState = routes[layout.instance.id];
    if (!ports || !routeState) {
      return [];
    }
    return ports.flatMap(({ id: port }) => {
      const binding = routeState[port];
      if (!binding?.source) {
        return [];
      }
      const output = outputFor(outputs, binding.source);
      const definition = signalTypeRegistry[binding.signalType];
      return [
        {
          id: `${layout.instance.id}:${port}`,
          receiver: layout,
          port,
          binding: binding.source,
          output,
          source: layoutById.get(binding.source.instanceId),
          bypassed: Boolean((binding.treatment as { bypassed?: boolean } | undefined)?.bypassed),
          summary: definition.summary(binding.treatment, output?.packet),
          identity: definition.isIdentity(binding.treatment, output?.packet),
        },
      ];
    });
  });
  const routeGroups = new Map<string, RouteDescriptor[]>();
  descriptors.forEach((descriptor) => {
    const key = outputRefKey(descriptor.binding);
    routeGroups.set(key, [...(routeGroups.get(key) ?? []), descriptor]);
  });
  const selectedRoute =
    selected.kind === 'route'
      ? descriptors.find(
          (descriptor) =>
            descriptor.receiver.instance.id === selected.instanceId &&
            descriptor.port === selected.port
        )
      : undefined;

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const connections = connectionsRef.current;
    if (!grid || !connections) {
      return;
    }

    const measure = () => {
      const connectionsRect = connections.getBoundingClientRect();
      const ports: Record<string, FlowPoint> = {};
      const recordCenter = (key: string, element: Element) => {
        const rect = element.getBoundingClientRect();
        ports[key] = {
          x: rect.left + rect.width / 2 - connectionsRect.left,
          y: rect.top + rect.height / 2 - connectionsRect.top,
        };
      };

      grid.querySelectorAll<HTMLElement>('[data-flow-port-key]').forEach((element) => {
        const key = element.dataset.flowPortKey;
        if (key) {
          recordCenter(key, element);
        }
      });
      grid.querySelectorAll<HTMLElement>('[data-flow-port-overflow-keys]').forEach((element) => {
        const serializedKeys = element.dataset.flowPortOverflowKeys;
        if (!serializedKeys) {
          return;
        }
        const keys = JSON.parse(serializedKeys) as string[];
        keys.forEach((key) => recordCenter(key, element));
      });

      const next = {
        width: connectionsRect.width,
        height: connectionsRect.height,
        ports,
      };
      setMeasuredLayout((current) => (sameMeasuredLayout(current, next) ? current : next));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    grid
      .querySelectorAll<HTMLElement>('[data-flow-port-key], [data-flow-port-overflow-keys]')
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [instances, outputs, routes, rowCount]);

  const selectRoute = (descriptor: RouteDescriptor) =>
    onSelectRoute(descriptor.receiver.instance.id, descriptor.port);
  const handleRouteKey = (
    event: KeyboardEvent<SVGPolylineElement>,
    descriptor: RouteDescriptor
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectRoute(descriptor);
    }
  };

  return (
    <div className={classes.root}>
      <Group justify="space-between" className={classes.header}>
        <div>
          <Title order={2} size="h5">
            Modular lanes
          </Title>
          <Text c="dimmed" size="xs">
            Select a module, connection, or lane
          </Text>
        </div>
      </Group>
      <div className={classes.laneHeaders}>
        {compositionLanes.map((lane) => (
          <UnstyledButton
            key={lane.id}
            className={classes.laneHeader}
            data-selected={
              selected.kind === 'lane' && selected.laneId === lane.id ? true : undefined
            }
            aria-label={`Select lane ${lane.label}`}
            title={lane.description}
            onClick={() => onSelectLane(lane.id)}
          >
            {lane.label}
          </UnstyledButton>
        ))}
      </div>
      <div
        ref={gridRef}
        className={classes.grid}
        aria-label="Composition modular lane grid"
        style={{
          // Rows never shrink below what their tallest card actually needs
          // (title + subtitle + footer + port rails) — the 4.5rem floor only
          // keeps otherwise-empty rows from collapsing to nothing.
          gridTemplateRows: `repeat(${rowCount}, minmax(max(4.5rem, min-content), 1fr))`,
          backgroundSize: `25% ${100 / rowCount}%`,
        }}
      >
        <svg
          ref={connectionsRef}
          className={classes.connections}
          viewBox={`0 0 ${measuredLayout?.width ?? 1} ${measuredLayout?.height ?? 1}`}
          preserveAspectRatio="none"
        >
          {measuredLayout &&
            [...routeGroups.entries()].map(([sourceRef, group]) => {
              const first = group[0];
              const sourcePoint = measuredLayout.ports[outletElementKey(first.binding)];
              if (!sourcePoint) {
                return null;
              }
              const destinationYs = group
                .map(
                  (descriptor) =>
                    measuredLayout.ports[
                      inletElementKey(descriptor.receiver.instance.id, descriptor.port)
                    ]?.y
                )
                .filter((y): y is number => y !== undefined);
              const averageDestinationY = destinationYs.length
                ? destinationYs.reduce((sum, y) => sum + y, 0) / destinationYs.length
                : sourcePoint.y;
              const routeDirection = averageDestinationY >= sourcePoint.y ? 1 : -1;
              // Keep the elbow between the source and the nearest destination so the
              // final leg always approaches the inlet from the correct side, with a
              // visible stub, instead of overshooting and doubling back into it.
              const nearestGap = destinationYs.length
                ? Math.min(...destinationYs.map((y) => Math.abs(y - sourcePoint.y)))
                : 0;
              const desiredLead = group.length > 1 ? 50 : 20;
              const inletStub = 8;
              const trunkLead = Math.max(0, Math.min(desiredLead, nearestGap - inletStub));
              const junctionY = sourcePoint.y + routeDirection * trunkLead;
              const groupIsSelected = group.some(
                (descriptor) => descriptor.id === selectedRoute?.id
              );
              return (
                <g key={sourceRef}>
                  {group.length > 1 && (
                    <>
                      <line
                        className={classes.connection}
                        x1={sourcePoint.x}
                        x2={sourcePoint.x}
                        y1={sourcePoint.y}
                        y2={junctionY}
                      />
                      <circle
                        className={classes.junction}
                        data-active={groupIsSelected || undefined}
                        cx={sourcePoint.x}
                        cy={junctionY}
                        r="6"
                        aria-label={`${first.output?.label ?? 'Missing source'} used by ${group.length} routes`}
                      />
                    </>
                  )}
                  {group.map((descriptor) => {
                    const destinationPoint =
                      measuredLayout.ports[
                        inletElementKey(descriptor.receiver.instance.id, descriptor.port)
                      ];
                    if (!destinationPoint) {
                      return null;
                    }
                    const startPoint =
                      group.length > 1
                        ? `${sourcePoint.x},${junctionY}`
                        : `${sourcePoint.x},${sourcePoint.y} ${sourcePoint.x},${junctionY}`;
                    const points = `${startPoint} ${destinationPoint.x},${junctionY} ${destinationPoint.x},${destinationPoint.y}`;
                    const destinationLabel = compositionInstanceLabel(
                      descriptor.receiver.instance,
                      instances
                    );
                    const sourceLabel = descriptor.output?.label ?? 'Missing source';
                    const isSelected =
                      selected.kind === 'route' &&
                      selected.instanceId === descriptor.receiver.instance.id &&
                      selected.port === descriptor.port;
                    const muted = descriptor.bypassed || !descriptor.output;
                    const portName =
                      routedModulePorts[descriptor.receiver.instance.moduleId]?.find(
                        (candidate) => candidate.id === descriptor.port
                      )?.label ?? descriptor.port;
                    const ariaLabel = `Select ${portName.toLowerCase()} route from ${sourceLabel} to ${destinationLabel}`;
                    return (
                      <g key={descriptor.id}>
                        <polyline
                          className={classes.connection}
                          data-muted={muted || undefined}
                          data-selected={isSelected || undefined}
                          points={points}
                        />
                        <polyline
                          className={classes.connectionHit}
                          points={points}
                          role="button"
                          tabIndex={0}
                          aria-label={ariaLabel}
                          onClick={() => selectRoute(descriptor)}
                          onKeyDown={(event) => handleRouteKey(event, descriptor)}
                        >
                          <title>{ariaLabel}</title>
                        </polyline>
                      </g>
                    );
                  })}
                </g>
              );
            })}
        </svg>

        {layouts.map((layout) => {
          const { instance } = layout;
          const label = compositionInstanceLabel(instance, instances);
          const selectedModule = selected.kind === 'module' && selected.instanceId === instance.id;
          const instanceOutputs = outputs.filter(
            (candidate) => candidate.ref.instanceId === instance.id
          );
          const primaryOutput =
            instance.moduleId === 'interference'
              ? instanceOutputs.find((candidate) => candidate.ref.port === 'resultant')
              : instanceOutputs[0];
          const subtitle = primaryOutput
            ? `${primaryOutput.packet.kind} | ${primaryOutput.packet.domain}`
            : instance.moduleId === 'melodicization'
              ? 'events | note'
              : instance.moduleId === 'pitch-list'
                ? 'list | pitch'
                : instance.moduleId === 'arithmetic'
                  ? 'list | integer'
                  : 'list | duration';
          const useCount = descriptors.filter(
            (descriptor) => descriptor.binding.instanceId === instance.id
          ).length;
          const participatesInSelectedFlow =
            selectedRoute?.receiver.instance.id === instance.id ||
            selectedRoute?.binding.instanceId === instance.id;
          const incoming = descriptors.filter(
            (descriptor) => descriptor.receiver.instance.id === instance.id
          );
          // A module producing no output at all is a real problem (red footer bar). A module
          // that produced output but has soft notices — e.g. Zip trimming trailing items — is
          // expected/informational, not an error: it gets a small flag on the card's edge
          // instead of hijacking the footer with alarming text.
          const footerWarnings = primaryOutput?.packet.warnings ?? [];
          const footerError = !primaryOutput;
          const footerDetail = !primaryOutput
            ? 'Connect this module’s required inputs to produce output.'
            : undefined;
          const noticeDetail = footerWarnings.length > 0 ? footerWarnings.join('\n') : undefined;
          const footer = !primaryOutput
            ? 'Needs inputs'
            : instanceOutputs.length > 1
              ? '' // Multiple valid outputs: no single count is representative.
              : instance.moduleId === 'pitch-list'
                ? `Pitches | ${primaryOutput.packet.items.length}`
                : instance.moduleId === 'arithmetic'
                  ? `Result | ${primaryOutput.packet.items.length}`
                  : instance.moduleId === 'fractioning'
                    ? `Durations | ${primaryOutput.packet.items.length}`
                    : `Notes | ${primaryOutput.packet.items.length}`;
          const inletPorts: FlowCellPort[] = (routedModulePorts[instance.moduleId] ?? []).map(
            ({ id: port, label: portName }) => {
              const descriptor = incoming.find((candidate) => candidate.port === port);
              if (!descriptor) {
                return {
                  id: port,
                  elementKey: inletElementKey(instance.id, port),
                  label: `${portName} input | unconnected`,
                  shortLabel: portName[0],
                  ariaLabel: `${portName} input | unconnected`,
                  unavailable: true,
                };
              }
              return {
                id: port,
                elementKey: inletElementKey(instance.id, port),
                label: `${descriptor.output?.label ?? 'Missing source'} → ${label}${
                  descriptor.identity ? '' : ` | ${descriptor.summary}`
                }`,
                shortLabel: portName[0],
                ariaLabel: descriptor.identity
                  ? `Inspect ${portName.toLowerCase()} inlet`
                  : `Adjust ${portName.toLowerCase()} route: ${descriptor.summary}`,
                modified: !descriptor.identity,
                selected:
                  selected.kind === 'route' &&
                  selected.instanceId === instance.id &&
                  selected.port === descriptor.port,
                bypassed: descriptor.bypassed,
                unavailable: !descriptor.output,
                onClick: () => selectRoute(descriptor),
              };
            }
          );
          const outletPorts: FlowCellPort[] = instanceOutputs.map((candidate, index) => ({
            id: outputRefKey(candidate.ref),
            elementKey: outletElementKey(candidate.ref),
            label: `${candidate.label} | ${candidate.packet.items.length} items${
              useCount ? ` | ${useCount} downstream ${useCount === 1 ? 'use' : 'uses'}` : ''
            }`,
            shortLabel: outputShortLabel(candidate, index),
            ariaLabel: `Inspect outlet ${candidate.label}`,
            selected:
              selectedRoute?.binding.instanceId === instance.id &&
              selectedRoute.binding.port === candidate.ref.port,
            onClick: () => onSelectModule(instance.id),
          }));

          return (
            <FlowCell
              key={instance.id}
              title={label}
              subtitle={subtitle}
              footer={footer}
              footerDetail={footerDetail}
              footerError={footerError}
              noticeDetail={noticeDetail}
              inlets={inletPorts}
              outlets={outletPorts}
              laneId={instance.laneId}
              instanceId={instance.id}
              style={{ gridColumn: instance.laneId, gridRow: layout.moduleRow }}
              active={activeInstanceId === instance.id}
              selected={selectedModule}
              flowActive={participatesInSelectedFlow}
              onSelect={() => onSelectModule(instance.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
