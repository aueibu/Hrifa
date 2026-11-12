import {
  clampScrollLeft,
  isBarMove,
  isWrittenEcho,
  reconcileBar,
  recordEmitted,
  recordWritten,
  scrollRange,
} from './scrollSync';

describe('scroll range and clamp', () => {
  it('the range is the timeline less the view, never negative', () => {
    expect(scrollRange(1280, 500)).toBe(780);
    expect(scrollRange(400, 500)).toBe(0);
  });

  it('keeps a position inside [0, range] and only floors an unmeasured view', () => {
    expect(clampScrollLeft(-40, 1280, 500)).toBe(0);
    expect(clampScrollLeft(300, 1280, 500)).toBe(300);
    expect(clampScrollLeft(9999, 1280, 500)).toBe(780);
    // The very end is reachable exactly (no last-pixels gap).
    expect(clampScrollLeft(780, 1280, 500)).toBe(780);
    expect(clampScrollLeft(9999, 1280, 0)).toBe(9999);
  });

  it('treats sub-pixel differences as rounding, not as a move', () => {
    expect(isBarMove(100.4, 100)).toBe(false);
    expect(isBarMove(102, 100)).toBe(true);
  });
});

describe('bar and roll never fight over the position', () => {
  it('a position the bar reported is not written back to it', () => {
    const emitted = recordEmitted([], 120);
    expect(reconcileBar(emitted, 120)).toEqual({ write: false, emitted: [] });
  });

  it('a fast drag that outruns rendering is not pulled back to a stale value', () => {
    // The bar reported 100, 140 and 180 before the roll rendered 100.
    let emitted: number[] = [];
    [100, 140, 180].forEach((value) => {
      emitted = recordEmitted(emitted, value);
    });
    const first = reconcileBar(emitted, 100);
    expect(first.write).toBe(false);
    // 140 and 180 are still pending, and rendering them writes nothing either.
    expect(reconcileBar(first.emitted, 140).write).toBe(false);
    expect(reconcileBar(reconcileBar(first.emitted, 140).emitted, 180).write).toBe(false);
  });

  it('a change from elsewhere (wheel, zoom, playhead follow) is written to the bar', () => {
    expect(reconcileBar(recordEmitted([], 100), 640)).toEqual({ write: true, emitted: [] });
    expect(reconcileBar([], 640)).toEqual({ write: true, emitted: [] });
  });

  it('simulation: clamped wheel, bar drag to both ends and back reaches the ends with no bounce', () => {
    const content = 1280;
    const view = 500;
    const range = scrollRange(content, view);
    let roll = 0;
    let bar = 0;
    let emitted: number[] = [];
    const writes: number[] = [];
    // The roll renders a new value: reconcile the bar, as HorizontalScrollbar's effect does.
    const render = () => {
      const result = reconcileBar(emitted, roll);
      emitted = result.emitted;
      if (result.write && isBarMove(bar, roll)) {
        bar = roll;
        writes.push(roll);
      }
    };
    // A native bar clamps whatever it is given to its own range, which equals the roll's.
    const dragBar = (to: number) => {
      bar = Math.min(range, Math.max(0, to));
      if (isBarMove(bar, roll)) {
        emitted = recordEmitted(emitted, bar);
        roll = clampScrollLeft(bar, content, view);
      }
      render();
    };
    const wheel = (delta: number) => {
      const next = clampScrollLeft(roll + delta, content, view);
      if (Math.abs(next - roll) > 0.01) {
        roll = next;
        render();
      }
    };
    wheel(10_000);
    expect(roll).toBe(range);
    expect(bar).toBe(range);
    dragBar(0);
    expect(roll).toBe(0);
    dragBar(range + 500);
    expect(roll).toBe(range);
    expect(bar).toBe(range);
    wheel(-10_000);
    expect(roll).toBe(0);
    expect(bar).toBe(0);
    // The bar was only ever written for changes that did not come from it.
    expect(writes).toEqual([range, 0]);
  });
});

describe('the echo guard remembers only the last write', () => {
  it('a late echo of the last write is ignored', () => {
    const written = recordWritten(recordWritten([], 100), 400);
    expect(isWrittenEcho(written, 400)).toBe(true);
    expect(isWrittenEcho(written, 400.4)).toBe(true);
  });

  it('a native wheel or arrow step that lands back on an earlier written value is honoured', () => {
    // The bar wrote 100, then 400. The user then scrolls natively back to exactly 100.
    const written = recordWritten(recordWritten([], 100), 400);
    expect(isWrittenEcho(written, 100)).toBe(false);
    expect(isWrittenEcho(written, 250)).toBe(false);
  });

  it('nothing written means nothing is an echo', () => {
    expect(isWrittenEcho([], 0)).toBe(false);
    expect(recordWritten([1, 2, 3], 9)).toEqual([9]);
  });
});
