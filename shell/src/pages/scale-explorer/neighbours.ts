/** Layout and summary for the "Modal Neighbors" chart: modes placed by fifths brightness, linked by how many notes differ. */
import { linkInfo, type Mode } from './pitchSets';

export const CHART_WIDTH = 420;

export interface PathNode {
  mode: Mode;
  index: number;
  fs: number;
  lvl: number;
  x: number;
  y: number;
}

export interface PathLink {
  a: PathNode;
  b: PathNode;
  d: number;
  /** SVG path, or null when the two nodes line up vertically and a straight line is drawn instead. */
  curve: string | null;
  line: [number, number, number, number] | null;
}

export interface PathLayout {
  width: number;
  height: number;
  /** Largest link distance shown. */
  shown: number;
  /** Largest link distance that exists for this set size. */
  maxD: number;
  nodes: PathNode[];
  links: PathLink[];
  /** Pairs of modes at each note-distance 1..6 (index 0 unused). */
  counts: number[];
  /** Brightness-ordered neighbouring pairs that differ by exactly one note. */
  chainOk: number;
  pairTotal: number;
  perfect: boolean;
  gaps: number[];
  summary: string;
  /** One-line text used in the copied results. */
  text: string;
}

const PAD_X = 30;
const GAP = 26;
const LEVEL = 44;

export function pathLayout(view: Mode[], pathMax: number, width = CHART_WIDTH): PathLayout | null {
  if (view.length < 2) {
    return null;
  }
  const n0 = view[0].z.length;
  const maxD = Math.min(6, n0 - 1);
  const shown = Math.max(1, Math.min(pathMax, maxD));
  const base = 24 + Math.min(130, 10 + (width - 2 * PAD_X) * 0.2 * (shown > 1 ? 1 : 0.4));
  const nodes: PathNode[] = view.map((mode, index) => ({
    mode,
    index,
    fs: mode.fs,
    lvl: 0,
    x: 0,
    y: 0,
  }));
  const fmin = Math.min(...nodes.map((n) => n.fs));
  const fmax = Math.max(...nodes.map((n) => n.fs));
  nodes.forEach((n) => {
    n.x = fmax === fmin ? width / 2 : PAD_X + ((n.fs - fmin) / (fmax - fmin)) * (width - 2 * PAD_X);
  });
  const order = [...nodes].sort((a, b) => a.fs - b.fs || a.mode.k - b.mode.k);
  let maxLvl = 0;
  order.forEach((n, idx) => {
    const used = new Set<number>();
    for (let q = 0; q < idx; q++) {
      if (Math.abs(order[q].x - n.x) < GAP) {
        used.add(order[q].lvl);
      }
    }
    while (used.has(n.lvl)) {
      n.lvl++;
    }
    maxLvl = Math.max(maxLvl, n.lvl);
  });
  nodes.forEach((n) => {
    n.y = base + LEVEL * n.lvl;
  });
  const height = base + LEVEL * maxLvl + 34;

  const counts = [0, 0, 0, 0, 0, 0, 0];
  const pairs: { a: PathNode; b: PathNode; d: number }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = linkInfo(nodes[i].mode, nodes[j].mode).d;
      if (d >= 1 && d <= 6) {
        counts[d]++;
      }
      if (d >= 1 && d <= shown) {
        pairs.push({ a: nodes[i], b: nodes[j], d });
      }
    }
  }
  pairs.sort((p, q) => q.d - p.d);
  const links: PathLink[] = pairs.map(({ a, b, d }) => {
    const dx = Math.abs(a.x - b.x);
    if (dx < 1) {
      return { a, b, d, curve: null, line: [a.x, a.y + 11, b.x, b.y - 11] };
    }
    const y1 = a.y - 12;
    const y2 = b.y - 12;
    const h = Math.min(base - 14, 10 + dx * 0.2);
    const cy = Math.min(y1, y2) - h * 2;
    return { a, b, d, curve: `M${a.x} ${y1} Q${(a.x + b.x) / 2} ${cy} ${b.x} ${y2}`, line: null };
  });

  let chainOk = 0;
  const gaps: number[] = [];
  for (let i = 0; i + 1 < order.length; i++) {
    if (linkInfo(order[i].mode, order[i + 1].mode).one) {
      chainOk++;
    }
    gaps.push(order[i + 1].fs - order[i].fs);
  }
  const pairTotal = order.length - 1;
  const summary = `${chainOk} of ${pairTotal} neighbouring pairs in brightness order differ by one note`;
  return {
    width,
    height,
    shown,
    maxD,
    nodes,
    links,
    counts,
    chainOk,
    pairTotal,
    perfect: chainOk === pairTotal,
    gaps,
    summary,
    text: `Modal neighbors: ${summary}; steps ${gaps.join(', ')}`,
  };
}
