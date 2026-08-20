/** Counts, per interval class, how many dyads formed with `hoverPitch` have that difference. */
export function computeHoverCounts(
  pitches: number[],
  hoverPitch: number | null
): Map<number, number> {
  const counts = new Map<number, number>();
  if (hoverPitch === null) {
    return counts;
  }
  pitches.forEach((p) => {
    if (p === hoverPitch) {
      return;
    }
    const d = Math.abs(p - hoverPitch);
    counts.set(d, (counts.get(d) || 0) + 1);
  });
  return counts;
}

export function formatHoverCounts(hoverCounts: Map<number, number>): string {
  if (hoverCounts.size === 0) {
    return 'hover counts: —';
  }
  const parts = Array.from(hoverCounts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([d, c]) => `${d}(${c})`);
  return `hover counts: ${parts.join(' ')}`;
}
