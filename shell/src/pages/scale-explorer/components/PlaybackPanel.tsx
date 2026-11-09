import { Button, Group, Select, Slider, Stack, Text } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { DRONE_WAVES, type ChordStyle, type DroneWave } from '../playback';
import type { PlayAs, Settings } from '../settings';
import { PLAYBACK_HINT } from '../texts';

interface PlaybackPanelProps {
  settings: Settings;
  names: string[];
  droneOn: boolean;
  playingAll: boolean;
  onDroneOn: (on: boolean) => void;
  onPlayAll: () => void;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export function PlaybackPanel({
  settings,
  names,
  droneOn,
  playingAll,
  onDroneOn,
  onPlayAll,
  set,
}: PlaybackPanelProps) {
  const zeroName = settings.dronePc === 'follow' ? 'C' : names[settings.dronePc];
  return (
    <Surface aria-label="Playback">
      <Stack gap="sm">
        <Group gap="xs" align="end">
          <Button
            size="xs"
            variant={droneOn ? 'filled' : 'default'}
            aria-pressed={droneOn}
            onClick={() => onDroneOn(!droneOn)}
          >
            {droneOn ? 'Drone on' : 'Drone off'}
          </Button>
          <Select
            size="xs"
            label="Play as"
            w={190}
            allowDeselect={false}
            value={settings.playAs}
            data={[
              { value: 'rotation', label: 'Rotation (original pitches)' },
              { value: 'zero', label: `Set to zero (on ${zeroName})` },
            ]}
            onChange={(v) => v && set('playAs', v as PlayAs)}
          />
          <Select
            size="xs"
            label="Wave"
            w={100}
            allowDeselect={false}
            value={settings.droneWave}
            data={DRONE_WAVES}
            onChange={(v) => v && set('droneWave', v as DroneWave)}
          />
          <Select
            size="xs"
            label="Pitch"
            w={150}
            allowDeselect={false}
            value={String(settings.dronePc)}
            data={[
              { value: 'follow', label: 'Follow mode root' },
              ...names.map((n, i) => ({ value: String(i), label: n })),
            ]}
            onChange={(v) => v && set('dronePc', v === 'follow' ? 'follow' : Number(v))}
          />
          <Stack gap={2} w={120}>
            <Text size="xs">Volume</Text>
            <Slider
              size="xs"
              min={0}
              max={1}
              step={0.01}
              value={settings.droneVolume}
              label={null}
              aria-label="Drone volume"
              onChange={(v) => set('droneVolume', v)}
            />
          </Stack>
          <Select
            size="xs"
            label="Chords"
            w={190}
            allowDeselect={false}
            value={settings.chordStyle}
            data={[
              { value: 'block', label: 'Block' },
              { value: 'arp', label: 'Arpeggio' },
              { value: 'both', label: 'Arpeggio, then block' },
            ]}
            onChange={(v) => v && set('chordStyle', v as ChordStyle)}
          />
          <Button size="xs" variant="default" onClick={onPlayAll}>
            {playingAll ? '■ Stop' : '▶ Play all modes'}
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          {PLAYBACK_HINT}
        </Text>
      </Stack>
    </Surface>
  );
}
