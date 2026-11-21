import { interference, harmonicity, periodicity, paretoFront, DEFAULT_TIMBRE } from '../../../src/lib/consonance/index';
const C2 = 65.406, L = 36, d = [11, 7, 16];
const sets = new Map<string, number[]>();
for (let a = 0; a + d[0] <= L; a++) for (let b = 0; b + d[1] <= L; b++) for (let c = 0; c + d[2] <= L; c++) {
  const s = [...new Set([a, a + d[0], b, b + d[1], c, c + d[2]])].sort((x, y) => x - y);
  sets.set(s.join(','), s);
}
const all = [...sets.values()];
const sample = all.filter((_, i) => i % 20 === 0);
const hz = (s: number[]) => s.map((x) => C2 * 2 ** (x / 12));
const time = (name: string, f: (s: number[]) => number) => { const t = performance.now(); const v = sample.map((s) => f(s)); console.log(name, ((performance.now() - t) / sample.length).toFixed(2), 'ms/voicing', 'distinct values', new Set(v.map((x) => x.toFixed(4))).size, '/', sample.length); return v; };
const hk = time('H&K', (s) => interference(hz(s), DEFAULT_TIMBRE).total);
const hpc = time('harm pc', (s) => harmonicity(hz(s), { space: 'pitch-class' }).value);
const hp = time('harm pitch', (s) => harmonicity(hz(s), { space: 'pitch' }).value);
const per = time('periodicity', (s) => periodicity(hz(s)).value);
console.log('distinct pitch-class sets among', all.length, 'voicings:', new Set(all.map((s) => [...new Set(s.map((x) => x % 12))].sort((a, b) => a - b).join(','))).size);
const counts: Record<number, number> = {}; all.forEach((s) => (counts[s.length] = (counts[s.length] || 0) + 1)); console.log('note counts', counts);
const f1 = paretoFront(sample.map((_, i) => [hk[i], -hp[i]]) as any); console.log('Pareto (H&K vs pitch harmonicity) on sample of', sample.length, ':', f1.length, 'points');
const f2 = paretoFront(sample.map((_, i) => [hk[i], per[i]]) as any); console.log('Pareto (H&K vs periodicity):', f2.length);
const f3 = paretoFront(sample.map((_, i) => [hk[i], -hp[i], per[i]]) as any); console.log('Pareto 3D:', f3.length);
