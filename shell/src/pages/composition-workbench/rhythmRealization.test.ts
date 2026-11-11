import { compileMixerPlan, channelBusId, defaultChannelConfig } from './mixer';
import { packet, type DataItem } from './model';
import {
  defaultMusicalTimeline,
  musicalDuration,
  musicalPositionToSeconds,
  rationalToNumber,
  type MusicalTimeline,
} from './musicalTime';
import {
  DEFAULT_GATE_PERCENT,
  createRhythmPreviewPlan,
  materialFromRhythmPacket,
  realizeRhythm,
  rhythmAttacks,
} from './rhythmRealization';
import { layerSound, defaultSoundSettings } from './sounds';
import { pulseSeconds, transportPulse } from './transport';

const sound = layerSound(defaultSoundSettings.rhythm, 0);
const sixteenth = musicalDuration(1, 4);
const q = (value: { quarterNotes: { numerator: number; denominator: number } }) =>
  rationalToNumber(value.quarterNotes);

function realize(durations: number[], extra: Partial<Parameters<typeof realizeRhythm>[0]> = {}) {
  return realizeRhythm({
    sourceId: 'src',
    layerId: 'a',
    steps: durations.map((duration) => ({ duration })),
    pulseUnit: sixteenth,
    sound,
    ...extra,
  });
}

describe('rhythmAttacks', () => {
  it('places attacks at the running sum, with the slot as the time to the next attack', () => {
    const { attacks, spanPulses, endPulses } = rhythmAttacks([
      { duration: 2 },
      { duration: 1 },
      { duration: 3 },
    ]);
    expect(attacks.map((a) => [a.atPulses, a.slotPulses])).toEqual([
      [0, 2],
      [2, 1],
      [3, 3],
    ]);
    expect(spanPulses).toBe(6);
    expect(endPulses).toBe(6);
  });

  it('treats negative durations as rests that consume time but make no attack', () => {
    const { attacks, spanPulses } = rhythmAttacks([
      { duration: 2 },
      { duration: -1 },
      { duration: 2 },
    ]);
    expect(attacks.map((a) => a.atPulses)).toEqual([0, 3]);
    expect(spanPulses).toBe(5);
  });

  it('extends the preceding event through a tie', () => {
    const { attacks, spanPulses } = rhythmAttacks([
      { duration: 2, tie: true },
      { duration: 1 },
      { duration: 2 },
    ]);
    expect(attacks.map((a) => [a.atPulses, a.slotPulses])).toEqual([
      [0, 3],
      [3, 2],
    ]);
    expect(spanPulses).toBe(5);
  });

  it('keeps fractional pulse counts exact', () => {
    // 2 x 3/5 = 6/5 and 1 x 3/5 = 3/5, held as floats and recovered exactly.
    const { attacks, spanPulses } = rhythmAttacks([
      { duration: 2 * (3 / 5) },
      { duration: 2 * (3 / 5) },
      { duration: 3 / 5 },
    ]);
    expect(attacks.map((a) => a.at)).toEqual([
      { numerator: 0, denominator: 1 },
      { numerator: 6, denominator: 5 },
      { numerator: 12, denominator: 5 },
    ]);
    expect(attacks[2].slot).toEqual({ numerator: 3, denominator: 5 });
    expect(spanPulses).toBeCloseTo(3);
    const events = realizeRhythm({
      sourceId: 's',
      layerId: 'a',
      pulseUnit: sixteenth,
      sound,
      gatePercent: 100,
      steps: [{ duration: 6 / 5 }, { duration: 3 / 5 }],
    }).events;
    // A pulse is a sixteenth (1/4 quarter note): 6/5 pulses is 3/10 of a quarter note.
    expect(events[1].at.quarterNotes).toEqual({ numerator: 3, denominator: 10 });
    expect(events[1].duration.quarterNotes).toEqual({ numerator: 3, denominator: 20 });
  });

  it('chains ties and reports a tie into a rest or off a linear end, then ignores it', () => {
    const chain = rhythmAttacks([
      { duration: 1, tie: true },
      { duration: 2, tie: true },
      { duration: 1 },
    ]);
    expect(chain.attacks.map((a) => [a.atPulses, a.slotPulses])).toEqual([[0, 4]]);
    const intoRest = rhythmAttacks([{ duration: 1, tie: true }, { duration: -1 }, { duration: 1 }]);
    expect(intoRest.attacks.map((a) => [a.atPulses, a.slotPulses])).toEqual([
      [0, 1],
      [2, 1],
    ]);
    expect(intoRest.warnings[0]).toMatch(/tied into a rest/);
    const offEnd = rhythmAttacks([{ duration: 1 }, { duration: 2, tie: true }]);
    expect(offEnd.attacks).toHaveLength(2);
    expect(offEnd.warnings[0]).toMatch(/ends with a tie/);
  });

  it('wraps a tie off the end of a cyclic rhythm onto its first step', () => {
    const steps = [{ duration: 1 }, { duration: 2 }, { duration: 1, tie: true }];
    const looped = rhythmAttacks(steps, 0, { cyclic: true });
    expect(looped.attacks.map((a) => [a.atPulses, a.slotPulses])).toEqual([
      [1, 2],
      [3, 2],
    ]);
    expect(looped.warnings).toEqual([]);
    expect(rhythmAttacks(steps).attacks).toHaveLength(3);
  });

  it('skips zero or non-finite steps with a warning rather than guessing', () => {
    const { attacks, warnings } = rhythmAttacks([
      { duration: 0 },
      { duration: Number.NaN },
      { duration: 2 },
    ]);
    expect(attacks).toHaveLength(1);
    expect(warnings).toHaveLength(2);
  });

  it('shifts every attack by the origin and counts it into the end', () => {
    const { attacks, spanPulses, endPulses } = rhythmAttacks([{ duration: 2 }, { duration: 1 }], 3);
    expect(attacks.map((a) => a.atPulses)).toEqual([3, 5]);
    expect(spanPulses).toBe(3);
    expect(endPulses).toBe(6);
  });
});

