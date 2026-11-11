import { useEffect, useSyncExternalStore } from 'react';
import {
  ActionIcon,
  Group,
  NumberInput,
  Popover,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { useCompositionSettings } from '../compositionSettings';
import { useHistory } from '../history';
import { useRegisteredPreview } from '../previewRegistry';
import {
  MAX_TEMPO,
  MIN_TEMPO,
  transportMeterOptions,
  transportPulseOptions,
  type TransportSettings,
} from '../transport';
import { VolumeControl } from './VolumeControl';

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 000 12h3" />
    </svg>
  );
}

function MetronomeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 3h6l4 18H5z" />
      <path d="M12 16l6-9" />
      <path d="M7.5 14h9" />
    </svg>
  );
}

const meterData = transportMeterOptions.map((value) => ({ value, label: value }));
const pulseData = transportPulseOptions.map(({ value, label }) => ({
  value,
  label: `Pulse = ${label.toLowerCase()}`,
}));

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [role="switch"], [role="checkbox"], [role="combobox"], [role="option"], [role="listbox"], [role="tab"]'
      )
    )
  );
}

function MeterAndPulse({
  transport,
  update,
  inPopover = false,
}: {
  transport: TransportSettings;
  update(patch: Partial<TransportSettings>): void;
  /** Inside the popover the option list must not portal out, or picking one closes the popover. */
  inPopover?: boolean;
}) {
  return (
    <>
      <Select
        size="xs"
        w={76}
        aria-label="Meter"
        data={meterData}
        value={transport.meter}
        allowDeselect={false}
        onChange={(value) => value && update({ meter: value })}
        comboboxProps={{ withinPortal: !inPopover }}
      />
      <Select
        size="xs"
        w={186}
        aria-label="Pulse value"
        data={pulseData}
        value={transport.pulse}
        allowDeselect={false}
        onChange={(value) => value && update({ pulse: value })}
        comboboxProps={{ withinPortal: !inPopover }}
      />
    </>
  );
}

/**
 * The header transport: Play/Stop for the selected module's preview, tempo, meter, pulse value,
 * and the metronome. Also keeps the audio engine's copy of the transport settings current.
 */
export function TransportBar({ selectedInstanceId }: { selectedInstanceId: string | null }) {
  const { settings, updateTransport } = useCompositionSettings();
  const transport = settings.transport;
  const engine = useAudioEngine();
  const playing = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.playing
  );
  const playSelected = useRegisteredPreview(selectedInstanceId);
  const { undo, redo, canUndo, canRedo } = useHistory();

  const metronomeSounds = settings.sounds.metronome;
  useEffect(() => {
    engine.setTransport(transport, metronomeSounds);
  }, [engine, transport, metronomeSounds]);

  // Space toggles play/stop, as in a DAW — unless focus is in a control that uses the key itself.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.code !== 'Space' ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      if (engine.playing) {
        engine.stopAll();
      } else {
        playSelected?.();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [engine, playSelected]);

  // Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, from anywhere including text boxes: the
  // workbench history is what a change in a field undoes, so the browser's own per-field undo must
  // not take over.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      const isRedo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.metaKey);
      if (!isUndo && !isRedo) {
        return;
      }
      event.preventDefault();
      if (isUndo) {
        undo();
      } else {
        redo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return (
    <Group gap={6} wrap="nowrap" role="toolbar" aria-label="Transport">
      <Group gap={6} wrap="nowrap" role="group" aria-label="History" mr="sm">
        <Tooltip label="Undo the last change (Ctrl+Z)">
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Undo"
            data-info="Undo the last change to the patch, a module or the desk. History lasts until the page is reloaded."
            disabled={!canUndo}
            onClick={undo}
          >
            <UndoIcon />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Redo the undone change (Ctrl+Shift+Z)">
          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Redo"
            data-info="Redo the change you just undid."
            disabled={!canRedo}
            onClick={redo}
          >
            <RedoIcon />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Tooltip
        label={
          playSelected ? 'Play the selected module (Space)' : 'The selected module has no preview'
        }
      >
        <ActionIcon
          variant={playing ? 'light' : 'filled'}
          size="lg"
          aria-label="Play selected module"
          disabled={!playSelected}
          onClick={() => playSelected?.()}
        >
          <PlayIcon />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Stop all previews (Space while playing)">
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Stop all previews"
          onClick={() => engine.stopAll()}
        >
          <StopIcon />
        </ActionIcon>
      </Tooltip>
      <NumberInput
        size="xs"
        w={92}
        aria-label="Tempo"
        suffix=" BPM"
        min={MIN_TEMPO}
        max={MAX_TEMPO}
        clampBehavior="blur"
        allowDecimal={false}
        value={transport.tempo}
        onChange={(value) =>
          typeof value === 'number' && value >= MIN_TEMPO && updateTransport({ tempo: value })
        }
      />
      <Group gap={6} wrap="nowrap" visibleFrom="sm">
        <MeterAndPulse transport={transport} update={updateTransport} />
      </Group>
      <Tooltip label={transport.metronome ? 'Metronome on' : 'Metronome off'}>
        <ActionIcon
          variant={transport.metronome ? 'filled' : 'default'}
          size="lg"
          aria-label="Metronome"
          aria-pressed={transport.metronome}
          onClick={() => updateTransport({ metronome: !transport.metronome })}
        >
          <MetronomeIcon />
        </ActionIcon>
      </Tooltip>
      <Popover position="bottom" withArrow shadow="md" width={260}>
        <Popover.Target>
          <ActionIcon variant="subtle" size="lg" aria-label="Metronome options">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="sm">
            <VolumeControl
              accessibleLabel="Metronome volume"
              label="Click volume"
              value={transport.metronomeVolume}
              onChange={(value) => updateTransport({ metronomeVolume: value })}
            />
            <Switch
              size="xs"
              label="Count in one bar"
              checked={transport.countIn}
              onChange={(event) => updateTransport({ countIn: event.currentTarget.checked })}
            />
            <Stack gap={6} hiddenFrom="sm">
              <MeterAndPulse transport={transport} update={updateTransport} inPopover />
            </Stack>
            <Text size="xs" c="dimmed">
              The click marks the meter's beats, accenting each downbeat. One rhythm pulse lasts one{' '}
              {transportPulseOptions
                .find((option) => option.value === transport.pulse)
                ?.label.toLowerCase() ?? 'pulse'}
              .
            </Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
