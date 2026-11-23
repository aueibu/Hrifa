# Design: the data-block model (B0, 2026-11-23)

**Status: DESIGN with a recommended answer on every scenario row. The human steers: "ok" or change rows.** Nothing here is built. Vocabulary is `VOCABULARY.md` (W-51). Code names below are still the OLD ones where they point at existing code (Snippet, clip, module, patch); B1a to B1c rename them. Facts come from a scout's read of the code (2026-11-23), spot-checked by the orchestrator; "not verified" marks what the scout did not open.

## 1. What exists today (inventory)

The workbench has **five separate identity systems**, none of which knows about the others:

| Thing | Identity | Lives in | Who points at it |
|---|---|---|---|
| Desk Snippet (will be a data-block) | `snippet-<base36 time>-<rand>` | IndexedDB `desk-clips` | a Make source instance (`snippetId`), `lineage.derivedFrom`, `origin`, the editor target |
| Canvas module instance (will be a node) | `<moduleId>-<uuid>`; three defaults have fixed ids | localStorage `ui.instances.v3` + one state key per instance | route bindings (`source: {instanceId, port}`), the inspector target |
| Connection | a binding **inside the receiver's route state**, not an object of its own | localStorage `routing.module-routes.v1` | the receiver |
| Screenset panels | panel names as strings (`canvas`, `desk`, ...) | localStorage `ui.screensets.v1` | none |
| Settings, per-viewer preferences | singletons / fixed keys | localStorage (project keys under `hrifa.composition-workbench.`; viewer keys outside it) | none |

References between things today (all by id string): Make source to a desk clip; a derived clip to its source clip and version; a clip's `origin` to a module instance (information only); the editor target to a clip (a missing clip just closes the editor); route bindings to node instances (a missing one shows "missing"). **There is no cascade anywhere.** Deleting a clip filters it out of the desk and nothing else runs; a Make source that pointed at it stays on the canvas, publishes nothing, and its receivers say "missing source" (by design, and the desk's delete confirm already says so). **Nothing computes who uses a clip.**

Registries today: `clipTypes.ts` (`ClipType`: id, label, kind, domain, encoding, editorId, playable, actions, createBlank) with **exactly one registration, Notes**; so a rhythm or pitch-set packet on the desk has no type (`clipTypeOf` returns undefined) and "Only note snippets can be auditioned". Node types have their own registry in `runtime/moduleRegistry.tsx`. A second registry in `registry.ts` (the old patch model, `PatchDocument`, `Connection`) may be dead code (to check in B1b). The accepts logic (`acceptsPacket` and `packetMatches`) exists twice; `signalTypeFor` hard-codes its dispatch order instead of looping the registry.

## 2. The model

**A data-block is the envelope; its payload depends on its type.**

```
DataBlock {
  id            // stable, never reused
  type          // registered type id: 'notes' | 'rhythm' | 'pitch-set' | 'collection' | 'modifier' | ...
  name          // user-visible, editable
  data          // the payload: a DataPacket for musical types; the type's own typed record for the others
  lineage?      // the existing version tree (kept: Blender has no counterpart)
  origin?       // where it was captured from (information only, never a user)
}
```

- `users` is **computed, never stored**: a pure function counting references to the id from every registered *referencer* (below). It is shown wherever a data-block is named once it is above 1.
- The payload contract is unchanged. `DataPacket` (kind, domain, encoding, frame, items with provenance) stays exactly as it is; so do the evaluators and the three axes. The rework is around the packet: identity, types, references, pickers.
- **Nodes are not data-blocks.** As in Blender, a node belongs to a node tree and is not an ID (bones belong to an armature). A node *references* data-blocks. Making the node tree itself a data-block (several canvases, a node tree reused as a group) is the door Blender shows and is left open, not opened now (row S11).

### Registration (extends `clipTypes.ts`; one registry for data-block types)

