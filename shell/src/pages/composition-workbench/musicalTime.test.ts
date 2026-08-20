import {
  accumulatePulseDurations,
  addDuration,
  defaultMusicalTimeline,
  formatBarBeatTickPercent,
  musicalDuration,
  musicalPosition,
  musicalPositionToSeconds,
  musicalPositionToTicks,
  parseBarBeatTickPercent,
  pulsesToMusicalDuration,
  rational,
} from './musicalTime';

describe('exact musical time', () => {
  it('normalizes rational values and maps integer pulses without floating-point drift', () => {
    expect(rational(6, -8)).toEqual({ numerator: -3, denominator: 4 });
    expect(pulsesToMusicalDuration(7, musicalDuration(1, 4))).toEqual(musicalDuration(7, 4));
    expect(addDuration(musicalPosition(1, 3), musicalDuration(1, 6))).toEqual(
      musicalPosition(1, 2)
    );
  });

  it('accumulates source pulses into exact musical positions and extent', () => {
    const result = accumulatePulseDurations([2, 1, 1, 2], musicalDuration(1, 4));
    expect(result.placements.map((placement) => placement.at)).toEqual([
      musicalPosition(0),
      musicalPosition(1, 2),
      musicalPosition(3, 4),
      musicalPosition(1),
    ]);
    expect(result.extent).toEqual(musicalDuration(3, 2));
  });

  it('formats and parses Bitwig-style bar, beat, tick, and sub-tick positions', () => {
    const position = parseBarBeatTickPercent('1.3.4.50', defaultMusicalTimeline);
    expect(position).toEqual(musicalPosition(23, 8));
    expect(formatBarBeatTickPercent(position, defaultMusicalTimeline)).toBe('1.3.4.50');
  });

  it('respects meter changes at bar boundaries', () => {
    const timeline = {
      ...defaultMusicalTimeline,
      meterMap: [
        { atBar: 1, numerator: 4, denominator: 4 },
        { atBar: 3, numerator: 3, denominator: 4 },
      ],
    };
    expect(parseBarBeatTickPercent('3.2.1.00', timeline)).toEqual(musicalPosition(9));
    expect(formatBarBeatTickPercent(musicalPosition(9), timeline)).toBe('3.2.1.00');
  });

  it('converts exact positions through step tempo changes only at render time', () => {
    const tempoMap = [
      { at: musicalPosition(0), bpm: 120 },
      { at: musicalPosition(2), bpm: 60 },
    ];
    expect(musicalPositionToSeconds(musicalPosition(4), tempoMap)).toBe(3);
    expect(musicalPositionToTicks(musicalPosition(23, 8), 960)).toBe(2760);
  });

  it('rejects coordinates outside the active meter', () => {
    expect(() => parseBarBeatTickPercent('1.5.1.00', defaultMusicalTimeline)).toThrow(
      /outside the active meter/
    );
  });
});
