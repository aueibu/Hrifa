import { generateFractioning } from "./fractioning";
import { binarySynchronizationDurations, generatePairComposition } from "./pairComposition";

describe("binary synchronization durations", () => {
  it("reproduces Absil's r_{a÷b} resultants from section 2.1", () => {
    expect(binarySynchronizationDurations(3, 2)).toEqual([2, 1, 1, 2]);
    expect(binarySynchronizationDurations(4, 3)).toEqual([3, 1, 2, 2, 1, 3]);
    expect(binarySynchronizationDurations(5, 2)).toEqual([2, 2, 1, 1, 2, 2]);
    expect(binarySynchronizationDurations(5, 3)).toEqual([3, 2, 1, 3, 1, 2, 3]);
    expect(binarySynchronizationDurations(7, 3)).toEqual([3, 3, 1, 2, 3, 2, 1, 3, 3]);
  });
});

describe("pair composition", () => {
  it("rejects malformed generator pairs", () => {
    expect(() => generatePairComposition(2, 3, "balancing")).toThrow();
    expect(() => generatePairComposition(3, 3, "expanding")).toThrow();
  });

  it("expands r_E(3,2) as fractioning followed by binary sync, per Absil Eq. 5.3", () => {
    const result = generatePairComposition(3, 2, "expanding");
    expect(result.period).toBe(15); // ab + a^2 = 6 + 9
    expect(result.durations).toEqual([2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2]);
  });

  it("expands r_E(5,3) to the length Absil states (24 attacks, 40 time units)", () => {
    const result = generatePairComposition(5, 3, "expanding");
    expect(result.period).toBe(40);
    expect(result.durations).toHaveLength(24);
  });

  it("contracts r_C(4,3) as binary sync followed by fractioning, per Absil Eq. 5.4", () => {
    const result = generatePairComposition(4, 3, "contracting");
    expect(result.period).toBe(28); // a^2 + ab = 16 + 12
    expect(result.durations).toEqual([3, 1, 2, 2, 1, 3, 3, 1, 2, 1, 1, 1, 1, 2, 1, 3]);
  });

  it("contracts r_C(5,3) to the length Absil states (24 attacks, 40 time units)", () => {
    const result = generatePairComposition(5, 3, "contracting");
    expect(result.period).toBe(40);
    expect(result.durations).toHaveLength(24);
  });

  it("balances r_B(3,2) with Eq. 5.1's remainder term a(a-b) = 3", () => {
    const result = generatePairComposition(3, 2, "balancing");
    expect(result.period).toBe(18); // 2a^2
    expect(result.durations).toEqual([2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 3]);
    expect(result.segments.at(-1)).toEqual({ label: "Balancing remainder", durations: [3] });
  });

  it("balances with multiplicity m = floor(a/b), unifying Absil's Eq. 5.1 and 5.2", () => {
    // Eq. 5.1 cases (a < 2b) are just m = 1 of the general formula.
    expect(generatePairComposition(4, 3, "balancing").segments[1].durations).toEqual(
      binarySynchronizationDurations(4, 3),
    );
    expect(generatePairComposition(5, 3, "balancing").segments.at(-1)).toEqual({
      label: "Balancing remainder",
      durations: [10],
    });

    // Eq. 5.2 cases (a >= 2b): m = floor(a/b), matching Absil's worked m values.
    const fiveByTwo = generatePairComposition(5, 2, "balancing");
    expect(fiveByTwo.segments[1].label).toBe("Binary sync 5÷2 ×2");
    expect(fiveByTwo.segments.at(-1)).toEqual({ label: "Balancing remainder", durations: [5] });

    const sevenByThree = generatePairComposition(7, 3, "balancing");
    expect(sevenByThree.segments[1].label).toBe("Binary sync 7÷3 ×2");
    expect(sevenByThree.segments.at(-1)).toEqual({ label: "Balancing remainder", durations: [7] });
  });

  it("always sums to a full 2a^2 recurrence, since the remainder is defined to close the gap", () => {
    for (const [a, b] of [
      [3, 2],
      [4, 3],
      [5, 2],
      [5, 3],
      [5, 4],
      [6, 5],
      [7, 3],
    ]) {
      const result = generatePairComposition(a, b, "balancing");
      const total = result.durations.reduce((sum, value) => sum + value, 0);
      expect(total).toBe(2 * a * a);
      expect(result.durations.slice(0, generateFractioning(a, b).durations.length)).toEqual(
        generateFractioning(a, b).durations,
      );
    }
  });
});
