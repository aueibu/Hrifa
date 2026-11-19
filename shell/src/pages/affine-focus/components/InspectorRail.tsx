import { Button, NativeSelect, NumberInput, SegmentedControl, Slider } from '@mantine/core';
import type {
  ClosureGraph,
  GamutPitch,
  TransformConfig,
  TransformResult,
} from '../../../lib/affine-focus';
import type { ArpeggioMode, AudioSettings, WaveType } from '../audio';
import { formatSignedCents, signedErrorColorVar } from '../state';
import classes from '../AffineFocus.module.css';

export function InspectorRail({
  config,
  activeResult,
  closure,
  audioSettings,
  onPatchAudio,
  onPlayPitches,
  onPlayAlternation,
  onStopAudio,
  onExport,
}: {
  config: TransformConfig;
  activeResult: TransformResult | null;
  closure: ClosureGraph;
  audioSettings: AudioSettings;
  onPatchAudio: (patch: Partial<AudioSettings>) => void;
  onPlayPitches: (pitches: readonly GamutPitch[]) => void;
  onPlayAlternation: (src: readonly GamutPitch[], tgt: readonly GamutPitch[]) => void;
  onStopAudio: () => void;
  onExport: (kind: 'json' | 'csv' | 'mermaid' | 'svg') => void;
}) {
  return (
    <aside className={classes.rightColumn} aria-label="Arithmetic and Audio Inspector">
      <div className={classes.columnHeader}>
        <span>Inspector &amp; Audition</span>
        <span className={classes.mutedLabel}>
          {activeResult ? activeResult.operationLabel : 'Ready'}
        </span>
      </div>

      <div className={classes.columnScroll}>
        {/* 1. Transform Arithmetic Table */}
        <div className={classes.sectionBlock} data-testid="arithmetic-inspector">
          <div className={classes.sectionHead}>
            <span>Transform Arithmetic</span>
            <span className={classes.mutedLabel}>{config.domain}</span>
          </div>

          {activeResult ? (
            <>
              <div
                className={classes.formulaBadge}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {activeResult.formulaDisplay}
              </div>

              <div className={classes.kvList}>
                <span className={classes.kvKey}>Source → Output</span>
                <span className={classes.kvVal}>
                  {`{${activeResult.sourcePitches.map((p) => p.label).join(', ')}} → {${activeResult.outputPitches.map((p) => p.label).join(', ')}}`}
                </span>
                <span className={classes.kvKey}>Unfolded Register</span>
                <span className={classes.kvVal}>
                  {`(${activeResult.unfoldedPitches.map((p) => p.label).join(', ')})`}
                </span>
              </div>

              <table className={classes.dataTable}>
                <thead>
                  <tr>
                    <th>Voice</th>
                    <th>Offset (x−f)</th>
                    <th>Scaled</th>
                    <th>Unfolded</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.steps.map((st) => (
                    <tr key={`step-${st.voiceIndex}`}>
                      <td>
                        <strong>{st.source.label}</strong>
                      </td>
                      <td>{st.offsetDisplay}</td>
                      <td>{st.scaledDisplay}</td>
                      <td>{st.rawUnfolded.label}</td>
                      <td>
                        <strong
                          style={{
                            color: st.isFixed ? 'var(--mark-yellow)' : 'var(--mark-blue)',
                          }}
                        >
                          {st.result.label}
                        </strong>
                        {config.quantize === 'snap-to-gamut' &&
                          Math.abs(st.result.snapErrorCents) >= 0.05 && (
                            <div
                              style={{
                                color: signedErrorColorVar(st.result.snapErrorCents),
                                fontSize: 'var(--lab-fs-tiny)',
                              }}
                            >
                              {`${formatSignedCents(st.result.snapErrorCents)} vs ${st.result.idealLabel}`}
                            </div>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <span className={classes.mutedLabel}>Select an operation to inspect its steps.</span>
          )}
        </div>

        {/* 2. Polyphonic Web Audio Audition */}
        <div className={classes.sectionBlock} data-testid="audio-panel">
          <div className={classes.sectionHead}>
            <span>Polyphonic Audition</span>
            <span className={classes.tabularNum}>{`${audioSettings.baseHz.toFixed(1)} Hz`}</span>
          </div>

          {activeResult && (
            <div className={classes.chipGrid}>
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => onPlayPitches(activeResult.sourcePitches)}
              >
                ▶ Source
              </Button>
              <Button
                size="compact-xs"
                variant="filled"
                onClick={() => onPlayPitches(activeResult.outputPitches)}
              >
                ▶ Output
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                onClick={() =>
                  onPlayAlternation(activeResult.sourcePitches, activeResult.outputPitches)
                }
              >
                ⇄ Alternate S↔T(S)
              </Button>
              <Button size="compact-xs" variant="subtle" onClick={onStopAudio}>
                ■ Stop
              </Button>
            </div>
          )}

          <div className={classes.fieldRow}>
            <NativeSelect
              size="xs"
              label="Timbre"
              value={audioSettings.wave}
              onChange={(e) =>
                onPatchAudio({
                  wave: (e.currentTarget.value === 'sine' ? 'sine' : 'harmonic') as WaveType,
                })
              }
              data={[
                { value: 'harmonic', label: 'Harmonic (7 partials)' },
                { value: 'sine', label: 'Pure Sine' },
              ]}
            />
            <NumberInput
              size="xs"
              label="1/1 Base Hz"
              min={55}
              max={1760}
              value={audioSettings.baseHz}
              onChange={(val) => {
                const n = Number(val);
                if (Number.isFinite(n) && n >= 20) {
                  onPatchAudio({ baseHz: n });
                }
              }}
            />
          </div>

          <div>
            <div className={classes.mutedLabel} style={{ marginBottom: 3 }}>
              Voicing Delivery
            </div>
            <SegmentedControl
              size="xs"
              fullWidth
              value={audioSettings.arpeggio}
              onChange={(v) =>
                onPatchAudio({
                  arpeggio: (v === 'ascending'
                    ? 'ascending'
                    : v === 'descending'
                      ? 'descending'
                      : 'simultaneous') as ArpeggioMode,
                })
              }
              data={[
                { label: 'Chord', value: 'simultaneous' },
                { label: 'Arp ↑', value: 'ascending' },
                { label: 'Arp ↓', value: 'descending' },
              ]}
            />
          </div>

          <div>
            <div className={classes.sectionHead}>
              <span className={classes.mutedLabel}>Volume</span>
              <span
                className={classes.tabularNum}
              >{`${Math.round(audioSettings.volume * 100)}%`}</span>
            </div>
            <Slider
              size="xs"
              min={0}
              max={100}
              value={Math.round(audioSettings.volume * 100)}
              onChange={(v) => onPatchAudio({ volume: v / 100 })}
              label={null}
              aria-label="Volume"
            />
          </div>
        </div>

        {/* 3. Closure Space Statistics */}
        <div className={classes.sectionBlock} data-testid="closure-stats">
          <div className={classes.sectionHead}>
            <span>Closure Space Statistics</span>
            <span className={classes.mutedLabel}>
              {closure.saturated ? 'Saturated' : 'Truncated'}
            </span>
          </div>
          <div className={classes.kvList}>
            <span className={classes.kvKey}>Canonical States</span>
            <span className={classes.kvVal}>{closure.nodes.length}</span>
            <span className={classes.kvKey}>Transform Edges</span>
            <span className={classes.kvVal}>{closure.edges.length}</span>
            <span className={classes.kvKey}>Self-Loops / Fixed States</span>
            <span className={classes.kvVal}>
              {`${closure.edges.filter((e) => e.isSelfLoop).length} / ${closure.nodes.filter((n) => n.isFixedUnderAnyFocus).length}`}
            </span>
            <span className={classes.kvKey}>Strongly Connected Orbits</span>
            <span className={classes.kvVal}>
              {`${closure.sccs.length} (${closure.sccs.filter((s) => s.isAttractor).length} attractors)`}
            </span>
            <span className={classes.kvKey}>Largest Orbit Size</span>
            <span className={classes.kvVal}>
              {Math.max(0, ...closure.sccs.map((s) => s.nodeIds.length))}
            </span>
            <span className={classes.kvKey}>Max Discovery Depth</span>
            <span className={classes.kvVal}>{closure.generations.length - 1}</span>
          </div>
        </div>

        {/* 4. Export Data */}
        <div className={classes.sectionBlock}>
          <div className={classes.sectionHead}>
            <span>Export Transform Data</span>
          </div>
          <div className={classes.chipGrid}>
            <Button size="compact-xs" variant="default" onClick={() => onExport('json')}>
              Export JSON
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => onExport('csv')}>
              Nodes CSV
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => onExport('mermaid')}>
              Mermaid Graph
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => onExport('svg')}>
              Full SVG Map
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
