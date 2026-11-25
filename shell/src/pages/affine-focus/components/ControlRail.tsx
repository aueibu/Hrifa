import { useEffect, useState } from 'react';
import { type TextInputProps } from '@mantine/core';
import {
  isBijectiveMultiplier,
  TUNING_PRESETS,
  type FocusPolicy,
  type FoldingMode,
  type GamutPitch,
  type IdentityMode,
  type OffsetMode,
  type QuantizeMode,
  type RuleFamily,
  type TransformDomain,
  type TuningGamut,
} from '../../../lib/affine-focus';
import { NativeSelect, NumberInput, SegmentedControl, TextInput, Button } from '../../../ui';
import { SCENARIO_EXAMPLES, type AffineFocusPersistedState, type ScenarioExample } from '../state';
import classes from '../AffineFocus.module.css';

function CommitTextInput({
  value,
  onCommit,
  ...rest
}: Omit<TextInputProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };
  return (
    <TextInput
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function ControlRail({
  state,
  gamut,
  seedPitches,
  seedError,
  customError,
  onPatch,
  onToggleGamutIndex,
  onApplyExample,
}: {
  state: AffineFocusPersistedState;
  gamut: TuningGamut;
  seedPitches: readonly GamutPitch[];
  seedError?: string;
  customError?: string;
  onPatch: (patch: Partial<AffineFocusPersistedState>) => void;
  onToggleGamutIndex: (index: number) => void;
  onApplyExample: (example: ScenarioExample) => void;
}) {
  const N = gamut.pitches.length;
  const activeIndices = new Set(seedPitches.map((p) => p.index).filter((i) => i >= 0));

  const quickMultipliers = [-1, 0, 1, 2, 3, 4, 5, 7, 11].filter(
    (m, idx, arr) => arr.indexOf(m) === idx
  );

  return (
    <aside className={classes.leftColumn} aria-label="Transform Parameters">
      <div className={classes.columnHeader}>
        <span>Parameters &amp; Rules</span>
        <span className={classes.mutedLabel}>{gamut.name}</span>
      </div>

      <div className={classes.columnScroll}>
        {/* 1. Curated Musical Scenario Presets */}
        <div className={classes.sectionBlock}>
          <div className={classes.sectionHead}>
            <span>Scenario Presets</span>
            <span className={classes.mutedLabel}>1-click examples</span>
          </div>
          <NativeSelect
            size="xs"
            aria-label="Scenario preset"
            value=""
            onChange={(e) => {
              const ex = SCENARIO_EXAMPLES.find((x) => x.id === e.currentTarget.value);
              if (ex) {
                onApplyExample(ex);
              }
            }}
            data={[
              { value: '', label: 'Load a canonical scenario…' },
              ...SCENARIO_EXAMPLES.map((ex) => ({
                value: ex.id,
                label: `${ex.label} — ${ex.subtitle}`,
              })),
            ]}
          />
        </div>

        {/* 2. Tuning & Gamut */}
        <div className={classes.sectionBlock}>
          <div className={classes.sectionHead}>
            <span>01 · Tuning Gamut</span>
            <span className={classes.tabularNum}>{`N = ${N}`}</span>
          </div>
          <NativeSelect
            size="xs"
            label="Tuning preset"
            value={state.presetId}
            onChange={(e) => {
              const nextId = e.currentTarget.value;
              const nextGamut = TUNING_PRESETS.find((g) => g.id === nextId);
              if (nextGamut) {
                const defaultIndices = nextGamut.pitches.length >= 7 ? [0, 2, 4] : [0, 1, 2];
                const nextSeed = defaultIndices
                  .filter((i) => i < nextGamut.pitches.length)
                  .map((i) => nextGamut.pitches[i].label)
                  .join(', ');
                onPatch({ presetId: nextId, seedText: nextSeed });
              } else {
                onPatch({ presetId: nextId });
              }
            }}
            data={[
              ...TUNING_PRESETS.map((g) => ({ value: g.id, label: g.name })),
              { value: 'custom', label: 'Custom Ratios / Cents…' },
            ]}
          />

          {state.presetId === 'custom' && (
            <>
              <CommitTextInput
                size="xs"
                label="Custom pitches (ratios a/b or cents)"
                value={state.customIntervalsText}
                error={customError}
                onCommit={(next) => onPatch({ customIntervalsText: next })}
              />
              <CommitTextInput
                size="xs"
                label="Repeat period (e.g. 2/1, 3/1, 1200c)"
                value={state.customRepeatText}
                onCommit={(next) => onPatch({ customRepeatText: next })}
              />
            </>
          )}
          <span className={classes.mutedLabel}>{gamut.description}</span>
        </div>

        {/* 3. Seed Set / Voicing */}
        <div className={classes.sectionBlock}>
          <div className={classes.sectionHead}>
            <span>02 · Seed Set / Voicing</span>
            <span className={classes.tabularNum}>{`|S| = ${seedPitches.length}`}</span>
          </div>
          <CommitTextInput
            size="xs"
            label="Seed pitches (Enter or blur to apply)"
            value={state.seedText}
            error={seedError}
            onCommit={(next) => onPatch({ seedText: next })}
          />

          <div className={classes.chipGrid} role="group" aria-label="Gamut pitch toggles">
            {gamut.pitches.map((gp) => (
              <button
                key={`chip-${gp.index}`}
                type="button"
                className={classes.pitchChip}
                data-active={activeIndices.has(gp.index)}
                onClick={() => onToggleGamutIndex(gp.index)}
                title={`${gp.label} (${gp.foldedCents.toFixed(1)} c)`}
              >
                {gp.label}
              </button>
            ))}
          </div>

          <div className={classes.fieldRow}>
            <div>
              <div className={classes.mutedLabel} style={{ marginBottom: 3 }}>
                Element Identity
              </div>
              <SegmentedControl
                size="xs"
                fullWidth
                aria-label="Element identity mode"
                value={state.identity}
                onChange={(v) =>
                  onPatch({
                    identity:
                      v === 'ordered-tuple'
                        ? ('ordered-tuple' as IdentityMode)
                        : ('unordered-set' as IdentityMode),
                  })
                }
                data={[
                  { label: 'Set {S}', value: 'unordered-set' },
                  { label: 'Voicing (xᵢ)', value: 'ordered-tuple' },
                ]}
              />
            </div>
            <div className={classes.cardActionsCol} style={{ justifyContent: 'flex-end' }}>
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => {
                  const card = Math.min(3, Math.max(2, seedPitches.length || 3));
                  const pool = gamut.pitches.map((p) => p.index);
                  const picked: number[] = [];
                  while (picked.length < card && pool.length > 0) {
                    const r = Math.floor(Math.random() * pool.length);
                    picked.push(pool.splice(r, 1)[0]);
                  }
                  picked.sort((a, b) => a - b);
                  onPatch({
                    seedText: picked.map((i) => gamut.pitches[i].label).join(', '),
                  });
                }}
              >
                Random
              </Button>
            </div>
          </div>
        </div>

        {/* 4. Transform Space & Acoustic Toggles */}
        <div className={classes.sectionBlock}>
          <div className={classes.sectionHead}>
            <span>03 · Transform Space</span>
            <span className={classes.mutedLabel}>Gamut vs. Raw Acoustic</span>
          </div>

          <NativeSelect
            size="xs"
            label="Transform domain"
            aria-label="Transform domain"
            value={state.domain}
            onChange={(e) => onPatch({ domain: e.currentTarget.value as TransformDomain })}
            data={[
              {
                value: 'gamut-steps',
                label: `1. Gamut Steps (mod ${N} scale degrees)`,
              },
              {
                value: 'log-pitch',
                label: '2. Log Pitch (Perceptual Cents / Ratioᵃ)',
              },
              {
                value: 'linear-freq',
                label: '3. Linear Freq (Acoustic Hz / Otonal Δν)',
              },
              {
                value: 'subharmonic',
                label: '4. Subharmonic (Utonal Period 1/Hz)',
              },
            ]}
          />

          <div className={classes.fieldRow}>
            <div>
              <div className={classes.mutedLabel} style={{ marginBottom: 3 }}>
                Repeat Folding
              </div>
              <SegmentedControl
                size="xs"
                fullWidth
                aria-label="Repeat folding mode"
                value={state.folding}
                onChange={(v) =>
                  onPatch({
                    folding: (v === 'unfolded' ? 'unfolded' : 'folded') as FoldingMode,
                  })
                }
                data={[
                  { label: 'Fold mod R', value: 'folded' },
                  { label: 'Unfolded', value: 'unfolded' },
                ]}
              />
            </div>

            <div>
              <div className={classes.mutedLabel} style={{ marginBottom: 3 }}>
                Pitch Realization
              </div>
              <SegmentedControl
                size="xs"
                fullWidth
                aria-label="Pitch realization mode"
                disabled={state.domain === 'gamut-steps'}
                value={state.quantize}
                onChange={(v) =>
                  onPatch({
                    quantize: (v === 'snap-to-gamut' ? 'snap-to-gamut' : 'exact') as QuantizeMode,
                  })
                }
                data={[
                  { label: 'Exact', value: 'exact' },
                  { label: 'Snap Gamut', value: 'snap-to-gamut' },
                ]}
              />
            </div>
          </div>

          <div>
            <div className={classes.mutedLabel} style={{ marginBottom: 3 }}>
              Offset Measurement (x − f)
            </div>
            <SegmentedControl
              size="xs"
              fullWidth
              aria-label="Offset measurement mode"
              value={state.offsetMode}
              onChange={(v) =>
                onPatch({
                  offsetMode: (v === 'signed'
                    ? 'signed'
                    : v === 'unwrapped'
                      ? 'unwrapped'
                      : 'positive') as OffsetMode,
                })
              }
              data={[
                { label: 'Positive [0, R)', value: 'positive' },
                { label: 'Signed [−R/2, R/2)', value: 'signed' },
                { label: 'Unwrapped', value: 'unwrapped' },
              ]}
            />
          </div>
        </div>

        {/* 5. Canonical Rule Family & Multipliers */}
        <div className={classes.sectionBlock}>
          <div className={classes.sectionHead}>
            <span>04 · Rule Family &amp; Multiplier</span>
          </div>

          <NativeSelect
            size="xs"
            label="Transform rule family"
            aria-label="Transform rule family"
            value={state.rule}
            onChange={(e) => onPatch({ rule: e.currentTarget.value as RuleFamily })}
            data={[
              {
                value: 'single-focus',
                label: '1. Single-Focus Affine: f + a(x − f)',
              },
              {
                value: 'dual-focus',
                label: '2. Dual-Focus Edge Reflection (P/L/R Swap)',
              },
              {
                value: 'perspective',
                label: '3. Perspective / Zero-Anchor: a(x − f)',
              },
              {
                value: 'bilateral',
                label: '4. Bilateral / Fold: separate (a₊, a₋)',
              },
              {
                value: 'multi-multiplier',
                label: '5. Multi-Multiplier Family Comparison',
              },
            ]}
          />

          {(state.rule === 'single-focus' || state.rule === 'perspective') && (
            <>
              <NumberInput
                size="xs"
                label="Multiplier (a)"
                value={state.multiplier}
                step={1}
                allowDecimal
                onChange={(val) => {
                  const n = Number(val);
                  if (Number.isFinite(n)) {
                    onPatch({ multiplier: n });
                  }
                }}
              />
              <div className={classes.multiplierStrip} role="group" aria-label="Quick multipliers">
                {quickMultipliers.map((m) => (
                  <button
                    key={`qm-${m}`}
                    type="button"
                    className={classes.multBtn}
                    data-active={state.multiplier === m}
                    data-bijective={isBijectiveMultiplier(m, N)}
                    onClick={() => onPatch({ multiplier: m })}
                    title={
                      m === -1
                        ? 'a = −1 (Pivot reflection / inversion around focus)'
                        : m === 1
                          ? 'a = 1 (Identity)'
                          : m === 0
                            ? 'a = 0 (Collapse onto focus)'
                            : `a = ${m} (${isBijectiveMultiplier(m, N) ? 'Bijective' : 'Degenerate'} mod ${N})`
                    }
                  >
                    {m === -1 ? '−1' : String(m)}
                  </button>
                ))}
              </div>
            </>
          )}

          {state.rule === 'bilateral' && (
            <div className={classes.fieldRow}>
              <NumberInput
                size="xs"
                label="Upper a₊ (d ≥ 0)"
                value={state.multiplierPlus}
                onChange={(val) => {
                  const n = Number(val);
                  if (Number.isFinite(n)) {
                    onPatch({ multiplierPlus: n });
                  }
                }}
              />
              <NumberInput
                size="xs"
                label="Lower a₋ (d < 0)"
                value={state.multiplierMinus}
                onChange={(val) => {
                  const n = Number(val);
                  if (Number.isFinite(n)) {
                    onPatch({ multiplierMinus: n });
                  }
                }}
              />
            </div>
          )}

          {state.rule === 'multi-multiplier' && (
            <CommitTextInput
              size="xs"
              label="Multipliers list (Enter or blur)"
              value={state.multipliersText}
              onCommit={(next) => onPatch({ multipliersText: next })}
            />
          )}

          <NativeSelect
            size="xs"
            label="Focus selection domain"
            value={state.focusPolicy}
            onChange={(e) => onPatch({ focusPolicy: e.currentTarget.value as FocusPolicy })}
            data={[
              { value: 'current-members', label: 'Members of current set (f ∈ S)' },
              { value: 'seed-members', label: 'Members of initial seed (f ∈ S₀)' },
              { value: 'all-gamut', label: `Every pitch in gamut (all ${N} notes)` },
              { value: 'custom', label: 'Custom focus indices…' },
            ]}
          />

          {state.focusPolicy === 'custom' && (
            <CommitTextInput
              size="xs"
              label="Custom focus step indices (Enter or blur)"
              value={state.customFociText}
              onCommit={(next) => onPatch({ customFociText: next })}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
