# shell/ working notes

(The repo-root `CLAUDE.md` still applies. This file adds workflow rules for `shell/`.)

## Multi-milestone tasks

When a task is driven by an `ARC.md` (template: `ARC.template.md`):

1. Read `ARC.md` and `PROGRESS.md` first, including after any compaction. Resume from `PROGRESS.md`'s "Next action".
2. Delegate by role: `scout` to locate things, `builder` to implement one milestone, `reviewer` to check it. Models are fixed in `.claude/agents/*.md`; do not override them.
3. Never advance a milestone while `corepack yarn check:workbench` fails.
4. Update `PROGRESS.md` after every milestone step.
5. Stop and ask at every milestone marked "Human checkpoint" and on any "Stop-and-ask" condition. Otherwise keep going without asking.

## Checks

- Workbench work is gated by `corepack yarn check:workbench` (typecheck, format, lint, stylelint and vitest, scoped to `src/pages/composition-workbench`). Do not use the repo-wide `yarn test` as a gate: other areas carry unrelated failures.
- If `corepack` is not on PATH, run `node .yarn/releases/yarn-4.18.0.cjs run check:workbench` from `shell/`.
- Node 25+ breaks jsdom's `localStorage`; `vite.config.mjs` passes `--no-experimental-webstorage` to avoid this. Don't remove it.
- Line endings are LF (`.editorconfig`, `.gitattributes`). Write LF.
