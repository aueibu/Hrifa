import { alignParameterPackets, positiveModulo, type AlignmentMode } from "./alignment";
import { euclideanRhythm } from "./euclidean";
import {
  emptyPacket,
  packet,
  type DataDomain,
  type DataItem,
  type DataKind,
  type DataPacket,
  type ModuleDefinition,
  type ModuleEvaluation,
  type ParameterFrame,
  type PortContract,
  type RejectedFrame,
  type RhythmPattern,
  type ValidParameterFrame,
} from "./model";

const integerOutput = contract("Integer data", "Numerical values without musical meaning.", [
  ["value", "integer"],
  ["list", "integer"],
]);

function contract(
  label: string,
  description: string,
  accepts: [DataKind | "*", DataDomain | "*"][],
): PortContract {
  return { label, description, accepts: accepts.map(([kind, domain]) => ({ kind, domain })) };
}

function sourceItems(instanceId: string, values: number[]): DataItem<number>[] {
  return values.map((value, index) => ({
    id: `${instanceId}:item:${index}`,
    value,
    provenance: [
      {
        sourceModuleInstance: instanceId,
        sourceItemIds: [],
        transformation: "authored value",
        parameters: { value },
      },
    ],
  }));
}

function ok(outputs: Record<string, DataPacket>, messages: string[] = []): ModuleEvaluation {
  return { outputs, messages, status: messages.length ? "warning" : "ready" };
}

function missing(message: string, outputs: Record<string, DataPacket>): ModuleEvaluation {
  return { outputs, messages: [message], status: "error" };
}

function adapter(
  id: string,
  title: string,
  domain: DataDomain,
  validate: (value: number) => string | undefined,
): ModuleDefinition {
  return {
    id,
    version: "1.0.0",
    title,
    description: `Explicitly assigns ${domain} meaning to integer data.`,
    category: "Semantic adapters",
    inputs: { input: integerOutput },
    outputs: {
      output: contract(title, `Validated ${domain} values.`, [
        ["value", domain],
        ["list", domain],
      ]),
    },
    parameters: [],
    defaultParameters: {},
    evaluate: ({ instance, inputs }) => {
      const input = inputs.input as DataPacket<number> | undefined;
      if (!input) return missing("Connect integer data.", { output: emptyPacket("list", domain) });
      const messages: string[] = [];
      const items = input.items.flatMap((item) => {
        const issue = validate(item.value);
        if (issue) {
          messages.push(`${item.id}: ${issue}`);
          return [];
        }
        return [
          {
            ...item,
            id: `${instance.id}:${item.id}`,
            provenance: [
              ...item.provenance,
              {
                sourceModuleInstance: instance.id,
                sourceItemIds: [item.id],
                transformation: id,
              },
            ],
          },
        ];
      });
      return {
        outputs: {
          output: packet(input.kind, domain, items, [...input.warnings], input.metadata, {
            role: input.role,
            frame: input.frame,
          }),
        },
        messages,
        status: messages.length ? "warning" : "ready",
      };
    },
  };
}

function rejectFrame(frame: ParameterFrame, index: number, reason: string): RejectedFrame {
  return { ...frame, id: `frame:${index}`, reason };
}

function frameIssue(frame: ParameterFrame) {
  if (frame.length <= 0) return `length ${frame.length} must be positive`;
  if (frame.impulses < 0) return `impulses ${frame.impulses} must be nonnegative`;
  if (frame.impulses > frame.length)
    return `impulses ${frame.impulses} exceeds length ${frame.length}`;
  return undefined;
}