```
registerDataBlockType({
  id, label,
  payload: 'packet' | 'record',
  accepts(packet)        // for 'packet' types: kind/domain/encoding match (replaces clipTypeOf's filter)
  validate(data)         // for 'record' types
  createBlank(request),  // New
  preview?,              // the thumbnail renderer (SnippetPreview today)
  editorId?, playable?, actions?,   // as today
  audition?(data),       // default audition plan, so any data-block can be heard with no wiring (see 'Direct path first')
  refs?(data): Ref[],    // what this type's data points at (collections, modifiers, strips): feeds users
})
```

A new type is **one registration**. The desk, persistence, capture, the picker and the delete check never branch on type (today's rule, now made true for types other than Notes). A new **node type** keeps its own registry (nodes are not data-blocks) but declares which data-block types its inputs accept, using the same `accepts`, so the picker filters the same way. The duplicated accepts logic and `signalTypeFor`'s hard-coded order are folded into the registry in B1.

**First types to register** (so every existing packet has a type and the picker can filter): Notes (`events | note`, exists), Pitch set (`list | pitch`), Pitch classes (`list | pitchClass`), Rhythm (inter-onset `list | duration`, and rhythm patterns), Values (`list | integer/rational`), Collection (record), Curve (packet kind `curve`, row S13), Steps (S13, shaped in T0). A "chord" is a Pitch set with a role until a case shows it needs its own type.

### References and users

- A reference is `{ id, version? }` (version optional: pinned or following head).
- A **referencer** is anything that registers a function `refs(owner) -> Ref[]`: a data-block node (its source), a collection (each role's entry), a strip (the data-block it plays), a modifier (its inputs, the derivation proposal's `inputs`). `users(id)` walks the registered referencers over project state and returns each user with a label ("Ring A (node)", "bar 9 (strip)", "Fit 2 (input 'chord')").
- **Not users:** `origin` (information only today), `lineage.derivedFrom` (history, not use), the editor target, the inspector target, a pin. Deleting a data-block never breaks any of these.
- **Delete impact** is `users(id)` shown before a delete; **unlink** removes one user's reference; **delete** removes the data-block (row S1); **make single user** duplicates and repoints one user (S2); **remap users** repoints all users (S5).

### Collections (the human's "rhythm + pitch + voicing stored together")

A collection is a data-block of type Collection whose data is an ordered list `{ role, ref }` ("rhythm", "pitch set", "voicing"), references and never copies. It is **the same shape as a modifier's `inputs`** in `PROPOSAL.derivation-graph.md` (`{ role, clip, version, pick }`): one schema serves both, with `version` and `pick` optional. A strip may play a collection (a collection instance); "make real" splits it into one strip per entry.

### What does not change
`DataPacket` and its axes; the evaluators; the version tree and edit sessions; the history recorder; the exact-rational time and midicent pitch contracts; per-viewer preference keys. What changes with the vocabulary (baseline reset, no migration): the IndexedDB database and store names, record field names, stored operation strings (`capture-snippet`, `duplicate-snippet`, ...), `schemaVersion` back to 1, localStorage keys that carry old words. Old browser data is simply not read.

## 3. Scenario table (recommended answer per row)

Cast: data-block **R** = Rhythm "Clave" (used by a data-block node N1 on the canvas, by collection C1 as its "rhythm" role, and by a strip S1 on the timeline later); **P** = Pitch set "Ring A"; **M** = Notes "Melody". "Users" = N1, C1, S1.

| # | Case | Options and what each does to the example | Recommended |
|---|---|---|---|
| S1 | **Delete R while it has 3 users.** | **A. Delete, users show "missing" (today's behavior)**: R is gone; N1 publishes nothing and says "missing source"; C1 keeps its "rhythm" role with a missing marker; S1 stays on its track, drawn as missing, silent. **B. Delete unlinks everywhere (Blender)**: N1 becomes empty, C1's rhythm role is cleared, **S1 is removed from the arrangement**. **C. Refuse while used.** | **A**, with the confirm listing the three users ("Used by 3: Clave node, Collection C1, strip bar 9") and the same two-click delete. Reason: B silently deletes arrangement; C makes cleanup tedious. Unlink (remove one reference without deleting R) is separate. |
| S2 | **Make single user from S1's count.** | R is copied to "Clave (variation)" (`derivedFrom` R), only S1 now points at the copy. N1 and C1 still use R. Count on R goes 3 to 2; the copy shows no count. (Alternative: the copy goes to everyone else and S1 keeps R: gives the same result for the user but renames the original: rejected.) | As described (Blender's behavior). |
| S3 | **Edit R from S1 (tweak mode): change note 3.** | **A. Shared**: N1, C1's rhythm and S1 all hear the change. **B. Copy on edit**: only S1 changes. | **A** (references, "edit once, every use follows" is the arc's own goal). The count shows before you edit; Make single user is the way out. |
| S4 | **Remove R's entry from C1** | R's users 3 to 2; R stays on the desk. Different from S1 (delete) and S5. | Unlink only. |
| S5 | **Remap users: R to R2.** | N1, C1, S1 all point at R2; R has 0 users and stays on the desk. (Count is shown first: "Replace Clave in 3 places?") | As described. |
| S6 | **R now has 0 users.** | **A. Stays on the desk** (keep list). **B. Dropped on save (Blender).** | **A**, with an **Unused** filter and a manual **Purge** that lists what it will delete. Nothing is dropped automatically. |
| S7 | **D was derived from R (lineage), R deleted.** | D is untouched; its "derived from" shows R as missing. D does **not** count as a user of R. If D were a *modifier's result* with R as an input, the modifier counts (its input is a reference). | Lineage is history, not use. Modifier inputs are use. |
| S8 | **Picker filtering.** An input accepting Pitch sets, with desk items "Ring A" (Pitch set), "Clave" (Rhythm), "Melody" (Notes). | **A. Lists only Ring A.** **B. Lists Ring A and Melody** (Notes can be read as pitches). | **A** by default; each input says explicitly if it also accepts another type (an input that reads pitches from notes declares Notes too). No silent reinterpretation. |
| S9 | **New type, e.g. Chord progression.** | One registration (payload type, accepts, blank, preview). Desk, picker, delete check need no change. | As described. |
| S10 | **A modifier's output notes.** | Derived, never stored (arc rule): no data-block, no users. "Bake" writes a Notes data-block with `derivedFrom`. | As described. |
| S11 | **Is the node tree a data-block?** | **A. No, one canvas as today.** **B. Yes now**: several canvases, tree reuse. | **A**, door left open (nothing in B1 or B2 depends on it). |
| S12 | **Does the project itself have a data-block** (tempo, meter, pitch context as channels; markers switch them)? | A. Yes: the "project" data-block with channels; the meta track shows it. B. A special meta lane type. | **A**, decided in T0 with scenarios; B0 only reserves the type. |
| S13 | **A drawn curve that shapes other material** (gradual transposition of Notes C4 D4 E4 G4 on beats 0 to 3 by a curve rising 0 to +200 cents over four beats; or a volume swell). | **A. Curve as a data-block, applied by a modifier** (`source`, `curve`, blend mode Replace, Add or Multiply): result 6000, 6250, 6500, 6850 (sampled at each onset). **B. NLA-style blend of two tracks**: works only when both are continuous channels on the same property (two volume curves, one Multiply over the other); Notes have no pitch channel to blend into. **C. Fold the curve into the notes' own data**: loses the curve (cannot redraw, reuse or count users). | **A** for discrete content (Notes, Pitch sets); **B** for continuous channels (volume, tempo). The curve is a data-block of type Curve (packet kind `curve`, the frame says the axis: time, pitch or index). Open for T0 with examples: sample at the onset (the four values above) or glide within the note (pitch bend). |

