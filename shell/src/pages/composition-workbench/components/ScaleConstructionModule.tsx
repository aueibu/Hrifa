import { useEffect, useMemo } from 'react';
import { Alert, Badge, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import type { CompositionModuleRoutingProps, PublishedCompositionOutput } from '../compositionRouting';
import { pitchClassNames } from '../pitch';
import {
  melodicFormsPacket,
  realizeScale,
  scalePitchClassPacket,
  scaleSequence,
  scaleSequencePacket,
} from '../scaleConstruction';
import {
  acceptsFiniteNumber,
  acceptsIntegerList,
  acceptsString,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { Module, ModuleOutput, ModuleSection } from './Module';
import classes from '../CompositionWorkbench.module.css';

const permutationModeOptions = [
  { value: 'general', label: 'General (n!)' },
  { value: 'circular', label: 'Circular (n)' },
];

function acceptsPermutationMode(value: unknown): value is 'general' | 'circular' {
  return value === 'general' || value === 'circular';
}

function parseIntervalText(value: string) {
  return value
    .split(/[\s,+]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n));
}

interface ScaleConstructionModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
}

export function ScaleConstructionModule({
  instanceId,
  instanceLabel,
  onOutputsChange,
}: ScaleConstructionModuleProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'scale-construction');
  const [intervals, setIntervals] = usePersistentState<number[]>(
    stateKey(compositionStateKeys.scaleConstructionIntervals),
    [2, 2, 1],
    acceptsIntegerList,
  );
  const [root, setRoot] = usePersistentState(
    stateKey(compositionStateKeys.scaleConstructionRoot),
    0,
    acceptsFiniteNumber,
  );
  const [permutationMode, setPermutationMode] = usePersistentState<'general' | 'circular'>(
    stateKey(compositionStateKeys.scaleConstructionPermutationMode),
    'general',
    acceptsPermutationMode,
  );
  const [intervalText, setIntervalText] = usePersistentState(
    stateKey(compositionStateKeys.scaleConstructionIntervals + '.text'),
    intervals.join(', '),
    acceptsString,
  );

  const generated = useMemo(() => {
    try {
      return { result: scaleSequence(intervals) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not construct a scale.' };
    }
  }, [intervals]);

  const sequencePacket = useMemo(
    () => (generated.result ? scaleSequencePacket(generated.result, instanceId) : undefined),
    [generated.result, instanceId],
  );
  const melodicFormsOutput = useMemo(
    () => (generated.result ? melodicFormsPacket(intervals, permutationMode, instanceId) : undefined),
    [generated.result, intervals, permutationMode, instanceId],
  );
  const pitchClassOutput = useMemo(
    () => (generated.result ? scalePitchClassPacket(intervals, Number(root), instanceId) : undefined),
    [generated.result, intervals, root, instanceId],
  );
  const offsets = useMemo(() => realizeScale(intervals, Number(root)), [intervals, root]);

  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(() => {
    const outputs: PublishedCompositionOutput[] = [];
    if (sequencePacket) {
      outputs.push({ ref: { instanceId, port: 'sequence' }, label: `${instanceLabel} · Sequence`, packet: sequencePacket });
    }
    if (melodicFormsOutput) {
      outputs.push({
        ref: { instanceId, port: 'melodicForms' },
        label: `${instanceLabel} · Melodic Forms`,
        packet: melodicFormsOutput,
      });
    }
    if (pitchClassOutput) {
      outputs.push({
        ref: { instanceId, port: 'pitchClasses' },
        label: `${instanceLabel} · Pitch Classes`,
        packet: pitchClassOutput,
      });
    }
    return outputs;
  }, [instanceId, instanceLabel, sequencePacket, melodicFormsOutput, pitchClassOutput]);

  useEffect(() => {
    onOutputsChange?.(instanceId, publishedOutputs);
  }, [instanceId, onOutputsChange, publishedOutputs]);

  function commitIntervalText(text: string) {
    setIntervalText(text);
    const parsed = parseIntervalText(text);
    if (parsed.length) {
      setIntervals(parsed);
    }
  }

  function resetScaleConstruction() {
    setIntervals([2, 2, 1]);
    setIntervalText('2, 2, 1');
    setRoot(0);
    setPermutationMode('general');
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
                Pitch-scale construction from an authored interval sequence (Book II Ch. 1-2).
              </Text>
            </div>
            {generated.result && (
              <Group gap="xs">
                <Badge variant="outline">period {generated.result.period}</Badge>
                <Badge variant="outline">{intervals.length + 1} units</Badge>
              </Group>
            )}
          </Group>
          {generated.error ? (
            <Alert color="red" title="No scale">
              {generated.error}
            </Alert>
          ) : (
            generated.result && (
              <Stack gap="lg">
                <div>
                  <Text fw={600} size="sm" mb={4}>
                    Scale (from root {pitchClassNames[((Number(root) % 12) + 12) % 12]})
                  </Text>
                  <Text ff="monospace" size="sm" className={classes.pitchValues}>
                    {offsets
                      .map((offset) => pitchClassNames[((offset % 12) + 12) % 12])
                      .join(' - ')}
                  </Text>
                  <Text ff="monospace" size="sm" mt={4} className={classes.durationText}>
                    {intervals.join(' + ')}
                  </Text>
                </div>
                <Text size="xs" c="dimmed">
                  {melodicFormsOutput?.items.length ?? 0} melodic form
                  {(melodicFormsOutput?.items.length ?? 0) === 1 ? '' : 's'} ({permutationMode}{' '}
                  permutation of the interval sequence's own positions — coincident-valued forms are
                  reported as separate entries, not collapsed).
                </Text>
              </Stack>
            )
          )}
        </div>

        <Module
          name={instanceLabel}
          status={generated.result ? `period ${generated.result.period}` : 'Needs one or more positive intervals'}
          onReset={resetScaleConstruction}
          output={
            <Stack gap={4}>
              {sequencePacket && <ModuleOutput name="Sequence" packet={sequencePacket} />}
              {melodicFormsOutput && <ModuleOutput name="Melodic Forms" packet={melodicFormsOutput} />}
              {pitchClassOutput && <ModuleOutput name="Pitch Classes" packet={pitchClassOutput} />}
            </Stack>
          }
        >
          <ModuleSection label="Interval sequence">
            <Stack gap="xs">
              <TextInput
                size="xs"
                aria-label="Interval sequence"
                description="Semitone gaps between pitch-units, e.g. 2, 2, 1"
                value={intervalText}
                onChange={(event) => setIntervalText(event.currentTarget.value)}
                onBlur={(event) => commitIntervalText(event.currentTarget.value)}
              />
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
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Melodic forms</Text>
                <Select
                  size="xs"
                  aria-label="Permutation mode"
                  data={permutationModeOptions}
                  value={permutationMode}
                  allowDeselect={false}
                  onChange={(value) => value && acceptsPermutationMode(value) && setPermutationMode(value)}
                />
              </div>
            </Stack>
          </ModuleSection>
        </Module>
      </div>
    </Surface>
  );
}
