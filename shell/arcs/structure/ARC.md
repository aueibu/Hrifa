# ARC: Multi-arc structure for shell/

## Goal
Several arcs (the composition workbench, a new tunings applet under `src/pages/`, later others) can run at the same time, each with its own ARC.md and PROGRESS.md, while every arc still sees the project-wide context and makes decisions that are recorded where the other arcs will read them. Docs and instruction files only: no application code changes.

## Parameters
- Human decisions (2026-11-12): concurrent arcs wanted; the tunings applet lives under `src/pages/` with its own folder; each page keeps its own `ARCHITECTURE.md`; a shell-level `ARCHITECTURE.md` is the shared map; cross-project decisions go to `DECISIONS.md`.
- Target layout:
  ```
  shell/
    CLAUDE.md                 workflow rules + "several arcs" rules
    .claude/agents/*.md       builder / reviewer / scout: arc folder comes from the task prompt
    ARCHITECTURE.md           NEW shell-level map (layers, shared components, shared contracts, who consumes what)
    DECISIONS.md              NEW cross-project decisions log
    BACKLOG.md                shared, items tagged [workbench] [tunings] [shared]
    ARC.template.md  PROGRESS.template.md
    arcs/
      LOCKS.md                shared paths currently being edited by an active arc
      workbench/              PROGRESS.md (no active arc) + archives ARC.desk.md ARC.clips.md PROGRESS.desk.md PROGRESS.clips.md
      structure/              this arc, archived here when finished
  ```
