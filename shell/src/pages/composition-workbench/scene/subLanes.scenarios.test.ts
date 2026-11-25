import { describe, expect, it } from 'vitest';
import { validateBlock, type StoredDataBlock } from '../dataBlocks/registry';
import { rational, rationalToNumber } from '../musicalTime';
import { applyDrop, subLaneAtY } from './arrangerDrop';
import { arrangerLanes } from './arrangerLanes';
import { evaluateScene } from './evaluateScene';
import {
  duplicateObjectLinked,
  placeObjectNearest,
  type OpEnv,
  type SceneOpResult,
} from './sceneOps';
import { claveBlock, collectionBlock, objectBlock, sceneBlock } from './sceneTestHelpers';
import { objectDataOf, objectWorldStart } from './sceneTypes';
import { layoutSubLanes } from './subLanes';

/**
 * Free sub-lanes inside a collection (L3, W-78), the confirmed example: collection "Verse" holds Chords
 * (bars 1 to 4, 0 to 16 quarters in 4/4) and Melody. Real ops, real evaluator.
 */

const env = (): OpEnv => {
  let n = 0;
  return { newId: () => `n${(n += 1)}`, now: '2026-11-25T00:00:00Z' };
};
const ok = (result: SceneOpResult) => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.blocks;
};
const part = (id: string, start: number, duration: number, patch = {}) =>
  objectBlock(id, { primaryDataRef: { id: 'clave' }, start, duration, ...patch }, id);

/** Verse = Chords 0 to 16 plus Melody (16 long) placed far away at 40, in one collection under the root. */
function verse(...extra: StoredDataBlock[]): StoredDataBlock[] {
  return [
    claveBlock(),
    part('chords', 0, 16),
    part('melody', 40, 16),
    ...extra,
    collectionBlock('verse', ['chords', 'melody', ...extra.map((block) => block.id)], {}, 'Verse'),
    collectionBlock('root', ['verse']),
    sceneBlock('scene', 'root'),
  ];
}
const lane = (blocks: readonly StoredDataBlock[]) => ({
  subLanes: arrangerLanes(blocks, 'scene').find((entry) => entry.id === 'verse')!,
});
const span = (blocks: readonly StoredDataBlock[], id: string) => {
  const start = rationalToNumber(objectWorldStart(blocks, id)!);
  return [
    start,
    start +
      rationalToNumber(objectDataOf(blocks.find((block) => block.id === id))!.timeSpan.duration),
  ];
};
const storedLane = (blocks: readonly StoredDataBlock[], id: string) =>
  objectDataOf(blocks.find((block) => block.id === id))!.lane;
const start = (n: number) => rational(n);

describe('layout of sub-lanes', () => {
  const s = (id: string, a: number, b: number, laneNumber?: number) => ({
    id,
    start: rational(a),
    end: rational(b),
    lane: laneNumber,
  });

  it('display sub-lanes are the dense rank of the stored numbers (a gap or an emptied lane vanishes)', () => {
    const layout = layoutSubLanes([s('a', 0, 4, 0), s('b', 0, 4, 7)]);
    expect(layout.count).toBe(2);
    expect(layout.subLaneOf.get('b')).toBe(1);
    expect(layoutSubLanes([s('a', 0, 4, 7), s('b', 8, 12, 7)]).count).toBe(1);
  });

  it('automatic objects first-fit where they overlap nothing, never below a lane the human opened', () => {
    const layout = layoutSubLanes([s('chords', 0, 16), s('melody', 0, 16, 1), s('late', 16, 20)]);
    expect(layout.subLaneOf.get('chords')).toBe(0);
    expect(layout.subLaneOf.get('melody')).toBe(1);
    // Touching is not overlap: "late" joins the first sub-lane.
    expect(layout.subLaneOf.get('late')).toBe(0);
  });

  it('the new-lane strip is the bottom strip: its y is the last strip height of the lane', () => {
    expect(subLaneAtY(10, 0, 40, 2, 8)).toBe(0);
    expect(subLaneAtY(50, 0, 40, 2, 8)).toBe(1);
    expect(subLaneAtY(75, 0, 40, 2, 8)).toBe('new');
    expect(subLaneAtY(-1, 0, 40, 2, 8)).toBeNull();
  });
});

