# ARC: <short title>

Copy to `ARC.md` and fill in. The orchestrator re-reads this file after every compaction.

## Goal
<One paragraph: what exists when this is done, and why.>

## Parameters
<Fixed inputs and constraints, e.g. module(s) touched, musical/domain parameters, data-contract rules, performance or UX limits.>

## Preconditions
- The scoped check (`corepack yarn check:workbench`) is green before M1 starts. If red, stop and report.

## Non-goals
<What must not change or be started.>

## Milestones
Each milestone is small enough for one builder run and has criteria a command or test can check.

### M1: <name>
- Scope: <files/modules>
- Acceptance:
  - [ ] `corepack yarn check:workbench` passes
  - [ ] <specific test or command proving behavior, e.g. "interference(3,4) yields [3,1,2,2,1,3]">
- Human checkpoint after: yes / no  <!-- yes for anything judged by eye or ear -->

### M2: <name>
- Scope:
- Acceptance:
  - [ ] `corepack yarn check:workbench` passes
  - [ ] 
- Human checkpoint after: yes / no

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope or to ARCHITECTURE.md contracts.
- Any decision about look, sound, or musical taste not specified above.

## Budget
Max 2 builder attempts per milestone; then stop and report.
