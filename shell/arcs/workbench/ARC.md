# ARC: Chord input (harmonic note entry in the clip editor)

Approved by the human 2026-11-13.

## Goal
In the clip editor a user can enter harmony without placing notes one at a time. A new editor tool takes a click on a pitch (or on an existing note) and opens a chord picker with two modes. **Root mode**: chords built on the clicked pitch as root. **Common-tone mode** (tool + Ctrl): chords that contain the clicked pitch, sorted in columns by the role the pitch plays (root, 3rd, 5th, 7th, 9th, ...). The set of chords offered comes from the project's pitch set ("key"), which the user can override from the picker. Hovering a chord shows a ghost preview in the roll; clicking it places the notes. Inversion and voicing (open, closed, drop-2, drop-3) are controls in the picker. The chord vocabulary is defined as interval stacks over the project tuning, so it works in any EDO, not only 12.

This also builds the foundation for later work in the same pattern (voicing exploration on a selection, Euclidean rhythm insertion and rhythm transforms through a picker anchored at a point). Those are not in this arc.

## Parameters
Decisions already taken with the human (2026-11-13):

- **Tuning-aware chords.** A chord is a template: interval steps (in EDO steps) plus a role label per tone (root, 3rd, 5th, 7th, 9th, 4th/sus, 6th, ...). Names ("Am7", "Asus4") exist for 12-EDO. For other EDOs the engine still works (stacking by scale degree of the active pitch set, role labels by degree) and shows step-based names; proper naming there is a decision, see Stop-and-ask.
- **No automatic chord groups.** A chord is placed as ordinary single-pitch note items. "The chord" is recovered by the existing selection and same-onset (vertical) tracing. The multi-pitch chord item backlog item stays open and is not part of this arc. An explicit user-made link/group (a "link these notes" button) is a possible later feature, not built here (backlog item to add on approval).
- **Per-project pitch set, with a momentary override.** The project holds a set of pitches (pitch classes in the project EDO), not a fixed list of named keys. Presets (major, minor, modes, ...) are shortcuts that fill the set; the user may then toggle any pitch on or off (C major plus F♯ is valid). Chords offered are all templates whose tones lie inside the set, so D with F and D with F♯ both appear in that example. The picker has an override control (pick a preset, toggle pitches, or "all pitches") that applies to that picker only and does not change the project.
- **Layout: picker body plus host.** The picker is an input sub-module of the editor (later also of other input rolls and inputs), not a window. It is split into a **body** (mode toggle, chord columns, voicing controls, override control; takes anchor, pitch set and callbacks as props; lays itself out from its own container size; never reaches into its parent or the roll) and a **host** (a thin wrapper that decides where the body appears). Host rules, to keep the app from sliding into floating-window sprawl:
  1. Hosts are named slots the workbench already owns (for example the left inspector's module/parameter slot, which today shows the open clip's properties and actions, or a dock beside or below the roll). No draggable, resizable or stackable windows and no free positioning.
  2. Only one picker is open at a time; opening another tool's panel replaces the content of the slot.
  3. The only floating element allowed is a transient popover: anchored to the click, dismissed by Esc or an outside click, never movable, holding nothing the user must keep. Not planned for v1.
  4. A new tool must use an existing slot; a new kind of slot is a deliberate layout decision logged in `DECISIONS.md`.
  The human's steer (superseded for v1 by the M4 Checkpoint decisions: a dock beside the roll plus a takeover of the canvas area): the picker is conceptually a sub-module of the piano roll and belongs in the module parameter (inspector) slot, which the roll's own clip properties and actions already use, so how the two share that slot (section, tab, or the picker temporarily replacing it while the chord tool is active) is the main layout question for M4. The ghost preview needs the roll to stay visible, so a canvas-replacing takeover is a fallback only. The host choice is remembered per viewer (W-10 pattern) so a later host is an option, not a rewrite.
- **Hover, audition, insert.** Hover shows ghost notes in the roll (silent). A single click on a chord button auditions it (sounds it through the existing audition path) and keeps its ghost pinned; double-click, or Enter on the focused chord, inserts it. Sound only ever plays from a click the user makes, never from hover. This is the working default; the exact gesture (single click audition plus double-click insert, or a modifier key) is confirmed at the M5 checkpoint.
- **Voicing in v1:** inversion (root position, 1st, 2nd, ...), close, open and drop voicings (drop-2, drop-3). Orchestration-theory and harmonic-series voicing exploration on a selection is a later arc, but the voicing engine is a pure function (chord, voicing spec) to notes so that arc can reuse it.
- **Placement uses the existing edit contract** (`noteClipEdits.ts`, "Edits from the editor" in the workbench `ARCHITECTURE.md`), so undo, history and versions behave as for any other edit. Pitches are midicents (shared contract). At a non-12 EDO the notes are on the EDO grid; the roll still draws 12 rows (the tuning-aware pitch axis is a separate backlog item and not part of this arc).

