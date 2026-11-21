import { readFileSync, writeFileSync } from 'node:fs';
const [tpl, core, out] = process.argv.slice(2);
const js = readFileSync(core, 'utf8');
if (/<\/script/i.test(js)) throw new Error('core contains </script');
writeFileSync(out, readFileSync(tpl, 'utf8').replace('/*CORE*/', () => js));
console.log('ok');
