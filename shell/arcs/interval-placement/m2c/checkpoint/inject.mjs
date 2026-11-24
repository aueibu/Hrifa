// Fill the checkpoint page template: rank.js (without its export line) and the data from build-checkpoint.ts.
// Usage: node inject.mjs <template> <rank.js> <data.json> <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
const [tpl, rank, data, out] = process.argv.slice(2);
const json = readFileSync(data, 'utf8').trim();
JSON.parse(json);
const rankJs = readFileSync(rank, 'utf8').split('\n').filter((l) => !l.startsWith('export ')).join('\n');
const page = readFileSync(tpl, 'utf8').replace('/*RANK*/', () => rankJs).replace('/*DATA*/null', () => json);
writeFileSync(out, page);
console.log('ok', out, page.length);
