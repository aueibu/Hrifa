import { generateInterference, groupingOptions } from "../interference";
import { melodicize } from "../melodicization";
import { packet } from "../model";
import { defaultMusicalTimeline, musicalDuration } from "../musicalTime";
import { interpretPitchList } from "../pitch";
import {
  createInterferencePreviewPlan,
  createNotePacketPerformancePlan,
  createPitchPreviewPlan,
  frequencyToMidicents,
} from "./performancePlans";

describe("performance-plan compilation", () => {
  it("turns a pitch list into timed, provenance-preserving audition events", () => {
    const provenance = [
      {
        sourceModuleInstance: "pitch-list",
        sourceItemIds: ["inline:0"],
        transformation: "read-as-midicent",
      },
    ];
    const result = createPitchPreviewPlan({
      sourceId: "pitch-list",
      groups: [
        {
          id: "group:0",
          pitches: [
            { id: "pitch:0", midicents: 6000 },
            { id: "pitch:1", midicents: 6400 },
          ],
          provenance,
        },
        {
          id: "group:1",
          pitches: [{ id: "pitch:2", midicents: 6200 }],
          provenance: [],
        },
      ],
      stepSeconds: 0.3,
      gatePercent: 75,
    });

    expect(result.plan.durationSeconds).toBeCloseTo(0.6);
    expect(result.plan.events[0].durationSeconds).toBeCloseTo(0.225);
    expect(result.plan.events).toMatchObject([
      {
        atSeconds: 0,
        pitchMidicents: 6000,
        instrumentId: "preview.triangle",
        busId: "preview",
        provenance,
      },
      { atSeconds: 0, pitchMidicents: 6400 },
      { atSeconds: 0.3, pitchMidicents: 6200 },
    ]);
    expect(result.audibleEvents).toBe(3);
    expect(result.skippedEvents).toBe(0);
  });

  it("keeps inaudible pitch values out of the renderer without changing list duration", () => {
    const result = createPitchPreviewPlan({
      sourceId: "pitch-list",
      groups: [
        {
          id: "audible",
          pitches: [{ id: "audible:pitch", midicents: 6900 }],
          provenance: [],
        },
        {
          id: "inaudible",
          pitches: [{ id: "inaudible:pitch", midicents: 20_000 }],
          provenance: [],
        },
      ],
      stepSeconds: 0.5,
      gatePercent: 100,
    });

    expect(result.plan.durationSeconds).toBe(1);
    expect(result.plan.events).toHaveLength(1);
    expect(result.plan.warnings).toHaveLength(1);
    expect(result.skippedEvents).toBe(1);
  });

  it("combines generator attacks and grouping clicks into named buses", () => {
    const patterns = [[2], [3]];
    const result = generateInterference(patterns);
    const grouping = groupingOptions([2, 3], result.recurrence)[0];
    const plan = createInterferencePreviewPlan({
      sourceId: "interference",
      patterns,
      midiNotes: [48, 55],
      result,
      unitSeconds: 0.16,
      grouping,
    });

    expect(plan.durationSeconds).toBeCloseTo(0.96);
    expect(plan.events.filter((event) => event.busId === "preview")).toHaveLength(5);
    expect(plan.events.filter((event) => event.busId === "metronome")).toHaveLength(6);
    expect(plan.events[0]).toMatchObject({
      atSeconds: 0,
      pitchMidicents: 4800,
      instrumentId: "preview.sine",
    });
    expect(plan.events.some((event) => event.instrumentId === "preview.click-accent")).toBe(true);
    expect(plan.events.every((event) => event.provenance.length > 0)).toBe(true);
  });

  it("normalizes renderer frequencies to midicents", () => {
    expect(frequencyToMidicents(440)).toBe(6900);
  });

  it("keeps composed note packets in musical time for transport playback", () => {
    const rhythm = packet(
      "list",
      "duration",
      [2, 1].map((value, index) => ({ id: `rhythm:${index}`, value, provenance: [] })),
      [],
      undefined,
      { role: "interOnset", frame: { topology: "cyclic", unit: "pulse", extent: 3 } },
    );
    const pitches = interpretPitchList({
      instanceId: "pitch-list",
      format: "midi-note",
      inlineText: "[60 64], 62",
    }).packet;
    const notes = melodicize({
      instanceId: "melodicization",
      rhythm,
      pitches,
      allocation: "cycle",
      pulseUnit: musicalDuration(1, 4),
      articulationPercent: 150,
    }).packet;
    const plan = createNotePacketPerformancePlan({
      sourceId: "melodicization",
      packet: notes,
      timeline: defaultMusicalTimeline,
    });

    expect(plan.timebase.kind).toBe("musical");
    expect(plan.events[0]).toMatchObject({
      at: { quarterNotes: { numerator: 0, denominator: 1 } },
      duration: { quarterNotes: { numerator: 3, denominator: 4 } },
      pitchMidicents: 6000,
    });
    expect(plan.events[1]).toMatchObject({
      at: { quarterNotes: { numerator: 0, denominator: 1 } },
      pitchMidicents: 6400,
    });
    expect(plan.events).toHaveLength(3);
    expect(plan.duration).toEqual(musicalDuration(7, 8));
  });
});
