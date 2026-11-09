import { useEffect, useMemo } from 'react';
import { Alert, Badge, Button, Group, NumberInput, Stack, Text, Title } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import type { CompositionModuleRoutingProps, PublishedCompositionOutput } from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import { createRhythmPreviewPlan, musicalPlanSeconds, transportRhythmContext } from '../rhythmRealization';
import { pulseSeconds } from '../transport';
import { fractioningDurationPacket, generateFractioning } from '../fractioning';
import {
  acceptsFiniteNumber,
  acceptsNumberOrString,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { isSoundOverride, layerSound, type SoundOverride } from '../sounds';
import { useModulePreview } from '../useModulePreview';
import { DurationStrip } from './DurationStrip';
import { Module, ModuleOutput, ModuleSection } from './Module';
import { SoundOverrideControl } from './SoundControls';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

interface FractioningModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
}

export function FractioningModule({ instanceId, instanceLabel, onOutputsChange }: FractioningModuleProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'fractioning');
  const [a, setA] = usePersistentState<number | string>(stateKey(compositionStateKeys.fractioningA), 3, acceptsNumberOrString);
  const [b, setB] = usePersistentState<number | string>(stateKey(compositionStateKeys.fractioningB), 2, acceptsNumberOrString);
  const [midiNote, setMidiNote] = usePersistentState(stateKey(compositionStateKeys.fractioningMidiNote), 48, acceptsFiniteNumber);
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
    acceptsFiniteNumber,
  );
  const { settings } = useCompositionSettings();

  const generated = useMemo(() => {
    try {
      return { result: generateFractioning(Number(a), Number(b)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not generate a fractioning resultant.' };
    }
  }, [a, b]);

  const outputPacket = useMemo(
    () => (generated.result ? fractioningDurationPacket(generated.result, Number(a), Number(b), instanceId) : undefined),
    [a, b, generated.result, instanceId],
  );
  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(
    () =>
      outputPacket
        ? [{ ref: { instanceId, port: 'resultant' }, label: `${instanceLabel} · Resultant`, packet: outputPacket }]
        : [],
    [instanceId, instanceLabel, outputPacket],
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
    void preview.play(plan, `Playing fractioning ${a}÷${b} for ${musicalPlanSeconds(plan).toFixed(1)} seconds.`);
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
                Fractioning around the axis of symmetry, a÷b = {a}÷{b}
              </Text>
            </div>
            {generated.result && (
              <Group gap="xs">
                <Badge variant="outline">a² {generated.result.period}</Badge>
                <Badge variant="outline">{generated.result.attacks.length} attacks</Badge>
              </Group>
            )}
          </Group>
          {generated.error ? (
            <Alert color="red" title="No resultant">
              {generated.error}
            </Alert>
          ) : (
            generated.result && (
              <Stack gap="lg">
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
                <Text size="xs" c="dimmed">
                  N_b = a − b + 1 = {Number(a) - Number(b) + 1} staggered minor-generator clocks,
                  each restarting phase at a multiple of a, unioned with the unbroken major-generator
                  clock over one period a².
                </Text>
              </Stack>
            )
          )}
        </div>

        <Module
          name={instanceLabel}
          status={generated.result ? `a² ${generated.result.period}` : 'Needs a > b > 0'}
          onReset={resetFractioning}
          output={
            outputPacket ? (
              <ModuleOutput name="Resultant" packet={outputPacket} />
            ) : undefined
          }
          footer={
            <Text size="xs" c="dimmed" truncate aria-live="polite">
              {preview.status || 'Plays at the transport tempo; volume stays live.'}
            </Text>
          }
        >
          <ModuleSection label="Generators">
            <Stack gap="xs">
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Major a</Text>
                <NumberInput size="xs" aria-label="Major generator a" min={2} value={a} onChange={setA} />
              </div>
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Minor b</Text>
                <NumberInput size="xs" aria-label="Minor generator b" min={1} value={b} onChange={setB} />
              </div>
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
            </Stack>
          </ModuleSection>

          <ModuleSection label="Preview">
            <Stack gap="xs">
              <VolumeControl
                accessibleLabel="Fractioning preview volume"
                label="Volume"
                value={previewVolume}
                onChange={setPreviewVolume}
              />
              <Group gap="xs" wrap="nowrap">
                <Button size="compact-sm" onClick={playPreview}>
                  ▶ Preview
                </Button>
                <Button size="compact-sm" variant="default" onClick={() => preview.stop()}>
                  ■ Stop
                </Button>
              </Group>
            </Stack>
          </ModuleSection>
        </Module>
      </div>
    </Surface>
  );
}
