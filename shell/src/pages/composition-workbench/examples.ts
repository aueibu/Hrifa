import type { Connection, ModuleInstance, PatchDocument } from "./model";

function instance(
  id: string,
  definitionId: string,
  order: number,
  parameters: Record<string, unknown> = {},
): ModuleInstance {
  return { id, definitionId, definitionVersion: "1.0.0", order, parameters };
}

function connection(
  fromInstanceId: string,
  fromPort: string,
  toInstanceId: string,
  toPort: string,
): Connection {
  return {
    id: `${fromInstanceId}:${fromPort}->${toInstanceId}:${toPort}`,
    fromInstanceId,
    fromPort,
    toInstanceId,
    toPort,
  };
}

export function createDefaultPatch(): PatchDocument {
  return {
    schemaVersion: 1,
    title: "Euclidean rhythm study",
    metadata: {
      note: "The fourth pair, length 4 with 7 impulses, demonstrates routed invalid frames.",
    },
    instances: [
      instance("length-values", "integer-list", 0, { values: [8, 12, 16, 4] }),
      instance("length-meaning", "as-cycle-length", 1),
      instance("pulse-values", "integer-list", 2, { values: [3, 5, 7, 7] }),
      instance("pulse-meaning", "as-pulse-count", 3),
      instance("offset-value", "integer-value", 4, { value: 1 }),
      instance("offset-meaning", "as-phase-offset", 5),
      instance("parameter-combiner", "combine-parameters", 6, {
        alignment: "zip",
        invalidPolicy: "route",
      }),
      instance("rhythm-generator", "euclidean-rhythm", 7),
      instance("pattern-inspector", "inspect-output", 8),
    ],
    connections: [
      connection("length-values", "output", "length-meaning", "input"),
      connection("pulse-values", "output", "pulse-meaning", "input"),
      connection("offset-value", "output", "offset-meaning", "input"),
      connection("length-meaning", "output", "parameter-combiner", "length"),
      connection("pulse-meaning", "output", "parameter-combiner", "impulses"),
      connection("offset-meaning", "output", "parameter-combiner", "offset"),
      connection("parameter-combiner", "frames", "rhythm-generator", "frames"),
      connection("rhythm-generator", "patterns", "pattern-inspector", "input"),
    ],
  };
}
