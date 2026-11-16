# ARC: Lab help text: tooltips and glossary (help vs teaching)

**COMPLETE 2026-11-16, archived as `ARC.help-text.md` / `PROGRESS.help-text.md`.** Final scope differs from the milestones below: M5 to M7 ran as one go with a revised scope (88 entries hand-converted, about 114 short entries stay in the old form PERMANENTLY, so M8 did not remove the legacy path). See Checkpoint decisions and `PROGRESS.help-text.md`.

Approved by the human 2026-11-15 (shell rule 16), as drafted. Workstream folder `arcs/harmonic-field-lab` (previous arc archived as `ARC.retuner-shell.md`). Gate `check:hfl` and DECISIONS prefix `H` already exist, so there is no setup commit.

## Goal
Every explanation in the lab has one consistent look and a clear purpose. A tooltip is short **help**: what the control does, the live values it shows, and its key. The glossary is the full **teaching** entry: the same help, plus the longer explanation and worked examples. Wording is broken into small blocks with bold and italic where it helps, instead of one wall of text. Dynamic text (values, selections, a preset's own description) is set off from the fixed help text by a blank line and one shared format. Done means: every `texts.ts` entry is written as help + teaching, the tooltip shows only help, the glossary shows both, and the dynamic tooltips follow one format.

## Parameters
Facts found at drafting time (2026-11-15), so decisions start from the code, not guesses:
- **Two tooltip systems exist.** `Tip` in `components/ui.tsx` (216 uses) renders a Mantine tooltip: styleable, fixed width 300, term in bold then `entry.text`, then an optional `extra` string (9 uses) in its own block. About 15 `nativeTitle(...)` call sites (plus a few plain `title=`) use the browser's native `title` attribute: plain text with line breaks only, the browser's own delay, no bold, no italics, no blocks.
- **Fixed vs dynamic today.** Fixed: `TextEntry { term, text, see? }` in `texts.ts` (227 entries, about 80,000 characters, median 283, 19 over 600, 6 over 1,000, the longest 3,172 `modes`; 7 have no example). Dynamic: `Tip`'s `extra` string, and the template strings inside `nativeTitle(...)` (chord pitches and steps, key-ring "x of N notes in common", step letters and cents, subset counts, shelf reload, `Alt+n` hint).
- **The glossary drawer and the tooltip share one field** (`text`), searched together in `GlossaryDrawer.tsx`.
- Type scale and stability rules in `UI-CONVENTIONS.md` still apply: a tooltip never changes layout, nothing below `--lab-fs-tiny`, the `typeScale.test.ts` guard stays green.
- Emphasis must not use raw HTML. A tiny markup (for example `**bold**`, `*italic*`) is parsed into React nodes by one function, so text stays plain strings in `texts.ts`.

- Owned paths: `src/pages/harmonic-field-lab/` (including `texts.ts`, `components/ui.tsx`, `components/GlossaryDrawer.tsx`, the CSS modules, tests, the page `ARCHITECTURE.md`), `arcs/harmonic-field-lab/`.
- Shared paths it may touch: none planned. Native-tooltip conversion (if chosen at the M1 checkpoint) stays inside the lab. `DECISIONS.md` and `BACKLOG.md` need no lock for our own rows.
- Check command: `corepack yarn check:hfl` (Node 24 portable copy on PATH, `VITEST_MAX_WORKERS=4`, see `shell/CLAUDE.md`).
- Concurrency: as the template (path-scoped commits, `H-` ids, `H-16` is the next free one).

## Checkpoint decisions
- **Gate policy (human, 2026-11-15): run `check:hfl` sparingly.** While building, builders run only related tests (`test:related`). The orchestrator runs the full gate only where it is needed: before the commit that closes a milestone that changed code (M2, M3, M4 to M7 at most once each, and M8), and never after a wording-only edit batch that the guard test and related tests already cover. M1 and C0 change no code, so they run no gate. Between milestones: related tests only. Reviewers do not run the gate. This tightens shell/CLAUDE.md "Checks", it does not replace it.

- **M1 decisions (human, 2026-11-15), full text in `HELP-FORMAT.md`:** help (tooltip, about 300 to 500 characters) vs teaching (glossary only); block kinds term, paragraph, `Example:`, `Keys:`, dynamic; bold for names you can find, italic only for the `Example:` label and terms being defined; dynamic block after a blank line, muted plain (S4 = A); S5 layout as mocked; dynamic native titles move to the styled tooltip (S6 = B); which controls get a tooltip is decided at the M4 to M7 reviews; the Parallel | Relative switch is key 0 (`modes` text said 5, to be fixed).

- **M2 checkpoint (human, 2026-11-16): approved.** Order is keys first, then the example last, in the tooltip and in the glossary help (HELP-FORMAT section 2 updated). `Hover and hold 1 (and 4, 5)` stays glossary-only for now (no hover target; revisit at the M4 to M7 panel reviews).

- **M3 look decisions (human, 2026-11-16):** the dynamic line goes FIRST, directly under the term (fixed position, not buried in variable-length help); the whole tooltip is ONE uniform color (the dynamic line is not muted; supersedes S4 = A). Tooltip order: term, dynamic, help, keys, example last.

- **M5 to M7 run as one go (human, 2026-11-16):** the per-milestone human checkpoints are waived; the orchestrator converts all 206 remaining old-form entries in 12 sequential batches (`BATCHES.M5-M7.md`; four per milestone), has each milestone reviewed, runs the gate ONCE at the end and commits once, then reports; the human reviews the wording afterwards in `CHECKPOINT.M5-M7.md` (before and after, like `CHECKPOINT.M4.md`). M4 approved by the human 2026-11-16 (`CHECKPOINT.M4.md`: "this looks good").

- **Scope revised for M5 to M7 (human, 2026-11-16, "let's combine A and B"):** not all 206 old-form entries are rewritten by hand. M5.1 (22 generator entries) is hand-converted; 20 entries of 400 to 600 characters with an Example and no gestures are split mechanically (sentence cuts, no rewording); 46 entries (over 600 characters, or naming real keys or clicks) are hand-converted in two batches (H1, H2); about 118 short entries stay in the old form, which becomes a permanent short-entry form (M8 does not remove it; the old-form guard allowance stays). `BATCHES.M5-M7.md` has the lists.

## Preconditions
- `check:hfl` is green before M1 (last arc closed green at 92 files, 1277 tests). If red, stop and report.

## Non-goals
- No change to what any control does, to audio, to layout or to the theme.
- No new tooltips on controls that have none, unless the human asks at a checkpoint (the list of which controls get one is a discussion item in M1).
- The seams arc, voicing modes and the Workbench port are not started.
- Dead-code removal beyond glossary entries (the knip-style export cleanup) is a separate item; this arc only removes the dead glossary entries it meets (`scaleTable`, `methodParams`, `chordExact`) and the user-visible word "snapshot".

## Scenarios (shell rule 7: to be confirmed before M2 is built)
The human's concrete cases, using real entries. The options in the "A or B" rows must be shown to the human with an example where they differ.

| # | Case | What the human should see |
| - | ---- | ------------------------- |
| S1 | Hover `Play scale` | Tooltip: bold term, one or two short help blocks, one example in italics, no teaching paragraphs. |
| S2 | Open the glossary entry for `Play scale` | The same help, then a rule, then the teaching blocks. |
| S3 | Hover `holdToPlay` | A short tooltip (what hold 1, 4, 5 do, in a few lines, with a `Keys:` line); the long worked examples are only in the glossary. |
| S4 | Hover a preset name that has its own description | Fixed help, a blank line, then the preset's own description in the dynamic style (A: muted italic; B: plain, indented; to be chosen at M1 with both shown). |
| S5 | Hover a key ring | Fixed help, a blank line, then `3 of the subset's 7 notes are common to this key.` as the dynamic block, then the click/shift/ctrl hints as a `Keys:` list. Today this is one native sentence. |
| S6 | Hover a step cell on the tuner strip | `Step B: 7.00 c`. Option A: stays a native `title` (plain). Option B: moves to the styled tooltip (bold `Step B`, value in the number font). |
| S7 | Search the glossary for a word that appears only in a teaching block | The entry is found. |

## Milestones
Each milestone is small enough for one builder run and has criteria a command or test can check.

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/`, and `arcs/LOCKS.md`; read the page `ARCHITECTURE.md`, `UI-CONVENTIONS.md` and `texts.ts` structure. Note that no other page imports `texts.ts` (verify with a search) so the entry type can change inside the lab.
- Acceptance:
  - [ ] PROGRESS.md notes the scan result (other arcs, locks, relevant decisions/backlog, importers of `texts.ts`)
- Human checkpoint after: no

### M1: Format spec (thin slice, human decides)
- Scope: no production code. The orchestrator writes `arcs/harmonic-field-lab/HELP-FORMAT.md` and a throwaway comparison: three real entries (`holdToPlay`, `modes`, `playScale`) written in the proposed help + teaching form, as text shown in the chat, plus the S4 and S6 options each with an example.
- Decisions to take (each shown with an example where the options differ):
  1. Block kinds and their look: paragraph, `Example` block, `Keys:` list, dynamic block. How the dynamic block is set off (blank line vs rule vs muted italic).
  2. Emphasis rules: what gets bold (control names, key names?), what gets italic (example values? first use of a term?).
  3. The line between help and teaching (what MUST be in the tooltip; a target length, for example about 300 characters).
  4. Whether the dynamic native `title` tooltips move to the styled tooltip (S6 option B). Cost: about 15 call sites, and the styled tooltip needs a hover wrapper where a `title` attribute was free.
  5. Which controls get a tooltip (the open question from `UI-CONVENTIONS.md` section 4).
- Acceptance:
  - [ ] `HELP-FORMAT.md` exists, lists the confirmed decisions, and is linked from the page `ARCHITECTURE.md`
  - [ ] DECISIONS `H-16`: the help/teaching entry contract (shared by tooltip and glossary) appended
- Human checkpoint after: yes (judged by eye)

### M2: Entry contract and renderer
- Scope: `texts.ts` types, a small block parser, `Tip`, `GlossaryDrawer`, CSS. Entries can be written in the old form (`text`) or the new form (`help`, `teaching`) so panels convert one at a time and the gate stays green. A guard test (like `typeScale.test.ts`) checks the new form: help length limit, an example present, no dangling `see` key, no raw HTML.
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] Test: the parser turns `**a** and *b*` into bold and italic nodes and leaves unknown markup as plain text
  - [ ] Test: a new-form entry shows only `help` in the tooltip and `help` + `teaching` in the glossary; search finds a word that is only in `teaching` (S7)
  - [ ] Three converted entries (S1 to S3) render as agreed in M1
  - [ ] Shortcut table (human OK 2026-11-15): one module (`audio/shortcuts.ts`) holds the lab's key bindings; `{key:name}` in an entry renders as a key label; the Parallel | Relative switch handler (`useLabAudio.ts`, key 0) and the hold keys 1/4/5 read the table; a test fails when an entry names a key in plain text that disagrees with the table. Other handlers move over as M4 to M7 convert their entries; the guard allows the old form until M8.
  - [ ] `DECISIONS.md` `H-16` (help/teaching entry contract and the shortcut table) appended
- Human checkpoint after: yes (look at the three entries in the running page)

### M3: Dynamic tooltips
- Scope: the `extra` string becomes a typed dynamic block; the `nativeTitle` call sites are handled per the M1 decision (S4 to S6); the Developer menu's tooltip on/off and delay options keep working for both kinds.
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] Test: S4 and S5 show the fixed help, the dynamic block and the keys list in that order
  - [ ] If M1 chose to move native titles: no `nativeTitle(` call remains for the converted sites, and tooltips-off hides them
- Human checkpoint after: yes

### M4 to M7: Convert the entries by panel (one builder run each)
- M4 top bar, tabs, Sound; M5 field, subset, rings, key rings, modes; M6 chords, shelf, sketch, positional, composites; M7 retuner, lattice, strip, visualizers, keyboard, settings.
- Each milestone: every entry of its panels is rewritten as help + teaching (blocks, bold and italic per `HELP-FORMAT.md`), long entries split, the 7 missing examples added, dead entries removed. The wording is the human's to approve, so the orchestrator shows each batch of before and after text at the checkpoint.
- Acceptance (each):
  - [ ] The arc's `Check command` passes
  - [ ] Every converted entry passes the guard test; no entry of these panels is left in the old form
- Human checkpoint after: yes (wording review)

### M8: Close-out
- Scope: remove the legacy `text` path and the guard's old-form allowance; the page `ARCHITECTURE.md` and `UI-CONVENTIONS.md` section 4 updated with the settled rules; glossary drawer intro text; `BACKLOG.md` leftovers; the arc archived as `ARC.help-text.md` / `PROGRESS.help-text.md`.
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] No entry in `texts.ts` is in the old form
  - [ ] Two reviewers (as at the last close-out) report no open finding
- Human checkpoint after: yes

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned paths or Shared paths, or to `shell/ARCHITECTURE.md` or the page's own `ARCHITECTURE.md` contracts.
- A shared path needed is locked by another arc in `arcs/LOCKS.md`.
- Any decision about look, wording or taste not specified above (all wording is the human's).

## Budget
Max 2 builder attempts per milestone; then stop and report.
