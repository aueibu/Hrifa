# ARC: Clips and the clip editor

> Adopted. The desk arc is archived as `ARC.desk.md`. Proposals below came from the design discussion; edit freely.

## Goal
Let a composer start from a blank clip and edit it directly, without a module feeding it. A clip is a desk snippet with a type; double-clicking it opens its editor in the bottom panel, as in a DAW's clip editor. Edits are tracked so they can be undone and so a clip's history can be traced. This subsumes the old M5 (blank clip).

## Design decisions already made (from the human)
- Module device editing (parameters you move) and clip editing (viewing and editing a result) are two independent things. A blank clip needs only the clip editor.
- Editing a clip commits to the same snippet id, so Make-source modules pointing at it update live. A family-tree trace of how things were derived is wanted (later milestone).
- Undo/redo is wanted, with buttons on the top bar beside Play/Stop.
- The layout has four regions: left inspector, right params (both collapsible), an upper stage (canvas or desk today; timeline and arranger later) and a bottom editor panel. The bottom panel must become general: module edit, clip edit, and more later. It is already visible in both canvas and desk views.
- Clip types come in levels of detail: rhythm is duration only, the piano roll adds pitch, a pitch list is values with no placement in time (grouping like `[1 2 3]` is allowed). Some types can open in more than one editor.

## Parameters
- Primary scope: `src/pages/composition-workbench/`. Explicitly also allowed, because the editors and panel live there: `src/components/PianoRoll/`, `src/components/EditorPalette/`, and `src/pages/CompositionWorkbench.page.tsx` (layout only).
- Snippet packets stay JSON-safe `DataPacket`s. An edit replaces a snippet's packet atomically (a new frozen packet, never mutated in place) and adds a provenance step naming the operation.
- If the stored snippet shape changes, bump `schemaVersion`, add a migration, keep `acceptsSnippets` rejecting corrupt or newer desks, and keep existing v1 desks loading.
- Colors use THEMING.md roles. Editor chrome reuses `EditorPalette` tools and actions.
- Preserve the hidden-view rule (opacity, visibility, pointer-events, inert; never `display: none`) and keep every module mounted so it keeps publishing outputs.
- Test policy: builders run only the test files they touch; reviewers read the diff without running the gate; the orchestrator runs `check:workbench` once before a milestone advances.

## Preconditions
- The desk arc (M1-M4) is committed or the human has said to build on the uncommitted state.
- `corepack yarn check:workbench` is green at the start (565 tests at the end of the desk arc). If red, stop and report.

## Non-goals
- No timeline or arranger in this arc (the upper stage only needs to stay extensible).
- No plug-in or VST hosting, no music21 analysis, no modulation or process chains on clips.
- No change to module math.

## Milestones

### K1: History foundation (desk)
- Scope: an undo/redo history for desk snippet changes (add, remove, rename, note, duplicate, convert, and later edits). Undo and Redo buttons on the top bar next to `TransportBar`, disabled when empty. Bounded depth. History is session-only; the desk's persisted shape does not change.
- Acceptance:
  - [ ] Test: each existing desk mutation can be undone and redone, restoring the exact prior snippets
  - [ ] Test: a new change after an undo clears the redo stack
  - [ ] Test: history does not affect `acceptsSnippets` or the stored desk
  - [ ] Undo and Redo are keyboard-reachable
- Human checkpoint after: no

### K1b: Workbench-wide undo/redo
- Why: the human expects ordinary undo (a generator value changed from 5 to 6 undoes back to 5), not desk-only history. K1's desk history is absorbed into this.
- Scope: scout first to list state that bypasses `usePersistentState` (canvas node positions, cables and patch persistence, plain component state). Then one workbench-wide history, built on K1's single recording path, covering module parameters, the canvas patch and the desk. Requires: coalescing so one slider drag or typing burst is one step; exclusion of transient state (playback, hover, selection, view/scroll); bounded depth; session-only (no stored-shape change). Undo applies regardless of which view is visible (human decision: acting on a hidden view is fine). Undo/Redo buttons and shortcuts stay where K1 put them. The shortcut must work everywhere, including while focus is in a text box or number input (generator values are text boxes; Ctrl+Z after editing one must undo that change), so it calls preventDefault and uses the workbench history instead of the browser's per-field undo. Only skip it for events already default-prevented or with Alt held.
- Scout findings (2026-11-11) that fix the design:
  - Feasible without refactoring modules: record inside `usePersistentState` (setter value or updater, one `useState` per hook, persistence by effect). It has no external write path today, so add a module-level registry of `key -> setter` filled on mount; undo writes the previous raw value through the registered setter (and to localStorage if the hook is unmounted).
  - Record `(key, previousRaw, nextRaw)` per write; coalesce by time window and pointer-up, because no `onChangeEnd` exists anywhere (volume sliders, number inputs, text keystrokes, curve drag and piano roll view all write per tick).
  - Exclude by a flag on the key, not per module: mount/migration writes, and the transient keys (activeCompositionModule, compositionInspectorTarget, canvasSplit, detailCollapsed, workspaceView, inspectorOpen, settingsOpen, every roll/view/zoom/scroll/follow key, preview volumes/steps/units/gates/sounds, audition and selection keys).
  - Auto-resets (Interference `groupingId` reset, Mixer `channelState` prune and `framed` reset, Melodicization `framed` reset) must not create their own entries: exclude or fold into the triggering action.
  - Outside the hook and needing explicit wiring: global `compositionSettings` (transport, sounds); module delete (`removeCompositionInstanceStorage` removes raw localStorage keys directly, so undoing a delete must restore those raw values before the module remounts, since the hook reads storage only in its initializer); canvas positions commit on drag stop already, so they record once per drag.
  - Decision: the desk joins the global history and K1's `pastRef`/`futureRef` are retired; `applyChange` becomes a thin wrapper over the global recorder. There is one Ctrl+Z binding.
  - Pre-existing issues to fix on the way: two orphaned per-instance keys missing from the removal list (`pitchConvertOnChange`, `scaleConstructionIntervals.text`). Dead keys and the unused `savePatch` stay untouched.
