import { useEffect } from 'react';
import { Badge, Button, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { volumePercentToGain } from '../audio';
import {
  boundOutput,
  compositionOutputOptions,
  outputRefKey,
  parseOutputRef,
  resolvePacketFromOutput,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import type { ModuleRouteState } from '../compositionWorkspace';
import { channelBusGains, compileMixerPlan, mixerRealignment, type MixerChannel } from '../mixer';
import {
  acceptsMixerChannels,
  defaultMixerChannelSettings,
  isMixerSourceCandidate,
  loopPolicyOptions,
  MAX_GATE_PERCENT,
  MIN_GATE_PERCENT,
  mixerChannelMaterial,
  type MixerChannelMaterial,
  type MixerChannelSettings,
  type MixerChannelsState,
} from '../mixerChannels';
import { pulsesToMusicalDuration, rationalToNumber } from '../musicalTime';
import { transportRhythmContext } from '../rhythmRealization';
import { signalTypeRegistry } from '../signalTypes';
import { layerSound } from '../sounds';
import { parseMeter } from '../transport';
import { useModulePreview } from '../useModulePreview';
import {
  acceptsFiniteNumber,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { Module, ModuleSection } from './Module';
import { SoundOverrideControl } from './SoundControls';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

interface MixerModuleProps {
  instanceId: string;
  instanceLabel: string;
  outputs: PublishedCompositionOutput[];
  /** The receiver's route state: its keys are the channels, in order. */
  routeState: ModuleRouteState;
  onBind(port: string, source: CompositionOutputRef | null): void;
  onAddChannel(): void;
  onRemoveChannel(port: string): void;
}

function channelStatus(material: MixerChannelMaterial) {
  if (material.status === 'empty') {
    return 'No source';
  }
  if (material.status === 'error') {
    return material.message;
  }
  const count = material.material.events.length;
  return `${material.source === 'notes' ? 'Notes' : 'Rhythm'} | ${count} ${count === 1 ? 'event' : 'events'}`;
}

export function MixerModule({
  instanceId,
  instanceLabel,
  outputs,
  routeState,
  onBind,
  onAddChannel,
  onRemoveChannel,
}: MixerModuleProps) {
  const { settings } = useCompositionSettings();
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'mixer');
  const [channelState, setChannelState] = usePersistentState<MixerChannelsState>(
    stateKey(compositionStateKeys.mixerChannels),
    {},
    acceptsMixerChannels
  );
  const [masterVolume, setMasterVolume] = usePersistentState(
    stateKey(compositionStateKeys.mixerVolume),
    60,
    acceptsFiniteNumber
  );

  const ports = Object.keys(routeState);
  const settingsFor = (port: string): MixerChannelSettings => ({
    ...defaultMixerChannelSettings,
    ...channelState[port],
  });
  const updateChannel = (port: string, patch: Partial<MixerChannelSettings>) =>
    setChannelState((current) => ({
      ...current,
      [port]: { ...defaultMixerChannelSettings, ...current[port], ...patch },
    }));

  // A removed channel takes its settings with it.
  const portKey = ports.join('|');
  useEffect(() => {
    setChannelState((current) => {
      const stale = Object.keys(current).filter((port) => !ports.includes(port));
      if (!stale.length) {
        return current;
      }
      return Object.fromEntries(Object.entries(current).filter(([port]) => ports.includes(port)));
    });
    // `ports` is derived from portKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portKey, setChannelState]);

  const { pulseUnit, timeline } = transportRhythmContext(settings.transport);

  const channels = ports.map((port, index) => {
    const binding = routeState[port];
    const channel = settingsFor(port);
    const output = boundOutput(outputs, binding?.source);
    const resolved = resolvePacketFromOutput(
      output,
      binding?.source?.index,
      `route:${instanceId}:${port}`
    );
    const treated = binding
      ? signalTypeRegistry[binding.signalType].apply(
          resolved,
          binding.treatment,
          `route:${instanceId}:${port}`,
          settings.edo
        )
      : undefined;
    const material = mixerChannelMaterial(treated, {
      sourceId: instanceId,
      channelId: port,
      pulseUnit,
      sound: layerSound(settings.sounds.rhythm, index, channel.sound),
      gatePercent: channel.gatePercent,
    });
    return { port, index, binding, channel, material };
  });

  const mixerChannels: MixerChannel[] = channels.flatMap(({ port, channel, material }) =>
    material.status === 'ready'
      ? [
          {
            config: {
              id: port,
              loop: channel.loop,
              offset: pulsesToMusicalDuration(channel.offsetPulses, pulseUnit),
              gainPercent: channel.gainPercent,
              muted: channel.muted,
              solo: channel.solo,
            },
            material: material.material,
          },
        ]
      : []
  );
  const realignment = mixerRealignment(mixerChannels);
  const pulseQuarters = rationalToNumber(pulseUnit.quarterNotes);
  const { numerator: meterNumerator, denominator: meterDenominator } = parseMeter(
    settings.transport.meter
  );
  const barQuarters = (4 * meterNumerator) / meterDenominator;
  const realignmentText = realignment
    ? `Realigns every ${Math.round(rationalToNumber(realignment.quarterNotes) / pulseQuarters)} pulses (${(
        rationalToNumber(realignment.quarterNotes) / barQuarters
      )
        .toFixed(2)
        .replace(/\.?0+$/, '')} bars)`
    : mixerChannels.some((channel) => channel.config.loop !== 'once')
      ? 'No realignment period within reach'
      : '';

  const masterGain = volumePercentToGain(masterVolume);
  const preview = useModulePreview({
    instanceId,
    volume: masterVolume,
    followTransport: true,
    busGains: channelBusGains(
      instanceId,
      channels.map(({ port, channel }) => ({
        id: port,
        loop: channel.loop,
        offset: pulsesToMusicalDuration(0, pulseUnit),
        gainPercent: channel.gainPercent,
        muted: channel.muted,
        solo: channel.solo,
      })),
      (percent) => volumePercentToGain(percent) * masterGain
    ),
    transportPlay: playMix,
  });

  function playMix() {
    if (!mixerChannels.length) {
      preview.setStatus('Connect at least one playable source.');
      return;
    }
    const result = compileMixerPlan({ sourceId: instanceId, timeline, channels: mixerChannels });
    if (!result.plan) {
      preview.setStatus(result.warnings.join(' ') || 'Nothing to play.');
      return;
    }
    const notes = result.warnings.length ? ` ${result.warnings[0]}` : '';
    void preview.play(
      result.plan,
      `Playing ${mixerChannels.length} ${mixerChannels.length === 1 ? 'channel' : 'channels'}${
        result.loopable ? ', looping' : ''
      }.${notes}`,
      { loop: result.loopable }
    );
  }

  function resetMixer() {
    preview.stop('');
    setChannelState({});
    setMasterVolume(60);
    preview.setStatus('Mixer reset. Channel sources stay connected.');
  }

  const connected = channels.filter(({ material }) => material.status === 'ready').length;

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
                Auditions several ideas together. Each channel loops on its own cycle.
              </Text>
            </div>
            <Group gap="xs">
              <Badge variant="outline">
                {connected} of {ports.length} playing
              </Badge>
              {realignmentText && <Badge variant="outline">{realignmentText}</Badge>}
            </Group>
          </Group>

          <Stack gap="md">
            {channels.map(({ port, index, binding, channel, material }) => {
              const options = compositionOutputOptions(outputs, instanceId, isMixerSourceCandidate);
              const isRhythm = material.status === 'ready' && material.source === 'rhythm';
              return (
                <Surface key={port} p="sm" aria-label={`Channel ${index + 1}`}>
                  <Stack gap="xs">
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={700} size="sm">
                        Ch {index + 1}
                      </Text>
                      <Text
                        size="xs"
                        c={material.status === 'error' ? 'red' : 'dimmed'}
                        truncate
                        aria-live="polite"
                      >
                        {channelStatus(material)}
                      </Text>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        disabled={ports.length <= 1}
                        aria-label={`Remove channel ${index + 1}`}
                        onClick={() => onRemoveChannel(port)}
                      >
                        Remove
                      </Button>
                    </Group>
                    <Select
                      size="xs"
                      label="Source"
                      placeholder="Connect notes or a rhythm"
                      clearable
                      data={options}
                      value={binding?.source ? outputRefKey(binding.source) : null}
                      onChange={(value) => onBind(port, value ? parseOutputRef(value) : null)}
                    />
                    <Group gap="sm" align="end" wrap="wrap">
                      <Select
                        size="xs"
                        label="Loop"
                        aria-label={`Channel ${index + 1} loop`}
                        allowDeselect={false}
                        data={loopPolicyOptions}
                        value={channel.loop}
                        onChange={(value) =>
                          value &&
                          updateChannel(port, { loop: value as MixerChannelSettings['loop'] })
                        }
                      />
                      <NumberInput
                        size="xs"
                        label="Offset (pulses)"
                        aria-label={`Channel ${index + 1} offset in pulses`}
                        min={0}
                        step={1}
                        allowDecimal={false}
                        value={channel.offsetPulses}
                        onChange={(value) =>
                          updateChannel(port, {
                            offsetPulses: Math.max(0, Math.trunc(Number(value) || 0)),
                          })
                        }
                        w={110}
                      />
                      {isRhythm && (
                        <NumberInput
                          size="xs"
                          label="Gate %"
                          aria-label={`Channel ${index + 1} gate percent`}
                          min={MIN_GATE_PERCENT}
                          max={MAX_GATE_PERCENT}
                          step={5}
                          value={channel.gatePercent}
                          onChange={(value) =>
                            updateChannel(port, {
                              gatePercent: Math.min(
                                MAX_GATE_PERCENT,
                                Math.max(
                                  MIN_GATE_PERCENT,
                                  Number(value) || defaultMixerChannelSettings.gatePercent
                                )
                              ),
                            })
                          }
                          w={90}
                        />
                      )}
                      {isRhythm && (
                        <SoundOverrideControl
                          label={`Channel ${index + 1}`}
                          set={settings.sounds.rhythm}
                          voiceIndex={index}
                          value={channel.sound}
                          onChange={(sound) => updateChannel(port, { sound })}
                        />
                      )}
                    </Group>
                    <Group gap="xs" wrap="nowrap" align="center">
                      <div style={{ flex: 1 }}>
                        <VolumeControl
                          accessibleLabel={`Channel ${index + 1} volume`}
                          label="Level"
                          value={channel.gainPercent}
                          onChange={(value) => updateChannel(port, { gainPercent: value })}
                        />
                      </div>
                      <Button
                        size="compact-sm"
                        variant={channel.muted ? 'filled' : 'default'}
                        aria-pressed={channel.muted}
                        aria-label={`Mute channel ${index + 1}`}
                        onClick={() => updateChannel(port, { muted: !channel.muted })}
                      >
                        M
                      </Button>
                      <Button
                        size="compact-sm"
                        variant={channel.solo ? 'filled' : 'default'}
                        aria-pressed={channel.solo}
                        aria-label={`Solo channel ${index + 1}`}
                        onClick={() => updateChannel(port, { solo: !channel.solo })}
                      >
                        S
                      </Button>
                    </Group>
                  </Stack>
                </Surface>
              );
            })}
            <Group>
              <Button size="compact-sm" variant="default" onClick={onAddChannel}>
                + Channel
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Changes to a source, loop, or offset apply the next time you press Play. Level, mute
              and solo are live.
            </Text>
          </Stack>
        </div>

        <Module
          name={instanceLabel}
          status={`${connected} of ${ports.length} playing`}
          onReset={resetMixer}
          footer={
            <Text size="xs" c="dimmed" truncate aria-live="polite">
              {preview.status || 'Plays at the transport tempo; levels stay live.'}
            </Text>
          }
        >
          <ModuleSection label="Mix">
            <Stack gap="xs">
              <VolumeControl
                accessibleLabel="Mixer master volume"
                label="Master"
                value={masterVolume}
                onChange={setMasterVolume}
              />
              <Group gap="xs" wrap="nowrap">
                <Button size="compact-sm" onClick={playMix}>
                  ▶ Play
                </Button>
                <Button size="compact-sm" variant="default" onClick={() => preview.stop()}>
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
