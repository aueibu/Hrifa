import {
  Chip,
  CloseButton,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { PITCH_SET_PRESETS, togglePitch, type PitchSetPreset } from '../chordInput/pitchSet';
import { projectPitchSetFromPreset, useCompositionSettings } from '../compositionSettings';
import { pitchClassName } from '../pitch';
import { SoundSetEditor } from './SoundControls';
import classes from './CompositionSettingsPanel.module.css';

const presetLabel = (preset: string) =>
  preset.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * The project pitch set: a preset and tonic fill it, then any pitch can be toggled. One chip per
 * pitch class of the project EDO, so it works at any EDO. Changing the EDO resets the set.
 */
function PitchSetControl() {
  const { settings, updateSettings } = useCompositionSettings();
  const { pitchSet, edo } = settings;
  const pcs = Array.from({ length: edo }, (_unused, pc) => pc);
  return (
    <Stack gap="xs">
      <Group gap="xs" grow wrap="nowrap" align="flex-end">
        <Select
          label="Preset"
          data={(edo === 12
            ? PITCH_SET_PRESETS
            : PITCH_SET_PRESETS.filter((p) => p === 'chromatic')
          ).map((value) => ({ value, label: presetLabel(value) }))}
          value={pitchSet.preset}
          allowDeselect={false}
          onChange={(value) =>
            value &&
            updateSettings({
              pitchSet: projectPitchSetFromPreset(value as PitchSetPreset, pitchSet.tonic, edo),
            })
          }
        />
        <Select
          label="Tonic"
          data={pcs.map((pc) => ({ value: String(pc), label: pitchClassName(pc, edo) }))}
          value={String(pitchSet.tonic)}
          allowDeselect={false}
          disabled={edo !== 12}
          onChange={(value) =>
            value !== null &&
            updateSettings({
              pitchSet: projectPitchSetFromPreset(pitchSet.preset, Number(value), edo),
            })
          }
        />
      </Group>
      <Group gap={4} role="group" aria-label="Pitches in the set">
        {pcs.map((pc) => (
          <Chip
            key={pc}
            size="xs"
            variant="outline"
            checked={pitchSet.pcs.includes(pc)}
            onChange={() =>
              updateSettings({ pitchSet: { ...pitchSet, ...togglePitch(pitchSet, pc) } })
            }
          >
            {pitchClassName(pc, edo)}
          </Chip>
        ))}
      </Group>
      <Text size="xs" c="dimmed">
        Chord input offers chords whose notes all lie in this set. Presets fill it; toggle pitches
        for anything else.
        {edo !== 12 &&
          ` At ${edo}-EDO only the chromatic preset is defined; build the set by hand.`}
      </Text>
    </Stack>
  );
}

// New settings get their own <Title>-headed section below, in whatever grouping makes sense —
// this file only needs a new control added to it; compositionSettings.tsx is where the actual
// field/default/validation lives.
/**
 * The workbench's settings as a panel docked beside the canvas, like the inspector on the other
 * side, so it can stay open while you work. The status bar opens and closes it.
 */
export function CompositionSettingsPanel({ onClose }: { onClose(): void }) {
  const { settings, updateSettings } = useCompositionSettings();

  return (
    <aside className={classes.panel} aria-label="Workbench settings">
      <Group justify="space-between" wrap="nowrap" className={classes.header}>
        <Title order={2} size="sm">
          Workbench settings
        </Title>
        <CloseButton size="sm" aria-label="Close settings" onClick={onClose} />
      </Group>
      <Stack gap="lg">
        <div>
          <Title order={4} size="h6" mb={4}>
            Pitch
          </Title>
          <Stack gap="xs">
            <NumberInput
              label="EDO (steps per octave)"
              description="Applies to pitch-class material — Scale Construction, Scale Evolution, Pitch List's pitch-class format, Arithmetic, and pitch-class route treatments. Concrete MIDI/note-name pitch stays 12-tone."
              min={1}
              max={96}
              step={1}
              value={settings.edo}
              onChange={(value) =>
                typeof value === 'number' && updateSettings({ edo: Math.max(1, Math.round(value)) })
              }
            />
            {settings.edo !== 12 && (
              <Text size="xs" c="dimmed">
                At {settings.edo}-EDO, pitch classes display as plain step numbers (0–
                {settings.edo - 1}) rather than letter names — there's no standard note-name
                convention outside 12-EDO.
              </Text>
            )}
          </Stack>
        </div>
        <div>
          <Title order={4} size="h6" mb={4}>
            Pitch set (key)
          </Title>
          <PitchSetControl />
        </div>
        <div>
          <Title order={4} size="h6" mb={4}>
            Note editor
          </Title>
          <Switch
            label="Color notes by scale degree"
            description="Each note takes a color from its scale degree, counted from C and repeating every octave (steps follow the EDO above). Off uses one color for every note."
            checked={settings.colorByScaleDegree}
            onChange={(event) =>
              updateSettings({ colorByScaleDegree: event.currentTarget.checked })
            }
          />
        </div>
        <div>
          <Title order={4} size="h6" mb={4}>
            Rhythm sounds
          </Title>
          <Text size="xs" c="dimmed" mb="xs">
            Modules play their layers on these voices in order — Interference's generators 1, 2, 3;
            Rhythm Householder's input and candidate — unless a module sets its own sound. Clicks
            and woodblocks sound two to three octaves above the written pitch and drums two below,
            so one pitch suits every sound.
          </Text>
          <SoundSetEditor
            name="Rhythm"
            set={settings.sounds.rhythm}
            onChange={(rhythm) => updateSettings({ sounds: { ...settings.sounds, rhythm } })}
          />
        </div>
        <div>
          <Title order={4} size="h6" mb={4}>
            Metronome sounds
          </Title>
          <Text size="xs" c="dimmed" mb="xs">
            Primary marks each downbeat, secondary the other beats, tertiary Interference's grouping
            click.
          </Text>
          <SoundSetEditor
            name="Metronome"
            set={settings.sounds.metronome}
            onChange={(metronome) => updateSettings({ sounds: { ...settings.sounds, metronome } })}
          />
        </div>
      </Stack>
    </aside>
  );
}