describe('realizeRhythm', () => {
  it('uses exact rational onsets from the pulse value', () => {
    const { events } = realize([2, 1, 1, 2]);
    expect(events.map((e) => e.at.quarterNotes)).toEqual([
      { numerator: 0, denominator: 1 },
      { numerator: 1, denominator: 2 },
      { numerator: 3, denominator: 4 },
      { numerator: 1, denominator: 1 },
    ]);
  });

  it('gates each event at 95% of its slot by default', () => {
    expect(DEFAULT_GATE_PERCENT).toBe(95);
    const { events } = realize([4]);
    expect(events[0].duration.quarterNotes).toEqual({ numerator: 19, denominator: 20 });
  });

  it('applies the gate to the whole tied span and clamps it to 1–200%', () => {
    expect(q(realize([2, 2], { gatePercent: 50 }).events[0].duration)).toBeCloseTo(0.25);
    const tied = realizeRhythm({
      sourceId: 's',
      layerId: 'a',
      pulseUnit: sixteenth,
      sound,
      gatePercent: 100,
      steps: [{ duration: 2, tie: true }, { duration: 2 }],
    });
    expect(q(tied.events[0].duration)).toBe(1);
    expect(q(realize([4], { gatePercent: 999 }).events[0].duration)).toBe(2);
    expect(q(realize([4], { gatePercent: 0 }).events[0].duration)).toBeCloseTo(0.01);
  });

  it('gives events stable ids and provenance with the gate used', () => {
    const [event] = realize([2], { steps: [{ duration: 2, itemId: 'item-9' }] }).events;
    expect(event.id).toBe('src:a:attack:0');
    expect(event.provenance[0]).toMatchObject({
      transformation: 'realize-rhythm',
      sourceItemIds: ['item-9'],
      parameters: { layer: 'a', gatePercent: 95 },
    });
  });
});

describe('equivalence with the seconds-based plan it replaces', () => {
  it('lands every onset at the same second as the old duration-sequence plan', () => {
    const settings = { tempo: 90, pulse: '1/4' };
    const timeline: MusicalTimeline = {
      ...defaultMusicalTimeline,
      tempoMap: [{ at: { quarterNotes: { numerator: 0, denominator: 1 } }, bpm: settings.tempo }],
    };
    const durations = [3, 2, 2, 1, 5];
    const unitSeconds = pulseSeconds(settings);
    // What the retired seconds-based builder produced: onsets are the running sum of durations.
    let cursor = 0;
    const old = {
      events: durations.map((duration) => {
        const atSeconds = cursor * unitSeconds;
        cursor += duration;
        return { atSeconds };
      }),
    };
    const plan = createRhythmPreviewPlan({
      sourceId: 'src',
      timeline,
      pulseUnit: transportPulse(settings).duration,
      layers: [{ layerId: 'a', steps: durations.map((duration) => ({ duration })), sound }],
    });
    const next = plan.events.map((e) => musicalPositionToSeconds(e.at, timeline.tempoMap));
    const before = old.events.map((e) => e.atSeconds);
    next.forEach((seconds, index) => expect(seconds).toBeCloseTo(before[index], 10));
    expect(plan.events).toHaveLength(old.events.length);
  });
});

