// Usage: node inject-findings.mjs <findings-page2.template.html> <findings.json from extract-findings2.mjs> <core bundle (IIFE)> <out.html>
// Fills /*DATA*/null with the JSON, /*MIXVIEW*/ with ../browse/mixview.js (the compound-mix view shared with the browse page)
// and /*CORE*/ with the browse page's worker bundle (builds and scores every chord in a heatmap tile). Build the bundle from
// shell/ with: npx esbuild arcs/interval-placement/m2c/browse/core.ts --bundle --format=iife --platform=browser --outfile=<core.js>
import { readFileSync, writeFileSync } from 'node:fs';
const [tpl, data, core, out] = process.argv.slice(2);
const t = readFileSync(tpl, 'utf8');
const mix = readFileSync(new URL('../browse/mixview.js', import.meta.url), 'utf8');
const js = readFileSync(core, 'utf8');
for (const slot of ['/*DATA*/null', '/*MIXVIEW*/', '/*CORE*/']) if (!t.includes(slot)) throw new Error(`template is missing ${slot}`);
for (const x of [mix, js]) if (/<\/script/i.test(x)) throw new Error('injected code contains </script');
writeFileSync(out, t.replace('/*MIXVIEW*/', () => mix).replace('/*CORE*/', () => js).replace('/*DATA*/null', () => readFileSync(data, 'utf8').replace(/</g, '\\u003c')));
console.log('ok');
