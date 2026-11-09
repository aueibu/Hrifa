import type { ReactNode } from "react";
import { Group, Slider, Text } from "@mantine/core";
import {
  FADER_FLOOR_DB,
  volumeDbLabel,
  volumeDbToPercent,
  volumePercentLabel,
  volumePercentToDb,
} from "../audio";
import classes from "./VolumeControl.module.css";

interface VolumeControlProps {
  accessibleLabel: string;
  label: ReactNode;
  /** Stored as a percent of full amplitude (100 = 0 dB), whichever way the fader is drawn. */
  value: number;
  onChange(value: number): void;
  /** Move in 0.1 dB steps from −60 dB to 0 dB, as a DAW fader does, instead of in whole percent. */
  decibels?: boolean;
}

export function VolumeControl({
  accessibleLabel,
  label,
  value,
  onChange,
  decibels = false,
}: VolumeControlProps) {
  const db = volumePercentToDb(value);
  return (
    <div className={classes.root}>
      {typeof label === "string" ? <Text size="xs">{label}</Text> : label}
      <Group gap="xs" wrap="nowrap" className={classes.fader}>
        {decibels ? (
          <Slider
            thumbLabel={accessibleLabel}
            min={FADER_FLOOR_DB}
            max={0}
            step={0.1}
            value={db}
            label={null}
            onChange={(next) => onChange(volumeDbToPercent(next))}
          />
        ) : (
          <Slider thumbLabel={accessibleLabel} min={0} max={100} value={value} onChange={onChange} />
        )}
        <Text ff="monospace" size="xs" w="4.25rem" ta="right">
          {decibels ? volumeDbLabel(db) : volumePercentLabel(value)}
        </Text>
      </Group>
    </div>
  );
}
