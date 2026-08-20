import { Box, Group, SimpleGrid, Slider, Stack, Table, Text, Title } from '@mantine/core';
import { Data } from '../../components/Data/Data';
import { Surface } from '../../components/Surface/Surface';
import { buildRotationSets, distortionScore, edoSweep, pcOf } from './ratioAnalysis';

export interface SegmentRatios {
  letter: string;
  arcVals: number[];
  chordVals: number[];
}

interface RatioAnalysisPanelProps {
  segments: SegmentRatios[];
  edo: number;
  onEdoChange: (edo: number) => void;
}

function RotationSetTable({
  label,
  values,
  edo,
}: {
  label: string;
  values: number[];
  edo: number;
}) {
  const rotations = buildRotationSets(values, edo);
  const dScore = distortionScore(values, edo);
  const pcs = values.map((v) => pcOf(v, edo));
  const distinctPCs = new Set(pcs).size;
  const sweep = edoSweep(values, 5, 53);

  let dLabel: string | null = null;
  if (distinctPCs < values.length) {
    dLabel = `${distinctPCs} distinct PCs of ${values.length} points — direct collision, this EDO ran out of room`;
  } else if (dScore !== null) {
    if (dScore === Infinity) {
      dLabel = 'distortion: infinite — induced symmetry, this EDO is flattening real irregularity';
    } else if (dScore > 3) {
      dLabel = `distortion: ${dScore.toFixed(2)} — likely induced`;
    } else if (dScore < 0.3) {
      dLabel = `distortion: ${dScore.toFixed(2)} — quantization broke real symmetry`;
    } else {
      dLabel = `distortion: ${dScore.toFixed(2)}`;
    }
  }

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        {label} ({values.length} pts)
      </Text>
      {dLabel && (
        <Text c={distinctPCs < values.length || (dScore ?? 0) > 3 ? 'red' : 'dimmed'} size="xs">
          {dLabel}
        </Text>
      )}
      <Group gap={1}>
        {sweep.map((entry) => (
          <Box
            key={entry.edo}
            bg={entry.safe ? 'green.6' : 'red.6'}
            title={`EDO ${entry.edo}: ${entry.distinct} of ${values.length} distinct`}
            style={{
              height: 16,
              outline: entry.edo === edo ? '2px solid var(--mantine-color-text)' : undefined,
              width: 8,
            }}
          />
        ))}
      </Group>
      <Text c="dimmed" size="xs">
        EDO 5&ndash;53: green = safe, red = collision
      </Text>
      {rotations ? (
        <Table.ScrollContainer minWidth={280}>
          <Table fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>start</Table.Th>
                <Table.Th>CIS</Table.Th>
                <Table.Th>seed</Table.Th>
                <Table.Th>set</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rotations.flatMap((rot, ri) => {
                const seen = new Set<string>();
                return rot.rows.map((row, rowIdx) => {
                  const key = row.join(',');
                  const isDup = seen.has(key);
                  seen.add(key);
                  return (
                    <Table.Tr key={`${ri}-${rowIdx}`}>
                      {rowIdx === 0 ? (
                        <>
                          <Table.Td rowSpan={rot.rows.length}>{rot.startValue.toFixed(2)}</Table.Td>
                          <Table.Td rowSpan={rot.rows.length}>{rot.intervals.join(',')}</Table.Td>
                        </>
                      ) : null}
                      <Table.Td>{rot.pcs[rowIdx]}</Table.Td>
                      <Table.Td c={isDup ? 'dimmed' : undefined}>{row.join(',')}</Table.Td>
                    </Table.Tr>
                  );
                });
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <Text c="dimmed" size="xs">
          fewer than 2 points
        </Text>
      )}
    </Stack>
  );
}

/** Ratio table + rotation-derived sets, per segment, for the Periodicity tab. */
export function RatioAnalysisPanel({ segments, edo, onEdoChange }: RatioAnalysisPanelProps) {
  return (
    <Stack gap="md">
      <Surface>
        <Stack gap="md">
          <Title order={2} size="h4">
            Ratios by segment
          </Title>
          <Table.ScrollContainer minWidth={480}>
            <Table fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>seg</Table.Th>
                  <Table.Th>arc positions (low&rarr;high)</Table.Th>
                  <Table.Th>chord crossings (low&rarr;high)</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {segments.map((seg) => (
                  <Table.Tr key={seg.letter}>
                    <Table.Td fw={700}>{seg.letter}</Table.Td>
                    <Table.Td>
                      {seg.arcVals.length ? seg.arcVals.map((v) => v.toFixed(2)).join(' < ') : '—'}
                    </Table.Td>
                    <Table.Td>
                      {seg.chordVals.length
                        ? seg.chordVals.map((v) => v.toFixed(2)).join(' < ')
                        : '—'}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </Surface>

      <Surface>
        <Stack gap="md">
          <Title order={2} size="h4">
            Rotation-derived sets
          </Title>
          <Text c="dimmed" size="xs">
            Per segment, per ratio list: for each rotation of the list, take the non-cyclic interval
            structure between consecutive PCs, then apply that same structure starting from each
            element in turn.
          </Text>
          <Stack gap={4}>
            <Group gap="xs" justify="space-between">
              <Text size="sm">EDO</Text>
              <Data size="sm">{edo}</Data>
            </Group>
            <Slider value={edo} onChange={onEdoChange} min={2} max={53} step={1} />
          </Stack>
          <Stack gap="lg">
            {segments.map((seg) => (
              <Stack key={seg.letter} gap="xs">
                <Text fw={700} size="sm">
                  {seg.letter}
                </Text>
                <SimpleGrid cols={{ base: 1, md: 2 }}>
                  <RotationSetTable label="arc positions" values={seg.arcVals} edo={edo} />
                  <RotationSetTable label="chord crossings" values={seg.chordVals} edo={edo} />
                </SimpleGrid>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Surface>
    </Stack>
  );
}
