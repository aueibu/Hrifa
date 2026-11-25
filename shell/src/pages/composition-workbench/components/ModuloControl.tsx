import { Group, Text } from '@mantine/core';
import { ScrubNumber, Switch } from '../../../ui';
import type { ModuloTreatment } from '../moduloTreatment';
import classes from '../CompositionWorkbench.module.css';

interface ModuloControlProps {
  value: ModuloTreatment;
  onChange(value: ModuloTreatment): void;
}

export function ModuloControl({ value, onChange }: ModuloControlProps) {
  return (
    <div className={classes.nodeParameterRow}>
      <Text>Modulo</Text>
      <Group gap="xs" wrap="nowrap">
        <Switch
          aria-label="Enable modulo"
          checked={value.enabled}
          onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })}
        />
        {value.enabled && (
          <ScrubNumber
            aria-label="Modulo divisor"
            style={{ width: '5rem' }}
            clamp={[1, 999]}
            step={1}
            value={value.divisor}
            onChange={(divisor) =>
              onChange({ ...value, divisor: Math.max(1, Math.trunc(divisor)) })
            }
          />
        )}
      </Group>
    </div>
  );
}
