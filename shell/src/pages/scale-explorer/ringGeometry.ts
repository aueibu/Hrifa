/** Shared geometry for the pitch ring and the small per-mode rings. Pitch class 0 sits at 12 o'clock, running clockwise. */

export type Point = [number, number];

export function ringPoint(pc: number, cx: number, cy: number, r: number): Point {
  const a = ((pc * 30 - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** SVG arc path along the circle of radius `r` from pitch class `x` to the next one. */
export function semitoneArc(x: number, cx: number, cy: number, r: number): string {
  const a = ringPoint(x, cx, cy, r);
  const b = ringPoint((x + 1) % 12, cx, cy, r);
  return `M${a[0]} ${a[1]} A${r} ${r} 0 0 1 ${b[0]} ${b[1]}`;
}

export interface FifthLine {
  from: number;
  /** 'ok' joins a note to its fifth above; 'no' is a stub with a bar when the fifth is missing. */
  kind: 'ok' | 'no';
  d: string;
}

/**
 * One mark per note in `set`: an arrow to the note a perfect fifth above when that note is also in the set,
 * otherwise a short stub capped with a bar.
 */
export function fifthLines(
  set: ReadonlySet<number>,
  at: (pc: number) => Point,
  rn: number,
  stubLen: number,
  cap: number,
  bend: number
): FifthLine[] {
  const out: FifthLine[] = [];
  for (let x = 0; x < 12; x++) {
    if (!set.has(x)) {
      continue;
    }
    const y = (x + 7) % 12;
    const p = at(x);
    const q = at(y);
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const sx = p[0] + ux * rn;
    const sy = p[1] + uy * rn;
    if (set.has(y)) {
      const ex = q[0] - ux * (rn + 1.5);
      const ey = q[1] - uy * (rn + 1.5);
      const cx = (sx + ex) / 2 + nx * len * bend;
      const cy = (sy + ey) / 2 + ny * len * bend;
      out.push({ from: x, kind: 'ok', d: `M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}` });
    } else {
      const ex = p[0] + ux * (rn + stubLen);
      const ey = p[1] + uy * (rn + stubLen);
      out.push({
        from: x,
        kind: 'no',
        d: `M${sx} ${sy} L${ex} ${ey} M${ex + nx * cap} ${ey + ny * cap} L${ex - nx * cap} ${ey - ny * cap}`,
      });
    }
  }
  return out;
}
