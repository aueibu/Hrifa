# Workflow handoff: ARC-driven work with builder / reviewer / scout agents

A portable description of the workflow used on the Hrifa composition workbench, plus ready-to-copy files and a bootstrap prompt. Use it to set the same structure up in another project once it passes roughly "a few modules and more than one session of work".

## 1. What this is, in one paragraph

Big work is written down as an **ARC** (goal, constraints, small milestones with checkable acceptance criteria). A **PROGRESS** file records state so any session can resume from disk instead of memory. The main session is an **orchestrator**: it never writes feature code itself. It hands each milestone to a **builder** (cheaper model), has a **reviewer** (stronger model, read-only) check the diff, runs one **scoped gate** command, updates PROGRESS, and **stops for the human** at checkpoints judged by eye, ear or taste. Decisions the human makes are written back into the ARC immediately so they survive compaction and new sessions.

## 2. Files to create

```
<project>/
  CLAUDE.md                      # workflow rules (section 4)
  arcs/<name>/ARC.md             # one folder per arc (from ARC.template.md); several arcs can run at once
  arcs/<name>/PROGRESS.md        # that arc's state (from PROGRESS.template.md)
  arcs/LOCKS.md                  # shared paths currently being edited by an active arc
  ARC.template.md  PROGRESS.template.md
  ARCHITECTURE.md                # shell-level map + shared contracts; each area keeps its own too
  DECISIONS.md                   # cross-project decisions log (id, date, arc, decision, why, affects, status, source)
  BACKLOG.md                     # shared, items tagged per workstream folder or [shared]
  .claude/agents/builder.md      # section 5
  .claude/agents/reviewer.md
  .claude/agents/scout.md
  package.json                   # a scoped "check:<area>" script (section 6)
  .editorconfig  .gitattributes  # pin line endings (LF) if on Windows
```

A single-arc project can keep `ARC.md` / `PROGRESS.md` at the root. With concurrent arcs (as in Hrifa `shell/`), each arc gets `arcs/<name>/`, declares Owned paths, Shared paths and its own Check command, takes a line in `arcs/LOCKS.md` before editing a shared path, starts with a context-scan milestone (C0), and logs shared-contract decisions in `DECISIONS.md`; concurrent arcs run as separate sessions in the same checkout on one branch (locks, decisions and PROGRESS are visible to all; commit with path-scoped `git add` and `git commit -- <paths>`, never `git add -A` or a bare `git commit`, retry on `index.lock` and never delete it; arc-prefixed decision ids; the orchestrator writes the lock rows; worktrees are optional, and `.claude/` plus the root `CLAUDE.md` are gitignored so they must be copied into a new worktree or clone) and the human decides conflicts. `arcs/<name>/` is a workstream folder. Archive a finished arc inside its folder (e.g. `arcs/<name>/ARC.<topic>.md` / `PROGRESS.<topic>.md`, commit it), then start the next from the templates.

## 3. Roles and models

| Role | Model | Tools | Job |
| --- | --- | --- | --- |
| Orchestrator (main session) | Sonnet for routine work; Opus for design discussions | all | Read ARC/PROGRESS, brief agents, run the gate once, update PROGRESS, commit, talk to the human |
| builder | Sonnet | all | Implement exactly one milestone, with tests, inside its scope |
| reviewer | Opus | read-only (Read, Grep, Glob, Bash) | Check the diff against the ARC and contracts; find data-loss, contract and scope bugs |
| scout | Haiku | read-only | Locate things, answer "where/how" questions concisely |

Why these models (measured on the Hrifa session, about $30 for 5 hours and about 6,700 lines): the reviewer was about 8% of usage and caught real data-loss bugs the builder's passing tests missed every time (two-tab corruption, a project-open race, a refused edit reported as success). Builders were about 22%. About two thirds of the cost was the long main conversation re-reading its own history on every message. So: keep the reviewer strong, keep builders on Sonnet, keep the main session cheap, and start fresh sessions often (section 8).

## 4. CLAUDE.md snippet (paste into the project's CLAUDE.md)

