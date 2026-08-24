import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Slider,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { volumePercentToGain } from '../audio';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { createPitchPreviewPlan } from '../audio/performancePlans';
import type { PlaybackSession } from '../audio/types';
import type {
  CompositionModuleRoutingProps,
  PublishedCompositionOutput,
} from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import { formatPitchClassGroup, type ForteSetSelection } from '../forteCatalog';
import type { DataPacket } from '../model';
import {
  formatMidicents,
  interpretPitchList,
  pitchClassGroupToArray,
  pitchClassName,
  pitchGroupToArray,
  type PitchClassItemValue,
  type PitchInputFormat,
  type PitchItemValue,
} from '../pitch';
import {
  acceptsFiniteNumber,
  acceptsNumberOrString,
  acceptsString,
  compositionStateKeys,
  compositionInstanceStateKey,
  usePersistentState,
} from '../usePersistentState';
import { ForteCatalogBrowser } from './ForteCatalogBrowser';
import { Module, ModuleOutput, ModuleSection } from './Module';
import { VolumeControl } from './VolumeControl';
import classes from '../CompositionWorkbench.module.css';

const formatOptions = [
  { value: 'midi-note', label: 'MIDI notes', example: '60, 62, 66.5' },
  { value: 'midicent', label: 'Midicents', example: '6000, 6200, 6650' },
  { value: 'note-name', label: 'Note names with octave', example: 'C4, D4, F#4' },
  { value: 'pitch-class', label: 'Pitch classes', example: '0, D, F#' },
] satisfies { value: PitchInputFormat; label: string; example: string }[];

const initialValues: Record<PitchInputFormat, string> = {
  'midi-note': '60, 62, 64, 67, 66.5',
  midicent: '6000, 6200, 6400, 6700, 6650',
  'note-name': 'C4, D4, E4, G4, F#4',
  'pitch-class': '0, 2, 4, 7, 6',
};

type CatalogOrigins = Record<string, ForteSetSelection>;

function acceptsCatalogOrigins(value: unknown): value is CatalogOrigins {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (origin) =>
      Boolean(origin) &&
      typeof origin === 'object' &&
      typeof (origin as ForteSetSelection).forteNumber === 'string' &&
      Array.isArray((origin as ForteSetSelection).primeForm) &&
      Array.isArray((origin as ForteSetSelection).intervalClassVector) &&
      typeof (origin as ForteSetSelection).transposition === 'number' &&
      typeof (origin as ForteSetSelection).inverted === 'boolean' &&
      Array.isArray((origin as ForteSetSelection).pitchClasses)
  );
}

export interface PitchListModuleProps extends CompositionModuleRoutingProps {
  instanceId: string;
  instanceLabel: string;
  upstream?: DataPacket;
}

