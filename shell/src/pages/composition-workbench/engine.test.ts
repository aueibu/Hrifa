import { alignParameterPackets, positiveModulo } from "./alignment";
import { euclideanRhythm } from "./euclidean";
import { evaluatePatch, topologicalOrder } from "./evaluator";
import { createDefaultPatch } from "./examples";
import {
  packet,
  type DataDomain,
  type DataKind,
  type DataPacket,
  type PatchDocument,
} from "./model";
import { exportPatch, importPatch } from "./persistence";
import { contractsCompatible, getDefinition } from "./registry";

function numbers(kind: DataKind, domain: DataDomain, values: number[]): DataPacket<number> {
  return packet(
    kind,
    domain,
    values.map((value, index) => ({ id: `${domain}:${index}`, value, provenance: [] })),
  );
}

const length = (values: number[], kind: DataKind = "list") => numbers(kind, "cycleLength", values);
const pulses = (values: number[], kind: DataKind = "list") => numbers(kind, "pulseCount", values);
const offsets = (values: number[], kind: DataKind = "list") => numbers(kind, "phaseOffset", values);

describe("parameter alignment", () => {
  it("broadcasts scalar packets in Zip", () => {
    const result = alignParameterPackets(
      length([8, 12, 16]),
      pulses([3, 5, 7]),
      offsets([1], "value"),
      "zip",
    );
    expect(result.frames.map((frame) => [frame.length, frame.impulses, frame.offset])).toEqual([
      [8, 3, 1],
      [12, 5, 1],
      [16, 7, 1],
    ]);
  });

  it("stops Zip at the shortest stream and reports unused items", () => {
    const result = alignParameterPackets(
      length([8, 12, 16]),
      pulses([3, 5]),
      offsets([0], "value"),
      "zip",
    );
    expect(result.frames).toHaveLength(2);
    expect(result.warnings).toContain("length: 1 trailing item unused by Zip.");
  });

  it("cycles shorter streams to the longest stream", () => {
    const result = alignParameterPackets(
      length([8, 12]),
      pulses([3, 5, 7]),
      offsets([0], "value"),
      "cycle",
    );
    expect(result.frames.map((frame) => [frame.length, frame.impulses, frame.offset])).toEqual([
      [8, 3, 0],
      [12, 5, 0],
      [8, 7, 0],
    ]);
  });

  it("creates cartesian combinations and refuses excessive expansion", () => {
    const result = alignParameterPackets(
      length([8, 12]),
      pulses([3, 5]),
      offsets([0, 1]),
      "cartesian",
    );
    expect(result.frames).toHaveLength(8);
    expect(
      alignParameterPackets(
        length(Array(20).fill(8)),
        pulses(Array(20).fill(3)),
        offsets([0], "value"),
        "cartesian",
      ).error,
    ).toMatch(/refused/);
  });
});

describe("Euclidean rhythm", () => {
  it("uses positive modulo for negative and oversized offsets", () => {
    expect(positiveModulo(-1, 8)).toBe(7);
    expect(positiveModulo(17, 8)).toBe(1);
    expect(euclideanRhythm(3, 8, -1)).toEqual(euclideanRhythm(3, 8, 7));
    expect(euclideanRhythm(3, 8, 17)).toEqual(euclideanRhythm(3, 8, 1));
  });

  it("has deterministic orientation and handles edge cases", () => {
    expect(euclideanRhythm(3, 8, 0).join("")).toBe("10010010");
    expect(euclideanRhythm(0, 4, 0)).toEqual([0, 0, 0, 0]);
    expect(euclideanRhythm(4, 4, 0)).toEqual([1, 1, 1, 1]);
  });
});

describe("registry graph evaluation", () => {
  function withPolicy(policy: string) {
    const patch = createDefaultPatch();
    patch.instances.find(
      (instance) => instance.id === "parameter-combiner",
    )!.parameters.invalidPolicy = policy;
    return evaluatePatch(patch).modules.get("parameter-combiner")!;
  }

  it("validates complete frames under route, skip, and stop policies", () => {
    const routed = withPolicy("route");
    expect(routed.evaluation.outputs.frames.items).toHaveLength(3);
    expect(routed.evaluation.outputs.rejected.items).toHaveLength(1);
    expect(routed.evaluation.outputs.rejected.items[0].value).toMatchObject({
      length: 4,
      impulses: 7,
      reason: "impulses 7 exceeds length 4",
    });

    const skipped = withPolicy("skip");
    expect(skipped.evaluation.outputs.frames.items).toHaveLength(3);
    expect(skipped.evaluation.outputs.rejected.items).toHaveLength(0);
    expect(skipped.evaluation.messages[0]).toMatch(/Skipped/);

    const stopped = withPolicy("stop");
    expect(stopped.evaluation.status).toBe("error");
    expect(stopped.evaluation.outputs.frames.items).toHaveLength(0);
  });

  it("preserves provenance through adapters, combination, and generation", () => {
    const evaluated = evaluatePatch(createDefaultPatch());
    const pattern = evaluated.modules.get("rhythm-generator")!.evaluation.outputs.patterns.items[0];
    expect(pattern.provenance.map((entry) => entry.transformation)).toEqual([
      "authored value",
      "as-cycle-length",
      "authored value",
      "as-pulse-count",
      "authored value",
      "as-phase-offset",
      "combine-parameters",
      "euclidean-rhythm",
    ]);
    const frameSources = pattern.provenance[6].sourceItemIds;
    expect(frameSources).toHaveLength(3);
    expect(pattern.provenance[7].parameters).toMatchObject({
      length: 8,
      impulses: 3,
      requestedOffset: 1,
    });
  });

  it("distinguishes compatible and incompatible port contracts", () => {
    const integer = getDefinition("integer-list", "1.0.0")!;
    const lengthAdapter = getDefinition("as-cycle-length", "1.0.0")!;
    const combine = getDefinition("combine-parameters", "1.0.0")!;
    expect(contractsCompatible(integer.outputs.output, lengthAdapter.inputs.input)).toBe(true);
    expect(contractsCompatible(integer.outputs.output, combine.inputs.length)).toBe(false);
  });

  it("evaluates in topological order and detects cycles", () => {
    const patch = createDefaultPatch();
    expect(topologicalOrder(patch).cycle).toBe(false);
    expect(
      evaluatePatch(patch).modules.get("rhythm-generator")!.evaluation.outputs.patterns.items,
    ).toHaveLength(3);
    const cyclic: PatchDocument = {
      ...patch,
      connections: [
        ...patch.connections,
        {
          id: "cycle",
          fromInstanceId: "pattern-inspector",
          fromPort: "output",
          toInstanceId: "rhythm-generator",
          toPort: "frames",
        },
      ],
    };
    expect(evaluatePatch(cyclic).errors[0]).toMatch(/Cycle detected/);
  });
});

describe("patch persistence", () => {
  it("round-trips schema version 1 and rejects other versions", () => {
    const patch = createDefaultPatch();
    expect(importPatch(exportPatch(patch))).toEqual(patch);
    expect(() => importPatch(JSON.stringify({ ...patch, schemaVersion: 2 }))).toThrow(
      /Unsupported/,
    );
  });
});
