import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasWebGL, resetWebGLProbe } from './webgl';

describe('hasWebGL', () => {
  let probes = 0;
  let lost = 0;
  let creates: ReturnType<typeof vi.spyOn>;
  const stubCanvas = (gl: unknown) => {
    creates = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') {
        return Document.prototype.createElement.call(document, tag);
      }
      probes++;
      return { width: 300, height: 150, getContext: () => gl } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);
  };
  beforeEach(() => {
    probes = 0;
    lost = 0;
    resetWebGLProbe();
    (window as unknown as { WebGLRenderingContext: unknown }).WebGLRenderingContext =
      function () {};
  });
  afterEach(() => {
    creates?.mockRestore();
    delete (window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext;
    resetWebGLProbe();
  });

  it('is false where the browser has no WebGL (jsdom), without making a canvas', () => {
    delete (window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext;
    stubCanvas(null);
    expect(hasWebGL()).toBe(false);
    expect(probes).toBe(0);
  });

  it('probes once, remembers the answer, and releases the probe context', () => {
    stubCanvas({ getExtension: () => ({ loseContext: () => lost++ }) });
    expect(hasWebGL()).toBe(true);
    expect(hasWebGL()).toBe(true);
    expect(hasWebGL()).toBe(true);
    expect(probes).toBe(1);
    expect(lost).toBe(1);
  });

  it('remembers a negative answer too, and survives a context that throws', () => {
    stubCanvas(null);
    expect(hasWebGL()).toBe(false);
    expect(hasWebGL()).toBe(false);
    expect(probes).toBe(1);
    resetWebGLProbe();
    creates.mockRestore();
    creates = vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(hasWebGL()).toBe(false);
  });
});
