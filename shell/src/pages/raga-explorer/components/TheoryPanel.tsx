import { SimpleGrid, Stack, Text } from '@mantine/core';
import type { RagaTheory } from '../theory';

function Field({ label, value }: { label: string; value: string | number }) {
  const empty = value === '' || value == null;
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.03em' }}>
        {label}
      </Text>
      <Text size="sm" ff="monospace" c={empty ? 'dimmed' : undefined}>
        {empty ? '—' : value}
      </Text>
    </Stack>
  );
}

export function TheoryPanel({ theory }: { theory: RagaTheory }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      <Field label="Pitch class set" value={theory.pcsetStr} />
      <Field
        label="Pitches played / unique"
        value={`${theory.pitchesPlayed} / ${theory.uniquePitches}`}
      />
      <Field label="Purvanga (S–M)" value={theory.purvanga} />
      <Field label="Uttaranga (P–N)" value={theory.uttaranga} />
      <Field label="Tritones" value={theory.tritones} />
      <Field label="Imperfections (no 5th above)" value={theory.imperfections} />
      <Field label="Detached (no 5th either way)" value={theory.detachedSwaras} />
      <Field label="Gamut large gaps (≥ m3)" value={theory.gamutLargeGaps} />
      <Field label="Aroha large gaps (≥ m3)" value={theory.arohaLargeGaps} />
      <Field label="Avaroha large gaps (≥ m3)" value={theory.avarohaLargeGaps} />
      <Field label="Aroha intervals" value={theory.arohaIntervals} />
      <Field label="Avaroha intervals" value={theory.avarohaIntervals} />
      <Field label="Mirror aroha" value={theory.mirrorAroha} />
      <Field label="Mirror avaroha" value={theory.mirrorAvaroha} />
      <Field
        label="Mirror pitch class set"
        value={`${theory.mirrorPcsetStr}  ${theory.mirrorNames}`}
      />
      <Field
        label="Negative pitch class set"
        value={`${theory.negativePcsetStr}  ${theory.negativeNames}`}
      />
      <Field
        label="Negative aroha / avaroha"
        value={`${theory.negativeAroha}  //  ${theory.negativeAvaroha}`}
      />
    </SimpleGrid>
  );
}