- Owned paths: `src/pages/composition-workbench/**` (no other arc is active on the workbench; the finished clips and desk arcs are archived), including its tests and its `ARCHITECTURE.md`; new files under `src/pages/composition-workbench/chordInput/` (pure engine, pitch set, picker components, tests); this arc's `arcs/workbench/` files.
- Shared paths it may touch (each needs a row in `arcs/LOCKS.md`, written by the orchestrator): `src/components/PianoRoll/` (opt-in ghost-preview overlay prop; opt-in so Melodicization and Mixer are unchanged), `src/components/EditorPalette/` (a new tool and its shortcut), `src/pages/CompositionWorkbench.page.tsx` only if the entry file must change, `shell/ARCHITECTURE.md` (new shared contract: pitch set and chord templates), `shell/DECISIONS.md`/`BACKLOG.md` (no lock). `src/pages/harmonic-field-lab/` and `src/lib/harmonic-field/` belong to another arc and are not edited or imported by this arc without a decision.
- Check command: `corepack yarn check:workbench` (exists). If `corepack` is not on PATH: `node .yarn/releases/yarn-4.18.0.cjs run check:workbench` from `shell/`.
- Concurrency: same checkout and branch as the other arcs; the orchestrator commits at the end of every milestone with path-scoped `git add <paths>` and `git commit -- <paths>` only (never `git add -A` or a bare `git commit`; on an `index.lock` error retry, never delete the lock) and removes lock rows only after that commit; after writing a lock row re-read `arcs/LOCKS.md`; before committing a PianoRoll or EditorPalette change also run the consuming arcs' check (`shell/ARCHITECTURE.md`, "Who consumes what": Melodicization and Mixer consume the roll). `DECISIONS.md` ids use the registered workbench prefix `W` (next free number).

## Preconditions
- `check:workbench` exists and is green before M1. If red only because of files outside this arc's Owned and locked paths, it is not this arc's to fix (shell rule 14): stop, report, wait.
- `arcs/workbench/PROGRESS.md` currently says "no active arc"; the orchestrator rewrites it from `PROGRESS.template.md` once this ARC.md is approved (nothing to archive: no active ARC.md is present).

## Non-goals
- Multi-pitch chord items, or any automatic grouping of placed notes (see Parameters). Explicit link/group button: backlog.
- Voicing exploration on a selection (orchestration or harmonic-series theory), voice leading between successive chords, chord progressions, and chord detection or naming of existing notes.
- Rhythm: Euclidean insertion and applying rhythm transforms through a picker. The picker pattern is designed to extend there, but nothing is built.
- The tuning-aware pitch axis in the roll, microtonal mouse editing, and any change to how the roll draws rows.
- Changes to Melodicization, Mixer or the packet/`Pitch List` contracts.
- Audio changes beyond auditioning chords through the existing audition path. Hover never sounds anything.

## Milestones
Each milestone is small enough for one builder run and has criteria a command or test can check.

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc under `arcs/` (harmonic-field-lab is active), and `arcs/LOCKS.md`. Note which other pages import from the workbench folder (scale-explorer imports `audio/*` and `forteCatalog.ts`) and the existing EDO/scale code to reuse rather than duplicate (`scaleConstruction.ts`, `pitch.ts`, `scaleDegreeColor.ts`, `euclidean.ts`, `compositionSettings.tsx`). Find where the editor tools live (`EditorPalette`, keys 1-6) and how `NoteClipEditor.tsx` turns a click into an edit. Record in PROGRESS.md what other arcs own, what is locked, and any decision or backlog item that affects this arc (including the "Multi-pitch chord items", "Tuning-aware pitch axis" and "Hotkeys and context menu" backlog items).
- Acceptance:
  - [ ] PROGRESS.md notes the scan result (other arcs, locks, relevant decisions/backlog, where tools and the edit contract live)
- Human checkpoint after: no

