/** Is WebGL available? Kept apart from three.js so the page can check it without loading the library (jsdom has none). */
export function hasWebGL(): boolean {
  if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') {
    return false;
  }
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}
