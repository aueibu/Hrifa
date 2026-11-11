import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Select, Slider, Table, Text } from '@mantine/core';
import {
  defaultPianoRollView,
  PianoRoll,
  type PianoRollGridLine,
  type PianoRollViewState,
} from '../../../components/PianoRoll';
import { createNotePacketPerformancePlan } from '../audio/performancePlans';
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
import { newSnippetId, useDesk } from '../desk';
import { captureSnippet } from '../snippet';
import type { EditorAction, EditorTool } from '../../../components/EditorPalette';
import type { ModuleRouteState } from '../compositionWorkspace';
import { melodicize, type PitchAllocation } from '../melodicization';
import type { DataPacket } from '../model';
import {
  defaultMusicalTimeline,
  formatBarBeatTickPercent,
  musicalPosition,
  rationalToNumber,
  type MusicalDuration,
  type MusicalTimeline,
} from '../musicalTime';
import { pitchLabel, rhythmInterpretableDomains } from '../routeTreatments';
import { signalTypeRegistry } from '../signalTypes';
import { countInSeconds, parseMeter, transportPulse } from '../transport';
import { useModulePreview, type PreviewEnd } from '../useModulePreview';
import {
  acceptsFiniteNumber,
  compositionStateKeys,
  compositionInstanceStateKey,
  usePersistentState,
} from '../usePersistentState';
import { ModuleDevice } from './ModuleDevice';
import { InspectorSection, ModuleInspectorContent, ModuleOutputsSection } from './ModuleHost';
import { SourceMenu, type SourceOption } from './SourceMenu';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

type InputPort = 'rhythm' | 'pitches';

export interface MelodicizationModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
  /** Shown in the workspace. Each time it becomes so, the piano roll refits to the notes. */
  active?: boolean;
  outputs: PublishedCompositionOutput[];
  routeState: ModuleRouteState;
  onBind(port: InputPort, source: CompositionOutputRef | null): void;
}

const allocationOptions = [
  { value: 'cycle', label: 'Cycle pitches across attacks' },
  { value: 'cycle-rhythm', label: 'Cycle attacks across pitches' },
  { value: 'zip', label: 'Zip and stop at the shorter input' },
  { value: 'cartesian', label: 'Every pitch at every attack, in turn' },
];

function rationalLabel(duration: MusicalDuration) {
  const { numerator, denominator } = duration.quarterNotes;
  return denominator === 1 ? `${numerator} qn` : `${numerator}/${denominator} qn`;
}

