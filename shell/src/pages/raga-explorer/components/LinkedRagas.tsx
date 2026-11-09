import { Group, Stack, Text } from '@mantine/core';
import type { RagaVariant } from '../types';

export interface LinkedRagasGroupProps {
  title: string;
  hint?: string;
  ragas: RagaVariant[];
  onSelect: (raga: RagaVariant) => void;
}

/** One labelled row of clickable cross-links (twins, sibling variants, same name under another mela, ...). Renders
 * nothing when there is nothing to link -- callers can list every group unconditionally. */
export function LinkedRagasGroup({ title, hint, ragas, onSelect }: LinkedRagasGroupProps) {
  if (ragas.length === 0) {
    return null;
  }
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
        {title} ({ragas.length}){hint ? ` — ${hint}` : ''}
      </Text>
      <Group gap={6}>
        {ragas.map((r) => (
          <Text
            key={r.vid}
            component="button"
            onClick={() => onSelect(r)}
            size="sm"
            style={{
              cursor: 'pointer',
              background: 'var(--mantine-color-default-hover)',
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 4,
              padding: '2px 8px',
            }}
          >
            {r.name}
            {r.mela != null ? ` (${r.mela})` : ''}
          </Text>
        ))}
      </Group>
    </Stack>
  );
}
