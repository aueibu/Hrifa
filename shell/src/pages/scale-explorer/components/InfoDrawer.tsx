import { Accordion, ScrollArea, SimpleGrid, Table, Text, Title } from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import { Surface } from '../../../components/Surface/Surface';
import { CHORDS } from '../chords';
import { CALCULATION_HINT, CHORD_VOCABULARY_HINT } from '../texts';

const vocabulary = Object.keys(CHORDS)
  .sort((a, b) => {
    const x = a.split(',').map(Number);
    const y = b.split(',').map(Number);
    return x.length - y.length || x[1] - y[1] || x[2] - y[2] || (x[3] || 0) - (y[3] || 0);
  })
  .map((shape) => ({ shape: shape.split(','), entry: CHORDS[shape] }));

/** Reference notes: how each figure is calculated, and every chord shape the explorer can name. */
export function InfoDrawer() {
  return (
    <Surface p={0}>
      <Accordion variant="default">
        <Accordion.Item value="info">
          <Accordion.Control>
            How it is calculated, and the chord names it recognises
          </Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <section>
                <Title order={3} size="h5" mb="xs">
                  How It Is Calculated
                </Title>
                <Text size="sm" c="dimmed">
                  {CALCULATION_HINT}
                </Text>
              </section>
              <section>
                <Title order={3} size="h5" mb="xs">
                  Chord Names the Tool Recognises
                </Title>
                <ScrollArea.Autosize mah={420}>
                  <Table verticalSpacing={2} stickyHeader>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Notes</Table.Th>
                        <Table.Th>Shape</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Family</Table.Th>
                        <Table.Th>Also</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {vocabulary.map(({ shape, entry }) => (
                        <Table.Tr key={shape.join(',')}>
                          <Table.Td>{shape.length}</Table.Td>
                          <Table.Td>
                            <Data size="sm">{shape.join(' ')}</Data>
                          </Table.Td>
                          <Table.Td>
                            <b>{entry[0]}</b>
                          </Table.Td>
                          <Table.Td>{entry[1]}</Table.Td>
                          <Table.Td>{entry[2] ? entry[2].replace('~', '') : ''}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
                <Text size="xs" c="dimmed" mt="xs">
                  {CHORD_VOCABULARY_HINT}
                </Text>
              </section>
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Surface>
  );
}
