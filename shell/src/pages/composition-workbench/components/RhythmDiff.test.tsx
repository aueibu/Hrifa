import { createRef } from 'react';
import { render } from '@test-utils';
import {
  curvePath,
  diffLines,
  diffLinesPx,
  drawWindow,
  lineColor,
  lineOpacity,
  edgeInfo,
  lineWidth,
  linesInRange,
  noteEdges,
  RhythmDiff,
} from './RhythmDiff';

/** A scroller whose scroll metrics are set by hand, as jsdom does no layout. */
function fakeScroller(metrics: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollWidth', { value: metrics.scrollWidth, configurable: true });
  Object.defineProperty(element, 'clientWidth', { value: metrics.clientWidth, configurable: true });
  element.scrollLeft = metrics.scrollLeft;
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = element;
  return ref;
}

describe('rhythm diff measures', () => {
  it('takes note edges as the running sum of the lengths, rests counting by magnitude', () => {
    expect(noteEdges([2, 1, -3])).toEqual([0, 2, 3, 6]);
  });

  it('pairs each edge with where it lands in the edit, on one scale', () => {
    // 2 2 becomes 4 2: the edit is longer, so the scale is 6 and the middle edge moves from 2 to 4.
    const lines = diffLines([2, 2], [4, 2]);
    expect(lines.map((line) => [line.from, line.to, line.moved])).toEqual([
      [0, 0, false],
      [2 / 6, 4 / 6, true],
      [4 / 6, 1, true],
    ]);
  });

  it('measures each edge against its original position and against the whole rhythm', () => {
    // 1 1 1 1 becomes 2 1 1 1/2. Edges sat at 0 1 2 3 4 and now sit at 0 2 3 4 4.5; the longer total,
    // 4.5, is the whole.
    const lines = diffLines([1, 1, 1, 1], [2, 1, 1, 0.5]);
    expect(lines.map((line) => line.direction)).toEqual(['still', 'later', 'later', 'later', 'later']);
    // Against the original position: 1 -> 2 is +100%, 2 -> 3 is +50%, 3 -> 4 is +33%, 4 -> 4.5 is +12.5%.
    expect(lines.map((line) => line.relative)).toEqual([0, 1, 0.5, 1 / 3, 0.125]);
    // Against the whole: every shift is 1 pulse of 4.5, except the last at half a pulse.
    expect(lines.map((line) => Math.round(line.share * 10000) / 10000)).toEqual([
      0, 0.2222, 0.2222, 0.2222, 0.1111,
    ]);
    // Against the other edges of this edit: the three biggest movers are 1, the last half as far.
    expect(lines.map((line) => line.weight)).toEqual([0, 1, 1, 1, 0.5]);
    // A shorter edit pulls edges earlier.
    expect(diffLines([2, 2], [1, 2]).map((line) => line.direction)).toEqual([
      'still',
      'earlier',
      'earlier',
    ]);
    expect(diffLines([2, 2], [1, 2])[1].relative).toBe(-0.5);
  });

  it('sets opacity from the share of the whole, faint for a still edge', () => {
    expect(lineOpacity({ moved: false, share: 0 })).toBe(0.2);
    expect(lineOpacity({ moved: true, share: 0 })).toBe(0.3);
    expect(lineOpacity({ moved: true, share: 0.05 })).toBe(0.65);
    expect(lineOpacity({ moved: true, share: 0.1 })).toBe(1);
    expect(lineOpacity({ moved: true, share: 0.9 })).toBe(1);
  });

  it('sets width from rank within this edit, 2px for a still edge up to 8px for the furthest', () => {
    expect(lineWidth({ weight: 0 })).toBe(2);
    expect(lineWidth({ weight: 0.5 })).toBe(5);
    expect(lineWidth({ weight: 1 })).toBe(8);
  });

  it('scales width to the edit, so a tiny edit still draws its biggest move at 8px', () => {
    // 100 pulses with one edge nudged by 1: a tiny share of the whole, but the furthest in this edit.
    const lines = diffLines([50, 50], [51, 50]);
    expect(lines[1].share).toBeLessThan(0.02);
    expect(lineWidth(lines[1])).toBe(8);
    expect(lineWidth(lines[0])).toBe(2);
  });

  it('sets color from direction and the change from the original, cyan to orange', () => {
    expect(lineColor({ direction: 'still', relative: 0 })).toBe('var(--text-muted)');
    expect(lineColor({ direction: 'later', relative: 1 })).toBe(
      'color-mix(in srgb, var(--mark-orange) 100%, var(--text-muted))'
    );
    expect(lineColor({ direction: 'later', relative: 0.5 })).toBe(
      'color-mix(in srgb, var(--mark-orange) 60%, var(--text-muted))'
    );
    expect(lineColor({ direction: 'earlier', relative: -0.5 })).toBe(
      'color-mix(in srgb, var(--mark-cyan) 60%, var(--text-muted))'
    );
    // Past a doubling the color is capped at the full hue.
    expect(lineColor({ direction: 'later', relative: 7 })).toContain('100%');
  });
});

