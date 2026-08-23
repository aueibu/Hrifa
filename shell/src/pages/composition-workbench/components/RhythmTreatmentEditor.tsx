import { NumberInput, Stack, Switch, Text } from '@mantine/core';
import type { DataPacket } from '../model';
import {
  applyRhythmRouteTreatment,
  isValidRhythmSource,
  rhythmInterpretationError,
  type RhythmRouteTreatment,
} from '../routeTreatments';
import classes from './CompositionInspector.module.css';

interface RhythmTreatmentEditorProps {
  treatment: RhythmRouteTreatment;
  source?: DataPacket;
  onChange(value: RhythmRouteTreatment): void;
}

export function RhythmTreatmentEditor({ treatment, source, onChange }: RhythmTreatmentEditorProps) {
  const sourceNeedsInterpretation = Boolean(source) && !isValidRhythmSource(source);
  const interpretationFailed =
    sourceNeedsInterpretation &&
    treatment.interpretAsRhythm &&
    applyRhythmRouteTreatment(source, treatment)?.warnings.includes(rhythmInterpretationError);
  const update = (patch: Partial<RhythmRouteTreatment>) => onChange({ ...treatment, ...patch });
  return (
    <Stack className={classes.section} gap={4}>
      <div className={classes.parameterRow}>
        <Text size="xs">Bypass</Text>
        <Switch
          size="xs"
          aria-label="Bypass rhythm route treatment"
          checked={treatment.bypassed}
          onChange={(event) => update({ bypassed: event.currentTarget.checked })}
        />
      </div>
      {sourceNeedsInterpretation && (
        <div className={classes.parameterRow}>
          <Text size="xs" className={treatment.interpretAsRhythm ? classes.changed : undefined}>
            Interpret as rhythm
          </Text>
          <Switch
            size="xs"
            aria-label="Interpret source as an inter-onset rhythm"
            checked={treatment.interpretAsRhythm}
            onChange={(event) => update({ interpretAsRhythm: event.currentTarget.checked })}
          />
        </div>
      )}
      {sourceNeedsInterpretation && !treatment.interpretAsRhythm && (
        <Text size="xs" c="dimmed">
          This source ({source!.domain}) isn't rhythm material yet — a consumer that requires an
          inter-onset duration list will error until this is turned on. Only positive numbers in a
          plain numeric domain (integer, rational, duration, onset, interval, cycleLength,
          pulseCount, phaseOffset) can convert.
        </Text>
      )}
      {interpretationFailed && (
        <Text size="xs" c="red">
          {rhythmInterpretationError}
        </Text>
      )}
      <div className={classes.parameterRow}>
        <Text size="xs" className={treatment.retrograde ? classes.changed : undefined}>
          Retrograde
        </Text>
        <Switch
          size="xs"
          aria-label="Retrograde rhythm route"
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
          aria-label="Rotate rhythm items"
          min={-256}
          max={256}
          value={treatment.rotation}
          onChange={(value) => update({ rotation: Math.trunc(Number(value) || 0) })}
        />
      </div>
      <div className={classes.parameterRow}>
        <Text size="xs" className={treatment.durationScale !== 1 ? classes.changed : undefined}>
          Duration scale
        </Text>
        <NumberInput
          size="xs"
          aria-label="Rhythm duration scale"
          prefix="× "
          min={1}
          max={16}
          step={1}
          value={treatment.durationScale}
          onChange={(value) => update({ durationScale: Math.max(1, Math.trunc(Number(value) || 1)) })}
        />
      </div>
    </Stack>
  );
}
