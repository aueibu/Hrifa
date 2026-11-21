// Usage: node inject.mjs <required-page.template.html> <core bundle (IIFE)> <out.html>
// Fills /*CORE*/ with the worker bundle. Build it from shell/ with:
// node node_modules/esbuild/bin/esbuild arcs/interval-placement/required/core.ts --bundle --format=iife --platform=browser --outfile=<core.js>
import { readFileSync, writeFileSync } from 'node:fs';
const [tpl, core, out] = process.argv.slice(2);
const t = readFileSync(tpl, 'utf8');
const js = readFileSync(core, 'utf8');
if (!t.includes('/*CORE*/')) throw new Error('template is missing /*CORE*/');
if (/<\/script/i.test(js)) throw new Error('injected code contains </script');
writeFileSync(out, t.replace('/*CORE*/', () => js));
console.log('ok');
