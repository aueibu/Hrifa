// Usage: node inject-findings.mjs <findings-page2.template.html> <findings.json from extract-findings2.mjs> <out.html>
// Fills /*DATA*/null with the JSON and /*MIXVIEW*/ with ../browse/mixview.js (the compound-mix view shared with the browse page).
import { readFileSync, writeFileSync } from 'node:fs';
const [tpl, data, out] = process.argv.slice(2);
const t = readFileSync(tpl, 'utf8');
const mix = readFileSync(new URL('../browse/mixview.js', import.meta.url), 'utf8');
if (!t.includes('/*DATA*/null') || !t.includes('/*MIXVIEW*/')) throw new Error('template is missing a slot');
if (/<\/script/i.test(mix)) throw new Error('mixview.js contains </script');
writeFileSync(out, t.replace('/*MIXVIEW*/', () => mix).replace('/*DATA*/null', () => readFileSync(data, 'utf8').replace(/</g, '\\u003c')));
console.log('ok');
