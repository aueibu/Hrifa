import { readFileSync, writeFileSync } from 'node:fs';
const [tpl, data, out] = process.argv.slice(2);
const json = readFileSync(data, 'utf8').trim();
JSON.parse(json);
writeFileSync(out, readFileSync(tpl, 'utf8').replace('/*DATA*/null', json));
console.log('ok', out);
