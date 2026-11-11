import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  ActionIcon,
  Button,
  Chip,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
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
import { rhythmOrigin } from '../rhythmFrame';
import {
  editRhythm,
  scaleStepsToLength,
  type GroupingPolicy,
  type RhythmEditMode,
} from '../rhythmEdit';
import {
  createRhythmPreviewPlan,
  musicalPlanSeconds,
  transportRhythmContext,
  type RhythmPreviewLayer,
} from '../rhythmRealization';
import { isValidRhythmSource, rhythmInterpretableDomains } from '../routeTreatments';
import { signalTypeRegistry } from '../signalTypes';
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
import {
  clampCellWidth,
  DEFAULT_CELL_WIDTH,
  fitCellWidth,
  scrollLeftAfterZoom,
  zoomedCellWidth,
  type Viewport,
} from '../rhythmRollZoom';
import { DurationStrip } from './DurationStrip';
import { FollowPlayhead, type FollowMode } from './FollowPlayhead';
import { RollScrollbar } from './RollScrollbar';
import { NoteGuides, ProgramTrack } from './ProgramTrack';
import { RhythmDiff, RhythmDiffLegend } from './RhythmDiff';
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
import { SourceMenu } from './SourceMenu';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

type AuditionLayer = 'input' | 'edited' | 'scaled';

const auditionLayers: { id: AuditionLayer; label: string; voice: number }[] = [
  { id: 'input', label: 'Input', voice: 0 },
  { id: 'edited', label: 'Result', voice: 1 },
  { id: 'scaled', label: 'Scaled original', voice: 2 },
];

type LayerSounds = Record<AuditionLayer, SoundOverride | null>;

const noLayerSounds: LayerSounds = { input: null, edited: null, scaled: null };

/** A ceiling on the drawing's width, so an extreme rhythm cannot ask for an enormous canvas. */
const MAX_CANVAS_PX = 40000;

/** A program's phase and rate for its caption; nothing when it acts on every note from the start. */
const timingDetail = (phase: number, rate: number) =>
  phase === 0 && rate === 1 ? undefined : `phase ${phase}, rate ${rate}`;

const initialProgram = '[x,2][r,1]';
const initialRules = 'every 3: r';

interface EditSettings {
  programPhase: number;
  programRate: number;
  lengthPhase: number;
  lengthRate: number;
  nStart: number;
  nChange: number;
  nEvery: number;
}

const defaultSettings: EditSettings = {
  programPhase: 0,
  programRate: 1,
  lengthPhase: 0,
  lengthRate: 1,
  nStart: 1,
  nChange: 1,
  nEvery: 1,
};

function acceptsSettings(value: unknown): value is EditSettings {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (Object.keys(defaultSettings) as (keyof EditSettings)[]).every(
      (key) => typeof (value as EditSettings)[key] === 'number'
    )
  );
}

function compatibleRhythm(packet: DataPacket) {
  return packet.kind === 'list' && rhythmInterpretableDomains.has(packet.domain);
}

export interface RhythmEditModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
  outputs: PublishedCompositionOutput[];
  routeState: ModuleRouteState;
  onBind(port: string, source: CompositionOutputRef | null): void;
}

/** Grouping boundaries as pulses from the first note, for the strip's ticks. */
const groupingMarks = (packet: DataPacket) => {
  const origin = rhythmOrigin(packet);
  return packet.frame?.grouping?.boundaries.map((boundary) => boundary - origin);
};

const stepsOf = (packet: DataPacket) =>
  packet.items.map((item) => ({ duration: Number(item.value), tie: item.tie }));

/**
 * Edits a connected rhythm the way the Grid Traversal workshop programs a piece (see rhythmEdit.ts):
 * a structure program turns notes into rests and ties, a length program changes how long each note
 * is, and rules can pick notes directly. Programs are cyclic `[action,count]` blocks that can use a
 * growing variable `n`, with a phase and a rate.
 */
