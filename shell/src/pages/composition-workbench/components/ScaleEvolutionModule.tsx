import { useEffect, useMemo } from 'react';
import { Alert, Badge, Select, Text, TextInput } from '@mantine/core';
import {
  boundOutput,
  compositionOutputOptions,
  outputRefKey,
  parseOutputRef,
  resolvePacketFromOutput,
  type CompositionModuleRoutingProps,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import type { ModuleRouteState } from '../compositionWorkspace';
import type { DataPacket } from '../model';
import { pitchClassName } from '../pitch';
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
import { DurationStrip } from './DurationStrip';
import { ModuleDevice } from './ModuleDevice';
import { InspectorSection, ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import { SourceMenu } from './SourceMenu';

function parseIntervalText(value: string) {
  return value
    .split(/[\s,+]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

function compatibleIntervalSource(packet: DataPacket) {
  return packet.kind === 'list' && packet.domain === 'interval';
}

function rawIntervalLine(source: DataPacket | undefined) {
  if (!source) {
    return '';
  }
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
  const { settings } = useCompositionSettings();
  const edo = settings.edo;
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'scale-evolution');
  const [intervalText, setIntervalText] = usePersistentState(
    stateKey(compositionStateKeys.scaleEvolutionIntervals),
    '3, 2',
    acceptsString
  );
  const [root, setRoot] = usePersistentState(
    stateKey(compositionStateKeys.scaleEvolutionRoot),
    0,
    acceptsFiniteNumber
  );

  const binding = routeState.sequence;
  const hasConnection = Boolean(binding?.source && binding.source.instanceId !== instanceId);
  const sequenceOutput = boundOutput(outputs, binding?.source);
  const resolvedSequence = useMemo(
    () =>
      hasConnection
        ? resolvePacketFromOutput(
            sequenceOutput,
            binding?.source?.index,
            `route:${instanceId}:sequence`
          )
        : undefined,
    [hasConnection, sequenceOutput, binding?.source?.index, instanceId]
  );

  const fallbackIntervals = useMemo(() => parseIntervalText(intervalText), [intervalText]);
  const sourceIntervals = useMemo(() => {
    if (resolvedSequence) {
      return resolvedSequence.items.map((item) => Number(item.value));
    }
    return fallbackIntervals;
  }, [resolvedSequence, fallbackIntervals]);

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
    [generated.result, instanceId]
  );
  const finalPacket = useMemo(
    () => (generated.result ? finalStagePacket(generated.result, instanceId) : undefined),
    [generated.result, instanceId]
  );
  const stagePitchesPacket = useMemo(
    () =>
      generated.result
        ? stagePitchClassesPacket(generated.result, Number(root), instanceId, edo)
        : undefined,
    [generated.result, root, instanceId, edo]
  );
  const finalPitchesPacket = useMemo(
    () =>
      generated.result
        ? finalPitchClassesPacket(generated.result, Number(root), instanceId, edo)
        : undefined,
    [generated.result, root, instanceId, edo]
  );

  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(() => {
    const list: PublishedCompositionOutput[] = [];
    if (stagesPacket) {
      list.push({
        ref: { instanceId, port: 'stages' },
        label: `${instanceLabel} · Stages`,
        packet: stagesPacket,
      });
    }
    if (finalPacket) {
      list.push({
        ref: { instanceId, port: 'final' },
        label: `${instanceLabel} · Final`,
        packet: finalPacket,
      });
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
  }, [
    instanceId,
    instanceLabel,
    stagesPacket,
    finalPacket,
    stagePitchesPacket,
    finalPitchesPacket,
  ]);

  useEffect(() => {
    onOutputsChange?.(instanceId, publishedOutputs);
  }, [instanceId, onOutputsChange, publishedOutputs]);

  const sequenceOptions = compositionOutputOptions(outputs, instanceId, compatibleIntervalSource);

  function resetScaleEvolution() {
    setIntervalText('3, 2');
    setRoot(0);
    onBind('sequence', null);
  }

  const rootValue = ((Number(root) % edo) + edo) % edo;

  const view = generated.error ? (
    <Alert color="red" title="No evolution">
      {generated.error}
    </Alert>
  ) : (
    generated.result && (
      <>
        <Text size="xs" c="dimmed">
          Input:{' '}
          <Text span ff="monospace">
            {sourceIntervals.join(' + ')}
          </Text>
          {resolvedSequence ? ' (connected)' : ' (typed)'}
        </Text>
        {generated.result.stages.map((stage, index) => (
          <div key={index}>
            <DurationStrip
              label={`Stage ${index + 1}${stage.collapsedToNeutral ? ' — collapsed to neutral' : ''}`}
              durations={stage.durations}
              cyclic={false}
              showSum
              blockTitle={(durationIndex, duration) =>
                `Attack ${stage.attacks[durationIndex]}; duration ${duration}`
              }
            />
            <Text ff="monospace" size="sm" mt={2} c="dimmed">
              {stagePitchesPacket?.items[index]?.label}
            </Text>
          </div>
        ))}
        {generated.result.terminationReason === 'cycle' && (
          <Text size="xs" c="dimmed">
            Stopped: this stage's durations repeated an earlier stage exactly, rather than reaching
            a neutral (all-semitone) collapse.
          </Text>
        )}
      </>
    )
  );

  return (
    <ModuleDevice
      name={instanceLabel}
      status={
        generated.result
          ? 'Interval sequence against its circular permutations'
          : 'Needs an interval sequence'
      }
      badges={
        generated.result && (
          <>
            <Badge variant="outline">{generated.result.stages.length} stage(s)</Badge>
            <Badge variant="outline">{generated.result.terminationReason}</Badge>
          </>
        )
      }
      onReset={resetScaleEvolution}
      footer={
        <Text size="xs" c="dimmed" truncate>
          Synchronizes a sequence with its own circular permutations within one shared period (Book
          I Ch. 13 / Book II Ch. 3 §A).
        </Text>
      }
      controls={
        <>
          <InspectorSection label="Sequence">
            {!binding?.source && (
              <TextInput
                aria-label="Fallback interval sequence"
                label="Interval sequence"
                description="e.g. 3, 2. Used when no source is connected."
                value={intervalText}
                onChange={(event) => setIntervalText(event.currentTarget.value)}
              />
            )}
            {binding?.source && (
              <Text size="xs" c="dimmed" ff="monospace">
                {rawIntervalLine(resolvedSequence)}
              </Text>
            )}
            <Select
              label="Root"
              aria-label="Root pitch class"
              data={Array.from({ length: edo }, (_, value) => ({
                value: String(value),
                label: pitchClassName(value, edo),
              }))}
              value={String(rootValue)}
              onChange={(value) => value !== null && setRoot(Number(value))}
            />
          </InspectorSection>

          <ModuleInspectorContent>
            <InspectorSection label="Inputs">
              <SourceMenu
                label="Connect"
                placeholder="Connect an interval source"
                options={sequenceOptions}
                value={binding?.source ? outputRefKey(binding.source) : null}
                onChange={(value) => onBind('sequence', value ? parseOutputRef(value) : null)}
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
