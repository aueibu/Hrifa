import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Radio,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import {
  createLayeredDurationPreviewPlan,
  type DurationLayer,
} from '../audio/performancePlans';
import {
  boundOutput,
  compositionOutputOptions,
  outputRefKey,
  parseOutputRef,
  resolvePacketFromOutput,
  type CompositionModuleRoutingProps,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import { isSoundOverride, layerSound, type SoundOverride } from '../sounds';
import { pulseSeconds } from '../transport';
import { SoundOverrideControl } from './SoundControls';
import type { ModuleRouteState } from '../compositionWorkspace';
import {
  householderCandidatesPacket,
  householderSelectedPacket,
  metricAxisLabels,
  reflectAxisLabels,
  reflectAxisPreset,
  reflectRhythm,
  searchMetric,
  type HouseholderCandidate,
  type HouseholderMode,
  type HouseholderResult,
  type MetricAxisKey,
  type ReflectAxisPreset,
} from '../householder';
import type { DataPacket } from '../model';
import { rhythmOrigin } from '../rhythmFrame';
import { isValidRhythmSource, rhythmInterpretableDomains } from '../routeTreatments';
import { signalTypeRegistry } from '../signalTypes';
import {
  acceptsFiniteNumber,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { useModulePreview } from '../useModulePreview';
import { DurationStrip } from './DurationStrip';
import { Module, ModuleOutput, ModuleSection } from './Module';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

interface MetricAxisSettings {
  enabled: boolean;
  coefficient: number;
  weight: number;
}

export interface HouseholderSettings {
  mode: HouseholderMode;
  grid: number;
  minUnits: number;
  reflectPreset: ReflectAxisPreset;
  customAxis: string;
  reflectCoefficient: number;
  reflectSteps: number;
  accentPattern: string;
  accent: MetricAxisSettings;
  position: MetricAxisSettings;
  closeness: number;
  /** Added after the first release; older saved settings without it get the default. */
  identity?: number;
  /** Keep the first attack where the input's is. Free by default so rhythms can start off the beat. */
  pinStart?: boolean;
}

export const defaultHouseholderSettings: HouseholderSettings = {
  mode: 'reflect',
  grid: 1,
  minUnits: 1,
  reflectPreset: 'swing',
  customAxis: '1 0 -1',
  reflectCoefficient: -1,
  reflectSteps: 4,
  accentPattern: '1 0 0 0',
  accent: { enabled: true, coefficient: -1, weight: 1 },
  position: { enabled: false, coefficient: -1, weight: 1 },
  closeness: 0.1,
  identity: 1,
  pinStart: false,
};

function acceptsAxisSettings(value: unknown): value is MetricAxisSettings {
  const axis = value as MetricAxisSettings;
  return (
    Boolean(axis) &&
    typeof axis === 'object' &&
    typeof axis.enabled === 'boolean' &&
    Number.isFinite(axis.coefficient) &&
    Number.isFinite(axis.weight)
  );
}

function acceptsHouseholderSettings(value: unknown): value is HouseholderSettings {
  const settings = value as HouseholderSettings;
  return (
    Boolean(settings) &&
    typeof settings === 'object' &&
    (settings.mode === 'reflect' || settings.mode === 'metric') &&
    Number.isInteger(settings.grid) &&
    Number.isInteger(settings.minUnits) &&
    settings.reflectPreset in reflectAxisLabels &&
    typeof settings.customAxis === 'string' &&
    Number.isFinite(settings.reflectCoefficient) &&
    Number.isInteger(settings.reflectSteps) &&
    typeof settings.accentPattern === 'string' &&
    acceptsAxisSettings(settings.accent) &&
    acceptsAxisSettings(settings.position) &&
    Number.isFinite(settings.closeness) &&
    (settings.identity === undefined || Number.isFinite(settings.identity)) &&
    (settings.pinStart === undefined || typeof settings.pinStart === 'boolean')
  );
}

function parseNumberList(text: string): number[] | undefined {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const values = parts.map(Number);
  return parts.length && values.every(Number.isFinite) ? values : undefined;
}

function compatibleRhythm(packet: DataPacket) {
  return packet.kind === 'list' && rhythmInterpretableDomains.has(packet.domain);
}

const numericAxisDomains = new Set([
  'integer',
  'rational',
  'duration',
  'onset',
  'interval',
  'cycleLength',
  'pulseCount',
  'phaseOffset',
]);

function compatibleAxis(packet: DataPacket) {
  return (
    (packet.kind === 'list' || packet.kind === 'value') && numericAxisDomains.has(packet.domain)
  );
}

const coefficientMarks = [
  { value: -1, label: 'Reflect' },
  { value: 0, label: 'Neutral' },
  { value: 1, label: 'Keep' },
];

const gridOptions = [1, 2, 3, 4, 6, 8].map((grid) => ({
  value: String(grid),
  label: grid === 1 ? 'Whole units' : `1/${grid} unit`,
}));

const reflectPresetOptions = (Object.keys(reflectAxisLabels) as ReflectAxisPreset[]).map(
  (preset) => ({
    value: preset,
    label: reflectAxisLabels[preset],
  })
);

function candidateDescription(candidate: HouseholderCandidate, mode: HouseholderMode) {
  if (mode === 'reflect') {
    return `coefficient ${candidate.coefficient!.toFixed(2)} → realized ${candidate.realizedCoefficient!.toFixed(2)}`;
  }
  const axes = (candidate.axes ?? [])
    .map((axis) => `${axis.label} ${axis.realized.toFixed(2)} (target ${axis.target.toFixed(2)})`)
    .join(' · ');
  const identity =
    candidate.identityChange === undefined
      ? ''
      : ` · ${Math.round(candidate.identityChange * 100)}% of intervals changed`;
  return `${axes} · moved ${candidate.movement}${identity}`;
}

function CoefficientSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
}) {
  return (
    <div>
      <Text size="xs" mb={2}>
        {label}:{' '}
        <Text span ff="monospace">
          {value.toFixed(2)}
        </Text>
      </Text>
      <Slider
        aria-label={label}
        min={-1.5}
        max={1.5}
        step={0.25}
        marks={coefficientMarks}
        value={value}
        onChange={onChange}
        mb="lg"
      />
    </div>
  );
}

