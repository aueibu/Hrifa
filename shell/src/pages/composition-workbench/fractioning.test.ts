import { fractioningShiftCount, generateFractioning } from "./fractioning";

describe("fractioning", () => {
  it("rejects invalid or malformed generator pairs", () => {
    expect(() => generateFractioning(3, 3)).toThrow();
    expect(() => generateFractioning(2, 3)).toThrow();
    expect(() => generateFractioning(3.5, 2)).toThrow();
  });

  it("computes the number of staggered minor-generator clocks", () => {
    expect(fractioningShiftCount(3, 2)).toBe(2);
    expect(fractioningShiftCount(7, 3)).toBe(5);
  });

  it("reproduces Absil's 3÷2 fractioning resultant", () => {
    const result = generateFractioning(3, 2);
    expect(result.period).toBe(9);
    expect(result.attacks).toEqual([0, 2, 3, 4, 5, 6, 7]);
    expect(result.durations).toEqual([2, 1, 1, 1, 1, 1, 2]);
  });

  it("reproduces Absil's 4÷3 fractioning resultant", () => {
    const result = generateFractioning(4, 3);
    expect(result.period).toBe(16);
    expect(result.attacks).toEqual([0, 3, 4, 6, 7, 8, 9, 10, 12, 13]);
    expect(result.durations).toEqual([3, 1, 2, 1, 1, 1, 1, 2, 1, 3]);
  });

  it("reproduces Absil's 5÷4 fractioning resultant", () => {
    const result = generateFractioning(5, 4);
    expect(result.period).toBe(25);
    expect(result.attacks).toEqual([0, 4, 5, 8, 9, 10, 12, 13, 15, 16, 17, 20, 21]);
    expect(result.durations).toEqual([4, 1, 3, 1, 1, 2, 1, 2, 1, 1, 3, 1, 4]);
  });

  it("reproduces Absil's 6÷5 fractioning resultant", () => {
    const result = generateFractioning(6, 5);
    expect(result.period).toBe(36);
    expect(result.attacks).toEqual([0, 5, 6, 10, 11, 12, 15, 16, 18, 20, 21, 24, 25, 26, 30, 31]);
    expect(result.durations).toEqual([5, 1, 4, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 4, 1, 5]);
  });

  it("reproduces the attack and duration counts for Absil's 5÷2 and 7÷3", () => {
    const fiveByTwo = generateFractioning(5, 2);
    expect(fiveByTwo.period).toBe(25);
    expect(fiveByTwo.attacks).toHaveLength(21);
    expect(fiveByTwo.durations.slice(0, 2)).toEqual([2, 2]);
    expect(fiveByTwo.durations.slice(-2)).toEqual([2, 2]);
    expect(new Set(fiveByTwo.durations)).toEqual(new Set([1, 2]));

    const sevenByThree = generateFractioning(7, 3);
    expect(sevenByThree.period).toBe(49);
    expect(sevenByThree.attacks).toHaveLength(37);
    expect(new Set(sevenByThree.durations)).toEqual(new Set([1, 2, 3]));
  });

  it("is symmetric about the pattern centre, as Absil notes for every case", () => {
    for (const [a, b] of [
      [3, 2],
      [4, 3],
      [5, 2],
      [5, 3],
      [5, 4],
      [6, 5],
      [7, 3],
    ]) {
      const { durations } = generateFractioning(a, b);
      expect(durations).toEqual([...durations].reverse());
    }
  });
});
