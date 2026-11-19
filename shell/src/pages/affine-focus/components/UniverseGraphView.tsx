import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, NativeSelect, SegmentedControl } from '@mantine/core';
import {
  findShortestTransformPath,
  type ClosureEdge,
  type ClosureGraph,
  type ClosureNode,
  type GamutPitch,
  type TrajectoryStep,
  type TransformConfig,
} from '../../../lib/affine-focus';
import { buildMermaidDiagram, triggerFileDownload, type MermaidSliceMode } from '../export';
import {
  buildFullEdgeMapSvg,
  computeUniverseGraphLayout,
  DEFAULT_EXPORT_PALETTE,
  shouldShowNodeLabel,
  type GraphLabelMode,
  type SvgPalette,
} from '../graphMap';
import type { GraphMapLayout, GraphViewMode } from '../state';
import classes from '../AffineFocus.module.css';

let mermaidCounter = 0;

function resolvePaletteFromElement(el: HTMLElement | null): Partial<SvgPalette> {
  if (!el || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return DEFAULT_EXPORT_PALETTE;
  }
  const style = window.getComputedStyle(el);
  const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: pick('--panel', DEFAULT_EXPORT_PALETTE.bg),
    guide: pick('--grid', DEFAULT_EXPORT_PALETTE.guide),
    text: pick('--text', DEFAULT_EXPORT_PALETTE.text),
    textMuted: pick('--text-muted', DEFAULT_EXPORT_PALETTE.textMuted),
    edge: pick('--text-muted', DEFAULT_EXPORT_PALETTE.edge),
    edgeTrajectory: pick('--mark-blue', DEFAULT_EXPORT_PALETTE.edgeTrajectory),
    edgeSelected: pick('--mark-green', DEFAULT_EXPORT_PALETTE.edgeSelected),
    nodeFill: pick('--panel-slot', DEFAULT_EXPORT_PALETTE.nodeFill),
    nodeStroke: pick('--control-border', DEFAULT_EXPORT_PALETTE.nodeStroke),
    seedFill: pick('--mark-yellow', DEFAULT_EXPORT_PALETTE.seedFill),
    trajectoryFill: pick('--mark-blue', DEFAULT_EXPORT_PALETTE.trajectoryFill),
    selectedStroke: pick('--mark-green', DEFAULT_EXPORT_PALETTE.selectedStroke),
    attractorStroke: pick('--mark-cyan', DEFAULT_EXPORT_PALETTE.attractorStroke),
  };
}

