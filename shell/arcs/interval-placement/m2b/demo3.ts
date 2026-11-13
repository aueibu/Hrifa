import { interference, harmonicity, paretoFront, DEFAULT_TIMBRE } from '../../../src/lib/consonance/index';
const C2 = 65.406, L = 36, d = [11, 7, 16];
const sets = new Map<string, number[]>();
for (let a = 0; a + d[0] <= L; a++) for (let b = 0; b + d[1] <= L; b++) for (let c = 0; c + d[2] <= L; c++) {
  const s = [...new Set([a, a + d[0], b, b + d[1], c, c + d[2]])].sort((x, y) => x - y);
  sets.set(s.join(','), s);
}
const grp = [...sets.values()].filter((s) => s.length === 6 && s[0] === 0);
const hz = (s: number[]) => s.map((x) => C2 * 2 ** (x / 12));
const pts = grp.map((s) => [interference(hz(s), DEFAULT_TIMBRE).total, harmonicity(hz(s), { space: 'pitch' }).value]);
let rest = pts.map((p, i) => ({ p, i })); const layers: number[] = [];
while (rest.length) { const f = paretoFront(rest.map((r) => r.p), ['min', 'max']); layers.push(f.length); const fs = new Set(f); rest = rest.filter((_, k) => !fs.has(k)); }
console.log('6-note voicings with bottom note fixed at C2:', grp.length, '; first front', layers[0], 'points; layers', layers.length, 'sizes', layers.slice(0, 8).join(' '));
const f0 = paretoFront(pts, ['min', 'max']); console.log('front:', f0.map((i) => `[${grp[i]}] hk ${pts[i][0].toFixed(3)} hp ${pts[i][1].toFixed(3)}`).join(' | '));