## 4. Orchestrator-decided (logged `orchestrator-decided`, vetoable)
- One registry for data-block types, extending `clipTypes.ts` (no second registry); node types keep theirs and use the same `accepts`.
- The first registered types: Notes, Pitch set, Pitch classes, Rhythm, Values, Collection.
- Users come from registered referencers (`refs(owner)`), not a hand-written list, so a new referencer type cannot forget to count.
- Duplicate accepts logic and `signalTypeFor`'s hard-coded order are folded into the registry in B1 (a behavior-preserving cleanup, covered by the existing compatibility tests).
- `registry.ts`, `PatchDocument` and `Connection` (old patch model) are checked for liveness in B1b and deleted if dead.
- Names: `DataBlock`, `registerDataBlockType`, `dataBlockUsers`, `DataBlockMenu`, `DataBlockField`; the project-level module for references `dataBlockRefs.ts`.

## 5. Decisions (human, 2026-11-23)

| Row | Answer |
|---|---|
| S1 | **A**: delete, users show "missing"; the confirm lists the users. |
| S2, S3, S4, S5, S6, S9, S10, S12 | As recommended. S12: **A** (the project has its own data-block; decided with scenarios in T0). |
| S7 | As recommended (lineage is history, not use). Question raised: can lineage recreate a removed ancestor, and should it? See "Open follow-ups" below. |
| S8 | As recommended, **plus a submenu** in the picker: the main list shows exact matches; a second list, "Reinterpret as ...", shows types the input could read after an explicit conversion, each saying what the conversion does (Notes to Pitch set drops the timing). Never silent. |
| S11 | The human could not answer as asked; the underlying worry is wiring "80 things to get a scale to play". Answered by the **direct path first** rule below. The node tree stays one canvas (A) for now. |
| S13 | **A and B**, plus a second shaper type: **Steps** (discrete steps over continuous content: stepped volume, filter) beside **Curve** (a smooth shape read at note onsets for discrete content, or continuously). Bitwig's curves/steps distinction is made in the data-block itself. Onset versus glide is decided in T0 with examples. |

