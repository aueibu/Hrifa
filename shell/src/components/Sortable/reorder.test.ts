import { describe, expect, it } from 'vitest';
import {
  SWAP_DWELL_MS,
  arrayMove,
  dwellMode,
  moveFor,
  noDwell,
  previewOrder,
  trackOver,
} from './reorder';

const pins = ['19/14', '26/19', '19/13', '27/17', '44/27'];

describe('pause to swap', () => {
  it('the dwell time is 800 ms', () => {
    expect(SWAP_DWELL_MS).toBe(800);
  });

  it('moving across quickly and dropping on 44/27 inserts it: 26/19 19/13 27/17 44/27 19/14', () => {
    let d = trackOver(noDwell, '19/14', 0);
    d = trackOver(d, '26/19', 60);
    d = trackOver(d, '19/13', 120);
    d = trackOver(d, '27/17', 180);
    d = trackOver(d, '44/27', 240);
    const { mode, target } = dwellMode(d, '19/14', 400);
    expect(mode).toBe('insert');
    expect(target).toBeNull();
    expect(previewOrder(pins, '19/14', '44/27', mode)).toEqual([
      '26/19',
      '19/13',
      '27/17',
      '44/27',
      '19/14',
    ]);
    expect(moveFor(pins, '19/14', '44/27', mode)).toEqual({ from: 0, to: 4, kind: 'insert' });
  });

  it('resting SWAP_DWELL_MS on 44/27 swaps: 44/27 26/19 19/13 27/17 19/14', () => {
    let d = trackOver(noDwell, '27/17', 0);
    d = trackOver(d, '44/27', 100);
    // the same card again does not restart the clock
    d = trackOver(d, '44/27', 300);
    expect(dwellMode(d, '19/14', 100 + SWAP_DWELL_MS - 1).mode).toBe('insert');
    const { mode, target } = dwellMode(d, '19/14', 100 + SWAP_DWELL_MS);
    expect(mode).toBe('swap');
    expect(target).toBe('44/27');
    expect(previewOrder(pins, '19/14', target, mode)).toEqual([
      '44/27',
      '26/19',
      '19/13',
      '27/17',
      '19/14',
    ]);
    expect(moveFor(pins, '19/14', target, mode)).toEqual({ from: 0, to: 4, kind: 'swap' });
  });

  it('moving on to another card resumes insert and the clock restarts', () => {
    let d = trackOver(noDwell, '44/27', 0);
    expect(dwellMode(d, '19/14', SWAP_DWELL_MS + 100).mode).toBe('swap');
    d = trackOver(d, '27/17', SWAP_DWELL_MS + 150);
    expect(dwellMode(d, '19/14', SWAP_DWELL_MS + 200).mode).toBe('insert');
    expect(previewOrder(pins, '19/14', '27/17', 'insert')).toEqual([
      '26/19',
      '19/13',
      '27/17',
      '19/14',
      '44/27',
    ]);
  });

  it('leaving to a gap and coming back onto the same card restarts the clock', () => {
    let d = trackOver(noDwell, '44/27', 0);
    d = trackOver(d, null, 300);
    expect(d.overId).toBeNull();
    d = trackOver(d, '44/27', 500);
    expect(d.since).toBe(500);
    expect(dwellMode(d, '19/14', 500 + SWAP_DWELL_MS - 1).mode).toBe('insert');
    expect(dwellMode(d, '19/14', 500 + SWAP_DWELL_MS).mode).toBe('swap');
  });

  it('leaving during the swap ends it: the drop inserts', () => {
    let d = trackOver(noDwell, '44/27', 0);
    expect(dwellMode(d, '19/14', SWAP_DWELL_MS + 10).mode).toBe('swap');
    d = trackOver(d, null, SWAP_DWELL_MS + 20);
    const { mode, target } = dwellMode(d, '19/14', SWAP_DWELL_MS * 3);
    expect(mode).toBe('insert');
    expect(target).toBeNull();
    expect(moveFor(pins, '19/14', '44/27', mode)).toEqual({ from: 0, to: 4, kind: 'insert' });
  });

  it('resting on the dragged card itself never swaps and changes nothing', () => {
    const d = trackOver(noDwell, '19/14', 0);
    expect(dwellMode(d, '19/14', 5000).mode).toBe('insert');
    expect(previewOrder(pins, '19/14', '19/14', 'insert')).toEqual(pins);
    expect(moveFor(pins, '19/14', '19/14', 'insert')).toBeNull();
  });
});

describe('helpers', () => {
  it('arrayMove puts the item at the final index', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('an unknown over id changes nothing', () => {
    expect(previewOrder(pins, '19/14', null, 'insert')).toEqual(pins);
    expect(moveFor(pins, '19/14', 'nope', 'swap')).toBeNull();
  });
});
