# LOCKS

Shared paths currently being edited by an active arc. An arc never edits another arc's owned paths; for a shared path it takes a row here first. The orchestrator writes the rows, not the builder (builders never take locks: if the arc does not already hold a lock its milestone needs, the builder stops and reports).

Standing shared paths (always need a lock): `package.json`, `yarn.lock`, `vite.config.mjs`, `src/Router.tsx`, `src/data/applets.ts`, the `src/pages/<Name>.page.tsx` entry files, `src/theme/`, `src/components/` (shared components), the `oxfmt`/`oxlint` configs, `.claude/agents/`, the `CLAUDE.md` files. Also arc-specific shared paths (PianoRoll, desk, settings, ...). The shared coordination docs (`DECISIONS.md`, `BACKLOG.md`, and this file) need no lock for adding or removing your own rows or items. All arcs share one checkout and branch, so a row here is visible to every session immediately.

## Protocol
1. Before editing a shared path, add a row: path, arc, since (date), reason. Then re-read this file: if another arc wrote a row for the same path, the earlier row wins, or the human decides. A page folder with no active arc is a shared path too (lock, `DECISIONS.md` row, human OK).
2. If the path is already locked by another arc, wait or ask the human. Do not edit it.
3. Remove your row only AFTER the path has been committed (the orchestrator commits at the end of the milestone with a path-scoped `git add` and `git commit -- <paths>`, never a bare `git commit`; on an `index.lock` error retry and never delete the lock; then removes the row, still in the same milestone). Never release a lock on uncommitted work.
4. A stale row (its arc is finished or abandoned) is removed only by the human, or by the orchestrator of the arc that needs the path after the human OKs it.

Adding or removing your own row needs no lock on this file; any session may `git add` it, and another session's rows riding along in someone's commit is accepted. Row format: one table row per locked path, under the `Active locks` table header: `| path | arc (workstream folder) | since (YYYY-MM-DD) | reason |`. Example:

`| src/theme/ | tunings | 2026-11-20 | add a tuning-mark color role |`

## Active locks
| Path | Arc | Since | Reason |
| ---- | --- | ----- | ------ |
| src/Router.tsx | harmonic-field-lab | 2026-11-13 | M6: retire the /harmonic-field-lab/mock route |
