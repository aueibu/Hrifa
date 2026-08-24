import { packet } from "./model";
import {
  boundOutput,
  compositionOutputOptions,
  describeOutputRef,
  outputPortKey,
  outputRefKey,
  parseOutputRef,
  resolveBoundPacket,
  type PublishedCompositionOutput,
} from "./compositionRouting";

function bankOutput(): PublishedCompositionOutput {
  return {
    ref: { instanceId: "sc", port: "melodicForms" },
    label: "Scale Construction · Melodic Forms",
    packet: packet(
      "bank",
      "interval",
      [
        { id: "sc:form:0", value: [3, 2], label: "3+2", provenance: [] },
        { id: "sc:form:1", value: [2, 3], label: "2+3", provenance: [] },
      ],
      [],
      { mode: "general" }
    ),
  };
}

function listOutput(): PublishedCompositionOutput {
  return {
    ref: { instanceId: "if", port: "resultant" },
    label: "Interference · Resultant",
    packet: packet("list", "duration", [{ id: "if:0", value: 2, provenance: [] }], [], undefined, {
      role: "interOnset",
    }),
  };
}

describe("compositionRouting", () => {
  it("round-trips a plain ref through outputRefKey/parseOutputRef", () => {
    const ref = { instanceId: "sc", port: "sequence" };
    expect(parseOutputRef(outputRefKey(ref))).toEqual(ref);
  });

  it("round-trips a bank-entry ref (with index) through outputRefKey/parseOutputRef", () => {
    const ref = { instanceId: "sc", port: "melodicForms", index: 3 };
    expect(parseOutputRef(outputRefKey(ref))).toEqual(ref);
  });

  it("strips the index for the published-output lookup key", () => {
    expect(outputPortKey({ instanceId: "sc", port: "melodicForms", index: 5 })).toBe("sc|melodicForms");
    expect(outputPortKey({ instanceId: "sc", port: "melodicForms" })).toBe("sc|melodicForms");
  });

  it("rejects a malformed ref string", () => {
    expect(() => parseOutputRef("onlyOnePart")).toThrow();
  });

  describe("resolveBoundPacket", () => {
    it("passes a non-bank output through unchanged", () => {
      const outputs = [listOutput()];
      const resolved = resolveBoundPacket(outputs, { instanceId: "if", port: "resultant" }, "dest");
      expect(resolved).toBe(outputs[0].packet);
    });

    it("returns undefined for an unbound or unresolvable ref", () => {
      expect(resolveBoundPacket([], undefined, "dest")).toBeUndefined();
      expect(resolveBoundPacket([], { instanceId: "gone", port: "x" }, "dest")).toBeUndefined();
    });

    it("unpacks the selected bank entry into a plain list", () => {
      const outputs = [bankOutput()];
      const resolved = resolveBoundPacket(
        outputs,
        { instanceId: "sc", port: "melodicForms", index: 1 },
        "dest"
      )!;
      expect(resolved.kind).toBe("list");
      expect(resolved.domain).toBe("interval");
      expect(resolved.items.map((item) => item.value)).toEqual([2, 3]);
    });

    it("clamps a stale index to the nearest valid entry rather than failing", () => {
      const outputs = [bankOutput()];
      const tooHigh = resolveBoundPacket(
        outputs,
        { instanceId: "sc", port: "melodicForms", index: 99 },
        "dest"
      )!;
      expect(tooHigh.items.map((item) => item.value)).toEqual([2, 3]); // clamps to the last entry (index 1)

      const negative = resolveBoundPacket(
        outputs,
        { instanceId: "sc", port: "melodicForms", index: -5 },
        "dest"
      )!;
      expect(negative.items.map((item) => item.value)).toEqual([3, 2]); // clamps to the first entry (index 0)
    });

    it("chains provenance from the bank entry through the selection step", () => {
      const outputs = [bankOutput()];
      const resolved = resolveBoundPacket(
        outputs,
        { instanceId: "sc", port: "melodicForms", index: 0 },
        "dest"
      )!;
      expect(resolved.items[0].provenance.at(-1)).toMatchObject({
        transformation: "select-bank-entry",
        parameters: { index: 0, position: 0 },
      });
    });
  });

  describe("boundOutput / describeOutputRef", () => {
    it("finds the published output regardless of a bank-entry index", () => {
      const outputs = [bankOutput()];
      expect(boundOutput(outputs, { instanceId: "sc", port: "melodicForms", index: 1 })).toBe(outputs[0]);
    });

    it("describes a plain output by its own label", () => {
      const outputs = [listOutput()];
      expect(describeOutputRef(outputs, { instanceId: "if", port: "resultant" })).toBe(
        "Interference · Resultant"
      );
    });

    it("describes a bank selection with the chosen entry's label appended", () => {
      const outputs = [bankOutput()];
      expect(
        describeOutputRef(outputs, { instanceId: "sc", port: "melodicForms", index: 1 })
      ).toBe("Scale Construction · Melodic Forms · 2+3");
    });
  });

  describe("compositionOutputOptions", () => {
    it("lists a compatible plain output as one row", () => {
      const options = compositionOutputOptions(
        [listOutput()],
        "dest",
        (p) => p.kind === "list" && p.domain === "duration"
      );
      expect(options).toEqual([{ value: "if|resultant", label: "Interference · Resultant" }]);
    });

    it("flattens a compatible bank into one row per entry", () => {
      const options = compositionOutputOptions(
        [bankOutput()],
        "dest",
        (p) => p.kind === "list" && p.domain === "interval"
      );
      expect(options).toEqual([
        { value: "sc|melodicForms|0", label: "Scale Construction · Melodic Forms · 3+2" },
        { value: "sc|melodicForms|1", label: "Scale Construction · Melodic Forms · 2+3" },
      ]);
    });

    it("excludes an incompatible bank entirely, not one placeholder row", () => {
      const options = compositionOutputOptions(
        [bankOutput()],
        "dest",
        (p) => p.domain === "pitchClass"
      );
      expect(options).toEqual([]);
    });

    it("excludes outputs from the requesting module itself", () => {
      const options = compositionOutputOptions([listOutput()], "if", () => true);
      expect(options).toEqual([]);
    });
  });
});
