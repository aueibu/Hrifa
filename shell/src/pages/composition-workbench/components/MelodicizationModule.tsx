import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Collapse,
  Group,
  NumberInput,
  Select,
  Slider,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  defaultPianoRollView,
  PianoRoll,
  type PianoRollGridLine,
  type PianoRollViewState,
} from '../../../components/PianoRoll';
import { Surface } from '../../../components/Surface/Surface';
import { volumePercentToGain } from '../audio';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { createNotePacketPerformancePlan } from '../audio/performancePlans';
import type { PlaybackSession } from '../audio/types';
import {
  outputRefKey,
  parseOutputRef,
  type CompositionModuleRoutingProps,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';
import type { ModuleRouteState } from '../compositionWorkspace';
import { melodicizationPulseOptions, melodicize, type PitchAllocation } from '../melodicization';
import type { DataPacket } from '../model';
import {
  defaultMusicalTimeline,
  formatBarBeatTickPercent,
  musicalPosition,
  rationalToNumber,
  type MusicalDuration,
  type MusicalTimeline,
} from '../musicalTime';
import { signalTypeRegistry } from '../signalTypes';
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

type InputPort = 'rhythm' | 'pitches';

export interface MelodicizationModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
  outputs: PublishedCompositionOutput[];
  routeState: ModuleRouteState;
  onBind(port: InputPort, source: CompositionOutputRef | null): void;
}

const allocationOptions = [
  { value: 'cycle', label: 'Cycle pitches across attacks' },
  { value: 'cycle-rhythm', label: 'Cycle attacks across pitches' },
  { value: 'zip', label: 'Zip and stop at the shorter input' },
  { value: 'cartesian', label: 'Every pitch at every attack' },
];

const meterOptions = [
  { value: '4/4', label: '4/4' },
  { value: '3/4', label: '3/4' },
  { value: '5/4', label: '5/4' },
  { value: '7/8', label: '7/8' },
];

function rationalLabel(duration: MusicalDuration) {
  const { numerator, denominator } = duration.quarterNotes;
  return denominator === 1 ? `${numerator} qn` : `${numerator}/${denominator} qn`;
}

function compatibleRhythm(output: PublishedCompositionOutput) {
  return (
    output.packet.kind === 'list' &&
    output.packet.domain === 'duration' &&
    output.packet.role === 'interOnset'
  );
}

// Any outlet can be wired to any inlet — Melodicization errors on its own if what arrives still
// isn't concrete pitch material once routed through Quick Adjust. Plain numeric domains (e.g.
// Arithmetic's `integer` output) are offered here too, since the Pitch Quick Adjust panel now
// offers an explicit "Read as MIDI notes" conversion for exactly that case; `note` is excluded
// since its items are full event objects, not something Quick Adjust knows how to interpret.
const numericPitchCandidateDomains = new Set([
  'integer',
  'rational',
  'duration',
  'onset',
  'interval',
  'cycleLength',
  'pulseCount',
  'phaseOffset',
]);

function compatiblePitches(output: PublishedCompositionOutput) {
  return (
    output.packet.kind === 'list' &&
    (output.packet.domain === 'pitch' ||
      output.packet.domain === 'pitchClass' ||
      numericPitchCandidateDomains.has(output.packet.domain))
  );
}

