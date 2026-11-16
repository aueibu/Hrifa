// Fast, changed-files-only check: `corepack yarn check:fast [options] [files...]`.
//
// Runs format check, lint, stylelint and `vitest related` on ONLY the files you changed (git diff against HEAD plus
// untracked files), or on the files you name. It is the loop to use while building; the arc's `check:<arc>` gate still
// runs once per milestone. Not a gate: it does not typecheck unless asked.
//
// Options:  --types          also run `tsc --noEmit` (project-wide, slow)
//           --since <ref>    changed files since <ref> instead of HEAD
//           --no-tests       skip vitest
//           --tests-only     vitest related only (what `test:related` runs)
//           --workers <n>    vitest workers (default 4, or VITEST_MAX_WORKERS)
//
// Why a wrapper around `vitest related`: on Windows, vitest 4 compares the paths you give it to test module ids with `===`.
// Module ids carry the on-disk letter case (C:/Data Files/Projects/...), your cwd may not (C:/data files/...), so plain
// `vitest related` silently finds nothing and exits 0. This script resolves every file with realpathSync.native first.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const skipValues = new Set([valueOf('--since'), valueOf('--workers')].filter(Boolean));
const named = args.filter((a) => !a.startsWith('--') && !skipValues.has(a));

const major = Number(process.versions.node.split('.')[0]);
if (major !== 24) {
  console.warn(
    `warning: Node ${process.versions.node} (this repo pins 24; vitest is unreliable on other majors)`
  );
}

const run = (cmd, cmdArgs, env = {}) =>
  spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
const capture = (cmd, cmdArgs) =>
  spawnSync(cmd, cmdArgs, { encoding: 'utf8', shell: false })
    .stdout.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

// 1. Which files.
let files = named;
if (files.length === 0) {
  const since = valueOf('--since') ?? 'HEAD';
  files = [
    ...capture('git', ['diff', '--name-only', '--relative', since, '--', '.']),
    ...capture('git', ['ls-files', '--others', '--exclude-standard']),
  ];
}
files = [...new Set(files)].filter((f) => existsSync(f));
const code = files.filter((f) => /\.(ts|tsx)$/.test(f));
const css = files.filter((f) => /\.css$/.test(f));
if (code.length === 0 && css.length === 0) {
  console.log('check:fast: no changed .ts/.tsx/.css files. Nothing to check.');
  process.exit(0);
}
console.log(`check:fast: ${code.length} code file(s), ${css.length} css file(s)`);

// 2. Steps. All run even if one fails, so one pass shows everything.
const results = [];
const step = (name, fn) => {
  const started = Date.now();
  const ok = fn();
  results.push({ name, ok, s: ((Date.now() - started) / 1000).toFixed(1) });
};
const q = (list) => list.map((f) => `"${f}"`);

if (flag('--types')) step('tsc', () => run('npm', ['run', 'typecheck']).status === 0);
if (code.length && !flag('--tests-only')) {
  step(
    'format',
    () => run('oxfmt', ['-c', 'oxfmt.config.mjs', '--check', ...q(code)]).status === 0
  );
  step('lint', () => run('oxlint', ['-c', 'oxlint.config.mjs', ...q(code)]).status === 0);
}
if (css.length && !flag('--tests-only'))
  step('stylelint', () => run('stylelint', [...q(css), '--cache']).status === 0);
if (code.length && !flag('--no-tests')) {
  // On-disk casing, forward slashes: the form vitest uses for module ids.
  const related = code.map((f) => realpathSync.native(resolve(f)).replace(/\\/g, '/'));
  const workers = valueOf('--workers') ?? process.env.VITEST_MAX_WORKERS ?? '4';
  step(
    'vitest related',
    () =>
      run('vitest', ['related', '--run', '--passWithNoTests', ...q(related)], {
        VITEST_MAX_WORKERS: workers,
      }).status === 0
  );
}

// 3. Summary.
console.log('\ncheck:fast summary');
for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name} (${r.s}s)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