### Direct path first (rule, human worry 2026-11-23)
The node tree is the **optional advanced layer**, not the way to get anything done. Everything a DAW user does must work with **zero nodes**: a data-block can be edited in its own editor (the piano roll edits a Notes data-block directly), auditioned, placed on a track as a strip and played. Blender precedent: you do not wire nodes to move a cube, and a new material arrives with its default node tree already connected. Concretely:
- Each data-block type registers a **default audition** (`audition(data) -> PerformancePlan`): Notes play as written; a Pitch set plays as an ascending scale; a Rhythm plays as clicks; a Collection plays its roles realized by the default modifier. Today only Notes can be audited ("Only note snippets can be auditioned"); B1 registers the rest.
- A track plays strips through a **default sound** with no routing step; nodes (the Mixer and the rest) add live processing only when the user asks.
- **Acceptance test for the arc (B2 and T4):** from a Pitch set data-block "C major" on the desk to hearing it, no wiring: audition it from the desk, drag it onto a track, press Play. Anything that needs a connection to do this is a bug in the plan.

### Open follow-ups
- **Can lineage recreate a removed ancestor?** Today no. A derived data-block holds a pointer (`derivedFrom`: source id and version id) and the pitches as heard; it does not hold the ancestor's content, and its items' provenance names source item ids, not their values. So once the ancestor is deleted, it is gone, except for **undo** (session history) and a project saved earlier. Should it be recoverable? Recommendation: **not automatically.** Storing a snapshot of every input inside every descendant costs space on every derivation to cover a rare case, and the version tree already caps at 500 versions. Better: (1) the delete confirm names descendants, so you see what would lose its source; (2) a descendant keeps its pitches, so nothing audible is lost; (3) the derivation proposal's "snapshot plus recipe" later lets a descendant **rebuild a missing input's *recipe***, not its content. If you want recoverability, the cheap version is a "Recently deleted" holding area on the desk that keeps a deleted data-block until Purge. Logged in BACKLOG as a question; decide when the derivation arc starts.
- **Steps type**: its payload shape (a list of values on a grid, frame in pulses or quarter notes) is designed in T0 with examples, together with Curve.
