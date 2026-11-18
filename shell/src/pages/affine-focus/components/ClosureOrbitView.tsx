import { useState } from 'react';
import { Button, NativeSelect, SegmentedControl } from '@mantine/core';
import {
  findShortestTransformPath,
  type ClosureEdge,
  type ClosureGraph,
  type ClosureNode,
  type GamutPitch,
  type TransformConfig,
} from '../../../lib/affine-focus';
import type { OrbitGroupBy } from '../state';
import { MiniRing } from './MiniRing';
import classes from '../AffineFocus.module.css';

export function ClosureOrbitView({
  config,
  closure,
  groupBy,
  selectedNodeId,
  onChangeGroupBy,
  onSelectNode,
  onInspectEdge,
  onLoadPathToTrajectory,
  onPlayPitches,
}: {
  config: TransformConfig;
  closure: ClosureGraph;
  groupBy: OrbitGroupBy;
  selectedNodeId: string;
  onChangeGroupBy: (g: OrbitGroupBy) => void;
  onSelectNode: (node: ClosureNode) => void;
  onInspectEdge: (edge: ClosureEdge) => void;
  onLoadPathToTrajectory: (edges: ClosureEdge[]) => void;
  onPlayPitches: (pitches: readonly GamutPitch[]) => void;
}) {
  const [foldedGroups, setFoldedGroups] = useState<Record<string, boolean>>({});
  const [pathTargetId, setPathTargetId] = useState<string>(
    closure.nodes[closure.nodes.length - 1]?.id ?? closure.seedId
  );

  const toggleGroup = (gid: string) => {
    setFoldedGroups((prev) => ({ ...prev, [gid]: !prev[gid] }));
  };

  const nodeMap = new Map(closure.nodes.map((n) => [n.id, n]));
  const R = config.gamut.repeatCents;

  const targetIdValid = nodeMap.has(pathTargetId)
    ? pathTargetId
    : (closure.nodes[closure.nodes.length - 1]?.id ?? closure.seedId);

  const shortestPath = findShortestTransformPath(closure, closure.seedId, targetIdValid);

  const groups =
    groupBy === 'scc'
      ? closure.sccs.map((scc) => ({
          id: `scc-${scc.id}`,
          title: `Orbit / SCC #${scc.id + 1} ${scc.isAttractor ? '(Attractor Basin)' : '(Transient)'}`,
          subtitle: `${scc.nodeIds.length} ${scc.nodeIds.length === 1 ? 'set' : 'sets'}${scc.hasCycle ? ' · reversible cycle' : ''}`,
          nodes: scc.nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean),
        }))
      : closure.generations.map((nIds, genIdx) => ({
          id: `gen-${genIdx}`,
          title: genIdx === 0 ? 'Generation 0 (Seed)' : `Generation ${genIdx}`,
          subtitle: `${nIds.length} newly discovered ${nIds.length === 1 ? 'set' : 'sets'}`,
          nodes: nIds.map((id) => nodeMap.get(id)!).filter(Boolean),
        }));

  const selectedNodeEdges = closure.edges.filter((e) => e.source === selectedNodeId);

  return (
    <>
      {/* Closure Summary & Grouping Header */}
      <div className={classes.sectionBlock} data-testid="closure-summary">
        <div className={classes.sectionHead}>
          <span>
            {closure.saturated
              ? `Closure saturated at Generation ${closure.saturationGeneration ?? 0} (${closure.nodes.length} canonical sets · ${closure.edges.length} transforms · ${closure.sccs.length} orbits)`
              : `Exploration truncated at ${closure.terminationReason} (${closure.nodes.length} sets · closure not proven)`}
          </span>
          <SegmentedControl
            size="xs"
            value={groupBy}
            onChange={(v) => onChangeGroupBy(v === 'generation' ? 'generation' : 'scc')}
            data={[
              { label: 'Group by SCC Orbit', value: 'scc' },
              { label: 'Group by Generation', value: 'generation' },
            ]}
          />
        </div>

        {/* Shortest Transform Path Finder */}
        <div className={classes.fieldRow}>
          <NativeSelect
            size="xs"
            label="Shortest transform path from Seed to target set"
            value={targetIdValid}
            onChange={(e) => setPathTargetId(e.currentTarget.value)}
            data={closure.nodes.map((n) => ({
              value: n.id,
              label: `{${n.pitches.map((p) => p.label).join(', ')}} (gen ${n.generation}, SCC #${n.sccId + 1})`,
            }))}
          />
          <div className={classes.cardActionsCol}>
            {shortestPath && shortestPath.length > 0 ? (
              <Button
                size="compact-xs"
                variant="light"
                onClick={() => onLoadPathToTrajectory(shortestPath)}
              >
                {`Load ${shortestPath.length}-step path into Trajectory →`}
              </Button>
            ) : (
              <span className={classes.mutedLabel}>
                {targetIdValid === closure.seedId
                  ? 'Target is Seed (0 steps)'
                  : 'No directed path found'}
              </span>
            )}
          </div>
        </div>

        {shortestPath && shortestPath.length > 0 && (
          <div className={classes.trajectoryRow}>
            <span className={classes.mutedLabel}>Path:</span>
            <span className={classes.tabularNum}>
              {`{${nodeMap
                .get(closure.seedId)
                ?.pitches.map((p) => p.label)
                .join(', ')}}`}
            </span>
            {shortestPath.map((edge, idx) => {
              const tgt = nodeMap.get(edge.target);
              return (
                <span key={`path-${idx}`} className={classes.cardActionsCol}>
                  <span className={classes.trajArrow}>{`—[${edge.operationLabel}]→`}</span>
                  <button
                    type="button"
                    className={classes.trajChip}
                    onClick={() => onInspectEdge(edge)}
                  >
                    {`{${tgt?.pitches.map((p) => p.label).join(', ')}}`}
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Outgoing transforms from currently selected closure node */}
      {selectedNodeEdges.length > 0 && (
        <div className={classes.sectionBlock}>
          <div className={classes.sectionHead}>
            <span>
              {`Outgoing Transforms from Selected Set {${nodeMap
                .get(selectedNodeId)
                ?.pitches.map((p) => p.label)
                .join(', ')}}`}
            </span>
            <span className={classes.mutedLabel}>Click an edge to inspect arithmetic</span>
          </div>
          <div className={classes.chipGrid}>
            {selectedNodeEdges.map((edge) => {
              const tgt = nodeMap.get(edge.target);
              return (
                <button
                  key={edge.id}
                  type="button"
                  className={classes.pitchChip}
                  data-focus={edge.isSelfLoop}
                  onClick={() => onInspectEdge(edge)}
                >
                  <strong>{edge.operationLabel}</strong>
                  <span>→</span>
                  <span>{`{${tgt?.pitches.map((p) => p.label).join(', ')}}`}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tree-style Foldable Orbit / Generation Groups (Harmonic Field Lab Fold pattern) */}
      {groups.map((grp) => {
        const isFolded = Boolean(foldedGroups[grp.id]);
        return (
          <div key={grp.id} className={classes.treeSection}>
            <div className={classes.foldHead}>
              <button type="button" className={classes.foldBtn} onClick={() => toggleGroup(grp.id)}>
                <span>{isFolded ? '▸' : '▾'}</span>
                <span>{grp.title}</span>
              </button>
              <span className={classes.foldCount}>{grp.subtitle}</span>
            </div>

            {!isFolded && (
              <div className={classes.nest}>
                <span
                  className={classes.nestGuide}
                  role="presentation"
                  title="Click guide line to fold group"
                  onClick={() => toggleGroup(grp.id)}
                />
                <div className={classes.cardList}>
                  {grp.nodes.map((node) => {
                    const isSelected = node.id === selectedNodeId;
                    const outEdges = closure.edges.filter((e) => e.source === node.id);
                    const selfLoops = outEdges.filter((e) => e.isSelfLoop);

                    return (
                      <div
                        key={node.id}
                        role="button"
                        tabIndex={0}
                        className={classes.opCard}
                        data-selected={isSelected}
                        onClick={() => onSelectNode(node)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectNode(node);
                          }
                        }}
                      >
                        <MiniRing targetPitches={node.pitches} repeatCents={R} />
                        <div className={classes.cardTitleCol}>
                          <span className={classes.cardTitle}>
                            {`{${node.pitches.map((p) => p.label).join(', ')}}`}
                          </span>
                          <span className={classes.cardSubtitle}>
                            {`Gen ${node.generation} · SCC #${node.sccId + 1}${node.isSeed ? ' · Seed' : ''}`}
                          </span>
                        </div>
                        <div className={classes.cardPitchesCol}>
                          <span className={classes.cardPitches}>
                            {`${node.pitches.map((p) => p.foldedCents.toFixed(1)).join(', ')} c`}
                          </span>
                          <span className={classes.cardSteps}>
                            {node.isFixedUnderAnyFocus
                              ? `Fixed under focus: ${node.fixedFocusLabels.join(', ')}`
                              : `${outEdges.length} outgoing transforms`}
                          </span>
                        </div>
                        <div className={classes.cardStatCol}>
                          <span
                            style={{
                              color: node.isSeed
                                ? 'var(--mark-blue)'
                                : node.isFixedUnderAnyFocus
                                  ? 'var(--mark-yellow)'
                                  : 'var(--text-muted)',
                              fontWeight: 600,
                            }}
                          >
                            {node.isSeed
                              ? 'seed'
                              : selfLoops.length > 0
                                ? `${selfLoops.length} fixed`
                                : `|S|=${node.pitches.length}`}
                          </span>
                          <span className={classes.mutedLabel}>
                            {`${node.parents.length} in / ${outEdges.length} out`}
                          </span>
                        </div>
                        <div className={classes.cardActionsCol}>
                          <Button
                            size="compact-xs"
                            variant="default"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlayPitches(node.pitches);
                            }}
                          >
                            ▶
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
