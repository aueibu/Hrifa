import { Group, Stack, Text } from '@mantine/core';
import type { RagaTheory } from '../theory';
import { RingDiagram } from './RingDiagram';

/** Three small read-only rings side by side: the raga's own scale, its melodic mirror (inversion around Sa), and
 * its negative (the complement -- every pitch class the raga does NOT use). Putting them next to the same 12-tone
 * ring layout as the main scale ring makes the relationship between the three genuinely visual, not just three
 * separate lists of numbers. */
export function ScaleTransformRings({ theory }: { theory: RagaTheory }) {
  return (
    <Group gap="lg" wrap="wrap" align="flex-start">
      <Stack gap={4} align="center">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Scale
        </Text>
        <RingDiagram
          usedPcs={theory.pcset}
          tokenMap={theory.tm}
          size={140}
          title="This raga's own scale"
        />
      </Stack>
      <Stack gap={4} align="center">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Mirror
        </Text>
        <RingDiagram
          usedPcs={theory.mirrorPcset}
          size={140}
          title="The melodic mirror (inverted around Sa)"
        />
      </Stack>
      <Stack gap={4} align="center">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Negative
        </Text>
        <RingDiagram
          usedPcs={theory.negativePcset}
          size={140}
          title="The negative (every pitch class NOT used)"
        />
      </Stack>
    </Group>
  );
}