export function RhythmEditModule({
  instanceId,
  instanceLabel,
  outputs,
  routeState,
  onBind,
  onOutputsChange,
}: RhythmEditModuleProps) {
  const { settings } = useCompositionSettings();
  const edo = settings.edo;
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'rhythm-edit');
  const [mode, setMode] = usePersistentState<RhythmEditMode>(
    stateKey(compositionStateKeys.rhythmEditMode),
    'program',
    (value): value is RhythmEditMode => value === 'program' || value === 'rules'
  );
  const [program, setProgram] = usePersistentState(
    stateKey(compositionStateKeys.rhythmEditPattern),
    initialProgram,
    acceptsString
  );
  const [rules, setRules] = usePersistentState(
    stateKey(compositionStateKeys.rhythmEditRules),
    initialRules,
    acceptsString
  );
  const [lengths, setLengths] = usePersistentState(
    stateKey(compositionStateKeys.rhythmEditLengths),
    '',
    acceptsString
  );
  const [grouping, setGrouping] = usePersistentState<GroupingPolicy>(
    stateKey(compositionStateKeys.rhythmEditGrouping),
    'drop',
    (value): value is GroupingPolicy => value === 'drop' || value === 'keep' || value === 'follow'
  );
  const [editSettings, setEditSettings] = usePersistentState<EditSettings>(
    stateKey(compositionStateKeys.rhythmEditSettings),
    defaultSettings,
    acceptsSettings
  );
  // Each layer plays on its own voice (primary, secondary, tertiary) unless set here.
  const [layerSounds, setLayerSounds] = usePersistentState<LayerSounds>(
    stateKey(compositionStateKeys.rhythmEditSound),
    noLayerSounds,
    (value): value is LayerSounds =>
      Boolean(value) &&
      typeof value === 'object' &&
      auditionLayers.every(({ id }) => {
        const sound = (value as LayerSounds)[id];
        return sound === null || isSoundOverride(sound);
      })
  );
  // Which layers Preview plays, together: the input, the edit, and the input scaled to the edit.
  const [audition, setAudition] = usePersistentState<AuditionLayer[]>(
    stateKey(compositionStateKeys.rhythmEditAudition),
    ['edited'],
    (value): value is AuditionLayer[] =>
      Array.isArray(value) && value.every((layer) => auditionLayers.some(({ id }) => id === layer))
  );
  // The programs drawn note by note above the input: which notes they tick on, and their blocks.
  const [showTracks, setShowTracks] = usePersistentState(
    stateKey(compositionStateKeys.rhythmEditShowTracks),
    true,
    acceptsBoolean
  );
  // While a preview plays the roll can scroll with it: centered like a DAW, a page at a time like
  // the piano roll, or not at all.
  const [followMode, setFollowMode] = usePersistentState<FollowMode>(
    stateKey(compositionStateKeys.rhythmEditFollow),
    'center',
    (value): value is FollowMode => value === 'off' || value === 'page' || value === 'center'
  );
  // Horizontal zoom: how many px the shortest note is drawn across. Row heights never change.
  const [cellWidth, setCellWidth] = usePersistentState(
    stateKey(compositionStateKeys.rhythmEditCellWidth),
    DEFAULT_CELL_WIDTH,
    acceptsFiniteNumber
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  // The fraction of the roll under the middle of the view when a zoom was asked for, so the zoom can
  // keep that point in place once the new width is laid out.
  const zoomAnchor = useRef<{ scrollLeft: number; viewWidth: number; contentWidth: number } | null>(null);
  // Where the zoom bar wants the roll scrolled to once the width it asked for is laid out.
  const pendingScroll = useRef<number | null>(null);
  // Which strips the current preview is sounding, so only their playheads move.
  const [playingLayers, setPlayingLayers] = useState<string[]>([]);
  const [previewVolume, setPreviewVolume] = usePersistentState(
    stateKey(compositionStateKeys.rhythmEditVolume),
    30,
    acceptsFiniteNumber
  );
  const update = (patch: Partial<EditSettings>) =>
    setEditSettings((current) => ({ ...current, ...patch }));
  const whole = (value: number | string, minimum: number) =>
    Math.max(minimum, Math.floor(Number(value) || minimum));

  const bindingRhythm = routeState.rhythm;
  const selfBound = bindingRhythm?.source?.instanceId === instanceId;
  const rhythmOutput = boundOutput(outputs, bindingRhythm?.source);
  const resolved = useMemo(
    () =>
      selfBound
        ? undefined
        : resolvePacketFromOutput(
            rhythmOutput,
            bindingRhythm?.source?.index,
            `route:${instanceId}:rhythm`
          ),
    [selfBound, rhythmOutput, bindingRhythm?.source?.index, instanceId]
  );
  const treated = useMemo(
    () =>
      bindingRhythm
        ? signalTypeRegistry[bindingRhythm.signalType].apply(
            resolved,
            bindingRhythm.treatment,
            `route:${instanceId}:rhythm`,
            edo
          )
        : undefined,
    [bindingRhythm, resolved, instanceId, edo]
  );
  const input = isValidRhythmSource(treated) ? treated : undefined;

  const edited = useMemo(
    () =>
      editRhythm({
        instanceId,
        source: input,
        mode,
        program,
        programTiming: { phase: editSettings.programPhase, rate: editSettings.programRate },
        rules,
        lengths,
        lengthTiming: { phase: editSettings.lengthPhase, rate: editSettings.lengthRate },
        variable: {
          start: editSettings.nStart,
          change: editSettings.nChange,
          every: editSettings.nEvery,
        },
        grouping,
      }),
    [instanceId, input, mode, program, rules, lengths, editSettings, grouping]
  );
  const error = input
    ? edited.errors.join('; ')
    : treated
      ? 'The connected source is not an inter-onset duration list yet. Turn on “Interpret as rhythm” on its route.'
      : 'Connect a rhythm to edit.';

  const publishedOutputs = useMemo<PublishedCompositionOutput[]>(
    () =>
      edited.packet
        ? [
            {
              ref: { instanceId, port: 'rhythm' },
              label: `${instanceLabel} · Rhythm`,
              packet: edited.packet,
            },
          ]
        : [],
    [instanceId, instanceLabel, edited.packet]
  );

  useEffect(() => {
    onOutputsChange?.(instanceId, publishedOutputs);
  }, [instanceId, onOutputsChange, publishedOutputs]);

  const preview = useModulePreview({
    instanceId,
    volume: previewVolume,
    followTransport: true,
    transportPlay: playPreview,
    onEnd: () => setPlayingLayers([]),
  });

  function playPreview() {
    const layers: RhythmPreviewLayer[] = [];
    for (const { id, voice } of auditionLayers) {
      if (!audition.includes(id)) {
        continue;
      }
      const steps = id === 'input' ? inputSteps : id === 'edited' ? editedSteps : scaledSteps;
      if (steps.length) {
        layers.push({
          layerId: id,
          steps,
          origin: id === 'input' ? inputOrigin : id === 'edited' ? editedOrigin : scaledOrigin,
          sound: layerSound(settings.sounds.rhythm, voice, layerSounds[id]),
        });
      }
    }
    if (!layers.length) {
      preview.setStatus(
        edited.packet
          ? 'Choose at least one layer to audition.'
          : 'Connect a rhythm and a readable edit to preview.'
      );
      return;
    }
    const plan = createRhythmPreviewPlan({
      sourceId: instanceId,
      ...transportRhythmContext(settings.transport),
      layers,
    });
    const names = layers.map((layer) =>
      auditionLayers.find(({ id }) => id === layer.layerId)!.label.toLowerCase()
    );
    void preview.play(
      plan,
      `Playing ${names.join(' with ')} for ${musicalPlanSeconds(plan).toFixed(1)} seconds.`
    );
    // After play(): its opening stop() clears the previous layers.
    setPlayingLayers(layers.map((layer) => layer.layerId));
  }

  function resetRhythmEdit() {
    preview.stop('');
    setMode('program');
    setProgram(initialProgram);
    setRules(initialRules);
    setLengths('');
    setGrouping('drop');
    setEditSettings(defaultSettings);
    setLayerSounds(noLayerSounds);
    setAudition(['edited']);
    setPreviewVolume(30);
    preview.setStatus('Rhythm Edit module reset.');
  }

  const cyclic = input?.frame?.topology !== 'linear';
  const rhythmOptions = compositionOutputOptions(outputs, instanceId, compatibleRhythm, {
    allowRestsAndTies: true,
  });
  const hasErrors = Boolean(edited.errors.length) && Boolean(input);
  // Both strips are drawn on one pulse scale, so the lines between them show how far edges move.
  const inputLengths = input?.items.map((item) => Math.abs(Number(item.value))) ?? [];
  const editedLengths = edited.packet?.items.map((item) => Math.abs(Number(item.value))) ?? [];
  const inputTotal = inputLengths.reduce((sum, length) => sum + length, 0);
  const editedTotal = editedLengths.reduce((sum, length) => sum + length, 0);
  const scale = Math.max(inputTotal, editedTotal) || 1;
  // The input stretched or shrunk, note for note, to the edit's overall length.
  const lengthFactor = inputTotal > 0 && editedTotal > 0 ? editedTotal / inputTotal : 1;
  const inputSteps = input ? stepsOf(input) : [];
  const editedSteps = edited.packet ? stepsOf(edited.packet) : [];
  const scaledSteps = useMemo(
    () => (input && edited.packet ? scaleStepsToLength(stepsOf(input), editedTotal) : []),
    [input, edited.packet, editedTotal]
  );
  const inputOrigin = input ? rhythmOrigin(input) : 0;
  const editedOrigin = edited.packet ? rhythmOrigin(edited.packet) : 0;
  const scaledOrigin = inputOrigin * lengthFactor;
  // Wide enough that the shortest note on any row is `cellWidth` px across: the horizontal zoom.
  const shortest = Math.min(
    ...[...inputLengths, ...editedLengths, ...scaledSteps.map((step) => Math.abs(step.duration))].filter(
      (length) => length > 0
    )
  );
  const canvasPxFor = (width: number) =>
    Number.isFinite(shortest)
      ? Math.min(MAX_CANVAS_PX, Math.ceil((scale * clampCellWidth(width)) / shortest))
      : 0;
  const canvasPx = canvasPxFor(cellWidth);
  // The roll's visible width, so every row can be told how many px one pulse is.
  const [viewWidth, setViewWidth] = useState(0);
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) {
      return undefined;
    }
    const measure = () => setViewWidth(element.clientWidth);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [input, edited.packet]);
  // How many px one pulse is on every row: the roll is as wide as the canvas, or the view if wider.
  const pxPerPulse = viewWidth > 0 ? Math.max(viewWidth, canvasPx) / scale : undefined;

  /** Zooms to a new note width, keeping the point at the middle of the view where it is. */
  function zoomTo(next: number) {
    const element = scrollerRef.current;
    zoomAnchor.current = element
      ? {
          scrollLeft: element.scrollLeft,
          viewWidth: element.clientWidth,
          contentWidth: element.scrollWidth,
        }
      : null;
    setCellWidth(clampCellWidth(next));
  }

  /**
   * The zoom bar's request: show this part of the roll. It becomes a note width (the roll's width is
   * the view's width over the span shown) and a scroll position (the start of the part shown).
   */
  function applyViewport(viewport: Viewport) {
    const element = scrollerRef.current;
    if (!element || !Number.isFinite(shortest)) {
      return;
    }
    const view = element.clientWidth;
    const nextWidth = clampCellWidth(((view / viewport.span) * shortest) / scale);
    const left = viewport.start * Math.max(view, canvasPxFor(nextWidth));
    if (nextWidth === clampCellWidth(cellWidth)) {
      element.scrollLeft = left;
      return;
    }
    zoomAnchor.current = null;
    pendingScroll.current = left;
    setCellWidth(nextWidth);
  }

  // After the new width is laid out, put the remembered middle of the view back in the middle.
  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (element && pendingScroll.current !== null) {
      element.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
      return;
    }
    const anchor = zoomAnchor.current;
    zoomAnchor.current = null;
    if (!element || !anchor) {
      return;
    }
    element.scrollLeft = scrollLeftAfterZoom({
      scrollLeft: anchor.scrollLeft,
      viewWidth: anchor.viewWidth,
      oldContentWidth: anchor.contentWidth,
      newContentWidth: element.scrollWidth,
    });
  }, [cellWidth]);

  // Errors and warnings go to the controls panel in small type, so they never push the roll around.
  const notices: ModuleNotice[] = [
    ...(error && !edited.packet
      ? [{ tone: input ? 'error' : 'info', text: error } satisfies ModuleNotice]
      : []),
    ...(edited.packet?.warnings ?? []).map((text): ModuleNotice => ({ tone: 'warning', text })),
  ];

  // The roll fills the panel like Bitwig's note editor: the rows scroll vertically if they must, and
  // the zoom bar and the icon bar stay pinned to the bottom, so nothing needs the page to scroll.
  const view =
    input && edited.packet ? (
      <div className={classes.rollLayout} style={{ flex: '1 1 0', minHeight: 0 }}>
        <div className={classes.rollMain}>
          {/* Every row is drawn inside one canvas that is as wide as the smallest note needs, and
              the canvas scrolls sideways, so a long rhythm keeps every note readable and every row
              lined up with the others. */}
          <div className={classes.rhythmScroller} ref={scrollerRef}>
            <div style={{ width: `max(100%, ${canvasPx}px)` }}>
            {/* The tracks and the Input strip share one box, so they have the same width and edges, and
                one set of guide lines can run through both. */}
            <div className={classes.guided} style={{ width: `${(inputTotal / scale) * 100}%` }}>
            {showTracks && (edited.tracks?.structure || edited.tracks?.length) && (
              <NoteGuides lengths={inputLengths} />
            )}
            {showTracks && (edited.tracks?.structure || edited.tracks?.length) && (
              <div className={classes.programTracks}>
                {edited.tracks.structure && (
                  <ProgramTrack
                    label={mode === 'rules' ? 'Rules' : 'Structure'}
                    detail={
                      mode === 'rules'
                        ? undefined
                        : timingDetail(editSettings.programPhase, editSettings.programRate)
                    }
                    lengths={inputLengths}
                    notes={edited.tracks.structure}
                    pxPerPulse={pxPerPulse}
                  />
                )}
                {edited.tracks.length && (
                  <ProgramTrack
                    label="Length"
                    detail={timingDetail(editSettings.lengthPhase, editSettings.lengthRate)}
                    lengths={inputLengths}
                    notes={edited.tracks.length}
                    pxPerPulse={pxPerPulse}
                  />
                )}
              </div>
            )}
            <DurationStrip
              label="Input"
              durations={inputLengths}
              steps={stepsOf(input)}
              cyclic={cyclic}
              boundaries={groupingMarks(input)}
              pxPerPulse={pxPerPulse}
              playhead={{
                sourceId: instanceId,
                unitSeconds: pulseSeconds(settings.transport),
                visible: playingLayers.includes('input'),
              }}
            />
            </div>
            <RhythmDiff
              inputLengths={inputLengths}
              editedLengths={editedLengths}
              inputShare={inputTotal / scale}
              editedShare={editedTotal / scale}
              scroller={scrollerRef}
            />
            <DurationStrip
              label="Result"
              durations={editedLengths}
              steps={stepsOf(edited.packet)}
              cyclic={cyclic}
              boundaries={groupingMarks(edited.packet)}
              labelPlacement="below"
              widthShare={editedTotal / scale}
              pxPerPulse={pxPerPulse}
              playhead={{
                sourceId: instanceId,
                unitSeconds: pulseSeconds(settings.transport),
                visible: playingLayers.includes('edited'),
              }}
            />
            <div className={classes.scaledOriginal}>
              <DurationStrip
                label="Input scaled to the result's length"
                durations={scaledSteps.map((step) => Math.abs(step.duration))}
                steps={scaledSteps}
                cyclic={cyclic}
                boundaries={(groupingMarks(input) ?? []).map((boundary) => boundary * lengthFactor)}
                widthShare={editedTotal / scale}
                pxPerPulse={pxPerPulse}
                playhead={{
                  sourceId: instanceId,
                  unitSeconds: pulseSeconds(settings.transport),
                  visible: playingLayers.includes('scaled'),
                }}
              />
            </div>
            </div>
          </div>
        </div>
        <div className={classes.rollBottom}>
          <RollScrollbar scroller={scrollerRef} revision={canvasPx} onViewport={applyViewport} />
          <div className={classes.iconBar}>
            <Group gap={4} wrap="nowrap">
              <HelpTip help="Zoom changes only the width of the roll; every row keeps its height. Drag the bar above to scroll and zoom as well.">
                <Text size="xs" c="dimmed">
                  Zoom
                </Text>
              </HelpTip>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label="Zoom out horizontally"
                onClick={() => zoomTo(zoomedCellWidth(cellWidth, 'out'))}
              >
                −
              </ActionIcon>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label="Zoom in horizontally"
                onClick={() => zoomTo(zoomedCellWidth(cellWidth, 'in'))}
              >
                +
              </ActionIcon>
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => {
                  const view = scrollerRef.current?.clientWidth ?? 0;
                  zoomTo(fitCellWidth(view, scale, shortest));
                }}
              >
                Fit
              </Button>
              <Button size="compact-xs" variant="default" onClick={() => zoomTo(DEFAULT_CELL_WIDTH)}>
                Reset
              </Button>
              <Text size="xs" c="dimmed">
                {Math.round(clampCellWidth(cellWidth))}px/note
              </Text>
            </Group>
            <Chip.Group
              multiple
              value={audition}
              onChange={(value) => setAudition(value as AuditionLayer[])}
            >
              <Group gap="xs" wrap="nowrap">
                <HelpTip help="Preview plays every layer chosen here together, each on its own sound.">
                  <Text size="xs" c="dimmed">
                    Audition
                  </Text>
                </HelpTip>
                {auditionLayers.map(({ id, label }) => (
                  <Chip key={id} value={id} size="xs" variant="outline">
                    {label}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            <RhythmDiffLegend />
          </div>
        </div>
        <FollowPlayhead
          scroller={scrollerRef}
          sourceId={instanceId}
          unitSeconds={pulseSeconds(settings.transport)}
          length={scale}
          cyclic={cyclic}
          active={followMode !== 'off' && playingLayers.length > 0}
          mode={followMode === 'page' ? 'page' : 'center'}
        />
      </div>
    ) : input ? (
      <DurationStrip
        label="Input"
        durations={inputLengths}
        steps={stepsOf(input)}
        cyclic={cyclic}
        boundaries={groupingMarks(input)}
      />
    ) : (
      <Text size="xs" c="dimmed">
        Connect a rhythm in the Rhythm source setting to see it here.
      </Text>
    );

  return (
    <ModuleDevice
      name={instanceLabel}
      status={input ? 'Editing the connected rhythm' : 'Needs a rhythm'}
      badges={
        edited.packet && (
          <Badge variant="outline">
            {edited.changed} {edited.changed === 1 ? 'note' : 'notes'} changed
          </Badge>
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
      onReset={resetRhythmEdit}
      footer={
        <Text size="xs" c="dimmed" truncate aria-live="polite">
          {preview.status || 'Plays at the transport tempo; volume stays live.'}
        </Text>
      }
      controls={
        <>
          <ModuleNotices items={notices} />
          <InspectorSection
            label="Rests and ties"
            help="Choose which notes become rests or ties: a cyclic program of blocks, or rules that pick notes directly."
          >
            <SegmentedControl
              size="xs"
              fullWidth
              aria-label="How notes are chosen"
              value={mode}
              onChange={(value) => setMode(value as RhythmEditMode)}
              data={[
                { value: 'program', label: 'Program' },
                { value: 'rules', label: 'Rules' },
              ]}
            />
            {mode === 'program' ? (
              <>
                <TextInput
                  label={
                    <HelpTip help="Cyclic blocks [action,count]: x keeps, r rests, ~ ties into the next note, u unties. [x,2][r,1] keeps two notes then rests one; a bare x x r is every count 1. A count can be n.">
                      Structure program
                    </HelpTip>
                  }
                  aria-label="Structure program"
                  value={program}
                  error={hasErrors}
                  onChange={(event) => setProgram(event.currentTarget.value)}
                />
                <Group gap="xs" grow>
                  <NumberInput
                    label={<HelpTip help="Notes that pass before the program starts.">Phase</HelpTip>}
                    aria-label="Structure program phase"
                    min={0}
                    value={editSettings.programPhase}
                    onChange={(value) => update({ programPhase: whole(value, 0) })}
                  />
                  <NumberInput
                    label={
                      <HelpTip help="The program acts on every this-many-th note; the notes between pass through.">
                        Rate
                      </HelpTip>
                    }
                    aria-label="Structure program rate"
                    min={1}
                    value={editSettings.programRate}
                    onChange={(value) => update({ programRate: whole(value, 1) })}
                  />
                </Group>
              </>
            ) : (
              <Textarea
                label={
                  <HelpTip help="One rule per line: a selector, then an action. Selectors: 3, 4-6, 1,3,5, every 3 from 2, first, last, all, >2 or <=1 (by length). Actions: x r ~ u, or a length action such as *3/2. Later rules override earlier ones; notes start at 1.">
                    Rules
                  </HelpTip>
                }
                aria-label="Edit rules"
                autosize
                minRows={3}
                value={rules}
                error={hasErrors}
                onChange={(event) => setRules(event.currentTarget.value)}
              />
            )}
          </InspectorSection>

          <InspectorSection
            label="Note lengths"
            help="Change how long each note is, per note, as exact fractions."
          >
            <TextInput
              label={
                <HelpTip help="Per note: o leaves it, *3/5 multiplies (a bare fraction like 3/5 does too, and /2 divides), +1 or -1/2 adds or removes pulses, =2 sets it. [*3/5,2][o,1] shortens two notes then skips one. Leave it empty to change no lengths.">
                  Length program
                </HelpTip>
              }
              aria-label="Length program"
              value={lengths}
              error={hasErrors}
              onChange={(event) => setLengths(event.currentTarget.value)}
            />
            <Group gap="xs" grow>
              <NumberInput
                label={<HelpTip help="Notes that pass before the program starts.">Phase</HelpTip>}
                aria-label="Length program phase"
                min={0}
                value={editSettings.lengthPhase}
                onChange={(value) => update({ lengthPhase: whole(value, 0) })}
              />
              <NumberInput
                label={
                  <HelpTip help="The program acts on every this-many-th note; the notes between pass through.">
                    Rate
                  </HelpTip>
                }
                aria-label="Length program rate"
                min={1}
                value={editSettings.lengthRate}
                onChange={(value) => update({ lengthRate: whole(value, 1) })}
              />
            </Group>
          </InspectorSection>

          <ModuleInspectorContent>
            <InspectorSection
              label="Variable n"
              help="A count of n starts at Start and changes by Change after every this many completed blocks of the program that uses it, never below 1."
            >
              <Group gap="xs" grow>
                <NumberInput
                  label="Start"
                  aria-label="n start"
                  min={1}
                  value={editSettings.nStart}
                  onChange={(value) => update({ nStart: whole(value, 1) })}
                />
                <NumberInput
                  label="Change"
                  aria-label="n change"
                  value={editSettings.nChange}
                  onChange={(value) => update({ nChange: Math.trunc(Number(value) || 0) })}
                />
                <NumberInput
                  label="Every"
                  aria-label="n every"
                  min={1}
                  value={editSettings.nEvery}
                  onChange={(value) => update({ nEvery: whole(value, 1) })}
                />
              </Group>
            </InspectorSection>
            <InspectorSection label="Display">
              <Switch
                label={
                  <HelpTip help="Draws each program note by note above the input: which notes it acts on, which it skips, and the blocks it works in.">
                    Show program tracks
                  </HelpTip>
                }
                aria-label="Show program tracks"
                checked={showTracks}
                onChange={(event) => setShowTracks(event.currentTarget.checked)}
              />
              <Select
                label={
                  <HelpTip help="While a preview plays, a long rhythm can scroll with the playhead. Centered scrolls continuously once it reaches the middle; a page jumps when it nears the edge, which is far less motion. Zooming out also slows the scroll.">
                    Follow playback
                  </HelpTip>
                }
                aria-label="Follow playback"
                allowDeselect={false}
                value={followMode}
                data={[
                  { value: 'center', label: 'Centered, as in a DAW' },
                  { value: 'page', label: 'A page at a time' },
                  { value: 'off', label: 'Off' },
                ]}
                onChange={(value) => value && setFollowMode(value as FollowMode)}
              />
            </InspectorSection>
            <InspectorSection
              label="Grouping"
              help="A rhythm from Interference carries beat boundaries. Dropped, they are removed because notes no longer line up with them. Kept, they stay at the same pulses and notes may cross them. Moved, each boundary stays at the same place inside the note it falls in, so groups become unequal."
            >
              <Select
                label="When lengths change"
                aria-label="Grouping when lengths change"
                allowDeselect={false}
                value={grouping}
                data={[
                  { value: 'drop', label: 'Drop the grouping' },
                  { value: 'keep', label: 'Keep boundaries at the same pulses' },
                  { value: 'follow', label: 'Move boundaries with the notes' },
                ]}
                onChange={(value) => value && setGrouping(value as GroupingPolicy)}
              />
            </InspectorSection>
            <InspectorSection label="Inputs">
              <SourceMenu
                label="Rhythm source"
                placeholder="Connect a rhythm"
                options={rhythmOptions}
                value={bindingRhythm?.source ? outputRefKey(bindingRhythm.source) : null}
                onChange={(value) => onBind('rhythm', value ? parseOutputRef(value) : null)}
              />
            </InspectorSection>
            <InspectorSection label="Preview">
              {auditionLayers.map(({ id, label, voice }) => (
                <div className={classes.moduleParameterRow} key={id}>
                  <Text size="xs">{label}</Text>
                  <SoundOverrideControl
                    label={label}
                    set={settings.sounds.rhythm}
                    voiceIndex={voice}
                    value={layerSounds[id]}
                    onChange={(sound) => setLayerSounds({ ...layerSounds, [id]: sound })}
                  />
                </div>
              ))}
              <VolumeControl
                accessibleLabel="Rhythm Edit preview volume"
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
