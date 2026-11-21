// Usage: node inject-core.mjs <browse-page.template.html> <core bundle (IIFE)> <out.html>
// Fills /*CORE*/ (the worker source) and /*MIXVIEW*/ (mixview.js, next to this script).
import { readFileSync, writeFileSync } from 'node:fs';
const [tpl, core, out] = process.argv.slice(2);
const js = readFileSync(core, 'utf8');
const mix = readFileSync(new URL('./mixview.js', import.meta.url), 'utf8');
for (const x of [js, mix]) if (/<\/script/i.test(x)) throw new Error('injected code contains </script');
writeFileSync(out, readFileSync(tpl, 'utf8').replace('/*CORE*/', () => js).replace('/*MIXVIEW*/', () => mix));
console.log('ok');