- Acceptance:
  - [ ] Test: changing a module parameter (e.g. a generator value 5 to 6) then Undo restores 5, Redo restores 6
  - [ ] Test: a drag or typing burst coalesces into one undo step
  - [ ] Test: adding/removing a module and moving or connecting on the canvas are undoable
  - [ ] Test: desk changes remain undoable through the same history
  - [ ] Test: transient state (playback, selection, view) creates no history entries
  - [ ] Test: history is not persisted and does not change any stored shape
  - [ ] Scout report lists any state that cannot be covered, with a decision on each
- Human checkpoint after: yes (does undo feel like undo in other software?)
- Stop and ask if full coverage needs refactoring modules beyond routing their state through the shared hook.

### K2: Edit contract
- Scope: `commitSnippetEdit(snippet, newPacket, operation)` replaces the packet on the same id, adds an `edit-clip` (or named) provenance step to affected (added/modified) items, and goes through K1's history. Do not build the tree viewer here (K7).
- Version model (human decision, 2026-11-11): a clip keeps a stored derivation tree of snapshots, so any earlier state can be viewed, inspected and returned to at any time. Additive optional field on `Snippet` (no schema bump; v1 desks must still load): `lineage?: { head: string; versions: SnippetVersion[]; derivedFrom?: { snippetId; versionId; operation } }` where `SnippetVersion = { id; parentId: string | null; at: ISO string; operation: string; packet }` (design details are the builder's, but: a tree via `parentId`; the current packet is the head version; editing after returning to an earlier version creates a branch). Bounded per clip (count and/or size) with a pruning policy that keeps the tree connected and never drops the head. Never-edited clips store no lineage. Cross-clip derivation: Duplicate and Convert-to-pitch-classes record `derivedFrom` on the new clip. An edit may NOT change `kind`, `domain` or `encoding` (that is a new clip with `derivedFrom`, not an edit).
- Data operations in K2 (no UI): `commitSnippetEdit`, `restoreSnippetVersion` (same id, head moves to that version, undoable), and `createClipFromVersion` (new clip with `derivedFrom`). All through `applyChange`.
- Acceptance:
  - [ ] Test: an edit keeps the id, `createdAt` and name, changes the packet, and appends provenance
  - [ ] Test: a Make-source module for that snippet publishes the new packet after an edit
  - [ ] Test: the edit is undoable
  - [ ] Stored shape unchanged, or migrated per Parameters (stop-and-ask if a migration is needed)
- Human checkpoint after: yes (confirm the version/lineage model before building on it)

### K2b: Desk storage in IndexedDB
- Why (human decision, 2026-11-11): the lineage tree is meant to work like Google Docs version history: persistent across reloads and browsable to any point. localStorage (~5 MB per origin, shared by every key, UTF-16) cannot hold full-snapshot versions; reviewer found 2 edited 200-note clips fill the origin and that save failures are silently swallowed (`usePersistentState.ts` save effect, `history.ts` `writeStorage`), so a reload restores a stale desk. Chosen: keep full snapshots (K2 data model unchanged) and move the desk, lineage included, to IndexedDB. Rejected: session-only lineage; diff-based versions in localStorage.
- Scope:
  - Desk snippets (with lineage) persist in IndexedDB, not `hrifa.composition-workbench.desk.snippets.v1`. Small hand-written wrapper (no runtime library). Stored record keeps the v1 snippet shape and still passes `acceptsSnippets` on load.
  - One-time migration: on first load, if IndexedDB has no desk and the localStorage key holds a valid one, copy it in, then remove the localStorage key only after the IndexedDB write succeeds. Corrupt or newer data is left untouched, as today.
  - Async load: the desk shows a brief loading state until the first read resolves; no write happens before load completes (must never overwrite a stored desk with the empty initial state).
  - Writes are async, serialised (last write wins, no interleaving), and debounced lightly. A write failure is never silent: the desk context exposes a `persistError`, shown as a small warning on the desk ("Desk changes could not be saved." plus the reason; wording is a checkpoint item). Request `navigator.storage.persist()` once, best effort.
  - Undo/redo: desk changes stay in the single workbench history (one Ctrl+Z binding). The history must not keep whole-desk raw strings per step for the desk; record snippet-level before/after values (shared frozen references are fine) so memory stays proportional to what changed.
  - Snapshots (`snapshots.ts`): must not copy lineage into localStorage. Store desk heads only; restoring a snapshot must not destroy the lineage of clips that still exist (e.g. commit the snapshot's packet as a new version with operation `restore-snapshot`). Stop and ask if this gets messy.
  - Caps: rename `MAX_LINEAGE_BYTES` to `MAX_LINEAGE_CHARS`; raise per-clip bounds for IndexedDB (builder proposes values, e.g. 500 versions / 20M chars, and counts the head packet in the budget). Pruning rules from K2 stay (connected tree, never drop head).
  - Version coalescing: `commitSnippetEdit` accepts an optional coalesce key; a further edit with the same key within the same gesture or a short window replaces the head version instead of adding one (so one drag or typing burst is one version, as in Google Docs).
  - Reviewer lows from K2: fix the `desk.tsx` doc comment (provenance only on added/modified items); drop the unused `rootId` generation.
  - Test-only dev dependency `fake-indexeddb` is allowed (package.json / yarn.lock change, human-approved).
- Acceptance:
  - [ ] Test: desk round-trips through IndexedDB across a provider remount, lineage included
  - [ ] Test: a v1 desk in localStorage migrates once; the key is removed only after a successful write; corrupt data is not migrated or deleted
  - [ ] Test: nothing is written before the initial load resolves
  - [ ] Test: a failed write sets `persistError` and the warning renders; a later successful write clears it
  - [ ] Test: desk edits, restores and deletes remain undoable through the single history
  - [ ] Test: a snapshot does not contain lineage; restoring one keeps existing clips' lineage
  - [ ] Test: coalesced edits produce one version; non-coalesced produce one each
  - [ ] A 4096-event clip can be edited and saved
- Human checkpoint after: yes, combined with K2's (version model, warning wording, loading state)

### K2c: Saved projects and coarse versions
- Why (human decisions, 2026-11-11): (a) snapshots were always meant to be a "saved project", so opening one should replace the workbench like opening a file, not merge into the desk; (b) one version per drag was too fine. Version history should show how a clip got there (generate/capture, transform, edit session, restore), while undo keeps covering small steps within a session.
- Scope:
  - Rename snapshots to projects throughout the UI (proposed wording: "Save project", "Open project", "Delete project"; checkpoint item). Code names may follow (`projects.ts`), keeping a thin re-export only if needed.
  - Projects live in IndexedDB (own object store; extend `deskStore.ts` or a sibling module) and store the whole workbench: every raw workbench key as today plus the full desk including lineage. No migration of existing localStorage snapshots (human, 2026-11-11: none worth keeping); the old store is left untouched.
  - Opening a project replaces everything: workbench keys and the whole desk (with lineage) are written, then the page reloads. No merging with current clips: remove `restoreDeskHeads` / `restore-snapshot` merge logic. If the desk write fails or the desk is locked/loading, nothing changes (on screen or stored) and a clear message says so.
  - Unsaved work: track the current project (name, shown in the menu) and a dirty flag (any recorded history change since the last save or open). Opening another project while dirty asks: Save first / Discard / Cancel (wording is a checkpoint item; Mantine Modal).
  - Version rule: a new version is created only at meaningful moments: first capture or creation (lineage root when first needed), a transform or conversion applied, a restore, and the end of a hand-edit session. All `commitSnippetEdit` calls within one edit session amend the head version instead of adding one. A session ends on an explicit end (editor closed or another clip targeted; expose `endEditSession(snippetId)` for K3/K5 to call), on a different operation kind (e.g. a transform), or after an idle period (`EDIT_SESSION_IDLE_MS`, about 3 minutes). Undo granularity is unchanged and decoupled from versions: one undo step per gesture (existing 500 ms coalesce key), several undo steps can fall inside one version.
  - Caps stay as backstops (500 versions / MAX_LINEAGE_CHARS 20M).
- Acceptance:
  - [ ] Test: saving and opening a project round-trips the workbench and the full desk including lineage, via IndexedDB
  - [ ] Test: opening a project replaces the desk entirely (clips not in the project are gone, project clips keep their saved lineage)
  - [ ] Test: opening while dirty prompts; Cancel changes nothing; Discard opens; Save first saves then opens
  - [ ] Test: a failed or refused open changes nothing on screen or in storage
  - [ ] Test: many edits in one session make one version but several undo steps; idle timeout, `endEditSession` and a transform each start a new version
- Human checkpoint after: yes, combined with K2/K2b (wording, unsaved prompt, version granularity)

### K3: Generalise the bottom panel
- Scope: replace "active module id" as the only thing the bottom panel shows with an editor target (module instance or clip). Modules stay mounted and hidden as today. Add an editor slot for clips. A desk card double-click sets the target to that clip and expands the panel. Until an editor exists for a clip type the slot shows a clear "no editor for this clip yet" state.
- Acceptance:
  - [ ] Test: selecting a module still shows its editor exactly as before
  - [ ] Test: double-clicking a desk card targets that clip and expands a collapsed panel
  - [ ] Test: the panel works in both canvas and desk views and the hidden-view rule is unchanged
- Human checkpoint after: yes (layout and wording)

- Checkpoint decisions (human, 2026-11-11), applied as K3 attempt 2:
  - Empty-state wording and plain panel accepted for now.
  - While a clip is open, nothing else is selected: no module counts as active (inspector setup controls, Play selected / Space, canvas and inspector highlight, Melodicization `active`).
  - Never promote a module. Whatever is open stays open: deleting another module, clicking empty canvas, etc. leave the panel alone. If the open clip is deleted (or vanishes via undo or a project open), the panel shows a blank placeholder (as Bitwig/Ableton do), not a module. Same for deleting the open module: blank placeholder, no promotion of another module.
  - While a clip is open, the left inspector shows the clip (name and kind) instead of a module, as the seed of the clip inspector (K5b).

### K4: Clip types and New clip
- Scope: a clip-type registry (`kind`, `domain`, blank factory, editor id, playable flag). A "New clip" action on the desk with a type picker (notes first; add pitches, rhythm, list when their editors exist). Blank note clip: empty `events | note`, chosen length, linear frame, origin 0.
- Acceptance:
  - [ ] Test: every registered blank clip is a valid packet accepted by `acceptsSnippets`
  - [ ] Test: unsupported actions on an empty clip (convert, audition) refuse or disable cleanly
  - [ ] Test: adding a type to the registry needs no desk or persistence change
- Human checkpoint after: yes (type picker wording and placement)

- Checkpoint decisions (human, 2026-11-11), applied as K4 attempt 2:
  - Wording accepted as is (incl. the empty-desk text).
  - One-click New clip: clicking "New clip" creates a clip immediately with the default type and length. A secondary menu next to it (split button / chevron) sets those defaults (type, length in bars). The default is a per-viewer preference, not recorded in history and not part of projects.
  - Make source on empty clips: leave disabled for now (human undecided).
  - Per-clip length and timing editing belongs to the clip inspector (K5b), not to New clip.

### K5: Note clip editor
- Selection model (human, 2026-11-11, needed by K5b): a selection is both the selected items and the time range they occupy, and the range can extend over empty space (Bitwig: select a quarter note plus two quarters of empty space; duplicate then copies all 3 beats). Build the editor's selection as items + time range from the start, even if K5 itself only uses the items.
- Scope: extend `PianoRoll` with edit callbacks (add, move, resize, delete, velocity) so a clip editor can own no state beyond the packet; a `NoteClipEditor` that reads the clip's packet, applies edits via K2, and reuses `EditorPalette` tools and actions. Melodicization's roll must behave exactly as before.
- Acceptance:
  - [ ] Test: drawing, moving, resizing and deleting notes commit edits to the clip and are undoable
  - [ ] Test: existing roll consumers (Melodicization, Mixer) are unchanged
  - [ ] Test: edited notes keep stable item ids
  - [ ] A blank note clip can be filled from nothing and auditioned from the desk
- Human checkpoint after: yes (does it feel like a clip editor?)

- Checkpoint decisions (human, 2026-11-11): "it does feel like a clip editor". Applied as K5 attempt 2:
  - Ghost drag: while dragging a note to a new pitch/time, the note stays at its original place and a ghost note follows the pointer, its label updating live to the pitch under it; releasing commits the move (then the real note moves). Same idea for resize.
  - Regular DAW clip end: show bracket markers for the end of the clip's playback area; notes may extend past it (no clamping).
  - Full-width, resizable view: the roll (and later the velocity lane) spans the whole bottom-panel width and fills its height; the user can zoom horizontally and vertically and the roll resizes with the panel. Mouse wheel over the note area scrolls the keys up/down (Bitwig-style; a modifier for horizontal scroll/zoom per existing roll conventions).
  - Remove the "Edits are saved to the clip as you make them." text.
  - Reference layout (human screenshot): notes labelled with pitch name and coloured; bars.beats ruler with a loop band on top; velocity lane underneath with a stem plus round pin per note at its start, coloured like the note; a small overview strip at the bottom. Lane and pins are K5a; ruler/loop band are K5b.

### K5t: Bitwig-style editor tools (human 2026-11-11; after K5, before K5a)
- Tools selectable by number keys and from a tool menu:
  1 Pointer (cursor): select/move/resize; double-click an empty cell enters a note.
  2 Time selection: drag selects a time span, and everything in it (items + range, per the selection model).
  3 Pencil: single click enters a note.
  4 Paint can: drag paints notes at the current grid subdivision.
  5 Knife: click a note to split it at the clicked grid line (current subdivision).
  6 Eraser: drag over notes; each note crossed gets a diagonal-dashed fill while held; releasing deletes them (cancellable by Escape before release).
  7 Audition (play notes as clicked) and 8 Step input: later, not in K5t.
- Note entry in any tool that enters notes: without releasing, dragging left/right sets the new note's length and that length becomes the length for the next entered note (remembered per viewer, outside history and packet); dragging up/down sets its velocity.
- Grid subdivision control (needed by paint can and knife), reusing existing snap/grid UI if present.
- Every gesture is one undo step and a hand edit.
- Agreed behaviour (human, 2026-11-11):
  - 1 Pointer: double-click empty space adds a note; double-click a note deletes it (Bitwig); click/drag/marquee as K5.
  - 2 Time selection: drag a time span; selects the range plus every note starting inside it.
  - 3 Pencil: single click adds a note; before release, horizontal drag sets its length (remembered as the next note's length, per viewer, outside history/packet), vertical drag sets velocity with a % readout.
  - 4 Paint can: drag lays one note per grid step at the pitch under the pointer, each one grid step long.
  - 5 Knife: click a note to split it at the nearest grid line; both halves keep pitch and velocity (left keeps the id, right gets a fresh id).
  - 6 Eraser: sweep over notes; touched notes get a diagonal-dashed fill; release deletes them; Escape cancels.
  - Grid subdivision menu 1/1 to 1/32 plus triplets; drives snapping, paint can and knife.
  - Default tool on open: Pencil for an empty clip, Pointer otherwise.
  - Tool menu beside the grid control listing tools with their numbers; number keys 1-6 switch tools only while the roll has focus.
  - Mouse: Alt+wheel scrolls left/right (human); Shift+wheel also does; Ctrl+wheel time zoom and Ctrl+Alt+wheel pitch zoom unchanged.
- Acceptance (tests): each tool's gesture above commits the right edit as one undo step and a hand edit; entry length is remembered; knife keeps ids per the rule; eraser deletes only on release and Escape cancels; grid menu changes snapping; number keys switch tools only with the roll focused; Alt+wheel scrolls horizontally; Melodicization and Mixer unchanged.
- Human checkpoint after: yes (feel).

### K5t-2: Entry drag feel (human 2026-11-12, feel feedback on K5t; before K5a)
- Supersedes K5t attempt 2's dominant-axis lock for note entry: the press point is the origin of an x/y pad. Left/right sets length and up/down sets velocity, each with its own dead zone (4 px, taken off the travel so values leave the remembered one smoothly), both at once, neither locking the other out.
- Velocity is remembered like length: the last dragged velocity becomes the next entered note's velocity (per viewer, `hrifa.note-editor.v1`, outside history and packet). Example: drag to 38% and 1q, the next note starts at 38% and 1q. Applies to every mode that drags velocity on entry.
- Pointer tool: double-click and hold. The second press enters the note at the press point and the drag that follows sets length and velocity (same pad); the dblclick that follows must not delete the new note. A plain dblclick event with no preceding press (keyboard/test path) still enters a note.
- Pencil: single click places; both drags remain.
- Acceptance (tests): diagonal drag sets both and reports both remembered values; a click uses the remembered velocity; pointer double-press-and-drag enters one note with both set and deletes nothing; prefs round-trip entryVelocity.
- Feel feedback 2026-11-12 (after attempt 1): (a) a pointer-tool double-press-and-hold drag longer than ~500 ms entered a second, erroneous note at the release point, because the dblclick-swallow window was measured from the press; it must be measured from the end of the gesture (the dblclick fires on release). (b) Length while dragging is NOT additive to the remembered length (human, 2026-11-12, overrides attempt 1's relative rule): a plain click gives the remembered length; once the drag leaves the 4 px dead zone, length = max(one grid unit, snapped drag distance from the press point), so it grows 1/8, 1/4, 3/8 ... from the origin. Velocity stays relative to the remembered velocity.
- Process note: the first pass was written by the orchestrator directly, outside the builder/reviewer flow. Corrected by running the reviewer on it.
- Human checkpoint after: yes (feel).

### K5a: Velocity editing in the note editor (human 2026-11-11; after K5, before K5b)
- Velocity shown as note fill: each note's filled-ness reflects its velocity (Bitwig-style), using THEMING mark/tint roles.
- Lane look (human screenshot): per note a vertical stem with a round pin on top at the note's start time, height = velocity, coloured like the note.
- A velocity sub-panel (lane) under the piano roll, as in Bitwig/Ableton: one bar per note aligned to it in time; drag a bar to set that note's velocity; follows the roll's horizontal zoom/scroll; collapsible.
- Alt+drag (human 2026-11-12: keep Alt, not Ctrl+Shift) on a clicked note (or the selected group) adjusts velocity, showing the percentage while dragging. For a group, every note moves by the same offset, each clamped on its own at 0 and 100%: from 50 and 25, dragging down takes the 25 note to 0 and further dragging keeps lowering the 50 note past 25. Each note's value is its original value plus the drag offset, clamped, so dragging back up restores the relative spread.
- Each drag is one undo step and a hand edit (one version per session).
- Opt-in on PianoRoll so Melodicization and Mixer are unchanged unless the human asks for it there too.
- Human additions 2026-11-12 (superseded in part: later the same day the human dropped transparency, so velocity is shown by SATURATION ONLY, opaque at every velocity; no alpha, no element opacity): (1) velocity fill couples opacity with saturation: a soft note is both fainter and less saturated (greyer), a loud one full strength; use THEMING roles (color-mix toward the neutral/panel role), no raw hex. (2) A regular, persistent composition setting (workbench settings, `compositionSettings.tsx` + its panel, three-touch rule) "Color notes by scale degree": off = the current single note color, on = each note is colored by its scale degree, repeating every octave. Degree = round(pitchMidicents * edo / 1200) mod edo, counted from C (there is no key/tonic setting yet; an optional tonic is a later question for the human). Hues come from the THEMING categorical set (`--mark-<hue>` / `markHue`), assigned around the wheel in degree order so neighbouring degrees get distinct hues; with edo != 12 spread the hues over the degrees. The velocity treatment (1) still applies on top of the degree color. The lane stems/pins use the same color as their note. A tiny legend is not required.
- Degree palette (human 2026-11-12, from a Bitwig screenshot of all 12 pitch classes at 100 / 50 / 0% velocity): the hues are INTERLEAVED, not walked around the wheel, so adjacent pitch classes always read as different. Bitwig's hue by pitch class, to be matched with the nearest distinct THEMING hue (`markHue`, never raw hex): C pink, C# teal-green, D orange, D# blue, E yellow, F purple-magenta, F# light green, G red/salmon, G# cyan, A amber, A# lavender/indigo, B lime-yellow. The 12 theme hues are red, orange, yellow, lime, green, teal, cyan, blue, indigo, violet, grape, pink: assign all 12 distinct (C pink, C# teal, D orange, D# blue, E yellow, F grape, F# green, G red, G# cyan, A..B/A#: remaining lime, violet, indigo by nearest look: A# indigo, B lime, A violet is the weakest match, so builder proposes the best A and reports it). Velocity (Bitwig): 100% full colour; 50% darker and greyer but clearly the same hue; 0% dark, low saturation, still readable and still showing the hue. Make the velocity treatment reach roughly that look in both schemes. edo != 12: interleave by the same fifth-like step order (degree -> hue slot via a fixed permutation for 12, and a generic rule otherwise), documented in scaleDegreeColor.ts.
- Palette override (human 2026-11-12, own associations): E green, F orange, A blue, B violet are pinned. Table in use (human 2026-11-12: C yellow, A# pink): C yellow, C# teal, D grape, D# indigo, E green, F orange, F# cyan, G red, G# lime, A blue, A# pink, B violet (supersedes the Bitwig-matched table above; Bitwig is only the reference for the interleave idea and the 100/50/0% velocity look). One editable table; the human may swap entries at the feel check.
- Lane controls (human 2026-11-12, after trying attempt 2): (1) BUG: collapsing the lane leaves no way to reopen it; it must always be reopenable. (2) `V` toggles the lane open/closed (same rules as the tool number keys: only while the roll has focus, never while typing in an input). (3) The lane's height is resizable by a splitter that is the boundary line itself between the bottom of the piano roll and the lane: an invisible grab area (a few px tall, row-resize cursor, a subtle highlight on hover/drag is fine), pointer-capture drag, min height (about the header/one pin) and a max (a fraction of the panel), height remembered per viewer (`hrifa.note-editor.v1`), outside history/projects; double-click the splitter resets the default. (4) A toggle icon button sits in the gutter directly under the piano keys (aria-label, `aria-expanded`, tooltip showing the V shortcut); the roll's horizontal scrollbar sits BELOW the lane when the lane is shown (Bitwig: the lane emerges between the piano roll and the scrollbar; stack = roll, splitter, lane, scrollbar), starting at the right edge of the keyboard column (not under the keys); with the lane hidden it sits directly under the roll. The lane's right edge should match the roll's. The lane also draws the same vertical gridlines as the roll (same positions, scroll/zoom and grid setting), behind the stems and pins. Stems and pins follow velocity in colour exactly as their notes do (same velocityFill treatment and degree colour, also while dragging). Acceptance (tests): collapsed lane is reopenable by the icon and by V; V ignored in inputs and without roll focus; splitter drag resizes within min/max and persists, double-click resets; Escape/cancel mid-drag restores the starting height; the toggle icon is in the keyboard-width gutter; Melodicization and Mixer unchanged (all opt-in).
- Plumbing: PianoRoll gets an opt-in note-color mapping (a `noteColor(note)` callback or per-note `color`, which already exists in model.ts) and an opt-in velocity-fill prop; NoteClipEditor supplies them from settings. Melodicization and Mixer stay unchanged.
- Alt+drag stays the velocity gesture (human 2026-11-12); no Ctrl+Shift variant. Alt+wheel horizontal scroll is untouched.
- Acceptance (tests): fill style (opacity and saturation) is monotonic in velocity and applied only when the opt-in prop is set; degree-color mapping is a pure tested function (octave-repeating, wraps at edo, negative/microtonal pitches round consistently, covers every degree with a distinct hue at edo 12); the setting persists, defaults off, sanitizes bad values, and a stored blob from before the field loads with the default; the lane shows one stem+pin per note aligned in time with the roll (zoom/scroll follows), collapsible; dragging a pin sets that note's velocity as one undo step and a hand edit (selected group: same offset, each clamped, reversible by dragging back); Alt+drag on a note/group does the same with a percentage readout (no Ctrl+Shift variant); Melodicization and Mixer unchanged.
- Human checkpoint after: yes (look and feel; the degree palette especially).

### K5a-2: One unified roll + velocity panel (human 2026-11-12, after K5a attempt 3 FAILed review; new 2-attempt budget authorised by the human)
Design shift: the piano roll and the velocity lane are ONE panel, with the lane's visibility toggleable. Not two stacked widgets glued together.
- Unified canvas: the tool palette (EditorPalette) spans the full height of the unified panel (roll + lane), tools at its top edge as now. The lane's and the scrollbar's right edge therefore match the roll's by construction (no per-widget right-inset hacks). Stack: roll, splitter, lane, then ONE horizontal scrollbar at the bottom of the whole panel (below the lane; directly under the roll when the lane is hidden), starting right of the keyboard column. Collapsed lane: icon in the gutter under the keys; minimise the leftover header row.
- Scroll must be smooth: the jerky/bouncing feedback is a no-go. Known cause of the bug (reviewer, attempt 3): the roll's scroller and the separate HorizontalScrollbar each own a scrollLeft, mirrored through React state both ways; the bar is narrower than the roll (it ignored the 52 px palette), so its clamped max scrollLeft is lower, and its onScroll echoes the clamped value back into view.scrollLeft, which pulls the roll back (last ~53 px unreachable, bounce at the end). Fix by construction: ONE source of truth for horizontal scroll (prefer a single native horizontal scroll container for roll + lane so they scroll together with no JS mirroring; otherwise a controlled bar that never echoes programmatic sets and whose range equals the roll's), no two-way state sync. Acceptance: Shift/Alt+wheel, Ctrl+wheel zoom around the pointer, playhead follow, dragging the bar and trackpad can all reach the very start and end of the timeline with no bounce or snap-back; unit-test the sync/clamp case.
- Focus/keys: V (and the other roll shortcuts that make sense, e.g. tool numbers) work after clicking anywhere in the panel, including inside the velocity lane, because the panel is one focus scope; clicking a lane pin/background focuses it and keeps selection behaviour. V still ignored in inputs and with Ctrl/Alt/Meta.
- Ghost/preview colour: paint-can previews, pencil/pointer entry previews, and move/resize ghosts show the colour of the pitch (scale-degree colour, same velocity saturation treatment) they are on, when 'Color notes by scale degree' is on; moving a ghost recolours it as the pitch changes. With the setting off they use the single note colour (not the current accent blue unless that IS the single note colour; check what paint uses today and unify).
- Keys gutter wheel: wheel over the piano keys scrolls pitch like over the roll, and Ctrl/Meta+wheel there zooms the roll, never the browser page.
- Trackpad horizontal swipe / tilt-wheel (deltaX) scrolls the roll again. If it cannot be fixed cleanly, do not hack: leave it, and report the cause and a repro so the orchestrator records it as a known issue in PROGRESS.md.
- Splitter Escape: pressing Escape during a splitter drag cancels only the drag (restores height) and must not reach the roll's Escape handler (no selection clearing).
- Stored laneHeight is clamped to the effective max (fraction of the editor height) when rendered and when a drag starts; aria-valuemax shows the effective limit.
- Bar/lane scroll sets `framed` like the roll's own scroll.
- Acceptance additionally: Melodicization and Mixer unchanged (all opt-in); V after clicking in the lane; ghost colours follow the pitch under the pointer (test: paint and move previews carry the degree colour for their pitch); one gate run at the end.
- Human checkpoint after: yes. Budget: 2 builder attempts, then stop and report.
- Addendum (human 2026-11-12, small, one builder attempt): the Paint can inherits the remembered entry velocity like every other entry tool (not a hardcoded 0.8/1), captured at mouse down and held for every note painted in that stroke (vertical movement is pitch, it does not change velocity). Previews show that velocity's saturation; the committed notes carry it; paint does not itself change the remembered velocity. Test: paint with entryVelocity 0.38 commits all notes at 0.38 and the preview matches.

### K5b: Clip inspector: clip properties and transforms (human 2026-11-11; after K5)
- Why after K5: selection transforms and paste-at-position need the note editor's selection and cursor.
- Clip properties (Bitwig/Ableton-style, shown in the left inspector while a clip is open): total length in bars.beats.ticks format like other DAWs, playback start point, loop start/end (loop on/off), and an internal time signature (a new clip takes the project time signature at creation, human 2026-11-11; clips made before K5b take the project's when first shown). These are new clip fields: design them as optional additions (v1 desks still load; stop-and-ask if a schema bump is needed). Editing them is undoable and versioned like other edits.
- Transforms (human's list), each through `commitSnippetEdit` as its own version (not a hand edit), undoable, applicable per clip type via the K4 registry:
  - whole-clip scaling with quick x2 and /2;
  - selection scaling;
  - reverse (whole clip and selection);
  - make all values equal: dynamic and editor-dependent; one action per value type the editor shows (in the piano roll the user picks which: duration, pitch, velocity, ...);
  - duplicate (clip content / selection; the copy goes right after the selection, Ableton/Bitwig-style; distinct from the desk card's Duplicate);
  - legato, transpose, quantize, inversion, and rotation (rotation especially wanted) — human approved 2026-11-11.
  - copy and paste notes, pasting at the selected position in the editor.
- Acceptance: to be written with the human before building (exact semantics per transform, layout).
- Human checkpoint before and after: yes

### K6 (stretch): Rhythm and list clip editors
- Scope: scout first. The rhythm editor today is program/rule driven (`RhythmEditModule`) and the curve editor is prop-driven (`CurveEditor`). Decide which primitive editor each clip type needs (duration strip, value list) before building.
- Acceptance: to be written after scouting.
- Human checkpoint after: yes

### K7 (stretch): Lineage viewer
- Scope: a "History" button on a clip that opens a panel on the right showing the family tree of how the clip got there (K2's `lineage`: versions, branches and `derivedFrom` links), with preview/inspect of any version and Restore here, Create from this, and Open for comparison, using K2's data operations. Layout and wording are the human's call (checkpoint).
- Human checkpoint after: yes

## Final step
Update the desk and workbench-frame sections of `ARCHITECTURE.md` (clips, edit contract, editor slot, history), then run `reviewer` over the full diff.

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change would alter an existing persisted shape in a way that breaks saved desks (K2 may need this).
- Any change outside the scopes listed under Parameters, or to module math.
- Any decision about layout, wording or look beyond reusing existing patterns.

## Budget
Max 2 builder attempts per milestone, then stop and report.

## Facts from scouting (2026-11-11)
- `PianoRoll` is prop-driven but reports only selection and view; it has no note-edit callback. Used by Melodicization and Mixer.
- `CurveEditor` is pure props (points in, onChange out) and used only by Swirling Mists.
- `RhythmEditModule` (943 lines) is program/rule driven with about 12 persisted keys per instance; not a direct-manipulation grid as far as scouted.
- Bottom panel: `SplitStage`; active module is `activeCompositionInstanceId`; all modules stay mounted and are `hidden` when inactive; the panel is a sibling of the view grid, so it shows in both canvas and desk views. Nothing opens a desk card into it yet.
- No undo/redo anywhere in the workbench. Desk snippets live in `DeskProvider` as a plain array persisted under `hrifa.composition-workbench.desk.snippets.v1`.
- `TransportBar` (Play selected module, Stop all previews) is the top bar to extend for Undo/Redo.
- `Snippet.origin` and per-item provenance exist but nothing displays them; `PacketInspector` is unused.
