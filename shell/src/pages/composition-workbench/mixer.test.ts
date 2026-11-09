import type { NoteEventValue } from './melodicization';
import {
  channelBusGains,
  channelBusId,
  compileMixerPlan,
  defaultChannelConfig,
  lcmRational,
  materialFromNotePacket,
  type ChannelMaterial,
  type LoopPolicy,
  type MixerChannel,
} from './mixer';
import { packet, type DataItem } from './model';
import {
  defaultMusicalTimeline,
  musicalDuration,
  musicalPosition,
  rational,
  rationalToNumber,
} from './musicalTime';

const SOURCE = 'mixer-1';

/** A channel with one quarter-note click at each given position inside a cycle of `period`. */
function channel(
  id: string,
  period: number,
  positions: number[],
  options: { loop?: LoopPolicy; offset?: number; length?: number } = {}
): MixerChannel {
  const material: ChannelMaterial = {
    period: musicalDuration(period),
    warnings: [],
    events: positions.map((position, index) => ({
      id: `${id}-e${index}`,
      at: musicalPosition(position),
      duration: musicalDuration(options.length ?? 1, 2),
      pitchMidicents: 6000,
      velocity: 1,
      instrumentId: 'preview.click',
      provenance: [],
    })),
  };
  return {
    config: {
      ...defaultChannelConfig(id),
      loop: options.loop ?? 'free',
      offset: musicalDuration(options.offset ?? 0),
    },
    material,
  };
}

function compile(
  channels: MixerChannel[],
  extra: Partial<Parameters<typeof compileMixerPlan>[0]> = {}
) {
  return compileMixerPlan({
    sourceId: SOURCE,
    timeline: defaultMusicalTimeline,
    channels,
    ...extra,
  });
}

function onsets(plan: ReturnType<typeof compile>['plan'], id: string) {
  return plan!.events
    .filter((event) => event.busId === channelBusId(SOURCE, id))
    .map((event) => rationalToNumber(event.at.quarterNotes));
}

describe('lcmRational', () => {
  it('computes the least common multiple of integers and of fractions', () => {
    expect(lcmRational([rational(3), rational(4)])).toEqual(rational(12));
    expect(lcmRational([rational(3, 2), rational(5, 4)])).toEqual(rational(15, 2));
    expect(lcmRational([])).toBeUndefined();
  });

  it('reports overflow instead of returning a wrong value', () => {
    expect(
      lcmRational([rational(9_007_199_254_740_881), rational(9_007_199_254_740_847)])
    ).toBeUndefined();
  });
});

describe('free loops', () => {
  it('unrolls one realignment period of independent cycles', () => {
    const result = compile([channel('a', 3, [0]), channel('b', 4, [0])]);
    expect(result.realignment).toEqual(musicalDuration(12));
    expect(result.loopable).toBe(true);
    expect(rationalToNumber(result.plan!.duration.quarterNotes)).toBe(12);
    expect(onsets(result.plan, 'a')).toEqual([0, 3, 6, 9]);
    expect(onsets(result.plan, 'b')).toEqual([0, 4, 8]);
  });

  it('rotates a looping channel by its offset, wrapping the tail to the start', () => {
    const result = compile([channel('a', 4, [0, 1], { offset: 3 })]);
    expect(onsets(result.plan, 'a')).toEqual([0, 3]);
  });

  it('clips events at the end of the pass so the plan stays valid', () => {
    const result = compile([channel('a', 2, [1], { length: 4 })]);
    const last = result.plan!.events.at(-1)!;
    expect(
      rationalToNumber(last.at.quarterNotes) + rationalToNumber(last.duration.quarterNotes)
    ).toBeLessThanOrEqual(2);
  });
});

