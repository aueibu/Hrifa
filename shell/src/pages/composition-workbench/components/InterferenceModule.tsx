import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { volumePercentToGain } from '../audio';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { createInterferencePreviewPlan } from '../audio/performancePlans';
import type { PlaybackSession } from '../audio/types';
import type {
  CompositionModuleRoutingProps,
  PublishedCompositionOutput,
} from '../compositionRouting';
import {
  generateInterference,
  generatorAttackCount,
  generatorAttackTimes,
  generatorPeriod,
  groupingOptions,
  interferenceDurationPacket,
  interferenceGeneratorDurationPacket,
  MAX_PREVIEW_EVENTS,
  midiNoteName,
  parseGeneratorValues,
} from '../interference';
import {
  acceptsBoolean,
  acceptsFiniteNumber,
  acceptsNumberOrString,
  acceptsString,
  compositionStateKeys,
  compositionInstanceStateKey,
  usePersistentState,
} from '../usePersistentState';
import { Module, ModuleOutput, ModuleSection } from './Module';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

interface GeneratorDraft {
  id: string;
  label: string;
  valueText: string;
  midiNote: number;
}

const pitchOptions = Array.from({ length: 88 }, (_, index) => {
  const note = index + 21;
  return { value: String(note), label: `${midiNoteName(note)} | ${note}` };
});

const initialGenerators: GeneratorDraft[] = [
  { id: 'generator-a', label: 'Generator 1', valueText: '2', midiNote: 48 },
  { id: 'generator-b', label: 'Generator 2', valueText: '3', midiNote: 55 },
  { id: 'generator-c', label: 'Generator 3', valueText: '5', midiNote: 60 },
];

