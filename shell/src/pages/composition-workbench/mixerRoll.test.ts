import { compileMixerPlan, channelBusId, defaultChannelConfig } from './mixer';
import { mixerChannelColor } from './mixerChannels';
import {
  cycleProgress,
  laneView,
  lanePlayhead,
  mixerLane,
  mixerRoll,
  mixerRollGrid,
} from './mixerRoll';
import { defaultMusicalTimeline, musicalDuration, musicalPosition } from './musicalTime';

function channel(id: string, period: number, positions: number[]) {
  return {
    config: defaultChannelConfig(id),
    material: {
      period: musicalDuration(period),
      warnings: [],
      events: positions.map((position, index) => ({
        id: `${id}-e${index}`,
        at: musicalPosition(position),
        duration: musicalDuration(1, 2),
        pitchMidicents: 6000 + index * 100,
        velocity: 1,
        instrumentId: 'preview.click' as const,
        provenance: [],
      })),
    },
  };
}

const compile = () =>
  compileMixerPlan({
    sourceId: 'mix',
    timeline: defaultMusicalTimeline,
    channels: [channel('a', 3, [0]), channel('b', 4, [0, 2])],
  }).plan;

describe('mixerRoll', () => {
  it('draws every event of the pass, colored by its channel', () => {
    const roll = mixerRoll(compile(), 'mix', ['a', 'b']);
    // Periods 3 and 4 realign over 12 quarters: four hits of a, six of b.
    expect(roll.total).toBe(10);
    expect(roll.notes).toHaveLength(10);
    expect(roll.duration).toBe(12);
    expect(roll.notes.filter((note) => note.color === mixerChannelColor(0))).toHaveLength(4);
    expect(roll.notes.filter((note) => note.color === mixerChannelColor(1))).toHaveLength(6);
    expect(roll.notes[0].label).toMatch(/^Ch 1 · /);
  });

  it('colors by position, so a channel keeps its hue while others stay put', () => {
    const roll = mixerRoll(compile(), 'mix', ['b', 'a']);
    expect(roll.notes.find((note) => note.id.includes('mix:a:'))?.color).toBe(mixerChannelColor(1));
  });

  it('draws a sample past the limit and still reports the true count', () => {
    const roll = mixerRoll(compile(), 'mix', ['a', 'b'], 3);
    expect(roll.notes).toHaveLength(3);
    expect(roll.total).toBe(10);
  });

  it('skips events from a channel that is no longer in the mixer', () => {
    const roll = mixerRoll(compile(), 'mix', ['a']);
    expect(roll.notes.every((note) => note.color === mixerChannelColor(0))).toBe(true);
    expect(roll.notes).toHaveLength(4);
  });

  it('is empty, one quarter long, with no plan', () => {
    expect(mixerRoll(undefined, 'mix', ['a'])).toEqual({ notes: [], total: 0, duration: 1 });
  });

  it('knows which bus belongs to which channel', () => {
    expect(channelBusId('mix', 'a')).toBe('mixer:mix:a');
  });
});

describe('mixerRollGrid', () => {
  it('lays bar and beat lines from the meter', () => {
    const grid = mixerRollGrid(8, 4, 4);
    expect(grid.filter((line) => line.kind === 'bar').map((line) => line.at)).toEqual([0, 4, 8]);
    expect(grid.filter((line) => line.kind === 'beat')).toHaveLength(6);
    // 6/8 has a dotted-quarter bar of 3 quarter notes and eighth-note beats.
    expect(
      mixerRollGrid(3, 6, 8)
        .filter((line) => line.kind === 'bar')
        .map((line) => line.at)
    ).toEqual([0, 3]);
  });
});

