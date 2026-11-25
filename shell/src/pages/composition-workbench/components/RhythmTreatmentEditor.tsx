import { Stack, Text } from '@mantine/core';
import { ScrubNumber, Switch } from '../../../ui';
import type { DataPacket } from '../model';
import {
  applyRhythmRouteTreatment,
  isValidRhythmSource,
  rhythmInterpretationError,
  rhythmOffset,
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
  const itemCount = source?.items.length ?? 0;
  const rotationBound = itemCount > 1 ? itemCount - 1 : 256;
  return (
    <Stack className={classes.section} gap={4}>
      <div className={classes.parameterRow}>
        <Text>Bypass</Text>
        <Switch
          aria-label="Bypass rhythm route treatment"
          checked={treatment.bypassed}
          onChange={(event) => update({ bypassed: event.currentTarget.checked })}
        />
      </div>
      {sourceNeedsInterpretation && (
        <div className={classes.parameterRow}>
          <Text className={treatment.interpretAsRhythm ? classes.changed : undefined}>
            Interpret as rhythm
          </Text>
          <Switch
            aria-label="Interpret source as an inter-onset rhythm"
            checked={treatment.interpretAsRhythm}
            onChange={(event) => update({ interpretAsRhythm: event.currentTarget.checked })}
          />
        </div>
      )}
      {sourceNeedsInterpretation && !treatment.interpretAsRhythm && (
        <Text c="dimmed">
          This source ({source!.domain}) isn't rhythm material yet — a consumer that requires an
          inter-onset duration list will error until this is turned on. Only positive numbers in a
          plain numeric domain (integer, rational, duration, onset, interval, cycleLength,
          pulseCount, phaseOffset) can convert.
        </Text>
      )}
      {interpretationFailed && <Text c="red">{rhythmInterpretationError}</Text>}
      <div className={classes.parameterRow}>
        <Text className={treatment.retrograde ? classes.changed : undefined}>Retrograde</Text>
        <Switch
          aria-label="Retrograde rhythm route"
          checked={treatment.retrograde}
          onChange={(event) => update({ retrograde: event.currentTarget.checked })}
        />
      </div>
      <div className={classes.parameterRow}>
        <Text className={treatment.rotation !== 0 ? classes.changed : undefined}>Rotate</Text>
        <ScrubNumber
          aria-label="Rotate rhythm items"
          range={itemCount > 1 ? [-rotationBound, rotationBound] : undefined}
          clamp={itemCount > 1 ? undefined : [-256, 256]}
          defaultValue={0}
          value={treatment.rotation}
          onChange={(value) => update({ rotation: Math.trunc(value) })}
        />
      </div>
      <div className={classes.parameterRow}>
        <Text className={treatment.durationScale !== 1 ? classes.changed : undefined}>
          Duration scale
        </Text>
        <ScrubNumber
          aria-label="Rhythm duration scale"
          prefix="× "
          clamp={[1, 16]}
          step={1}
          defaultValue={1}
          value={treatment.durationScale}
          onChange={(value) => update({ durationScale: Math.max(1, Math.trunc(value)) })}
        />
      </div>
      <div className={classes.parameterRow}>
        <Text className={rhythmOffset(treatment) !== 0 ? classes.changed : undefined}>
          Start offset
        </Text>
        <ScrubNumber
          aria-label="Rhythm start offset in pulses"
          clamp={[-256, 256]}
          defaultValue={0}
          value={rhythmOffset(treatment)}
          onChange={(value) => update({ offset: Math.trunc(value) })}
        />
      </div>
    </Stack>
  );
}
