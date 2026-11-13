/**
 * Is WebGL available? Kept apart from three.js so the page can check it without loading the library (jsdom has none).
 * The answer is a property of the browser, so it is probed once; the probe's context is released at once (browsers cap
 * the number of live WebGL contexts, and a leaked probe would count against the 3D lattice's own).
 */
let cached: boolean | undefined;

export function hasWebGL(): boolean {
  if (cached !== undefined) {
    return cached;
  }
  if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') {
    cached = false;
    return cached;
  }
  try {
    const probe = document.createElement('canvas');
    const gl = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null;
    cached = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    probe.width = 0;
    probe.height = 0;
  } catch {
    cached = false;
  }
  return cached;
}

/** Forget the probe result (tests only). */
export function resetWebGLProbe(): void {
  cached = undefined;
}
