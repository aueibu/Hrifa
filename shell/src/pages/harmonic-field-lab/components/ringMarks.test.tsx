import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
/**
 * The shared ring marks (`ringMarks.tsx`): the constants, which class each dot kind gets, the ghost's tone, the label's
 * `data-on`. jsdom applies no CSS, so the look itself (radius on screen, colors, dashes) is checked by eye.
 */
import { fireEvent, render } from '@test-utils';
import { describe, expect, it } from 'vitest';
import {
  DOT_CLASS,
  RING_BOX_REM,
  RING_DOT_R,
  RING_OFF_CHAIN_R,
  RING_OUTLINE_R,
  RING_PAD,
  RING_PX_PER_UNIT,
  RING_R,
  RING_SIZE,
  RING_SOUND_R,
  RingCircle,
  RingDot,
  RingLabel,
  RingOutline,
  RingPolygon,
  dotRadius,
  dotReach,
  markScaleFor,
  trimmedEdges,
} from './ringMarks';

const svg = (node: ReactNode) => render(<svg>{node}</svg>).container.querySelector('svg')!;

describe('the constants', () => {
  it('has the main ring size, the dot radii and the on-screen scale (312 px for 388 units)', () => {
    expect(RING_SIZE).toBe(300);
    expect(RING_PAD).toBe(44);
    expect(RING_BOX_REM).toBe(19.5);
    expect(RING_DOT_R).toBe(5.5);
    expect(RING_SOUND_R).toBe(8);
    expect(RING_OFF_CHAIN_R).toBe(4);
    expect(RING_PX_PER_UNIT).toBeCloseTo(312 / 388, 10);
    expect(RING_PX_PER_UNIT).toBeCloseTo(0.804, 3);
  });

  it('gives field kinds the field radius and sounding kinds the sounding radius', () => {
    expect(['on', 'off'].map((k) => dotRadius(k as 'on'))).toEqual([5.5, 5.5]);
    expect(['lit', 'solid', 'ghost'].map((k) => dotRadius(k as 'lit'))).toEqual([8, 8, 8]);
  });
});

describe('RingDot', () => {
  it('maps each kind to its class and default radius', () => {
    const dots = svg(
      <>
        {(['on', 'off', 'lit', 'solid', 'ghost'] as const).map((kind, i) => (
          <RingDot key={kind} kind={kind} cx={i} cy={0} data-testid={kind} />
        ))}
      </>
    );
    const get = (k: string) => dots.querySelector(`[data-testid="${k}"]`)!;
    expect(get('on')).toHaveClass(DOT_CLASS.on);
    expect(get('off')).toHaveClass(DOT_CLASS.off);
    expect(get('lit')).toHaveClass(DOT_CLASS.lit);
    expect(get('ghost')).toHaveClass(DOT_CLASS.ghost);
    // a solid chord dot is the field note's solid look, at the sounding size
    expect(get('solid')).toHaveClass(DOT_CLASS.on);
    expect(new Set([DOT_CLASS.on, DOT_CLASS.off, DOT_CLASS.lit, DOT_CLASS.ghost]).size).toBe(4);
    expect(['on', 'off', 'lit', 'solid', 'ghost'].map((k) => get(k).getAttribute('r'))).toEqual([
      '5.5',
      '5.5',
      '8',
      '8',
      '8',
    ]);
  });

  it('an explicit radius wins; props, handlers and children pass through', () => {
    let hovered = 0;
    const el = svg(
      <RingDot
        kind="off"
        cx={3}
        cy={4}
        r={RING_OFF_CHAIN_R}
        tabIndex={0}
        role="button"
        aria-label="a note"
        data-chord="true"
        data-off="true"
        onMouseEnter={() => (hovered += 1)}
      >
        <title>tip</title>
      </RingDot>
    ).querySelector('circle')!;
    expect(el.getAttribute('r')).toBe('4');
    expect(el.getAttribute('cx')).toBe('3');
    expect(el.getAttribute('cy')).toBe('4');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('aria-label')).toBe('a note');
    expect(el.getAttribute('data-chord')).toBe('true');
    expect(el.getAttribute('data-off')).toBe('true');
    expect(el.querySelector('title')?.textContent).toBe('tip');
    fireEvent.mouseEnter(el);
    expect(hovered).toBe(1);
  });

  it('a tone recolors a ghost only: it keeps the ghost class and size', () => {
    const root = svg(
      <>
        <RingDot kind="ghost" cx={0} cy={0} data-testid="plain" />
        <RingDot kind="ghost" tone="above" cx={0} cy={0} data-testid="above" />
        <RingDot kind="ghost" tone="below" cx={0} cy={0} data-testid="below" />
        <RingDot kind="on" tone="above" cx={0} cy={0} data-testid="solid" />
      </>
    );
    const get = (k: string) => root.querySelector(`[data-testid="${k}"]`)!;
    expect(get('plain').getAttribute('data-tone')).toBeNull();
    expect(get('above').getAttribute('data-tone')).toBe('above');
    expect(get('below').getAttribute('data-tone')).toBe('below');
    for (const k of ['plain', 'above', 'below']) {
      expect(get(k)).toHaveClass(DOT_CLASS.ghost);
      expect(get(k).getAttribute('r')).toBe('8');
    }
    // a tone on any other kind is ignored
    expect(get('solid').getAttribute('data-tone')).toBeNull();
  });
});

