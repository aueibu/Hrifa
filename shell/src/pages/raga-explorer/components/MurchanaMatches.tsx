import { useState } from 'react';
import { Group, Stack, Text } from '@mantine/core';
import type { MurchanaHit } from '../murchana';
import { label } from '../theory';
import type { RagaVariant } from '../types';

export interface MurchanaMatchesProps {
  title: string;
  hint: string;
  hits: MurchanaHit[];
  onSelect: (raga: RagaVariant) => void;
}

const SHOWN_BY_DEFAULT = 8;

function MurchanaRow({
  hit,
  onSelect,
}: {
  hit: MurchanaHit;
  onSelect: (raga: RagaVariant) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? hit.ragas : hit.ragas.slice(0, SHOWN_BY_DEFAULT);
  const hidden = hit.ragas.length - shown.length;
  return (
    <Group gap={6} wrap="wrap">
      <Text size="xs" c="dimmed" ff="monospace">
        from {label(hit.startPc)}:
      </Text>
      {shown.map((r) => (
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
      {hidden > 0 && (
        <Text
          component="button"
          onClick={() => setExpanded(true)}
          size="xs"
          c="dimmed"
          style={{ cursor: 'pointer', textDecoration: 'underline' }}
        >
          +{hidden} more
        </Text>
      )}
    </Group>
  );
}

/** One murchana search's results: for each rotation that landed on a real raga's scale, the pitch it was rotated
 * onto and the raga(s) that match (a common scale like mela 65's can have dozens of twin names, so each row
 * starts collapsed). Renders nothing when there are no hits -- callers can list every search unconditionally,
 * same as LinkedRagasGroup. */
export function MurchanaMatches({ title, hint, hits, onSelect }: MurchanaMatchesProps) {
  if (hits.length === 0) {
    return null;
  }
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
        {title} ({hits.length}) — {hint}
      </Text>
      <Stack gap={2}>
        {hits.map((hit) => (
          <MurchanaRow key={hit.startPc} hit={hit} onSelect={onSelect} />
        ))}
      </Stack>
    </Stack>
  );
}