export function PitchListModule({
  instanceId,
  instanceLabel,
  upstream,
  onOutputsChange,
}: PitchListModuleProps) {
  const { settings } = useCompositionSettings();
  const edo = settings.edo;
  const stateKey = (key: string) => compositionInstanceStateKey(key, instanceId, 'pitch-list');
  const [format, setFormat] = usePersistentState<PitchInputFormat>(
    stateKey(compositionStateKeys.pitchFormat),
    'midi-note',
    (value): value is PitchInputFormat =>
      value === 'midi-note' ||
      value === 'midicent' ||
      value === 'note-name' ||
      value === 'pitch-class'
  );
  const [inlineValues, setInlineValues] = usePersistentState(
    stateKey(compositionStateKeys.pitchValues),
    () => initialValues[format],
    acceptsString
  );
  const [catalogOrigins, setCatalogOrigins] = usePersistentState<CatalogOrigins>(
    stateKey(compositionStateKeys.pitchCatalogOrigins),
    {},
    acceptsCatalogOrigins
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
  const [audioStatus, setAudioStatus] = useState('');
  const [catalogOpened, setCatalogOpened] = useState(false);
  const audioEngine = useAudioEngine();
  const playbackSession = useRef<PlaybackSession | null>(null);
  const playRequestVersion = useRef(0);

  const inlineProvenance = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(catalogOrigins).map(([index, origin]) => [
          index,
          [
            {
              sourceModuleInstance: instanceId,
              sourceItemIds: [],
              transformation: 'select-forte-set',
              parameters: {
                forteNumber: origin.forteNumber,
                primeForm: origin.primeForm,
                intervalClassVector: origin.intervalClassVector,
                transposition: origin.transposition,
                inverted: origin.inverted,
                pitchClasses: origin.pitchClasses,
              },
            },
          ],
        ])
      ),
    [catalogOrigins, instanceId]
  );
  const interpreted = useMemo(
    () =>
      interpretPitchList({
        instanceId,
        format,
        inlineText: inlineValues,
        inlineProvenance,
        upstream,
        edo,
      }),
    [format, inlineProvenance, inlineValues, instanceId, upstream, edo]
  );
  const publishedOutput = useMemo<PublishedCompositionOutput>(
    () => ({
      ref: { instanceId, port: 'pitches' },
      label: `${instanceLabel} · Pitches`,
      packet: interpreted.packet,
    }),
    [instanceId, instanceLabel, interpreted.packet]
  );

  useEffect(() => {
    onOutputsChange?.(instanceId, [publishedOutput]);
  }, [instanceId, onOutputsChange, publishedOutput]);
  const inputDefinesFormat = upstream?.domain === 'pitch' || upstream?.domain === 'pitchClass';
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
  const minimum = Math.min(...pitchVoices.map((point) => point.midicents), 6000);
  const maximum = Math.max(...pitchVoices.map((point) => point.midicents), 6000);
  const range = Math.max(100, maximum - minimum);
  const coordinates = pitchGroups.map((group, index) => ({
    ...group,
    x: pitchGroups.length === 1 ? 500 : 50 + (index * 900) / (pitchGroups.length - 1),
    pitches: group.pitches.map((pitch) => ({
      ...pitch,
      y: 280 - ((pitch.midicents - minimum) / range) * 240,
    })),
  }));

  useEffect(
    () => () => {
      playRequestVersion.current += 1;
      playbackSession.current?.stop();
      playbackSession.current = null;
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
    setAudioStatus(message);
  }

  async function playPreview() {
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
    stopPreview('');
    const requestVersion = playRequestVersion.current;
    const { plan, audibleEvents, skippedEvents } = createPitchPreviewPlan({
      sourceId: instanceId,
      groups: pitchGroups,
      stepSeconds,
      gatePercent,
    });
    const totalSeconds = plan.durationSeconds;
    setAudioStatus(
      skippedEvents === 0
        ? `Playing ${pitchGroups.length} pitch groups over ${totalSeconds.toFixed(1)} seconds.`
        : `Playing ${audibleEvents} audible pitches; ${skippedEvents} lie outside 20–20,000 Hz.`
    );
    try {
      const session = await audioEngine.play({
        plan,
        busGains: { preview: volumePercentToGain(volume) },
        onComplete: () => {
          playbackSession.current = null;
          setAudioStatus('Preview complete.');
        },
      });
      if (requestVersion !== playRequestVersion.current) {
        session.stop();
        return;
      }
      playbackSession.current = session;
    } catch (error) {
      setAudioStatus(error instanceof Error ? error.message : 'Audio preview could not start.');
    }
  }

  function changeFormat(value: string | null) {
    if (!value || inputDefinesFormat) {
      return;
    }
    const next = value as PitchInputFormat;
    setFormat(next);
    setInlineValues(initialValues[next]);
    setCatalogOrigins({});
  }

  function replaceWithForteSet(selection: ForteSetSelection) {
    stopPreview('');
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
    stopPreview('');
    setFormat('midi-note');
    setInlineValues(initialValues['midi-note']);
    setCatalogOrigins({});
    setStepMilliseconds(300);
    setGatePercent(75);
    setPreviewOctave(4);
    setVolume(30);
    setAudioStatus('Pitch List module reset.');
  }

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
      <Surface className={classes.interferenceSurface}>
        <div className={classes.interferenceLayout}>
          <div className={classes.resultInspector}>
            <Group justify="space-between" align="start" mb="md">
              <div>
                <Title order={2} size="h3">
                  {instanceLabel}
                </Title>
                <Text c="dimmed" size="sm">
                  {interpreted.source === 'upstream'
                    ? 'Reading the connected list'
                    : 'Reading the inline list'}
                </Text>
              </div>
              <Group gap="xs">
                <Badge variant="outline">{interpreted.packet.items.length} groups</Badge>
                <Badge variant="outline">{pitchVoices.length} pitches</Badge>
                <Badge variant="outline">{interpreted.packet.domain}</Badge>
              </Group>
            </Group>

            {interpreted.errors.length > 0 && (
              <Alert color="red" title="Some values could not be read" mb="md">
                {interpreted.errors.join('; ')}
              </Alert>
            )}

            {coordinates.length > 0 && (
              <Stack gap="md">
                <div className={classes.pitchPlot}>
                  <svg
                    viewBox="0 0 1000 320"
                    role="img"
                    aria-label={`Pitch list ${coordinates.map((group) => group.label).join(' | ')}`}
                    preserveAspectRatio="none"
                  >
                    {[40, 100, 160, 220, 280].map((y) => (
                      <line
                        key={y}
                        x1="35"
                        x2="965"
                        y1={y}
                        y2={y}
                        className={classes.pitchGridLine}
                      />
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
                              r="8"
                              className={classes.pitchPoint}
                            />
                            {coordinates.length <= 24 && (
                              <text x={group.x} y={Math.max(18, pitch.y - 14)} textAnchor="middle">
                                {pitch.label}
                              </text>
                            )}
                          </g>
                        ))}
                        <text x={group.x} y="308" textAnchor="middle">
                          {index + 1}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
                <Text ff="monospace" size="sm" className={classes.pitchValues}>
                  {interpreted.packet.items.map((item) => item.label).join(' | ')}
                </Text>
                {interpreted.packet.domain === 'pitchClass' && (
                  <Text size="xs" c="dimmed">
                    The preview register is only for listening. The output remains a pitch-class
                    list without register.
                  </Text>
                )}
              </Stack>
            )}
          </div>

          <Module
            name={instanceLabel}
            status={upstream ? 'Upstream input' : 'Inline input'}
            onReset={resetPitchList}
            output={<ModuleOutput name="Pitches" packet={interpreted.packet} />}
            footer={
              <Text size="xs" c="dimmed" truncate aria-live="polite">
                {audioStatus || 'Preview timing does not alter the pitch-list output.'}
              </Text>
            }
          >
            <ModuleSection label="Values" grow>
              <Stack gap="xs">
                <Group gap="xs">
                  <Badge size="xs" variant="light">
                    {upstream ? 'Upstream' : 'Inline'}
                  </Badge>
                  {upstream && (
                    <Text size="xs" c="dimmed">
                      {upstream.domain} list connected; inline values are inactive.
                    </Text>
                  )}
                </Group>
                <TextInput
                  size="xs"
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
                  size="compact-xs"
                  variant="default"
                  disabled={Boolean(upstream)}
                  onClick={() => setCatalogOpened(true)}
                >
                  Browse Forte catalog
                </Button>
              </Stack>
            </ModuleSection>

            <ModuleSection label="Interpretation">
              <Stack gap="xs">
                <Select
                  size="xs"
                  label="Read list as"
                  aria-label="Read list as"
                  value={displayedFormat}
                  data={formatOptions.map(({ value, label }) => ({ value, label }))}
                  disabled={inputDefinesFormat}
                  onChange={changeFormat}
                />
                <Text size="xs" c="dimmed" className={classes.moduleHint}>
                  {inputDefinesFormat
                    ? 'The connected typed list identifies its own interpretation.'
                    : `Example: ${formatOptions.find((option) => option.value === format)?.example}`}
                </Text>
              </Stack>
            </ModuleSection>

            <ModuleSection label="Preview">
              <Stack gap="xs">
                <div className={classes.moduleParameterRow}>
                  <Text size="xs">Step</Text>
                  <NumberInput
                    size="xs"
                    aria-label="Preview step duration"
                    suffix=" ms"
                    min={20}
                    max={5000}
                    value={stepMilliseconds}
                    onChange={setStepMilliseconds}
                  />
                </div>
                <div className={classes.moduleParameterRow}>
                  <Text size="xs">Gate</Text>
                  <Group gap="xs" wrap="nowrap" className={classes.volumeControl}>
                    <Slider
                      thumbLabel="Preview gate length"
                      min={1}
                      max={200}
                      value={gatePercent}
                      onChange={setGatePercent}
                    />
                    <Text ff="monospace" size="xs" w="2.5rem" ta="right">
                      {gatePercent}%
                    </Text>
                  </Group>
                </div>
                {interpreted.packet.domain === 'pitchClass' && (
                  <div className={classes.moduleParameterRow}>
                    <Text size="xs">Register</Text>
                    <NumberInput
                      size="xs"
                      aria-label="Pitch-class preview octave"
                      min={-1}
                      max={9}
                      value={previewOctave}
                      onChange={setPreviewOctave}
                    />
                  </div>
                )}
                <VolumeControl
                  accessibleLabel="Pitch preview volume"
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
    </>
  );
}
