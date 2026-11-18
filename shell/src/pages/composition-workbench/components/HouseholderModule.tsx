import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  NumberInput,
  Radio,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  compositionOutputOptions,
  outputRefKey,
  parseOutputRef,
  type CompositionModuleRoutingProps,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import type { ModuleRouteState } from '../compositionWorkspace';
import {
  metricAxisLabels,
  reflectAxisLabels,
  type HouseholderCandidate,
  type HouseholderMode,
  type MetricAxisKey,
  type ReflectAxisPreset,
} from '../householder';
import type { DataPacket } from '../model';
import { rhythmOrigin } from '../rhythmFrame';
import {
  createRhythmPreviewPlan,
  musicalPlanSeconds,
  transportRhythmContext,
  type RhythmPreviewLayer,
} from '../rhythmRealization';
import { rhythmInterpretableDomains } from '../routeTreatments';
import {
  defaultHouseholderSettings,
  pickHouseholderInputs,
  type HouseholderSettings,
  type MetricAxisSettings,
} from '../runtime/evaluators/householder';
import { useModuleEvaluation } from '../runtime/useModuleEvaluation';
import { isSoundOverride, layerSound, type SoundOverride } from '../sounds';
import { pulseSeconds } from '../transport';
import { useModulePreview } from '../useModulePreview';
import {
  acceptsFiniteNumber,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { DurationStrip } from './DurationStrip';
import { ModuleDevice } from './ModuleDevice';
import { InspectorSection, ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import { SoundOverrideControl } from './SoundControls';
import { SourceMenu } from './SourceMenu';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

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

  // Inputs: the rhythm to alter, and an optional routed axis contour (Reflect mode).
  const bindingRhythm = routeState.rhythm;
  const bindingAxis = routeState.axis;
  const axisRouted = Boolean(bindingAxis?.source);
  const identityWeight = settings.identity ?? defaultHouseholderSettings.identity!;
  const {
    rhythm,
    cyclic,
    computed,
    clampedIndex,
    selected,
    outputs: publishedOutputs,
  } = useModuleEvaluation(
    'rhythm-householder',
    { settings, selectedIndex },
    pickHouseholderInputs(outputs, routeState, instanceId),
    { instanceId, instanceLabel, edo },
    onOutputsChange
  );

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
  const inputLayer = (): RhythmPreviewLayer => ({
    layerId: 'input',
    steps: inputDurations.map((duration) => ({ duration })),
    origin: inputOrigin,
    sound: layerSound(rhythmVoices, 0, layerOverrides.input),
  });
  const candidateLayer = (candidate: HouseholderCandidate): RhythmPreviewLayer => ({
    layerId: 'candidate',
    steps: candidate.durations.map((duration) => ({ duration })),
    origin: candidate.origin ?? inputOrigin,
    sound: layerSound(rhythmVoices, 1, layerOverrides.candidate),
  });

  function playPreview(layers: RhythmPreviewLayer[], what: string) {
    if (!layers.some((layer) => layer.steps.length)) {
      preview.setStatus('Nothing to preview yet.');
      return;
    }
    const plan = createRhythmPreviewPlan({
      sourceId: instanceId,
      ...transportRhythmContext(compositionSettings.transport),
      layers,
    });
    void preview.play(plan, `Playing ${what} for ${musicalPlanSeconds(plan).toFixed(1)} seconds.`);
    // After play(): its opening stop() clears the previous layers.
    setPlayingLayers(layers.map((layer) => layer.layerId));
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

  const view = computed.error ? (
    <Alert color="red" title="No candidates">
      {computed.error}
    </Alert>
  ) : (
    <>
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
        <Alert color="yellow" title="Householder report" p="xs">
          <Stack gap={4}>
            {computed.warnings.map((warning) => (
              <Text size="xs" key={warning}>
                {warning}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
      {/* A fixed-height list with its own scroll: many candidates never lengthen the panel. */}
      <div className={classes.candidateList}>
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
          <Stack gap={6} mt="xs">
            {computed.candidates.map((candidate, index) => (
              <Radio
                key={index}
                value={String(index)}
                label={
                  <Text ff="monospace" size="xs">
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
      </div>
    </>
  );

  return (
    <ModuleDevice
      name={instanceLabel}
      badges={
        <>
          <Badge variant="outline">{computed.candidates.length} candidates</Badge>
          {computed.search && <Badge variant="outline">{computed.search} search</Badge>}
        </>
      }
      actions={
        <>
          <Button
            disabled={!selected}
            onClick={() =>
              selected && playPreview([candidateLayer(selected)], `candidate ${clampedIndex + 1}`)
            }
          >
            ▶ Candidate
          </Button>
          <Button
            variant="default"
            disabled={!inputDurations.length}
            onClick={() => playPreview([inputLayer()], 'the input')}
          >
            ▶ Input
          </Button>
          <Tooltip label="Input and candidate together, each on its own sound">
            <Button
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
          <Button variant="default" onClick={() => preview.stop()}>
            ■
          </Button>
        </>
      }
      onReset={resetModule}
      footer={
        <Text size="xs" c="dimmed" truncate aria-live="polite">
          {preview.status ||
            (settings.mode === 'reflect'
              ? 'Reflects the duration vector along an axis, keeping attack count and total span.'
              : 'Re-places attacks on the slot grid to change where they land, keeping attack count and total span.')}
        </Text>
      }
      controls={
        <>
          <InspectorSection label="Mode">
            <SegmentedControl
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
                  label="Keep the start where the input's is"
                  description="Off lets candidates begin off the beat."
                  checked={settings.pinStart ?? false}
                  onChange={(event) => update({ pinStart: event.currentTarget.checked })}
                />
                <NumberInput
                  label="Keep identity"
                  description="Penalty for changing the distances between attacks. Favours displacing the whole rhythm over reshaping it."
                  min={0}
                  step={0.25}
                  decimalScale={2}
                  value={identityWeight}
                  onChange={(value) => update({ identity: Math.max(0, Number(value) || 0) })}
                />
                <NumberInput
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
          </InspectorSection>

          <ModuleInspectorContent>
            <InspectorSection label="Inputs">
              <SourceMenu
                label="Rhythm source"
                placeholder="Connect a rhythm"
                options={rhythmOptions}
                value={bindingRhythm?.source ? outputRefKey(bindingRhythm.source) : null}
                onChange={(value) => onBind('rhythm', value ? parseOutputRef(value) : null)}
              />
              {settings.mode === 'reflect' && (
                <SourceMenu
                  label="Axis source"
                  description="Optional. A connected axis replaces the preset."
                  placeholder="Use the preset below"
                  options={axisOptions}
                  value={bindingAxis?.source ? outputRefKey(bindingAxis.source) : null}
                  onChange={(value) => onBind('axis', value ? parseOutputRef(value) : null)}
                />
              )}
            </InspectorSection>

            <InspectorSection label="Grid">
              <Select
                label="Resolution"
                data={gridOptions}
                value={String(settings.grid)}
                allowDeselect={false}
                onChange={(value) => value && update({ grid: Number(value) })}
              />
              <NumberInput
                label="Minimum duration (grid steps)"
                min={1}
                value={settings.minUnits}
                onChange={(value) =>
                  update({ minUnits: Math.max(1, Math.floor(Number(value) || 1)) })
                }
              />
            </InspectorSection>

            <InspectorSection label="Preview">
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
            </InspectorSection>

            <ModuleOutputsSection instanceLabel={instanceLabel} outputs={publishedOutputs} />
          </ModuleInspectorContent>
        </>
      }
    >
      {view}
    </ModuleDevice>
  );
}
