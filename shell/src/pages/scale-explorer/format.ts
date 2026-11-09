/** Small text formatters shared by the summary, tables, and copied results. */

/** Round to two decimals and drop trailing zeros. */
export const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

/** Integer with an explicit plus sign for positives. */
export const sgn = (v: number) => (v > 0 ? `+${v}` : String(v));

/** One decimal with an explicit sign and a true minus. */
export const sgn1 = (v: number) =>
  `${v >= 0 ? '+' : '−'}${(Math.round(Math.abs(v) * 10) / 10).toFixed(1)}`;

/** "1 + 2 − 3" style sum of signed terms. */
export const joinSigned = (arr: number[]) =>
  arr.map((v, i) => (i === 0 ? String(v) : v < 0 ? `− ${-v}` : `+ ${v}`)).join(' ');

const ord = (x: number) => `${x}${x === 2 ? 'nd' : x === 3 ? 'rd' : 'th'}`;

export const expansionLabel = (e: number) =>
  e === 0 ? 'adjacent notes' : `every ${ord(e + 1)} note`;

/** Name of an inversion axis: the pitch-class pair it runs between, or the gap it bisects. */
export function axisLabel(q: number, names: string[]): string {
  if (q % 2 === 0) {
    const a = q / 2;
    return `${names[a]}–${names[(a + 6) % 12]}`;
  }
  const a = (q - 1) / 2;
  return `between ${names[a]} and ${names[(a + 1) % 12]}`;
}

export const TIP_RANGE_VS_EXPECTED =
  "Range vs Expected: compares this set's fifths brightness range (highest minus lowest among its modes) with what is typical for sets of the same size AND the same number of notes with a P5 above. Positive means wider than expected, negative narrower. Measured in standard deviations of the scatter around that expectation: beyond ±1 is wide or narrow, and in between is typical.";

export const TIP_RANGE_VS_SIZE =
  "Range vs Size Average: the z-score of this set's fifths brightness range among all sets of the same size. It is the range minus the average range for that size, divided by the standard deviation for that size. 0 is average, +1 is one standard deviation wider, and −1 is one narrower. It ignores P5 count, so it answers the simpler question of how wide this range is for its size.";

export const widthWord = (z: number) => (z >= 1 ? 'wide' : z <= -1 ? 'narrow' : 'typical');
