# ARC: <short title>

Copy to `arcs/<name>/ARC.md` and fill in (with `PROGRESS.template.md` as `arcs/<name>/PROGRESS.md`). `<name>` is a workstream folder (e.g. `workbench`, `tunings`); if it already holds an active arc, archive that first as `ARC.<topic>.md` / `PROGRESS.<topic>.md`. The orchestrator re-reads this file after every compaction. The task prompt names the arc folder; agents read only that folder's ARC.md/PROGRESS.md as the work log, and stop and report if the folder has no ARC.md. Starting a new arc (human names workstream and goal, orchestrator drafts this file, human approves before C0, then the `check:<arc>` setup under a `package.json` lock, right after approval and before C0; the setup commit includes `arcs/<name>/` and `package.json`): see `shell/CLAUDE.md`, "Several arcs at once", rule 16.

## Goal
<One paragraph: what exists when this is done, and why.>

## Parameters
<Fixed inputs and constraints, e.g. module(s) touched, musical/domain parameters, data-contract rules, performance or UX limits.>

- Owned paths: <the page folder, its tests, its own `ARCHITECTURE.md`, anything new this arc creates except the page's entry file `src/pages/<Name>.page.tsx`, which is a standing shared path. No other arc edits these. A page folder with no active arc counts as a shared path for the other arcs.>
- Shared paths it may touch: <list those this arc needs. Standing shared paths (always need a row in `arcs/LOCKS.md` while edited, written by the orchestrator): `package.json`, `yarn.lock`, `vite.config.mjs`, `src/Router.tsx`, `src/data/applets.ts`, the `src/pages/<Name>.page.tsx` entry files, `src/theme/`, `src/components/` (shared components), the `oxfmt`/`oxlint` configs, `.claude/agents/`, the `CLAUDE.md` files. Also e.g. PianoRoll, desk, settings, `shell/ARCHITECTURE.md`. `DECISIONS.md`/`BACKLOG.md`/`arcs/LOCKS.md` need no lock for adding or removing your own rows or items.>
- Check command: <`corepack yarn check:<arc>`, a scoped script in `package.json`. The orchestrator creates it, under a lock on `package.json`, at new-arc setup before the first code milestone (the workbench keeps `check:workbench`).>
- Concurrency: same checkout and branch as the other arcs; the orchestrator commits at the end of every milestone with path-scoped `git add <paths>` and `git commit -- <paths>` only (never `git add -A` or a bare `git commit`; on an `index.lock` error retry, never delete the lock) and removes lock rows only after that commit; after writing a lock row re-read `arcs/LOCKS.md` (on a duplicate the earlier row wins, or the human decides); before committing a shared-component or theme change also run the consuming arcs' check (`shell/ARCHITECTURE.md`, "Who consumes what"); use an arc-prefixed `DECISIONS.md` id (e.g. `T-1`; the prefix is unique and registered in this arc's first `DECISIONS.md` row). A worktree is optional for risky shared work (copy the gitignored `.claude/` and root `CLAUDE.md` into it).

## Preconditions
- The arc's `Check command` exists (created by the orchestrator under a `package.json` lock at new-arc setup, before the first code milestone) and is green before the first code milestone starts. If missing or red, stop and report. A new `check:<arc>` script is created with `vitest run --passWithNoTests src/pages/<x>`, stylelint `--allow-empty-input` and `--no-error-on-unmatched-pattern` on both `oxfmt` and `oxlint` (they exit non-zero on a missing folder), so it can be green before the arc has code. Its `tsc --noEmit` step is project-wide: if the check is red only because of files outside this arc's Owned and locked paths, it (or an error caused by another arc's change, wherever `tsc` reports it, even in your own files) is not this arc's to fix: do not rewrite your files to fit another arc's unfinished change; stop, report, wait for the other arc's commit or the human.

## Non-goals
<What must not change or be started.>

## Milestones
Each milestone is small enough for one builder run and has criteria a command or test can check.

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/`, and `arcs/LOCKS.md`. Also note which other pages import from your paths (e.g. scale-explorer imports composition-workbench): changing exported APIs there is a cross-arc change. Record in PROGRESS.md what other arcs own, what is locked, and any decision or backlog item that affects this arc.
- Acceptance:
  - [ ] PROGRESS.md notes the scan result (other arcs, locks, relevant decisions/backlog)
- Human checkpoint after: no

### M1: <name>
- Scope: <files/modules>
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] <specific test or command proving behavior, e.g. "interference(3,4) yields [3,1,2,2,1,3]">
  - [ ] Any decision touching shared code or a shared contract is appended to `DECISIONS.md` in this milestone
- Human checkpoint after: yes / no  <!-- yes for anything judged by eye or ear -->

### M2: <name>
- Scope:
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] 
- Human checkpoint after: yes / no

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned paths or Shared paths, or to `shell/ARCHITECTURE.md` or the page's own `ARCHITECTURE.md` contracts.
- A shared path needed is locked by another arc in `arcs/LOCKS.md`.
- Any decision about look, sound, or musical taste not specified above.

## Budget
Max 2 builder attempts per milestone; then stop and report.
