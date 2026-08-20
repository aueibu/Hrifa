import { NumberInput, Stack, Switch, Text } from '@mantine/core';
import type { RhythmRouteTreatment } from '../routeTreatments';
import classes from './CompositionInspector.module.css';

interface RhythmTreatmentEditorProps {
  treatment: RhythmRouteTreatment;
  onChange(value: RhythmRouteTreatment): void;
}

export function RhythmTreatmentEditor({ treatment, onChange }: RhythmTreatmentEditorProps) {
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
