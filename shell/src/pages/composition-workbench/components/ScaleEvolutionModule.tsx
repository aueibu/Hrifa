import { useEffect, useMemo } from 'react';
import { Alert, Badge, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import {
  outputRefKey,
  parseOutputRef,
  type CompositionModuleRoutingProps,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import type { ModuleRouteState } from '../compositionWorkspace';
import type { DataPacket } from '../model';
import { pitchClassNames } from '../pitch';
import {
  evolveScale,
  finalPitchClassesPacket,
  finalStagePacket,
  scaleEvolutionStagesPacket,
  stagePitchClassesPacket,
} from '../scaleEvolution';
import {
  acceptsFiniteNumber,
  acceptsString,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { Module, ModuleOutput, ModuleSection } from './Module';
import classes from '../CompositionWorkbench.module.css';

function parseIntervalText(value: string) {
  return value
    .split(/[\s,+]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

function compatibleIntervalSource(output: PublishedCompositionOutput) {
  return output.packet.kind === 'list' && output.packet.domain === 'interval';
}

function rawIntervalLine(source: DataPacket | undefined) {
  if (!source) return '';
  return source.items.map((item) => String(item.value)).join(', ');
}

export interface ScaleEvolutionModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
  outputs: PublishedCompositionOutput[];
  routeState: ModuleRouteState;
  onBind(port: string, source: CompositionOutputRef | null): void;
}

export function ScaleEvolutionModule({
  instanceId,
  instanceLabel,
  outputs,
  routeState,
  onBind,
  onOutputsChange,
}: ScaleEvolutionModuleProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'scale-evolution');
  const [intervalText, setIntervalText] = usePersistentState(
    stateKey(compositionStateKeys.scaleEvolutionIntervals),
    '3, 2',
    acceptsString,
  );
  const [root, setRoot] = usePersistentState(
    stateKey(compositionStateKeys.scaleEvolutionRoot),
    0,
    acceptsFiniteNumber,
  );

  const binding = routeState.sequence;
  const outputMap = useMemo(
    () => new Map(outputs.map((output) => [outputRefKey(output.ref), output])),
    [outputs],
  );
  const connectedOutput =
    binding?.source && binding.source.instanceId !== instanceId
      ? outputMap.get(outputRefKey(binding.source))
      : undefined;

  const fallbackIntervals = useMemo(() => parseIntervalText(intervalText), [intervalText]);
  const sourceIntervals = useMemo(() => {
    if (connectedOutput) {
      return connectedOutput.packet.items.map((item) => Number(item.value));
    }
    return fallbackIntervals;
  }, [connectedOutput, fallbackIntervals]);

  const generated = useMemo(() => {
    if (!sourceIntervals.length) {
      return { error: 'Enter or connect one or more positive whole-number intervals.' };
    }
    try {
      return { result: evolveScale(sourceIntervals) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not evolve this scale.' };
    }
  }, [sourceIntervals]);

  const stagesPacket = useMemo(
    () => (generated.result ? scaleEvolutionStagesPacket(generated.result, instanceId) : undefined),
    [generated.result, instanceId],
  );
  const finalPacket = useMemo(
    () => (generated.result ? finalStagePacket(generated.result, instanceId) : undefined),
    [generated.result, instanceId],
  );
  const stagePitchesPacket = useMemo(
    () => (generated.result ? stagePitchClassesPacket(generated.result, Number(root), instanceId) : undefined),
    [generated.result, root, instanceId],
  );
  const finalPitchesPacket = useMemo(
    () => (generated.result ? finalPitchClassesPacket(generated.result, Number(root), instanceId) : undefined),
    [generated.result, root, instanceId],
  );

  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(() => {
    const list: PublishedCompositionOutput[] = [];
    if (stagesPacket) {
      list.push({ ref: { instanceId, port: 'stages' }, label: `${instanceLabel} · Stages`, packet: stagesPacket });
    }
    if (finalPacket) {
      list.push({ ref: { instanceId, port: 'final' }, label: `${instanceLabel} · Final`, packet: finalPacket });
    }
    if (stagePitchesPacket) {
      list.push({
        ref: { instanceId, port: 'stagePitches' },
        label: `${instanceLabel} · Stage Pitches`,
        packet: stagePitchesPacket,
      });
    }
    if (finalPitchesPacket) {
      list.push({
        ref: { instanceId, port: 'finalPitches' },
        label: `${instanceLabel} · Final Pitches`,
        packet: finalPitchesPacket,
      });
    }
    return list;
  }, [instanceId, instanceLabel, stagesPacket, finalPacket, stagePitchesPacket, finalPitchesPacket]);

  useEffect(() => {
    onOutputsChange?.(instanceId, publishedOutputs);
  }, [instanceId, onOutputsChange, publishedOutputs]);

  const sequenceOptions = outputs
    .filter((output) => output.ref.instanceId !== instanceId && compatibleIntervalSource(output))
    .map((output) => ({ value: outputRefKey(output.ref), label: output.label }));

  function resetScaleEvolution() {
    setIntervalText('3, 2');
    setRoot(0);
    onBind('sequence', null);
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
                Synchronizing an interval sequence with its own circular permutations, within one
                shared period (Book I Ch. 13 / Book II Ch. 3 §A).
              </Text>
            </div>
            {generated.result && (
              <Group gap="xs">
                <Badge variant="outline">{generated.result.stages.length} stage(s)</Badge>
                <Badge variant="outline">{generated.result.terminationReason}</Badge>
              </Group>
            )}
          </Group>

          {generated.error ? (
            <Alert color="red" title="No evolution">
              {generated.error}
            </Alert>
          ) : (
            generated.result && (
              <Stack gap="lg">
                <Text size="xs" c="dimmed">
                  Input: <Text span ff="monospace">{sourceIntervals.join(' + ')}</Text>
                  {connectedOutput ? ' (connected)' : ' (typed)'}
                </Text>
                {generated.result.stages.map((stage, index) => (
                  <div key={index}>
                    <Text fw={600} size="sm" mb={4}>
                      Stage {index + 1}
                      {stage.collapsedToNeutral ? ' — collapsed to neutral' : ''}
                    </Text>
                    <div
                      className={classes.durationTimeline}
                      aria-label={`Stage ${index + 1} durations ${stage.durations.join(' ')}`}
                    >
                      {stage.durations.map((duration, durationIndex) => (
                        <span
                          className={classes.durationBlock}
                          key={`${stage.attacks[durationIndex]}:${duration}`}
                          style={{ flexGrow: duration }}
                          title={`Attack ${stage.attacks[durationIndex]}; duration ${duration}`}
                        >
                          {duration}
                        </span>
                      ))}
                    </div>
                    <Text ff="monospace" size="sm" mt={4} className={classes.durationText}>
                      {stage.durations.join(' + ')}
                    </Text>
                    <Text ff="monospace" size="sm" mt={2} c="dimmed">
                      {stagePitchesPacket?.items[index]?.label}
                    </Text>
                  </div>
                ))}
                {generated.result.terminationReason === 'cycle' && (
                  <Text size="xs" c="dimmed">
                    Stopped: this stage's durations repeated an earlier stage exactly, rather than
                    reaching a neutral (all-semitone) collapse.
                  </Text>
                )}
              </Stack>
            )
          )}
        </div>

        <Module
          name={instanceLabel}
          status={generated.result ? `${generated.result.stages.length} stage(s), ${generated.result.terminationReason}` : 'Needs an interval sequence'}
          onReset={resetScaleEvolution}
          output={
            <Stack gap={4}>
              {stagesPacket && <ModuleOutput name="Stages" packet={stagesPacket} />}
              {finalPacket && <ModuleOutput name="Final" packet={finalPacket} />}
              {stagePitchesPacket && <ModuleOutput name="Stage Pitches" packet={stagePitchesPacket} />}
              {finalPitchesPacket && <ModuleOutput name="Final Pitches" packet={finalPitchesPacket} />}
            </Stack>
          }
        >
          <ModuleSection label="Sequence">
            <Stack gap="xs">
              <Select
                size="xs"
                label="Connect"
                placeholder="Connect an interval source"
                clearable
                data={sequenceOptions}
                value={binding?.source ? outputRefKey(binding.source) : null}
                onChange={(value) => onBind('sequence', value ? parseOutputRef(value) : null)}
              />
              {!binding?.source && (
                <TextInput
                  size="xs"
                  aria-label="Fallback interval sequence"
                  label="Fallback"
                  description="e.g. 3, 2"
                  value={intervalText}
                  onChange={(event) => setIntervalText(event.currentTarget.value)}
                />
              )}
              {binding?.source && (
                <Text size="xs" c="dimmed" ff="monospace">
                  {rawIntervalLine(connectedOutput?.packet)}
                </Text>
              )}
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Root</Text>
                <Select
                  size="xs"
                  aria-label="Root pitch class"
                  data={pitchClassNames.map((name, value) => ({ value: String(value), label: name }))}
                  value={String(((Number(root) % 12) + 12) % 12)}
                  onChange={(value) => value !== null && setRoot(Number(value))}
                />
              </div>
            </Stack>
          </ModuleSection>
        </Module>
      </div>
    </Surface>
  );
}