// Any outlet can be wired to the rhythm inlet — Melodicization errors on its own if what arrives
// still isn't a valid inter-onset rhythm once routed through Quick Adjust. A source already
// carrying `duration`/`interOnset` needs no conversion; a plain numeric domain (e.g. Arithmetic's
// output, which never carries a role) is offered too, since the Rhythm Quick Adjust panel now
// offers an explicit "Interpret as rhythm" conversion for exactly that case — matching how the
// pitch inlet already offers `numericPitchCandidateDomains` for "Read as MIDI notes".
function compatibleRhythm(packet: DataPacket) {
  return packet.kind === 'list' && rhythmInterpretableDomains.has(packet.domain);
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

function compatiblePitches(packet: DataPacket) {
  return (
    packet.kind === 'list' &&
    (packet.domain === 'pitch' ||
      packet.domain === 'pitchClass' ||
      numericPitchCandidateDomains.has(packet.domain))
  );
}

export function MelodicizationModule({
  instanceId,
  instanceLabel,
  active = true,
  outputs,
  routeState,
  onBind,
  onOutputsChange,
}: MelodicizationModuleProps) {
  const { settings } = useCompositionSettings();
  const edo = settings.edo;
  const bindingRhythm = routeState.rhythm;
  const bindingPitches = routeState.pitches;
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'melodicization');
  const [allocation, setAllocation] = usePersistentState<PitchAllocation>(
    stateKey(compositionStateKeys.melodicizationAllocation),
    'cycle',
    (value): value is PitchAllocation =>
      value === 'cycle' || value === 'cycle-rhythm' || value === 'zip' || value === 'cartesian'
  );
  const [articulationPercent, setArticulationPercent] = usePersistentState(
    stateKey(compositionStateKeys.melodicizationArticulation),
    100,
    acceptsFiniteNumber
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
  // Opening the module refits the piano roll: clearing `framed` makes PianoRoll fit the notes
  // as soon as it is visible and measured. Zooming or scrolling afterwards sticks until next time.
  useEffect(() => {
    if (active) {
      setPianoRollView((view) => (view.framed ? { ...view, framed: false } : view));
    }
  }, [active, setPianoRollView]);
  const [playheadQuarterNotes, setPlayheadQuarterNotes] = useState(0);
  const playheadFrame = useRef<number | null>(null);

  const rhythmOutput = boundOutput(outputs, bindingRhythm?.source);
  const pitchOutput = boundOutput(outputs, bindingPitches?.source);
  const resolvedRhythm = useMemo(
    () =>
      resolvePacketFromOutput(
        rhythmOutput,
        bindingRhythm?.source?.index,
        `route:${instanceId}:rhythm`
      ),
    [rhythmOutput, bindingRhythm?.source?.index, instanceId]
  );
  const resolvedPitches = useMemo(
    () =>
      resolvePacketFromOutput(
        pitchOutput,
        bindingPitches?.source?.index,
        `route:${instanceId}:pitches`
      ),
    [pitchOutput, bindingPitches?.source?.index, instanceId]
  );
  const treatedRhythm = useMemo(
    () =>
      bindingRhythm
        ? signalTypeRegistry[bindingRhythm.signalType].apply(
            resolvedRhythm,
            bindingRhythm.treatment,
            `route:${instanceId}:rhythm`,
            edo
          )
        : undefined,
    [bindingRhythm, resolvedRhythm, instanceId, edo]
  );
  const treatedPitches = useMemo(
    () =>
      bindingPitches
        ? signalTypeRegistry[bindingPitches.signalType].apply(
            resolvedPitches,
            bindingPitches.treatment,
            `route:${instanceId}:pitches`,
            edo
          )
        : undefined,
    [bindingPitches, resolvedPitches, instanceId, edo]
  );
  // Tempo, meter, and pulse value come from the header transport, shared by every module.
  const transport = settings.transport;
  const { tempo, meter } = transport;
  const pulseUnit = transportPulse(transport).duration;
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
  const { numerator: meterNumerator, denominator: meterDenominator } = parseMeter(meter);
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
        item.value.pitches.map((midicents, pitchIndex) => ({
          id: `${item.id}:pitch:${pitchIndex}`,
          sourceId: item.id,
          start: rationalToNumber(item.value.onset.quarterNotes),
          duration: rationalToNumber(item.value.duration.quarterNotes),
          pitchMidicents: midicents,
          label: pitchLabel(midicents),
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
      if (playheadFrame.current !== null) {
        cancelAnimationFrame(playheadFrame.current);
      }
    },
    []
  );

  function endPlayhead(reason: PreviewEnd) {
    if (playheadFrame.current !== null) {
      cancelAnimationFrame(playheadFrame.current);
      playheadFrame.current = null;
    }
    setPlayheadQuarterNotes(reason === 'complete' ? pianoRollDuration : 0);
  }

  const preview = useModulePreview({
    instanceId,
    volume,
    followTransport: true,
    transportPlay: playPreview,
    onEnd: endPlayhead,
  });

  // The playhead runs in the roll's own time. Auditioning a selection plays it from its own start, so
  // the playhead begins at where the selection sits in the roll (`from`) and covers its `length`.
  function startPlayhead(bpm: number, from = 0, length = pianoRollDuration) {
    if (playheadFrame.current !== null) {
      cancelAnimationFrame(playheadFrame.current);
    }
    const startsAt = performance.now() + 60 + countInSeconds(transport) * 1000;
    const end = from + length;
    setPlayheadQuarterNotes(from);
    const draw = (now: number) => {
      const position = from + Math.max(0, ((now - startsAt) / 1000) * (bpm / 60));
      setPlayheadQuarterNotes(Math.min(end, position));
      if (position < end) {
        playheadFrame.current = requestAnimationFrame(draw);
      } else {
        playheadFrame.current = null;
      }
    };
    playheadFrame.current = requestAnimationFrame(draw);
  }

  // Selected events, by packet item id. Ids that no longer exist (the inputs changed) fall away.
  const [rawSelection, setSelection] = useState<string[]>([]);
  const selection = useMemo(() => {
    const known = new Set(result.packet.items.map((item) => item.id));
    return rawSelection.filter((id) => known.has(id));
  }, [rawSelection, result.packet.items]);
  const [rollTool, setRollTool] = useState('select');
  const { addSnippet } = useDesk();

  function captureSelection(ids: string[]) {
    return captureSnippet({
      id: newSnippetId(),
      createdAt: new Date().toISOString(),
      name: `${instanceLabel} · ${ids.length} ${ids.length === 1 ? 'note' : 'notes'}`,
      packet: result.packet,
      moduleInstance: instanceId,
      portId: 'notes',
      itemIds: ids,
    });
  }

  const rollTools: EditorTool[] = [{ id: 'select', label: 'Select', shortcut: 'v' }];
  const rollActions: EditorAction[] = [
    {
      id: 'send-to-desk',
      label: 'Send to desk',
      shortcut: 'd',
      run({ selectedIds }) {
        const captured = captureSelection(selectedIds);
        if (!captured.ok) {
          preview.setStatus(captured.error);
          return;
        }
        addSnippet(captured.snippet);
        preview.setStatus(
          [`Sent ${selectedIds.length} to the desk.`, ...captured.warnings].join(' ')
        );
      },
    },
    {
      id: 'audition-selection',
      label: 'Audition',
      shortcut: 'p',
      async run({ selectedIds }) {
        const captured = captureSelection(selectedIds);
        if (!captured.ok) {
          preview.setStatus(captured.error);
          return;
        }
        try {
          const plan = createNotePacketPerformancePlan({
            sourceId: instanceId,
            packet: captured.snippet.packet as typeof result.packet,
            timeline,
          });
          const started = await preview.play(plan, `Auditioning ${selectedIds.length} selected.`);
          if (started) {
            const chosen = new Set(selectedIds);
            const from = Math.min(
              ...result.packet.items
                .filter((item) => chosen.has(item.id))
                .map((item) => rationalToNumber(item.value.onset.quarterNotes))
            );
            startPlayhead(Number(tempo), from, captured.snippet.packet.frame?.extent ?? 1);
          }
        } catch (error) {
          preview.setStatus(error instanceof Error ? error.message : 'Audition could not start.');
        }
      },
    },
  ];

  async function playPreview() {
    if (result.errors.length || !result.packet.items.length) {
      preview.setStatus('Connect valid rhythm and pitch material before previewing.');
      return;
    }
    let plan;
    try {
      plan = createNotePacketPerformancePlan({
        sourceId: instanceId,
        packet: result.packet,
        timeline,
      });
    } catch (error) {
      preview.setStatus(error instanceof Error ? error.message : 'Audio preview could not start.');
      return;
    }
    const started = await preview.play(
      plan,
      `Playing ${result.packet.items.length} events and ${pianoRollNotes.length} notes at ${tempo} BPM on the musical transport.`
    );
    if (started) {
      startPlayhead(tempo);
    }
  }

  function resetMelodicization() {
    preview.stop('');
    setAllocation('cycle');
    setArticulationPercent(100);
    setVolume(30);
    setPianoRollView(defaultPianoRollView);
    preview.setStatus('Melodicization module reset.');
  }

  const rhythmOptions: SourceOption[] = compositionOutputOptions(
    outputs,
    instanceId,
    compatibleRhythm,
    { allowRestsAndTies: true }
  );
  const pitchOptions: SourceOption[] = compositionOutputOptions(
    outputs,
    instanceId,
    compatiblePitches
  );
  const missingRhythmBinding = Boolean(bindingRhythm?.source && !rhythmOutput);
  const missingPitchBinding = Boolean(bindingPitches?.source && !pitchOutput);
  if (bindingRhythm?.source && missingRhythmBinding) {
    rhythmOptions.push({
      value: outputRefKey(bindingRhythm.source),
      label: `Missing source · ${bindingRhythm.source.port}`,
      path: ['Missing source', bindingRhythm.source.port],
      disabled: true,
    });
  }
  if (bindingPitches?.source && missingPitchBinding) {
    pitchOptions.push({
      value: outputRefKey(bindingPitches.source),
      label: `Missing source · ${bindingPitches.source.port}`,
      path: ['Missing source', bindingPitches.source.port],
      disabled: true,
    });
  }
  const visibleNotes = result.packet.items.slice(0, 128);

  const view =
    result.errors.length > 0 ? (
      <Alert color="yellow" title="Melodicization needs material">
        {result.errors.join(' ')}
      </Alert>
    ) : (
      <>
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
          isPlaying={preview.playing}
          selectedIds={selection}
          onSelectionChange={setSelection}
          tools={rollTools}
          activeTool={rollTool}
          onToolChange={setRollTool}
          actions={rollActions}
        />
        <div className={classes.candidateList}>
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
                      ? `[${item.value.pitches.map((midicents) => pitchLabel(midicents)).join(' ')}]`
                      : item.value.pitches[0] !== undefined
                        ? pitchLabel(item.value.pitches[0])
                        : ''}
                  </Table.Td>
                  <Table.Td ff="monospace">{rationalLabel(item.value.interOnset)}</Table.Td>
                  <Table.Td ff="monospace">{rationalLabel(item.value.duration)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {result.packet.items.length > visibleNotes.length && (
            <Text size="xs" c="dimmed" mt="xs">
              Showing the first {visibleNotes.length} of {result.packet.items.length} events.
            </Text>
          )}
        </div>
      </>
    );

  return (
    <ModuleDevice
      name={instanceLabel}
      status={
        result.errors.length ? 'Needs inputs' : 'Rhythm as temporal spine; pitches allocated'
      }
      badges={
        <>
          <Badge variant="outline">{result.packet.items.length} events</Badge>
          <Badge variant="outline">{pianoRollNotes.length} notes</Badge>
          <Badge variant="outline">{allocation}</Badge>
        </>
      }
      actions={
        <>
          <Button onClick={playPreview}>▶ Preview</Button>
          <Button variant="default" onClick={() => preview.stop()}>
            ■ Stop
          </Button>
        </>
      }
      onReset={resetMelodicization}
      footer={
        <Text size="xs" c="dimmed" truncate aria-live="polite">
          {preview.status ||
            'Note events retain musical time; preview tempo does not rewrite them.'}
        </Text>
      }
      controls={
        <>
          <InspectorSection label="Combine">
            <Select
              label="Pitch allocation"
              data={allocationOptions}
              value={allocation}
              onChange={(value) => value && setAllocation(value as PitchAllocation)}
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
          </InspectorSection>

          <ModuleInspectorContent>
            <InspectorSection label="Inputs">
              <SourceMenu
                label="Rhythm source"
                placeholder="Connect inter-onset durations"
                options={rhythmOptions}
                error={
                  missingRhythmBinding ? 'Connected source is no longer available.' : undefined
                }
                value={bindingRhythm?.source ? outputRefKey(bindingRhythm.source) : null}
                onChange={(value) => onBind('rhythm', value ? parseOutputRef(value) : null)}
              />
              <SourceMenu
                label="Pitch source"
                placeholder="Connect pitch or pitch-class material"
                options={pitchOptions}
                error={missingPitchBinding ? 'Connected source is no longer available.' : undefined}
                value={bindingPitches?.source ? outputRefKey(bindingPitches.source) : null}
                onChange={(value) => onBind('pitches', value ? parseOutputRef(value) : null)}
              />
            </InspectorSection>

            <InspectorSection label="Preview">
              <Text size="xs" c="dimmed">
                One pulse = one {transportPulse(transport).label.toLowerCase()}, in {meter} at{' '}
                {tempo} BPM. Set these in the transport at the top of the page.
              </Text>
              <VolumeControl
                accessibleLabel="Melodicization preview volume"
                label="Volume"
                value={volume}
                onChange={setVolume}
              />
            </InspectorSection>
            <ModuleOutputsSection instanceLabel={instanceLabel} outputs={[publishedOutput]} />
          </ModuleInspectorContent>
        </>
      }
    >
      {view}
    </ModuleDevice>
  );
}
