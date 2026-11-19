/**
 * M8p: painting in the Monzo matrix. A paint stroke must stay inside the picker: it renders nothing outside it (the stats, the
 * field table, the tuner strip, the workspace and the main ring panel: everything that follows the lab-wide state), and the picker
 * renders at most once per animation frame however many mouse events came in that frame.
 */
import { createElement, type ComponentType } from 'react';
import { act, fireEvent, render, screen } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';

vi.setConfig({ testTimeout: 30_000 });

/** Render counts of named parts of the page: a wrapper renders exactly when its (unmemoized) parent re-renders it. */
const counts = vi.hoisted(() => ({}) as Record<string, number>);

function counted<P extends object>(id: string, C: ComponentType<P>) {
  return function Counted(p: P) {
    counts[id] = (counts[id] ?? 0) + 1;
    return createElement(C as ComponentType<object>, p);
  };
}

vi.mock('./components/RingStats', async () => {
  const actual =
    await vi.importActual<typeof import('./components/RingStats')>('./components/RingStats');
  return {
    ...actual,
    Stats: counted('Stats', actual.Stats),
    ShapeStats: counted('ShapeStats', actual.ShapeStats),
    RingPanel: counted('RingPanel', actual.RingPanel),
  };
});
vi.mock('./components/Workspace', async () => {
  const actual =
    await vi.importActual<typeof import('./components/Workspace')>('./components/Workspace');
  return { ...actual, Workspace: counted('Workspace', actual.Workspace) };
});
vi.mock('./components/FieldPanel', async () => {
  const actual =
    await vi.importActual<typeof import('./components/FieldPanel')>('./components/FieldPanel');
  return { ...actual, FieldCompact: counted('FieldCompact', actual.FieldCompact) };
});
vi.mock('./components/TunerStrip', async () => {
  const actual =
    await vi.importActual<typeof import('./components/TunerStrip')>('./components/TunerStrip');
  return { ...actual, TunerStrip: counted('TunerStrip', actual.TunerStrip) };
});
// the picker's body, one render per picker render (the Monzo panel is its child, not memoized)
vi.mock('./components/MonzoPanel', async () => {
  const actual =
    await vi.importActual<typeof import('./components/MonzoPanel')>('./components/MonzoPanel');
  return { ...actual, MonzoPanel: counted('Picker', actual.MonzoPanel) };
});

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

const OUTSIDE = ['Workspace', 'RingPanel', 'Stats', 'ShapeStats', 'FieldCompact', 'TunerStrip'];

describe('M8p monzo paint performance', () => {
  it('a paint stroke renders nothing outside the picker and the picker once per frame', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('radio', { name: 'Rel' }));
    const ringNote = Array.from(
      screen
        .getByRole('group', { name: /^Pitch circle/ })
        .querySelectorAll<HTMLElement>('[role="button"]')
    ).find((b) => /^\S+, -?\d+\.\d cents/.test(b.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(ringNote, { shiftKey: true });
    fireEvent.click(screen.getByRole('radio', { name: 'Monzo' }));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const matrix = screen.getByTestId('monzo-matrix');
    const rowH = parseFloat(
      (screen.getAllByTestId('monzo-value')[0] as HTMLElement).style.height || '12'
    );
    const gridW = parseFloat(matrix.style.width);
    const cellW = gridW / 13;
    matrix.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: gridW, bottom: 100, width: gridW, height: 100 }) as DOMRect;

    // each mouse event is a new column (0..9, wrapping) at a new row, so every event changes a value
    let k = 0;
    const stroke = (frames: number, perFrame: number) => {
      for (let f = 0; f < frames; f++) {
        for (let i = 0; i < perFrame; i++, k++) {
          fireEvent.mouseMove(matrix, {
            clientX: ((k % 10) + 0.5) * cellW,
            clientY: ((k * 3 + 1 + Math.floor(k / 10)) % 25) * rowH + rowH / 2,
          });
        }
        act(() => {
          vi.advanceTimersByTime(17);
        });
      }
    };
    // M9e: painting needs the button down (press-drag)
    fireEvent.mouseEnter(matrix);
    fireEvent.mouseDown(matrix, { clientX: 0.5 * cellW, clientY: 0.5 * rowH });
    stroke(1, 10);
    const base = { ...counts };
    // 10 mouse events in one frame, then 4 frames of 3 events: 5 frames, 22 events
    stroke(1, 10);
    stroke(4, 3);
    // the release itself is one more picker render (the stroke flag), counted apart from the frames
    const end = { ...counts };
    fireEvent.mouseUp(matrix);
    const d = (id: string) => (end[id] ?? 0) - (base[id] ?? 0);
    const outside = OUTSIDE.reduce((n, id) => n + d(id), 0);
    // every column shows its value, and the last frame was drawn
    expect(matrix.querySelectorAll('[data-now="true"]')).toHaveLength(13);
    expect(outside).toBe(0);
    expect(d('Picker')).toBe(5);
  });
});