const definitions: ModuleDefinition[] = [
  {
    id: "integer-value",
    version: "1.0.0",
    title: "Integer Value",
    description: "Produces one editable integer scalar.",
    category: "Sources",
    inputs: {},
    outputs: { output: integerOutput },
    parameters: [{ key: "value", label: "Value", type: "integer" }],
    defaultParameters: { value: 1 },
    evaluate: ({ instance }) =>
      ok({
        output: packet(
          "value",
          "integer",
          sourceItems(instance.id, [Number(instance.parameters.value)]),
        ),
      }),
  },
  {
    id: "integer-list",
    version: "1.0.0",
    title: "Integer List",
    description: "Produces an ordered list with stable item identities.",
    category: "Sources",
    inputs: {},
    outputs: { output: integerOutput },
    parameters: [{ key: "values", label: "Values", type: "integerList" }],
    defaultParameters: { values: [8, 12, 16] },
    evaluate: ({ instance }) => {
      const values = Array.isArray(instance.parameters.values)
        ? instance.parameters.values.map(Number).filter(Number.isInteger)
        : [];
      return ok({ output: packet("list", "integer", sourceItems(instance.id, values)) });
    },
  },
  adapter("as-cycle-length", "As Cycle Length", "cycleLength", (value) =>
    value > 0 ? undefined : "cycle length must be positive",
  ),
  adapter("as-pulse-count", "As Pulse Count", "pulseCount", (value) =>
    value >= 0 ? undefined : "pulse count must be nonnegative",
  ),
  adapter("as-phase-offset", "As Phase Offset", "phaseOffset", () => undefined),
  {
    id: "combine-parameters",
    version: "1.0.0",
    title: "Combine Parameters",
    description:
      "Aligns semantic streams, builds complete frames, then validates their relationships.",
    category: "Composition",
    inputs: {
      length: contract("Length", "Cycle-length value or list.", [
        ["value", "cycleLength"],
        ["list", "cycleLength"],
      ]),
      impulses: contract("Impulses", "Pulse-count value or list.", [
        ["value", "pulseCount"],
        ["list", "pulseCount"],
      ]),
      offset: contract("Offset", "Phase-offset value or list.", [
        ["value", "phaseOffset"],
        ["list", "phaseOffset"],
      ]),
    },
    outputs: {
      frames: contract("Parameter frames", "Complete eligible rhythm parameters.", [
        ["list", "parameterFrame"],
      ]),
      rejected: contract("Rejected frames", "Invalid complete frames with reasons.", [
        ["list", "rejectedFrame"],
      ]),
    },
    parameters: [
      {
        key: "alignment",
        label: "Alignment",
        type: "select",
        options: [
          { label: "Zip", value: "zip" },
          { label: "Cycle", value: "cycle" },
          { label: "Cartesian", value: "cartesian" },
        ],
      },
      {
        key: "invalidPolicy",
        label: "Invalid frames",
        type: "select",
        options: [
          { label: "Stop", value: "stop" },
          { label: "Skip", value: "skip" },
          { label: "Route", value: "route" },
        ],
      },
    ],
    defaultParameters: { alignment: "zip", invalidPolicy: "route" },
    evaluate: ({ instance, inputs }) => {
      const length = inputs.length as DataPacket<number> | undefined;
      const impulses = inputs.impulses as DataPacket<number> | undefined;
      const offset = inputs.offset as DataPacket<number> | undefined;
      const empty = {
        frames: emptyPacket("list", "parameterFrame"),
        rejected: emptyPacket("list", "rejectedFrame"),
      };
      if (!length || !impulses || !offset)
        return missing("Connect length, impulses, and offset.", empty);
      const aligned = alignParameterPackets(
        length,
        impulses,
        offset,
        instance.parameters.alignment as AlignmentMode,
      );
      if (aligned.error) return missing(aligned.error, empty);
      const valid: DataItem<ValidParameterFrame>[] = [];
      const rejected: DataItem<RejectedFrame>[] = [];
      const provenanceByItem = new Map(
        [...length.items, ...impulses.items, ...offset.items].map((item) => [
          item.id,
          item.provenance,
        ]),
      );
      aligned.frames.forEach((frame, index) => {
        const inheritedProvenance = frame.sourceItemIds.flatMap(
          (itemId) => provenanceByItem.get(itemId) ?? [],
        );
        const issue = frameIssue(frame);
        if (issue) {
          const value = rejectFrame(frame, index, issue);
          rejected.push({
            id: `${instance.id}:rejected:${index}`,
            value,
            provenance: [
              ...inheritedProvenance,
              {
                sourceModuleInstance: instance.id,
                sourceItemIds: frame.sourceItemIds,
                transformation: "combine-parameters",
                parameters: {
                  alignment: instance.parameters.alignment,
                  invalidPolicy: instance.parameters.invalidPolicy,
                },
                parameterFrameId: value.id,
              },
            ],
          });
        } else {
          const value: ValidParameterFrame = {
            ...frame,
            id: `frame:${index}`,
            effectiveOffset: positiveModulo(frame.offset, frame.length),
          };
          valid.push({
            id: `${instance.id}:frame:${index}`,
            value,
            provenance: [
              ...inheritedProvenance,
              {
                sourceModuleInstance: instance.id,
                sourceItemIds: frame.sourceItemIds,
                transformation: "combine-parameters",
                parameters: { alignment: instance.parameters.alignment },
                parameterFrameId: value.id,
              },
            ],
          });
        }
      });
      const policy = instance.parameters.invalidPolicy;
      if (policy === "stop" && rejected.length) {
        return missing(`Stopped: ${rejected[0].value.reason}.`, {
          frames: empty.frames,
          rejected: packet("list", "rejectedFrame", rejected),
        });
      }
      const routed = policy === "route" ? rejected : [];
      const messages = [
        ...aligned.warnings,
        ...(policy === "skip" && rejected.length
          ? [`Skipped ${rejected.length} invalid frame(s).`]
          : []),
        ...(policy === "route" && rejected.length
          ? [`Routed ${rejected.length} invalid frame(s).`]
          : []),
      ];
      return {
        outputs: {
          frames: packet("list", "parameterFrame", valid, aligned.warnings, {
            alignment: instance.parameters.alignment,
          }),
          rejected: packet("list", "rejectedFrame", routed),
        },
        messages,
        status: messages.length ? "warning" : "ready",
      };
    },
  },
  {
    id: "euclidean-rhythm",
    version: "1.0.0",
    title: "Euclidean Rhythm",
    description: "Generates deterministic Bjorklund patterns; positive offsets rotate right.",
    category: "Rhythm",
    inputs: {
      frames: contract("Frames", "Eligible parameter frames.", [["list", "parameterFrame"]]),
    },
    outputs: {
      patterns: contract("Patterns", "Ordered rhythm pattern stream.", [["list", "rhythmPattern"]]),
    },
    parameters: [],
    defaultParameters: {},
    evaluate: ({ instance, inputs }) => {
      const input = inputs.frames as DataPacket<ValidParameterFrame> | undefined;
      if (!input)
        return missing("Connect valid parameter frames.", {
          patterns: emptyPacket("list", "rhythmPattern"),
        });
      const items: DataItem<RhythmPattern>[] = input.items.map((item, index) => {
        const frame = item.value;
        const value: RhythmPattern = {
          length: frame.length,
          impulses: frame.impulses,
          requestedOffset: frame.offset,
          effectiveOffset: frame.effectiveOffset,
          bits: euclideanRhythm(frame.impulses, frame.length, frame.effectiveOffset),
        };
        return {
          id: `${instance.id}:pattern:${index}`,
          value,
          provenance: [
            ...item.provenance,
            {
              sourceModuleInstance: instance.id,
              sourceItemIds: [item.id],
              transformation: "euclidean-rhythm",
              parameters: {
                length: frame.length,
                impulses: frame.impulses,
                requestedOffset: frame.offset,
                effectiveOffset: frame.effectiveOffset,
              },
              parameterFrameId: frame.id,
            },
          ],
        };
      });
      return ok({
        patterns: packet("list", "rhythmPattern", items, [], undefined, {
          role: "pattern",
          frame: { topology: "linear" },
        }),
      });
    },
  },
  {
    id: "inspect-output",
    version: "1.0.0",
    title: "Inspect Output",
    description: "Pins any supported packet for close inspection.",
    category: "Utilities",
    inputs: { input: contract("Packet", "Any packet produced by the registry.", [["*", "*"]]) },
    outputs: { output: contract("Packet", "The unchanged pinned packet.", [["*", "*"]]) },
    parameters: [],
    defaultParameters: {},
    evaluate: ({ inputs }) => {
      if (!inputs.input)
        return missing("Connect a packet to inspect.", {
          output: emptyPacket("list", "integer"),
        });
      return ok({ output: inputs.input });
    },
  },
];