export function MelodicizationModule({
  instanceId,
  instanceLabel,
  outputs,
  routeState,
  onBind,
  onOutputsChange,
}: MelodicizationModuleProps) {
  const bindingRhythm = routeState.rhythm;
  const bindingPitches = routeState.pitches;
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'melodicization');
  const [allocation, setAllocation] = usePersistentState<PitchAllocation>(
    stateKey(compositionStateKeys.melodicizationAllocation),
    'cycle',
    (value): value is PitchAllocation =>
      value === 'cycle' || value === 'cycle-rhythm' || value === 'zip' || value === 'cartesian'
  );
  const [pulseValue, setPulseValue] = usePersistentState(
    stateKey(compositionStateKeys.melodicizationPulse),
    '1/4',
    acceptsString
  );
  const [articulationPercent, setArticulationPercent] = usePersistentState(
    stateKey(compositionStateKeys.melodicizationArticulation),
    100,
    acceptsFiniteNumber
  );
  const [tempo, setTempo] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.melodicizationTempo),
    120,
    acceptsNumberOrString
  );
  const [meter, setMeter] = usePersistentState(
    stateKey(compositionStateKeys.melodicizationMeter),
    '4/4',
    acceptsString
  );
  const [volume, setVolume] = usePersistentState(
    stateKey(compositionStateKeys.melodicizationVolume),
    30,
    acceptsFiniteNumber
  );
  const [pianoRollView, setPianoRollView] = usePersistentState<PianoRollViewState>(
    stateKey(compositionStateKeys.melodicizationPianoRollView),
    defaultPianoRollView,
    (value): value is PianoRollViewState => {
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
  );
  const [inspectorExpanded, setInspectorExpanded] = usePersistentState(
    stateKey(compositionStateKeys.melodicizationInspector),
    false,
    acceptsBoolean
  );
  const [audioStatus, setAudioStatus] = useState('');
  const [playheadQuarterNotes, setPlayheadQuarterNotes] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const audioEngine = useAudioEngine();
  const playbackSession = useRef<PlaybackSession | null>(null);
  const playRequestVersion = useRef(0);
  const playheadFrame = useRef<number | null>(null);

  const outputMap = useMemo(
    () => new Map(outputs.map((output) => [outputRefKey(output.ref), output])),
    [outputs]
  );
  const rhythmOutput = bindingRhythm?.source
    ? outputMap.get(outputRefKey(bindingRhythm.source))
    : undefined;
  const pitchOutput = bindingPitches?.source
    ? outputMap.get(outputRefKey(bindingPitches.source))
    : undefined;
  const treatedRhythm = useMemo(
    () =>
      bindingRhythm
        ? signalTypeRegistry[bindingRhythm.signalType].apply(
            rhythmOutput?.packet,
            bindingRhythm.treatment,
            `route:${instanceId}:rhythm`
          )
        : undefined,
    [bindingRhythm, rhythmOutput?.packet, instanceId]
  );
  const treatedPitches = useMemo(
    () =>
      bindingPitches
        ? signalTypeRegistry[bindingPitches.signalType].apply(
            pitchOutput?.packet,
            bindingPitches.treatment,
            `route:${instanceId}:pitches`
          )
        : undefined,
    [bindingPitches, pitchOutput?.packet, instanceId]
  );
  const pulseUnit =
    melodicizationPulseOptions.find((option) => option.value === pulseValue)?.duration ??
    melodicizationPulseOptions[2].duration;
  const result = useMemo(
    () =>
      melodicize({
        instanceId,
        rhythm: treatedRhythm,
        pitches: treatedPitches,
        allocation,
        pulseUnit,
        articulationPercent,
      }),
    [allocation, articulationPercent, instanceId, pulseUnit, treatedPitches, treatedRhythm]
  );
  const [meterNumerator, meterDenominator] = meter.split('/').map(Number);
  const timeline = useMemo<MusicalTimeline>(
    () => ({
      ...defaultMusicalTimeline,
      id: `melodicization:${tempo}:${meter}`,
      tempoMap: [{ at: musicalPosition(0), bpm: Number(tempo) }],
      meterMap: [{ atBar: 1, numerator: meterNumerator, denominator: meterDenominator }],
    }),
    [meter, meterDenominator, meterNumerator, tempo]
  );
  const publishedOutput = useMemo<PublishedCompositionOutput>(
    () => ({
      ref: { instanceId, port: 'notes' },
      label: `${instanceLabel} · Notes`,
      packet: result.packet,
    }),
    [instanceId, instanceLabel, result.packet]
  );
  const pianoRollNotes = useMemo(
    () =>
      result.packet.items.flatMap((item) =>
        item.value.pitches.map((pitch, pitchIndex) => ({
          id: `${item.id}:pitch:${pitchIndex}`,
          start: rationalToNumber(item.value.onset.quarterNotes),
          duration: rationalToNumber(item.value.duration.quarterNotes),
          pitchMidicents: pitch.midicents,
          label: pitch.label,
          velocity: item.value.velocity,
        }))
      ),
    [result.packet.items]
  );
  const pianoRollDuration = useMemo(
    () =>
      Math.max(
        result.packet.frame?.musicalExtent
          ? rationalToNumber(result.packet.frame.musicalExtent.quarterNotes)
          : 0,
        ...pianoRollNotes.map((note) => note.start + note.duration),
        1
      ),
    [pianoRollNotes, result.packet.frame?.musicalExtent]
  );
  const pianoRollGrid = useMemo<PianoRollGridLine[]>(() => {
    const beatLength = 4 / meterDenominator;
    const barLength = meterNumerator * beatLength;
    const lines: PianoRollGridLine[] = [];
    let bar = 1;
    for (let barStart = 0; barStart <= pianoRollDuration; barStart += barLength) {
      lines.push({ at: barStart, kind: 'bar', label: String(bar) });
      for (let beat = 1; beat < meterNumerator; beat += 1) {
        const at = barStart + beat * beatLength;
        if (at <= pianoRollDuration) {
          lines.push({ at, kind: 'beat' });
        }
      }
      bar += 1;
    }
    return lines;
  }, [meterDenominator, meterNumerator, pianoRollDuration]);

  useEffect(() => {
    onOutputsChange?.(instanceId, [publishedOutput]);
  }, [instanceId, onOutputsChange, publishedOutput]);

  useEffect(
    () => () => {
      playRequestVersion.current += 1;
      playbackSession.current?.stop();
      playbackSession.current = null;
      if (playheadFrame.current !== null) {
        cancelAnimationFrame(playheadFrame.current);
      }
    },
    []
  );

  useEffect(() => {
    playbackSession.current?.setBusGain('preview', volumePercentToGain(volume));
  }, [volume]);

  function stopPreview(message = 'Preview stopped.') {
    playRequestVersion.current += 1;
    playbackSession.current?.stop();
    playbackSession.current = null;
    if (playheadFrame.current !== null) {
      cancelAnimationFrame(playheadFrame.current);
      playheadFrame.current = null;
    }
    setPlayheadQuarterNotes(0);
    setPreviewPlaying(false);
    setAudioStatus(message);
  }

  function startPlayhead(bpm: number) {
    if (playheadFrame.current !== null) {
      cancelAnimationFrame(playheadFrame.current);
    }
    const startsAt = performance.now() + 60;
    const draw = (now: number) => {
      const position = Math.max(0, ((now - startsAt) / 1000) * (bpm / 60));
      setPlayheadQuarterNotes(Math.min(pianoRollDuration, position));
      if (position < pianoRollDuration) {
        playheadFrame.current = requestAnimationFrame(draw);
      } else {
        playheadFrame.current = null;
      }
    };
    playheadFrame.current = requestAnimationFrame(draw);
  }

  async function playPreview() {
    if (result.errors.length || !result.packet.items.length) {
      setAudioStatus('Connect valid rhythm and pitch material before previewing.');
      return;
    }
    if (!Number.isFinite(Number(tempo)) || Number(tempo) <= 0) {
      setAudioStatus('Preview tempo must be a positive number.');
      return;
    }
    stopPreview('');
    const requestVersion = playRequestVersion.current;
    try {
      const plan = createNotePacketPerformancePlan({
        sourceId: instanceId,
        packet: result.packet,
        timeline,
      });
      const session = await audioEngine.play({
        plan,
        busGains: { preview: volumePercentToGain(volume) },
        onComplete: () => {
          playbackSession.current = null;
          if (playheadFrame.current !== null) {
            cancelAnimationFrame(playheadFrame.current);
            playheadFrame.current = null;
          }
          setPlayheadQuarterNotes(pianoRollDuration);
          setPreviewPlaying(false);
          setAudioStatus('Preview complete.');
        },
      });
      if (requestVersion !== playRequestVersion.current) {
        session.stop();
        return;
      }
      playbackSession.current = session;
      startPlayhead(Number(tempo));
      setPreviewPlaying(true);
      setAudioStatus(
        `Playing ${result.packet.items.length} events and ${pianoRollNotes.length} notes at ${Number(tempo)} BPM on the musical transport.`
      );
    } catch (error) {
      setAudioStatus(error instanceof Error ? error.message : 'Audio preview could not start.');
    }
  }

  function resetMelodicization() {
    stopPreview('');
    setAllocation('cycle');
    setPulseValue('1/4');
    setArticulationPercent(100);
    setTempo(120);
    setMeter('4/4');
    setVolume(30);
    setPianoRollView(defaultPianoRollView);
    setInspectorExpanded(false);
    setAudioStatus('Melodicization module reset.');
  }

  const rhythmOptions: { value: string; label: string; disabled?: boolean }[] = outputs
    .filter(compatibleRhythm)
    .map((output) => ({
      value: outputRefKey(output.ref),
      label: output.label,
    }));
  const pitchOptions: { value: string; label: string; disabled?: boolean }[] = outputs
    .filter(compatiblePitches)
    .map((output) => ({
      value: outputRefKey(output.ref),
      label: output.label,
    }));
  const missingRhythmBinding = Boolean(bindingRhythm?.source && !rhythmOutput);
  const missingPitchBinding = Boolean(bindingPitches?.source && !pitchOutput);
  if (bindingRhythm?.source && missingRhythmBinding) {
    rhythmOptions.push({
      value: outputRefKey(bindingRhythm.source),
      label: `Missing source · ${bindingRhythm.source.port}`,
      disabled: true,
    });
  }
  if (bindingPitches?.source && missingPitchBinding) {
    pitchOptions.push({
      value: outputRefKey(bindingPitches.source),
      label: `Missing source · ${bindingPitches.source.port}`,
      disabled: true,
    });
  }
  const visibleNotes = result.packet.items.slice(0, 128);

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
                Rhythm as temporal spine; pitch allocation remains explicit.
              </Text>
            </div>
            <Group gap="xs">
              <Badge variant="outline">{result.packet.items.length} events</Badge>
              <Badge variant="outline">{pianoRollNotes.length} notes</Badge>
              <Badge variant="outline">{allocation}</Badge>
            </Group>
          </Group>

          {result.errors.length > 0 ? (
            <Alert color="yellow" title="Melodicization needs material">
              {result.errors.join(' ')}
            </Alert>
          ) : (
            <Stack gap="md">
              {result.messages.length > 0 && (
                <Alert color="yellow" title="Allocation report">
                  {result.messages.join(' ')}
                </Alert>
              )}
              <PianoRoll
                ariaLabel="Melodicization piano roll"
                notes={pianoRollNotes}
                duration={pianoRollDuration}
                gridLines={pianoRollGrid}
                view={pianoRollView}
                onViewChange={setPianoRollView}
                playhead={playheadQuarterNotes}
                isPlaying={previewPlaying}
              />
              <div>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => setInspectorExpanded((current) => !current)}
                >
                  {inspectorExpanded ? 'Hide event table' : 'Show event table'}
                </Button>
                <Collapse expanded={inspectorExpanded}>
                  <Table.ScrollContainer minWidth={640} maxHeight={420} mt="xs">
                    <Table striped highlightOnHover withRowBorders>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>#</Table.Th>
                          <Table.Th>Position</Table.Th>
                          <Table.Th>Pitch</Table.Th>
                          <Table.Th>Inter-onset</Table.Th>
                          <Table.Th>Duration</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {visibleNotes.map((item, index) => (
                          <Table.Tr key={item.id}>
                            <Table.Td>{index + 1}</Table.Td>
                            <Table.Td ff="monospace">
                              {formatBarBeatTickPercent(item.value.onset, timeline)}
                            </Table.Td>
                            <Table.Td>
                              {item.value.pitches.length > 1
                                ? `[${item.value.pitches.map((pitch) => pitch.label).join(' ')}]`
                                : item.value.pitches[0]?.label}
                            </Table.Td>
                            <Table.Td ff="monospace">
                              {rationalLabel(item.value.interOnset)}
                            </Table.Td>
                            <Table.Td ff="monospace">{rationalLabel(item.value.duration)}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                  {result.packet.items.length > visibleNotes.length && (
                    <Text size="xs" c="dimmed" mt="xs">
                      Showing the first {visibleNotes.length} of {result.packet.items.length}{' '}
                      events.
                    </Text>
                  )}
                </Collapse>
              </div>
            </Stack>
          )}
        </div>

        <Module
          name={instanceLabel}
          status={
            result.errors.length
              ? 'Needs inputs'
              : `${result.packet.items.length} events · ${pianoRollNotes.length} notes`
          }
          onReset={resetMelodicization}
          output={<ModuleOutput name="Notes" packet={result.packet} />}
          footer={
            <Text size="xs" c="dimmed" truncate aria-live="polite">
              {audioStatus ||
                'Note events retain musical time; preview tempo does not rewrite them.'}
            </Text>
          }
        >
          <ModuleSection label="Inputs" grow>
            <Stack gap="xs">
              <Select
                size="xs"
                label="Rhythm source"
                placeholder="Connect inter-onset durations"
                clearable
                data={rhythmOptions}
                error={
                  missingRhythmBinding ? 'Connected source is no longer available.' : undefined
                }
                value={bindingRhythm?.source ? outputRefKey(bindingRhythm.source) : null}
                onChange={(value) => onBind('rhythm', value ? parseOutputRef(value) : null)}
              />
              <Select
                size="xs"
                label="Pitch source"
                placeholder="Connect pitch or pitch-class material"
                clearable
                data={pitchOptions}
                error={missingPitchBinding ? 'Connected source is no longer available.' : undefined}
                value={bindingPitches?.source ? outputRefKey(bindingPitches.source) : null}
                onChange={(value) => onBind('pitches', value ? parseOutputRef(value) : null)}
              />
            </Stack>
          </ModuleSection>

          <ModuleSection label="Combine">
            <Stack gap="xs">
              <Select
                size="xs"
                label="Pitch allocation"
                data={allocationOptions}
                value={allocation}
                onChange={(value) => value && setAllocation(value as PitchAllocation)}
              />
              <Select
                size="xs"
                label="Pulse value"
                description="Explicitly interprets one source pulse in musical time."
                data={melodicizationPulseOptions.map(({ value, label }) => ({ value, label }))}
                value={pulseValue}
                onChange={(value) => value && setPulseValue(value)}
              />
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Articulation</Text>
                <Group gap="xs" wrap="nowrap" className={classes.volumeControl}>
                  <Slider
                    thumbLabel="Note articulation"
                    min={1}
                    max={200}
                    value={articulationPercent}
                    onChange={setArticulationPercent}
                  />
                  <Text ff="monospace" size="xs" w="2.8rem" ta="right">
                    {articulationPercent}%
                  </Text>
                </Group>
              </div>
            </Stack>
          </ModuleSection>

          <ModuleSection label="Preview">
            <Stack gap="xs">
              <div className={classes.moduleParameterRow}>
                <Text size="xs">Tempo</Text>
                <NumberInput
                  size="xs"
                  aria-label="Melodicization preview tempo"
                  suffix=" BPM"
                  min={20}
                  max={400}
                  value={tempo}
                  onChange={setTempo}
                />
              </div>
              <Select
                size="xs"
                label="Display meter"
                data={meterOptions}
                value={meter}
                onChange={(value) => value && setMeter(value)}
              />
              <VolumeControl
                accessibleLabel="Melodicization preview volume"
                label="Volume"
                value={volume}
                onChange={setVolume}
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
