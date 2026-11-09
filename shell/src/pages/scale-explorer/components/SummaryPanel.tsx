import { ActionIcon, Button, Group, Table, Text } from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import { Surface } from '../../../components/Surface/Surface';
import type { SummaryRow } from '../scaleView';
import classes from '../ScaleExplorer.module.css';

export interface SummaryColumn {
  /** Comparison slot 0-3. */
  slot: number;
  /** Prime-form key written with spaces, e.g. "0 2 4 5 7 9 11". */
  z: number[];
  rows: SummaryRow[];
}

interface SummaryPanelProps {
  pcs: number[];
  rows: SummaryRow[];
  columns: SummaryColumn[];
  note: string;
  playingKey: string | null;
  onPlay: (z: number[], loaded: boolean) => void;
  onRemove: (z: number[]) => void;
  onClearAll: () => void;
}

const zKey = (z: number[]) => z.join(',');
export const playKeyFor = (z: number[]) => `p:${zKey(z)}`;

/** The loaded set's statistics, with one extra column per comparison set. */
export function SummaryPanel({
  pcs,
  rows,
  columns,
  note,
  playingKey,
  onPlay,
  onRemove,
  onClearAll,
}: SummaryPanelProps) {
  const loadedZ = pcs.map((x) => (x - pcs[0] + 12) % 12);
  const known = new Set(rows.map((r) => r.label));
  const extra: SummaryRow[] = [];
  columns.forEach((c) =>
    c.rows.forEach((r) => {
      if (!known.has(r.label) && !r.plain) {
        known.add(r.label);
        extra.push(r);
      }
    })
  );
  const lookup = (c: SummaryColumn, label: string) => c.rows.find((r) => r.label === label);

  const cell = (r: SummaryRow | undefined) =>
    r ? (
      <>
        <Data size="sm">{r.value}</Data>
        {r.note && (
          <Text span size="xs" c="dimmed" ml={4}>
            {r.note}
          </Text>
        )}
      </>
    ) : (
      <Data size="sm">—</Data>
    );

  return (
    <Surface aria-live="polite">
      {(columns.length > 0 || note) && (
        <Group gap="xs" mb="sm" wrap="wrap">
          <Group gap={6} wrap="nowrap">
            <i className={classes.swatch} />
            <Text size="sm">Loaded</Text>
            <Data size="sm">{`{${pcs.join(', ')}}`}</Data>
            <ActionIcon
              size="sm"
              variant="default"
              aria-label="Play the loaded scale"
              onClick={() => onPlay(loadedZ, true)}
            >
              {playingKey === playKeyFor(loadedZ) ? '■' : '▶'}
            </ActionIcon>
          </Group>
          {columns.map((c) => (
            <Group key={c.slot} gap={6} wrap="nowrap" className={classes[`slot${c.slot}`]}>
              <i className={classes.swatch} data-slot={c.slot} />
              <Data size="sm" c="inherit">{`[${c.z.join(' ')}]`}</Data>
              <ActionIcon
                size="sm"
                variant="default"
                aria-label="Play this comparison"
                onClick={() => onPlay(c.z, false)}
              >
                {playingKey === playKeyFor(c.z) ? '■' : '▶'}
              </ActionIcon>
              <ActionIcon
                size="sm"
                variant="default"
                aria-label="Remove this comparison"
                onClick={() => onRemove(c.z)}
              >
                ×
              </ActionIcon>
            </Group>
          ))}
          {columns.length > 1 && (
            <Button size="compact-xs" variant="default" onClick={onClearAll}>
              Clear All
            </Button>
          )}
          {note && (
            <Text size="xs" c="dimmed" w="100%">
              {note}
            </Text>
          )}
        </Group>
      )}
      <Table.ScrollContainer minWidth={0}>
        <Table verticalSpacing={4} withRowBorders>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.label}>
                <Table.Td w="40%">
                  <Text size="xs" c="dimmed" title={r.tip}>
                    {r.label}
                  </Text>
                </Table.Td>
                <Table.Td>{r.plain ? <Text size="sm">{r.value}</Text> : cell(r)}</Table.Td>
                {!r.plain &&
                  columns.map((c) => (
                    <Table.Td key={c.slot} className={classes[`slot${c.slot}`]}>
                      {cell(lookup(c, r.label))}
                    </Table.Td>
                  ))}
              </Table.Tr>
            ))}
            {extra.map((r) => (
              <Table.Tr key={`x-${r.label}`}>
                <Table.Td w="40%">
                  <Text size="xs" c="dimmed" title={r.tip}>
                    {r.label}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Data size="sm">—</Data>
                </Table.Td>
                {columns.map((c) => (
                  <Table.Td key={c.slot} className={classes[`slot${c.slot}`]}>
                    {cell(lookup(c, r.label))}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Surface>
  );
}
