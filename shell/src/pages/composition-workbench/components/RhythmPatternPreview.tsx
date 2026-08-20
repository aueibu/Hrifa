import { Group, Text } from "@mantine/core";
import type { RhythmPattern } from "../model";
import classes from "../CompositionWorkbench.module.css";

export function RhythmPatternPreview({ pattern }: { pattern: RhythmPattern }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <div className={classes.pattern} aria-label={`Pattern ${pattern.bits.join("")}`}>
        {pattern.bits.map((bit, index) => (
          <span key={index} className={classes.pulse} data-active={bit === 1} />
        ))}
      </div>
      <Text ff="monospace" size="xs">
        {pattern.bits.join("")}
      </Text>
    </Group>
  );
}