- Concurrency rules to write into `shell/CLAUDE.md` and the templates:
  1. A task names its arc folder (`arcs/<name>`). The orchestrator passes that path to every agent. Agents read only that arc's ARC.md/PROGRESS.md as the work log.
  2. Every ARC.md declares `Owned paths` (the page folder, its tests, its own ARCHITECTURE.md, anything new it creates), `Shared paths it may touch` (PianoRoll, theme, desk, settings, shell ARCHITECTURE.md, DECISIONS.md, BACKLOG.md ...) and its scoped `Check command` (a `check:<arc>` script defined in package.json when the arc is created; the workbench keeps `check:workbench`).
  3. An arc never edits another arc's owned paths.
  4. Before editing a shared path an arc takes a line in `arcs/LOCKS.md` (path, arc, since, reason) and removes it when done. If the path is locked by another arc, wait or ask the human.
  5. Every arc starts with a context scan milestone (C0): read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/`, and `arcs/LOCKS.md`.
  6. A decision that touches shared code or a shared contract (pitch/tuning representation, time, PianoRoll behaviour, theme, desk/edit contract) is appended to `DECISIONS.md` (id, date, arc, decision, why, affects, status) in the same milestone.
  7. The reviewer has a standing question: did this change touch something another arc reads, is it recorded in DECISIONS.md, and are the other consumers updated or logged in BACKLOG.md?
  8. (Human decision 2026-11-12: SAME CHECKOUT.) Concurrent arcs run as separate sessions in this one checkout on one branch, so `arcs/LOCKS.md`, `DECISIONS.md`, `BACKLOG.md` and every arc's PROGRESS are visible to all immediately. Each arc commits only the paths it owns or holds a lock on (path-scoped `git add`, never `git add -A`); `DECISIONS.md` ids are arc-prefixed (e.g. `W-12`, `T-3`). Worktrees stay optional for risky shared work; if one is used, the coordination files are read and written only in the main checkout, and the gitignored `.claude/agents/*.md` and root `CLAUDE.md` must be copied into the new worktree.
  9. The human decides conflicts.
  10. Standing shared paths (always need a lock): `package.json`, `yarn.lock`, `vite.config.mjs`, `src/Router.tsx`, `src/data/applets.ts`, the `src/pages/<Name>.page.tsx` entry files, `src/theme/`, `src/components/` (shared components), `oxfmt`/`oxlint` configs, `.claude/agents/`, `CLAUDE.md` files. Append-only docs (`DECISIONS.md`, `BACKLOG.md`) need no lock for appends. New-arc setup (under a lock on `package.json`): create the arc's `check:<arc>` script before its first code milestone.
  11. `arcs/<name>/` is a workstream folder (e.g. `workbench`, `tunings`): it holds the active ARC.md/PROGRESS.md plus archived finished arcs as `ARC.<topic>.md` / `PROGRESS.<topic>.md`; starting a new arc in a workstream first archives the previous one. BACKLOG tags = workstream folder name or `[shared]`. A one-off arc such as `structure` is its own workstream folder.
  12. The orchestrator (not the builder) writes `arcs/LOCKS.md` rows and the PROGRESS "Shared touches" line. If a task names no arc folder, the orchestrator asks the human. An abandoned arc's lock is released by the human or by the orchestrator of the arc that needs the path after the human OKs it. Builders never edit ARC.md/PROGRESS.md and never commit; every human decision is written back into the arc's ARC.md by the orchestrator.
- Gate: no code changes, so no vitest gate; the reviewer checks references and consistency. `package.json` must not change.

- Procedure rules added after the whole-arc review (orchestrator defaults for the human to confirm at the checkpoint):
  13. Commit timing and locks: each arc's orchestrator commits at the end of every milestone (path-scoped `git add` of its owned paths and the shared paths it holds a lock on); a lock row is removed ONLY AFTER that path has been committed. The append-only shared docs (`DECISIONS.md`, `BACKLOG.md`, `arcs/LOCKS.md`) need no lock to add or remove your own rows/items; any session may `git add` them, and another session's rows riding along in someone's commit is accepted.
  14. Shared gate: every `check:<arc>` runs the project-wide `tsc --noEmit`, so an unfinished edit by another arc can turn your gate red. If the gate is red only because of files outside your owned and locked paths, it is not yours to fix: stop, report, and wait for that arc's next commit or the human's decision (rule 3 of the workflow does not oblige you to repair other arcs' files).
  15. New check scripts are created with `vitest run --passWithNoTests src/pages/<x>` and stylelint `--allow-empty-input`, so a new arc's check can be green before it has code; the template precondition says so.
  16. Starting a new arc (procedure): the human names the workstream and goal; the orchestrator creates `arcs/<name>/`, drafts `ARC.md` from the template (Owned/Shared paths, Check command, C0) and the human approves it before C0; setup order: take the `package.json` lock, add `check:<arc>` (the orchestrator may edit `package.json` for this and nothing else), commit, release; page registration locks (Router, applets.ts, entry file) are taken in the first code milestone; DECISIONS ids use a unique prefix registered in the arc's first DECISIONS row (e.g. W workbench, S structure, T tunings); agents given an arc folder without an `ARC.md` stop and report instead of defaulting; builders never take locks: if the arc does not already hold a needed lock they stop and report.

- Checkpoint decisions (human, 2026-11-12, M2 checkpoint): rules 13-16 confirmed ("that works for me"). Orchestrator defaults added after the final review, for the human to veto later: (a) commits use `git commit -- <paths>` (never a bare `git commit`: sessions share one index); on an `index.lock` error retry, never delete the lock; (b) a page folder with no active arc is a shared path (lock, DECISIONS row, human OK) before another arc edits it; (c) rule 14 covers errors caused by another arc's change wherever `tsc` reports them (including in your own files): do not rewrite your files to fit someone else's unfinished change; (d) before committing a change to shared components/theme, also run the consuming arcs' check (see 'Who consumes what', e.g. `check:workbench`); (e) after writing a lock row re-read `arcs/LOCKS.md`: on a duplicate the earlier row wins or the human decides; (f) new check scripts use `--no-error-on-unmatched-pattern` for oxfmt and oxlint (they fail on a missing folder otherwise) in addition to `--passWithNoTests` and stylelint `--allow-empty-input`.

## Preconditions
- Working tree clean (`WORKFLOW_HANDOFF.md` is tracked now: commit 3041593).

## Non-goals
- No application code. No change to the workbench's own `ARCHITECTURE.md` content beyond fixing links. Do not create the tunings arc or its page.

## Milestones

### M1: Structure, rules, templates, agents
- Create `arcs/`, `arcs/LOCKS.md` (table with columns and the protocol above), and `git mv` `ARC.desk.md`, `ARC.clips.md`, `PROGRESS.desk.md`, `PROGRESS.clips.md` into `arcs/workbench/` (archived text unchanged). Create `arcs/workbench/PROGRESS.md` ("no active arc; last finished: clips arc; read BACKLOG.md and the archives here").
- Do NOT touch the root `ARC.md`/`PROGRESS.md`: they are this arc's active work log and move to `arcs/structure/` in the Final step.
- `BACKLOG.md`: add the tag convention at the top and tag every existing item `[workbench]` (or `[shared]` where it concerns PianoRoll/theme/desk generally).
- Rewrite `shell/CLAUDE.md` to the multi-arc workflow. Keep every existing rule (delegation by role, models fixed in agents and not overridden, never advance a milestone while the arc's check fails, update PROGRESS after every step, human checkpoints and stop-and-ask, workbench check notes including the corepack fallback `node .yarn/releases/yarn-4.18.0.cjs run check:workbench`, the Node 25 jsdom note, LF line endings) and add the twelve concurrency rules (nine original + same-checkout rule 8, standing shared paths, workstream folders, who writes locks; attempt 2 aligned all live files).
- Root `CLAUDE.md` ('New: shell/' paragraph): one sentence pointing at `shell/CLAUDE.md`, `shell/ARCHITECTURE.md`, `shell/DECISIONS.md` and `shell/arcs/`.
- `.claude/agents/builder.md`, `reviewer.md`, `scout.md`: the arc folder is given in the task prompt (default `arcs/workbench` only if the prompt names none; say so); read its ARC.md/PROGRESS.md; also read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `arcs/LOCKS.md`; run the arc's Check command; respect Owned/Shared paths and locks; the reviewer gets the cross-arc question; the scout reads `shell/ARCHITECTURE.md` first and the page's own `ARCHITECTURE.md`. Do not change `model:` fields or tool lists.
- `ARC.template.md`: add `Owned paths`, `Shared paths it may touch`, `Check command`, and a mandatory first milestone `C0: Context scan`. `PROGRESS.template.md`: add `Shared touches (locks taken)`. Update the layout parts of `WORKFLOW_HANDOFF.md` (tracked; commit it with this arc).
- Acceptance: every file above exists/updated; `git grep` finds no live instruction (CLAUDE.md files, agents, templates, BACKLOG.md, `arcs/workbench/PROGRESS.md`) that still presents a root-level `ARC.md`/`PROGRESS.md` as THE active arc without an arc folder (this arc's own files and archived files are exempt); archived files keep their text unchanged; `package.json` untouched.
- Human checkpoint after: no

### M2: Shell-level map and decisions log
- `shell/ARCHITECTURE.md` (new, concise, derived from the code and the workbench `ARCHITECTURE.md`, not invented):
  - what `shell/` is and how it relates to the legacy portal/applets;
  - layers: theme, shared components (PianoRoll/VelocityLane/EditorPalette ...), pages, per-page `ARCHITECTURE.md`;
  - the shared contracts every arc must respect: pitch representation (midicents; the roll's rows fixed at 12-EDO and ignoring the `edo` setting, which only colours notes and drives pitch-class material; note labels), time (exact rationals in quarter notes), selection/edit conventions of the PianoRoll (opt-in props), theming rules (THEMING.md roles), data-contract basics (kind/domain/frame/provenance) with links into the workbench `ARCHITECTURE.md`, persistence boundaries (workbench key prefix, per-viewer keys outside it);
  - a 'who consumes what' table (Melodicization, Mixer, NoteClipEditor ...);
  - 'Where a new page plugs in' (routing, page folder, `ARCHITECTURE.md`, scoped check script), written from the actual code;
  - an explicit 'Tunings and pitch' section: today's assumptions a tunings arc is likely to change (12-row roll, 100-midicent steps in keyboard edits, octave 1200, `edo` setting scope) with file pointers.
  - List claims you could not verify against the code.
- `DECISIONS.md` (new): id, date, arc, decision, why, affects, status. Seed it with the cross-cutting decisions already made in `arcs/workbench/ARC.clips.md` and the workbench `ARCHITECTURE.md` (midicents and rational time, 12-EDO roll vs edo setting, unified roll+lane panel and single-truth scroll, selection/edit contract, same-pitch overlap rule, per-viewer preferences outside history/projects, clip properties in `metadata.clip`), each with what it affects.
- Acceptance: both files exist; every file/path they cite exists (reviewer greps); the 'Tunings and pitch' claims are verified against the code; DECISIONS.md entries trace to the archive text.
- Human checkpoint after: yes

## Final step
Move this ARC.md and its PROGRESS.md to `arcs/structure/` (git mv), leave no root-level ARC.md/PROGRESS.md (templates stay), run `reviewer` over the full diff, then commit.

## Stop-and-ask conditions
- Any change outside docs/instruction files, or to `package.json`.
- A rule here conflicts with an existing rule in `shell/CLAUDE.md` or the agent files in a way that needs the human to choose.

## Budget
Max 2 builder attempts per milestone, then stop and report.
