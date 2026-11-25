import { useState } from 'react';
import { Alert, Badge, Group, Slider, Text } from '@mantine/core';
import { Button, ScrubNumber, Select, Switch, TextInput } from '../../../ui';
import { createPitchPreviewPlan } from '../audio/performancePlans';
import { useCompositionSettings } from '../compositionSettings';
import { formatPitchClassGroup, type ForteSetSelection } from '../forteCatalog';
import type { DataPacket } from '../model';
import {
  formatMidicents,
  convertPitchText,
  pitchClassGroupToArray,
  pitchClassName,
  pitchGroupToArray,
  type PitchClassItemValue,
  type PitchInputFormat,
  type PitchItemValue,
} from '../pitch';
import { useNodeEvaluationResult } from '../runtime/evaluationStore';
import { useNodeState } from '../runtime/nodeState';
import { pitchListInitialValues, pitchListState } from '../runtime/nodeState/pitchList';
import { useNodePreview } from '../useNodePreview';
import {
  acceptsFiniteNumber,
  acceptsNumberOrString,
  acceptsBoolean,
  compositionStateKeys,
  compositionInstanceStateKey,
  usePersistentState,
} from '../usePersistentState';
import { ForteCatalogBrowser } from './ForteCatalogBrowser';
import { NodeDevice } from './NodeDevice';
import { HelpTip, InspectorSection, NodeInspectorContent, NodeOutputsSection } from './NodeHost';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

const formatOptions = [
  { value: 'midi-note', label: 'MIDI notes', example: '60, 62, 66.5' },
  { value: 'midicent', label: 'Midicents', example: '6000, 6200, 6650' },
  { value: 'note-name', label: 'Note names with octave', example: 'C4, D4, F#4' },
  { value: 'pitch-class', label: 'Pitch classes', example: '0, D, F#' },
] satisfies { value: PitchInputFormat; label: string; example: string }[];

export interface PitchListNodeProps {
  instanceId: string;
  instanceLabel: string;
  upstream?: DataPacket;
}

