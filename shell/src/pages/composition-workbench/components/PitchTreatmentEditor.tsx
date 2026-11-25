import { Stack, Text } from '@mantine/core';
import { ScrubNumber, Select, Switch } from '../../../ui';
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
  const sourceIsGenericNumeric =
    Boolean(source) && source!.domain !== 'pitch' && !sourceIsPitchClass;
  const interpretedAsPitch = !sourceIsGenericNumeric || treatment.readAsMidiNotes;
  const showVoicingControls = interpretedAsPitch && (!sourceIsPitchClass || treatment.voiceAsPitch);
  const update = (patch: Partial<PitchRouteTreatment>) => onChange({ ...treatment, ...patch });
  return (
    <>
      <Stack className={classes.section} gap={4}>
        <div className={classes.parameterRow}>
          <Text>Bypass</Text>
          <Switch
            aria-label="Bypass pitch route treatment"
            checked={treatment.bypassed}
            onChange={(event) => update({ bypassed: event.currentTarget.checked })}
          />
        </div>
        {sourceIsGenericNumeric && (
          <div className={classes.parameterRow}>
            <Text className={treatment.readAsMidiNotes ? classes.changed : undefined}>
              Read as MIDI notes
            </Text>
            <Switch
              aria-label="Read numeric source as MIDI notes"
              checked={treatment.readAsMidiNotes}
              onChange={(event) => update({ readAsMidiNotes: event.currentTarget.checked })}
            />
          </div>
        )}
        {sourceIsGenericNumeric && treatment.readAsMidiNotes && (
          <div className={classes.parameterRow}>
            <Text className={treatment.midiNoteBase !== 60 ? classes.changed : undefined}>
              0 maps to
            </Text>
            <ScrubNumber
              aria-label="MIDI note that a raw value of 0 maps to"
              prefix="MIDI "
              range={[0, 127]}
              defaultValue={60}
              value={treatment.midiNoteBase}
              onChange={(value) => update({ midiNoteBase: Math.trunc(value) })}
            />
          </div>
        )}
        {sourceIsGenericNumeric && !treatment.readAsMidiNotes && (
          <Text c="dimmed">
            This source ({source!.domain}) isn't pitch material yet — a consumer that requires
            concrete pitch will error until this is turned on.
          </Text>
        )}
        {interpretedAsPitch && (
          <>
            <div className={classes.parameterRow}>
              <Text className={treatment.transposition !== 0 ? classes.changed : undefined}>
                Transpose
              </Text>
              <ScrubNumber
                aria-label="Pitch route transposition"
                suffix=" st"
                range={[-48, 48]}
                defaultValue={0}
                value={treatment.transposition}
                onChange={(value) => update({ transposition: value })}
              />
            </div>
            <div className={classes.parameterRow}>
              <Text className={treatment.inverted ? classes.changed : undefined}>Invert</Text>
              <Switch
                aria-label="Invert pitch route"
                checked={treatment.inverted}
                onChange={(event) => update({ inverted: event.currentTarget.checked })}
              />
            </div>
            {!sourceIsPitchClass && treatment.inverted && (
              <div className={classes.parameterRow}>
                <Text>Axis</Text>
                <ScrubNumber
                  aria-label="Pitch inversion axis"
                  prefix="MIDI "
                  range={[0, 127]}
                  defaultValue={60}
                  value={treatment.inversionAxisMidi}
                  onChange={(value) => update({ inversionAxisMidi: value })}
                />
              </div>
            )}
            <div className={classes.parameterRow}>
              <Text className={treatment.retrograde ? classes.changed : undefined}>Retrograde</Text>
              <Switch
                aria-label="Retrograde pitch groups"
                checked={treatment.retrograde}
                onChange={(event) => update({ retrograde: event.currentTarget.checked })}
              />
            </div>
            <div className={classes.parameterRow}>
              <Text className={treatment.rotation !== 0 ? classes.changed : undefined}>Rotate</Text>
              <ScrubNumber
                aria-label="Rotate pitch groups"
                clamp={[-128, 128]}
                defaultValue={0}
                value={treatment.rotation}
                onChange={(value) => update({ rotation: Math.trunc(value) })}
              />
            </div>
          </>
        )}
      </Stack>

      <Stack className={classes.section} gap={4}>
        <Text c="dimmed" fw={700} tt="uppercase">
          Voicing
        </Text>
        {sourceIsPitchClass && (
          <div className={classes.parameterRow}>
            <Text className={!treatment.voiceAsPitch ? classes.changed : undefined}>
              Voice as concrete pitch
            </Text>
            <Switch
              aria-label="Voice pitch class as concrete pitch"
              checked={treatment.voiceAsPitch}
              onChange={(event) => update({ voiceAsPitch: event.currentTarget.checked })}
            />
          </div>
        )}
        {sourceIsPitchClass && !treatment.voiceAsPitch && (
          <Text c="dimmed">
            Pitch class stays raw (0–11); transpose and invert apply mod 12. Connect to something
            that needs a concrete pitch, like Melodicization, and this must be back on.
          </Text>
        )}
        {showVoicingControls && sourceIsPitchClass && (
          <div className={classes.parameterRow}>
            <Text>Register floor</Text>
            <ScrubNumber
              aria-label="Pitch-class register floor"
              prefix="MIDI "
              range={[0, 127]}
              defaultValue={60}
              value={treatment.registerBaseMidi}
              onChange={(value) => update({ registerBaseMidi: value })}
            />
          </div>
        )}
        {showVoicingControls && (
          <>
            <div className={classes.parameterRow}>
              <Text className={treatment.voicingInversion !== 0 ? classes.changed : undefined}>
                Inversion
              </Text>
              <ScrubNumber
                aria-label="Voicing inversion"
                range={[-24, 24]}
                defaultValue={0}
                value={treatment.voicingInversion}
                onChange={(value) => update({ voicingInversion: Math.trunc(value) })}
              />
            </div>
            <div className={classes.parameterRow}>
              <Text>Strategy</Text>
              <Select
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