### M1: Pitch set and chord engine (pure, no UI)
- Scope: `src/pages/composition-workbench/chordInput/` pure modules and tests. (a) `PitchSet`: pitch classes in an EDO, presets (major, natural/harmonic/melodic minor, the modes, pentatonics, chromatic = all), toggle helpers. (b) Chord templates as interval stacks with role labels, 12-EDO named library (triads, 5, sus2, sus4, 6, 7 family, 9, add9, ...) plus a generic generator that stacks by scale degree of a pitch set for any EDO. (c) `chordsOnRoot(set, root)` and `chordsWithCommonTone(set, pitch)` returning chords grouped by the role of that pitch. Chords whose tones are not all in the set are excluded.
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] In C major, root A offers Am, A5, Am7, Am9, Asus2, Asus4 and Amadd9 with the right pitches. Am6 and Aadd9 are correctly absent because standard Am6 (A C E F♯) and Aadd9 (A C♯ E B) contain notes outside C major; they appear once F♯ and C♯ are in the set (tests pin this; amended 2026-11-13 after the builder found the original wording wrong)
  - [ ] In C major plus F♯, root D offers both D (D F♯ A) and Dm (D F A); common-tone A lists them under the 5th column
  - [ ] In C major, common-tone A has Dm, Dm7, Dm9 under "5th", Am under "root", F, Fmaj7 under "3rd"
  - [ ] A 19-EDO or 31-EDO pitch set produces chords by degree stacking with step-based names and does not throw
  - [ ] Any decision touching a shared contract (pitch set representation) is appended to `DECISIONS.md` in this milestone
- Human checkpoint after: no

### M2: Voicing engine (pure, no UI)
- Scope: `chordInput/voicing.ts` and tests. Function (chord, anchor octave, voicing spec) to ordered midicent pitches. Spec: inversion index, spread style (close, open, drop-2, drop-3), optional octave of the bass.
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] Am first inversion gives C, E, A ascending (bass C)
  - [ ] Drop-2 of a close-position seventh chord moves the second voice from the top down an octave; open voicing spreads alternating voices an octave; tests cover triads and sevenths and an inversion beyond the chord size (wraps)
  - [ ] The engine works from steps, so a non-12 EDO chord voices without rounding to semitones
- Human checkpoint after: no

### M3: Project pitch set (setting, persistence, settings UI)
- Scope: the project pitch set in `compositionSettings.tsx` (default: major at 12-EDO, chromatic at any other EDO; human decision 2026-11-13, see BACKLOG for the harmonic-field-lab follow-up), saved per project with the existing browser persistence, a settings control (preset picker and per-pitch toggles, shown for the project EDO), and the `ARCHITECTURE.md` section "Browser persistence"/settings updated. A changed EDO resets or maps the set (decision recorded).
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] The set round-trips through persistence and survives reload (test)
  - [ ] Toggling a pitch in the settings control changes the set and is covered by a component test
  - [ ] DECISIONS row added: where the pitch set lives, its representation, behaviour on EDO change
- Human checkpoint after: no

### M4: Layout mock (human decision)
- Scope: a throwaway static HTML mock in the session scratchpad (not in the repo, no router route, no locks; harmonic-field-lab used a router route, which this arc avoids because it would need a `Router.tsx` lock for a file that is deleted anyway) of the picker in context: root mode and common-tone mode, voicing controls, override control, and the roll with ghost notes. Compare the hosts allowed by the rules above: the inspector slot shared with clip properties (as a section, as a tab, or replacing it while the tool is active) and a dock beside or below the roll; show the canvas takeover only as the fallback; show behaviour at a small window width.
- Acceptance:
  - [ ] The mock exists and is described in PROGRESS.md; the arc's `Check command` passes (the mock lives outside the repo)
  - [ ] The human's layout choice is written into this file as a "Checkpoint decisions" bullet before M5
- Human checkpoint after: yes
- Checkpoint decisions (human, 2026-11-13, after viewing the mock):
  - Register under inversion: the chosen pitch is the root tone and stays at the click; inversion and spread put the other voices below it (option (a)). C major first inversion at middle C puts E and G below the C.
  - Hosts: a dock beside the roll is the default, and an expanded takeover is the second host (same picker body). The inspector hosts and the dock below the roll are dropped for v1. The takeover covers the canvas (desk) area and leaves the roll visible so ghosts keep working (the orchestrator's reading of "dock beside and/or takeover"; the mock's takeover also hid the roll). Moving between the two should feel like snapping into a slot (as in REAPER), not like a free window: slots only, per the host rules.
  - Panel layout: Root | Common tone are small buttons at the top of the panel (the start of the workflow); in common-tone mode the user then picks the scale degree the clicked pitch plays; spread and inversion are parallel controls, each a single column; the custom scale picker sits in a collapsed fold; the override is kept at the chord tool level, not per click.
  - The note name: default is a label on the note itself; a developer toggle switches its placement between on the note and beside it (not an on/off switch; corrected by the human 2026-11-13).

