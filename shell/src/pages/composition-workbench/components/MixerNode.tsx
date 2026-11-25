import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Group, Stack, Text, Title } from '@mantine/core';
import {
  PianoRoll,
  defaultPianoRollView,
  type PianoRollViewState,
} from '../../../components/PianoRoll';
import { Surface } from '../../../components/Surface/Surface';
import { Button, NumberInput, SegmentedControl, Select, ActionIcon } from '../../../ui';
import { volumePercentToGain } from '../audio';
import { useAudioEngine } from '../audio/AudioEngineProvider';
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
import type { NodeRouteState } from '../compositionWorkspace';
import { foldIntoHistory } from '../history';
import { channelBusGains, compileMixerPlan, mixerRealignment, type MixerChannel } from '../mixer';
import {
  acceptsMixerChannels,
  DEFAULT_MIXER_GAIN_PERCENT,
  defaultMixerChannelSettings,
  describeChannelLength,
  isMixerSourceCandidate,
  loopPolicyOptions,
  MAX_GATE_PERCENT,
  MIN_GATE_PERCENT,
  mixerChannelColor,
  mixerChannelMaterial,
  type MixerChannelMaterial,
  type MixerChannelSettings,
  type MixerChannelsState,
} from '../mixerChannels';
import {
  cycleProgress,
  channelPlayhead,
  channelRollView,
  mixerChannelRoll,
  mixerRoll,
  mixerRollGrid,
} from '../mixerRoll';
import { pulsesToMusicalDuration, rationalToNumber } from '../musicalTime';
import { transportRhythmContext } from '../rhythmRealization';
import { signalTypeRegistry } from '../signalTypes';
import { layerSound } from '../sounds';
import { parseMeter } from '../transport';
import { useNodePreview } from '../useNodePreview';
import {
  acceptsFiniteNumber,
  compositionInstanceStateKey,
  compositionStateKeys,
  usePersistentState,
} from '../usePersistentState';
import { CycleProgressBar } from './CycleProgressBar';
import { NodeShell, NodeSection } from './NodeShell';
import { SoundOverrideControl } from './SoundControls';
import { SourceMenu } from './SourceMenu';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

interface MixerNodeProps {
  instanceId: string;
  instanceLabel: string;
  outputs: PublishedCompositionOutput[];
  /** The receiver's route state: its keys are the channels, in order. */
  routeState: NodeRouteState;
  onBind(port: string, source: CompositionOutputRef | null): void;
  onAddChannel(): void;
  onRemoveChannel(port: string): void;
}

// A stable number per packet object, so the heavy work below re-runs when a source actually
// changes and not on every render (the workbench page rebuilds its outputs array each time).
const packetIds = new WeakMap<object, number>();
let nextPacketId = 1;
function packetKey(packet: object | undefined) {
  if (!packet) {
    return 0;
  }
  let id = packetIds.get(packet);
  if (!id) {
    id = nextPacketId;
    nextPacketId += 1;
    packetIds.set(packet, id);
  }
  return id;
}

function acceptsRollView(value: unknown): value is PianoRollViewState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as PianoRollViewState;
  return (
    Number.isFinite(candidate.pixelsPerQuarter) &&
    Number.isFinite(candidate.pixelsPerSemitone) &&
    Number.isFinite(candidate.scrollLeft) &&
    Number.isFinite(candidate.scrollTop) &&
    typeof candidate.followPlayback === 'boolean' &&
    typeof candidate.framed === 'boolean'
  );
}

