import { useEffect, useMemo } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { volumePercentToGain } from '../audio';
import { createInterferencePreviewPlan, GROUPING_BUS } from '../audio/performancePlans';
import { transportRhythmContext } from '../rhythmRealization';
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
  parseGeneratorValues,
} from '../interference';
import {
  acceptsBoolean,
  acceptsFiniteNumber,
  acceptsString,
  compositionStateKeys,
  compositionInstanceStateKey,
  usePersistentState,
} from '../usePersistentState';
import { useCompositionSettings } from '../compositionSettings';
import { pulseSeconds } from '../transport';
import { isSoundOverride, layerSound, type SoundOverride } from '../sounds';
import { ModuleOutput } from './Module';
import { ModuleDevice } from './ModuleDevice';
import { InspectorSection, ModuleInspectorContent } from './ModuleHost';
import { useModulePreview } from '../useModulePreview';
import { DurationStrip } from './DurationStrip';
import { Playhead } from './Playhead';
import { SoundOverrideControl } from './SoundControls';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

interface GeneratorDraft {
  id: string;
  label: string;
  valueText: string;
  /**
   * This generator's own sound; null or absent plays it on the rhythm voice matching its position
   * (generator 1 → primary, 2 → secondary, …).
   */
  sound?: SoundOverride | null;
  /** Saved before voices existed: the generator's tone pitch. Read once as a Tone override. */
  midiNote?: number;
}

const initialGenerators: GeneratorDraft[] = [
  { id: 'generator-a', label: 'Generator 1', valueText: '2' },
  { id: 'generator-b', label: 'Generator 2', valueText: '3' },
  { id: 'generator-c', label: 'Generator 3', valueText: '5' },
];

// The pitches generators got automatically before voices existed. A saved pitch that differs was
// chosen by hand, so it carries over as a Tone override; a default one gives way to the voices.
function legacyDefaultMidiNote(index: number) {
  return [48, 55, 60][index] ?? Math.min(84, 48 + index * 5);
}

