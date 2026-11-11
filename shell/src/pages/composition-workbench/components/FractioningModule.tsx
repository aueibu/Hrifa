import { useEffect, useMemo } from 'react';
import { Alert, Badge, Button, Text } from '@mantine/core';
import type {
  CompositionModuleRoutingProps,
  PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import { fractioningDurationPacket, generateFractioning } from '../fractioning';
import {
  createRhythmPreviewPlan,
  musicalPlanSeconds,
  transportRhythmContext,
} from '../rhythmRealization';
import { isSoundOverride, layerSound, type SoundOverride } from '../sounds';
import { pulseSeconds } from '../transport';
import { useModulePreview } from '../useModulePreview';
import {
  acceptsFiniteNumber,
  acceptsNumberOrString,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { DurationStrip } from './DurationStrip';
import { GeneratorPairControls } from './GeneratorPairControls';
import { ModuleDevice } from './ModuleDevice';
import { InspectorSection, ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import { SoundOverrideControl } from './SoundControls';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

interface FractioningModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
}

export function FractioningModule({
  instanceId,
  instanceLabel,
  onOutputsChange,
}: FractioningModuleProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'fractioning');
  const [a, setA] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.fractioningA),
    3,
    acceptsNumberOrString
  );
  const [b, setB] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.fractioningB),
    2,
    acceptsNumberOrString
  );
  const [midiNote, setMidiNote] = usePersistentState(
    stateKey(compositionStateKeys.fractioningMidiNote),
    48,
    acceptsFiniteNumber
  );
  // The preview's sound: the primary rhythm voice unless overridden here. A pitch saved before
  // voices existed (anything but the old default C3) still counts as a Tone override.
  const [soundSetting, setSoundSetting] = usePersistentState<SoundOverride | null>(
    stateKey(compositionStateKeys.fractioningSound),
    null,
    (value): value is SoundOverride | null => value === null || isSoundOverride(value)
  );
  const soundOverride: SoundOverride | null =
    soundSetting ?? (midiNote !== 48 ? { type: 'tone', midicents: midiNote * 100 } : null);
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.fractioningVolume),
    30,
    acceptsFiniteNumber
  );
  const { settings } = useCompositionSettings();

  const generated = useMemo(() => {
    try {
      return { result: generateFractioning(Number(a), Number(b)) };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Could not generate a fractioning resultant.',
      };
    }
  }, [a, b]);

  const outputPacket = useMemo(
    () =>
      generated.result
        ? fractioningDurationPacket(generated.result, Number(a), Number(b), instanceId)
        : undefined,
    [a, b, generated.result, instanceId]
  );
  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(
    () =>
      outputPacket
        ? [
            {
              ref: { instanceId, port: 'resultant' },
              label: `${instanceLabel} · Resultant`,
              packet: outputPacket,
            },
          ]
        : [],
    [instanceId, instanceLabel, outputPacket]
  );

  useEffect(() => {
    onOutputsChange?.(instanceId, publishedOutputs);
  }, [instanceId, onOutputsChange, publishedOutputs]);

  const preview = useModulePreview({
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
    setMidiNote(48);
    setSoundSetting(null);
    setPreviewVolume(30);
    preview.setStatus('Fractioning module reset.');
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
    <ModuleDevice
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
        <Text size="xs" c="dimmed" truncate aria-live="polite">
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

          <ModuleInspectorContent>
            <InspectorSection label="Preview">
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Sound</Text>
                <SoundOverrideControl
                  label="Preview"
                  set={settings.sounds.rhythm}
                  voiceIndex={0}
                  value={soundOverride}
                  onChange={(sound) => {
                    setSoundSetting(sound);
                    setMidiNote(48);
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
            <ModuleOutputsSection instanceLabel={instanceLabel} outputs={publishedOutputs} />
          </ModuleInspectorContent>
        </>
      }
    >
      {view}
    </ModuleDevice>
  );
}
