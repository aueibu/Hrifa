# shell/ working notes

(The repo-root `CLAUDE.md` still applies. This file adds workflow rules for `shell/`.)

## Layout

- `ARCHITECTURE.md`: shell-level map (layers, shared components, shared contracts, who consumes what). Each page keeps its own `ARCHITECTURE.md`; where a rule says `shell/ARCHITECTURE.md` it means this shell-level one, never a page's.
- `DECISIONS.md`: cross-project decisions log.
- `BACKLOG.md`: shared backlog; each item is tagged with its workstream folder name (`[workbench]`, `[tunings]`, ...) or `[shared]`.
- `ARC.template.md`, `PROGRESS.template.md`: copy into `arcs/<name>/` to start an arc.
- `arcs/LOCKS.md`: shared paths currently being edited by an active arc.
- `arcs/<name>/`: a workstream folder (e.g. `workbench`, `tunings`). It holds the active `ARC.md` and `PROGRESS.md` plus archived finished arcs as `ARC.<topic>.md` / `PROGRESS.<topic>.md`. Starting a new arc in a workstream first archives the previous one (rename its files to `<topic>`). A one-off arc such as `structure` is its own workstream folder. `arcs/workbench/` has no active arc (finished one-off arcs sit beside the workstream folders: `arcs/structure/` holds the finished multi-arc structure arc, and `arcs/workbench/` holds the finished clips and desk arcs); its archives are `ARC.desk.md`, `ARC.clips.md`, `PROGRESS.desk.md`, `PROGRESS.clips.md`.

## Multi-milestone tasks

Several arcs can run at the same time. When a task is driven by an arc (template: `ARC.template.md`):

1. A task names its arc folder (`arcs/<name>`). If it names none, the orchestrator asks the human. The orchestrator passes that path to every agent it launches. Read only that arc's `ARC.md` and `PROGRESS.md` as the work log, first, including after any compaction. Resume from that `PROGRESS.md`'s "Next action". If the named folder has no `ARC.md`, stop and report (agents do not fall back to another arc; the only default is `arcs/workbench`, and only when `arcs/workbench/ARC.md` exists and the prompt names no folder).
2. Delegate by role: `scout` to locate things, `builder` to implement one milestone, `reviewer` to check it. Models are fixed in `.claude/agents/*.md`; do not override them.
3. Never advance a milestone while the arc's `Check command` fails (the workbench arc: `corepack yarn check:workbench`).
4. Update the arc's `PROGRESS.md` after every milestone step. Nothing in `ARC.md`/`PROGRESS.md` is written by builders, reviewers or scouts: the orchestrator does it.
   - At the end of every milestone the orchestrator commits with path-scoped `git add` and `git commit -- <paths>` (owned paths plus the shared paths the arc holds a lock on; never a bare `git commit`), and only then removes the lock rows (rule 13 below).
   - If the gate is red only because of files outside the arc's owned and locked paths, it is not yours to fix (rule 14 below).
5. Stop and ask at every milestone marked "Human checkpoint" and on any "Stop-and-ask" condition. Otherwise keep going without asking.
6. Checkpoint decisions: every human decision is written back into the arc's `ARC.md` by the orchestrator (a "Checkpoint decisions" bullet under the milestone) before building on it.

## Several arcs at once