### M5a: Shared plumbing (ghost overlay and tool slot)
- Scope: under locks on `src/components/PianoRoll/` and `src/components/EditorPalette/`: an opt-in `ghostNotes` overlay prop on `PianoRoll` (faint dashed style; hovered and pinned variants; optional label drawn on the note itself; default nothing, per W-11), and a new tool entry (key 7, "Chords") in the editor palette. In `NoteClipEditor.tsx` (owned): the tool is selectable, and a click on the roll with it reports the anchor (pitch and onset) to a callback; nothing else yet.
- Acceptance:
  - [ ] The arc's `Check command` passes, and the consuming arcs' check (Melodicization and Mixer: their roll tests pass unchanged)
  - [ ] Ghost notes render from the prop and never affect selection, hit-testing or the packet; with the prop absent behaviour is unchanged (existing tests)
  - [ ] Selecting the tool and clicking the roll reports the pitch and onset, creates no note and plays no sound
  - [ ] DECISIONS row: the `ghostNotes` prop and the tool key (shared contract)
- Human checkpoint after: no

### M5b: Chord picker, root mode, placement
- Scope: the picker body (`chordInput/`) and its two hosts (see Checkpoint decisions under M4): a dock beside the roll (default) and an expanded takeover of the canvas area. Panel layout: small Root | Common tone buttons at the very top as the start of the workflow (common-tone mode is built in M6; the button may be disabled until then); then the chord list for the anchor; spread and inversion as single-column lists side by side (parallel controls); a collapsed "Scale" fold holding the override (preset and pitch chips). The override belongs to the chord tool (kept while the tool is in use, not per click, never written to the project). Hover shows ghost notes, a single click auditions and pins the ghost, double-click or Enter places the notes through the edit contract at the clicked onset with the default length (grid step or last-used length; decision recorded). The anchor note's name is shown on the note itself by default; a developer option (`developerOptions.ts`) switches its placement between on the note and beside it (to the side, as in the mock). This needs a `labelPlacement: 'on-note' | 'side'` field on the `PianoRoll` ghost (a small extension of W-15, so M5b re-takes the `PianoRoll` lock and logs it).
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] Register: the clicked pitch is the chord's root tone and stays at the click; inversions put the other voices below it (Am first inversion at A4 gives C4 E4 A4; C major first inversion at C4 puts E and G below it)
  - [ ] The picker body renders in both hosts in tests with no host-specific props
  - [ ] Clicking A with the tool in C major and double-clicking Am with first inversion places C, E, A (component test through the real edit path)
  - [ ] Ghost notes appear on hover and are gone on leave or close; no note is created and no sound plays by hovering
  - [ ] Single click auditions the chord (audition path mocked) and creates no note; double-click or Enter inserts it
  - [ ] Placed chords are undoable as one step and show in history like other edits
  - [ ] The override changes what the picker offers while the tool is used and never changes the project pitch set (test); an empty set shows an empty state
  - [ ] The developer toggle switches the anchor label between on-note and beside-the-note placement (test); the label is visible in neither case unless the ghost is the anchor
  - [ ] Decisions recorded: default length, override lifetime (tool-level, resets on reload unless the human decides otherwise), the dock as a named slot
- Human checkpoint after: yes (judged by eye)
- Checkpoint decisions (human, 2026-11-13, after trying M5b in the app): the dock width and the takeover are good; it feels like snapping into a slot. Changes requested, built as M5c: ghost notes look like normal notes, slightly more transparent; dock default about twice as wide, with a grabber to resize it; clicking an inversion or a spread previews (auditions) too; a hover ghost note under the pointer while the Chords tool is active, before any click; a developer option choosing whether preview needs Ctrl+click or happens on plain click.

