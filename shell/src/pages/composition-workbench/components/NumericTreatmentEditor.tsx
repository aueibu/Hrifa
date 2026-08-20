import { Switch, Text } from '@mantine/core';
import type { NumericRouteTreatment } from '../signalTypes';
import classes from './CompositionInspector.module.css';

interface NumericTreatmentEditorProps {
  treatment: NumericRouteTreatment;
  onChange(value: NumericRouteTreatment): void;
}

export function NumericTreatmentEditor({ treatment, onChange }: NumericTreatmentEditorProps) {
  return (
    <div className={classes.parameterRow}>
      <Text size="xs">Bypass</Text>
      <Switch
        size="xs"
        aria-label="Bypass numeric route treatment"
        checked={treatment.bypassed}
        onChange={(event) => onChange({ bypassed: event.currentTarget.checked })}
      />
    </div>
  );
}