describe('the marks scale (a ring larger than the main ring)', () => {
  it('is the radius over the main ring radius: 1 for the main ring', () => {
    expect(markScaleFor(RING_R)).toBe(1);
    expect(markScaleFor(181)).toBeCloseTo(181 / 104, 10);
    expect(markScaleFor(208)).toBe(2);
  });

  it('a scale of 2 doubles a dot radius (default kind radius and an explicit one) and the outline radius; no scale changes nothing', () => {
    const root = svg(
      <>
        <RingDot kind="on" cx={0} cy={0} scale={2} data-testid="on" />
        <RingDot kind="ghost" cx={0} cy={0} scale={2} data-testid="ghost" />
        <RingDot kind="off" cx={0} cy={0} r={RING_OFF_CHAIN_R} scale={2} data-testid="off" />
        <RingDot kind="on" cx={0} cy={0} data-testid="plain" />
        <RingOutline cx={0} cy={0} scale={2} data-testid="outline" />
        <RingOutline cx={0} cy={0} data-testid="outline1" />
      </>
    );
    const r = (k: string) => root.querySelector(`[data-testid="${k}"]`)!.getAttribute('r');
    expect(r('on')).toBe('11');
    expect(r('ghost')).toBe('16');
    expect(r('off')).toBe('8');
    expect(r('plain')).toBe('5.5');
    // the halo keeps the main ring's gap to the dot (6.5 units): the dot scales (5.5 x 2 = 11), the gap does not
    expect(r('outline')).toBe('17.5');
    expect(r('outline1')).toBe('12');
  });

  it('strokes and dashes do not scale: plain numbers in units, the main ring values', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/pages/harmonic-field-lab/components/ringMarks.module.css'),
      'utf8'
    );
    expect(css).not.toContain('--ring-k');
    expect(css).not.toContain('calc(');
    expect(css).toContain('stroke-width: 1.5;');
    expect(css).toContain('stroke-dasharray: 3 2.5;');
  });

  it('dotReach is the radius times the scale plus half the stroke (3 for a chord dot, 1.5 solid, 2 hollow, lit and ghost)', () => {
    expect(dotReach('on')).toBe(5.5 + 0.75);
    expect(dotReach('off')).toBe(5.5 + 1);
    expect(dotReach('lit')).toBe(8 + 1);
    expect(dotReach('on', { chord: true, scale: 2 })).toBe(11 + 1.5);
    expect(dotReach('ghost', { scale: 2 })).toBe(16 + 1);
    expect(dotReach('off', { r: RING_OFF_CHAIN_R, scale: 2 })).toBe(8 + 1);
  });
});

