import { Alert, Badge, Select, Text, TextInput } from '@mantine/core';
import {
  compositionOutputOptions,
  outputRefKey,
  parseOutputRef,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import type { ModuleRouteState } from '../compositionWorkspace';
import type { DataPacket } from '../model';
import { pitchClassName } from '../pitch';
import { useModuleEvaluationResult } from '../runtime/evaluationStore';
import { useModuleState } from '../runtime/moduleState';
import { scaleEvolutionState } from '../runtime/moduleState/scaleEvolution';
import { DurationStrip } from './DurationStrip';
import { ModuleDevice } from './ModuleDevice';
import { InspectorSection, ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import { SourceMenu } from './SourceMenu';

function compatibleIntervalSource(packet: DataPacket) {
  return packet.kind === 'list' && packet.domain === 'interval';
}

function rawIntervalLine(source: DataPacket | undefined) {
  if (!source) {
    return '';
  }
  return source.items.map((item) => String(item.value)).join(', ');
}

export interface ScaleEvolutionModuleProps {
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
}: ScaleEvolutionModuleProps) {
  const { settings } = useCompositionSettings();
  const edo = settings.edo;
  const [{ intervalText, root }, { intervalText: setIntervalText, root: setRoot }] = useModuleState(
    scaleEvolutionState,
    instanceId
  );

  const binding = routeState.sequence;
  const {
    resolvedSequence,
    sourceIntervals,
    generated,
    stagePitchesPacket,
    outputs: publishedOutputs,
  } = useModuleEvaluationResult('scale-evolution', instanceId);

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
