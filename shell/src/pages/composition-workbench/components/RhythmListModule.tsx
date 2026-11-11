import { useEffect, useMemo } from 'react';
import { Badge, Button, Switch, Text, TextInput } from '@mantine/core';
import type {
  CompositionModuleRoutingProps,
  PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import { packet, type DataItem } from '../model';
import { formatPulses, parseRhythmText } from '../rhythmNotation';
import {
  createRhythmPreviewPlan,
  musicalPlanSeconds,
  rhythmAttacks,
  transportRhythmContext,
} from '../rhythmRealization';
import { isSoundOverride, layerSound, type SoundOverride } from '../sounds';
import { pulseSeconds } from '../transport';
import { useModulePreview } from '../useModulePreview';
import {
  acceptsBoolean,
  acceptsFiniteNumber,
  acceptsString,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { DurationStrip } from './DurationStrip';
import { ModuleDevice } from './ModuleDevice';
import {
  HelpTip,
  InspectorSection,
  ModuleInspectorContent,
  ModuleNotices,
  ModuleOutputsSection,
  type ModuleNotice,
} from './ModuleHost';
import { SoundOverrideControl } from './SoundControls';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

const initialText = '3 r1 2~ 2 1';

export interface RhythmListModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
}

/**
 * Authors an inter-onset rhythm by typing it, with rests and ties: `3 r1 2~ 2 1`. `r1` is a
 * one-pulse rest; `2~` is tied into the next item, so `2~ 2` is one four-pulse note. The output is
 * an ordinary `list | duration | inter-onset` packet whose rests are negative durations and whose
 * tie markers sit on the item that starts the tie (see ARCHITECTURE.md, "Rests and ties").
 */
export function RhythmListModule({
  instanceId,
  instanceLabel,
  onOutputsChange,
}: RhythmListModuleProps) {
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'rhythm-list');
  const [text, setText] = usePersistentState(
    stateKey(compositionStateKeys.rhythmListText),
    initialText,
    acceptsString
  );
  // A loop wraps a tie off the end onto the first item; a one-shot ignores it with a warning.
  const [loop, setLoop] = usePersistentState(
    stateKey(compositionStateKeys.rhythmListLoop),
    true,
    acceptsBoolean
  );
  const [soundSetting, setSoundSetting] = usePersistentState<SoundOverride | null>(
    stateKey(compositionStateKeys.rhythmListSound),
    null,
    (value): value is SoundOverride | null => value === null || isSoundOverride(value)
  );
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.rhythmListVolume),
    30,
    acceptsFiniteNumber
  );
  const { settings } = useCompositionSettings();

  const parsed = useMemo(() => parseRhythmText(text), [text]);
  const resolved = useMemo(
    () => rhythmAttacks(parsed.steps, 0, { cyclic: loop }),
    [parsed.steps, loop]
  );
  const outputPacket = useMemo(() => {
    if (parsed.errors.length || !parsed.steps.length) {
      return undefined;
    }
    const items: DataItem<number>[] = parsed.steps.map((step, index) => ({
      id: `${instanceId}:rhythm:${index}`,
      value: step.duration,
      ...(step.tie ? { tie: true } : {}),
      label: step.duration < 0 ? `r${-step.duration}` : `${step.duration}${step.tie ? '~' : ''}`,
      provenance: [
        {
          sourceModuleInstance: instanceId,
          sourceItemIds: [],
          transformation: 'rhythm-list-read',
          parameters: { text: step.duration < 0 ? `r${-step.duration}` : String(step.duration) },
        },
      ],
    }));
    return packet<number>(
      'list',
      'duration',
      items,
      resolved.warnings,
      { source: 'inline' },
      {
        role: 'interOnset',
        frame: {
          topology: loop ? 'cyclic' : 'linear',
          unit: 'pulse',
          extent: resolved.spanPulses,
          origin: 0,
        },
      }
    );
  }, [instanceId, loop, parsed.errors.length, parsed.steps, resolved]);

  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(
    () =>
      outputPacket
        ? [
            {
              ref: { instanceId, port: 'rhythm' },
              label: `${instanceLabel} · Rhythm`,
              packet: outputPacket,
            },
          ]
        : [],
    [instanceId, instanceLabel, outputPacket]
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
    if (!outputPacket) {
      preview.setStatus('Enter a rhythm to preview.');
      return;
    }
    const plan = createRhythmPreviewPlan({
      sourceId: instanceId,
      ...transportRhythmContext(settings.transport),
      layers: [
        {
          layerId: 'rhythm',
          steps: parsed.steps,
          // The preview plays the list once from the top, so a wrapping tie is heard as written.
          sound: layerSound(settings.sounds.rhythm, 0, soundSetting),
        },
      ],
    });
    void preview.play(
      plan,
      `Playing the rhythm for ${musicalPlanSeconds(plan).toFixed(1)} seconds.`
    );
  }

  function resetRhythmList() {
    preview.stop('');
    setText(initialText);
    setLoop(true);
    setSoundSetting(null);
    setPreviewVolume(30);
    preview.setStatus('Rhythm List module reset.');
  }

  const restCount = parsed.steps.filter((step) => step.duration < 0).length;
  const tieCount = parsed.steps.filter((step) => step.tie).length;

  // Errors and warnings go to the controls panel in small type, not above the strip.
  const notices: ModuleNotice[] = [
    ...parsed.errors.map((text): ModuleNotice => ({ tone: 'error', text })),
    ...(parsed.errors.length === 0
      ? resolved.warnings.map((text): ModuleNotice => ({ tone: 'warning', text }))
      : []),
  ];

  const view = (
    <>
      {parsed.steps.length > 0 && parsed.errors.length === 0 && (
        <DurationStrip
          label="Rhythm"
          durations={parsed.steps.map((step) => Math.abs(step.duration))}
          steps={parsed.steps}
          cyclic={loop}
          showSum
          blockTitle={(index, duration) =>
            parsed.steps[index].tie
              ? `Item ${index + 1}: ${duration} pulses, tied into the next item`
              : `Item ${index + 1}: ${duration} pulses`
          }
          playhead={{ sourceId: instanceId, unitSeconds: pulseSeconds(settings.transport) }}
        />
      )}
    </>
  );

  return (
    <ModuleDevice
      name={instanceLabel}
      status={parsed.errors.length ? 'Needs a readable rhythm' : 'Reading the typed rhythm'}
      badges={
        parsed.errors.length === 0 &&
        parsed.steps.length > 0 && (
          <>
            <Badge variant="outline">{resolved.attacks.length} attacks</Badge>
            <Badge variant="outline">{restCount} rests</Badge>
            <Badge variant="outline">{tieCount} ties</Badge>
            <Badge variant="outline">{formatPulses(resolved.spanPulses)} pulses</Badge>
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
      onReset={resetRhythmList}
      footer={
        <Text size="xs" c="dimmed" truncate aria-live="polite">
          {preview.status || 'Plays at the transport tempo; volume stays live.'}
        </Text>
      }
      controls={
        <>
          <ModuleNotices items={notices} />
          <InspectorSection label="Values">
            <TextInput
              label={
                <HelpTip help="Pulses separated by spaces. r1 is a rest, 2~ is tied into the next item: 3 r1 2~ 2. A length can be a fraction such as 6/5.">
                  Rhythm
                </HelpTip>
              }
              aria-label="Rhythm values"
              value={text}
              error={parsed.errors.length > 0}
              onChange={(event) => setText(event.currentTarget.value)}
            />
            <Switch
              label="Loop"
              aria-label="Treat the rhythm as a loop"
              checked={loop}
              onChange={(event) => setLoop(event.currentTarget.checked)}
            />
          </InspectorSection>

          <ModuleInspectorContent>
            <InspectorSection label="Preview">
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Sound</Text>
                <SoundOverrideControl
                  label="Preview"
                  set={settings.sounds.rhythm}
                  voiceIndex={0}
                  value={soundSetting}
                  onChange={setSoundSetting}
                />
              </div>
              <VolumeControl
                accessibleLabel="Rhythm List preview volume"
                label="Volume"
                value={previewVolume}
                onChange={setPreviewVolume}
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
