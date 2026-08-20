import type { ReactNode } from "react";
import { Group, Slider, Text } from "@mantine/core";
import { volumePercentLabel } from "../audio";
import classes from "./VolumeControl.module.css";

interface VolumeControlProps {
  accessibleLabel: string;
  label: ReactNode;
  value: number;
  onChange(value: number): void;
}

export function VolumeControl({ accessibleLabel, label, value, onChange }: VolumeControlProps) {
  return (
    <div className={classes.root}>
      {typeof label === "string" ? <Text size="xs">{label}</Text> : label}
      <Group gap="xs" wrap="nowrap" className={classes.fader}>
        <Slider thumbLabel={accessibleLabel} min={0} max={100} value={value} onChange={onChange} />
        <Text ff="monospace" size="xs" w="4.25rem" ta="right">
          {volumePercentLabel(value)}
        </Text>
      </Group>
    </div>
  );
}
