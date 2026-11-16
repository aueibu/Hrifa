/**
 * Colors of the Pairs panel's Interval coloring (pure; no React). A cell's fill is a continuous hue wheel made by
 * mixing neighboring `--mark-<hue>` roles in oklch (red, orange, yellow, green, cyan, blue, violet, pink and back to
 * red), then a share of that mixed into the panel color. No hex values: the roles carry the per-scheme tuning, and the
 * strength runs from TINT_MIN to TINT_MAX in the lib (about the Modes grid's 40 to 55%), and is capped per hue (HUE_CAP) so the cell text, always `--text`, keeps 4.5:1 in both schemes (see pairsColor.test.ts).
 */
export const WHEEL_ORDER = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'violet',
  'pink',
] as const;

/** The mark roles that bracket wheel position `pos` (0 to 1, one turn) and the share of the second one. */
export function wheelSegment(pos: number): { a: string; b: string; f: number } {
  const n = WHEEL_ORDER.length;
  const t = (((pos % 1) + 1) % 1) * n;
  const i = Math.floor(t);
  return { a: WHEEL_ORDER[i % n], b: WHEEL_ORDER[(i + 1) % n], f: t - i };
}

/** The wheel color at `pos`, before it is thinned into the panel. */
export function wheelColor(pos: number): string {
  const { a, b, f } = wheelSegment(pos);
  const pct = Math.round((1 - f) * 100);
  return pct >= 100
    ? `var(--mark-${a})`
    : `color-mix(in oklch, var(--mark-${a}) ${pct}%, var(--mark-${b}))`;
}

/**
 * The strongest share of each hue that keeps `--text` at 4.5:1 on it in the dark scheme (the light scheme allows more
 * than TINT_MAX for every hue), measured with the method of pairsColor.test.ts and rounded down with a margin.
 * Dark limits: yellow 0.34, green 0.38, cyan 0.39, orange 0.43, violet 0.43, pink 0.49, red and blue about 0.55.
 */
export const HUE_CAP: Record<(typeof WHEEL_ORDER)[number], number> = {
  red: 0.54,
  orange: 0.41,
  yellow: 0.32,
  green: 0.36,
  cyan: 0.37,
  blue: 0.54,
  violet: 0.41,
  pink: 0.47,
};

/** The strength cap at wheel position `pos`: the lower cap of the two bracketing hues (a mix is never lighter than its darker part allows). */
export function strengthCap(pos: number): number {
  const { a, b } = wheelSegment(pos);
  return Math.min(HUE_CAP[a as keyof typeof HUE_CAP], HUE_CAP[b as keyof typeof HUE_CAP]);
}

/** A cell fill: the wheel color at `pos`, `strength` (0 to 1, limited by the hue's cap) of it mixed into the panel color. */
export function wheelFill(pos: number, strength: number): string {
  const s = Math.min(strength, strengthCap(pos));
  return `color-mix(in srgb, ${wheelColor(pos)} ${Math.round(s * 100)}%, var(--panel))`;
}
