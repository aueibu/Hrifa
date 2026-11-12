# Workflow handoff: ARC-driven work with builder / reviewer / scout agents

A portable description of the workflow used on the Hrifa composition workbench, plus ready-to-copy files and a bootstrap prompt. Use it to set the same structure up in another project once it passes roughly "a few modules and more than one session of work".

## 1. What this is, in one paragraph

Big work is written down as an **ARC** (goal, constraints, small milestones with checkable acceptance criteria). A **PROGRESS** file records state so any session can resume from disk instead of memory. The main session is an **orchestrator**: it never writes feature code itself. It hands each milestone to a **builder** (cheaper model), has a **reviewer** (stronger model, read-only) check the diff, runs one **scoped gate** command, updates PROGRESS, and **stops for the human** at checkpoints judged by eye, ear or taste. Decisions the human makes are written back into the ARC immediately so they survive compaction and new sessions.

## 2. Files to create

```
<project>/
  CLAUDE.md                      # workflow rules (section 4)
  ARC.md                         # current arc (from ARC.template.md)
  PROGRESS.md                    # current state (from PROGRESS.template.md)
  ARC.template.md  PROGRESS.template.md
  ARCHITECTURE.md                # data contracts + how things fit (per major area)
  .claude/agents/builder.md      # section 5
  .claude/agents/reviewer.md
  .claude/agents/scout.md
  package.json                   # a scoped "check:<area>" script (section 6)
  .editorconfig  .gitattributes  # pin line endings (LF) if on Windows
```

Archive a finished arc as `ARC.<name>.md` / `PROGRESS.<name>.md` (commit it), then start the next from the templates.

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

### `.claude/agents/builder.md`

```markdown
---
name: builder
description: Implements exactly one milestone from ARC.md. Must pass the scoped gate before reporting done. Use for all code-writing delegation.
model: sonnet
---

You implement one milestone at a time.

1. Read `ARC.md` (your milestone, its acceptance criteria and any "Checkpoint decisions"), `PROGRESS.md`, and `ARCHITECTURE.md` if you touch data flow.
2. Follow the project's theme/design rules for any visual work (roles and tokens, not raw values).
3. Write tests alongside logic, in the existing colocated style.
4. While iterating, run only the test files you touch and format only the files you change. Run the scoped gate once, at the end. Fix failures; do not report done while it fails.
5. Stay inside the milestone's scope. If something outside it needs changing, or a criterion can't be met, stop and report instead of improvising.
6. Do not edit ARC.md or PROGRESS.md, and do not commit.
7. A dev server may be running and hot-reloading: write each file in one go so a half-written module is never served.

Report: files changed, each acceptance criterion with the test that proves it, decisions the ARC did not cover, wording/layout for the human to review, and the final gate result.
```

### `.claude/agents/reviewer.md`

```markdown
---
name: reviewer
description: Read-only reviewer. Checks a milestone's diff against ARC.md acceptance criteria and ARCHITECTURE.md contracts. Use after the builder reports done, before marking a milestone complete.
model: opus
tools: Read, Grep, Glob, Bash
---

You review; you do not edit.

1. Read the milestone's acceptance criteria and checkpoint decisions in `ARC.md`.
2. Inspect the diff (`git diff`, `git status`, untracked files). Do not run the full gate or suite (the orchestrator does); single test files are fine.
3. Check each criterion explicitly: met / not met / cannot verify by script (flag those for the human).
4. Hunt for data loss first: stale or empty state overwriting stored state, races between load/save/unmount, multi-tab, failures that are swallowed silently, success reported when an action was refused. Then contract compliance, correctness, scope creep.
5. Read the code, not just test names.

Report a verdict (PASS / FAIL / PASS-WITH-HUMAN-CHECK), then findings ordered by severity with file:line and a concrete fix each, then items for the human. Be brief.
```

### `.claude/agents/scout.md`

```markdown
---
name: scout
description: Read-only codebase explorer. Use to locate where something lives or how a module works and report back concisely. Never edits.
model: haiku
tools: Read, Grep, Glob, Bash
---

You are a read-only scout.

- Find files, symbols, call sites and conventions; answer the question asked.
- Do not edit, create, or delete anything. Do not run builds or installs.
- Report: file paths with line numbers, a few sentences of findings, and anything surprising. No file dumps.
- Check `ARCHITECTURE.md` first for questions about an area.
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
