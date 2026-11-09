import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const { getComputedStyle } = window;
window.getComputedStyle = (elt) => getComputedStyle(elt);
window.HTMLElement.prototype.scrollIntoView = () => {};

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserver;

// React Flow reads node transforms through DOMMatrixReadOnly, which jsdom does not provide.
class DOMMatrixReadOnly {
  m22;
  constructor(transform) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale ? Number(scale) : 1;
  }
}

window.DOMMatrixReadOnly = DOMMatrixReadOnly;

// Real browsers always set `event.view` on mouse events; user-event leaves it null, which breaks
// d3-drag (used by React Flow) the moment a draggable card is pressed.
// Stub the drag behaviour itself: tests never drag cards, and user-event's mousedown has no
// `view`, which d3-drag dereferences. Every chained call returns the same inert object.
vi.mock('d3-drag', () => {
  const noop = () => {};
  const inert = new Proxy(noop, { get: () => inert, apply: () => inert });
  return { drag: () => inert, dragDisable: noop, dragEnable: noop };
});
