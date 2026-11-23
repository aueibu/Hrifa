// Builds the findings page and its data files from the durable findings JSON (extract-findings2.mjs) and the Z-pair JSON
// (extract-zpairs2.mjs). The whole data set (about 97 MB) does not fit one page (16 MB), so the large tables go to files
// beside it, fetched when a panel needs them:
//   data/best-n<n>-L<L>.json  per set with that largest interval: smoothest-ordering roughness and ordering index per
//                             window, both rules ({ idx, equal, shared, equalOrd, sharedOrd }; idx = set index in best.sets)
//   data/zpairs-<c>.json      producers of Z pairs c*CHUNK .. c*CHUNK+CHUNK-1 ([[chord A producers], [chord B producers]])
//   data/top-chords.json      producers of chordIndex.topChords, in order
// Orderings are not shipped (the page rebuilds them with the catalog's orderingsOf; checked equal on every set).
// Usage: node build-findings-page.mjs <findings-page2.template.html> <findings.json> <zpairs.json> <core bundle (IIFE)> <out dir>
// Build the core bundle from shell/ with:
//   npx esbuild arcs/interval-placement/m2c/browse/core.ts --bundle --format=iife --platform=browser --outfile=<core.js>
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [tpl, dataFile, zFile, coreFile, outDir] = process.argv.slice(2);
const CHUNK = 100;
const t = readFileSync(tpl, 'utf8');
const mix = readFileSync(new URL('../browse/mixview.js', import.meta.url), 'utf8');
const core = readFileSync(coreFile, 'utf8');
for (const slot of ['/*DATA*/null', '/*MIXVIEW*/', '/*CORE*/', '/*ZPAIRS*/null']) if (!t.includes(slot)) throw new Error(`template is missing ${slot}`);
for (const x of [mix, core]) if (/<\/script/i.test(x)) throw new Error('injected code contains </script');

const J = JSON.parse(readFileSync(dataFile, 'utf8'));
const Z = JSON.parse(readFileSync(zFile, 'utf8'));
const dataDir = join(outDir, 'data');
mkdirSync(dataDir, { recursive: true });
const files = [];
// Write a file only when its content changed: the output folder is synced by Google Drive, which hard-links every
// freshly written file until it has uploaded, and a publish of a file with two names needs the full consent dialog
// (2026-11-23). Unchanged files keep their single name and need no new upload.
let written = 0;
const writeIfChanged = (path, s) => { if (existsSync(path) && readFileSync(path, 'utf8') === s) return; writeFileSync(path, s); written++; };
const put = (name, obj) => { const s = JSON.stringify(obj); writeIfChanged(join(dataDir, name), s); files.push([name, s.length]); };

// ---- findings: per-set tables out, sets and first windows stay ----
const page = { provenance: J.provenance, n: J.n, compound: J.compound };
for (const n of J.n) {
  const { best, ...rest } = J[n];
  const byL = new Map();
  best.sets.forEach((s, i) => { const L = Math.max(...s.split(' ').map(Number)); (byL.get(L) || byL.set(L, []).get(L)).push(i); });
  for (const [L, idx] of byL) put(`best-n${n}-L${L}.json`, { idx, ...Object.fromEntries(['equal', 'shared', 'equalOrd', 'sharedOrd'].map((k) => [k, idx.map((i) => best[k][i])])) });
  page[n] = { ...rest, best: { sets: best.sets, w0: best.w0 } };
}
// ---- chord index: summary and top lists stay, top chords' producers out ----
if (J.chordIndex) {
  const { topChords, ...ci } = J.chordIndex;
  page.chordIndex = { ...ci, topChords: topChords.map(({ producers, ...c }) => c) };
  put('top-chords.json', topChords.map((c) => c.producers));
}
// ---- Z pairs: shapes and producer counts per set size stay, producers out in chunks ----
const zPage = {
  sources: Z.sources, classes: Z.classes, chunk: CHUNK,
  ns: [...new Set(Z.groups.flatMap((g) => g.chords.flatMap((c) => c.producers.map((p) => p.n))))].sort((a, b) => a - b),
  groups: Z.groups.map((g) => ({ content: g.content, chords: g.chords.map((c) => {
    const made = {};
    for (const p of c.producers) made[p.n] = (made[p.n] || 0) + 1;
    return { shape: c.shape, made };
  }) })),
};
for (let c = 0; c * CHUNK < Z.groups.length; c++) put(`zpairs-${c}.json`, Z.groups.slice(c * CHUNK, (c + 1) * CHUNK).map((g) => g.chords.map((ch) => ch.producers)));

const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const html = t.replace('/*MIXVIEW*/', () => mix).replace('/*CORE*/', () => core).replace('/*DATA*/null', () => json(page)).replace('/*ZPAIRS*/null', () => json(zPage));
writeIfChanged(join(outDir, 'index.html'), html);
const keep = new Set(files.map(([f]) => f));
for (const f of readdirSync(dataDir)) if (!keep.has(f)) { rmSync(join(dataDir, f)); console.log('removed stale', f); }
const big = files.reduce((m, f) => (f[1] > m[1] ? f : m), ['', 0]);
console.log(`index.html ${(html.length / 1e6).toFixed(2)} MB; ${files.length} data files, ${(files.reduce((s, f) => s + f[1], 0) / 1e6).toFixed(1)} MB, largest ${big[0]} ${(big[1] / 1e6).toFixed(2)} MB; ${written} file(s) written, the rest unchanged`);
writeIfChanged(join(outDir, 'files.json'), JSON.stringify(Object.fromEntries(files.map(([f]) => [`data/${f}`, join(dataDir, f)]))));