function nextGeneratorId() {
  return `interference-generator-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

function formatGeneratorPattern(pattern: number[]) {
  return `⟨${pattern.join(' + ')}⟩`;
}

interface InterferenceModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
}

export function InterferenceModule({
  instanceId,
  instanceLabel,
  onOutputsChange,
}: InterferenceModuleProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'interference');
  const [drafts, setDrafts] = usePersistentState(
    stateKey(compositionStateKeys.interferenceDrafts),
    initialGenerators,
    (value): value is GeneratorDraft[] =>
      Array.isArray(value) &&
      value.every(
        (draft) =>
          draft &&
          typeof draft.id === 'string' &&
          typeof draft.label === 'string' &&
          typeof draft.valueText === 'string' &&
          typeof draft.midiNote === 'number'
      )
  );
  const [groupingId, setGroupingId] = usePersistentState(
    stateKey(compositionStateKeys.interferenceGrouping),
    'recurrence',
    acceptsString
  );
  const [unitMilliseconds, setUnitMilliseconds] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.interferenceUnit),
    160,
    acceptsNumberOrString
  );
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.interferenceVolume),
    30,
    acceptsFiniteNumber
  );
  const [metronomeEnabled, setMetronomeEnabled] = usePersistentState(
    stateKey(compositionStateKeys.interferenceMetronome),
    false,
    acceptsBoolean
  );
  const [metronomeVolume, setMetronomeVolume] = usePersistentState(
    stateKey(compositionStateKeys.interferenceMetronomeVolume),
    30,
    acceptsFiniteNumber
  );
  const [audioStatus, setAudioStatus] = useState('');
  const audioEngine = useAudioEngine();
  const playbackSession = useRef<PlaybackSession | null>(null);
  const playRequestVersion = useRef(0);

  const authored = useMemo(
    () =>
      drafts.map((draft) => ({
        draft,
        parsed: parseGeneratorValues(draft.valueText),
      })),
    [drafts]
  );
  const patterns = useMemo(() => authored.map(({ parsed }) => parsed.values), [authored]);
  const periods = useMemo(() => patterns.map(generatorPeriod), [patterns]);
  const generated = useMemo(() => {
    try {
      const authoredPatterns = drafts.map((draft) => parseGeneratorValues(draft.valueText).values);
      return { result: generateInterference(authoredPatterns) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not generate interference.' };
    }
  }, [drafts]);
  const groupings = useMemo(
    () => (generated.result ? groupingOptions(periods, generated.result.recurrence) : []),
    [generated.result, periods]
  );
  const grouping = groupings.find((option) => option.id === groupingId) ?? groupings[0];
  const outputPacket = useMemo(
    () =>
      generated.result ? interferenceDurationPacket(generated.result, drafts, grouping) : undefined,
    [drafts, generated.result, grouping]
  );
  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(
    () => [
      ...(outputPacket
        ? [
            {
              ref: { instanceId, port: 'resultant' },
              label: `${instanceLabel} · Resultant`,
              packet: outputPacket,
            },
          ]
        : []),
      ...authored.flatMap(({ draft, parsed }, generatorIndex) =>
        parsed.values.length
          ? [
              {
                ref: { instanceId, port: `generator:${draft.id}` },
                label: `${instanceLabel} · ${draft.label}`,
                packet: interferenceGeneratorDurationPacket(parsed.values, draft, generatorIndex),
              },
            ]
          : []
      ),
    ],
    [authored, instanceId, instanceLabel, outputPacket]
  );

  useEffect(() => {
    onOutputsChange?.(instanceId, publishedOutputs);
  }, [instanceId, onOutputsChange, publishedOutputs]);

  useEffect(() => {
    if (groupings.length && !groupings.some((option) => option.id === groupingId)) {
      setGroupingId('recurrence');
    }
  }, [groupingId, groupings]);

  useEffect(
    () => () => {
      playRequestVersion.current += 1;
      playbackSession.current?.stop();
      playbackSession.current = null;
    },
    []
  );

  useEffect(() => {
    playbackSession.current?.setBusGain('preview', volumePercentToGain(previewVolume));
  }, [previewVolume]);

  useEffect(() => {
    const targetGain = metronomeEnabled ? volumePercentToGain(metronomeVolume) : 0;
    playbackSession.current?.setBusGain('metronome', targetGain);
  }, [metronomeEnabled, metronomeVolume]);

  function updateDraft(id: string, change: Partial<GeneratorDraft>) {
    setDrafts((current) =>
      current.map((generator) => (generator.id === id ? { ...generator, ...change } : generator))
    );
  }

  function addGenerator() {
    setDrafts((current) => [
      ...current,
      {
        id: nextGeneratorId(),
        label: `Generator ${current.length + 1}`,
        valueText: String(current.length + 3),
        midiNote: Math.min(84, 48 + current.length * 5),
      },
    ]);
  }

  function removeGenerator(id: string) {
    setDrafts((current) =>
      current
        .filter((generator) => generator.id !== id)
        .map((generator, index) => ({ ...generator, label: `Generator ${index + 1}` }))
    );
  }

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
    const previewEvents = generatorAttackCount(patterns, generated.result.recurrence);
    if (previewEvents > MAX_PREVIEW_EVENTS) {
      setAudioStatus(
        `This preview would schedule ${previewEvents} generator attacks; the safety limit is ${MAX_PREVIEW_EVENTS}.`
      );
      return;
    }
    const totalSeconds = generated.result.recurrence * unitSeconds;
    stopPreview('');
    const requestVersion = playRequestVersion.current;
    const plan = createInterferencePreviewPlan({
      sourceId: instanceId,
      patterns,
      midiNotes: drafts.map((draft) => draft.midiNote),
      result: generated.result,
      unitSeconds,
      grouping,
    });
    setAudioStatus(
      `Playing ${patterns.map(formatGeneratorPattern).join(' + ')} for ${totalSeconds.toFixed(1)} seconds. Metronome controls are live.`
    );
    try {
      const session = await audioEngine.play({
        plan,
        busGains: {
          preview: volumePercentToGain(previewVolume),
          metronome: metronomeEnabled ? volumePercentToGain(metronomeVolume) : 0,
        },
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

  function resetInterference() {
    stopPreview('');
    setDrafts(initialGenerators);
    setGroupingId('recurrence');
    setUnitMilliseconds(160);
    setPreviewVolume(30);
    setMetronomeEnabled(false);
    setMetronomeVolume(30);
    setAudioStatus('Interference module reset.');
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
                Resultant {patterns.map(formatGeneratorPattern).join(' + ')}
              </Text>
            </div>
            {generated.result && (
              <Group gap="xs">
                <Badge variant="outline">LCM {generated.result.recurrence}</Badge>
                <Badge variant="outline">{generated.result.attacks.length} attacks</Badge>
              </Group>
            )}
          </Group>
          {generated.error ? (
            <Alert color="red" title="No resultant">
              {generated.error}
            </Alert>
          ) : (
            generated.result &&
            patterns.length > 1 && (
              <Stack gap="lg">
                <div>
                  <Text fw={600} size="sm">
                    Grouping
                  </Text>
                  <Text size="sm">{grouping?.label}</Text>
                  <Text size="xs" c="dimmed">
                    {grouping?.description}
                  </Text>
                </div>

                <div>
                  <Text fw={600} size="sm" mb={4}>
                    Resultant durations
                  </Text>
                  <div
                    className={classes.durationTimeline}
                    aria-label={`Resultant durations ${generated.result.durations.join(' ')}`}
                  >
                    {generated.result.durations.map((duration, index) => (
                      <span
                        className={classes.durationBlock}
                        key={`${generated.result.attacks[index].time}:${duration}`}
                        style={{ flexGrow: duration }}
                        title={`Attack ${generated.result.attacks[index].time}; duration ${duration}`}
                      >
                        {duration}
                      </span>
                    ))}
                    {grouping &&
                      Array.from(
                        { length: Math.floor((generated.result.recurrence - 1) / grouping.units) },
                        (_, index) => (
                          <span
                            className={classes.measureBoundary}
                            key={index}
                            style={{
                              left: `${((index + 1) * grouping.units * 100) / generated.result.recurrence}%`,
                            }}
                          />
                        )
                      )}
                  </div>
                  <Text ff="monospace" size="sm" mt={4} className={classes.durationText}>
                    {generated.result.durations.join(' + ')}
                  </Text>
                </div>

                <div>
                  <Text fw={600} size="sm" mb={4}>
                    Generator attacks
                  </Text>
                  {generated.result.recurrence <= 128 ? (
                    <Stack gap={3}>
                      {patterns.map((pattern, generatorIndex) => {
                        const attackTimes = new Set(
                          generatorAttackTimes(pattern, generated.result.recurrence)
                        );
                        return (
                          <div className={classes.attackLane} key={drafts[generatorIndex].id}>
                            <Text ff="monospace" size="xs">
                              G{generatorIndex + 1}
                            </Text>
                            <div
                              className={classes.attackCells}
                              aria-label={`Generator ${generatorIndex + 1} pattern ${pattern.join(' + ')}; period ${generatorPeriod(pattern)}`}
                            >
                              {Array.from({ length: generated.result.recurrence }, (_, time) => (
                                <span key={time} data-active={attackTimes.has(time)} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </Stack>
                  ) : (
                    <Text size="xs" c="dimmed">
                      The {generated.result.recurrence}-unit attack grid is hidden above 128 units;
                      the exact durations remain available above.
                    </Text>
                  )}
                </div>
              </Stack>
            )
          )}
        </div>

        <Module
          name={instanceLabel}
          status={
            generated.result ? `LCM ${generated.result.recurrence}` : 'Needs valid generators'
          }
          onReset={resetInterference}
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
              {audioStatus ||
                'Generator pitches sound independently; volume and metronome controls remain live.'}
            </Text>
          }
        >
          <ModuleSection label="Generators" grow>
            <div className={classes.generatorTable}>
              <div className={classes.generatorTableHeader} aria-hidden="true">
                <span>#</span>
                <span>Pattern</span>
                <span>Period</span>
                <span>Pitch</span>
                <span />
              </div>
              <div className={classes.generatorRows}>
                {authored.map(({ draft, parsed }, index) => (
                  <div className={classes.generatorRow} key={draft.id}>
                    <Text ff="monospace" size="xs" c="dimmed">
                      {index + 1}
                    </Text>
                    <TextInput
                      size="xs"
                      aria-label={`${draft.label} pattern`}
                      title={parsed.error ?? 'Repeating impulse durations'}
                      value={draft.valueText}
                      error={parsed.error ? true : undefined}
                      onChange={(event) =>
                        updateDraft(draft.id, { valueText: event.currentTarget.value })
                      }
                    />
                    <Text ff="monospace" size="xs" ta="center">
                      {parsed.values.length ? generatorPeriod(parsed.values) : '—'}
                    </Text>
                    <Select
                      searchable
                      size="xs"
                      aria-label={`${draft.label} pitch`}
                      value={String(draft.midiNote)}
                      data={pitchOptions}
                      onChange={(value) =>
                        value && updateDraft(draft.id, { midiNote: Number(value) })
                      }
                    />
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={`Remove ${draft.label}`}
                      disabled={drafts.length <= 2}
                      onClick={() => removeGenerator(draft.id)}
                    >
                      ×
                    </ActionIcon>
                  </div>
                ))}
              </div>
              <Button variant="subtle" size="compact-xs" onClick={addGenerator}>
                + Generator
              </Button>
            </div>
          </ModuleSection>

          <ModuleSection label="Grouping">
            <Stack gap="xs">
              <Select
                size="xs"
                aria-label="Grouping"
                value={grouping?.id ?? null}
                data={groupings.map((option) => ({ value: option.id, label: option.label }))}
                onChange={(value) => setGroupingId(value ?? 'recurrence')}
                disabled={!groupings.length}
              />
              <Text size="xs" c="dimmed" className={classes.moduleHint}>
                {grouping?.description ?? 'Choose how the recurrence is divided.'}
              </Text>
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
                accessibleLabel="Interference preview volume"
                label="Volume"
                value={previewVolume}
                onChange={setPreviewVolume}
              />
              <VolumeControl
                accessibleLabel="Metronome volume"
                label={
                  <Switch
                    size="xs"
                    label="Metro"
                    aria-label="Grouping metronome"
                    checked={metronomeEnabled}
                    onChange={(event) => setMetronomeEnabled(event.currentTarget.checked)}
                  />
                }
                value={metronomeVolume}
                onChange={setMetronomeVolume}
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
