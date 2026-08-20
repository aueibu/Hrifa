import {
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Data } from "../../../components/Data/Data";
import { Surface } from "../../../components/Surface/Surface";
import type { EvaluatedModule, PatchDocument } from "../model";
import { contractsCompatible, getDefinition } from "../registry";

interface ModulePatchProps {
  patch: PatchDocument;
  evaluated: Map<string, EvaluatedModule>;
  selectedId: string | null;
  onSelect(id: string): void;
  onParameter(id: string, key: string, value: unknown): void;
  onConnect(toId: string, toPort: string, source: string | null): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
}

function statusColor(status: EvaluatedModule["evaluation"]["status"] | undefined) {
  if (status === "error") {
    return "red";
  }
  if (status === "warning") {
    return "yellow";
  }
  return "green";
}

export function ModulePatch(props: ModulePatchProps) {
  const instances = [...props.patch.instances].sort((a, b) => a.order - b.order);
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={2} size="h4">
          Module patch
        </Title>
        <Data size="xs">directed graph | {instances.length} modules</Data>
      </Group>
      {instances.map((instance, index) => {
        const definition = getDefinition(instance.definitionId, instance.definitionVersion);
        if (!definition) {
          return null;
        }
        const result = props.evaluated.get(instance.id);
        return (
          <Surface
            key={instance.id}
            tone={props.selectedId === instance.id ? "raised" : "default"}
            className={props.selectedId === instance.id ? undefined : ""}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="start">
                <Group gap="xs">
                  <Badge variant="outline">{index + 1}</Badge>
                  <div>
                    <Text fw={700}>{definition.title}</Text>
                    <Data size="xs" c="dimmed">
                      {definition.id}@{definition.version} | {instance.id}
                    </Data>
                  </div>
                </Group>
                <Badge color={statusColor(result?.evaluation.status)} variant="light">
                  {result?.evaluation.status ?? "blocked"}
                </Badge>
              </Group>

              {Object.entries(definition.inputs).map(([port, contract]) => {
                const current = props.patch.connections.find(
                  (connection) =>
                    connection.toInstanceId === instance.id && connection.toPort === port,
                );
                const options = instances
                  .filter((candidate) => candidate.order < instance.order)
                  .flatMap((candidate) => {
                    const candidateDefinition = getDefinition(
                      candidate.definitionId,
                      candidate.definitionVersion,
                    );
                    if (!candidateDefinition) {
                      return [];
                    }
                    return Object.entries(candidateDefinition.outputs)
                      .filter(([, output]) => contractsCompatible(output, contract))
                      .map(([outputPort]) => ({
                        value: `${candidate.id}|${outputPort}`,
                        label: `${candidateDefinition.title} | ${outputPort}`,
                      }));
                  });
                return (
                  <Select
                    key={port}
                    label={contract.label}
                    description={contract.description}
                    placeholder="Not connected"
                    clearable
                    data={options}
                    value={current ? `${current.fromInstanceId}|${current.fromPort}` : null}
                    onChange={(value) => props.onConnect(instance.id, port, value)}
                  />
                );
              })}

              {definition.parameters.map((field) => {
                const value = instance.parameters[field.key];
                if (field.type === "select") {
                  return (
                    <Select
                      key={field.key}
                      label={field.label}
                      data={field.options ?? []}
                      value={String(value ?? "")}
                      onChange={(next) => next && props.onParameter(instance.id, field.key, next)}
                    />
                  );
                }
                if (field.type === "integer") {
                  return (
                    <NumberInput
                      key={field.key}
                      label={field.label}
                      value={Number(value)}
                      allowDecimal={false}
                      onChange={(next) => props.onParameter(instance.id, field.key, Number(next))}
                    />
                  );
                }
                return (
                  <TextInput
                    key={field.key}
                    label={field.label}
                    description="Comma-separated integers"
                    value={Array.isArray(value) ? value.join(", ") : ""}
                    onChange={(event) => {
                      const values = event.currentTarget.value
                        .split(/[\s,]+/)
                        .filter(Boolean)
                        .map(Number)
                        .filter(Number.isInteger);
                      props.onParameter(instance.id, field.key, values);
                    }}
                  />
                );
              })}

              <Group gap="xs">
                {Object.entries(result?.evaluation.outputs ?? {}).map(([port, output]) => (
                  <Badge key={port} variant="outline">
                    {port}: {output.domain} {output.kind} ({output.items.length} items)
                  </Badge>
                ))}
              </Group>
              {result?.evaluation.messages.map((message) => (
                <Text key={message} size="xs" c="dimmed">
                  {message}
                </Text>
              ))}
              <Group gap="xs">
                <Button size="compact-sm" onClick={() => props.onSelect(instance.id)}>
                  Inspect
                </Button>
                <Button
                  size="compact-sm"
                  variant="default"
                  onClick={() => props.onDuplicate(instance.id)}
                >
                  Duplicate
                </Button>
                <Button
                  size="compact-sm"
                  variant="default"
                  color="red"
                  onClick={() => props.onDelete(instance.id)}
                >
                  Delete
                </Button>
              </Group>
            </Stack>
          </Surface>
        );
      })}
    </Stack>
  );
}