```markdown
## Multi-milestone tasks

When a task is driven by an `ARC.md` (template: `ARC.template.md`):

1. Read `ARC.md` and `PROGRESS.md` first, including after any compaction. Resume from `PROGRESS.md`'s "Next action".
2. Delegate by role: `scout` to locate things, `builder` to implement one milestone, `reviewer` to check it. Models are fixed in `.claude/agents/*.md`; do not override them.
3. Never advance a milestone while `<GATE COMMAND>` fails.
4. Update `PROGRESS.md` after every milestone step.
5. Stop and ask at every milestone marked "Human checkpoint" and on any "Stop-and-ask" condition. Otherwise keep going without asking.
6. Write every human decision back into `ARC.md` (a "Checkpoint decisions" bullet under the milestone) before building on it.

## Test-run policy

- Builders run only the test files they touched while iterating, then the gate once at the very end.
- Reviewers read the diff and do not run the gate.
- The orchestrator runs the gate once before a milestone advances.
- Never run the whole suite after every edit.

## Checks

- Work is gated by `<GATE COMMAND>` (typecheck, format, lint, stylelint, tests, scoped to `<AREA PATH>`). Do not use the repo-wide test command as a gate if other areas carry unrelated failures.
- Line endings are LF; write LF.
```

## 5. Agent definitions

Copies of the current `.claude/agents/*.md` of Hrifa `shell/` (verbatim; keep them in step when those files change). Adapt names and paths when copying to another project.

### `.claude/agents/builder.md`

```markdown
---
name: builder
description: Implements exactly one milestone from an arc's ARC.md in shell/. Must pass the arc's Check command before reporting done. Use for all code-writing delegation.
model: sonnet
---

You implement one milestone at a time.

0. The arc folder (`arcs/<name>`) is given in the task prompt. If the named folder has no `ARC.md`, stop and report: do not fall back to another arc. Only if the prompt names no folder at all, default to `arcs/workbench` and say so in your report, and only when `arcs/workbench/ARC.md` exists (otherwise stop and report). Never read or write another arc's ARC.md/PROGRESS.md as your work log.
1. Read that arc's `ARC.md` (your milestone, its acceptance criteria, its Owned paths, Shared paths and Check command) and `PROGRESS.md`. Also read `shell/ARCHITECTURE.md`, `shell/DECISIONS.md` and `shell/arcs/LOCKS.md`, and the page's own `ARCHITECTURE.md` (for the workbench, `src/pages/composition-workbench/ARCHITECTURE.md`) if you touch its data flow.
2. Follow `shell/src/theme/THEMING.md` for any color work (use roles, not hex or palette shades).
3. Write tests alongside logic modules, matching the existing colocated `*.test.ts` style.
4. While iterating, run only the tests of the files you touched. Run the arc's `Check command` from `shell/` (workbench: `corepack yarn check:workbench`) once, at the end. Fix failures. Do not report done while it fails; report any failure plainly, with its output. If it is red only because of files outside your arc's Owned paths and locked shared paths (its typecheck is project-wide), do not fix those files, and do not rewrite your own files to fit another arc's unfinished change (this includes errors caused by another arc's change wherever `tsc` reports them): stop and report.
5. Stay inside the milestone's scope and the arc's Owned paths. Never edit another arc's owned paths. Before editing a shared path, check `arcs/LOCKS.md`: you never take or release a lock yourself. If your arc does not already hold a row for that path (or another arc holds it), stop and report. If something outside the scope needs changing, or a criterion can't be met, stop and report instead of improvising.
6. A decision that touches shared code or a shared contract goes into `shell/DECISIONS.md` in the same milestone (arc-prefixed id), if the milestone allows editing it.
7. Never edit the arc's `ARC.md` or `PROGRESS.md`, never write `arcs/LOCKS.md` rows (the orchestrator does), and never commit (the orchestrator commits with `git commit -- <paths>`).

Report: files changed, test result (pass/fail with the failing output if any), criteria met/unmet, and any decision you made that the ARC did not cover.
```

### `.claude/agents/reviewer.md`

```markdown
---
name: reviewer
description: Read-only reviewer. Checks a milestone's diff against the arc's ARC.md acceptance criteria and `ARCHITECTURE.md` contracts (shell-level and the page's own). Use after the builder reports done, before marking a milestone complete.
model: opus
tools: Read, Grep, Glob, Bash
---

You review; you do not edit.

0. The arc folder (`arcs/<name>`) is given in the task prompt. If the named folder has no `ARC.md`, stop and report: do not fall back to another arc. Only if the prompt names no folder at all, default to `arcs/workbench` and say so in your report, and only when `arcs/workbench/ARC.md` exists (otherwise stop and report).
1. Read the milestone's acceptance criteria in that arc's `ARC.md`, plus its `PROGRESS.md`, Owned paths, Shared paths and Check command. Also read `shell/ARCHITECTURE.md`, `shell/DECISIONS.md` and `shell/arcs/LOCKS.md`.
2. Inspect the diff (`git diff`, `git status`, untracked files). Do NOT run the arc's `Check command` or the full suite (the orchestrator runs it once per milestone); you may run a single targeted test file if needed. Read the code, not just test names.
3. Check each criterion explicitly: met / not met / cannot verify by script (flag these for the human).
4. Check data-contract compliance against the page's `ARCHITECTURE.md` (for the workbench, `src/pages/composition-workbench/ARCHITECTURE.md`: kind/domain/frame, provenance preserved) and `THEMING.md` for color.
5. Look for correctness bugs and scope creep beyond the milestone, including edits outside the arc's Owned paths and Shared paths, and shared paths edited without a lock in `arcs/LOCKS.md`.
6. Standing cross-arc question: did this change touch something another arc reads, is it recorded in `DECISIONS.md`, and are the other consumers updated or logged in `BACKLOG.md`? For a change to shared components or the theme, was the consuming arcs' check run (`shell/ARCHITECTURE.md`, "Who consumes what")?

Report a verdict (PASS / FAIL / PASS-WITH-HUMAN-CHECK), then findings ordered by severity with file:line. Be brief.
```

### `.claude/agents/scout.md`

```markdown
---
name: scout
description: Read-only codebase explorer. Use to locate where something lives or how a module works in shell/ (esp. src/pages/composition-workbench) and report back concisely. Never edits.
model: haiku
tools: Read, Grep, Glob, Bash
---

You are a read-only scout for the `shell/` app.

- If the task prompt names an arc folder (`arcs/<name>`), read that arc's ARC.md/PROGRESS.md for context; if the named folder has no `ARC.md`, stop and report instead of defaulting to another arc; if the prompt names no folder, default to `arcs/workbench` only when you need an arc and only when `arcs/workbench/ARC.md` exists, and say so. Also check `arcs/LOCKS.md` when asked about who is editing what.
- Read `shell/ARCHITECTURE.md` first, then the relevant page's own `ARCHITECTURE.md`, before searching code.
- Find files, symbols, call sites and conventions; answer the question asked.
- Do not edit, create, or delete anything. Do not run builds or installs.
- Report: file paths with line numbers, a few sentences of findings, and anything surprising. No file dumps.
- For composition-workbench questions, check `src/pages/composition-workbench/ARCHITECTURE.md` first (after `shell/ARCHITECTURE.md`).
```

## 6. The scoped gate

One command that answers "is this area healthy?" and is the only thing that advances a milestone. Compose it from the project's tools, scoped to the area being worked on so unrelated debt elsewhere cannot block you. Hrifa's:

```json
"check:workbench": "npm run typecheck && oxfmt -c oxfmt.config.mjs --check \"src/pages/composition-workbench/**/*.{ts,tsx}\" && oxlint -c oxlint.config.mjs src/pages/composition-workbench && stylelint \"src/pages/composition-workbench/**/*.css\" --cache && vitest run src/pages/composition-workbench"
```

Adapt: type check, format check, lint, style lint (if any), tests, each limited to the area's path. Record the baseline test count in the ARC's Preconditions ("green at start, N tests") and stop if it starts red.

Gotchas seen: a newer Node broke jsdom's localStorage (needed a vite flag); CRLF working copies fail format checks on Windows (add `.editorconfig` and `.gitattributes` with LF); `corepack` may not be on PATH (call the yarn release file with `node`); run the formatter with the project config flag, not bare.

## 7. How a milestone runs

1. **Write or update the ARC** (template below). Milestones are small enough for one builder run; every criterion is checkable by a test or command; mark anything judged by eye or ear as "Human checkpoint after: yes".
2. **Brief the builder.** The brief is its only context, so include: the milestone and attempt number, files to read first, the spec summary, the scope fence, the test policy, formatting command, what NOT to build (later milestones), and the report format. Point it at files; do not paste them.
3. **Builder runs**, reports. Treat its report as a claim, not proof.
4. **Reviewer runs** (Opus, read-only) with a brief that names the risks to focus on, the files, and what is out of scope. Give it the code, not your conclusion.
5. **Orchestrator runs the gate once**, fixes tiny issues itself only if the human approved or the budget is spent, otherwise sends a second builder attempt with the reviewer's findings. Max 2 builder attempts per milestone; then stop and report.
6. **Update PROGRESS** (result, test status, decisions, open questions, next action) and **commit** (one commit per milestone or coherent group; run formatters first).
7. **Stop at human checkpoints.** Present what to look at, the wording/layout decisions, and concrete numbered questions with a recommendation. Record the human's answers in the ARC the same turn.

### ARC template

```markdown
# ARC: <short title>

