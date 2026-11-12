import {
  curveFromDrag,
  curvePosition,
  laneHeads,
  LANE_PAD,
  pencilSample,
  percentAtY,
  pinsInRect,
  rampHeads,
  rampValues,
  snapSpan,
  velocityY,
} from './velocityLaneTools';

// A 84 px track: 68 px between the paddings is the whole 0 to 100% range.
const HEIGHT = 84;
const heads = [
  { id: 'a', x: 0 },
  { id: 'b', x: 100 },
  { id: 'c', x: 200 },
  { id: 'd', x: 400 },
];

describe('percentAtY / velocityY', () => {
  it('maps the lane height to 0% at the bottom and 100% at the top, clamped', () => {
    expect(percentAtY(HEIGHT - LANE_PAD, HEIGHT)).toBe(0);
    expect(percentAtY(LANE_PAD, HEIGHT)).toBe(1);
    expect(percentAtY(LANE_PAD + 34, HEIGHT)).toBeCloseTo(0.5, 6);
    expect(percentAtY(-50, HEIGHT)).toBe(1);
    expect(percentAtY(500, HEIGHT)).toBe(0);
    expect(percentAtY(velocityY(0.3, HEIGHT), HEIGHT)).toBeCloseTo(0.3, 6);
  });
});

describe('laneHeads', () => {
  it('has one head per selection id (chord pitches share one) in time order', () => {
    const notes = [
      {
        id: 'b:pitch:0',
        sourceId: 'b',
        start: 2,
        duration: 1,
        pitchMidicents: 6000,
        label: '',
        velocity: 0.4,
      },
      {
        id: 'b:pitch:1',
        sourceId: 'b',
        start: 2,
        duration: 1,
        pitchMidicents: 6400,
        label: '',
        velocity: 0.4,
      },
      { id: 'a', start: 1, duration: 1, pitchMidicents: 6000, label: '', velocity: 0.8 },
    ];
    expect(laneHeads(notes, 10)).toEqual([
      { id: 'a', x: 10, velocity: 0.8 },
      { id: 'b', x: 20, velocity: 0.4 },
    ]);
  });
});

describe('pencilSample', () => {
  it('a first sample draws only the heads at the pointer, at the pointer height', () => {
    const values = pencilSample(heads, null, { x: 101, y: LANE_PAD }, HEIGHT);
    expect([...values.keys()]).toEqual(['b']);
    expect(values.get('b')).toBe(1);
  });

  it('a fast drag between two pointer events skips no head and interpolates y at each head x', () => {
    const values = pencilSample(
      heads,
      { x: 0, y: HEIGHT - LANE_PAD },
      { x: 400, y: LANE_PAD },
      HEIGHT
    );
    expect([...values.keys()]).toEqual(['a', 'b', 'c', 'd']);
    expect(values.get('a')).toBe(0);
    expect(values.get('b')).toBeCloseTo(0.25, 6);
    expect(values.get('c')).toBeCloseTo(0.5, 6);
    expect(values.get('d')).toBe(1);
  });

  it('works right to left and clamps y to 0..100%', () => {
    const values = pencilSample(heads, { x: 400, y: -100 }, { x: 150, y: 1000 }, HEIGHT);
    expect([...values.keys()].sort()).toEqual(['c', 'd']);
    expect(values.get('d')).toBe(1);
    expect(values.get('c')).toBe(0);
  });

  it('a segment that crosses no head draws nothing', () => {
    expect(pencilSample(heads, { x: 210, y: 20 }, { x: 390, y: 20 }, HEIGHT).size).toBe(0);
  });
});

describe('ramp maths', () => {
  it('orders the heads from the press side, also when dragging right to left', () => {
    expect(rampHeads(heads, 0, 250).map((head) => head.id)).toEqual(['a', 'b', 'c']);
    expect(rampHeads(heads, 250, 0).map((head) => head.id)).toEqual(['c', 'b', 'a']);
    expect(rampHeads(heads, 50, 150).map((head) => head.id)).toEqual(['b']);
  });

  it('gives the end heads exactly the two percentages and interpolates linearly by time position', () => {
    const points = rampValues(rampHeads(heads, 0, 400), 0.2, 0.8);
    [0.2, 0.2 + 0.6 * 0.25, 0.2 + 0.6 * 0.5, 0.8].forEach((value, index) =>
      expect(points[index].value).toBeCloseTo(value, 9)
    );
    expect(points[0].value).toBe(0.2);
    expect(points[3].value).toBe(0.8);
  });

  it('right to left: the press side takes the start percentage', () => {
    const points = rampValues(rampHeads(heads, 400, 0), 1, 0);
    expect(points.map((point) => [point.id, point.value])).toEqual([
      ['d', 1],
      ['c', 0.5],
      ['b', 0.25],
      ['a', 0],
    ]);
  });

  it('a single head takes the start percentage; heads at one x all do', () => {
    expect(rampValues([{ id: 'x', x: 5 }], 0.3, 0.9)[0].value).toBe(0.3);
    expect(
      rampValues(
        [
          { id: 'x', x: 5 },
          { id: 'y', x: 5 },
        ],
        0.3,
        0.9
      ).map((point) => point.value)
    ).toEqual([0.3, 0.3]);
    expect(rampValues([], 0, 1)).toEqual([]);
  });

  it('a chord is one head, so one value (heads are unique per item)', () => {
    const notes = [
      {
        id: 'c:pitch:0',
        sourceId: 'c',
        start: 1,
        duration: 1,
        pitchMidicents: 6000,
        label: '',
        velocity: 1,
      },
      {
        id: 'c:pitch:1',
        sourceId: 'c',
        start: 1,
        duration: 1,
        pitchMidicents: 6400,
        label: '',
        velocity: 1,
      },
      { id: 'd', start: 3, duration: 1, pitchMidicents: 6000, label: '', velocity: 1 },
    ];
    const points = rampValues(rampHeads(laneHeads(notes, 100), 0, 400), 0, 1);
    expect(points.map((point) => point.id)).toEqual(['c', 'd']);
  });
});