export function PitchListNode({ instanceId, instanceLabel, upstream }: PitchListNodeProps) {
  const { settings } = useCompositionSettings();
  const edo = settings.edo;
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId);
  const [{ format, inlineValues }, state] = useNodeState(pitchListState, instanceId);
  const {
    format: setFormat,
    inlineValues: setInlineValues,
    catalogOrigins: setCatalogOrigins,
  } = state;
  // On: picking another "Read list as" rewrites the typed values to keep the same pitches. Off: the
  // text stays exactly as typed and is simply read differently.
  const [convertOnChange, setConvertOnChange] = usePersistentState(
    stateKey(compositionStateKeys.pitchConvertOnChange),
    true,
    acceptsBoolean
  );
  const [stepMilliseconds, setStepMilliseconds] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.pitchStep),
    300,
    acceptsNumberOrString
  );
  const [gatePercent, setGatePercent] = usePersistentState(
    stateKey(compositionStateKeys.pitchGate),
    75,
    acceptsFiniteNumber
  );
  const [previewOctave, setPreviewOctave] = usePersistentState<number | string>(
    stateKey(compositionStateKeys.pitchOctave),
    4,
    acceptsNumberOrString
  );
  const [volume, setVolume] = usePersistentState(
    stateKey(compositionStateKeys.pitchVolume),
    30,
    acceptsFiniteNumber
  );
  const [catalogOpened, setCatalogOpened] = useState(false);

  const { interpreted, outputs } = useNodeEvaluationResult('pitch-list', instanceId);
  const inputDefinesFormat =
    upstream?.kind === 'list' && (upstream.domain === 'pitch' || upstream.domain === 'pitchClass');
  const displayedFormat = inputDefinesFormat
    ? upstream.domain === 'pitchClass'
      ? 'pitch-class'
      : (upstream.encoding ?? format)
    : format;
  const pitchGroups =
    interpreted.packet.domain === 'pitchClass'
      ? interpreted.packet.items.map((item) => {
          const pitchClasses = pitchClassGroupToArray(item.value as PitchClassItemValue);
          const centsPerStep = 1200 / edo;
          return {
            id: item.id,
            label: item.label ?? '',
            pitches: pitchClasses.map((pitchClass, pitchIndex) => ({
              id: `${item.id}:pitch:${pitchIndex}`,
              label: pitchClassName(pitchClass, edo),
              midicents: (Number(previewOctave) + 1) * 1200 + pitchClass * centsPerStep,
            })),
            provenance: item.provenance,
          };
        })
      : interpreted.packet.items.map((item) => {
          const pitches = pitchGroupToArray(item.value as PitchItemValue);
          return {
            id: item.id,
            label: item.label ?? '',
            pitches: pitches.map((midicents, pitchIndex) => ({
              id: `${item.id}:pitch:${pitchIndex}`,
              label: formatMidicents(midicents),
              midicents,
            })),
            provenance: item.provenance,
          };
        });
  const pitchVoices = pitchGroups.flatMap((group) => group.pitches);
  // The vertical axis fits the pitches actually present, with a margin, and the plot is taller the
  // wider their span (a narrow melody is a shallow strip, a wide one gets room). Gridlines fall on
  // whole semitones, whole tones, minor thirds, tritones, octaves... whichever keeps about seven or fewer.
  const dataLow = pitchVoices.length
    ? Math.min(...pitchVoices.map((point) => point.midicents))
    : 6000;
  const dataHigh = pitchVoices.length
    ? Math.max(...pitchVoices.map((point) => point.midicents))
    : 6000;
  const dataSpan = Math.max(200, dataHigh - dataLow);
  const margin = dataSpan * 0.12;
  const axisLow = (dataLow + dataHigh) / 2 - dataSpan / 2 - margin;
  const axisSpan = dataSpan + 2 * margin;
  const plotHeight = Math.round(Math.min(360, Math.max(190, 150 + (dataSpan / 100) * 6)));
  const plotTop = 28;
  const plotBottom = plotHeight - 40;
  const pitchY = (midicents: number) =>
    plotBottom - ((midicents - axisLow) / axisSpan) * (plotBottom - plotTop);
  const gridStep =
    [100, 200, 300, 600, 1200, 2400, 4800, 9600].find((step) => axisSpan / step <= 7) ?? 9600;
  const gridPitches: number[] = [];
  for (
    let midicents = Math.ceil(axisLow / gridStep) * gridStep;
    midicents <= axisLow + axisSpan;
    midicents += gridStep
  ) {
    gridPitches.push(midicents);
  }
  const coordinates = pitchGroups.map((group, index) => ({
    ...group,
    x: pitchGroups.length === 1 ? 525 : 90 + (index * 870) / (pitchGroups.length - 1),
    pitches: group.pitches.map((pitch) => ({
      ...pitch,
      y: pitchY(pitch.midicents),
    })),
  }));

  // Long lists get smaller dots and sparser index numbers, so neighbours never overlap: past 24 groups
  // the dot radius follows the spacing, and an index shows only every 2nd, 5th, 10th... group.
  const plotSpacing = coordinates.length > 1 ? 870 / (coordinates.length - 1) : 870;
  const dotRadius = coordinates.length <= 24 ? 8 : Math.max(2.5, Math.min(8, plotSpacing * 0.32));
  const indexStep =
    [1, 2, 5, 10, 20, 50, 100, 200, 500].find((step) => step * plotSpacing >= 40) ?? 1000;

  // Header Play starts this preview too, but it keeps its own step length: a pitch list has no
  // rhythm, so it isn't tied to the transport's pulse.
  const preview = useNodePreview({ instanceId, volume, transportPlay: playPreview });
  const setAudioStatus = preview.setStatus;

  function playPreview() {
    const stepSeconds = Number(stepMilliseconds) / 1000;
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
      setAudioStatus('Step duration must be a positive number.');
      return;
    }
    if (!pitchGroups.length) {
      setAudioStatus('Enter at least one valid pitch.');
      return;
    }
    if (pitchVoices.length > 4096) {
      setAudioStatus('This preview exceeds the 4096-note safety limit.');
      return;
    }
    const { plan, audibleEvents, skippedEvents } = createPitchPreviewPlan({
      sourceId: instanceId,
      groups: pitchGroups,
      stepSeconds,
      gatePercent,
    });
    void preview.play(
      plan,
      skippedEvents === 0
        ? `Playing ${pitchGroups.length} pitch groups over ${plan.durationSeconds.toFixed(1)} seconds.`
        : `Playing ${audibleEvents} audible pitches; ${skippedEvents} lie outside 20–20,000 Hz.`
    );
  }

  function changeFormat(value: string | null) {
    if (!value || inputDefinesFormat) {
      return;
    }
    const next = value as PitchInputFormat;
    if (convertOnChange) {
      const octave = Number(previewOctave);
      const converted = convertPitchText({
        text: inlineValues,
        from: format,
        to: next,
        octave: Number.isFinite(octave) ? octave : 4,
        edo,
      });
      if (converted.errors.length === 0) {
        setFormat(next);
        setInlineValues(converted.text);
        setCatalogOrigins({});
        setAudioStatus(converted.notes.join(' '));
        return;
      }
      // The text does not read under the current format, so there is nothing sound to convert:
      // keep it as typed under the new format and say why.
      setAudioStatus('The values could not be converted, so they were kept as typed.');
    }
    setFormat(next);
    setCatalogOrigins({});
  }

  function replaceWithForteSet(selection: ForteSetSelection) {
    preview.stop('');
    setFormat('pitch-class');
    setInlineValues(formatPitchClassGroup(selection.pitchClasses));
    setCatalogOrigins({ '0': selection });
    setAudioStatus(`${selection.forteNumber} replaced the inline list as one pitch-class group.`);
  }

  function insertForteSet(selection: ForteSetSelection) {
    if (format !== 'pitch-class' || interpreted.errors.length > 0) {
      return;
    }
    const index = interpreted.packet.items.length;
    const separator = inlineValues.trim() ? ' ' : '';
    setInlineValues(
      `${inlineValues.trim()}${separator}${formatPitchClassGroup(selection.pitchClasses)}`
    );
    setCatalogOrigins((current) => ({ ...current, [String(index)]: selection }));
    setAudioStatus(`${selection.forteNumber} inserted as pitch-class group ${index + 1}.`);
  }

  function resetPitchList() {
    preview.stop('');
    setFormat('midi-note');
    setInlineValues(pitchListInitialValues['midi-note']);
    setCatalogOrigins({});
    setStepMilliseconds(300);
    setGatePercent(75);
    setPreviewOctave(4);
    setVolume(30);
    setAudioStatus('Pitch List node reset.');
  }

  const view = (
    <>
      {interpreted.errors.length > 0 && (
        <Alert color="red" title="Some values could not be read">
          {interpreted.errors.join('; ')}
        </Alert>
      )}

      {coordinates.length > 0 && (
        <>
          <div className={classes.pitchPlot}>
            <svg
              viewBox={`0 0 1000 ${plotHeight}`}
              style={{ aspectRatio: `1000 / ${plotHeight}` }}
              role="img"
              aria-label={`Pitch list ${coordinates.map((group) => group.label).join(' | ')}`}
            >
              {gridPitches.map((midicents) => (
                <g key={midicents}>
                  <line
                    x1="62"
                    x2="975"
                    y1={pitchY(midicents)}
                    y2={pitchY(midicents)}
                    className={classes.pitchGridLine}
                  />
                  <text
                    x="56"
                    y={pitchY(midicents) + 5}
                    textAnchor="end"
                    className={classes.pitchAxisLabel}
                  >
                    {formatMidicents(midicents)}
                  </text>
                </g>
              ))}
              {coordinates.length > 1 && (
                <polyline
                  points={coordinates
                    .map(
                      (group) =>
                        `${group.x},${group.pitches.reduce((sum, pitch) => sum + pitch.y, 0) / group.pitches.length}`
                    )
                    .join(' ')}
                  className={classes.pitchLine}
                />
              )}
              {coordinates.map((group, index) => (
                <g key={group.id}>
                  {group.pitches.length > 1 && (
                    <line
                      x1={group.x}
                      x2={group.x}
                      y1={Math.min(...group.pitches.map((pitch) => pitch.y))}
                      y2={Math.max(...group.pitches.map((pitch) => pitch.y))}
                      className={classes.pitchLine}
                    />
                  )}
                  {group.pitches.map((pitch) => (
                    <g key={pitch.id}>
                      <circle
                        cx={group.x}
                        cy={pitch.y}
                        r={dotRadius}
                        className={classes.pitchPoint}
                      />
                      {coordinates.length <= 24 && (
                        <text x={group.x} y={Math.max(18, pitch.y - 14)} textAnchor="middle">
                          {pitch.label}
                        </text>
                      )}
                    </g>
                  ))}
                  {(index === 0 || (index + 1) % indexStep === 0) && (
                    <text x={group.x} y={plotHeight - 12} textAnchor="middle">
                      {index + 1}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
          <Text ff="monospace" size="sm" className={classes.pitchValues}>
            {interpreted.packet.items.map((item) => item.label).join(' | ')}
          </Text>
          {interpreted.packet.domain === 'pitchClass' && (
            <Text c="dimmed">
              The preview register is only for listening. The output remains a pitch-class list
              without register.
            </Text>
          )}
        </>
      )}
    </>
  );

  return (
    <>
      <ForteCatalogBrowser
        opened={catalogOpened}
        currentFormat={format}
        currentValuesValid={interpreted.errors.length === 0}
        onClose={() => setCatalogOpened(false)}
        onInsert={insertForteSet}
        onReplace={replaceWithForteSet}
      />
      <NodeDevice
        name={instanceLabel}
        status={
          interpreted.source === 'upstream'
            ? 'Reading the connected list'
            : 'Reading the inline list'
        }
        badges={
          <>
            <Badge variant="outline">{interpreted.packet.items.length} groups</Badge>
            <Badge variant="outline">{pitchVoices.length} pitches</Badge>
            <Badge variant="outline">{interpreted.packet.domain}</Badge>
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
        onReset={resetPitchList}
        footer={
          <Text c="dimmed" truncate aria-live="polite">
            {preview.status || 'Preview timing does not alter the pitch-list output.'}
          </Text>
        }
        controls={
          <>
            <InspectorSection label="Values">
              {upstream && (
                <Text c="dimmed">
                  {upstream.domain} list connected; inline values are inactive.
                </Text>
              )}
              <TextInput
                aria-label="Pitch values"
                description="Use brackets for simultaneous pitches, for example: 60 [60 64 67] 62."
                value={inlineValues}
                disabled={Boolean(upstream)}
                onChange={(event) => {
                  setInlineValues(event.currentTarget.value);
                  setCatalogOrigins({});
                }}
              />
              <Button
                variant="default"
                disabled={Boolean(upstream)}
                onClick={() => setCatalogOpened(true)}
              >
                Browse Forte catalog
              </Button>
              <Select
                label={
                  <HelpTip
                    help={
                      inputDefinesFormat
                        ? 'The connected typed list identifies its own interpretation.'
                        : `Example: ${formatOptions.find((option) => option.value === format)?.example}`
                    }
                  >
                    Read list as
                  </HelpTip>
                }
                aria-label="Read list as"
                value={displayedFormat}
                data={formatOptions.map(({ value, label }) => ({ value, label }))}
                disabled={inputDefinesFormat}
                onChange={changeFormat}
              />
              <Switch
                label="Convert values"
                aria-label="Convert values when the reading changes"
                checked={convertOnChange}
                disabled={inputDefinesFormat}
                onChange={(event) => setConvertOnChange(event.currentTarget.checked)}
              />
            </InspectorSection>

            <NodeInspectorContent>
              <InspectorSection label="Preview">
                <ScrubNumber
                  label="Step"
                  aria-label="Preview step duration"
                  suffix=" ms"
                  clamp={[20, 5000]}
                  step={10}
                  value={Number(stepMilliseconds) || 20}
                  onChange={setStepMilliseconds}
                />
                <div className={classes.nodeParameterRow}>
                  <Text>Gate</Text>
                  <Group gap="xs" wrap="nowrap" className={classes.volumeControl}>
                    <Slider
                      thumbLabel="Preview gate length"
                      min={1}
                      max={200}
                      value={gatePercent}
                      onChange={setGatePercent}
                    />
                    <Text ff="monospace" w="2.5rem" ta="right">
                      {gatePercent}%
                    </Text>
                  </Group>
                </div>
                {interpreted.packet.domain === 'pitchClass' && (
                  <ScrubNumber
                    label="Register"
                    aria-label="Pitch-class preview octave"
                    range={[-1, 9]}
                    defaultValue={4}
                    value={Number(previewOctave) || 0}
                    onChange={setPreviewOctave}
                  />
                )}
                <VolumeControl
                  accessibleLabel="Pitch preview volume"
                  label="Volume"
                  value={volume}
                  onChange={setVolume}
                />
              </InspectorSection>
              <NodeOutputsSection instanceLabel={instanceLabel} outputs={outputs} />
            </NodeInspectorContent>
          </>
        }
      >
        {view}
      </NodeDevice>
    </>
  );
}