## Goal
<What exists when this is done, and why.>

## Design decisions already made (from the human)
- <decisions that constrain every milestone>

## Parameters
<Scope (folders allowed), data-contract rules, persistence/schema rules, theme rules, test policy.>

## Preconditions
- The scoped gate is green before M1 starts (N tests). If red, stop and report.

## Non-goals
<What must not change or be started.>

## Milestones
### M1: <name>
- Scope: <files/modules>
- Acceptance:
  - [ ] Test: <specific, checkable behaviour>
  - [ ] <...>
- Checkpoint decisions (human, <date>): <filled in after the checkpoint>
- Human checkpoint after: yes / no

## Final step
<Update ARCHITECTURE.md, run the reviewer over the full diff.>

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change would alter an existing persisted shape in a way that breaks saved data.
- Any change outside the scopes in Parameters.
- Any decision about layout, wording or look beyond reusing existing patterns.

## Budget
Max 2 builder attempts per milestone, then stop and report.
```

### PROGRESS template

```markdown
# PROGRESS

## Status
- Arc: <name>
- Current milestone: <M?>
- State: not started / building / in review / awaiting human / done

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |

## Open questions for human
-

## Test-run policy
<Copy from CLAUDE.md.>

## Next action
<One sentence: exactly what to do next.>
```

## 8. Habits that paid off (and mistakes to avoid)

**Decisions and design**
- Ask the human the question with a recommendation, then write the answer into the ARC before building. Several milestones changed direction at checkpoints (version history became "versions only at meaningful moments"; snapshots became saved projects). The ARC absorbed each change as it happened.
- When an idea grows (for example velocity editing, bitwig-style tools), add a named milestone to the ARC rather than expanding the one being built. Tell the running builder only what it must not block.
- Capture standing preferences as feedback memories (for example: "what's open stays open; never auto-promote another item"; "never run the full suite after every edit"). Builders repeat the same mistake until they are briefed against it.
- Explain trade-offs in plain terms with concrete numbers (storage sizes, costs). A user who says "I don't understand why this is an issue" usually needs the cause stated simply, then 2 or 3 options and a recommendation.

**Quality**
- A builder's green tests are not evidence of safety. The reviewer's value is in data-loss and race conditions, "success reported on refusal", silent error swallowing, multi-tab behaviour, and half-finished transitions (for example a page that keeps writing between "open succeeded" and "reload landed").
- Fix the high and medium findings, record the lows, and say which are left for the human. If the budget is spent, ask before building a third time.
- Keep new behaviour opt-in when other code shares a component (new optional props), and assert the old consumers' tests still pass.
- Persisted data: additive optional fields; keep old saves loading; never write before the initial load resolves; surface save failures visibly; use a revision check for multi-tab writes.

**Cost and sessions**
- Run `/usage` occasionally. The biggest cost is a very long main session. After a few milestones, `/clear` and resume from ARC.md and PROGRESS.md. Never rely on conversation memory for state.
- Only the reviewer needs the strong model. Do small re-reviews on Sonnet only if the human edits `reviewer.md` or asks; do not override pinned models on your own.

**Dev server**
- A running hot-reload server can cache a file mid-write and serve it empty, breaking the page until restarted. Tell builders to write whole files at once, and restart the server if the page "stops loading" with a "does not provide an export" error.

**Git**
- Commit only when asked or at an agreed point; never skip hooks; format touched files first; keep one coherent commit per milestone; add a Co-Authored-By line as the environment instructs.

## 9. Bootstrap prompt (paste into a new project's Claude Code session)

```text
Set up the ARC workflow in this repository, following WORKFLOW_HANDOFF.md (attached/pasted below).

1. Inspect the repo (package.json scripts, test/lint/format tools, folder layout, existing CLAUDE.md) and tell me what you find.
2. Propose the scoped gate command for the area I'm about to work on, and the baseline (run it once to get the current test count; report any red state without fixing unrelated areas).
3. Create: CLAUDE.md additions (section 4), .claude/agents/{builder,reviewer,scout}.md (section 5, adapted to this project's names and theme rules), ARC.template.md, PROGRESS.template.md, ARCHITECTURE.md (stub with the data contracts you can already see in the code), and .editorconfig/.gitattributes if line endings are inconsistent.
4. Ask me for the goal of the first arc, then draft ARC.md with small milestones and checkable acceptance criteria, and wait for my edits before building anything.
5. Do not implement any feature code yourself once the ARC is adopted: delegate to builder, then reviewer, run the gate once, update PROGRESS.md, and stop at every human checkpoint.
```

## 10. Hrifa-specific items you will not need to copy

The workbench's ARCHITECTURE.md, THEMING.md roles, the `shell/` vs legacy-portal split, and the clip/desk/history designs belong to that project. Carry over the structure and habits above; write a fresh ARCHITECTURE.md (data contracts, ownership of state, persistence rules) and theme rules for the new project, because the reviewer checks against them.