describe('createRhythmPreviewPlan', () => {
  it('layers several rhythms on their own buses and runs to the longest', () => {
    const plan = createRhythmPreviewPlan({
      sourceId: 'src',
      timeline: defaultMusicalTimeline,
      pulseUnit: sixteenth,
      layers: [
        { layerId: 'a', steps: [{ duration: 4 }], sound },
        { layerId: 'b', steps: [{ duration: 2 }, { duration: 6 }], sound, busId: 'second' },
      ],
    });
    expect(q(plan.duration)).toBe(2);
    expect(plan.events.map((e) => e.busId)).toEqual(['preview', 'second', 'second']);
  });

  it('extends the plan to cover a ringing tail so the engine accepts it', () => {
    const plan = createRhythmPreviewPlan({
      sourceId: 'src',
      timeline: defaultMusicalTimeline,
      pulseUnit: sixteenth,
      gatePercent: 200,
      layers: [{ layerId: 'a', steps: [{ duration: 2 }, { duration: 2 }], sound }],
    });
    const last = plan.events.at(-1)!;
    expect(q(plan.duration)).toBeGreaterThanOrEqual(q(last.at) + q(last.duration));
    expect(q(plan.duration)).toBe(1.5);
  });
});

describe('materialFromRhythmPacket', () => {
  const item = (index: number, value: number): DataItem<number> => ({
    id: `i${index}`,
    value,
    provenance: [],
  });
  const rhythm = (values: number[], frame: object) =>
    packet<number>(
      'list',
      'duration',
      values.map((v, i) => item(i, v)),
      [],
      undefined,
      {
        role: 'interOnset',
        frame: frame as never,
      }
    );
  const options = { sourceId: 'src', layerId: 'a', pulseUnit: sixteenth, sound };

  it('takes a cyclic frame extent as the period', () => {
    const material = materialFromRhythmPacket(
      rhythm([2, 1, 1, 2], { topology: 'cyclic', extent: 6 }),
      options
    );
    expect(q(material.period)).toBe(1.5);
    expect(material.events).toHaveLength(4);
  });

  it('wraps attacks an origin pushes past the extent back into the cycle', () => {
    const material = materialFromRhythmPacket(
      rhythm([1, 1, 2], { topology: 'cyclic', extent: 4, origin: 3 }),
      options
    );
    expect(material.events.map((e) => q(e.at) * 4)).toEqual([3, 0, 1]);
  });

  it('plays rests as silence and ties as one longer event, counting both in the period', () => {
    const tied = rhythm([2, 1, -1, 2], { topology: 'cyclic', extent: 6 });
    tied.items[0].tie = true;
    const material = materialFromRhythmPacket(tied, { ...options, gatePercent: 100 });
    // 2~ 1 is one 3-pulse event at 0; r1 is silence; the 2 attacks at pulse 4.
    expect(material.events.map((e) => [q(e.at) * 4, q(e.duration) * 4])).toEqual([
      [0, 3],
      [4, 2],
    ]);
    expect(q(material.period)).toBe(1.5);
  });

  it('uses origin plus span as the period of a linear rhythm', () => {
    const material = materialFromRhythmPacket(
      rhythm([2, 1], { topology: 'linear', origin: 2 }),
      options
    );
    expect(q(material.period) * 4).toBe(5);
  });

  it('rejects anything that is not an inter-onset duration list', () => {
    expect(() => materialFromRhythmPacket(packet('list', 'pitch', []) as never, options)).toThrow(
      /inter-onset/
    );
  });

  it('mixes with a loop of a different length and keeps every event on its own bus', () => {
    const a = materialFromRhythmPacket(
      rhythm([2, 1, 1, 2], { topology: 'cyclic', extent: 6 }),
      options
    );
    const b = materialFromRhythmPacket(rhythm([3, 3, 3, 3], { topology: 'cyclic', extent: 12 }), {
      ...options,
      layerId: 'b',
    });
    const result = compileMixerPlan({
      sourceId: 'mix',
      timeline: defaultMusicalTimeline,
      channels: [
        { config: defaultChannelConfig('a'), material: a },
        { config: defaultChannelConfig('b'), material: b },
      ],
    });
    // 6 and 12 sixteenth-pulses realign every 12 pulses = 3 quarter notes.
    expect(q(result.realignment!)).toBe(3);
    const counts = (id: string) =>
      result.plan!.events.filter((e) => e.busId === channelBusId('mix', id)).length;
    expect(counts('a')).toBe(8);
    expect(counts('b')).toBe(4);
  });
});
