import { followScrollLeft, pageScrollLeft } from './FollowPlayhead';

describe('follow scroll, centered as in a DAW', () => {
  const view = { viewWidth: 500, contentWidth: 5000 };

  it('stays at the start while the playhead is in the first half of the view', () => {
    expect(followScrollLeft({ ...view, playheadX: 0 })).toBe(0);
    expect(followScrollLeft({ ...view, playheadX: 249 })).toBe(0);
    expect(followScrollLeft({ ...view, playheadX: 250 })).toBe(0);
  });

  it('then keeps the playhead in the middle of the view', () => {
    expect(followScrollLeft({ ...view, playheadX: 251 })).toBe(1);
    expect(followScrollLeft({ ...view, playheadX: 1000 })).toBe(750);
    expect(followScrollLeft({ ...view, playheadX: 3000 })).toBe(2750);
  });

  it('stops at the end of the content so the playhead can run on to the right edge', () => {
    expect(followScrollLeft({ ...view, playheadX: 4800 })).toBe(4500);
    expect(followScrollLeft({ ...view, playheadX: 5000 })).toBe(4500);
  });

  it('returns to the start when the playhead wraps, and never scrolls content that fits', () => {
    expect(followScrollLeft({ ...view, playheadX: 10 })).toBe(0);
    expect(followScrollLeft({ viewWidth: 900, contentWidth: 600, playheadX: 590 })).toBe(0);
  });
});

describe('follow scroll, paged as in the piano roll', () => {
  const view = { viewWidth: 500, contentWidth: 5000 };

  it('leaves the view alone while the playhead is inside it', () => {
    expect(pageScrollLeft({ ...view, playheadX: 300, scrollLeft: 0 })).toBeUndefined();
    expect(pageScrollLeft({ ...view, playheadX: 1400, scrollLeft: 1000 })).toBeUndefined();
  });

  it('jumps a page when the playhead nears the right edge, or is before the view', () => {
    expect(pageScrollLeft({ ...view, playheadX: 490, scrollLeft: 0 })).toBe(450);
    expect(pageScrollLeft({ ...view, playheadX: 20, scrollLeft: 4000 })).toBe(0);
    expect(pageScrollLeft({ ...view, playheadX: 4990, scrollLeft: 0 })).toBe(4500);
  });
});
