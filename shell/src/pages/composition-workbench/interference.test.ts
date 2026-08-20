import {
  alignGeneratorValues,
  generateInterference,
  generatorAttackCount,
  groupingOptions,
  interferenceDurationPacket,
  interferenceGeneratorDurationPacket,
  metronomeGridClicks,
  parseGeneratorValues,
} from "./interference";

describe("interference generation", () => {
  it("reproduces Schillinger and Absil resultants", () => {
    expect(generateInterference([3, 2])).toEqual({
      recurrence: 6,
      attacks: [
        { time: 0, generatorIndices: [0, 1] },
        { time: 2, generatorIndices: [1] },
        { time: 3, generatorIndices: [0] },
        { time: 4, generatorIndices: [1] },
      ],
      durations: [2, 1, 1, 2],
    });
    expect(generateInterference([4, 3]).durations).toEqual([3, 1, 2, 2, 1, 3]);
  });

  it("extends the union-of-attacks method to n generators at their LCM", () => {
    const result = generateInterference([2, 3, 5]);
    expect(result.recurrence).toBe(30);
    expect(result.durations).toEqual([
      2, 1, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 1, 2,
    ]);
    expect(result.attacks[0].generatorIndices).toEqual([0, 1, 2]);
  });

  it("uses a duration pattern sum for recurrence while preserving its internal impulses", () => {
    const result = generateInterference([[6, 2], [3]]);
    expect(result.recurrence).toBe(24);
    expect(
      result.attacks
        .filter((attack) => attack.generatorIndices.includes(0))
        .map((attack) => attack.time),
    ).toEqual([0, 6, 8, 14, 16, 22]);
    expect(result.attacks.find((attack) => attack.time === 6)?.generatorIndices).toEqual([0, 1]);
  });

  it("emits a cyclic inter-onset duration list with grouping and provenance", () => {
    const result = generateInterference([3, 2]);
    const grouping = groupingOptions([3, 2], result.recurrence)[0];
    const output = interferenceDurationPacket(
      result,
      [{ id: "generator-a" }, { id: "generator-b" }],
      grouping,
    );
    expect(output).toMatchObject({
      kind: "list",
      domain: "duration",
      role: "interOnset",
      frame: {
        topology: "cyclic",
        unit: "pulse",
        extent: 6,
        origin: 0,
        grouping: { id: "recurrence", units: 6, boundaries: [0] },
      },
    });
    expect(output.items.map((item) => item.value)).toEqual([2, 1, 1, 2]);
    expect(output.items[0]).toMatchObject({
      id: "interference:attack:0",
      provenance: [
        {
          sourceItemIds: ["generator-a", "generator-b"],
          transformation: "interference-resultant",
        },
      ],
    });
  });

  it("publishes an individual generator as its own cyclic inter-onset lane", () => {
    const output = interferenceGeneratorDurationPacket(
      [2, 1, 3],
      { id: "generator-a", label: "Generator 1" },
      0,
    );

    expect(output).toMatchObject({
      kind: "list",
      domain: "duration",
      role: "interOnset",
      metadata: {
        generatorId: "generator-a",
        generatorLabel: "Generator 1",
        attackTimes: [0, 2, 3],
      },
      frame: { topology: "cyclic", unit: "pulse", extent: 6, origin: 0 },
    });
    expect(output.items.map((item) => item.value)).toEqual([2, 1, 3]);
    expect(output.items[0].provenance[0]).toMatchObject({
      sourceItemIds: ["generator-a"],
      transformation: "interference-generator-lane",
    });
  });

  it("measures preview cost by generator attacks rather than elapsed duration", () => {
    expect(generatorAttackCount([1, 1, 1, 1, 100], 100)).toBe(401);
    expect(generatorAttackCount([4, 5, 10, 20, 25], 100)).toBe(64);
    expect(generatorAttackCount([[6, 2], [3]], 24)).toBe(14);
  });

  it("places metronome ticks on every grid unit and accents grouping starts", () => {
    expect(metronomeGridClicks(8, 3)).toEqual([
      { time: 0, accented: true },
      { time: 1, accented: false },
      { time: 2, accented: false },
      { time: 3, accented: true },
      { time: 4, accented: false },
      { time: 5, accented: false },
      { time: 6, accented: true },
      { time: 7, accented: false },
    ]);
  });

  it("aligns generator lists without hiding the policy", () => {
    const generators = [
      { id: "a", label: "A", values: [3, 5], midiNote: 60 },
      { id: "b", label: "B", values: [2, 3, 4], midiNote: 64 },
    ];
    expect(alignGeneratorValues(generators, "zip").frames.map((frame) => frame.values)).toEqual([
      [3, 2],
      [5, 3],
    ]);
    expect(alignGeneratorValues(generators, "cycle").frames.map((frame) => frame.values)).toEqual([
      [3, 2],
      [5, 3],
      [3, 4],
    ]);
    expect(alignGeneratorValues(generators, "cartesian").frames).toHaveLength(6);
  });

  it("retains historical grouping families as explicit options", () => {
    const options = groupingOptions([2, 3, 5], 30);
    expect(options.find((option) => option.id === "recurrence")?.units).toBe(30);
    expect(
      options.filter((option) => option.family === "generator").map((option) => option.units),
    ).toEqual([2, 3, 5]);
    expect(
      options.filter((option) => option.family === "complementary").map((option) => option.units),
    ).toEqual([6, 10, 15]);
  });

  it("rejects non-positive and non-integer authored values", () => {
    expect(parseGeneratorValues("3, 2 5").values).toEqual([3, 2, 5]);
    expect(parseGeneratorValues("3, 0").error).toMatch(/positive whole numbers/);
    expect(() => generateInterference([3, 0])).toThrow(/positive whole-number/);
  });
});
