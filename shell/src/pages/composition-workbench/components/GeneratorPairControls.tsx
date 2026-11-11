import { Group, NumberInput } from '@mantine/core';

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
      <NumberInput
        label="Major a"
        aria-label="Major generator a"
        min={2}
        value={a}
        onChange={onAChange}
      />
      <NumberInput
        label="Minor b"
        aria-label="Minor generator b"
        min={1}
        value={b}
        onChange={onBChange}
      />
    </Group>
  );
}