export const moduleRegistry = new Map(definitions.map((definition) => [definition.id, definition]));
export const moduleDefinitions = definitions;

export function getDefinition(id: string, version: string) {
  const definition = moduleRegistry.get(id);
  return definition?.version === version ? definition : undefined;
}

export function acceptsPacket(contractValue: PortContract, packetValue: DataPacket) {
  return contractValue.accepts.some(
    (accepted) =>
      (accepted.kind === "*" || accepted.kind === packetValue.kind) &&
      (accepted.domain === "*" || accepted.domain === packetValue.domain) &&
      (!accepted.encodings ||
        (packetValue.encoding !== undefined &&
          accepted.encodings.includes(packetValue.encoding))) &&
      (!accepted.roles ||
        (packetValue.role !== undefined && accepted.roles.includes(packetValue.role))) &&
      (!accepted.topologies ||
        (packetValue.frame !== undefined &&
          accepted.topologies.includes(packetValue.frame.topology))),
  );
}

export function contractsCompatible(output: PortContract, input: PortContract) {
  return output.accepts.some((source) =>
    input.accepts.some(
      (target) =>
        (source.kind === "*" || target.kind === "*" || source.kind === target.kind) &&
        (source.domain === "*" || target.domain === "*" || source.domain === target.domain) &&
        (!source.encodings ||
          !target.encodings ||
          source.encodings.some((encoding) => target.encodings?.includes(encoding))) &&
        (!source.roles ||
          !target.roles ||
          source.roles.some((role) => target.roles?.includes(role))) &&
        (!source.topologies ||
          !target.topologies ||
          source.topologies.some((topology) => target.topologies?.includes(topology))),
    ),
  );
}
