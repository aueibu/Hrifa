import { Alert, Badge, Stack, Text } from '@mantine/core';
import { Button, Select } from '../../../ui';
import { useCompositionSettings } from '../compositionSettings';
import type { PairCompositionMode } from '../pairComposition';
import {
  createRhythmPreviewPlan,
  musicalPlanSeconds,
  transportRhythmContext,
} from '../rhythmRealization';
import { useNodeEvaluationResult } from '../runtime/evaluationStore';
import { useNodeState } from '../runtime/nodeState';
import { isPairCompositionMode, pairCompositionState } from '../runtime/nodeState/pairComposition';
import { isSoundOverride, layerSound, type SoundOverride } from '../sounds';
import { pulseSeconds } from '../transport';
import { useNodePreview } from '../useNodePreview';
import {
  acceptsFiniteNumber,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { DurationStrip } from './DurationStrip';
import { GeneratorPairControls } from './GeneratorPairControls';
import { NodeDevice } from './NodeDevice';
import { InspectorSection, NodeInspectorContent, NodeOutputsSection } from './NodeHost';
import { SoundOverrideControl } from './SoundControls';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

const modeOptions: { value: PairCompositionMode; label: string }[] = [
  { value: 'balancing', label: 'Balancing' },
  { value: 'expanding', label: 'Expansion' },
  { value: 'contracting', label: 'Contraction' },
];

interface PairCompositionNodeProps {
  instanceId: string;
  instanceLabel: string;
}

export function PairCompositionNode({ instanceId, instanceLabel }: PairCompositionNodeProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId);
  const [{ a, b, mode }, { a: setA, b: setB, mode: setMode }] = useNodeState(
    pairCompositionState,
    instanceId
  );
  // The preview's sound: the primary rhythm voice unless overridden here.
  const [soundSetting, setSoundSetting] = usePersistentState<SoundOverride | null>(
    stateKey(compositionStateKeys.pairCompositionSound),
    null,
    (value): value is SoundOverride | null => value === null || isSoundOverride(value)
  );
  const soundOverride: SoundOverride | null = soundSetting;
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.pairCompositionVolume),
    30,
    acceptsFiniteNumber
  );
  const { settings } = useCompositionSettings();

  const { generated, outputs: publishedOutputs } = useNodeEvaluationResult(
    'pair-composition',
    instanceId
  );

  const preview = useNodePreview({
    instanceId,
    volume: previewVolume,
    followTransport: true,
    transportPlay: playPreview,
  });

  function playPreview() {
    if (!generated.result) {
      return;
    }
    const plan = createRhythmPreviewPlan({
      sourceId: instanceId,
      ...transportRhythmContext(settings.transport),
      layers: [
        {
          layerId: 'rhythm',
          steps: generated.result.durations.map((duration) => ({ duration })),
          sound: layerSound(settings.sounds.rhythm, 0, soundOverride),
        },
      ],
    });
    void preview.play(
      plan,
      `Playing ${mode} ${a}÷${b} for ${musicalPlanSeconds(plan).toFixed(1)} seconds.`
    );
  }

  function resetPairComposition() {
    preview.stop('');
    setA(3);
    setB(2);
    setMode('balancing');
    setSoundSetting(null);
    setPreviewVolume(30);
    preview.setStatus('Pair Composition node reset.');
  }

  const view = generated.error ? (
    <Alert color="red" title="No composition">
      {generated.error}
    </Alert>
  ) : (
    generated.result && (
      <>
        <DurationStrip
          label="Combined durations"
          durations={generated.result.durations}
          cyclic={false}
          showSum
          blockTitle={(_, duration) => `Duration ${duration}`}
          playhead={{ sourceId: instanceId, unitSeconds: pulseSeconds(settings.transport) }}
        />
        <div className={classes.candidateList}>
          <Text fw={600} mb={4}>
            Segments
          </Text>
          <Stack gap={6}>
            {generated.result.segments.map((segment, index) => (
              <div key={index}>
                <Text fw={600}>{segment.label}</Text>
                <Text ff="monospace" c="dimmed" className={classes.durationText}>
                  {segment.durations.join(' + ')}
                </Text>
              </div>
            ))}
          </Stack>
        </div>
      </>
    )
  );

  return (
    <NodeDevice
      name={instanceLabel}
      status={`${modeOptions.find((option) => option.value === mode)?.label}, a÷b = ${a}÷${b}`}
      badges={
        generated.result && (
          <>
            <Badge variant="outline">Period {generated.result.period}</Badge>
            <Badge variant="outline">{generated.result.durations.length} attacks</Badge>
          </>
        )
      }
      actions={
        <>
          <Button onClick={playPreview}>▶ Preview</Button>
          <Button variant="default" onClick={() => preview.stop()}>
            ■ Stop
          </Button>
        </>
      }
      onReset={resetPairComposition}
      footer={
        <Text c="dimmed" truncate aria-live="polite">
          {preview.status ||
            (generated.result
              ? 'Plays at the transport tempo; volume stays live.'
              : 'Needs a > b > 0')}
        </Text>
      }
      controls={
        <>
          <InspectorSection label="Generators">
            <GeneratorPairControls a={a} b={b} onAChange={setA} onBChange={setB} />
            <Select
              label="Mode"
              aria-label="Composition mode"
              value={mode}
              data={modeOptions}
              allowDeselect={false}
              onChange={(value) => value && isPairCompositionMode(value) && setMode(value)}
            />
          </InspectorSection>

          <NodeInspectorContent>
            <InspectorSection label="Preview">
              <div className={classes.nodeParameterRow}>
                <Text>Sound</Text>
                <SoundOverrideControl
                  label="Preview"
                  set={settings.sounds.rhythm}
                  voiceIndex={0}
                  value={soundOverride}
                  onChange={(sound) => {
                    setSoundSetting(sound);
                  }}
                />
              </div>
              <VolumeControl
                accessibleLabel="Pair composition preview volume"
                label="Volume"
                value={previewVolume}
                onChange={setPreviewVolume}
              />
            </InspectorSection>
            <NodeOutputsSection instanceLabel={instanceLabel} outputs={publishedOutputs} />
          </NodeInspectorContent>
        </>
      }
    >
      {view}
    </NodeDevice>
  );
}