describe('Verse: Chords bars 1 to 4 and a dropped Melody', () => {
  it('(i) a drop on Chords sub-lane 0 where they overlap goes to the nearest free slot in that sub-lane', () => {
    const blocks = ok(placeObjectNearest(verse(), 'melody', start(0), 0));
    expect(span(blocks, 'melody')).toEqual([16, 32]);
    expect(span(blocks, 'chords')).toEqual([0, 16]);
    expect(lane(blocks).subLanes.subLanes).toBe(1);
  });

  it('(ii) a drop on the new-lane strip gives Melody lane 1 overlapping Chords, and both sound', () => {
    const blocks = ok(placeObjectNearest(verse(), 'melody', start(0), 'new'));
    expect(span(blocks, 'melody')).toEqual([0, 16]);
    expect(storedLane(blocks, 'melody')).toBe(1);
    // Chords stays automatic and stays on sub-lane 0 above Melody.
    expect(storedLane(blocks, 'chords')).toBeUndefined();
    const placed = lane(blocks).subLanes;
    expect(placed.subLanes).toBe(2);
    expect(placed.objects.map((object) => [object.id, object.subLane])).toEqual([
      ['chords', 0],
      ['melody', 1],
    ]);
    const { plan } = evaluateScene(blocks, 'scene');
    const at = (prefix: string) =>
      plan.events
        .filter((event) => event.id.startsWith(prefix))
        .map((event) => rationalToNumber(event.at.quarterNotes));
    expect(at('chords').length).toBeGreaterThan(0);
    expect(at('melody')).toEqual(at('chords'));
  });

  it('(iii) moving Melody back off its lane makes the emptied sub-lane disappear', () => {
    const two = ok(placeObjectNearest(verse(), 'melody', start(0), 'new'));
    expect(lane(two).subLanes.subLanes).toBe(2);
    const back = ok(placeObjectNearest(two, 'melody', start(40), 0));
    expect(storedLane(back, 'melody')).toBe(0);
    expect(lane(back).subLanes.subLanes).toBe(1);
  });

  it('(iv) an automatic child still lands below its parent', () => {
    const blocks = verse(part('kid', 2, 4, { parentRef: { id: 'chords' } }));
    const placed = lane(blocks).subLanes.objects;
    expect(placed.find((object) => object.id === 'chords')!.subLane).toBe(0);
    expect(placed.find((object) => object.id === 'kid')!.subLane).toBe(1);
  });

  it('(v) Duplicate Linked copies the lane', () => {
    const two = ok(placeObjectNearest(verse(), 'melody', start(0), 'new'));
    const copied = ok(duplicateObjectLinked(two, env(), 'melody'));
    const copy = copied.find((block) => block.id === 'n1')!;
    expect(objectDataOf(copy)!.lane).toBe(1);
    // It sits on the same sub-lane, after the original, in a free spot there.
    expect(span(copied, 'n1')).toEqual([16, 32]);
  });

  it('a drop on one sub-lane ignores blocks on the other (they overlap, both stay)', () => {
    const two = ok(placeObjectNearest(verse(), 'melody', start(0), 'new'));
    const moved = ok(placeObjectNearest(two, 'melody', start(4), 1));
    expect(span(moved, 'melody')).toEqual([4, 20]);
    expect(storedLane(moved, 'melody')).toBe(1);
  });

  it('a cross-collection drop keeps the lane number when free there, else uses the dropped sub-lane', () => {
    const two = ok(placeObjectNearest(verse(), 'melody', start(0), 'new'));
    const blocks = [
      ...two.filter((block) => block.id !== 'root'),
      part('other', 0, 8, { lane: 1 }),
      collectionBlock('other-lane', ['other'], {}, 'Other'),
      collectionBlock('root', ['verse', 'other-lane']),
    ];
    // Lane 1 of "Other" is taken at 0 to 8, so Melody (0 to 16) uses the dropped sub-lane 0 and lands at 8.
    const dropped = ok(applyDrop(blocks, 'melody', 'verse', 'other-lane', start(0), 0));
    expect(span(dropped, 'melody')[0]).toBe(8);
    // Into an empty collection the lane number 1 is free, so it stays 1.
    const empty = [
      ...two.filter((block) => block.id !== 'root'),
      collectionBlock('empty', [], {}, 'Empty'),
      collectionBlock('root', ['verse', 'empty']),
    ];
    const kept = ok(applyDrop(empty, 'melody', 'verse', 'empty', start(0), 0));
    expect(storedLane(kept, 'melody')).toBe(1);
  });
});

describe('lane validation (vi)', () => {
  const withLane = (value: unknown) => validateBlock(objectBlock('o', { lane: value as number }));
  it('rejects -1, 1.5 and "a"; absent and whole numbers pass', () => {
    expect(withLane(-1)).not.toBeNull();
    expect(withLane(1.5)).not.toBeNull();
    expect(withLane('a')).not.toBeNull();
    expect(withLane(undefined)).toBeNull();
    expect(withLane(0)).toBeNull();
    expect(withLane(3)).toBeNull();
  });
});

describe('a child dropped on its parent sub-lane (L2 review)', () => {
  it('does not cover the parent: it lands at the nearest free slot on that sub-lane', () => {
    const kid = objectBlock(
      'kid',
      { parentRef: { id: 'chords' }, primaryDataRef: { id: 'clave' }, start: 4, duration: 4 },
      'kid'
    );
    const blocks = verse(kid);
    // Chords holds 0 to 16 on sub-lane 0; the child is dropped there at world 4 to 8.
    const after = ok(placeObjectNearest(blocks, 'kid', rational(4), 0));
    expect(span(after, 'kid')).toEqual([16, 20]);
  });

  it('on its own sub-lane (below the parent) it still plays over the parent by design', () => {
    const kid = objectBlock(
      'kid',
      { parentRef: { id: 'chords' }, primaryDataRef: { id: 'clave' }, start: 4, duration: 4 },
      'kid'
    );
    const blocks = verse(kid);
    const own = lane(blocks).subLanes.objects.find((object) => object.id === 'kid')!.subLane;
    expect(own).toBe(1);
    const after = ok(placeObjectNearest(blocks, 'kid', rational(6), own));
    expect(span(after, 'kid')).toEqual([6, 10]);
  });
});
