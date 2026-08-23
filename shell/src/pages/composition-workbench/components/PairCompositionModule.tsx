import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { volumePercentToGain } from '../audio';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { createDurationSequencePreviewPlan } from '../audio/performancePlans';
import type { PlaybackSession } from '../audio/types';
import type { CompositionModuleRoutingProps, PublishedCompositionOutput } from '../compositionRouting';
import { midiNoteName } from '../interference';
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
import { Module, ModuleOutput, ModuleSection } from './Module';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

const pitchOptions = Array.from({ length: 88 }, (_, index) => {
  const note = index + 21;
  return { value: String(note), label: `${midiNoteName(note)} | ${note}` };
});

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
  const [unitMilliseconds, setUnitMilliseconds] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.pairCompositionUnit),
    160,
    acceptsNumberOrString,
  );
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.pairCompositionVolume),
    30,
    acceptsFiniteNumber,
  );
  const [audioStatus, setAudioStatus] = useState('');
  const audioEngine = useAudioEngine();
  const playbackSession = useRef<PlaybackSession | null>(null);
  const playRequestVersion = useRef(0);

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

  useEffect(
    () => () => {
      playRequestVersion.current += 1;
      playbackSession.current?.stop();
      playbackSession.current = null;
    },
    [],
  );

  useEffect(() => {
    playbackSession.current?.setBusGain('preview', volumePercentToGain(previewVolume));
  }, [previewVolume]);

  function stopPreview(message = 'Preview stopped.') {
    playRequestVersion.current += 1;
    playbackSession.current?.stop();
    playbackSession.current = null;
    setAudioStatus(message);
  }

  async function playPreview() {
    if (!generated.result) {
      return;
    }
    const unitSeconds = Number(unitMilliseconds) / 1000;
    if (!Number.isFinite(unitSeconds) || unitSeconds <= 0) {
      setAudioStatus('Unit duration must be a positive number.');
      return;
    }
    stopPreview('');
    const requestVersion = playRequestVersion.current;
    const plan = createDurationSequencePreviewPlan({
      sourceId: instanceId,
      durations: generated.result.durations,
      midiNote,
      unitSeconds,
    });
    setAudioStatus(`Playing ${mode} ${a}÷${b} for ${plan.durationSeconds.toFixed(1)} seconds.`);
    try {
      const session = await audioEngine.play({
        plan,
        busGains: { preview: volumePercentToGain(previewVolume) },
        onComplete: () => {
          playbackSession.current = null;
          setAudioStatus('Preview complete.');
        },
      });
      if (requestVersion !== playRequestVersion.current) {
        session.stop();
        return;
      }
      playbackSession.current = session;
    } catch (error) {
      setAudioStatus(error instanceof Error ? error.message : 'Audio preview could not start.');
    }
  }

  function resetPairComposition() {
    stopPreview('');
    setA(3);
    setB(2);
    setMode('balancing');
    setMidiNote(48);
    setUnitMilliseconds(160);
    setPreviewVolume(30);
    setAudioStatus('Pair Composition module reset.');
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
                <div>
                  <Text fw={600} size="sm" mb={4}>
                    Combined durations
                  </Text>
                  <div
                    className={classes.durationTimeline}
                    aria-label={`Combined durations ${generated.result.durations.join(' ')}`}
                  >
                    {generated.result.durations.map((duration, index) => (
                      <span
                        className={classes.durationBlock}
                        key={index}
                        style={{ flexGrow: duration }}
                        title={`Duration ${duration}`}
                      >
                        {duration}
                      </span>
                    ))}
                  </div>
                  <Text ff="monospace" size="sm" mt={4} className={classes.durationText}>
                    {generated.result.durations.join(' + ')}
                  </Text>
                </div>
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
              {audioStatus || 'Preview volume and unit controls remain live.'}
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
                <Text size="xs">Pitch</Text>
                <Select
                  searchable
                  size="xs"
                  aria-label="Preview pitch"
                  value={String(midiNote)}
                  data={pitchOptions}
                  onChange={(value) => value && setMidiNote(Number(value))}
                />
              </div>
            </Stack>
          </ModuleSection>

          <ModuleSection label="Preview">
            <Stack gap="xs">
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Unit</Text>
                <NumberInput
                  size="xs"
                  aria-label="Preview unit"
                  suffix=" ms"
                  min={20}
                  max={2000}
                  value={unitMilliseconds}
                  onChange={setUnitMilliseconds}
                />
              </div>
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
                <Button size="compact-sm" variant="default" onClick={() => stopPreview()}>
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
