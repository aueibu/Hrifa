# ARC: Finish the desk (draft, edit before running)

> DRAFT. I inferred this goal from the "Status" line of the desk section in `src/pages/composition-workbench/ARCHITECTURE.md`, which lists what is not built. Change the goal, order, or criteria to match what you actually want next.

## Goal
Complete the desk so a composer can keep, vary and refine material without leaving it: edit a snippet's note and name, capture variations as linked-by-name copies, and convert note snippets to pitch-class material. Blank clips and snapshots are stretch milestones.

## Parameters
- Work only in `src/pages/composition-workbench/` (desk.tsx, snippet.ts, DeskView, SnippetPreview, tests) plus the desk section of ARCHITECTURE.md.
- Snippets stay frozen `DataPacket`s: any new operation produces a new snippet, never mutates a packet in place.
- Keep packets JSON-safe; bump `schemaVersion` and keep `acceptsSnippets` rejecting corrupt or newer desks if the stored shape changes. Existing v1 desks must still load.
- Items keep stable ids and gain a provenance step naming the operation, as `capture-snippet` does.
- Colors use THEMING.md roles. Editor chrome reuses `EditorPalette` tools/actions.
- Preserve the hidden-view rule for canvas/desk (opacity, visibility, pointer-events, inert; never `display: none`).

## Preconditions
- `corepack yarn check:workbench` is green before M1 starts (verified 2026-11-11 after M1: 49 files, 542 tests; the pre-M1 baseline is 539, since M1 added 3).
- If it is red at the start, stop and report; do not fix unrelated areas.

## Non-goals
- No changes to module math (interference, fractioning, etc.).
- No cross-browser sync or file export of the desk.
- No new audio engine work beyond reusing existing audition on the transport.

## Milestones

### M1: Edit snippet note
- Scope: `Snippet.note` editing in the desk card; persistence; tests in `snippet.test.ts`.
- Acceptance:
  - [ ] `corepack yarn check:workbench` passes
  - [ ] A test shows editing a note updates only `note` and leaves `packet`, `id`, `createdAt` identical
  - [ ] Saved v1 desks without a note still load
- Human checkpoint after: no

### M2: Duplicate as variation
- Scope: a "Duplicate" card action that creates a new snippet with a fresh id, name `<name> (variation)`, copied packet, and a provenance step `duplicate-snippet` appended to every item.
- Acceptance:
  - [ ] `corepack yarn check:workbench` passes
  - [ ] Test: duplicate has a new id, deep-equal packet items values, extra provenance step, original unchanged
  - [ ] Duplicate persists across reload (persistence test)
- Human checkpoint after: no

### M3: Pitch-class conversion
- Scope: pure function converting an `events | note` snippet to a pitch-class representation (domain `pitchClass`, encoding `chromatic-12`), producing a new snippet; desk card action; refusal with explanation for unsupported kinds.
- Acceptance:
  - [ ] `corepack yarn check:workbench` passes
  - [ ] Test: MIDI 60, 64, 67, 72 become 0, 4, 7, 0; timing and frame preserved; provenance step `to-pitch-class`
  - [ ] Test: a non-note snippet is refused with a message, never guessed at
  - [ ] Result packet routes through `compatibility.ts` as a pitch-class source (add a test)
  - [ ] Preview renders (or falls back to text) without error
- Human checkpoint after: yes (does the converted card read and audition sensibly?)

### M4 (stretch): Snapshot a module output to the desk
- Scope: capture a module's current output packet (whole packet, no ids) from the module panel via the same action chrome as Send to desk.
- Acceptance:
  - [ ] `corepack yarn check:workbench` passes
  - [ ] Test: capturing a whole packet yields a frozen copy with `origin.moduleInstance` set and no `itemIds`
- Human checkpoint after: yes

### M5 (stretch): Blank clip
- Scope: create an empty note snippet with a chosen length, frame linear, origin 0.
- Acceptance:
  - [ ] `corepack yarn check:workbench` passes
  - [ ] Test: blank clip is a valid packet accepted by `acceptsSnippets`
- Human checkpoint after: yes (no editing UI yet, so confirm whether to proceed to snippet editing)

## Final step
After the last milestone: update the "Status" line and the desk subsections of ARCHITECTURE.md to match what is built, then run `reviewer` over the full diff.

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change would alter an existing persisted shape in a way that breaks saved desks.
- Any change outside `composition-workbench/`, or to module math.
- Any decision about card layout, wording, or look beyond reusing existing patterns.

## Budget
Max 2 builder attempts per milestone, then stop and report.