describe('RingPolygon trim', () => {
  const sq = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('trimmedEdges shortens every edge by the radius at each of its two corners, and drops an edge they use up', () => {
    expect(trimmedEdges(sq, [10, 10, 10, 10]).split('M').slice(1)).toEqual([
      '10.00 0.00L90.00 0.00',
      '100.00 10.00L100.00 90.00',
      '90.00 100.00L10.00 100.00',
      '0.00 90.00L0.00 10.00',
    ]);
    // corner radii differ: the edge from corner 0 (r 20) to corner 1 (r 5) loses 20 at one end and 5 at the other
    expect(trimmedEdges(sq, [20, 5, 5, 5]).split('M')[1]).toBe('20.00 0.00L95.00 0.00');
    // two corners 10 apart with radii 6 and 6: nothing is left of the edge
    expect(
      trimmedEdges(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        [6, 6]
      )
    ).toBe('');
    expect(trimmedEdges([{ x: 1, y: 1 }], [3])).toBe('');
  });

  it('without trim the polygon is whole (one element, its own outline); with trim the polygon is the fill and the edges are a path', () => {
    const whole = svg(<RingPolygon kind="chord" points={sq} data-testid="p" />);
    expect(whole.querySelectorAll('path')).toHaveLength(0);
    expect(whole.querySelector('[data-testid="p"]')!.getAttribute('class')).not.toContain(
      'trimmed'
    );
    const cut = svg(
      <RingPolygon kind="chord" points={sq} trim={[10, 10, 10, 10]} data-testid="p" />
    );
    expect(cut.querySelector('[data-testid="p"]')!.getAttribute('class')).toContain('trimmed');
    expect(cut.querySelector('[data-testid="p"]')!.getAttribute('points')).toBe(
      '0,0 100,0 100,100 0,100'
    );
    expect(cut.querySelector('path')!.getAttribute('d')).toBe(trimmedEdges(sq, [10, 10, 10, 10]));
  });
});

describe('RingCircle and RingLabel', () => {
  it('draws the ring line', () => {
    const c = svg(<RingCircle cx={150} cy={150} r={104} />).querySelector('circle')!;
    expect(c.getAttribute('r')).toBe('104');
    expect(c.getAttribute('class')).toContain('ringLine');
  });

  it('a label is muted unless on; data-on follows the prop and is left off when not given', () => {
    const root = svg(
      <>
        <RingLabel x={0} y={0} on data-testid="on">
          3/2
        </RingLabel>
        <RingLabel x={0} y={0} on={false} data-testid="off">
          5/4
        </RingLabel>
        <RingLabel x={0} y={0} data-testid="none">
          9/8
        </RingLabel>
      </>
    );
    const get = (k: string) => root.querySelector(`[data-testid="${k}"]`)!;
    expect(get('on').getAttribute('data-on')).toBe('true');
    expect(get('off').getAttribute('data-on')).toBe('false');
    expect(get('none').hasAttribute('data-on')).toBe(false);
    expect(get('on').getAttribute('class')).toContain('svgLabel');
    expect(get('on').textContent).toBe('3/2');
  });
});

describe('the outline', () => {
  it('is the main ring hover outline: r 12 unless given, its own class, extra props pass through', () => {
    expect(RING_OUTLINE_R).toBe(12);
    const root = svg(
      <>
        <RingOutline cx={1} cy={2} data-testid="a" />
        <RingOutline cx={1} cy={2} r={14} data-testid="b" />
      </>
    );
    const a = root.querySelector('[data-testid="a"]')!;
    expect(a.getAttribute('r')).toBe('12');
    expect(a.getAttribute('class')).toContain('selRing');
    expect(root.querySelector('[data-testid="b"]')!.getAttribute('r')).toBe('14');
  });
});
