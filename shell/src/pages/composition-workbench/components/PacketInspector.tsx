import { Badge, Code, Group, ScrollArea, Stack, Table, Text, Title } from "@mantine/core";
import { Data } from "../../../components/Data/Data";
import { Surface } from "../../../components/Surface/Surface";
import type {
  DataItem,
  DataPacket,
  EvaluatedModule,
  RejectedFrame,
  RhythmPattern,
  ValidParameterFrame,
} from "../model";
import { RhythmPatternPreview } from "./RhythmPatternPreview";

function ItemValue({ item, packet }: { item: DataItem; packet: DataPacket }) {
  if (packet.domain === "rhythmPattern") {
    const pattern = item.value as RhythmPattern;
    return (
      <Stack gap={4}>
        <RhythmPatternPreview pattern={pattern} />
        <Text size="xs">
          length {pattern.length} | impulses {pattern.impulses} | requested offset{" "}
          {pattern.requestedOffset} | effective offset {pattern.effectiveOffset}
        </Text>
      </Stack>
    );
  }
  if (packet.domain === "parameterFrame") {
    const frame = item.value as ValidParameterFrame;
    return (
      <Data size="xs">
        ({frame.length}, {frame.impulses}, {frame.offset}) → offset {frame.effectiveOffset}
      </Data>
    );
  }
  if (packet.domain === "rejectedFrame") {
    const frame = item.value as RejectedFrame;
    return (
      <Text size="xs">
        ({frame.length}, {frame.impulses}, {frame.offset}) — {frame.reason}
      </Text>
    );
  }
  return <Data size="xs">{JSON.stringify(item.value)}</Data>;
}

function PacketView({ name, packet }: { name: string; packet: DataPacket }) {
  return (
    <Surface tone="inset" p="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {name}
          </Text>
          <Group gap={4}>
            <Badge variant="outline" size="xs">
              {packet.kind}
            </Badge>
            <Badge variant="outline" size="xs">
              {packet.domain}
            </Badge>
          </Group>
        </Group>
        {packet.items.length === 0 && (
          <Text size="xs" c="dimmed">
            No items.
          </Text>
        )}
        {packet.domain === "parameterFrame" && packet.items.length > 0 && (
          <Table withTableBorder striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Length</Table.Th>
                <Table.Th>Impulses</Table.Th>
                <Table.Th>Requested</Table.Th>
                <Table.Th>Effective</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {packet.items.map((item, index) => {
                const frame = item.value as ValidParameterFrame;
                return (
                  <Table.Tr key={`frame-row:${item.id}`}>
                    <Table.Td>{index + 1}</Table.Td>
                    <Table.Td>{frame.length}</Table.Td>
                    <Table.Td>{frame.impulses}</Table.Td>
                    <Table.Td>{frame.offset}</Table.Td>
                    <Table.Td>{frame.effectiveOffset}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
        {packet.items.map((item) => (
          <Surface key={item.id} p="xs">
            <Stack gap={4}>
              <ItemValue item={item} packet={packet} />
              <Data size="xs" c="dimmed">
                {item.id}
              </Data>
              <Text size="xs" fw={600}>
                Provenance
              </Text>
              {item.provenance.map((entry, index) => (
                <Code key={`${entry.transformation}:${index}`} block>
                  {entry.transformation} | {entry.sourceModuleInstance}
                  {"\n"}sources: {entry.sourceItemIds.join(", ") || "authored"}
                  {entry.parameterFrameId ? `\nframe: ${entry.parameterFrameId}` : ""}
                  {entry.parameters ? `\nparameters: ${JSON.stringify(entry.parameters)}` : ""}
                </Code>
              ))}
            </Stack>
          </Surface>
        ))}
        {packet.warnings.map((warning) => (
          <Text key={warning} size="xs" c="dimmed">
            {warning}
          </Text>
        ))}
      </Stack>
    </Surface>
  );
}

export function PacketInspector({ module }: { module?: EvaluatedModule }) {
  if (!module) {
    return (
      <Surface>
        <Title order={2} size="h4">
          Inspector
        </Title>
        <Text size="sm" c="dimmed">
          Select a module to inspect its packets and provenance.
        </Text>
      </Surface>
    );
  }
  return (
    <Surface>
      <Stack gap="sm">
        <Title order={2} size="h4">
          Inspector
        </Title>
        <div>
          <Text fw={700}>{module.definition.title}</Text>
          <Data size="xs" c="dimmed">
            {module.instance.id}
          </Data>
        </div>
        {module.evaluation.messages.length > 0 && (
          <Table withTableBorder>
            <Table.Tbody>
              {module.evaluation.messages.map((message) => (
                <Table.Tr key={message}>
                  <Table.Td>{message}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        <ScrollArea.Autosize mah="70vh">
          <Stack gap="sm">
            {Object.entries(module.inputs).map(([name, value]) => (
              <PacketView key={`input:${name}`} name={`Input | ${name}`} packet={value} />
            ))}
            {Object.entries(module.evaluation.outputs).map(([name, value]) => (
              <PacketView key={`output:${name}`} name={`Output | ${name}`} packet={value} />
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </Surface>
  );
}
