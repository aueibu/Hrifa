import { Chip, Group, Select, Stack } from '@mantine/core';
import {
  KitScope,
  NumberField,
  Panel,
  Row,
  Section,
  StripTool,
  Tip,
  Toggle,
} from '../../../components/InspectorKit';
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
      <Row name="Preset" fill>
        <Select
          size="xs"
          aria-label="Preset"
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
      </Row>
      <Row name="Tonic" fill>
        <Select
          size="xs"
          aria-label="Tonic"
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
      </Row>
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
  return (
    <KitScope fill className={classes.root}>
      <Panel
        title="Workbench settings"
        tools={
          <StripTool label="Close settings" onClick={onClose}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </StripTool>
        }
      >
        <CompositionSettingsSections />
      </Panel>
    </KitScope>
  );
}

/** The settings sections alone (no panel chrome): the right pull-up panel and Properties' Scene tab render these. */
export function CompositionSettingsSections() {
  const { settings, updateSettings } = useCompositionSettings();
  return (
    <>
      <Section heading="Pitch">
        <Row
          name={
            <Tip
              term="EDO (steps per octave)"
              text={`Applies to pitch-class material: Scale Construction, Scale Evolution, Pitch List's pitch-class format, Arithmetic, and pitch-class route treatments. Concrete MIDI and note-name pitch stays 12-tone.${
                settings.edo !== 12
                  ? ` At ${settings.edo}-EDO, pitch classes display as plain step numbers (0 to ${settings.edo - 1}) rather than letter names; there is no standard note-name convention outside 12-EDO.`
                  : ''
              }`}
            >
              EDO
            </Tip>
          }
        >
          <NumberField
            min={1}
            max={96}
            value={settings.edo}
            onChange={(value) =>
              typeof value === 'number' && updateSettings({ edo: Math.max(1, Math.round(value)) })
            }
          />
        </Row>
      </Section>
      <Section
        heading={
          <Tip
            term="Pitch set (key)"
            text={`Chord input offers chords whose notes all lie in this set. Presets fill it; toggle pitches for anything else.${
              settings.edo !== 12
                ? ` At ${settings.edo}-EDO only the chromatic preset is defined; build the set by hand.`
                : ''
            }`}
          >
            Pitch set (key)
          </Tip>
        }
      >
        <PitchSetControl />
      </Section>
      <Section heading="Note editor">
        <Row name="Note colors">
          <Tip
            as="control"
            term="Scale degree"
            text="Each note takes a color from its scale degree, counted from C and repeating every octave (steps follow the EDO above). Off uses one color for every note."
          >
            <Toggle
              pressed={settings.colorByScaleDegree}
              onPressedChange={(next) => updateSettings({ colorByScaleDegree: next })}
            >
              Scale degree
            </Toggle>
          </Tip>
        </Row>
      </Section>
      <Section
        heading={
          <Tip
            term="Rhythm sounds"
            text="Nodes play their layers on these voices in order (Interference's generators 1, 2, 3; Rhythm Householder's input and candidate) unless a node sets its own sound. Clicks and woodblocks sound two to three octaves above the written pitch and drums two below, so one pitch suits every sound."
          >
            Rhythm sounds
          </Tip>
        }
      >
        <SoundSetEditor
          name="Rhythm"
          set={settings.sounds.rhythm}
          onChange={(rhythm) => updateSettings({ sounds: { ...settings.sounds, rhythm } })}
        />
      </Section>
      <Section
        heading={
          <Tip
            term="Metronome sounds"
            text="Primary marks each downbeat, secondary the other beats, tertiary Interference's grouping click."
          >
            Metronome sounds
          </Tip>
        }
      >
        <SoundSetEditor
          name="Metronome"
          set={settings.sounds.metronome}
          onChange={(metronome) => updateSettings({ sounds: { ...settings.sounds, metronome } })}
        />
      </Section>
    </>
  );
}
