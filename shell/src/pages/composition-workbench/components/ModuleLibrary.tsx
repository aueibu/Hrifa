import { useState } from "react";
import { Badge, Button, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { Surface } from "../../../components/Surface/Surface";
import type { ModuleDefinition } from "../model";

export function ModuleLibrary({
  definitions,
  onAdd,
}: {
  definitions: ModuleDefinition[];
  onAdd: (definition: ModuleDefinition) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = definitions.filter((definition) =>
    `${definition.title} ${definition.description} ${definition.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Surface>
      <Stack gap="sm">
        <Title order={2} size="h4">
          Module library
        </Title>
        <TextInput
          label="Search modules"
          placeholder="Source, adapter, rhythm…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Stack gap="xs">
          {filtered.map((definition) => (
            <Surface key={definition.id} tone="inset" p="sm">
              <Stack gap={4}>
                <Group justify="space-between" align="start" wrap="nowrap">
                  <Text fw={600} size="sm">
                    {definition.title}
                  </Text>
                  <Button size="compact-xs" variant="light" onClick={() => onAdd(definition)}>
                    Add
                  </Button>
                </Group>
                <Badge variant="outline" size="xs">
                  {definition.category}
                </Badge>
                <Text size="xs" c="dimmed">
                  {definition.description}
                </Text>
              </Stack>
            </Surface>
          ))}
        </Stack>
      </Stack>
    </Surface>
  );
}
