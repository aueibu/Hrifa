import { useState } from 'react';
import { act, fireEvent, render, screen } from '@test-utils';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHORD_DOCK_WIDTH, MIN_CHORD_DOCK_WIDTH } from '../noteEditorPreferences';
import { ChordPickerHost } from './ChordPickerHost';

function Harness({ onWidth }: { onWidth?: (width: number | null) => void }) {
  const [width, setWidth] = useState<number | null>(null);
  return (
    <div>
      <ChordPickerHost
        host="dock"
        onHostChange={() => undefined}
        dockWidth={width}
        onDockWidthChange={(next) => {
          onWidth?.(next);
          setWidth(next);
        }}
      >
        <span>body</span>
      </ChordPickerHost>
    </div>
  );
}

const splitter = () => screen.getByRole('separator', { name: /Resize chord dock/ });
const dock = () => document.querySelector('[data-chord-host="dock"]') as HTMLElement;

describe('the chord dock splitter', () => {
  it('is a vertical separator with value, min and max, at about 30rem by default', () => {
    render(<Harness />);
    expect(splitter()).toHaveAttribute('aria-orientation', 'vertical');
    expect(splitter()).toHaveAttribute('aria-valuenow', String(DEFAULT_CHORD_DOCK_WIDTH));
    expect(splitter()).toHaveAttribute('aria-valuemin', String(MIN_CHORD_DOCK_WIDTH));
    expect(Number(splitter().getAttribute('aria-valuemax'))).toBeGreaterThan(
      DEFAULT_CHORD_DOCK_WIDTH
    );
    expect(dock().style.width).toBe(`${DEFAULT_CHORD_DOCK_WIDTH}px`);
  });

  it('dragging left widens the dock live; right narrows it; it clamps to the minimum', () => {
    const onWidth = vi.fn();
    render(<Harness onWidth={onWidth} />);
    fireEvent.pointerDown(splitter(), { clientX: 500, pointerId: 1, button: 0 });
    fireEvent.pointerMove(splitter(), { clientX: 450, pointerId: 1, buttons: 1 });
    expect(dock().style.width).toBe(`${DEFAULT_CHORD_DOCK_WIDTH + 50}px`);
    fireEvent.pointerMove(splitter(), { clientX: 5000, pointerId: 1, buttons: 1 });
    expect(dock().style.width).toBe(`${MIN_CHORD_DOCK_WIDTH}px`);
    // Nothing is handed to the owner (and so nothing persisted) until the drag ends, once.
    expect(onWidth).not.toHaveBeenCalled();
    fireEvent.pointerUp(splitter(), { clientX: 5000, pointerId: 1 });
    expect(onWidth).toHaveBeenCalledTimes(1);
    expect(onWidth).toHaveBeenLastCalledWith(MIN_CHORD_DOCK_WIDTH);
    // After the release a move changes nothing.
    onWidth.mockClear();
    fireEvent.pointerMove(splitter(), { clientX: 100, pointerId: 1, buttons: 1 });
    expect(onWidth).not.toHaveBeenCalled();
    expect(dock().style.width).toBe(`${MIN_CHORD_DOCK_WIDTH}px`);
  });

  it('a press without a move persists nothing', () => {
    const onWidth = vi.fn();
    render(<Harness onWidth={onWidth} />);
    fireEvent.pointerDown(splitter(), { clientX: 500, pointerId: 1, button: 0 });
    fireEvent.pointerUp(splitter(), { clientX: 500, pointerId: 1 });
    expect(onWidth).not.toHaveBeenCalled();
  });

  it('a move with no button held ends a stuck drag', () => {
    const onWidth = vi.fn();
    render(<Harness onWidth={onWidth} />);
    fireEvent.pointerDown(splitter(), { clientX: 500, pointerId: 1, button: 0 });
    fireEvent.pointerMove(splitter(), { clientX: 450, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(splitter(), { clientX: 400, pointerId: 1, buttons: 0 });
    expect(onWidth).toHaveBeenCalledTimes(1);
    expect(onWidth).toHaveBeenLastCalledWith(DEFAULT_CHORD_DOCK_WIDTH + 50);
    fireEvent.pointerMove(splitter(), { clientX: 300, pointerId: 1, buttons: 1 });
    expect(dock().style.width).toBe(`${DEFAULT_CHORD_DOCK_WIDTH + 50}px`);
  });

  it('lost pointer capture ends the drag', () => {
    const onWidth = vi.fn();
    render(<Harness onWidth={onWidth} />);
    fireEvent.pointerDown(splitter(), { clientX: 500, pointerId: 1, button: 0 });
    fireEvent.pointerMove(splitter(), { clientX: 450, pointerId: 1, buttons: 1 });
    fireEvent.lostPointerCapture(splitter(), { pointerId: 1 });
    expect(onWidth).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(splitter(), { clientX: 300, pointerId: 1, buttons: 1 });
    expect(dock().style.width).toBe(`${DEFAULT_CHORD_DOCK_WIDTH + 50}px`);
  });

  it('follows the work area width: at most 60% of it, the minimum when that is smaller', () => {
    let notify: ((width: number) => void) | null = null;
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notify = (width) =>
          callback([{ contentRect: { width } } as ResizeObserverEntry], this as never);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      render(<Harness />);
      act(() => notify?.(1000));
      expect(splitter()).toHaveAttribute('aria-valuemax', '600');
      act(() => notify?.(500));
      expect(splitter()).toHaveAttribute('aria-valuemax', '300');
      // The shown width is re-clamped to the new maximum.
      fireEvent.keyDown(splitter(), { key: 'End' });
      act(() => notify?.(300));
      expect(splitter()).toHaveAttribute('aria-valuemax', String(MIN_CHORD_DOCK_WIDTH));
      expect(dock().style.width).toBe(`${MIN_CHORD_DOCK_WIDTH}px`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clamps to the maximum', () => {
    render(<Harness />);
    const max = Number(splitter().getAttribute('aria-valuemax'));
    fireEvent.pointerDown(splitter(), { clientX: 5000, pointerId: 1, button: 0 });
    fireEvent.pointerMove(splitter(), { clientX: -5000, pointerId: 1, buttons: 1 });
    expect(dock().style.width).toBe(`${max}px`);
  });

  it('keyboard: Left widens, Right narrows, Home is the minimum, End the maximum', () => {
    render(<Harness />);
    fireEvent.keyDown(splitter(), { key: 'ArrowLeft' });
    expect(splitter()).toHaveAttribute('aria-valuenow', String(DEFAULT_CHORD_DOCK_WIDTH + 16));
    fireEvent.keyDown(splitter(), { key: 'ArrowRight' });
    fireEvent.keyDown(splitter(), { key: 'ArrowRight' });
    expect(splitter()).toHaveAttribute('aria-valuenow', String(DEFAULT_CHORD_DOCK_WIDTH - 16));
    fireEvent.keyDown(splitter(), { key: 'Home' });
    expect(splitter()).toHaveAttribute('aria-valuenow', String(MIN_CHORD_DOCK_WIDTH));
    fireEvent.keyDown(splitter(), { key: 'End' });
    expect(splitter()).toHaveAttribute('aria-valuenow', splitter().getAttribute('aria-valuemax'));
  });

  it('double-click resets to the default', () => {
    const onWidth = vi.fn();
    render(<Harness onWidth={onWidth} />);
    fireEvent.keyDown(splitter(), { key: 'ArrowLeft' });
    fireEvent.doubleClick(splitter());
    expect(onWidth).toHaveBeenLastCalledWith(null);
    expect(splitter()).toHaveAttribute('aria-valuenow', String(DEFAULT_CHORD_DOCK_WIDTH));
  });
});