export function MixerNode({
  instanceId,
  instanceLabel,
  outputs,
  routeState,
  onBind,
  onAddChannel,
  onRemoveChannel,
}: MixerNodeProps) {
  const { settings } = useCompositionSettings();
  const engine = useAudioEngine();
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId);
  const [channelState, setChannelState] = usePersistentState<MixerChannelsState>(
    stateKey(compositionStateKeys.mixerChannels),
    {},
    acceptsMixerChannels
  );
  const [masterVolume, setMasterVolume] = usePersistentState(
    stateKey(compositionStateKeys.mixerVolume),
    DEFAULT_MIXER_GAIN_PERCENT,
    acceptsFiniteNumber
  );
  const [rollView, setRollView] = usePersistentState<PianoRollViewState>(
    stateKey(compositionStateKeys.mixerRollView),
    defaultPianoRollView,
    acceptsRollView
  );
  const [rollMode, setRollMode] = usePersistentState<'composite' | 'channels'>(
    stateKey(compositionStateKeys.mixerRollMode),
    'composite',
    (value): value is 'composite' | 'channels' => value === 'composite' || value === 'channels'
  );
  // The channel rolls' shared time scale in pixels per quarter note; null fits the longest cycle.
  const [channelScale, setChannelScale] = usePersistentState<number | null>(
    stateKey(compositionStateKeys.mixerChannelScale),
    null,
    (value): value is number | null =>
      value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0)
  );
  const [playhead, setPlayhead] = useState(0);
  // Quarter notes since the material began, not wrapped: counts cycles and passes.
  const [elapsed, setElapsed] = useState(0);
  const playedPass = useRef(1);
  const channelRollsRef = useRef<HTMLDivElement>(null);
  const [channelRollsWidth, setChannelRollsWidth] = useState(0);

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

  // A removed channel takes its settings with it. Folded into the removal's undo step, so undoing
  // it brings the channel's settings back too.
  const portKey = ports.join('|');
  useEffect(() => {
    foldIntoHistory(() =>
      setChannelState((current) => {
        const stale = Object.keys(current).filter((port) => !ports.includes(port));
        if (!stale.length) {
          return current;
        }
        return Object.fromEntries(Object.entries(current).filter(([port]) => ports.includes(port)));
      })
    );
    // `ports` is derived from portKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portKey, setChannelState]);

  const { pulseUnit, timeline } = transportRhythmContext(settings.transport);
  const pulseQuarters = rationalToNumber(pulseUnit.quarterNotes);
  const { numerator: meterNumerator, denominator: meterDenominator } = parseMeter(
    settings.transport.meter
  );
  const barQuarters = (4 * meterNumerator) / meterDenominator;

  // Everything that depends on what the sources are, not on levels: each channel's material, the
  // compiled plan, and the realignment period. Levels, mute and solo never re-run it.
  const signature = [
    ports
      .map((port) => {
        const binding = routeState[port];
        const channel = settingsFor(port);
        return [
          port,
          packetKey(boundOutput(outputs, binding?.source)?.packet),
          binding?.source?.index ?? '',
          binding?.signalType ?? '',
          JSON.stringify(binding?.treatment ?? null),
          channel.loop,
          channel.offsetPulses,
          channel.gatePercent,
          JSON.stringify(channel.sound),
        ].join('~');
      })
      .join('||'),
    settings.transport.pulse,
    settings.transport.tempo,
    settings.transport.meter,
    settings.edo,
    JSON.stringify(settings.sounds.rhythm),
  ].join('|||');

  const mix = useMemo(() => {
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
      return { port, index, binding, material };
    });
    const mixerChannels: MixerChannel[] = channels.flatMap(({ port, material }) =>
      material.status === 'ready'
        ? [
            {
              config: {
                id: port,
                loop: settingsFor(port).loop,
                offset: pulsesToMusicalDuration(settingsFor(port).offsetPulses, pulseUnit),
                gainPercent: 100,
                muted: false,
                solo: false,
              },
              material: material.material,
            },
          ]
        : []
    );
    const compiled = mixerChannels.length
      ? compileMixerPlan({ sourceId: instanceId, timeline, channels: mixerChannels })
      : undefined;
    return { channels, mixerChannels, compiled, realignment: mixerRealignment(mixerChannels) };
    // Keyed by `signature`, which covers every input read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const roll = useMemo(
    () => mixerRoll(mix.compiled?.plan, instanceId, ports),
    [mix, instanceId, portKey]
  );
  const rollGrid = useMemo(
    () => mixerRollGrid(roll.duration, meterNumerator, meterDenominator),
    [roll.duration, meterNumerator, meterDenominator]
  );
  // A new mix refits the roll as soon as it is visible; zooming or scrolling sticks until then.
  useEffect(() => {
    setRollView((view) => (view.framed ? { ...view, framed: false } : view));
  }, [mix, setRollView]);

  // The channels realign later than the horizon, so the plan is only the start of the pattern.
  const truncated = Boolean(mix.compiled?.truncated);
  const previewBars = Math.round(roll.duration / barQuarters);
  const realignmentLength = mix.realignment
    ? describeChannelLength(
        rationalToNumber(mix.realignment.quarterNotes),
        pulseQuarters,
        barQuarters
      )
    : '';
  const realignmentText = mix.realignment
    ? `Realigns every ${realignmentLength}${truncated ? ` (beyond the ${previewBars}-bar preview)` : ''}`
    : mix.mixerChannels.some((channel) => channel.config.loop !== 'once')
      ? 'No realignment period within reach'
      : '';

  const masterGain = volumePercentToGain(masterVolume);
  const preview = useNodePreview({
    instanceId,
    volume: masterVolume,
    followTransport: true,
    busGains: channelBusGains(
      instanceId,
      ports.map((port) => ({
        ...settingsFor(port),
        id: port,
        offset: pulsesToMusicalDuration(0, pulseUnit),
      })),
      (percent) => volumePercentToGain(percent) * masterGain
    ),
    transportPlay: playMix,
  });

  // Each ready channel's own cycle, drawn on one shared time scale so a short cycle is visibly
  // shorter than a long one, as clips of different lengths are in a clip launcher.
  const channelRolls = useMemo(
    () =>
      mix.channels.flatMap(({ port, index, material }) => {
        if (material.status !== 'ready') {
          return [];
        }
        const channel = settingsFor(port);
        const offset = pulsesToMusicalDuration(channel.offsetPulses, pulseUnit);
        return [
          {
            port,
            index,
            channel,
            period: rationalToNumber(material.material.period.quarterNotes),
            offset: rationalToNumber(offset.quarterNotes),
            ...mixerChannelRoll(material.material, { loop: channel.loop, offset }, index),
          },
        ];
      }),
    // `settingsFor` and `pulseUnit` are covered by `mix`'s signature and the channel settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mix, channelState, pulseUnit]
  );
  const longestLoop = Math.max(
    1,
    ...channelRolls
      .filter((channelRoll) => channelRoll.channel.loop !== 'once')
      .map((channelRoll) => channelRoll.period)
  );
  const longestChannelRoll = Math.max(
    1,
    ...channelRolls.map((channelRoll) => channelRoll.duration)
  );
  const CHANNEL_ROLL_KEYBOARD_WIDTH = 72;
  const autoChannelScale = Math.min(
    192,
    Math.max(
      4,
      ((channelRollsWidth || 720) - CHANNEL_ROLL_KEYBOARD_WIDTH - 24) / longestChannelRoll
    )
  );
  const sharedScale = channelScale ?? autoChannelScale;
  const CHANNEL_ROLL_HEIGHT = 140;
  // How far a channel is through the whole pass, from one sync point to the next.
  const progressFor = (channelRoll: (typeof channelRolls)[number]) =>
    mix.compiled?.plan
      ? cycleProgress(
          preview.playing ? playhead : 0,
          roll.duration,
          { loop: channelRoll.channel.loop, period: channelRoll.period },
          longestLoop
        )
      : undefined;

  useEffect(() => {
    const element = channelRollsRef.current;
    if (!element || rollMode !== 'channels') {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setChannelRollsWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [rollMode]);

  // The playhead follows the engine's clock, wrapping at the pass length while the mix loops, so
  // every channel's hits line up against the same moving line.
  useEffect(() => {
    if (!preview.playing) {
      setPlayhead(0);
      setElapsed(0);
      return;
    }
    const quartersPerSecond = settings.transport.tempo / 60;
    let frame = 0;
    const tick = () => {
      const clock = engine.clock(instanceId);
      if (clock) {
        const quarters = Math.max(
          0,
          ((performance.now() - clock.startedAtMs) / 1000) * quartersPerSecond
        );
        const pass = clock.loopSeconds ? clock.loopSeconds * quartersPerSecond : playedPass.current;
        setPlayhead(clock.loopSeconds ? quarters % pass : Math.min(quarters, pass));
        setElapsed(quarters);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, instanceId, preview.playing, settings.transport.tempo]);

  function playMix() {
    const result = mix.compiled;
    if (!result?.plan) {
      preview.setStatus(result?.warnings.join(' ') || 'Connect at least one playable source.');
      return;
    }
    playedPass.current = rationalToNumber(result.plan.duration.quarterNotes);
    const notes = result.warnings.length ? ` ${result.warnings[0]}` : '';
    void preview.play(
      result.plan,
      `Playing ${mix.mixerChannels.length} ${mix.mixerChannels.length === 1 ? 'channel' : 'channels'}${
        result.loopable ? ', looping' : ''
      }.${notes}`,
      { loop: result.loopable }
    );
  }

  function resetMixer() {
    preview.stop('');
    setChannelState({});
    setMasterVolume(60);
    setRollView(defaultPianoRollView);
    preview.setStatus('Mixer reset. Channel sources stay connected.');
  }

  const connected = mix.channels.filter(({ material }) => material.status === 'ready').length;

  function channelStatus(material: MixerChannelMaterial) {
    if (material.status === 'empty') {
      return 'No source';
    }
    if (material.status === 'error') {
      return material.message;
    }
    const count = material.material.events.length;
    const length = describeChannelLength(
      rationalToNumber(material.material.period.quarterNotes),
      pulseQuarters,
      barQuarters
    );
    return `${material.source === 'notes' ? 'Notes' : 'Rhythm'} | ${count} ${count === 1 ? 'event' : 'events'} | ${length}`;
  }

  const options = compositionOutputOptions(outputs, instanceId, isMixerSourceCandidate, {
    allowRestsAndTies: true,
  });

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
            <div>
              <Group justify="space-between" mb="xs" wrap="wrap" gap="xs">
                <SegmentedControl
                  aria-label="Roll view"
                  value={rollMode}
                  onChange={(value) => setRollMode(value as 'composite' | 'channels')}
                  data={[
                    { value: 'composite', label: 'Composite' },
                    { value: 'channels', label: 'Per channel' },
                  ]}
                />
                {rollMode === 'channels' && (
                  <Group gap={4} wrap="nowrap">
                    <Text c="dimmed">Shared time scale</Text>
                    <ActionIcon
                      size="sm"
                      variant="default"
                      aria-label="Zoom channels out"
                      onClick={() => setChannelScale(Math.max(2, sharedScale * 0.8))}
                    >
                      −
                    </ActionIcon>
                    <ActionIcon
                      size="sm"
                      variant="default"
                      aria-label="Zoom channels in"
                      onClick={() => setChannelScale(Math.min(256, sharedScale * 1.25))}
                    >
                      +
                    </ActionIcon>
                    <Button
                      variant="subtle"
                      disabled={channelScale === null}
                      onClick={() => setChannelScale(null)}
                    >
                      Fit longest
                    </Button>
                  </Group>
                )}
                {preview.playing && mix.compiled?.loopable && (
                  <Text c="dimmed" aria-live="off">
                    Pass {Math.floor(elapsed / Math.max(1e-9, playedPass.current)) + 1}
                  </Text>
                )}
              </Group>
              {truncated && (
                <Alert color="yellow" variant="light" p="xs" mb="xs" title="Preview only">
                  <Text>
                    {mix.realignment
                      ? `These channels realign every ${realignmentLength}, beyond the ${previewBars}-bar limit.`
                      : 'The realignment period of these channels is too large to compute.'}{' '}
                    The first {previewBars} bars play once and do not loop, and the progress bars
                    measure progress through this preview, not toward the true sync.
                  </Text>
                </Alert>
              )}
              {rollMode === 'composite' ? (
                <PianoRoll
                  ariaLabel="Mixer composite roll"
                  notes={roll.notes}
                  duration={roll.duration}
                  gridLines={rollGrid}
                  view={rollView}
                  onViewChange={setRollView}
                  playhead={playhead}
                  isPlaying={preview.playing}
                  height={320}
                />
              ) : (
                <div ref={channelRollsRef}>
                  <Stack gap="xs">
                    {channelRolls.map((channelRoll) => {
                      const progress = progressFor(channelRoll);
                      const unit = channelRoll.channel.loop === 'free' ? 'cycle' : 'restart';
                      const cycle = progress
                        ? preview.playing
                          ? ` · ${unit} ${progress.current} of ${progress.cycles}${truncated ? ' (preview)' : ''}`
                          : ` · ${progress.cycles} ${progress.cycles === 1 ? unit : `${unit}s`} ${
                              truncated ? 'in the preview' : 'per pass'
                            }`
                        : '';
                      const loopLabel =
                        loopPolicyOptions.find(
                          (option) => option.value === channelRoll.channel.loop
                        )?.label ?? channelRoll.channel.loop;
                      return (
                        <div key={channelRoll.port}>
                          <Group gap="xs" mb={2} wrap="nowrap">
                            <span
                              aria-hidden="true"
                              style={{
                                background: mixerChannelColor(channelRoll.index),
                                borderRadius: 2,
                                flex: 'none',
                                height: 10,
                                width: 10,
                              }}
                            />
                            <Text fw={700}>Ch {channelRoll.index + 1}</Text>
                            <Text c="dimmed">
                              {describeChannelLength(
                                channelRoll.period,
                                pulseQuarters,
                                barQuarters
                              )}{' '}
                              · {loopLabel}
                              {cycle}
                            </Text>
                          </Group>
                          {progress && (
                            <div style={{ marginBottom: 4 }}>
                              <CycleProgressBar
                                progress={progress}
                                color={mixerChannelColor(channelRoll.index)}
                                unit={unit}
                                ariaLabel={`Channel ${channelRoll.index + 1} progress to realignment`}
                              />
                            </div>
                          )}
                          <PianoRoll
                            ariaLabel={`Channel ${channelRoll.index + 1} cycle`}
                            notes={channelRoll.notes}
                            duration={channelRoll.duration}
                            gridLines={mixerRollGrid(
                              channelRoll.duration,
                              meterNumerator,
                              meterDenominator
                            )}
                            view={channelRollView(
                              channelRoll.notes,
                              sharedScale,
                              CHANNEL_ROLL_HEIGHT
                            )}
                            onViewChange={() => undefined}
                            playhead={
                              preview.playing
                                ? channelPlayhead(
                                    playhead,
                                    {
                                      loop: channelRoll.channel.loop,
                                      period: channelRoll.period,
                                      offset: channelRoll.offset,
                                    },
                                    longestLoop
                                  )
                                : 0
                            }
                            isPlaying={preview.playing}
                            height={CHANNEL_ROLL_HEIGHT}
                            showToolbar={false}
                          />
                        </div>
                      );
                    })}
                  </Stack>
                </div>
              )}
              {rollMode === 'composite' && roll.total > roll.notes.length && (
                <Text c="dimmed" mt={4}>
                  Showing the first {roll.notes.length} of {roll.total} events.
                </Text>
              )}
              {!channelRolls.length && rollMode === 'channels' && (
                <Text c="dimmed" mt={4}>
                  Connect a source to a channel to see its cycle.
                </Text>
              )}
              {rollMode === 'composite' && !mix.compiled?.plan && (
                <Text c="dimmed" mt={4}>
                  Connect a source to a channel to see every channel together.
                </Text>
              )}
            </div>
            {mix.channels.map(({ port, index, binding, material }) => {
              const channel = settingsFor(port);
              const isRhythm = material.status === 'ready' && material.source === 'rhythm';
              // In the per-channel view the bar sits on each channel roll instead.
              const stripChannelRoll =
                rollMode === 'composite'
                  ? channelRolls.find((channelRoll) => channelRoll.port === port)
                  : undefined;
              const stripProgress = stripChannelRoll ? progressFor(stripChannelRoll) : undefined;
              return (
                <Surface key={port} p="sm" aria-label={`Channel ${index + 1}`}>
                  <Stack gap="xs">
                    {stripProgress && (
                      <CycleProgressBar
                        progress={stripProgress}
                        color={mixerChannelColor(index)}
                        unit={channel.loop === 'free' ? 'cycle' : 'restart'}
                        ariaLabel={`Channel ${index + 1} progress to realignment`}
                      />
                    )}
                    <Group justify="space-between" wrap="nowrap" align="start">
                      <Group gap="xs" wrap="nowrap" align="start">
                        <span
                          aria-hidden="true"
                          style={{
                            background: mixerChannelColor(index),
                            borderRadius: 2,
                            flex: 'none',
                            height: 14,
                            marginTop: 2,
                            width: 14,
                          }}
                        />
                        <Text fw={700} size="sm">
                          Ch {index + 1}
                        </Text>
                        <Text
                          c={material.status === 'error' ? 'red' : 'dimmed'}
                          aria-live="polite"
                          style={{ paddingTop: 2 }}
                        >
                          {channelStatus(material)}
                        </Text>
                      </Group>
                      <Button
                        variant="subtle"
                        color="gray"
                        disabled={ports.length <= 1}
                        aria-label={`Remove channel ${index + 1}`}
                        onClick={() => onRemoveChannel(port)}
                      >
                        Remove
                      </Button>
                    </Group>
                    <SourceMenu
                      label="Source"
                      placeholder="Connect notes or a rhythm"
                      options={options}
                      value={binding?.source ? outputRefKey(binding.source) : null}
                      onChange={(value) => onBind(port, value ? parseOutputRef(value) : null)}
                    />
                    <Group gap="sm" align="end" wrap="wrap">
                      <Select
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
                          decibels
                          value={channel.gainPercent}
                          onChange={(value) => updateChannel(port, { gainPercent: value })}
                        />
                      </div>
                      <Button
                        variant={channel.muted ? 'filled' : 'default'}
                        aria-pressed={channel.muted}
                        aria-label={`Mute channel ${index + 1}`}
                        onClick={() => updateChannel(port, { muted: !channel.muted })}
                      >
                        M
                      </Button>
                      <Button
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
              <Button variant="default" onClick={onAddChannel}>
                + Channel
              </Button>
            </Group>
            <Text c="dimmed">
              Changes to a source, loop, or offset apply the next time you press Play. Level, mute
              and solo are live.
            </Text>
          </Stack>
        </div>

        <NodeShell
          name={instanceLabel}
          status={`${connected} of ${ports.length} playing`}
          onReset={resetMixer}
          footer={
            <Text c="dimmed" truncate aria-live="polite">
              {preview.status || 'Plays at the transport tempo; levels stay live.'}
            </Text>
          }
        >
          <NodeSection label="Mix">
            <Stack gap="xs">
              <VolumeControl
                accessibleLabel="Mixer master volume"
                label="Master"
                decibels
                value={masterVolume}
                onChange={setMasterVolume}
              />
              <Group gap="xs" wrap="nowrap">
                <Button onClick={playMix}>▶ Play</Button>
                <Button variant="default" onClick={() => preview.stop()}>
                  ■ Stop
                </Button>
              </Group>
            </Stack>
          </NodeSection>
        </NodeShell>
      </div>
    </Surface>
  );
}