describe('restart with longest', () => {
  it('repeats a short cycle inside each longest block and cuts it at the block end', () => {
    const result = compile([
      channel('long', 5, [0]),
      channel('short', 2, [0, 1], { loop: 'restart-with-longest' }),
    ]);
    expect(rationalToNumber(result.plan!.duration.quarterNotes)).toBe(5);
    expect(result.loopable).toBe(true);
    // Cycles of 2 inside a block of 5: starts at 0, 2, 4; the pass at 4 is cut before its second hit.
    expect(onsets(result.plan, 'short')).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('once', () => {
  it('plays a single time, delayed by the offset', () => {
    const result = compile([
      channel('loop', 4, [0]),
      channel('one', 2, [0], { loop: 'once', offset: 1 }),
    ]);
    expect(onsets(result.plan, 'one')).toEqual([1]);
  });

  it('sizes the plan to the one-shot channels when nothing loops', () => {
    const result = compile([channel('one', 3, [0, 2], { loop: 'once', offset: 1 })]);
    expect(result.loopable).toBe(false);
    expect(rationalToNumber(result.plan!.duration.quarterNotes)).toBe(4);
    expect(onsets(result.plan, 'one')).toEqual([1, 3]);
  });
});

describe('limits and guards', () => {
  it('truncates at the horizon and says the pattern is not loopable', () => {
    const result = compile([channel('a', 7, [0]), channel('b', 11, [0])], {
      maxHorizon: musicalDuration(40),
    });
    expect(result.loopable).toBe(false);
    expect(result.realignment).toBeUndefined();
    expect(rationalToNumber(result.plan!.duration.quarterNotes)).toBe(40);
    expect(result.warnings.join(' ')).toMatch(/horizon/);
    expect(result.truncated).toBe(true);
  });

  it('defaults the horizon to 128 bars of 4/4 and flags what falls beyond it', () => {
    // 21 and 23 quarter notes realign after 483 quarters (120.75 bars): inside 128 bars.
    const inside = compile([channel('a', 21, [0]), channel('b', 23, [0])]);
    expect(inside.loopable).toBe(true);
    expect(inside.truncated).toBe(false);
    expect(rationalToNumber(inside.plan!.duration.quarterNotes)).toBe(483);

    // 31 and 37 realign after 1147 quarters: beyond it, so only the first 512 quarters play.
    const beyond = compile([channel('a', 31, [0]), channel('b', 37, [0])]);
    expect(beyond.loopable).toBe(false);
    expect(beyond.truncated).toBe(true);
    expect(rationalToNumber(beyond.plan!.duration.quarterNotes)).toBe(512);
  });

  it('is not truncated when nothing loops or the pattern closes', () => {
    expect(compile([channel('a', 4, [0], { loop: 'once' })]).truncated).toBe(false);
    expect(compile([channel('a', 3, [0]), channel('b', 4, [0])]).truncated).toBe(false);
    expect(compile([]).truncated).toBe(false);
  });

  it('refuses an oversized plan rather than building it', () => {
    const result = compile([channel('a', 1, [0]), channel('b', 3, [0])], { maxEvents: 2 });
    expect(result.plan).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/more than 2 events/);
  });

  it('leaves out channels with no material and reports them', () => {
    const empty = channel('empty', 4, []);
    const result = compile([channel('a', 4, [0]), empty]);
    expect(result.plan!.events.every((event) => event.busId === channelBusId(SOURCE, 'a'))).toBe(
      true
    );
    expect(result.warnings.join(' ')).toMatch(/empty/);
    expect(compile([empty]).plan).toBeUndefined();
  });

  it('keeps every event inside the plan and positive in length', () => {
    const { plan } = compile([
      channel('a', 3, [0, 1, 2], { length: 4 }),
      channel('b', 5, [0, 4], { length: 3, offset: 2 }),
    ]);
    plan!.events.forEach((event) => {
      const end =
        rationalToNumber(event.at.quarterNotes) + rationalToNumber(event.duration.quarterNotes);
      expect(rationalToNumber(event.duration.quarterNotes)).toBeGreaterThan(0);
      expect(end).toBeLessThanOrEqual(rationalToNumber(plan!.duration.quarterNotes) + 1e-9);
    });
  });

  it('records the mixer placement in each event’s provenance', () => {
    const { plan } = compile([channel('a', 2, [0])]);
    expect(plan!.events[0].provenance.at(-1)).toMatchObject({
      sourceModuleInstance: SOURCE,
      transformation: 'mixer-place',
      parameters: { channel: 'a', loop: 'free' },
    });
  });
});

describe('channelBusGains', () => {
  const configs = [defaultChannelConfig('a'), defaultChannelConfig('b'), defaultChannelConfig('c')];
  const gain = (percent: number) => percent / 100;

  it('applies per-channel gain and mute', () => {
    configs[0].gainPercent = 50;
    configs[1].muted = true;
    expect(channelBusGains(SOURCE, configs, gain)).toEqual({
      [channelBusId(SOURCE, 'a')]: 0.5,
      [channelBusId(SOURCE, 'b')]: 0,
      [channelBusId(SOURCE, 'c')]: 1,
    });
  });

  it('silences everything not soloed while any channel is soloed', () => {
    const soloed = configs.map((config) => ({
      ...config,
      muted: false,
      gainPercent: 100,
      solo: config.id === 'c',
    }));
    expect(channelBusGains(SOURCE, soloed, gain)).toEqual({
      [channelBusId(SOURCE, 'a')]: 0,
      [channelBusId(SOURCE, 'b')]: 0,
      [channelBusId(SOURCE, 'c')]: 1,
    });
  });
});

describe('materialFromNotePacket', () => {
  function notePacket(extent?: number) {
    const item = (index: number, onset: number, pitches: number[]): DataItem<NoteEventValue> => ({
      id: `n${index}`,
      value: {
        onset: musicalPosition(onset),
        interOnset: musicalDuration(1),
        duration: musicalDuration(1),
        pitches,
        velocity: 1,
      },
      provenance: [],
    });
    return packet<NoteEventValue>(
      'events',
      'note',
      [item(0, 0, [6000]), item(1, 2, [6400, 6700])],
      ['unused material'],
      undefined,
      extent === undefined
        ? { frame: { topology: 'linear' } }
        : { frame: { topology: 'cyclic', musicalExtent: musicalDuration(extent) } }
    );
  }

  it('expands each pitch group into simultaneous events and takes the frame extent as the cycle', () => {
    const material = materialFromNotePacket(notePacket(4));
    expect(material.events).toHaveLength(3);
    expect(material.period).toEqual(musicalDuration(4));
    expect(material.warnings).toEqual(['unused material']);
  });

  it('falls back to the end of the last note when the frame has no extent', () => {
    expect(materialFromNotePacket(notePacket()).period).toEqual(musicalDuration(3));
  });

  it('rejects anything that is not events | note', () => {
    expect(() => materialFromNotePacket(packet('list', 'duration', []) as never)).toThrow(
      /events \| note/
    );
  });
});
