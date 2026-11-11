import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Slider,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { createPitchPreviewPlan } from '../audio/performancePlans';
import type {
  CompositionModuleRoutingProps,
  PublishedCompositionOutput,
} from '../compositionRouting';
import {
  acceptsMistSettings,
  buildMistField,
  curveShape,
  defaultMistSettings,
  defaultStratum,
  formatRealignment,
  maxMistCycles,
  maxMistStrata,
  maxWalkPoints,
  migrateMistSettings,
  maxMistSteps,
  mistChordsPacket,
  mistPresets,
  mistVoicesPacket,
  passesPerRepeat,
  presetStrata,
  sampleMist,
  type MistInterpolation,
  type MistPresetId,
  type MistSettings,
  type MistStratum,
} from '../mist';
import { useModulePreview } from '../useModulePreview';
import {
  acceptsFiniteNumber,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { CurveEditor } from './CurveEditor';
import { MistSnapshot } from './MistSnapshot';
import { MistStage, strataColor } from './MistStage';
import { ModuleDevice } from './ModuleDevice';
import { InspectorSection, ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import { VolumeControl } from './VolumeControl';
import workbench from '../CompositionWorkbench.module.css';
import classes from './SwirlingMists.module.css';

export interface SwirlingMistsModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
}

function numberOr(value: number | string, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function SwirlingMistsModule({
  instanceId,
  instanceLabel,
  onOutputsChange,
}: SwirlingMistsModuleProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'swirling-mists');
  const [settings, setSettings] = usePersistentState<MistSettings>(
    stateKey(compositionStateKeys.mistSettings),
    defaultMistSettings,
    acceptsMistSettings,
    migrateMistSettings
  );
  const [stepMilliseconds, setStepMilliseconds] = usePersistentState(
    stateKey(compositionStateKeys.mistStep),
    250,
    acceptsFiniteNumber
  );
  const [gatePercent, setGatePercent] = usePersistentState(
    stateKey(compositionStateKeys.mistGate),
    90,
    acceptsFiniteNumber
  );
  const [volume, setVolume] = usePersistentState(
    stateKey(compositionStateKeys.mistVolume),
    30,
    acceptsFiniteNumber
  );
  // The live view's span and run speed; null means fit one full repeat and pass the shortest period in ~2 seconds.
  const acceptsNullableNumber = (value: unknown): value is number | null =>
    value === null || (typeof value === 'number' && Number.isFinite(value));
  const [viewSpan, setViewSpan] = usePersistentState<number | null>(
    stateKey(compositionStateKeys.mistViewSpan),
    null,
    acceptsNullableNumber
  );
  const [runSpeed, setRunSpeed] = usePersistentState<number | null>(
    stateKey(compositionStateKeys.mistRunSpeed),
    null,
    acceptsNullableNumber
  );
  // Which stratum's curve is open for drawing.
  const [editingCurve, setEditingCurve] = useState<number | null>(null);

  const field = useMemo(() => buildMistField(settings), [settings]);
  const sampling = useMemo(() => sampleMist(settings, field), [settings, field]);
  const chords = useMemo(
    () => mistChordsPacket(instanceId, settings, sampling),
    [instanceId, settings, sampling]
  );
  const voices = useMemo(
    () => mistVoicesPacket(instanceId, settings, sampling),
    [instanceId, settings, sampling]
  );
  const outputs = useMemo<PublishedCompositionOutput[]>(
    () =>
      sampling.strataIndices.length && sampling.positions.length
        ? [
            {
              ref: { instanceId, port: 'chords' },
              label: `${instanceLabel} · Chords`,
              packet: chords,
            },
            {
              ref: { instanceId, port: 'voices' },
              label: `${instanceLabel} · Voices`,
              packet: voices,
            },
          ]
        : [],
    [instanceId, instanceLabel, chords, voices, sampling]
  );
  useEffect(() => {
    onOutputsChange?.(instanceId, outputs);
  }, [instanceId, onOutputsChange, outputs]);

  const preview = useModulePreview({ instanceId, volume, transportPlay: playPreview });

  function update(patch: Partial<MistSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function updateStratum(index: number, patch: Partial<MistStratum>) {
    setSettings((current) => ({
      ...current,
      strata: current.strata.map((stratum, i) =>
        i === index ? { ...stratum, ...patch } : stratum
      ),
    }));
  }

  function addStratum() {
    setSettings((current) =>
      current.strata.length >= maxMistStrata
        ? current
        : { ...current, strata: [...current.strata, defaultStratum(current.strata.length)] }
    );
  }

  function removeStratum(index: number) {
    setSettings((current) => ({
      ...current,
      strata: current.strata.filter((_, i) => i !== index),
    }));
  }

  function applyPreset(id: string | null) {
    if (id) {
      update({ strata: presetStrata(id as MistPresetId) });
    }
  }

  function playPreview() {
    const stepSeconds = stepMilliseconds / 1000;
    if (!(stepSeconds > 0) || !sampling.mapped.length || !sampling.strataIndices.length) {
      preview.setStatus('Enable a stratum and at least one step to preview.');
      return;
    }
    const groups = sampling.mapped.map((row, step) => ({
      id: `${instanceId}:chord:${step}`,
      label: String(step + 1),
      pitches: row.map((value, k) => ({
        id: `${instanceId}:chord:${step}:${k}`,
        label: String(value),
        midicents: value * 100,
      })),
      provenance: chords.items[step].provenance,
    }));
    const { plan, skippedEvents } = createPitchPreviewPlan({
      sourceId: instanceId,
      groups,
      stepSeconds,
      gatePercent,
    });
    void preview.play(
      plan,
      skippedEvents === 0
        ? `Playing ${groups.length} chords as MIDI notes.`
        : `${skippedEvents} values lie outside 20–20,000 Hz and were skipped.`
    );
  }

  function reset() {
    preview.stop('');
    setSettings(defaultMistSettings());
    setStepMilliseconds(250);
    setGatePercent(90);
    setVolume(30);
    preview.setStatus('Swirling Mists reset.');
  }

  const count = sampling.positions.length;
  const realign = formatRealignment(sampling, settings.stride);
  const passes = realign ? passesPerRepeat(settings.strata) : undefined;
  const curveStratum = editingCurve !== null ? settings.strata[editingCurve] : undefined;

  const stratumRows = settings.strata.map((stratum, index) => (
    <div key={index} style={{ display: 'contents' }}>
      <Switch
        size="xs"
        checked={stratum.enabled}
        aria-label={`Stratum ${index + 1} enabled`}
        onChange={(event) => updateStratum(index, { enabled: event.currentTarget.checked })}
      />
      <Group gap={6} wrap="nowrap">
        <span className={classes.swatch} style={{ background: strataColor(index) }} aria-hidden />
        <Select
          size="xs"
          w="5rem"
          aria-label={`Stratum ${index + 1} waveform`}
          allowDeselect={false}
          data={[
            { value: 'sine', label: 'Sine' },
            { value: 'walk', label: 'Walk' },
            { value: 'custom', label: 'Draw' },
          ]}
          value={stratum.waveform}
          onChange={(value) => {
            if (!value) {
              return;
            }
            const waveform = value as MistStratum['waveform'];
            // A new drawn curve starts as a sine, so switching to Draw never changes what you hear.
            updateStratum(
              index,
              waveform === 'custom' && !stratum.custom
                ? { waveform, custom: curveShape('sine') }
                : { waveform }
            );
          }}
        />
      </Group>
      <NumberInput
        size="xs"
        aria-label={`Stratum ${index + 1} cycles per pass`}
        title="Whole cycles of the waveform in one pass"
        min={1}
        max={maxMistCycles}
        value={stratum.cycles}
        onChange={(value) =>
          updateStratum(index, { cycles: Math.round(numberOr(value, stratum.cycles)) })
        }
      />
      <NumberInput
        size="xs"
        aria-label={`Stratum ${index + 1} speed: passes per position`}
        title="How fast the shape is traversed, in passes per position (bigger is faster). Speeds 1 and 0.5 line up every 2; 2 and 3 every 1. 0 holds still."
        step={0.25}
        decimalScale={4}
        value={stratum.speed}
        onChange={(value) => updateStratum(index, { speed: numberOr(value, stratum.speed) })}
      />
      <NumberInput
        size="xs"
        aria-label={`Stratum ${index + 1} phase as a fraction of a pass`}
        step={0.05}
        decimalScale={3}
        value={stratum.phase}
        onChange={(value) => updateStratum(index, { phase: numberOr(value, stratum.phase) })}
      />
      <NumberInput
        size="xs"
        aria-label={`Stratum ${index + 1} center`}
        step={0.25}
        decimalScale={3}
        value={stratum.center}
        onChange={(value) => updateStratum(index, { center: numberOr(value, stratum.center) })}
      />
      <NumberInput
        size="xs"
        aria-label={`Stratum ${index + 1} amplitude`}
        step={0.1}
        min={0}
        decimalScale={3}
        value={stratum.amplitude}
        onChange={(value) =>
          updateStratum(index, { amplitude: numberOr(value, stratum.amplitude) })
        }
      />
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label={`Remove stratum ${index + 1}`}
        onClick={() => removeStratum(index)}
      >
        ×
      </ActionIcon>
      {stratum.waveform === 'walk' && (
        <Group gap="xs" wrap="nowrap" style={{ gridColumn: '2 / -1' }}>
          <NumberInput
            size="xs"
            w="6.5rem"
            label="Points"
            aria-label={`Stratum ${index + 1} points per cycle`}
            min={2}
            max={maxWalkPoints}
            value={stratum.walkPoints}
            onChange={(value) =>
              updateStratum(index, { walkPoints: Math.round(numberOr(value, stratum.walkPoints)) })
            }
          />
          <NumberInput
            size="xs"
            w="6.5rem"
            label="Walk step"
            aria-label={`Stratum ${index + 1} walk step`}
            step={0.05}
            min={0}
            decimalScale={3}
            value={stratum.walkStep}
            onChange={(value) =>
              updateStratum(index, { walkStep: numberOr(value, stratum.walkStep) })
            }
          />
          <NumberInput
            size="xs"
            w="6.5rem"
            label="Smoothing"
            aria-label={`Stratum ${index + 1} smoothing window`}
            min={1}
            max={64}
            value={stratum.smoothing}
            onChange={(value) =>
              updateStratum(index, { smoothing: Math.round(numberOr(value, stratum.smoothing)) })
            }
          />
        </Group>
      )}
      {stratum.waveform === 'custom' && (
        <Group gap="xs" wrap="nowrap" style={{ gridColumn: '2 / -1' }}>
          <Button size="compact-xs" variant="default" onClick={() => setEditingCurve(index)}>
            Draw curve…
          </Button>
          <svg width={96} height={24} viewBox="0 0 96 24" aria-hidden>
            <polyline
              className={classes.miniCurve}
              points={(stratum.custom ?? curveShape('sine'))
                .map((value, i, all) => `${(i / all.length) * 96},${12 - value * 10}`)
                .join(' ')}
            />
          </svg>
        </Group>
      )}
    </div>
  ));

  return (
    <>
      <Modal
        opened={curveStratum !== undefined}
        onClose={() => setEditingCurve(null)}
        title={editingCurve !== null ? `Draw stratum ${editingCurve + 1}` : ''}
        size="lg"
      >
        {curveStratum && editingCurve !== null && (
          <>
            <Text size="xs" c="dimmed" mb="xs">
              Drag across the plot to draw one loop. The curve repeats, and the dashed line is where
              the end leads back into the start. Changes apply immediately.
            </Text>
            <CurveEditor
              points={curveStratum.custom ?? curveShape('sine')}
              onChange={(points) => updateStratum(editingCurve, { custom: points })}
            />
          </>
        )}
      </Modal>
      <ModuleDevice
        name={instanceLabel}
        status={`${sampling.strataIndices.length} strata, ${count} steps`}
        badges={
          realign ? (
            <Badge
              variant="outline"
              title={
                passes
                  ? `The field repeats every ${Number(realign.period.toFixed(3))} units, in which the strata complete ${passes.join(' : ')} passes`
                  : 'The whole field repeats after this many units'
              }
            >
              repeats every {Number(realign.period.toFixed(3))}
              {passes ? ` · ${passes.join(' : ')} passes` : ''}
              {realign.steps !== undefined && settings.stride !== 1
                ? ` (${Number(realign.steps.toFixed(3))} steps)`
                : ''}
            </Badge>
          ) : (
            <Badge variant="outline">no repeat</Badge>
          )
        }
        actions={
          <>
            <Button onClick={playPreview}>▶ Play</Button>
            <Button variant="default" onClick={() => preview.stop()}>
              ■ Stop
            </Button>
          </>
        }
        onReset={reset}
        footer={
          <Text size="xs" c="dimmed" truncate aria-live="polite">
            {preview.status ||
              sampling.warnings[0] ||
              'Preview reads each step as MIDI notes; the outputs are plain numbers.'}
          </Text>
        }
        controls={
          <>
            <InspectorSection label="Sampling">
              <Select
                size="xs"
                label="Preset"
                placeholder="Apply a preset…"
                data={mistPresets.map((preset) => ({ value: preset.id, label: preset.label }))}
                value={null}
                onChange={applyPreset}
              />
              <NumberInput
                size="xs"
                label="Steps"
                min={1}
                max={maxMistSteps}
                value={settings.steps}
                onChange={(value) => update({ steps: Math.round(numberOr(value, settings.steps)) })}
              />
              <NumberInput
                size="xs"
                label="Start"
                decimalScale={6}
                value={settings.start}
                onChange={(value) => update({ start: numberOr(value, settings.start) })}
              />
              <NumberInput
                size="xs"
                label="Stride"
                description="Positions between samples. Speed 1 is one pass per position."
                step={0.0625}
                decimalScale={6}
                value={settings.stride}
                onChange={(value) => update({ stride: numberOr(value, settings.stride) })}
              />
            </InspectorSection>
            <InspectorSection label="Strata">
              <div style={{ overflowX: 'auto' }}>
                <div className={classes.strataTable}>
                  <span />
                  <span className={classes.headerCell}>Wave</span>
                  <span className={classes.headerCell}>Cycles</span>
                  <span className={classes.headerCell}>Speed</span>
                  <span className={classes.headerCell}>Phase</span>
                  <span className={classes.headerCell}>Center</span>
                  <span className={classes.headerCell}>Amp</span>
                  <span />
                  {stratumRows}
                </div>
              </div>
              <Button
                variant="default"
                size="xs"
                disabled={settings.strata.length >= maxMistStrata}
                onClick={addStratum}
              >
                + Stratum
              </Button>
            </InspectorSection>

            <ModuleInspectorContent>
              <InspectorSection label="Source">
                <TextInput
                  size="xs"
                  label="Seed"
                  description="Random walks repeat exactly for the same seed."
                  value={settings.seed}
                  onChange={(event) => update({ seed: event.currentTarget.value.slice(0, 24) })}
                />
                <Select
                  size="xs"
                  label="Interpolation"
                  allowDeselect={false}
                  data={[
                    { value: 'linear', label: 'Linear' },
                    { value: 'nearest', label: 'Nearest cell' },
                  ]}
                  value={settings.interpolation}
                  onChange={(value) =>
                    value && update({ interpolation: value as MistInterpolation })
                  }
                />
              </InspectorSection>
              <InspectorSection label="Output range">
                <Text size="xs" c="dimmed">
                  The field&apos;s full reach maps onto this range, so values do not move when the
                  window does.
                </Text>
                <NumberInput
                  size="xs"
                  label="Low"
                  value={settings.mapLow}
                  onChange={(value) => update({ mapLow: numberOr(value, settings.mapLow) })}
                />
                <NumberInput
                  size="xs"
                  label="High"
                  value={settings.mapHigh}
                  onChange={(value) => update({ mapHigh: numberOr(value, settings.mapHigh) })}
                />
                <NumberInput
                  size="xs"
                  label="Round to"
                  description="Outputs are rounded to a multiple of this, e.g. 1, 0.5, 0.01."
                  step={settings.mapStep <= 0.1 ? 0.01 : 0.5}
                  decimalScale={6}
                  value={settings.mapStep}
                  onChange={(value) => {
                    // Any positive step is taken as typed. A half-typed value such as "0" or "0." on the
                    // way to 0.01 waits for the next key instead of being saved as 0.
                    const next = typeof value === 'number' ? value : Number(value);
                    if (value !== '' && Number.isFinite(next) && next > 0) {
                      update({ mapStep: next });
                    }
                  }}
                />
              </InspectorSection>
              <InspectorSection label="Preview">
                <NumberInput
                  size="xs"
                  label="Step"
                  suffix=" ms"
                  min={20}
                  max={5000}
                  value={stepMilliseconds}
                  onChange={(value) => setStepMilliseconds(numberOr(value, stepMilliseconds))}
                />
                <div className={workbench.moduleParameterRow}>
                  <Text size="xs">Gate</Text>
                  <Group gap="xs" wrap="nowrap" className={workbench.volumeControl}>
                    <Slider
                      thumbLabel="Preview gate length"
                      min={1}
                      max={200}
                      value={gatePercent}
                      onChange={setGatePercent}
                    />
                    <Text ff="monospace" size="xs" w="2.5rem" ta="right">
                      {gatePercent}%
                    </Text>
                  </Group>
                </div>
                <VolumeControl
                  accessibleLabel="Swirling Mists preview volume"
                  label="Volume"
                  value={volume}
                  onChange={setVolume}
                />
              </InspectorSection>
              <ModuleOutputsSection instanceLabel={instanceLabel} outputs={outputs} />
            </ModuleInspectorContent>
          </>
        }
      >
        <MistStage
          instanceId={instanceId}
          settings={settings}
          field={field}
          stepSeconds={stepMilliseconds / 1000}
          audioPlaying={preview.playing}
          repeat={realign?.period}
          span={viewSpan}
          onSpan={setViewSpan}
          speed={runSpeed}
          onSpeed={setRunSpeed}
        />
        <MistSnapshot
          instanceId={instanceId}
          settings={settings}
          sampling={sampling}
          stepSeconds={stepMilliseconds / 1000}
          audioPlaying={preview.playing}
        />
      </ModuleDevice>
    </>
  );
}
