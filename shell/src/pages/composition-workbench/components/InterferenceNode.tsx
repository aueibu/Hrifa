import { useEffect } from 'react';
import { Alert, Badge, Stack, Text } from '@mantine/core';
import { Button, Select, Switch, TextInput, ActionIcon } from '../../../ui';
import { volumePercentToGain } from '../audio';
import { createInterferencePreviewPlan, GROUPING_BUS } from '../audio/performancePlans';
import { useCompositionSettings } from '../compositionSettings';
import { foldIntoHistory } from '../history';
import {
  generatorAttackCount,
  generatorAttackTimes,
  generatorPeriod,
  MAX_PREVIEW_EVENTS,
} from '../interference';
import { transportRhythmContext } from '../rhythmRealization';
import { useNodeEvaluationResult } from '../runtime/evaluationStore';
import type { GeneratorDraft } from '../runtime/evaluators/interference';
import { useNodeState } from '../runtime/nodeState';
import {
  interferenceInitialGenerators,
  interferenceState,
} from '../runtime/nodeState/interference';
import { layerSound, type SoundOverride } from '../sounds';
import { pulseSeconds } from '../transport';
import { useNodePreview } from '../useNodePreview';
import {
  acceptsBoolean,
  acceptsFiniteNumber,
  compositionStateKeys,
  compositionInstanceStateKey,
  usePersistentState,
} from '../usePersistentState';
import { DurationStrip } from './DurationStrip';
import { NodeDevice } from './NodeDevice';
import { InspectorSection, NodeInspectorContent, NodeOutputsSection } from './NodeHost';
import { Playhead } from './Playhead';
import { SoundOverrideControl } from './SoundControls';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

function generatorOverride(draft: GeneratorDraft): SoundOverride | null {
  return draft.sound ?? null;
}

function nextGeneratorId() {
  return `interference-generator-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

function formatGeneratorPattern(pattern: number[]) {
  return `⟨${pattern.join(' + ')}⟩`;
}

interface InterferenceNodeProps {
  instanceId: string;
  instanceLabel: string;
}

export function InterferenceNode({ instanceId, instanceLabel }: InterferenceNodeProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId);
  const [{ drafts, groupingId }, { drafts: setDrafts, groupingId: setGroupingId }] = useNodeState(
    interferenceState,
    instanceId
  );
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.interferenceVolume),
    30,
    acceptsFiniteNumber
  );
  // The grouping click (formerly this node's own metronome): ticks the selected grouping on
  // top of the transport's meter click, at the transport's metronome volume.
  const [groupingClick, setGroupingClick] = usePersistentState(
    stateKey(compositionStateKeys.interferenceMetronome),
    false,
    acceptsBoolean
  );
  const { settings } = useCompositionSettings();
  const groupingGain = groupingClick ? volumePercentToGain(settings.transport.metronomeVolume) : 0;

  const {
    authored,
    patterns,
    generated,
    groupings,
    grouping,
    outputs: publishedOutputs,
  } = useNodeEvaluationResult('interference', instanceId);

  useEffect(() => {
    if (groupings.length && !groupings.some((option) => option.id === groupingId)) {
      // An automatic reset: it folds into the change that caused it, never its own undo step.
      foldIntoHistory(() => setGroupingId('recurrence'));
    }
  }, [groupingId, groupings]);

  const preview = useNodePreview({
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
        layerSound(settings.sounds.rhythm, index, generatorOverride(draft))
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
    setDrafts(interferenceInitialGenerators);
    setGroupingId('recurrence');
    setPreviewVolume(30);
    setGroupingClick(false);
    preview.setStatus('Interference node reset.');
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
          <Text fw={600} mb={4}>
            Generator attacks
          </Text>
          {generated.result.recurrence <= 128 ? (
            <Stack gap={3}>
              {patterns.map((pattern, generatorIndex) => {
                const attackTimes = new Set(
                  generatorAttackTimes(pattern, generated.result.recurrence)
                );
                return (
                  <div className={classes.attackRow} key={drafts[generatorIndex].id}>
                    <Text ff="monospace">G{generatorIndex + 1}</Text>
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
            <Text c="dimmed">
              The {generated.result.recurrence}-unit attack grid is hidden above 128 units; the
              exact durations remain available above.
            </Text>
          )}
        </div>
      </>
    )
  );

  return (
    <NodeDevice
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
        <Text c="dimmed" truncate aria-live="polite">
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
                    <Text ff="monospace" c="dimmed">
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
                    <Text ff="monospace" ta="center">
                      {parsed.values.length ? generatorPeriod(parsed.values) : '—'}
                    </Text>
                    <SoundOverrideControl
                      label={draft.label}
                      set={settings.sounds.rhythm}
                      voiceIndex={index}
                      value={generatorOverride(draft)}
                      onChange={(sound) => updateDraft(draft.id, { sound })}
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

          <InspectorSection
            label="Grouping"
            help={grouping?.description ?? 'Choose how the recurrence is divided.'}
          >
            <Select
              aria-label="Grouping"
              value={grouping?.id ?? null}
              data={groupings.map((option) => ({ value: option.id, label: option.label }))}
              onChange={(value) => setGroupingId(value ?? 'recurrence')}
              disabled={!groupings.length}
            />
          </InspectorSection>

          <NodeInspectorContent>
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
            <NodeOutputsSection instanceLabel={instanceLabel} outputs={publishedOutputs} />
          </NodeInspectorContent>
        </>
      }
    >
      {view}
    </NodeDevice>
  );
}