describe('mixerLane', () => {
  const material = channel('a', 4, [0, 1, 3]).material;
  const config = (loop: 'free' | 'once' | 'restart-with-longest', offset: number) => ({
    loop,
    offset: musicalDuration(offset),
  });

  it('shows one cycle, rotated by the offset for a looping channel', () => {
    const lane = mixerLane(material, config('free', 2), 0);
    expect(lane.duration).toBe(4);
    // Hits at 0, 1, 3 rotated by 2 land at 2, 3, 1.
    expect(lane.notes.map((note) => note.start).sort()).toEqual([1, 2, 3]);
    expect(lane.notes.every((note) => note.color === mixerChannelColor(0))).toBe(true);
  });

  it('delays a one-shot by its offset and lengthens its lane to match', () => {
    const lane = mixerLane(material, config('once', 2), 1);
    expect(lane.duration).toBe(6);
    expect(lane.notes.map((note) => note.start)).toEqual([2, 3, 5]);
    expect(lane.notes[0].color).toBe(mixerChannelColor(1));
  });
});

describe('laneView', () => {
  it('keeps the shared time scale and frames the view so the roll does not refit it', () => {
    const view = laneView([{ pitchMidicents: 6000 }, { pitchMidicents: 6100 }], 37, 140);
    expect(view.pixelsPerQuarter).toBe(37);
    expect(view.framed).toBe(true);
    expect(view.scrollLeft).toBe(0);
  });

  it('fits pitch zoom to the lane, within limits', () => {
    const narrow = [{ pitchMidicents: 6000 }, { pitchMidicents: 6100 }];
    const wide = [{ pitchMidicents: 3600 }, { pitchMidicents: 9600 }];
    expect(laneView(narrow, 30, 140).pixelsPerSemitone).toBeGreaterThan(
      laneView(wide, 30, 140).pixelsPerSemitone
    );
    expect(laneView(wide, 30, 140).pixelsPerSemitone).toBe(12);
    expect(laneView([], 30, 140).pixelsPerSemitone).toBeGreaterThanOrEqual(12);
  });
});

describe('lanePlayhead', () => {
  it('wraps a free channel at its own period', () => {
    expect(lanePlayhead(7, { loop: 'free', period: 3, offset: 0 }, 4)).toBe(1);
  });

  it('resets a restart-with-longest channel at each block of the longest cycle', () => {
    const restart = { loop: 'restart-with-longest' as const, period: 3, offset: 0 };
    expect(lanePlayhead(3.5, restart, 4)).toBe(0.5);
    // At position 4.5 the longest cycle has restarted, so the short one restarts with it.
    expect(lanePlayhead(4.5, restart, 4)).toBe(0.5);
    expect(lanePlayhead(3.9, restart, 4)).toBeCloseTo(0.9);
  });

  it('runs a one-shot once in pass time and holds at its end', () => {
    const once = { loop: 'once' as const, period: 3, offset: 2 };
    expect(lanePlayhead(1, once, 4)).toBe(1);
    expect(lanePlayhead(4, once, 4)).toBe(4);
    expect(lanePlayhead(9, once, 4)).toBe(5);
  });
});

describe('cycleProgress', () => {
  it('counts the cycles of a free channel over the pass and fills along it', () => {
    // A 3-quarter cycle in a 12-quarter pass: four cycles.
    const progress = cycleProgress(7.5, 12, { loop: 'free', period: 3 }, 4);
    expect(progress).toEqual({ cycles: 4, fill: 7.5 / 12, current: 3 });
  });

  it('gives channels of different lengths different tick counts over the same pass', () => {
    const short = cycleProgress(0, 12, { loop: 'free', period: 3 }, 4);
    const long = cycleProgress(0, 12, { loop: 'free', period: 4 }, 4);
    expect([short?.cycles, long?.cycles]).toEqual([4, 3]);
  });

  it('counts a restart-with-longest channel by its restarts', () => {
    expect(cycleProgress(5, 8, { loop: 'restart-with-longest', period: 3 }, 4)).toEqual({
      cycles: 2,
      fill: 5 / 8,
      current: 2,
    });
  });

  it('gives a one-shot no bar, and stays in range', () => {
    expect(cycleProgress(1, 12, { loop: 'once', period: 3 }, 4)).toBeUndefined();
    expect(cycleProgress(1, 0, { loop: 'free', period: 3 }, 4)).toBeUndefined();
    expect(cycleProgress(99, 12, { loop: 'free', period: 3 }, 4)).toEqual({
      cycles: 4,
      fill: 1,
      current: 4,
    });
    expect(cycleProgress(-1, 12, { loop: 'free', period: 3 }, 4)?.fill).toBe(0);
  });
});
