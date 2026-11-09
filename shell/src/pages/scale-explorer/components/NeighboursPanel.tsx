import { Accordion, Group, Select, Table, Text, Title } from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import { Surface } from '../../../components/Surface/Surface';
import { sgn } from '../format';
import { pathLayout } from '../neighbours';
import { linkInfo, type Mode } from '../pitchSets';
import { NEIGHBOURS_HINT } from '../texts';
import { LINK, OPACITY, STROKE, useScaleStyle } from '../useScaleStyle';
import { LineSample } from './Legend';
import classes from '../ScaleExplorer.module.css';

interface NeighboursPanelProps {
  view: Mode[];
  pathMax: number;
  onPathMax: (n: number) => void;
  /** Open a mode's row and scroll to it. */
  onPick: (index: number) => void;
}

/** Modes placed by fifths brightness and linked by how many notes differ, plus a common-tones matrix. */
export function NeighboursPanel({ view, pathMax, onPathMax, onPick }: NeighboursPanelProps) {
  const style = useScaleStyle();
  const layout = pathLayout(view, pathMax);
  if (!layout) {
    return null;
  }
  const n0 = view[0].z.length;
  const label = (m: Mode) => String(m.ks[0]);
  const distances = Array.from({ length: layout.maxD }, (_, i) => i + 1);

  return (
    <Surface aria-label="Modal neighbors">
      <Group justify="space-between" align="end" mb="xs">
        <Title order={3} size="h5">
          Modal Neighbors
        </Title>
        <Select
          size="xs"
          label="Link modes that differ by up to"
          w={130}
          allowDeselect={false}
          value={String(layout.shown)}
          data={distances.map((i) => ({
            value: String(i),
            label: `${i} ${i === 1 ? 'note' : 'notes'}`,
          }))}
          onChange={(v) => v && onPathMax(Number(v))}
        />
      </Group>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        role="img"
        aria-label="Modal neighbors: modes placed by fifths brightness, linked by how many notes differ"
      >
        {layout.links.map((l, i) =>
          l.curve ? (
            <path
              key={i}
              d={l.curve}
              fill="none"
              stroke={style.links[l.d - 1]}
              strokeOpacity={LINK.opacities[l.d - 1]}
              strokeWidth={LINK.widths[l.d - 1]}
              strokeLinecap="round"
            />
          ) : (
            <line
              key={i}
              stroke={style.links[l.d - 1]}
              strokeOpacity={LINK.opacities[l.d - 1]}
              strokeWidth={LINK.widths[l.d - 1]}
              strokeLinecap="round"
              x1={l.line![0]}
              y1={l.line![1]}
              x2={l.line![2]}
              y2={l.line![3]}
            />
          )
        )}
        {layout.nodes.map((n) => (
          <g key={n.index} className={classes.peak} onClick={() => onPick(n.index)}>
            <circle
              fill={style.accent}
              fillOpacity={n.mode.k === 1 && !n.mode.srcs.length ? 1 : OPACITY.soft}
              stroke={style.accent}
              strokeWidth={STROKE.line}
              cx={n.x}
              cy={n.y}
              r={11}
            />
            <text className={classes.peakText} x={n.x} y={n.y + 4}>
              {label(n.mode)}
            </text>
            <text className={classes.peakSub} x={n.x} y={n.y + 24}>
              {sgn(n.fs)}
            </text>
          </g>
        ))}
      </svg>
      <Group gap="md" mt="xs" aria-label="Link colours">
        {distances.map((i) => (
          <Group key={i} gap={6} opacity={i > layout.shown ? 0.4 : 1}>
            <LineSample
              color={style.links[i - 1]}
              width={LINK.widths[i - 1]}
              opacity={LINK.opacities[i - 1]}
            />
            <Text size="xs">
              {i} {i === 1 ? 'note' : 'notes'} · {layout.counts[i]}
            </Text>
          </Group>
        ))}
      </Group>
      <Text size="xs" c="dimmed" mt="xs">
        {NEIGHBOURS_HINT} <b>{layout.summary}</b>
        {layout.perfect ? ', so this scale brightens one note at a time.' : '.'} Steps between
        neighbours: {layout.gaps.join(', ')}.
      </Text>
      <Accordion variant="default" mt="xs">
        <Accordion.Item value="common">
          <Accordion.Control>Common Tones Between Modes (Same Root)</Accordion.Control>
          <Accordion.Panel>
            <Table.ScrollContainer minWidth={0}>
              <Table verticalSpacing={2} horizontalSpacing={6} withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th />
                    {view.map((m) => (
                      <Table.Th key={m.k}>{label(m)}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {view.map((a) => (
                    <Table.Tr key={a.k}>
                      <Table.Th>{label(a)}</Table.Th>
                      {view.map((b) => {
                        if (a === b) {
                          return (
                            <Table.Td key={b.k}>
                              <Data size="sm" c="dimmed">
                                {n0}
                              </Data>
                            </Table.Td>
                          );
                        }
                        const li = linkInfo(a, b);
                        return (
                          <Table.Td
                            key={b.k}
                            bg={
                              li.d >= 1 && li.d <= 6
                                ? `color-mix(in srgb, ${style.links[li.d - 1]} ${OPACITY.soft * 100}%, transparent)`
                                : undefined
                            }
                          >
                            <Data size="sm">{li.c}</Data>
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Text size="xs" c="dimmed" mt="xs">
              Each cell counts the notes two modes share when both start on the same root. Cell
              color matches the line color for that number of differing notes.
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Surface>
  );
}
