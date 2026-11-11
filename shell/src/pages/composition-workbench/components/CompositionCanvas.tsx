import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeHandle,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Menu, useComputedColorScheme } from '@mantine/core';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  tidyLayout,
  type Position as CanvasPosition,
} from '../compositionLayout';
import {
  outputRefKey,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import {
  compositionInstanceLabel,
  compositionModuleLabels,
  mixerPortLabels,
  type CompositionInspectorTarget,
  type CompositionModuleId,
  type CompositionModuleInstance,
  type ModuleRouteStates,
} from '../compositionWorkspace';
import { signalTypeRegistry } from '../signalTypes';
import {
  categoryOfInlet,
  categoryOfModule,
  categoryOfPacket,
  signalCategoryColor,
  type SignalCategory,
} from '../signalCategories';
import { FlowCell, MAX_VISIBLE_PORTS, type FlowCellPort } from './FlowCell';
import classes from './CompositionCanvas.module.css';

interface CompositionCanvasProps {
  activeInstanceId: string | null;
  selected: CompositionInspectorTarget;
  instances: CompositionModuleInstance[];
  routes: ModuleRouteStates;
  outputs: PublishedCompositionOutput[];
  onSelectModule(instanceId: string): void;
  onSelectRoute(instanceId: string, port: string): void;
  onSelectCanvas(): void;
  onMoveModules(positions: Record<string, CanvasPosition>): void;
  onTidy(positions: Record<string, CanvasPosition>): void;
  /** Without a position the module takes the first free slot; a position is in canvas coordinates. */
  onAddModule(moduleId: CompositionModuleId, position?: CanvasPosition): void;
}

interface RouteDescriptor {
  id: string;
  receiver: CompositionModuleInstance;
  port: string;
  binding: CompositionOutputRef;
  output?: PublishedCompositionOutput;
  source?: CompositionModuleInstance;
  bypassed: boolean;
  summary: string;
  identity: boolean;
}

interface PortLabel {
  id: string;
  label: string;
  shortLabel?: string;
}

const routedModulePorts: Partial<Record<CompositionModuleId, PortLabel[]>> = {
  melodicization: [
    { id: 'rhythm', label: 'Rhythm' },
    { id: 'pitches', label: 'Pitch' },
  ],
  arithmetic: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  'scale-evolution': [{ id: 'sequence', label: 'Sequence' }],
  'rhythm-edit': [{ id: 'rhythm', label: 'Rhythm' }],
  'rhythm-householder': [
    { id: 'rhythm', label: 'Rhythm' },
    { id: 'axis', label: 'Axis' },
  ],
};

/** A module's inlets: fixed per module, except the mixer, whose channels live in its route state. */
function inletsFor(
  moduleId: CompositionModuleId,
  routeState: ModuleRouteStates[string] | undefined
) {
  return moduleId === 'mixer' ? mixerPortLabels(routeState) : routedModulePorts[moduleId];
}

function outputFor(outputs: PublishedCompositionOutput[], ref: CompositionOutputRef | undefined) {
  return ref
    ? outputs.find(
        (output) => output.ref.instanceId === ref.instanceId && output.ref.port === ref.port
      )
    : undefined;
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

/**
 * Where each port's cable anchor should sit before the browser has measured the card. Real
 * measurements replace these as soon as they exist; they only keep first paint (and environments
 * that never measure, like tests) drawing cables in about the right place.
 */
function estimateHandles(inlets: FlowCellPort[], outlets: FlowCellPort[]): NodeHandle[] {
  const place = (ports: FlowCellPort[], type: 'source' | 'target'): NodeHandle[] => {
    const overflow = ports.length > MAX_VISIBLE_PORTS;
    const tracks = overflow ? MAX_VISIBLE_PORTS : ports.length;
    return ports.map((port, index) => {
      const track = overflow ? Math.min(index, MAX_VISIBLE_PORTS - 1) : index;
      return {
        id: port.id,
        type,
        position: type === 'target' ? Position.Top : Position.Bottom,
        x: 5 + ((track + 0.5) * (NODE_WIDTH - 10)) / tracks,
        y: type === 'target' ? 0 : NODE_HEIGHT,
        width: 1,
        height: 1,
      };
    });
  };
  return [...place(inlets, 'target'), ...place(outlets, 'source')];
}

type ModuleNodeData = { cell: Parameters<typeof FlowCell>[0] } & Record<string, unknown>;
type ModuleNode = Node<ModuleNodeData, 'module'>;

const ModuleNodeView = memo(function ModuleNodeView({ data }: NodeProps<ModuleNode>) {
  return <FlowCell {...data.cell} />;
});

interface RouteEdgeData extends Record<string, unknown> {
  ariaLabel: string;
  selected: boolean;
  muted: boolean;
  related: boolean;
  badge: string | null;
  category: SignalCategory;
  onSelect(): void;
}
type RouteEdge = Edge<RouteEdgeData, 'route'>;

function RouteEdgeView({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<RouteEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  if (!data) {
    return null;
  }
  const onKeyDown = (event: KeyboardEvent<SVGPathElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      data.onSelect();
    }
  };
  return (
    <>
      <path
        className={classes.connection}
        style={{ '--category': signalCategoryColor(data.category) } as CSSProperties}
        data-muted={data.muted || undefined}
        data-selected={data.selected || undefined}
        data-related={data.related || undefined}
        d={path}
      />
      <path
        className={classes.connectionHit}
        d={path}
        role="button"
        tabIndex={0}
        aria-label={data.ariaLabel}
        onClick={data.onSelect}
        onKeyDown={onKeyDown}
      >
        <title>{data.ariaLabel}</title>
      </path>
      {data.badge && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={`${classes.edgeBadge} nodrag nopan`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onClick={data.onSelect}
          >
            {data.badge}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { module: ModuleNodeView };
const edgeTypes = { route: RouteEdgeView };

/** Modules reachable from `start` following connections forward and backward. */
function connectedFlow(start: string, descriptors: RouteDescriptor[]) {
  const reachable = new Set<string>();
  const walk = (from: 'source' | 'receiver') => {
    const frontier = [start];
    const seen = new Set(frontier);
    while (frontier.length) {
      const current = frontier.pop()!;
      descriptors.forEach((descriptor) => {
        const here = from === 'source' ? descriptor.source?.id : descriptor.receiver.id;
        const next = from === 'source' ? descriptor.receiver.id : descriptor.source?.id;
        if (here === current && next && !seen.has(next)) {
          seen.add(next);
          reachable.add(next);
          frontier.push(next);
        }
      });
    }
  };
  walk('source');
  walk('receiver');
  reachable.add(start);
  return reachable;
}

function ModuleMenuItems({ onPick }: { onPick(moduleId: CompositionModuleId): void }) {
  return (
    <>
      {(Object.keys(compositionModuleLabels) as CompositionModuleId[]).map((moduleId) => (
        <Menu.Item key={moduleId} onClick={() => onPick(moduleId)}>
          {compositionModuleLabels[moduleId]}
        </Menu.Item>
      ))}
    </>
  );
}

function CanvasBody({
  activeInstanceId,
  selected,
  instances,
  routes,
  outputs,
  onSelectModule,
  onSelectRoute,
  onSelectCanvas,
  onMoveModules,
  onTidy,
  onAddModule,
}: CompositionCanvasProps) {
  const colorScheme = useComputedColorScheme('light');
  const { fitView, screenToFlowPosition } = useReactFlow();
  // Where a right-click opened the module menu: the screen point for the menu, the canvas point for the card.
  const [contextMenu, setContextMenu] = useState<{
    screen: { x: number; y: number };
    canvas: CanvasPosition;
  } | null>(null);
  // A module placed at a chosen point must stay where it was put, so the re-frame is skipped.
  const keepView = useRef(false);
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));
  const descriptors: RouteDescriptor[] = instances.flatMap((instance) => {
    const routeState = routes[instance.id];
    const ports = inletsFor(instance.moduleId, routeState);
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
          id: `${instance.id}:${port}`,
          receiver: instance,
          port,
          binding: binding.source,
          output,
          source: instanceById.get(binding.source.instanceId),
          bypassed: Boolean((binding.treatment as { bypassed?: boolean } | undefined)?.bypassed),
          summary: definition.summary(binding.treatment, output?.packet),
          identity: definition.isIdentity(binding.treatment, output?.packet),
        },
      ];
    });
  });
  const selectedRoute =
    selected.kind === 'route'
      ? descriptors.find(
          (descriptor) =>
            descriptor.receiver.id === selected.instanceId && descriptor.port === selected.port
        )
      : undefined;
  const flowOfSelectedModule = useMemo(
    () =>
      selected.kind === 'module' ? connectedFlow(selected.instanceId, descriptors) : undefined,
    // `descriptors` is rebuilt every render; its content only changes with these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, instances, routes, outputs]
  );

  // Cards: everything FlowCell needs, derived from the same routing state as before.
  const derivedNodes = useMemo<ModuleNode[]>(() => {
    return instances.map((instance) => {
      const label = compositionInstanceLabel(instance, instances);
      const selectedModule = selected.kind === 'module' && selected.instanceId === instance.id;
      const instanceOutputs = outputs.filter(
        (candidate) => candidate.ref.instanceId === instance.id
      );
      const primaryOutput =
        instance.moduleId === 'interference'
          ? instanceOutputs.find((candidate) => candidate.ref.port === 'resultant')
          : instanceOutputs[0];
      const isMixer = instance.moduleId === 'mixer';
      const mixerChannelCount = Object.keys(routes[instance.id] ?? {}).length;
      const subtitle = isMixer
        ? `mix | ${mixerChannelCount} ${mixerChannelCount === 1 ? 'channel' : 'channels'}`
        : primaryOutput
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
        selectedRoute?.receiver.id === instance.id ||
        selectedRoute?.binding.instanceId === instance.id;
      const incoming = descriptors.filter((descriptor) => descriptor.receiver.id === instance.id);
      // A module producing no output at all is a real problem (red footer bar). A module
      // that produced output but has soft notices — e.g. Zip trimming trailing items — is
      // expected/informational, not an error: it gets a small flag on the card's edge
      // instead of hijacking the footer with alarming text.
      const footerWarnings = primaryOutput?.packet.warnings ?? [];
      // The mixer is a sink: it publishes nothing, so "no output" is its normal state and only
      // an empty mix is a problem.
      const footerError = isMixer ? incoming.length === 0 : !primaryOutput;
      const footerDetail = footerError
        ? 'Connect this module’s required inputs to produce output.'
        : undefined;
      const noticeDetail = footerWarnings.length > 0 ? footerWarnings.join('\n') : undefined;
      const footer = isMixer
        ? incoming.length
          ? `Channels | ${incoming.length}`
          : 'Needs inputs'
        : !primaryOutput
          ? 'Needs inputs'
          : instanceOutputs.length > 1
            ? '' // Multiple valid outputs: no single count is representative.
            : instance.moduleId === 'pitch-list'
              ? `Pitches | ${primaryOutput.packet.items.length}`
              : instance.moduleId === 'arithmetic'
                ? `Result | ${primaryOutput.packet.items.length}`
                : instance.moduleId === 'fractioning' ||
                  instance.moduleId === 'rhythm-list' ||
                  instance.moduleId === 'rhythm-edit'
                  ? `Durations | ${primaryOutput.packet.items.length}`
                  : `Notes | ${primaryOutput.packet.items.length}`;
      const selectRoute = (descriptor: RouteDescriptor) =>
        onSelectRoute(descriptor.receiver.id, descriptor.port);
      const inlets: FlowCellPort[] = (inletsFor(instance.moduleId, routes[instance.id]) ?? []).map(
        ({ id: port, label: portName, shortLabel }) => {
          const descriptor = incoming.find((candidate) => candidate.port === port);
          if (!descriptor) {
            return {
              id: port,
              label: `${portName} input | unconnected`,
              shortLabel: shortLabel ?? portName[0],
              ariaLabel: `${portName} input | unconnected`,
              unavailable: true,
              category: categoryOfInlet(instance.moduleId, port),
            };
          }
          return {
            id: port,
            label: `${descriptor.output?.label ?? 'Missing source'} → ${label}${
              descriptor.identity ? '' : ` | ${descriptor.summary}`
            }`,
            shortLabel: shortLabel ?? portName[0],
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
            category: categoryOfInlet(instance.moduleId, port),
            onClick: () => selectRoute(descriptor),
          };
        }
      );
      const outlets: FlowCellPort[] = instanceOutputs.map((candidate, index) => ({
        id: outputRefKey(candidate.ref),
        label: `${candidate.label} | ${candidate.packet.items.length} items${
          useCount ? ` | ${useCount} downstream ${useCount === 1 ? 'use' : 'uses'}` : ''
        }`,
        shortLabel: outputShortLabel(candidate, index),
        ariaLabel: `Inspect outlet ${candidate.label}`,
        category: categoryOfPacket(candidate.packet),
        selected:
          selectedRoute?.binding.instanceId === instance.id &&
          selectedRoute.binding.port === candidate.ref.port,
        onClick: () => onSelectModule(instance.id),
      }));

      return {
        id: instance.id,
        type: 'module',
        position: { x: instance.x, y: instance.y },
        initialWidth: NODE_WIDTH,
        initialHeight: NODE_HEIGHT,
        handles: estimateHandles(inlets, outlets),
        data: {
          cell: {
            title: label,
            category: categoryOfModule(instance.moduleId),
            subtitle,
            footer,
            footerDetail,
            footerError,
            noticeDetail,
            inlets,
            outlets,
            instanceId: instance.id,
            active: activeInstanceId === instance.id,
            selected: selectedModule,
            flowActive: participatesInSelectedFlow,
            onSelect: () => onSelectModule(instance.id),
          },
        },
      };
    });
    // `descriptors` and `selectedRoute` derive from these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, routes, outputs, selected, activeInstanceId, onSelectModule, onSelectRoute]);

  // React Flow needs to own each node's measured size and drag state between renders, so the nodes
  // live in local state and are re-synced from the derived cards whenever routing state changes.
  const [nodes, setNodes] = useState<ModuleNode[]>(derivedNodes);
  useEffect(() => {
    setNodes((previous) => {
      const byId = new Map(previous.map((node) => [node.id, node]));
      return derivedNodes.map((node) => {
        const old = byId.get(node.id);
        if (!old) {
          return node;
        }
        const next: ModuleNode = {
          ...node,
          measured: old.measured,
          selected: old.selected,
          dragging: old.dragging,
          position: old.dragging ? old.position : node.position,
        };
        // Once a card is measured its real port positions win over the estimates.
        if (old.measured?.width) {
          delete next.handles;
        }
        return next;
      });
    });
  }, [derivedNodes]);

  const onNodesChange = useCallback((changes: NodeChange<ModuleNode>[]) => {
    setNodes((current) =>
      applyNodeChanges(changes, current).map((node) => {
        if (node.measured?.width && node.handles) {
          const { handles: _estimates, ...rest } = node;
          return rest;
        }
        return node;
      })
    );
  }, []);

  const edges = useMemo<RouteEdge[]>(
    () =>
      descriptors.flatMap((descriptor) => {
        if (!descriptor.source || !descriptor.output) {
          return [];
        }
        const receiverLabel = compositionInstanceLabel(descriptor.receiver, instances);
        const sourceLabel = descriptor.output.label;
        const portName =
          inletsFor(descriptor.receiver.moduleId, routes[descriptor.receiver.id])?.find(
            (candidate) => candidate.id === descriptor.port
          )?.label ?? descriptor.port;
        const isSelected =
          selected.kind === 'route' &&
          selected.instanceId === descriptor.receiver.id &&
          selected.port === descriptor.port;
        return [
          {
            id: descriptor.id,
            type: 'route',
            selectable: false,
            source: descriptor.source.id,
            sourceHandle: outputRefKey(descriptor.binding),
            target: descriptor.receiver.id,
            targetHandle: descriptor.port,
            data: {
              ariaLabel: `Select ${portName.toLowerCase()} route from ${sourceLabel} to ${receiverLabel}`,
              selected: isSelected,
              muted: descriptor.bypassed,
              related: Boolean(
                flowOfSelectedModule?.has(descriptor.receiver.id) &&
                flowOfSelectedModule.has(descriptor.source.id)
              ),
              badge: descriptor.identity ? null : descriptor.summary,
              category: categoryOfPacket(descriptor.output.packet),
              onSelect: () => onSelectRoute(descriptor.receiver.id, descriptor.port),
            },
          },
        ];
      }),
    // `descriptors` derives from these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instances, routes, outputs, selected, flowOfSelectedModule, onSelectRoute]
  );

  // Frame the patch whenever modules are added or removed, so a new card is never off-screen.
  const instanceCount = useRef(instances.length);
  useEffect(() => {
    if (instanceCount.current !== instances.length) {
      instanceCount.current = instances.length;
      if (keepView.current) {
        keepView.current = false;
        return;
      }
      void fitView({ padding: 0.25, maxZoom: 1, duration: 200 });
    }
  }, [instances.length, fitView]);

  const handleTidy = () => {
    const connections = descriptors.flatMap((descriptor) =>
      descriptor.source ? [{ from: descriptor.source.id, to: descriptor.receiver.id }] : []
    );
    onTidy(tidyLayout(instances, connections));
    requestAnimationFrame(() => void fitView({ padding: 0.25, maxZoom: 1, duration: 300 }));
  };

  return (
    <div className={classes.root}>
      <div
        className={classes.flow}
        aria-label="Composition canvas"
        data-multi-selection={nodes.filter((node) => node.selected).length > 1 || undefined}
      >
        <ReactFlow<ModuleNode, RouteEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          // `dragged` holds every card that moved, so a multi-selection lands together.
          onNodeDragStop={(_event, _node, dragged) =>
            onMoveModules(
              Object.fromEntries(
                dragged.map((node) => [
                  node.id,
                  { x: Math.round(node.position.x), y: Math.round(node.position.y) },
                ])
              )
            )
          }
          onPaneClick={() => {
            setContextMenu(null);
            onSelectCanvas();
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            const at = { x: (event as ReactMouseEvent).clientX, y: (event as ReactMouseEvent).clientY };
            const point = screenToFlowPosition(at);
            setContextMenu({
              screen: at,
              canvas: { x: Math.round(point.x / 10) * 10, y: Math.round(point.y / 10) * 10 },
            });
          }}
          colorMode={colorScheme}
          snapToGrid
          snapGrid={[10, 10]}
          fitView
          fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
          minZoom={0.3}
          maxZoom={1.5}
          nodesConnectable={false}
          // Ctrl/Cmd-click adds to the selection and Shift-drag box-selects; dragging any
          // selected card moves the whole group. Delete must not drop cards from the canvas
          // while leaving their modules in the patch.
          multiSelectionKeyCode={['Control', 'Meta']}
          deleteKeyCode={null}
          nodesFocusable={false}
          edgesFocusable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          zoomActivationKeyCode={['Control', 'Meta']}
        >
          {/* Dots, not lines: nothing snaps to the grid, so it only gives a sense of scale. */}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.6} color="color-mix(in srgb, var(--panel-well) 20%, var(--panel-body))" />
          <Panel position="bottom-left" className={classes.tools}>
            <Menu position="top-start" withinPortal>
              <Menu.Target>
                <Button variant="light">Add module</Button>
              </Menu.Target>
              <Menu.Dropdown>
                <ModuleMenuItems onPick={(moduleId) => onAddModule(moduleId)} />
              </Menu.Dropdown>
            </Menu>
            <Button
              variant="default"
              disabled={instances.length === 0}
              onClick={handleTidy}
              title="Rearrange modules top to bottom by signal flow. Connections are not changed."
            >
              Tidy
            </Button>
          </Panel>
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className={classes.minimap} />
        </ReactFlow>
      </div>
      <Menu
        opened={contextMenu !== null}
        onChange={(opened) => !opened && setContextMenu(null)}
        position="bottom-start"
        withinPortal
      >
        <Menu.Target>
          <div
            className={classes.contextAnchor}
            style={{ left: contextMenu?.screen.x ?? 0, top: contextMenu?.screen.y ?? 0 }}
          />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Add module here</Menu.Label>
          <ModuleMenuItems
            onPick={(moduleId) => {
              if (contextMenu) {
                keepView.current = true;
                onAddModule(moduleId, contextMenu.canvas);
              }
            }}
          />
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

export function CompositionCanvas(props: CompositionCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasBody {...props} />
    </ReactFlowProvider>
  );
}
