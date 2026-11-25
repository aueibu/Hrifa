import { Group } from '@mantine/core';
import { ScrubNumber } from '../../../ui';

interface GeneratorPairControlsProps {
  a: number | string;
  b: number | string;
  onAChange(value: number | string): void;
  onBChange(value: number | string): void;
}

/** The major and minor generators (a ÷ b) shared by Fractioning and Pair composition. */
export function GeneratorPairControls({ a, b, onAChange, onBChange }: GeneratorPairControlsProps) {
  return (
    <Group gap="xs" grow wrap="nowrap">
      <ScrubNumber
        label="Major a"
        aria-label="Major generator a"
        clamp={[2, 999]}
        value={Number(a) || 2}
        onChange={onAChange}
      />
      <ScrubNumber
        label="Minor b"
        aria-label="Minor generator b"
        clamp={[1, 999]}
        value={Number(b) || 1}
        onChange={onBChange}
      />
    </Group>
  );
}