describe('curve maths', () => {
  it('exponent 0 is linear and the endpoints stay fixed at every curve', () => {
    [-4, -1.5, 0, 0.7, 4].forEach((curve) => {
      expect(curvePosition(0, curve)).toBe(0);
      expect(curvePosition(1, curve)).toBe(1);
    });
    expect(curvePosition(0.3, 0)).toBe(0.3);
  });

  it('is monotone in the curve: up reaches the end early, down late', () => {
    let previous = -1;
    [-4, -2, -1, 0, 1, 2, 4].forEach((curve) => {
      const value = curvePosition(0.5, curve);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    });
    expect(curvePosition(0.5, 1)).toBeGreaterThan(0.5);
    expect(curvePosition(0.5, -1)).toBeLessThan(0.5);
  });

  it('is monotone along the ramp for any curve', () => {
    [-3, 0, 3].forEach((curve) => {
      const values = rampValues(rampHeads(heads, 0, 400), 0, 1, curve).map((point) => point.value);
      expect(values).toEqual([...values].sort((a, b) => a - b));
    });
  });

  it('is re-applied from the original endpoints, not stacked on the previous curve', () => {
    const ordered = rampHeads(heads, 0, 400);
    const curved = rampValues(ordered, 0.1, 0.9, 1.5).map((point) => point.value);
    // The same inputs give the same values however many curve gestures came before.
    expect(rampValues(ordered, 0.1, 0.9, 1.5).map((point) => point.value)).toEqual(curved);
    expect(rampValues(ordered, 0.1, 0.9, 0).map((point) => point.value)[1]).toBeCloseTo(
      0.1 + 0.8 * 0.25,
      6
    );
    expect(curved[0]).toBe(0.1);
    expect(curved[3]).toBe(0.9);
  });

  it('a drag up raises the curve and a drag down lowers it, within limits', () => {
    expect(curveFromDrag(0, -24)).toBe(1);
    expect(curveFromDrag(0, 24)).toBe(-1);
    expect(curveFromDrag(1, -24)).toBe(2);
    expect(curveFromDrag(0, -10000)).toBe(4);
    expect(curveFromDrag(0, 10000)).toBe(-4);
  });
});

describe('pinsInRect (box select)', () => {
  const pins = [
    { id: 'a', x: 0, velocity: 1 },
    { id: 'b', x: 100, velocity: 0.5 },
    { id: 'b', x: 100, velocity: 0.5 },
    { id: 'd', x: 400, velocity: 0 },
  ];

  it('selects the pins the rectangle touches, once each', () => {
    const rect = { left: 90, top: 0, width: 20, height: HEIGHT };
    expect(pinsInRect(pins, rect, HEIGHT)).toEqual(['b']);
    expect(pinsInRect(pins, { left: -10, top: 0, width: 600, height: HEIGHT }, HEIGHT)).toEqual([
      'a',
      'b',
      'd',
    ]);
  });

  it('misses a pin the rectangle passes above or below (height matters)', () => {
    // b sits at the middle; a rectangle in the top strip does not reach it.
    expect(pinsInRect(pins, { left: 90, top: 0, width: 20, height: 12 }, HEIGHT)).toEqual([]);
    expect(
      pinsInRect(pins, { left: 90, top: velocityY(0.5, HEIGHT) - 2, width: 20, height: 4 }, HEIGHT)
    ).toEqual(['b']);
  });

  it('uses timeline x, so a windowed lane (origin added by the caller) hits the same pins', () => {
    const origin = 10000;
    const shifted = pins.map((pin) => ({ ...pin, x: pin.x + origin }));
    expect(
      pinsInRect(shifted, { left: origin + 90, top: 0, width: 20, height: HEIGHT }, HEIGHT)
    ).toEqual(['b']);
    // The same rectangle without the origin finds nothing.
    expect(pinsInRect(shifted, { left: 90, top: 0, width: 20, height: HEIGHT }, HEIGHT)).toEqual(
      []
    );
  });
});

describe('snapSpan', () => {
  it('snaps outward to the grid and never starts before 0', () => {
    expect(snapSpan(70, 200, 64, 0.5)).toEqual({ start: 1, end: 3.5 });
    expect(snapSpan(-30, 10, 64, 0.5)).toEqual({ start: 0, end: 0.5 });
    expect(snapSpan(64, 64, 64, 0.5)).toEqual({ start: 1, end: 1.5 });
  });
});