### M5c: Picker polish from the M5b checkpoint
- Scope: under a re-taken lock on `src/components/PianoRoll/`: (a) ghost styling: a ghost note looks like a normal note in the roll (same fill and outline roles as `.note`) at reduced opacity (the user's words: "slightly more transparent"); hover, pinned and anchor variants stay distinguishable by opacity and outline weight, not by a different look; (b) an opt-in `onAnchorHover({pitchMidicents, start, step} | null)` on `PianoRoll`, firing only with `activeTool === 'chords'` (snapped like `onAnchorClick`, null on leave), which the editor draws as a one-grid-step hover ghost note before any click. In the workbench: (c) the dock is about twice as wide by default (about 30rem) and has a drag handle (grabber/splitter) between the roll and the dock to resize it, keyboard-operable, width clamped and remembered per viewer (W-10 preference); (d) clicking an inversion or a spread button auditions the current chord (when one is pinned or hovered, else the first chord) and updates the pinned ghost; (e) a developer option `chordPreviewGate: 'click' | 'ctrl-click'` (default `'click'`): in `'click'` a single click on a chord, inversion or spread auditions it; in `'ctrl-click'` only Ctrl+click (Cmd on macOS) auditions, a plain click only pins the ghost. Hover is silent in both.
- Acceptance:
  - [ ] The arc's `Check command` passes, and the Melodicization, Mixer, PianoRoll and EditorPalette tests pass unchanged
  - [ ] Ghost notes use the note's own styling tokens at reduced opacity (test on the class or data attribute; judged by eye at the checkpoint); `onAnchorHover` fires only with the Chords tool, never creates a note or sound, and clears on leave or tool change
  - [ ] The dock handle resizes with the pointer and the keyboard, clamps to min and max widths, and the width persists per viewer; the takeover is unaffected
  - [ ] Clicking an inversion or a spread triggers one audition (mocked) with the right voiced pitches; with the gate set to `'ctrl-click'` a plain click triggers none and Ctrl+click triggers one; hover never sounds
  - [ ] DECISIONS: `onAnchorHover` added to W-15's contract (new row), dock width preference and `chordPreviewGate` recorded
- Human checkpoint after: yes (judged by eye)

### M6: Common-tone mode
- Scope: tool + Ctrl opens the picker in common-tone mode: chords containing the clicked pitch in columns by role (root, 3rd, 5th, 7th, 9th, 4th, 6th, ...), empty columns hidden, a toggle for all pitches versus the pitch set. Same preview, voicing and placement path as M5. The clicked pitch is anchored: the placed chord's tone with that role sits at the clicked pitch.
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] Clicking A in C major with Ctrl shows Dm under "5th" and placing it puts the A at the clicked A (test through the edit path)
  - [ ] Columns come from the same engine function as M1 (no second implementation)
  - [ ] The all-pitches toggle adds chords outside the set and is per picker
- Human checkpoint after: yes

### M7: Stack onto existing notes
- Scope: with the tool active, clicking an existing note opens the same pickers anchored at that note's pitch and onset, so a user can add chords or stack polychords on it. Placing does not move or delete the clicked note (a placed tone that equals an existing same-onset pitch is not duplicated).
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] Clicking an existing C with the tool and placing Am (common tone C) adds A and E and keeps the C (test)
  - [ ] Stacking two chords at one onset leaves ordinary same-onset notes that existing selection and transforms treat as one slot
- Human checkpoint after: yes

### M8: Close-out
- Scope: `ARCHITECTURE.md` (workbench and shell: pitch set, chord templates, voicing, tool and overlay contracts, who consumes what), BACKLOG items for what was deferred (explicit note link/group button, voicing exploration on selection, Euclidean insertion and rhythm transforms via the same picker, chord naming for non-12 EDOs, picker audition-on-hover if declined), final `check:workbench`, release all locks after their commits.
- Acceptance:
  - [ ] The arc's `Check command` passes
  - [ ] Docs describe the final shape; no locks left in `arcs/LOCKS.md` for this arc
  - [ ] Every deferred idea from the conversation of 2026-11-13 is in BACKLOG.md with a tag
- Human checkpoint after: no

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned paths or Shared paths, or to `shell/ARCHITECTURE.md` or the page's own `ARCHITECTURE.md` contracts beyond what a milestone lists.
- A shared path needed is locked by another arc in `arcs/LOCKS.md` (the harmonic-field-lab arc is active).
- Any decision about look, sound, or musical taste not specified above, in particular: chord naming and templates for non-12 EDOs; the chord library's contents beyond the list above; default note length; how the pitch set maps when the project EDO changes.
- The builder finds the roll or edit contract cannot place several notes as one undoable edit without changing its shared contract.

## Budget
Max 2 builder attempts per milestone; then stop and report.
