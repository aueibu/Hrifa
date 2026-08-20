import { NumberInput, Select, Stack, Switch, Text } from '@mantine/core';
import type { DataPacket } from '../model';
import type { PitchRouteTreatment } from '../routeTreatments';
import classes from './CompositionInspector.module.css';

interface PitchTreatmentEditorProps {
  treatment: PitchRouteTreatment;
  source?: DataPacket;
  onChange(value: PitchRouteTreatment): void;
}

export function PitchTreatmentEditor({ treatment, source, onChange }: PitchTreatmentEditorProps) {
  const sourceIsPitchClass = source?.domain === 'pitchClass';
  const sourceIsGenericNumeric = Boolean(source) && source!.domain !== 'pitch' && !sourceIsPitchClass;
  const interpretedAsPitch = !sourceIsGenericNumeric || treatment.readAsMidiNotes;
  const showVoicingControls = interpretedAsPitch && (!sourceIsPitchClass || treatment.voiceAsPitch);
  const update = (patch: Partial<PitchRouteTreatment>) => onChange({ ...treatment, ...patch });
  return (
    <>
      <Stack className={classes.section} gap={4}>
        <div className={classes.parameterRow}>
          <Text size="xs">Bypass</Text>
          <Switch
            size="xs"
            aria-label="Bypass pitch route treatment"
            checked={treatment.bypassed}
            onChange={(event) => update({ bypassed: event.currentTarget.checked })}
          />
        </div>
        {sourceIsGenericNumeric && (
          <div className={classes.parameterRow}>
            <Text size="xs" className={treatment.readAsMidiNotes ? classes.changed : undefined}>
              Read as MIDI notes
            </Text>
            <Switch
              size="xs"
              aria-label="Read numeric source as MIDI notes"
              checked={treatment.readAsMidiNotes}
              onChange={(event) => update({ readAsMidiNotes: event.currentTarget.checked })}
            />
          </div>
        )}
        {sourceIsGenericNumeric && treatment.readAsMidiNotes && (
          <div className={classes.parameterRow}>
            <Text size="xs" className={treatment.midiNoteBase !== 60 ? classes.changed : undefined}>
              0 maps to
            </Text>
            <NumberInput
              size="xs"
              aria-label="MIDI note that a raw value of 0 maps to"
              prefix="MIDI "
              min={0}
              max={127}
              value={treatment.midiNoteBase}
              onChange={(value) => update({ midiNoteBase: Math.trunc(Number(value) || 0) })}
            />
          </div>
        )}
        {sourceIsGenericNumeric && !treatment.readAsMidiNotes && (
          <Text size="xs" c="dimmed">
            This source ({source!.domain}) isn't pitch material yet — a consumer that requires
            concrete pitch will error until this is turned on.
          </Text>
        )}
        {interpretedAsPitch && (
          <>
            <div className={classes.parameterRow}>
              <Text size="xs" className={treatment.transposition !== 0 ? classes.changed : undefined}>
                Transpose
              </Text>
              <NumberInput
                size="xs"
                aria-label="Pitch route transposition"
                suffix=" st"
                min={-48}
                max={48}
                value={treatment.transposition}
                onChange={(value) => update({ transposition: Number(value) || 0 })}
              />
            </div>
            <div className={classes.parameterRow}>
              <Text size="xs" className={treatment.inverted ? classes.changed : undefined}>
                Invert
              </Text>
              <Switch
                size="xs"
                aria-label="Invert pitch route"
                checked={treatment.inverted}
                onChange={(event) => update({ inverted: event.currentTarget.checked })}
              />
            </div>
            {!sourceIsPitchClass && treatment.inverted && (
              <div className={classes.parameterRow}>
                <Text size="xs">Axis</Text>
                <NumberInput
                  size="xs"
                  aria-label="Pitch inversion axis"
                  prefix="MIDI "
                  min={0}
                  max={127}
                  value={treatment.inversionAxisMidi}
                  onChange={(value) => update({ inversionAxisMidi: Number(value) || 60 })}
                />
              </div>
            )}
            <div className={classes.parameterRow}>
              <Text size="xs" className={treatment.retrograde ? classes.changed : undefined}>
                Retrograde
              </Text>
              <Switch
                size="xs"
                aria-label="Retrograde pitch groups"
                checked={treatment.retrograde}
                onChange={(event) => update({ retrograde: event.currentTarget.checked })}
              />
            </div>
            <div className={classes.parameterRow}>
              <Text size="xs" className={treatment.rotation !== 0 ? classes.changed : undefined}>
                Rotate
              </Text>
              <NumberInput
                size="xs"
                aria-label="Rotate pitch groups"
                min={-128}
                max={128}
                value={treatment.rotation}
                onChange={(value) => update({ rotation: Math.trunc(Number(value) || 0) })}
              />
            </div>
          </>
        )}
      </Stack>

      <Stack className={classes.section} gap={4}>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase">
          Voicing
        </Text>
        {sourceIsPitchClass && (
          <div className={classes.parameterRow}>
            <Text size="xs" className={!treatment.voiceAsPitch ? classes.changed : undefined}>
              Voice as concrete pitch
            </Text>
            <Switch
              size="xs"
              aria-label="Voice pitch class as concrete pitch"
              checked={treatment.voiceAsPitch}
              onChange={(event) => update({ voiceAsPitch: event.currentTarget.checked })}
            />
          </div>
        )}
        {sourceIsPitchClass && !treatment.voiceAsPitch && (
          <Text size="xs" c="dimmed">
            Pitch class stays raw (0–11); transpose and invert apply mod 12. Connect to something
            that needs a concrete pitch, like Melodicization, and this must be back on.
          </Text>
        )}
        {showVoicingControls && sourceIsPitchClass && (
          <div className={classes.parameterRow}>
            <Text size="xs">Register floor</Text>
            <NumberInput
              size="xs"
              aria-label="Pitch-class register floor"
              prefix="MIDI "
              min={0}
              max={127}
              value={treatment.registerBaseMidi}
              onChange={(value) => update({ registerBaseMidi: Number(value) || 60 })}
            />
          </div>
        )}
        {showVoicingControls && (
          <>
            <div className={classes.parameterRow}>
              <Text size="xs" className={treatment.voicingInversion !== 0 ? classes.changed : undefined}>
                Inversion
              </Text>
              <NumberInput
                size="xs"
                aria-label="Voicing inversion"
                min={-24}
                max={24}
                value={treatment.voicingInversion}
                onChange={(value) => update({ voicingInversion: Math.trunc(Number(value) || 0) })}
              />
            </div>
            <div className={classes.parameterRow}>
              <Text size="xs">Strategy</Text>
              <Select
                size="xs"
                aria-label="Voicing strategy"
                value="ascending-close"
                data={[{ value: 'ascending-close', label: 'Ascending close' }]}
                disabled
              />
            </div>
          </>
        )}
      </Stack>
    </>
  );
}
