import { useEffect, useMemo } from 'react';
import { Alert, Badge, Button, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { createDurationSequencePreviewPlan } from '../audio/performancePlans';
import type { CompositionModuleRoutingProps, PublishedCompositionOutput } from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import { pulseSeconds } from '../transport';
import {
  generatePairComposition,
  pairCompositionDurationPacket,
  pairCompositionSegmentPackets,
  type PairCompositionMode,
} from '../pairComposition';
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

const modeOptions: { value: PairCompositionMode; label: string }[] = [
  { value: 'balancing', label: 'Balancing' },
  { value: 'expanding', label: 'Expansion' },
  { value: 'contracting', label: 'Contraction' },
];

function isMode(value: string): value is PairCompositionMode {
  return value === 'balancing' || value === 'expanding' || value === 'contracting';
}

interface PairCompositionModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
}

export function PairCompositionModule({
  instanceId,
  instanceLabel,
  onOutputsChange,
}: PairCompositionModuleProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'pair-composition');
  const [a, setA] = usePersistentState<number | string>(stateKey(compositionStateKeys.pairCompositionA), 3, acceptsNumberOrString);
  const [b, setB] = usePersistentState<number | string>(stateKey(compositionStateKeys.pairCompositionB), 2, acceptsNumberOrString);
  const [mode, setMode] = usePersistentState<PairCompositionMode>(
    stateKey(compositionStateKeys.pairCompositionMode),
    'balancing',
    (value): value is PairCompositionMode => typeof value === 'string' && isMode(value),
  );
  const [midiNote, setMidiNote] = usePersistentState(stateKey(compositionStateKeys.pairCompositionMidiNote), 48, acceptsFiniteNumber);
  // The preview's sound: the primary rhythm voice unless overridden here. A pitch saved before
  // voices existed (anything but the old default C3) still counts as a Tone override.
  const [soundSetting, setSoundSetting] = usePersistentState<SoundOverride | null>(
    stateKey(compositionStateKeys.pairCompositionSound),
    null,
    (value): value is SoundOverride | null => value === null || isSoundOverride(value)
  );
  const soundOverride: SoundOverride | null =
    soundSetting ?? (midiNote !== 48 ? { type: 'tone', midicents: midiNote * 100 } : null);
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.pairCompositionVolume),
    30,
    acceptsFiniteNumber,
  );
  const { settings } = useCompositionSettings();

  const generated = useMemo(() => {
    try {
      return { result: generatePairComposition(Number(a), Number(b), mode) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not compose this pair.' };
    }
  }, [a, b, mode]);

  const outputPacket = useMemo(
    () => (generated.result ? pairCompositionDurationPacket(generated.result, instanceId) : undefined),
    [generated.result, instanceId],
  );
  const segmentPackets = useMemo(
    () => (generated.result ? pairCompositionSegmentPackets(generated.result, instanceId) : []),
    [generated.result, instanceId],
  );
  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(
    () => [
      ...(outputPacket
        ? [{ ref: { instanceId, port: 'combined' }, label: `${instanceLabel} · Combined`, packet: outputPacket }]
        : []),
      ...segmentPackets.map(({ port, label, packet }) => ({
        ref: { instanceId, port },
        label: `${instanceLabel} · ${label}`,
        packet,
      })),
    ],
    [instanceId, instanceLabel, outputPacket, segmentPackets],
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
    const plan = createDurationSequencePreviewPlan({
      sourceId: instanceId,
      durations: generated.result.durations,
      sound: layerSound(settings.sounds.rhythm, 0, soundOverride),
      unitSeconds: pulseSeconds(settings.transport),
    });
    void preview.play(plan, `Playing ${mode} ${a}÷${b} for ${plan.durationSeconds.toFixed(1)} seconds.`);
  }

  function resetPairComposition() {
    preview.stop('');
    setA(3);
    setB(2);
    setMode('balancing');
    setMidiNote(48);
    setSoundSetting(null);
    setPreviewVolume(30);
    preview.setStatus('Pair Composition module reset.');
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
                {modeOptions.find((option) => option.value === mode)?.label}, a÷b = {a}÷{b}
              </Text>
            </div>
            {generated.result && (
              <Group gap="xs">
                <Badge variant="outline">Period {generated.result.period}</Badge>
                <Badge variant="outline">{generated.result.durations.length} attacks</Badge>
              </Group>
            )}
          </Group>
          {generated.error ? (
            <Alert color="red" title="No composition">
              {generated.error}
            </Alert>
          ) : (
            generated.result && (
              <Stack gap="lg">
                <DurationStrip
                  label="Combined durations"
                  durations={generated.result.durations}
                  cyclic={false}
                  showSum
                  blockTitle={(_, duration) => `Duration ${duration}`}
                  playhead={{ sourceId: instanceId, unitSeconds: pulseSeconds(settings.transport) }}
                />
                <div>
                  <Text fw={600} size="sm" mb={4}>
                    Segments
                  </Text>
                  <Stack gap={6}>
                    {generated.result.segments.map((segment, index) => (
                      <div key={index}>
                        <Text size="xs" fw={600}>
                          {segment.label}
                        </Text>
                        <Text ff="monospace" size="xs" c="dimmed" className={classes.durationText}>
                          {segment.durations.join(' + ')}
                        </Text>
                      </div>
                    ))}
                  </Stack>
                </div>
              </Stack>
            )
          )}
        </div>

        <Module
          name={instanceLabel}
          status={generated.result ? `Period ${generated.result.period}` : 'Needs a > b > 0'}
          onReset={resetPairComposition}
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
                <Text size="xs">Mode</Text>
                <Select
                  size="xs"
                  aria-label="Composition mode"
                  value={mode}
                  data={modeOptions}
                  allowDeselect={false}
                  onChange={(value) => value && isMode(value) && setMode(value)}
                />
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
                accessibleLabel="Pair composition preview volume"
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
