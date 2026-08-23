import {
  generateMelodicForms,
  realizeScale,
  scalePitchClassPacket,
  scaleSequence,
} from "./scaleConstruction";
import { applyPitchRouteTreatment, defaultPitchRouteTreatment } from "./routeTreatments";
import type { PitchGroupValue, PitchValue } from "./pitch";

describe("scaleConstruction", () => {
  it("rejects empty or non-positive-integer interval sequences", () => {
    expect(() => scaleSequence([])).toThrow();
    expect(() => scaleSequence([2, 0])).toThrow();
    expect(() => scaleSequence([2, -1])).toThrow();
    expect(() => scaleSequence([2, 1.5])).toThrow();
  });

  it("computes the period as the sum of intervals", () => {
    expect(scaleSequence([2, 2, 1]).period).toBe(5);
    expect(scaleSequence([1, 3, 1]).period).toBe(5);
  });

  it("generates every general permutation of a 2-unit binomial without deduping", () => {
    expect(generateMelodicForms([3, 2], "general")).toEqual([
      [3, 2],
      [2, 3],
    ]);
  });

  it("generates all 6 general permutations of a 3-interval scale (Book II §C)", () => {
    const forms = generateMelodicForms([2, 2, 1], "general");
    expect(forms).toHaveLength(6);
    expect(forms).toEqual(
      expect.arrayContaining([
        [2, 2, 1],
        [2, 1, 2],
        [1, 2, 2],
      ]),
    );
  });

  it("keeps repeated general-permutation outputs distinct rather than collapsing them", () => {
    // Two positions share the value 2, so several of the 3! = 6 orderings coincide as
    // sequences (e.g. two different swaps both yield [2, 2, 1]) — all 6 must still be
    // reported, since the process actually produced 6 orderings.
    const forms = generateMelodicForms([2, 2, 1], "general");
    expect(forms).toHaveLength(6);
    const collapsed = new Set(forms.map((form) => form.join(",")));
    expect(collapsed.size).toBeLessThan(forms.length);
  });

  it("generates circular permutations equal in count to the interval length", () => {
    const forms = generateMelodicForms([2, 1, 2], "circular");
    expect(forms).toEqual([
      [2, 1, 2],
      [1, 2, 2],
      [2, 2, 1],
    ]);
  });

  it("realizes a scale as cumulative offsets from a root, unfolded (no mod-12)", () => {
    expect(realizeScale([2, 2, 1], 0)).toEqual([0, 2, 4, 5]);
    expect(realizeScale([2, 2, 1], 60)).toEqual([60, 62, 64, 65]);
  });

  it("emits pitch-class packet items as PitchGroupValue-wrapped PitchClassValue, matching Pitch List's own shape", () => {
    const packet = scalePitchClassPacket([2, 2, 1], 0, "src");
    expect(packet.domain).toBe("pitchClass");
    const first = packet.items[0].value as PitchGroupValue;
    expect(first.pitches).toHaveLength(1);
    expect(first.pitches[0]).toMatchObject({ pitchClass: 0, label: "C" });
  });

  it("voices as concrete pitch without producing NaN midicents (regression: Melodicization's 'must contain finite concrete midicent values' error)", () => {
    const packet = scalePitchClassPacket([2, 2, 1], 0, "src");
    const voiced = applyPitchRouteTreatment(
      packet,
      { ...defaultPitchRouteTreatment, voiceAsPitch: true },
      "route:test",
    );
    expect(voiced?.domain).toBe("pitch");
    for (const item of voiced!.items) {
      const group = item.value as PitchGroupValue;
      for (const pitch of group.pitches as PitchValue[]) {
        expect(Number.isFinite(pitch.midicents)).toBe(true);
      }
    }
    // C-D-E-F from root 0 -> MIDI 60,62,64,65 (register floor 60) -> midicents 6000..6500
    expect(
      voiced!.items.map((item) => ((item.value as PitchGroupValue).pitches[0] as PitchValue).midicents),
    ).toEqual([6000, 6200, 6400, 6500]);
  });
});
