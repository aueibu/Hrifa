import { describe, expect, it } from 'vitest';
import type { MusicalPerformanceEvent } from '../audio/types';
import { rational } from '../musicalTime';
import {
  BAR_HEIGHT,
  PREVIEW_HEIGHT,
  groupEventsByObject,
  groupEventsByStrip,
  previewRects,
  rectsToPath,
  toPreviewNotes,
  type PreviewNote,
} from './arrangerPreview';
import { stripKey } from './sceneTypes';

const PX = 48;
const note = (start: number, end: number, midicents: number, unpitched = false): PreviewNote => ({
  start,
  end,
  midicents,
  unpitched,
});

function event(
  objectId: string,
  at: [number, number],
  length: [number, number],
  pitch: number,
  instrumentId: MusicalPerformanceEvent['instrumentId'] = 'preview.triangle'
): MusicalPerformanceEvent {
  return {
    id: `${objectId}:e`,
    at: { quarterNotes: rational(...at) },
    duration: { quarterNotes: rational(...length) },
    pitchMidicents: pitch,
    velocity: 1,
    instrumentId,
    busId: 'preview',
    provenance: [
      { sourceNodeInstance: objectId, sourceItemIds: [], transformation: 'scene-object' },
    ] as MusicalPerformanceEvent['provenance'],
  };
}

describe('previewRects', () => {
  it('scales y to the block own pitch range: highest at the top, lowest at the bottom', () => {
    const rects = previewRects([note(0, 1, 6000), note(1, 2, 7200)], 4, PX);
    expect(rects[1].y).toBeLessThan(rects[0].y);
    expect(rects[1].y).toBeCloseTo(1.5);
    expect(rects[0].y).toBeCloseTo(PREVIEW_HEIGHT - 1.5 - BAR_HEIGHT);
    expect(rects[0].x).toBe(0);
    expect(rects[0].width).toBe(PX);
    expect(rects[1].x).toBe(PX);
  });

  it('puts a single pitch in the middle', () => {
    const [rect] = previewRects([note(0, 1, 6000)], 4, PX);
    expect(rect.y + rect.height / 2).toBeCloseTo(PREVIEW_HEIGHT / 2);
  });

  it('does not stretch a narrow range to the full height', () => {
    const rects = previewRects([note(0, 1, 6000), note(1, 2, 6100)], 4, PX);
    expect(rects[0].y - rects[1].y).toBeLessThan((PREVIEW_HEIGHT - 3 - BAR_HEIGHT) / 2);
  });

  it('places fractional midicents of a non-12-EDO set between their neighbors', () => {
    const rects = previewRects(
      [note(0, 1, 6000), note(1, 2, 6342.857), note(2, 3, 6685.714)],
      4,
      PX
    );
    expect(rects[1].y).toBeGreaterThan(rects[2].y);
    expect(rects[1].y).toBeLessThan(rects[0].y);
    expect((rects[0].y + rects[2].y) / 2).toBeCloseTo(rects[1].y, 5);
  });

  it('clips a note at the block edge and drops one outside it', () => {
    const rects = previewRects([note(3.5, 5, 6000), note(4, 5, 6000), note(-2, -1, 6000)], 4, PX);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBe(3.5 * PX);
    expect(rects[0].width).toBe(0.5 * PX);
  });

  it('draws every repeat of a loop', () => {
    const notes = [0, 2, 4, 6].map((start) => note(start, start + 1, 6000));
    const rects = previewRects(notes, 8, PX);
    expect(rects.map((r) => r.x)).toEqual([0, 2 * PX, 4 * PX, 6 * PX]);
  });

  it('draws unpitched notes as full-height ticks and keeps them out of the pitch range', () => {
    const rects = previewRects([note(0, 0.1, 6000, true), note(1, 2, 6000)], 4, PX);
    expect(rects[0]).toMatchObject({ y: 0, height: PREVIEW_HEIGHT, width: 1 });
    expect(rects[1].y + rects[1].height / 2).toBeCloseTo(PREVIEW_HEIGHT / 2);
  });

  it('draws nothing for no notes', () => {
    expect(previewRects([], 4, PX)).toEqual([]);
    expect(rectsToPath([])).toBe('');
  });

  it('gives a very short note a visible width', () => {
    const [rect] = previewRects([note(0, 0.001, 6000)], 4, PX);
    expect(rect.width).toBe(1);
  });
});

describe('rectsToPath', () => {
  it('writes one subpath per rectangle', () => {
    const path = rectsToPath([
      { x: 0, y: 1, width: 2, height: 3 },
      { x: 5, y: 1, width: 2, height: 3 },
    ]);
    expect(path).toBe('M0 1h2v3h-2zM5 1h2v3h-2z');
  });
});

describe('groupEventsByObject and toPreviewNotes', () => {
  it('groups by the object named in the last provenance step', () => {
    const groups = groupEventsByObject([
      event('a', [0, 1], [1, 1], 6000),
      event('b', [0, 1], [1, 1], 6000),
      event('a', [1, 1], [1, 1], 6100),
    ]);
    expect(groups.get('a')).toHaveLength(2);
    expect(groups.get('b')).toHaveLength(1);
  });

  it('turns events into notes relative to the block start and marks clicks unpitched', () => {
    const notes = toPreviewNotes(
      [event('a', [9, 2], [1, 2], 6000), event('a', [5, 1], [1, 4], 6000, 'sound.woodblock')],
      4
    );
    expect(notes[0]).toEqual({ start: 0.5, end: 1, midicents: 6000, unpitched: false });
    expect(notes[1].start).toBe(1);
    expect(notes[1].unpitched).toBe(true);
  });
});

describe('groupEventsByStrip', () => {
  it('groups by the object of the last provenance step and the strip named in its parameters', () => {
    const inStrip = (objectId: string, stripId: string) => {
      const base = event(objectId, [0, 1], [1, 1], 6000);
      return {
        ...base,
        provenance: base.provenance.map((step) => ({
          ...step,
          parameters: { mapping: 'loop', strip: stripId },
        })),
      };
    };
    const groups = groupEventsByStrip([
      inStrip('a', 's1'),
      inStrip('a', 's2'),
      inStrip('a', 's1'),
      inStrip('b', 's1'),
      event('a', [0, 1], [1, 1], 6000),
    ]);
    expect(groups.get(stripKey('a', 's1'))).toHaveLength(2);
    expect(groups.get(stripKey('a', 's2'))).toHaveLength(1);
    expect(groups.get(stripKey('b', 's1'))).toHaveLength(1);
    expect(groups.size).toBe(3);
  });
});