describe('rhythm diff drawing', () => {
  it('draws each edge as an S-curve in px that leaves and arrives straight down', () => {
    expect(curvePath(100, 150, 30)).toBe('M 100 0 C 100 15, 150 15, 150 30');
    // An edge that does not move is a straight vertical.
    expect(curvePath(40, 40, 36)).toBe('M 40 0 C 40 18, 40 18, 40 36');
  });

  it('places each edge in px where its block edge is, inside the strips\' 1px border', () => {
    // Input 2 2 on a 102px strip; result 2 3 on a 102px strip. Blocks span 100px inside the borders.
    const lines = diffLinesPx([2, 2], [2, 3], 102, 102);
    expect(lines.map((line) => line.x1)).toEqual([1, 51, 101]);
    // The result's edges are at 0, 2/5 and 1 of its 100px.
    expect(lines.map((line) => line.x2)).toEqual([1, 41, 101]);
  });

  it('keeps only the lines that touch the range being drawn', () => {
    const lines = diffLinesPx([2, 2, 2, 2], [2, 2, 2, 2], 1002, 1002);
    // Edges at 1, 251, 501, 751, 1001 px.
    expect(linesInRange(lines, 200, 600).map((line) => line.x1)).toEqual([251, 501]);
    expect(linesInRange(lines, 2000, 3000)).toEqual([]);
  });

  it('draws a window around the view in whole steps, never beyond the roll', () => {
    expect(drawWindow(5000, 1000, 20000)).toEqual({ left: 4200, right: 6600, content: 20000 });
    expect(drawWindow(0, 1154, 18900)).toEqual({ left: 0, right: 1800, content: 18900 });
    expect(drawWindow(18000, 1000, 18900)).toEqual({ left: 17400, right: 18900, content: 18900 });
    // A window moves in steps, so small scrolls inside one do not redraw.
    expect(drawWindow(4999, 1000, 20000)).toEqual(drawWindow(5000, 1000, 20000));
  });

  it('draws only the part of a very wide roll that is near the view, never the whole width', () => {
    // 18,900px of roll: drawn in one piece this would pass the GPU texture limit and go blurry.
    const scroller = fakeScroller({ scrollWidth: 18900, clientWidth: 1154, scrollLeft: 0 });
    const { container } = render(
      <RhythmDiff
        inputLengths={[2, 2, 2, 2]}
        editedLengths={[2, 3, 2, 2]}
        inputShare={0.8}
        editedShare={1}
        scroller={scroller}
      />
    );
    const svg = container.querySelector('svg')!;
    expect(Number(svg.getAttribute('width'))).toBe(1800);
    expect(svg.getAttribute('viewBox')).toBe('0 0 1800 36');
  });

  it('draws a path per visible edge, with each its own direction', () => {
    const scroller = fakeScroller({ scrollWidth: 900, clientWidth: 900, scrollLeft: 0 });
    const { container } = render(
      <RhythmDiff
        inputLengths={[2, 2]}
        editedLengths={[2, 3]}
        inputShare={1}
        editedShare={1}
        scroller={scroller}
      />
    );
    const paths = [...container.querySelectorAll<SVGPathElement>('path[data-direction]')];
    expect(paths.map((path) => path.getAttribute('data-direction'))).toEqual(['still', 'still', 'later']);
    expect(paths.map((path) => path.style.strokeOpacity)).toEqual(['0.2', '0.2', '1']);
    expect(paths.map((path) => path.style.strokeWidth)).toEqual(['2', '2', '8']);
  });
});

describe('hover text for the curves', () => {
  it('says what an edge does, in pulses and as a share of where it was', () => {
    const lines = diffLines([2, 2], [2, 3]);
    expect(edgeInfo(lines[0])).toBe('Edge 1: does not move');
    expect(edgeInfo(lines[2])).toBe('Edge 3: moves 1 pulses later (25% of where it was)');
    const earlier = diffLines([2, 2], [1, 2]);
    expect(edgeInfo(earlier[1])).toBe('Edge 2: moves 1 pulses earlier (50% of where it was)');
  });

  it('puts the explanation on each curve and a wide target on top of it', () => {
    const scroller = fakeScroller({ scrollWidth: 900, clientWidth: 900, scrollLeft: 0 });
    const { container } = render(
      <RhythmDiff inputLengths={[2, 2]} editedLengths={[2, 3]} inputShare={1} editedShare={1} scroller={scroller} />
    );
    const groups = [...container.querySelectorAll('g[data-info]')];
    expect(groups.map((group) => group.getAttribute('data-info'))).toEqual([
      'Edge 1: does not move',
      'Edge 2: does not move',
      'Edge 3: moves 1 pulses later (25% of where it was)',
    ]);
    expect(container.querySelectorAll('path')).toHaveLength(6);
  });
});
