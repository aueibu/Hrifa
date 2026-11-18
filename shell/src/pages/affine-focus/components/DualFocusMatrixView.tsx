import { useState } from 'react';
import { Button, Checkbox, NativeSelect, SegmentedControl } from '@mantine/core';
import {
  searchDualFocusMaps,
  type ClosureGraph,
  type DualFocusConstraint,
  type DualFocusMapEntry,
  type GamutPitch,
  type TransformConfig,
} from '../../../lib/affine-focus';
import classes from '../AffineFocus.module.css';

export function DualFocusMatrixView({
  config,
  seedPitches,
  closure,
  focusA,
  focusB,
  onChangeFoci,
  onChangeConstraint,
  onPlayPitches,
}: {
  config: TransformConfig;
  seedPitches: readonly GamutPitch[];
  closure: ClosureGraph;
  focusA: number;
  focusB: number;
  onChangeFoci: (a: number, b: number) => void;
  onChangeConstraint: (c: DualFocusConstraint) => void;
  onPlayPitches: (pitches: readonly GamutPitch[]) => void;
}) {
  const [bijectiveOnly, setBijectiveOnly] = useState(true);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);

  const maps = searchDualFocusMaps(focusA, focusB, seedPitches, config, closure, bijectiveOnly);
  const activeMap: DualFocusMapEntry | null =
    maps.find((m) => m.id === selectedMapId) ?? maps[0] ?? null;

  const pitchOptions = config.gamut.pitches.map((p) => ({
    value: String(p.index),
    label: `Step ${p.index} (${p.label} · ${p.foldedCents.toFixed(1)} c)`,
  }));

  return (
    <>
      <div className={classes.sectionBlock} data-testid="dual-focus-controls">
        <div className={classes.sectionHead}>
          <span>Dual-Focus Affine Map Solver — g(x) = a·x + b (mod N)</span>
          <Checkbox
            size="xs"
            label="Bijective maps only (gcd(a, N) = 1)"
            checked={bijectiveOnly}
            onChange={(e) => setBijectiveOnly(e.currentTarget.checked)}
          />
        </div>

        <div className={classes.fieldRow3}>
          <NativeSelect
            size="xs"
            label="Focus A"
            value={String(focusA)}
            onChange={(e) => onChangeFoci(Number(e.currentTarget.value), focusB)}
            data={pitchOptions}
          />
          <NativeSelect
            size="xs"
            label="Focus B"
            value={String(focusB)}
            onChange={(e) => onChangeFoci(focusA, Number(e.currentTarget.value))}
            data={pitchOptions}
          />
          <div>
            <div className={classes.mutedLabel} style={{ marginBottom: 4 }}>
              Axis Constraint
            </div>
            <SegmentedControl
              size="xs"
              fullWidth
              value={config.dualConstraint}
              onChange={(v) =>
                onChangeConstraint(
                  v === 'fix-both' ? 'fix-both' : v === 'preserve-axis' ? 'preserve-axis' : 'swap'
                )
              }
              data={[
                { label: 'Swap A↔B', value: 'swap' },
                { label: 'Fix Both', value: 'fix-both' },
                { label: 'Axis', value: 'preserve-axis' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className={classes.sectionBlock}>
        <div className={classes.sectionHead}>
          <span>{`Matching Affine Maps (${maps.length} found)`}</span>
          <span className={classes.mutedLabel}>
            Click a map row to inspect cycles &amp; audition
          </span>
        </div>

        {maps.length === 0 ? (
          <div className={classes.mutedLabel}>
            No affine maps over Z_{config.gamut.pitches.length} satisfy the selected dual-focus
            constraint.
          </div>
        ) : (
          <table className={classes.dataTable}>
            <thead>
              <tr>
                <th>Map</th>
                <th>a</th>
                <th>b</th>
                <th>Constraint</th>
                <th>Fixed Points</th>
                <th>Transformed Seed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {maps.map((m) => {
                const isSelected = activeMap?.id === m.id;
                return (
                  <tr
                    key={m.id}
                    data-clickable="true"
                    data-selected={isSelected}
                    onClick={() => setSelectedMapId(m.id)}
                  >
                    <td>{m.formula}</td>
                    <td>{m.a}</td>
                    <td>{m.b}</td>
                    <td>{m.constraintMatched === 'swap' ? 'Swap A↔B' : 'Fix A, B'}</td>
                    <td>{m.fixedPoints.length ? m.fixedPoints.join(', ') : '∅'}</td>
                    <td>{`{${m.transformedSeed.map((p) => p.label).join(', ')}}`}</td>
                    <td>
                      <Button
                        size="compact-xs"
                        variant="default"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayPitches(m.transformedSeed);
                        }}
                      >
                        ▶
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {activeMap && (
        <div className={classes.sectionBlock} data-testid="dual-focus-inspector">
          <div className={classes.sectionHead}>
            <span>{`Map Inspector: ${activeMap.formula}`}</span>
            <span className={classes.mutedLabel}>
              {activeMap.isBijective ? 'Bijective permutation' : 'Degenerate map'}
            </span>
          </div>
          <div className={classes.kvList}>
            <span className={classes.kvKey}>Focus A / B Mapping</span>
            <span className={classes.kvVal}>
              {`${activeMap.focusA} → ${activeMap.imageA},  ${activeMap.focusB} → ${activeMap.imageB}`}
            </span>
            <span className={classes.kvKey}>Cycle Decomposition</span>
            <span className={classes.kvVal}>
              {activeMap.cycles.length
                ? activeMap.cycles.map((c) => `(${c.join(' ')})`).join(' ')
                : 'non-bijective'}
            </span>
            <span className={classes.kvKey}>In Current Closure Graph</span>
            <span className={classes.kvVal}>{activeMap.inClosure ? 'Yes (reachable)' : 'No'}</span>
          </div>
        </div>
      )}
    </>
  );
}
