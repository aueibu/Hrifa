import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { volumePercentToGain } from '../audio';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { createDurationSequencePreviewPlan } from '../audio/performancePlans';
import type { PlaybackSession } from '../audio/types';
import type { CompositionModuleRoutingProps, PublishedCompositionOutput } from '../compositionRouting';
import { fractioningDurationPacket, generateFractioning } from '../fractioning';
import { midiNoteName } from '../interference';
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

interface FractioningModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
}

export function FractioningModule({ instanceId, instanceLabel, onOutputsChange }: FractioningModuleProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'fractioning');
  const [a, setA] = usePersistentState<number | string>(stateKey(compositionStateKeys.fractioningA), 3, acceptsNumberOrString);
  const [b, setB] = usePersistentState<number | string>(stateKey(compositionStateKeys.fractioningB), 2, acceptsNumberOrString);
  const [midiNote, setMidiNote] = usePersistentState(stateKey(compositionStateKeys.fractioningMidiNote), 48, acceptsFiniteNumber);
  const [unitMilliseconds, setUnitMilliseconds] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.fractioningUnit),
    160,
    acceptsNumberOrString,
  );
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.fractioningVolume),
    30,
    acceptsFiniteNumber,
  );
  const [audioStatus, setAudioStatus] = useState('');
  const audioEngine = useAudioEngine();
  const playbackSession = useRef<PlaybackSession | null>(null);
  const playRequestVersion = useRef(0);

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
    setAudioStatus(`Playing fractioning ${a}÷${b} for ${plan.durationSeconds.toFixed(1)} seconds.`);
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

  function resetFractioning() {
    stopPreview('');
    setA(3);
    setB(2);
    setMidiNote(48);
    setUnitMilliseconds(160);
    setPreviewVolume(30);
    setAudioStatus('Fractioning module reset.');
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
                <div>
                  <Text fw={600} size="sm" mb={4}>
                    Fractioning resultant durations
                  </Text>
                  <div
                    className={classes.durationTimeline}
                    aria-label={`Fractioning durations ${generated.result.durations.join(' ')}`}
                  >
                    {generated.result.durations.map((duration, index) => (
                      <span
                        className={classes.durationBlock}
                        key={`${generated.result.attacks[index]}:${duration}`}
                        style={{ flexGrow: duration }}
                        title={`Attack ${generated.result.attacks[index]}; duration ${duration}`}
                      >
                        {duration}
                      </span>
                    ))}
                  </div>
                  <Text ff="monospace" size="sm" mt={4} className={classes.durationText}>
                    {generated.result.durations.join(' + ')}
                  </Text>
                </div>
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
                accessibleLabel="Fractioning preview volume"
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