export interface HouseholderModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
  outputs: PublishedCompositionOutput[];
  routeState: ModuleRouteState;
  onBind(port: string, source: CompositionOutputRef | null): void;
}

interface HouseholderSounds {
  input: SoundOverride | null;
  candidate: SoundOverride | null;
}

export function HouseholderModule({
  instanceId,
  instanceLabel,
  outputs,
  routeState,
  onBind,
  onOutputsChange,
}: HouseholderModuleProps) {
  const { settings: compositionSettings } = useCompositionSettings();
  const edo = compositionSettings.edo;
  const stateKey = (key: string) =>
    compositionInstanceStateKey(key, instanceId, 'rhythm-householder');
  const [settings, setSettings] = usePersistentState<HouseholderSettings>(
    stateKey(compositionStateKeys.householderSettings),
    defaultHouseholderSettings,
    acceptsHouseholderSettings
  );
  const [selectedIndex, setSelectedIndex] = usePersistentState(
    stateKey(compositionStateKeys.householderSelected),
    0,
    acceptsFiniteNumber
  );
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.householderVolume),
    30,
    acceptsFiniteNumber
  );
  // Input plays on the primary rhythm voice and candidates on the secondary, unless set here.
  const [layerOverrides, setLayerOverrides] = usePersistentState<HouseholderSounds>(
    stateKey(compositionStateKeys.householderSounds),
    { input: null, candidate: null },
    (value): value is HouseholderSounds =>
      Boolean(value) &&
      typeof value === 'object' &&
      [(value as HouseholderSounds).input, (value as HouseholderSounds).candidate].every(
        (sound) => sound === null || isSoundOverride(sound)
      )
  );
  // Which strips the current preview is sounding, so only their playheads move.
  const [playingLayers, setPlayingLayers] = useState<string[]>([]);

  const update = (patch: Partial<HouseholderSettings>) =>
    setSettings((current) => ({ ...current, ...patch }));
  const identityWeight = settings.identity ?? defaultHouseholderSettings.identity!;

  // Inputs: the rhythm to alter, and an optional routed axis contour (Reflect mode).
  const bindingRhythm = routeState.rhythm;
  const bindingAxis = routeState.axis;
  const selfBoundRhythm = bindingRhythm?.source?.instanceId === instanceId;
  const selfBoundAxis = bindingAxis?.source?.instanceId === instanceId;
  const rhythmOutput = boundOutput(outputs, bindingRhythm?.source);
  const axisOutput = boundOutput(outputs, bindingAxis?.source);
  const resolvedRhythm = useMemo(
    () =>
      selfBoundRhythm
        ? undefined
        : resolvePacketFromOutput(
            rhythmOutput,
            bindingRhythm?.source?.index,
            `route:${instanceId}:rhythm`
          ),
    [selfBoundRhythm, rhythmOutput, bindingRhythm?.source?.index, instanceId]
  );
  const resolvedAxis = useMemo(
    () =>
      selfBoundAxis
        ? undefined
        : resolvePacketFromOutput(
            axisOutput,
            bindingAxis?.source?.index,
            `route:${instanceId}:axis`
          ),
    [selfBoundAxis, axisOutput, bindingAxis?.source?.index, instanceId]
  );
  const treatedRhythm = useMemo(
    () =>
      bindingRhythm
        ? signalTypeRegistry[bindingRhythm.signalType].apply(
            resolvedRhythm,
            bindingRhythm.treatment,
            `route:${instanceId}:rhythm`,
            edo
          )
        : undefined,
    [bindingRhythm, resolvedRhythm, instanceId, edo]
  );
  const treatedAxis = useMemo(
    () =>
      bindingAxis
        ? signalTypeRegistry[bindingAxis.signalType].apply(
            resolvedAxis,
            bindingAxis.treatment,
            `route:${instanceId}:axis`,
            edo
          )
        : undefined,
    [bindingAxis, resolvedAxis, instanceId, edo]
  );

  const cyclic = treatedRhythm?.frame?.topology !== 'linear';
  const rhythm = isValidRhythmSource(treatedRhythm)
    ? (treatedRhythm as DataPacket<number>)
    : undefined;
  const axisRouted = Boolean(bindingAxis?.source);

  const computed = useMemo((): HouseholderResult & {
    transformation: string;
    parameters: Record<string, unknown>;
  } => {
    const base = {
      transformation: `householder-${settings.mode}`,
      parameters: {} as Record<string, unknown>,
    };
    if (!rhythm) {
      return {
        ...base,
        candidates: [],
        inputUnits: [],
        warnings: [],
        error: treatedRhythm
          ? 'The connected source is not an inter-onset duration list yet. Turn on “Interpret as rhythm” on its route.'
          : 'Connect a rhythm to alter.',
      };
    }
    const durations = rhythm.items.map((item) => Number(item.value));
    if (settings.mode === 'reflect') {
      let axis: number[] | undefined;
      let axisSource: string;
      if (axisRouted) {
        axisSource = 'routed';
        const values = treatedAxis?.items.map((item) => item.value);
        axis = values?.every((value) => typeof value === 'number' && Number.isFinite(value))
          ? (values as number[])
          : undefined;
        if (!axis?.length) {
          return {
            ...base,
            candidates: [],
            inputUnits: [],
            warnings: [],
            error: 'The routed axis must be a list of plain numbers (no groups).',
          };
        }
      } else if (settings.reflectPreset === 'custom') {
        axisSource = 'custom';
        axis = parseNumberList(settings.customAxis);
        if (!axis) {
          return {
            ...base,
            candidates: [],
            inputUnits: [],
            warnings: [],
            error: 'Enter the custom axis as numbers.',
          };
        }
      } else {
        axisSource = settings.reflectPreset;
        axis = reflectAxisPreset(settings.reflectPreset, durations.length);
      }
      const result = reflectRhythm({
        durations,
        axis,
        coefficient: settings.reflectCoefficient,
        grid: settings.grid,
        minUnits: settings.minUnits,
        steps: settings.reflectSteps,
      });
      return {
        ...result,
        transformation: 'householder-reflect',
        parameters: {
          axis: axisSource,
          axisValues: axis,
          coefficient: settings.reflectCoefficient,
          grid: settings.grid,
          minUnits: settings.minUnits,
        },
      };
    }
    const pattern = parseNumberList(settings.accentPattern);
    const result = searchMetric({
      durations,
      grid: settings.grid,
      minUnits: settings.minUnits,
      axes: [
        { key: 'accent', ...settings.accent, pattern: pattern ?? [] },
        { key: 'position', ...settings.position },
      ],
      closeness: settings.closeness,
      identity: identityWeight,
      cyclic,
      origin: rhythmOrigin(rhythm),
      pinStart: settings.pinStart ?? false,
      maxCandidates: 8,
    });
    return {
      ...result,
      transformation: 'householder-metric',
      parameters: {
        accentPattern: pattern,
        accent: settings.accent,
        position: settings.position,
        closeness: settings.closeness,
        identity: identityWeight,
        pinStart: settings.pinStart ?? false,
        grid: settings.grid,
        minUnits: settings.minUnits,
      },
    };
  }, [rhythm, treatedRhythm, treatedAxis, axisRouted, settings, identityWeight, cyclic]);

  const clampedIndex = computed.candidates.length
    ? Math.min(Math.max(0, Math.floor(selectedIndex)), computed.candidates.length - 1)
    : 0;
  const selected = computed.candidates[clampedIndex];

  const selectedPacket = useMemo(
    () =>
      rhythm && selected
        ? householderSelectedPacket(
            selected,
            rhythm,
            computed.warnings,
            instanceId,
            computed.transformation,
            { ...computed.parameters, candidate: clampedIndex }
          )
        : undefined,
    [rhythm, selected, computed, instanceId, clampedIndex]
  );
  const candidatesPacket = useMemo(
    () =>
      rhythm && computed.candidates.length
        ? householderCandidatesPacket(
            computed.candidates,
            rhythm,
            computed.warnings,
            instanceId,
            computed.transformation,
            computed.parameters
          )
        : undefined,
    [rhythm, computed, instanceId]
  );

  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(
    () =>
      selectedPacket && candidatesPacket
        ? [
            {
              ref: { instanceId, port: 'selected' },
              label: `${instanceLabel} · Selected`,
              packet: selectedPacket,
            },
            {
              ref: { instanceId, port: 'candidates' },
              label: `${instanceLabel} · Candidates`,
              packet: candidatesPacket,
            },
          ]
        : [],
    [instanceId, instanceLabel, selectedPacket, candidatesPacket]
  );

  useEffect(() => {
    onOutputsChange?.(instanceId, publishedOutputs);
  }, [instanceId, onOutputsChange, publishedOutputs]);

  const preview = useModulePreview({
    instanceId,
    volume: previewVolume,
    followTransport: true,
    transportPlay: () =>
      selected
        ? playPreview([candidateLayer(selected)], `candidate ${clampedIndex + 1}`)
        : playPreview([inputLayer()], 'the input'),
    onEnd: () => setPlayingLayers([]),
  });

  const rhythmVoices = compositionSettings.sounds.rhythm;
  const inputLayer = (): DurationLayer => ({
    id: 'input',
    durations: inputDurations,
    startOffset: inputOrigin,
    sound: layerSound(rhythmVoices, 0, layerOverrides.input),
  });
  const candidateLayer = (candidate: HouseholderCandidate): DurationLayer => ({
    id: 'candidate',
    durations: candidate.durations,
    startOffset: candidate.origin ?? inputOrigin,
    sound: layerSound(rhythmVoices, 1, layerOverrides.candidate),
  });

  function playPreview(layers: DurationLayer[], what: string) {
    if (!layers.some((layer) => layer.durations.length)) {
      preview.setStatus('Nothing to preview yet.');
      return;
    }
    const plan = createLayeredDurationPreviewPlan({
      sourceId: instanceId,
      layers,
      unitSeconds: pulseSeconds(compositionSettings.transport),
    });
    void preview.play(plan, `Playing ${what} for ${plan.durationSeconds.toFixed(1)} seconds.`);
    // After play(): its opening stop() clears the previous layers.
    setPlayingLayers(layers.map((layer) => layer.id));
  }

  function resetModule() {
    preview.stop('');
    setSettings(defaultHouseholderSettings);
    setSelectedIndex(0);
    setPreviewVolume(30);
    setLayerOverrides({ input: null, candidate: null });
    preview.setStatus('Rhythm Householder reset.');
  }

  const rhythmOptions = compositionOutputOptions(outputs, instanceId, compatibleRhythm);
  const axisOptions = compositionOutputOptions(outputs, instanceId, compatibleAxis);
  const inputDurations = rhythm?.items.map((item) => Number(item.value)) ?? [];
  const inputOrigin = rhythmOrigin(rhythm);

  return (
    <Surface className={classes.interferenceSurface}>
      <div className={classes.interferenceLayout}>
        <div className={classes.resultInspector}>
          <Group justify="space-between" align="start" mb="md">
            <div>
              <Title order={2} size="h3">
                {instanceLabel}
              </Title>
              <Text c="dimmed" size="sm">
                {settings.mode === 'reflect'
                  ? 'Reflects the duration vector along an axis, keeping attack count and total span.'
                  : 'Re-places attacks on the slot grid to change where they land, keeping attack count and total span.'}
              </Text>
            </div>
            <Group gap="xs">
              <Badge variant="outline">{computed.candidates.length} candidates</Badge>
              {computed.search && <Badge variant="outline">{computed.search} search</Badge>}
            </Group>
          </Group>

          {computed.error ? (
            <Alert color="red" title="No candidates">
              {computed.error}
            </Alert>
          ) : (
            <Stack gap="md">
              <DurationStrip
                label="Input"
                durations={inputDurations}
                origin={inputOrigin}
                cyclic={cyclic}
                playhead={{
                  sourceId: instanceId,
                  unitSeconds: pulseSeconds(compositionSettings.transport),
                  visible: playingLayers.includes('input'),
                }}
              />
              {selected && (
                <DurationStrip
                  label={`Candidate ${clampedIndex + 1}`}
                  durations={selected.durations}
                  origin={selected.origin ?? inputOrigin}
                  cyclic={cyclic}
                  playhead={{
                    sourceId: instanceId,
                    unitSeconds: pulseSeconds(compositionSettings.transport),
                    visible: playingLayers.includes('candidate'),
                  }}
                />
              )}
              {computed.warnings.length > 0 && (
                <Alert color="yellow" title="Householder report">
                  <Stack gap={4}>
                    {computed.warnings.map((warning) => (
                      <Text size="sm" key={warning}>
                        {warning}
                      </Text>
                    ))}
                  </Stack>
                </Alert>
              )}
              <Radio.Group
                label="Candidates"
                description={
                  settings.mode === 'reflect'
                    ? 'Full requested reflection first, then steps back toward the input.'
                    : 'Best match first: closest to each axis target, then least movement.'
                }
                value={String(clampedIndex)}
                onChange={(value) => setSelectedIndex(Number(value))}
              >
                <Stack gap="xs" mt="xs">
                  {computed.candidates.map((candidate, index) => (
                    <Radio
                      key={index}
                      value={String(index)}
                      label={
                        <Text ff="monospace" size="sm">
                          {candidate.durations.join(' ')}
                          {(candidate.origin ?? inputOrigin) > 0
                            ? ` · starts +${candidate.origin ?? inputOrigin}`
                            : ''}
                          {candidate.isInput ? ' (input)' : ''}
                        </Text>
                      }
                      description={candidateDescription(candidate, settings.mode)}
                    />
                  ))}
                </Stack>
              </Radio.Group>
            </Stack>
          )}
        </div>

        <Module
          name={instanceLabel}
          status={selected ? `${computed.candidates.length} candidates` : 'Needs a rhythm'}
          onReset={resetModule}
          output={
            publishedOutputs.length ? (
              <Stack gap="xs">
                {publishedOutputs.map((output) => (
                  <ModuleOutput
                    key={output.ref.port}
                    name={output.label.replace(`${instanceLabel} · `, '')}
                    packet={output.packet}
                  />
                ))}
              </Stack>
            ) : undefined
          }
          footer={
            <Text size="xs" c="dimmed" truncate aria-live="polite">
              {preview.status || 'Preview controls stay live.'}
            </Text>
          }
        >
          <ModuleSection label="Inputs">
            <Stack gap="xs">
              <Select
                size="xs"
                label="Rhythm source"
                placeholder="Connect a rhythm"
                clearable
                data={rhythmOptions}
                value={bindingRhythm?.source ? outputRefKey(bindingRhythm.source) : null}
                onChange={(value) => onBind('rhythm', value ? parseOutputRef(value) : null)}
              />
              {settings.mode === 'reflect' && (
                <Select
                  size="xs"
                  label="Axis source"
                  description="Optional. A connected axis replaces the preset."
                  placeholder="Use the preset below"
                  clearable
                  data={axisOptions}
                  value={bindingAxis?.source ? outputRefKey(bindingAxis.source) : null}
                  onChange={(value) => onBind('axis', value ? parseOutputRef(value) : null)}
                />
              )}
            </Stack>
          </ModuleSection>

          <ModuleSection label="Mode" grow>
            <Stack gap="xs">
              <SegmentedControl
                size="xs"
                fullWidth
                aria-label="Householder mode"
                data={[
                  { value: 'reflect', label: 'Reflect' },
                  { value: 'metric', label: 'Metric' },
                ]}
                value={settings.mode}
                onChange={(value) => {
                  update({ mode: value as HouseholderMode });
                  setSelectedIndex(0);
                }}
              />
              {settings.mode === 'reflect' ? (
                <>
                  <Select
                    size="xs"
                    label="Axis"
                    data={reflectPresetOptions}
                    value={settings.reflectPreset}
                    allowDeselect={false}
                    disabled={axisRouted}
                    onChange={(value) =>
                      value && update({ reflectPreset: value as ReflectAxisPreset })
                    }
                  />
                  {settings.reflectPreset === 'custom' && !axisRouted && (
                    <TextInput
                      size="xs"
                      label="Custom contour"
                      description="One value per attack, cycled."
                      value={settings.customAxis}
                      onChange={(event) => update({ customAxis: event.currentTarget.value })}
                    />
                  )}
                  <CoefficientSlider
                    label="Axis coefficient"
                    value={settings.reflectCoefficient}
                    onChange={(value) => update({ reflectCoefficient: value })}
                  />
                  <NumberInput
                    size="xs"
                    label="Morph steps"
                    min={1}
                    max={8}
                    value={settings.reflectSteps}
                    onChange={(value) =>
                      update({
                        reflectSteps: Math.max(1, Math.min(8, Math.floor(Number(value) || 1))),
                      })
                    }
                  />
                </>
              ) : (
                <>
                  {(['accent', 'position'] as MetricAxisKey[]).map((key) => (
                    <Stack gap={4} key={key}>
                      <Checkbox
                        size="xs"
                        label={metricAxisLabels[key]}
                        checked={settings[key].enabled}
                        onChange={(event) =>
                          update({
                            [key]: { ...settings[key], enabled: event.currentTarget.checked },
                          })
                        }
                      />
                      {settings[key].enabled && (
                        <>
                          {key === 'accent' && (
                            <TextInput
                              size="xs"
                              label="Accent pattern"
                              description="Weight per grid slot, repeating."
                              value={settings.accentPattern}
                              onChange={(event) =>
                                update({ accentPattern: event.currentTarget.value })
                              }
                            />
                          )}
                          <CoefficientSlider
                            label={`${metricAxisLabels[key]} coefficient`}
                            value={settings[key].coefficient}
                            onChange={(value) =>
                              update({ [key]: { ...settings[key], coefficient: value } })
                            }
                          />
                          <NumberInput
                            size="xs"
                            label="Weight"
                            min={0}
                            step={0.25}
                            decimalScale={2}
                            value={settings[key].weight}
                            onChange={(value) =>
                              update({
                                [key]: {
                                  ...settings[key],
                                  weight: Math.max(0, Number(value) || 0),
                                },
                              })
                            }
                          />
                        </>
                      )}
                    </Stack>
                  ))}
                  <Checkbox
                    size="xs"
                    label="Keep the start where the input's is"
                    description="Off lets candidates begin off the beat."
                    checked={settings.pinStart ?? false}
                    onChange={(event) => update({ pinStart: event.currentTarget.checked })}
                  />
                  <NumberInput
                    size="xs"
                    label="Keep identity"
                    description="Penalty for changing the distances between attacks. Favours displacing the whole rhythm over reshaping it."
                    min={0}
                    step={0.25}
                    decimalScale={2}
                    value={identityWeight}
                    onChange={(value) => update({ identity: Math.max(0, Number(value) || 0) })}
                  />
                  <NumberInput
                    size="xs"
                    label="Stay close"
                    description="Penalty for moving attacks away from the input."
                    min={0}
                    step={0.05}
                    decimalScale={2}
                    value={settings.closeness}
                    onChange={(value) => update({ closeness: Math.max(0, Number(value) || 0) })}
                  />
                </>
              )}
            </Stack>
          </ModuleSection>

          <ModuleSection label="Grid">
            <Stack gap="xs">
              <Select
                size="xs"
                label="Resolution"
                data={gridOptions}
                value={String(settings.grid)}
                allowDeselect={false}
                onChange={(value) => value && update({ grid: Number(value) })}
              />
              <NumberInput
                size="xs"
                label="Minimum duration (grid steps)"
                min={1}
                value={settings.minUnits}
                onChange={(value) =>
                  update({ minUnits: Math.max(1, Math.floor(Number(value) || 1)) })
                }
              />
            </Stack>
          </ModuleSection>

          <ModuleSection label="Preview">
            <Stack gap="xs">
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Input (A)</Text>
                <SoundOverrideControl
                  label="Input"
                  set={rhythmVoices}
                  voiceIndex={0}
                  value={layerOverrides.input}
                  onChange={(input) => setLayerOverrides({ ...layerOverrides, input })}
                />
              </div>
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Candidate (B)</Text>
                <SoundOverrideControl
                  label="Candidate"
                  set={rhythmVoices}
                  voiceIndex={1}
                  value={layerOverrides.candidate}
                  onChange={(candidate) => setLayerOverrides({ ...layerOverrides, candidate })}
                />
              </div>
              <VolumeControl
                accessibleLabel="Householder preview volume"
                label="Volume"
                value={previewVolume}
                onChange={setPreviewVolume}
              />
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="compact-sm"
                  disabled={!selected}
                  onClick={() =>
                    selected &&
                    playPreview([candidateLayer(selected)], `candidate ${clampedIndex + 1}`)
                  }
                >
                  ▶ Candidate
                </Button>
                <Button
                  size="compact-sm"
                  variant="default"
                  disabled={!inputDurations.length}
                  onClick={() => playPreview([inputLayer()], 'the input')}
                >
                  ▶ Input
                </Button>
                <Tooltip label="Input and candidate together, each on its own sound">
                  <Button
                    size="compact-sm"
                    variant="default"
                    disabled={!selected || !inputDurations.length}
                    onClick={() =>
                      selected &&
                      playPreview(
                        [inputLayer(), candidateLayer(selected)],
                        `the input against candidate ${clampedIndex + 1}`
                      )
                    }
                  >
                    ▶ A/B
                  </Button>
                </Tooltip>
                <Button size="compact-sm" variant="default" onClick={() => preview.stop()}>
                  ■
                </Button>
              </Group>
            </Stack>
          </ModuleSection>
        </Module>
      </div>
    </Surface>
  );
}