export function UniverseGraphView({
  config,
  closure,
  trajectory,
  viewMode,
  layoutMode,
  selectedNodeId,
  onChangeViewMode,
  onChangeLayoutMode,
  onSelectNode,
  onLoadPathToTrajectory,
  onPlayPitches,
}: {
  config: TransformConfig;
  closure: ClosureGraph;
  trajectory: readonly TrajectoryStep[];
  viewMode: GraphViewMode;
  layoutMode: GraphMapLayout;
  selectedNodeId: string;
  onChangeViewMode: (m: GraphViewMode) => void;
  onChangeLayoutMode: (l: GraphMapLayout) => void;
  onSelectNode: (node: ClosureNode) => void;
  onLoadPathToTrajectory: (edges: ClosureEdge[]) => void;
  onPlayPitches: (pitches: readonly GamutPitch[]) => void;
}) {
  const [labelMode, setLabelMode] = useState<GraphLabelMode>('auto');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null
  );
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Mermaid-specific state
  const [mermaidSlice, setMermaidSlice] = useState<MermaidSliceMode>(() =>
    closure.nodes.length <= 90 && closure.edges.length <= 360 ? 'full' : 'max-gen'
  );
  const [mermaidDir, setMermaidDir] = useState<'TD' | 'LR'>('TD');
  const [mermaidMaxGen, setMermaidMaxGen] = useState<number>(3);
  const [mermaidSccId, setMermaidSccId] = useState<number>(0);
  const [forceLargeMermaid, setForceLargeMermaid] = useState(false);
  const [showMermaidSource, setShowMermaidSource] = useState(false);
  const [copiedMmd, setCopiedMmd] = useState(false);
  const [mermaidSvg, setMermaidSvg] = useState<string>('');
  const [mermaidError, setMermaidError] = useState<string | null>(null);
  const [mermaidRendering, setMermaidRendering] = useState(false);
  const mermaidHostRef = useRef<HTMLDivElement | null>(null);

  // Reset pan/zoom when graph geometry changes significantly
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setForceLargeMermaid(false);
    // Pick a comfortable default maxGen cap when switching to a large closure
    let cum = 0;
    let safeGen = 0;
    for (let g = 0; g < closure.generations.length; g += 1) {
      cum += closure.generations[g].length;
      if (cum <= 64 || g === 0) {
        safeGen = g;
      } else {
        break;
      }
    }
    setMermaidMaxGen(safeGen);
    if (mermaidSccId >= closure.sccs.length) {
      setMermaidSccId(0);
    }
  }, [closure, layoutMode]);

  const layout = useMemo(
    () => computeUniverseGraphLayout(closure, trajectory, layoutMode),
    [closure, trajectory, layoutMode]
  );

  const activeFocusId = hoveredNodeId ?? selectedNodeId;
  const activeNodeLayout = layout.nodeById.get(activeFocusId) ?? layout.nodes[0] ?? null;

  const incidentNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!hoveredNodeId) {
      return ids;
    }
    ids.add(hoveredNodeId);
    for (const e of closure.edges) {
      if (e.source === hoveredNodeId) {
        ids.add(e.target);
      } else if (e.target === hoveredNodeId) {
        ids.add(e.source);
      }
    }
    return ids;
  }, [closure.edges, hoveredNodeId]);

  const mermaidDiagram = useMemo(
    () =>
      buildMermaidDiagram(closure, {
        direction: mermaidDir,
        slice: mermaidSlice,
        maxGeneration: mermaidMaxGen,
        sccId: mermaidSccId,
        trajectory,
      }),
    [closure, mermaidDir, mermaidSlice, mermaidMaxGen, mermaidSccId, trajectory]
  );

  const mermaidTooLarge =
    !forceLargeMermaid && (mermaidDiagram.nodeCount > 110 || mermaidDiagram.edgeCount > 400);

  // Render Mermaid SVG lazily when Mermaid mode is active and within safe threshold
  useEffect(() => {
    if (viewMode !== 'mermaid' || mermaidTooLarge) {
      setMermaidSvg('');
      setMermaidError(null);
      setMermaidRendering(false);
      return;
    }

    let cancelled = false;
    setMermaidRendering(true);
    setMermaidError(null);

    void (async () => {
      try {
        const mod = await import('mermaid');
        const mermaid = mod.default;
        const colorScheme =
          typeof document !== 'undefined'
            ? document.documentElement.getAttribute('data-mantine-color-scheme')
            : 'dark';
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: colorScheme === 'light' ? 'default' : 'dark',
          maxEdges: 4000,
          maxTextSize: 500000,
          flowchart: { useMaxWidth: false, htmlLabels: false },
        });
        mermaidCounter += 1;
        const renderId = `affine_focus_mmd_${mermaidCounter}`;
        const { svg } = await mermaid.render(renderId, mermaidDiagram.code);
        if (!cancelled) {
          setMermaidSvg(svg);
          setMermaidRendering(false);
        }
      } catch (err) {
        if (!cancelled) {
          setMermaidSvg('');
          setMermaidError(err instanceof Error ? err.message : 'Unable to render Mermaid SVG.');
          setMermaidRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, mermaidDiagram.code, mermaidTooLarge]);

  // Attach parsed Mermaid SVG safely into the host element
  useEffect(() => {
    const host = mermaidHostRef.current;
    if (!host) {
      return;
    }
    if (!mermaidSvg) {
      host.replaceChildren();
      return;
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(mermaidSvg, 'image/svg+xml');
      const errNode = doc.querySelector('parsererror');
      if (!errNode && doc.documentElement) {
        const imported = document.importNode(doc.documentElement, true);
        host.replaceChildren(imported);
        return;
      }
    } catch {
      // ignore and fall back
    }
    host.replaceChildren();
  }, [mermaidSvg]);

  const handleDownloadFullEdgeSvg = () => {
    const svg = buildFullEdgeMapSvg(layout, {
      labelMode,
      selectedNodeId,
      palette: resolvePaletteFromElement(canvasRef.current),
      title: `${config.gamut.name} · ${closure.nodes.length} sets · ${closure.edges.length} edges`,
    });
    triggerFileDownload('affine-focus-edge-map.svg', svg, 'image/svg+xml');
  };

  const handleDownloadMermaidSvg = () => {
    if (!mermaidSvg) {
      return;
    }
    triggerFileDownload('affine-focus-mermaid.svg', mermaidSvg, 'image/svg+xml');
  };

  const handleCopyMermaid = async () => {
    try {
      await navigator.clipboard.writeText(mermaidDiagram.code);
      setCopiedMmd(true);
      window.setTimeout(() => setCopiedMmd(false), 1500);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-interactive="true"]')) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.4, Math.min(8, Number((z * factor).toFixed(2)))));
  };

  const selectedShortestPath = useMemo(() => {
    if (!activeNodeLayout || activeNodeLayout.node.isSeed) {
      return [];
    }
    return findShortestTransformPath(closure, closure.seedId, activeNodeLayout.node.id) ?? [];
  }, [closure, activeNodeLayout]);

  return (
    <div className={classes.universeGraphWrap} data-testid="universe-graph-view">
      {/* Top Controls Row */}
      <div className={classes.graphToolbar}>
        <SegmentedControl
          size="xs"
          aria-label="Universe graph renderer"
          value={viewMode}
          onChange={(v) => onChangeViewMode(v as GraphViewMode)}
          data={[
            { label: 'Full Edge Map (SVG)', value: 'svg-map' },
            { label: 'Mermaid Flowchart', value: 'mermaid' },
          ]}
        />

        {viewMode === 'svg-map' ? (
          <>
            <SegmentedControl
              size="xs"
              aria-label="Edge map layout"
              value={layoutMode}
              onChange={(v) => onChangeLayoutMode(v as GraphMapLayout)}
              data={[
                { label: 'Radial Rings', value: 'radial' },
                { label: 'Gen Columns', value: 'columns' },
              ]}
            />
            <SegmentedControl
              size="xs"
              aria-label="Node label visibility"
              value={labelMode}
              onChange={(v) => setLabelMode(v as GraphLabelMode)}
              data={[
                { label: 'Auto', value: 'auto' },
                { label: 'Path', value: 'path' },
                { label: 'All', value: 'all' },
              ]}
            />
            <div className={classes.graphZoomGroup}>
              <Button
                size="compact-xs"
                variant="default"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.4, Number((z * 0.8).toFixed(2))))}
              >
                −
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                Fit ({Math.round(zoom * 100)}%)
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(8, Number((z * 1.25).toFixed(2))))}
              >
                +
              </Button>
            </div>
            <Button size="compact-xs" variant="light" onClick={handleDownloadFullEdgeSvg}>
              Download .svg
            </Button>
          </>
        ) : (
          <>
            <NativeSelect
              size="xs"
              aria-label="Mermaid slice"
              value={mermaidSlice}
              onChange={(e) => {
                setForceLargeMermaid(false);
                setMermaidSlice(e.currentTarget.value as MermaidSliceMode);
              }}
              data={[
                { label: 'Full Closure', value: 'full' },
                { label: 'Max Generation', value: 'max-gen' },
                { label: 'Single Orbit (SCC)', value: 'orbit' },
                { label: 'Trajectory Neighborhood', value: 'trajectory' },
              ]}
            />
            {mermaidSlice === 'max-gen' && (
              <NativeSelect
                size="xs"
                aria-label="Max generation depth"
                value={String(mermaidMaxGen)}
                onChange={(e) => {
                  setForceLargeMermaid(false);
                  setMermaidMaxGen(Number(e.currentTarget.value));
                }}
                data={closure.generations.map((_, g) => ({
                  label: `Gen 0..${g}`,
                  value: String(g),
                }))}
              />
            )}
            {mermaidSlice === 'orbit' && (
              <NativeSelect
                size="xs"
                aria-label="Orbit SCC"
                value={String(mermaidSccId)}
                onChange={(e) => {
                  setForceLargeMermaid(false);
                  setMermaidSccId(Number(e.currentTarget.value));
                }}
                data={closure.sccs.map((scc) => ({
                  label: `Orbit #${scc.id + 1} (${scc.nodeIds.length})`,
                  value: String(scc.id),
                }))}
              />
            )}
            <SegmentedControl
              size="xs"
              aria-label="Mermaid flow direction"
              value={mermaidDir}
              onChange={(v) => setMermaidDir(v as 'TD' | 'LR')}
              data={[
                { label: 'TD', value: 'TD' },
                { label: 'LR', value: 'LR' },
              ]}
            />
            <Button size="compact-xs" variant="default" onClick={() => void handleCopyMermaid()}>
              {copiedMmd ? 'Copied!' : 'Copy .mmd'}
            </Button>
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => triggerFileDownload('affine-focus-graph.mmd', mermaidDiagram.code)}
            >
              Download .mmd
            </Button>
            <Button
              size="compact-xs"
              variant="light"
              disabled={!mermaidSvg}
              onClick={handleDownloadMermaidSvg}
            >
              Download .svg
            </Button>
            <Button
              size="compact-xs"
              variant={showMermaidSource ? 'filled' : 'subtle'}
              onClick={() => setShowMermaidSource((v) => !v)}
            >
              Source
            </Button>
          </>
        )}
      </div>

      {/* Main Viewport */}
      {viewMode === 'svg-map' ? (
        <>
          <div
            ref={canvasRef}
            className={classes.graphCanvas}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            <svg
              className={classes.graphSvg}
              data-testid="full-edge-map-svg"
              viewBox={layout.viewBox}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <defs>
                <marker
                  id="universe-traj-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="var(--mark-blue)" />
                </marker>
                <marker
                  id="universe-hover-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="var(--mark-green)" />
                </marker>
              </defs>

              {/* Generation guides */}
              <g className={classes.graphGuides}>
                {layout.mode === 'radial'
                  ? layout.rings.map((ring) =>
                      ring.radius > 0 ? (
                        <g key={`ring-${ring.generation}`}>
                          <circle
                            cx={layout.cx}
                            cy={layout.cy}
                            r={ring.radius}
                            className={classes.graphGuideLine}
                          />
                          {ring.showLabel && (
                            <text
                              x={ring.labelX + 4}
                              y={ring.labelY - 3}
                              className={classes.graphGuideText}
                            >
                              gen {ring.generation} ({ring.count})
                            </text>
                          )}
                        </g>
                      ) : null
                    )
                  : layout.columns.map((col) => (
                      <g key={`col-${col.generation}`}>
                        <line
                          x1={col.x}
                          y1={28}
                          x2={col.x}
                          y2={layout.height - 20}
                          className={classes.graphGuideLine}
                        />
                        <text
                          x={col.x}
                          y={20}
                          textAnchor="middle"
                          className={classes.graphGuideText}
                        >
                          g{col.generation} ({col.count})
                        </text>
                      </g>
                    ))}
              </g>

              {/* Background edges */}
              <g className={classes.graphEdgesBg}>
                {layout.edges.map((e) => {
                  if (e.isOnTrajectory) {
                    return null;
                  }
                  const touchesHover =
                    hoveredNodeId !== null &&
                    (e.edge.source === hoveredNodeId || e.edge.target === hoveredNodeId);
                  if (touchesHover) {
                    return null;
                  }
                  const dimmed = hoveredNodeId !== null;
                  return (
                    <path
                      key={e.edge.id}
                      d={e.pathD}
                      className={classes.graphEdgePath}
                      data-dimmed={dimmed}
                      style={{
                        strokeOpacity: dimmed
                          ? 0.04
                          : layout.edges.length <= 80
                            ? 0.42
                            : layout.edges.length <= 300
                              ? 0.26
                              : layout.edges.length <= 1200
                                ? 0.14
                                : 0.08,
                      }}
                    />
                  );
                })}
              </g>

              {/* Walked trajectory edges */}
              <g className={classes.graphEdgesTraj}>
                {layout.edges.map((e) =>
                  e.isOnTrajectory ? (
                    <path
                      key={`traj-${e.edge.id}`}
                      d={e.pathD}
                      className={classes.graphEdgeTraj}
                      markerEnd="url(#universe-traj-arrow)"
                    >
                      <title>{`${e.edge.operationLabel}`}</title>
                    </path>
                  ) : null
                )}
              </g>

              {/* Hovered node incident edges on top */}
              {hoveredNodeId && (
                <g className={classes.graphEdgesHover}>
                  {layout.edges.map((e) =>
                    e.edge.source === hoveredNodeId || e.edge.target === hoveredNodeId ? (
                      <path
                        key={`hov-${e.edge.id}`}
                        d={e.pathD}
                        className={classes.graphEdgeHover}
                        markerEnd="url(#universe-hover-arrow)"
                      >
                        <title>{`${e.edge.operationLabel}`}</title>
                      </path>
                    ) : null
                  )}
                </g>
              )}

              {/* Nodes */}
              <g className={classes.graphNodes}>
                {layout.nodes.map((n) => {
                  const isSelected = n.node.id === selectedNodeId;
                  const isHovered = n.node.id === hoveredNodeId;
                  const isNeighbor = hoveredNodeId !== null && incidentNodeIds.has(n.node.id);
                  const dimmed = hoveredNodeId !== null && !isNeighbor && !n.node.isSeed;
                  return (
                    <g
                      key={n.node.id}
                      data-node-interactive="true"
                      className={classes.graphNodeGroup}
                      onMouseEnter={() => setHoveredNodeId(n.node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      onClick={() => onSelectNode(n.node)}
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r}
                        className={classes.graphNodeCircle}
                        data-seed={n.node.isSeed}
                        data-trajectory={n.isOnTrajectory}
                        data-selected={isSelected || isHovered}
                        data-fixed={n.node.isFixedUnderAnyFocus}
                        data-dimmed={dimmed}
                      >
                        <title>{`${n.label} · gen ${n.node.generation} · Orbit #${n.node.sccId + 1} · deg ${n.inDegree}/${n.outDegree}`}</title>
                      </circle>
                    </g>
                  );
                })}
              </g>

              {/* Labels */}
              <g className={classes.graphLabels}>
                {layout.nodes.map((n) => {
                  const show =
                    shouldShowNodeLabel(n, layout.nodes.length, labelMode) ||
                    n.node.id === selectedNodeId ||
                    n.node.id === hoveredNodeId;
                  if (!show) {
                    return null;
                  }
                  const dy = n.node.isSeed
                    ? -(n.r + 6)
                    : layout.mode === 'radial' && n.y > layout.cy
                      ? n.r + 11
                      : -(n.r + 4);
                  const text = n.node.isSeed
                    ? `SEED ${n.label}`
                    : n.isOnTrajectory
                      ? `S${n.trajectoryIndices.join('/')} ${n.label}`
                      : n.label;
                  return (
                    <text
                      key={`lbl-${n.node.id}`}
                      x={n.x}
                      y={n.y + dy}
                      textAnchor="middle"
                      className={classes.graphNodeLabel}
                      data-seed={n.node.isSeed}
                      data-trajectory={n.isOnTrajectory}
                    >
                      {text}
                    </text>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Info & Legend Footer */}
          <div className={classes.graphFooter}>
            <div className={classes.legendRow}>
              <span className={classes.legendItem}>
                <span
                  className={classes.legendSwatch}
                  style={{ background: 'var(--mark-yellow)' }}
                />
                Seed
              </span>
              <span className={classes.legendItem}>
                <span className={classes.legendSwatch} style={{ background: 'var(--mark-blue)' }} />
                Walked trajectory
              </span>
              <span className={classes.legendItem}>
                <span
                  className={classes.legendSwatch}
                  style={{ background: 'var(--mark-green)' }}
                />
                Hover / Selected
              </span>
              <span className={classes.mutedLabel}>
                {closure.nodes.length} sets · {closure.edges.length} edges · {closure.sccs.length}{' '}
                orbits · Drag to pan, wheel to zoom
              </span>
            </div>

            {activeNodeLayout && (
              <div className={classes.graphSelectionBar}>
                <span className={classes.tabularNum}>
                  <strong>{activeNodeLayout.label}</strong> · gen {activeNodeLayout.node.generation}{' '}
                  · Orbit #{activeNodeLayout.node.sccId + 1} · {activeNodeLayout.inDegree} in /{' '}
                  {activeNodeLayout.outDegree} out
                </span>
                <div className={classes.cardActionsCol}>
                  <Button
                    size="compact-xs"
                    variant="default"
                    onClick={() => onPlayPitches(activeNodeLayout.node.pitches)}
                  >
                    ▶ Play
                  </Button>
                  {selectedShortestPath.length > 0 && (
                    <Button
                      size="compact-xs"
                      variant="light"
                      onClick={() => onLoadPathToTrajectory(selectedShortestPath)}
                    >
                      Load Path ({selectedShortestPath.length} steps)
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className={classes.mermaidPane}>
          <div className={classes.mermaidMetaRow}>
            <span className={classes.mutedLabel}>
              Showing {mermaidDiagram.nodeCount} sets · {mermaidDiagram.edgeCount} edges
              {mermaidRendering ? ' · Rendering Mermaid…' : ''}
            </span>
          </div>

          {mermaidTooLarge ? (
            <div className={classes.mermaidWarningBox}>
              <strong>
                Large Mermaid subgraph ({mermaidDiagram.nodeCount} sets, {mermaidDiagram.edgeCount}{' '}
                edges)
              </strong>
              <span className={classes.mutedLabel}>
                Mermaid&apos;s Dagre layout can become slow or dense above ~110 sets / 400 edges.
                Switch slice to <strong>Max Generation</strong> or{' '}
                <strong>Trajectory Neighborhood</strong>, or use the{' '}
                <strong>Full Edge Map (SVG)</strong> view for the entire closure.
              </span>
              <div className={classes.cardActionsCol}>
                <Button
                  size="compact-xs"
                  variant="light"
                  onClick={() => setMermaidSlice('max-gen')}
                >
                  Slice by Generation
                </Button>
                <Button
                  size="compact-xs"
                  variant="default"
                  onClick={() => setMermaidSlice('trajectory')}
                >
                  Trajectory Neighborhood
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => setForceLargeMermaid(true)}
                >
                  Render Anyway
                </Button>
              </div>
            </div>
          ) : mermaidError ? (
            <div className={classes.mermaidWarningBox}>
              <strong>Mermaid render preview unavailable here</strong>
              <span className={classes.mutedLabel}>{mermaidError}</span>
              <span className={classes.mutedLabel}>
                You can still copy or download the generated <code>.mmd</code> source below.
              </span>
            </div>
          ) : (
            <div
              className={classes.graphCanvas}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
            >
              <div
                ref={mermaidHostRef}
                className={classes.mermaidHost}
                data-testid="mermaid-render-host"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              />
            </div>
          )}

          {showMermaidSource && (
            <pre className={classes.mermaidSourceBox} data-testid="mermaid-source-preview">
              {mermaidDiagram.code}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
