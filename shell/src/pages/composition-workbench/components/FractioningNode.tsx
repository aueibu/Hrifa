import { Alert, Badge, Text } from '@mantine/core';
import { Button } from '../../../ui';
import { useCompositionSettings } from '../compositionSettings';
import {
  createRhythmPreviewPlan,
  musicalPlanSeconds,
  transportRhythmContext,
} from '../rhythmRealization';
import { useNodeEvaluationResult } from '../runtime/evaluationStore';
import { useNodeState } from '../runtime/nodeState';
import { fractioningState } from '../runtime/nodeState/fractioning';
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

interface FractioningNodeProps {
  instanceId: string;
  instanceLabel: string;
}

export function FractioningNode({ instanceId, instanceLabel }: FractioningNodeProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId);
  const [{ a, b }, { a: setA, b: setB }] = useNodeState(fractioningState, instanceId);
  // The preview's sound: the primary rhythm voice unless overridden here.
  const [soundSetting, setSoundSetting] = usePersistentState<SoundOverride | null>(
    stateKey(compositionStateKeys.fractioningSound),
    null,
    (value): value is SoundOverride | null => value === null || isSoundOverride(value)
  );
  const soundOverride: SoundOverride | null = soundSetting;
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.fractioningVolume),
    30,
    acceptsFiniteNumber
  );
  const { settings } = useCompositionSettings();

  const { generated, outputs: publishedOutputs } = useNodeEvaluationResult(
    'fractioning',
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
      `Playing fractioning ${a}÷${b} for ${musicalPlanSeconds(plan).toFixed(1)} seconds.`
    );
  }

  function resetFractioning() {
    preview.stop('');
    setA(3);
    setB(2);
    setSoundSetting(null);
    setPreviewVolume(30);
    preview.setStatus('Fractioning node reset.');
  }

  const view = generated.error ? (
    <Alert color="red" title="No resultant">
      {generated.error}
    </Alert>
  ) : (
    generated.result && (
      <DurationStrip
        label="Fractioning resultant durations"
        durations={generated.result.durations}
        cyclic={false}
        showSum
        blockTitle={(index, duration) =>
          `Attack ${generated.result.attacks[index]}; duration ${duration}`
        }
        playhead={{ sourceId: instanceId, unitSeconds: pulseSeconds(settings.transport) }}
      />
    )
  );

  return (
    <NodeDevice
      name={instanceLabel}
      status={generated.result ? `a÷b = ${a}÷${b}` : 'Needs a > b > 0'}
      badges={
        generated.result && (
          <>
            <Badge variant="outline">a² {generated.result.period}</Badge>
            <Badge variant="outline">{generated.result.attacks.length} attacks</Badge>
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
      onReset={resetFractioning}
      footer={
        <Text c="dimmed" truncate aria-live="polite">
          {preview.status ||
            (generated.result
              ? `N_b = a − b + 1 = ${Number(a) - Number(b) + 1} staggered minor-generator clocks, each restarting phase at a multiple of a, unioned with the major-generator clock over one period a².`
              : 'Plays at the transport tempo; volume stays live.')}
        </Text>
      }
      controls={
        <>
          <InspectorSection label="Generators">
            <GeneratorPairControls a={a} b={b} onAChange={setA} onBChange={setB} />
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
                accessibleLabel="Fractioning preview volume"
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
