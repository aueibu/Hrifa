import { Button, FileButton, Group, Select, Slider, Stack, Text } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import {
  parseSoundfontVoice,
  soundfontVoiceId,
} from '../../composition-workbench/audio/soundfontLibrary';
import type { InstrumentId } from '../../composition-workbench/audio/types';
import {
  DRONE_WAVES,
  isSampledVoice,
  VOICE_CHOICES,
  type ChordStyle,
  type DroneWave,
} from '../playback';
import type { PlayAs, Settings } from '../settings';
import { PLAYBACK_HINT } from '../texts';
import type { useSoundfont } from '../useSoundfont';

interface PlaybackPanelProps {
  settings: Settings;
  names: string[];
  droneOn: boolean;
  playingAll: boolean;
  /** Samples for the chosen voice are downloading. */
  loading: boolean;
  /** Why the last playback could not start, if it could not. */
  error: string | null;
  soundfont: ReturnType<typeof useSoundfont>;
  onDroneOn: (on: boolean) => void;
  onPlayAll: () => void;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export function PlaybackPanel({
  settings,
  names,
  droneOn,
  playingAll,
  loading,
  error,
  soundfont,
  onDroneOn,
  onPlayAll,
  set,
}: PlaybackPanelProps) {
  const fileInfo = soundfont.info;
  const chosen = parseSoundfontVoice(settings.voice);
  const chosenPreset =
    fileInfo && chosen?.fileId === fileInfo.id
      ? fileInfo.presets.find(
          (p) =>
            p.bank === chosen.bank && p.bankLSB === chosen.bankLSB && p.program === chosen.program
        )
      : undefined;
  // a SoundFont voice remembered from an earlier visit shows while its file is not open yet
  const pendingVoice = chosen && !chosenPreset;
  const soundData =
    chosenPreset || pendingVoice
      ? [
          ...VOICE_CHOICES,
          {
            group: 'SoundFont',
            items: [
              {
                value: settings.voice,
                label: chosenPreset ? chosenPreset.name : 'SoundFont (open the file to use)',
              },
            ],
          },
        ]
      : VOICE_CHOICES;
  const presetData = fileInfo
    ? [...new Set(fileInfo.presets.map((p) => p.bank))].map((bank) => ({
        group: bank === 128 ? 'Drum kits' : bank === 0 ? 'General MIDI (bank 0)' : `Bank ${bank}`,
        items: fileInfo.presets
          .filter((p) => p.bank === bank)
          .map((p) => ({
            value: soundfontVoiceId(fileInfo.id, p),
            label: `${String(p.program + 1).padStart(3, '0')}${p.bankLSB ? `.${p.bankLSB}` : ''} ${p.name}`,
          })),
      }))
    : [];
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
            label="Sound"
            w={170}
            allowDeselect={false}
            value={settings.voice}
            data={soundData}
            onChange={(v) => v && set('voice', v as InstrumentId)}
          />
          {soundfont.canRemember ? (
            <Button
              size="xs"
              variant="default"
              loading={soundfont.loading}
              onClick={() => void soundfont.pick()}
            >
              Open SoundFont…
            </Button>
          ) : (
            <FileButton accept=".sf2" onChange={(file) => file && void soundfont.openFile(file)}>
              {(props) => (
                <Button size="xs" variant="default" loading={soundfont.loading} {...props}>
                  Open SoundFont…
                </Button>
              )}
            </FileButton>
          )}
          {soundfont.remembered && !fileInfo && (
            <Group gap={4}>
              <Button
                size="xs"
                variant="light"
                loading={soundfont.loading}
                onClick={() => void soundfont.reconnect()}
              >
                Reconnect {soundfont.remembered.name}
              </Button>
              <Button size="xs" variant="subtle" onClick={() => void soundfont.forget()}>
                Forget
              </Button>
            </Group>
          )}
          {fileInfo && (
            <Select
              size="xs"
              label="Preset"
              w={240}
              searchable
              allowDeselect={false}
              data={presetData}
              value={chosenPreset ? settings.voice : null}
              placeholder={`${fileInfo.presets.length} presets`}
              onChange={(v) => v && set('voice', v as InstrumentId)}
            />
          )}
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
        {soundfont.loading && (
          <Text size="xs" c="dimmed" role="status">
            Reading the SoundFont file…
          </Text>
        )}
        {soundfont.error && (
          <Text size="xs" c="red" role="alert">
            {soundfont.error}
          </Text>
        )}
        {fileInfo && (
          <Text size="xs" c="dimmed">
            {fileInfo.fileName} ({Math.round(fileInfo.sizeBytes / 1048576)} MB). Samples load per
            preset the first time it plays.{' '}
            {soundfont.source === 'local-folder'
              ? 'It comes from the dev server’s local folder, so it loads again by itself after a reload.'
              : soundfont.canRemember
                ? 'The browser remembers this file, so after a reload use Reconnect.'
                : 'This browser cannot remember the file, so open it again after a reload.'}
          </Text>
        )}
        {loading && (
          <Text size="xs" c="dimmed" role="status">
            Loading {isSampledVoice(settings.voice) ? 'the samples for this sound' : 'audio'}…
          </Text>
        )}
        {error && (
          <Text size="xs" c="red" role="alert">
            Could not start playback: {error}. Sampled sounds download when first used, so check
            your connection, or choose a synth sound.
          </Text>
        )}
        <Text size="xs" c="dimmed">
          {PLAYBACK_HINT}
        </Text>
      </Stack>
    </Surface>
  );
}