function generatorOverride(draft: GeneratorDraft, index: number): SoundOverride | null {
  if (draft.sound !== undefined) {
    return draft.sound;
  }
  return typeof draft.midiNote === 'number' && draft.midiNote !== legacyDefaultMidiNote(index)
    ? { type: 'tone', midicents: draft.midiNote * 100 }
    : null;
}

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
          (draft.midiNote === undefined || typeof draft.midiNote === 'number') &&
          (draft.sound === undefined || draft.sound === null || isSoundOverride(draft.sound))
      )
  );
  const [groupingId, setGroupingId] = usePersistentState(
    stateKey(compositionStateKeys.interferenceGrouping),
    'recurrence',
    acceptsString
  );
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.interferenceVolume),
    30,
    acceptsFiniteNumber
  );
  // The grouping click (formerly this module's own metronome): ticks the selected grouping on
  // top of the transport's meter click, at the transport's metronome volume.
  const [groupingClick, setGroupingClick] = usePersistentState(
    stateKey(compositionStateKeys.interferenceMetronome),
    false,
    acceptsBoolean
  );
  const { settings } = useCompositionSettings();
  const groupingGain = groupingClick ? volumePercentToGain(settings.transport.metronomeVolume) : 0;

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

  const preview = useModulePreview({
    instanceId,
    volume: previewVolume,
    followTransport: true,
    busGains: { [GROUPING_BUS]: groupingGain },
    transportPlay: playPreview,
  });

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
        sound: null,
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

  function playPreview() {
    if (!generated.result) {
      return;
    }
    const previewEvents = generatorAttackCount(patterns, generated.result.recurrence);
    if (previewEvents > MAX_PREVIEW_EVENTS) {
      preview.setStatus(
        `This preview would schedule ${previewEvents} generator attacks; the safety limit is ${MAX_PREVIEW_EVENTS}.`
      );
      return;
    }
    const totalSeconds = generated.result.recurrence * pulseSeconds(settings.transport);
    const plan = createInterferencePreviewPlan({
      ...transportRhythmContext(settings.transport),
      sourceId: instanceId,
      patterns,
      sounds: drafts.map((draft, index) =>
        layerSound(settings.sounds.rhythm, index, generatorOverride(draft, index))
      ),
      groupingSound: layerSound(settings.sounds.metronome, 2),
      result: generated.result,
      grouping,
    });
    void preview.play(
      plan,
      `Playing ${patterns.map(formatGeneratorPattern).join(' + ')} for ${totalSeconds.toFixed(1)} seconds. Click controls are live.`
    );
  }

  function resetInterference() {
    preview.stop('');
    setDrafts(initialGenerators);
    setGroupingId('recurrence');
    setPreviewVolume(30);
    setGroupingClick(false);
    preview.setStatus('Interference module reset.');
  }

  const view = generated.error ? (
    <Alert color="red" title="No resultant">
      {generated.error}
    </Alert>
  ) : (
    generated.result &&
    patterns.length > 1 && (
      <>
        <DurationStrip
          label="Resultant durations"
          durations={generated.result.durations}
          cyclic={false}
          showSum
          blockTitle={(index, duration) =>
            `Attack ${generated.result.attacks[index].time}; duration ${duration}`
          }
          overlay={
            grouping &&
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
            )
          }
          playhead={{ sourceId: instanceId, unitSeconds: pulseSeconds(settings.transport) }}
        />

        <div>
          <Text fw={600} size="xs" mb={4}>
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
                      <Playhead
                        sourceId={instanceId}
                        unitSeconds={pulseSeconds(settings.transport)}
                        length={generated.result.recurrence}
                        cyclic={false}
                      />
                    </div>
                  </div>
                );
              })}
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              The {generated.result.recurrence}-unit attack grid is hidden above 128 units; the
              exact durations remain available above.
            </Text>
          )}
        </div>
      </>
    )
  );

  return (
    <ModuleDevice
      name={instanceLabel}
      status={`Resultant ${patterns.map(formatGeneratorPattern).join(' + ')}`}
      badges={
        generated.result && (
          <>
            <Badge variant="outline">LCM {generated.result.recurrence}</Badge>
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
      onReset={resetInterference}
      footer={
        <Text size="xs" c="dimmed" truncate aria-live="polite">
          {preview.status || 'Plays at the transport tempo; volume and click controls stay live.'}
        </Text>
      }
      controls={
        <>
          <InspectorSection label="Generators">
            <div className={classes.generatorTable}>
              <div className={classes.generatorTableHeader} aria-hidden="true">
                <span>#</span>
                <span>Pattern</span>
                <span>Period</span>
                <span>Sound</span>
                <span />
              </div>
              <div className={classes.generatorRows}>
                {authored.map(({ draft, parsed }, index) => (
                  <div className={classes.generatorRow} key={draft.id}>
                    <Text ff="monospace" size="xs" c="dimmed">
                      {index + 1}
                    </Text>
                    <TextInput
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
                    <SoundOverrideControl
                      label={draft.label}
                      set={settings.sounds.rhythm}
                      voiceIndex={index}
                      value={generatorOverride(draft, index)}
                      onChange={(sound) => updateDraft(draft.id, { sound, midiNote: undefined })}
                    />
                    <ActionIcon
                      variant="subtle"
                      aria-label={`Remove ${draft.label}`}
                      disabled={drafts.length <= 2}
                      onClick={() => removeGenerator(draft.id)}
                    >
                      ×
                    </ActionIcon>
                  </div>
                ))}
              </div>
              <Button variant="subtle" onClick={addGenerator}>
                + Generator
              </Button>
            </div>
          </InspectorSection>

          <InspectorSection label="Grouping">
            <Select
              aria-label="Grouping"
              value={grouping?.id ?? null}
              data={groupings.map((option) => ({ value: option.id, label: option.label }))}
              onChange={(value) => setGroupingId(value ?? 'recurrence')}
              disabled={!groupings.length}
            />
            <Text size="xs" c="dimmed" className={classes.moduleHint}>
              {grouping?.description ?? 'Choose how the recurrence is divided.'}
            </Text>
          </InspectorSection>

          <ModuleInspectorContent>
            <InspectorSection label="Preview">
              <VolumeControl
                accessibleLabel="Interference preview volume"
                label="Volume"
                value={previewVolume}
                onChange={setPreviewVolume}
              />
              <Switch
                label="Click the grouping"
                description="Ticks each grouping on the metronome's tertiary voice, on top of the meter click, at the transport's click volume."
                checked={groupingClick}
                onChange={(event) => setGroupingClick(event.currentTarget.checked)}
              />
            </InspectorSection>
            {publishedOutputs.length > 0 && (
              <InspectorSection label="Outputs">
                {publishedOutputs.map((output) => (
                  <ModuleOutput
                    key={output.ref.port}
                    name={output.label.replace(`${instanceLabel} · `, '')}
                    packet={output.packet}
                    stacked
                  />
                ))}
              </InspectorSection>
            )}
          </ModuleInspectorContent>
        </>
      }
    >
      {view}
    </ModuleDevice>
  );
}
