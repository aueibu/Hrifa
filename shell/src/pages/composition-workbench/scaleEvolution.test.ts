import {
  evolveScale,
  finalPitchClassesPacket,
  rotations,
  stagePitchClassesPacket,
  synchronizeRotations,
} from "./scaleEvolution";

describe("scaleEvolution", () => {
  it("rejects empty or non-positive-integer interval sequences", () => {
    expect(() => synchronizeRotations([])).toThrow();
    expect(() => synchronizeRotations([2, 0])).toThrow();
    expect(() => synchronizeRotations([2, -1])).toThrow();
  });

  it("generates every rotation without deduplicating coincident ones", () => {
    // A prime-length sequence with a repeated value (4, 4, 3) still yields 3 distinct
    // rotations as sequences, but the function must not special-case that — it always
    // returns exactly `length` rotations, generated in full.
    expect(rotations([4, 4, 3])).toEqual([
      [4, 4, 3],
      [4, 3, 4],
      [3, 4, 4],
    ]);
    // A genuinely periodic sequence (period 2 within length 4) produces rotations that
    // literally repeat as sequences — all 4 must still be present, not collapsed to 2.
    expect(rotations([2, 1, 2, 1])).toEqual([
      [2, 1, 2, 1],
      [1, 2, 1, 2],
      [2, 1, 2, 1],
      [1, 2, 1, 2],
    ]);
  });

  it("reproduces Book II's worked binomial synchronization: 5 = 3+2 / 2+3 -> 2+1+2", () => {
    const stage = synchronizeRotations([3, 2]);
    expect(stage.period).toBe(5);
    expect(stage.attacks).toEqual([0, 2, 3]);
    expect(stage.durations).toEqual([2, 1, 2]);
    expect(stage.collapsedToNeutral).toBe(false);
  });

  it("reproduces Book II's stated quintinomial collapse of the 3+2 family to neutral", () => {
    const result = evolveScale([3, 2]);
    expect(result.terminationReason).toBe("collapsed");
    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].durations).toEqual([2, 1, 2]);
    expect(result.stages[1].durations).toEqual([1, 1, 1, 1, 1]);
    expect(result.stages[1].collapsedToNeutral).toBe(true);
  });

  it("reproduces the 4+4+3 trinomial's quintinomial resultant (period 11)", () => {
    const stage = synchronizeRotations([4, 4, 3]);
    expect(stage.period).toBe(11);
    expect(stage.attacks).toEqual([0, 3, 4, 7, 8]);
    expect(stage.durations).toEqual([3, 1, 3, 1, 3]);
    expect(stage.collapsedToNeutral).toBe(false);
  });

  it("terminates by cycle detection rather than looping forever on a fixed point", () => {
    // A single-interval "scale" (period = its own value) has exactly one rotation,
    // which synchronizes to itself: an immediate fixed point.
    const result = evolveScale([4]);
    expect(result.stages).toHaveLength(1);
    expect(result.terminationReason === "collapsed" || result.terminationReason === "cycle").toBe(
      true,
    );
  });

  it("never returns more stages than the safety cap even in degenerate cases", () => {
    const result = evolveScale([7, 5, 3]);
    expect(result.stages.length).toBeLessThanOrEqual(64);
  });

  it("realizes every stage as an actual pitch-class scale, not just interval numbers", () => {
    const result = evolveScale([3, 2]);
    const packet = stagePitchClassesPacket(result, 0, 'src');
    expect(packet.items).toHaveLength(2);
    // Stage 1: 2+1+2 from root 0 -> pitch classes 0,2,3,5 (bare, bracketed as one bank item)
    expect(packet.items[0].value).toEqual([0, 2, 3, 5]);
    expect(packet.items[0].label).toBe('C-D-D#-F');
    // Stage 2: 1+1+1+1+1 from root 0 -> the full chromatic run 0..5
    expect(packet.items[1].value).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("realizes stage pitch classes from an arbitrary root, wrapping mod 12", () => {
    const result = evolveScale([3, 2]);
    const packet = stagePitchClassesPacket(result, 10, 'src');
    // Stage 1 durations 2,1,2 from root 10 -> 10,12,13,15 -> mod 12 -> 10,0,1,3
    expect(packet.items[0].value).toEqual([10, 0, 1, 3]);
  });

  it("keeps stage pitch-class items as bare number[] so a future bank-entry selector needs no reinterpretation", () => {
    const result = evolveScale([3, 2]);
    const packet = stagePitchClassesPacket(result, 0, 'src');
    for (const item of packet.items) {
      expect(Array.isArray(item.value)).toBe(true);
      for (const pitchClass of item.value) {
        expect(typeof pitchClass).toBe('number');
      }
      expect(typeof item.label).toBe('string');
    }
  });

  it("realizes the final stage as a single pitch-class list output, one bare number per degree", () => {
    const result = evolveScale([3, 2]);
    const packet = finalPitchClassesPacket(result, 0, 'src');
    expect(packet.domain).toBe('pitchClass');
    expect(packet.items.map((item) => item.value)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
