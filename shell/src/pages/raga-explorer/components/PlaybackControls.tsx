import {
  ActionIcon,
  Divider,
  Group,
  NumberInput,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { COMMON_TONICS, MELODY_INSTRUMENTS, SARGAM_DEGREES, type Settings } from '../settings';
import { TanpuraSequenceEditor } from './TanpuraSequenceEditor';

export interface PlaybackControlsProps {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export function PlaybackControls({
  settings,
  set,
  playing,
  onPlay,
  onStop,
  disabled,
}: PlaybackControlsProps) {
  return (
    <Stack gap="sm">
      <Group gap="sm" wrap="wrap">
        <ActionIcon
          size="lg"
          variant="filled"
          color={playing ? 'red' : 'blue'}
          onClick={playing ? onStop : onPlay}
          disabled={disabled}
          aria-label={playing ? 'Stop' : 'Play'}
          title={playing ? 'Stop' : 'Play aroha then avaroha'}
        >
          {playing ? '■' : '▶'}
        </ActionIcon>
        <Switch
          label="Loop"
          checked={settings.loop}
          onChange={(e) => set('loop', e.currentTarget.checked)}
        />
        <Switch
          label="Tanpura"
          checked={settings.tanpuraOn}
          onChange={(e) => set('tanpuraOn', e.currentTarget.checked)}
        />
      </Group>

      <Group gap="sm" grow wrap="wrap">
        <Select
          label="Melody instrument"
          data={MELODY_INSTRUMENTS}
          value={settings.melodyInstrument}
          onChange={(v) => v && set('melodyInstrument', v as Settings['melodyInstrument'])}
          allowDeselect={false}
        />
        <Select
          label="Root (Sa) pitch"
          data={COMMON_TONICS.map((t) => ({ value: String(t.hz), label: t.label }))}
          value={String(settings.tonicHz)}
          onChange={(v) => v && set('tonicHz', Number(v))}
          allowDeselect={false}
        />
      </Group>

      <Select
        label="Root sargam"
        description="Which degree of this raga's own scale sounds as Sa"
        data={SARGAM_DEGREES}
        value={settings.rootSargam}
        onChange={(v) => v && set('rootSargam', v as Settings['rootSargam'])}
        allowDeselect={false}
      />

      <Group gap="sm" grow wrap="wrap">
        <div>
          <Text size="sm" mb={2}>
            Melody tempo ({settings.noteDurationMs} ms/note)
          </Text>
          <Slider
            min={120}
            max={900}
            step={20}
            value={settings.noteDurationMs}
            onChange={(v) => set('noteDurationMs', v)}
            label={null}
          />
        </div>
        <NumberInput
          label="Gap (ms)"
          min={0}
          max={300}
          step={10}
          value={settings.gapMs}
          onChange={(v) => set('gapMs', Number(v) || 0)}
        />
      </Group>

      <Group gap="sm" grow wrap="wrap">
        <div>
          <Text size="sm" mb={2}>
            Melody volume
          </Text>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={settings.melodyVolume}
            onChange={(v) => set('melodyVolume', v)}
            label={null}
          />
        </div>
        <div>
          <Text size="sm" mb={2}>
            Tanpura volume
          </Text>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={settings.tanpuraVolume}
            onChange={(v) => set('tanpuraVolume', v)}
            label={null}
          />
        </div>
      </Group>

      <Divider label="Tanpura" labelPosition="left" />

      <div>
        <Text size="sm" mb={2}>
          Tanpura tempo ({settings.tanpuraIntervalMs} ms between plucks)
        </Text>
        <Slider
          min={600}
          max={4000}
          step={100}
          value={settings.tanpuraIntervalMs}
          onChange={(v) => set('tanpuraIntervalMs', v)}
          label={null}
        />
      </div>

      <TanpuraSequenceEditor
        value={settings.tanpuraSequence}
        onChange={(v) => set('tanpuraSequence', v)}
      />
    </Stack>
  );
}
