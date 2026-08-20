/**
 * `offset` rotates the whole mapped hue spread. It was 240 (pure blue),
 * which is the darkest-reading part of the HSL wheel at a given L/S, so
 * whichever interval class landed on it read as muddy in both schemes.
 * Shifted -30° to 210 (azure), off the darkest zone.
 */
const HUE_OFFSET = 210;

/**
 * Each successive interval class steps by the golden angle (360° × the
 * fractional golden ratio, ≈222.5° the long way / ≈137.5° the short way)
 * instead of `360 / count`. A plain even division puts ic(i) and ic(i+1)
 * only `360/count` apart — next-door on the wheel, so neighbors can still
 * read as similar. The previous fix for that was a half-circle-spread with
 * an alternating +180° flip, meant to send neighbors to opposite sides of
 * the wheel — but it aliased for even `count` (12-EDO's 6 classes, the
 * common case): the last class's flip landed it back on the first class's
 * hue, so ic1 and ic6 rendered identically instead of separated. The golden
 * angle gets the same "neighbors land far apart" property without that
 * failure mode: it's irrational relative to any circle division, so no
 * integer number of steps ever lands back on a previous hue, for any count.
 */
const GOLDEN_ANGLE = 360 * 0.6180339887498949;

export function hueForInterval(interval: number, edoSteps: number): number {
  const N = Math.max(1, Math.round(edoSteps || 1));
  const d = Math.abs(interval) % N;
  const ic = Math.min(d, N - d);
  const count = Math.ceil(N / 2);
  if (count <= 1) {
    return HUE_OFFSET % 360;
  }
  const index = Math.max(0, ic - 1);
  return (HUE_OFFSET + index * GOLDEN_ANGLE) % 360;
}

/**
 * The source app's original 40%-base progression (`40 + octave * 6`) was
 * tuned for a design where these marks were thin outlines/text next to a lot
 * of black ink, not filled dots and chip borders competing with a near-white
 * surface — at 40% lightness with 60% saturation they read as muddy rather
 * than as a clear hue. `isDark` shifts the baseline further still (64%) so
 * marks stay light-on-dark instead of dark-on-dark; both octave steps are a
 * bit smaller than the original 6 since there's less headroom left to the
 * lightness ceiling once the baseline itself is higher.
 */
export function intervalLightness(interval: number, baseSteps: number, isDark = false): number {
  const steps = Math.max(1, Math.round(baseSteps || 1));
  const octave = Math.floor(Math.abs(interval) / steps);
  const base = isDark ? 64 : 52;
  const step = isDark ? 4 : 5;
  const ceiling = isDark ? 92 : 95;
  const raw = base + octave * step;
  return Math.max(20, Math.min(ceiling, raw));
}

export function intervalColor(interval: number, baseSteps: number, isDark = false): string {
  const N = Math.max(1, Math.round(baseSteps || 1));
  const hue = hueForInterval(interval, N);
  const lightness = intervalLightness(interval, baseSteps || N, isDark);
  return `hsl(${hue}, 60%, ${lightness}%)`;
}