1. Task names its arc folder (`arcs/<name>`); see rule 1 above. Agents read only that arc's `ARC.md`/`PROGRESS.md` as the work log.
2. Every `ARC.md` declares `Owned paths` (the page folder, its tests, its own `ARCHITECTURE.md`, anything new it creates), `Shared paths it may touch` (see rule 10) and its scoped `Check command` (a `check:<arc>` script in `package.json`; the workbench keeps `check:workbench`).
3. An arc never edits another arc's owned paths. A page folder with no active arc (e.g. `src/pages/composition-workbench/` today) is a shared path: before another arc edits it, it takes a lock, adds a `DECISIONS.md` row and gets the human's OK.
4. Before editing a shared path an arc takes a row in `arcs/LOCKS.md` (path, arc, since, reason) and removes it only AFTER that path has been committed (rule 13). If the path is locked by another arc, wait or ask the human. Before committing a change to shared components or the theme, also run the consuming arcs' check (see "Who consumes what" in `ARCHITECTURE.md`, e.g. `check:workbench`).
5. Every arc starts with a context scan milestone (C0): read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/`, and `arcs/LOCKS.md`. Also note which other pages import from your paths (e.g. scale-explorer imports composition-workbench): changing exported APIs there is a cross-arc change.
6. A decision that touches shared code or a shared contract (pitch/tuning representation, time, PianoRoll behaviour, theme, desk/edit contract) is appended to `DECISIONS.md` (columns: id, date, arc, decision, why, affects, status, source) in the same milestone.
7. The reviewer has a standing question: did this change touch something another arc reads, is it recorded in `DECISIONS.md`, and are the other consumers updated or logged in `BACKLOG.md`?
8. Same checkout: concurrent arcs run as separate sessions in this one checkout on one branch, so `arcs/LOCKS.md`, `DECISIONS.md`, `BACKLOG.md` and every arc's `PROGRESS.md` are visible to all immediately. Each arc commits only the paths it owns or holds a lock on (path-scoped `git add <paths>` and `git commit -- <paths>`, never `git add -A`, `git add .` or a bare `git commit`: sessions share one index; on an `index.lock` error retry, never delete the lock). `DECISIONS.md` ids are arc-prefixed (e.g. `W-12`, `T-3`). Worktrees stay optional for risky shared work; if one is used, read and write the coordination files only in the main checkout, and copy the gitignored files into the worktree (see "Per-checkout files" below).
9. The human decides conflicts.
10. Standing shared paths (always need a lock): `package.json`, `yarn.lock`, `vite.config.mjs`, `src/Router.tsx`, `src/data/applets.ts`, the `src/pages/<Name>.page.tsx` entry files, `src/theme/`, `src/components/` (shared components), the `oxfmt`/`oxlint` configs, `.claude/agents/`, and the `CLAUDE.md` files. The shared coordination docs (`DECISIONS.md`, `BACKLOG.md`, `arcs/LOCKS.md`) need no lock for adding or removing your own rows or items (rule 13). New-arc setup, under a lock on `package.json`: create the arc's `check:<arc>` script before its first code milestone (rule 16).
11. Workstream folders and tags: see Layout. BACKLOG tags are the workstream folder name or `[shared]`.
12. The orchestrator (not the builder) writes `arcs/LOCKS.md` rows and the `PROGRESS.md` "Shared touches" line. After writing a lock row, re-read `arcs/LOCKS.md`: if another arc wrote a row for the same path, the earlier row wins, or the human decides. An abandoned arc's lock is released by the human, or by the orchestrator of the arc that needs the path after the human OKs it. Builders never edit `ARC.md`/`PROGRESS.md` and never commit.
13. Commit timing and locks: each arc's orchestrator commits at the end of every milestone (path-scoped `git add` and `git commit -- <paths>` of its owned paths and the shared paths it holds a lock on; never a bare `git commit`, on an `index.lock` error retry and never delete the lock). A lock row is removed ONLY AFTER that path has been committed. `DECISIONS.md`, `BACKLOG.md` and `arcs/LOCKS.md` need no lock for adding or removing your own rows or items; any session may `git add` them, and another session's rows riding along in someone's commit is accepted.
14. Shared gate: every `check:<arc>` runs the project-wide `tsc --noEmit`, so an unfinished edit by another arc can turn your gate red. If the gate is red only because of files outside your owned and locked paths, or because of an error caused by another arc's change wherever `tsc` reports it (including in your own files), it is not yours to fix: do not rewrite your files to fit someone else's unfinished change; stop, report, and wait for that arc's next commit or the human's decision (workflow rule 3 does not oblige you to repair other arcs' files).
15. New check scripts are created so they can be green before the arc has code: `vitest run --passWithNoTests src/pages/<x>`, stylelint `--allow-empty-input`, and `--no-error-on-unmatched-pattern` on both `oxfmt` and `oxlint` (they exit non-zero on a missing folder otherwise); the template precondition says so.
16. Starting a new arc: the human names the workstream and the goal; the orchestrator creates `arcs/<name>/`, drafts `ARC.md` from the template (Owned/Shared paths, Check command, C0) and the human approves it before C0. Setup order: setup happens right after the human approves `ARC.md` and BEFORE C0: take the `package.json` lock, add `check:<arc>` (the orchestrator may edit `package.json` for this and nothing else), commit (the setup commit includes `arcs/<name>/` and `package.json`), release the lock. Page registration locks (`src/Router.tsx`, `src/data/applets.ts`, the entry file) are taken in the first code milestone. The new page's entry file `src/pages/<Name>.page.tsx` is a standing shared path, not an owned path, even though the arc creates it. `DECISIONS.md` ids use a unique prefix registered in the arc's first row (e.g. W workbench, S structure, T tunings). Agents given an arc folder without an `ARC.md` stop and report instead of defaulting. Builders never take locks: if the arc does not already hold a lock the milestone needs, they stop and report.

## Per-checkout files

`.claude/` (agents) and the root `CLAUDE.md` are gitignored: they exist per checkout and are not in a fresh clone or a new worktree. Do not rely on them being there; copy them into any new worktree. `WORKFLOW_HANDOFF.md` section 5 holds copies of the agent definitions (kept in step with `.claude/agents/*.md`).

## Checks

- Each arc is gated by its own scoped `Check command` from its `ARC.md`. Do not use the repo-wide `yarn test` as a gate: other areas carry unrelated failures.
- Test-run policy: while building, builders run only the tests of the files they touched. Reviewers do not run the gate; they read the diff and may run a single targeted test file. The orchestrator runs the arc's `Check command` once at the end of each milestone (or attempt). Never run the whole suite after every edit.
- Workbench work is gated by `corepack yarn check:workbench`: `npm run typecheck` (`tsc --noEmit`, NOT scoped: it covers the whole project), then format, lint, stylelint and vitest scoped to `src/pages/composition-workbench` (see rule 14).
- If `corepack` is not on PATH, run `node .yarn/releases/yarn-4.18.0.cjs run check:workbench` from `shell/` (same pattern for another arc's `check:<arc>`).
- Node 25+ breaks jsdom's `localStorage`; `vite.config.mjs` passes `--no-experimental-webstorage` to avoid this. Don't remove it.
- Line endings are LF (`.editorconfig`, `.gitattributes`). Write LF.
