# Composition Workbench: data model and current processes (for comparison with a proposal)

Self-contained. Written 2026-11-24 from the repo (`shell/src/pages/composition-workbench/`, `DECISIONS.md` W-44 to W-65). It states what EXISTS, what does NOT exist, and the rules the human works by. Stack: React 19, Vite, Mantine, TypeScript, Tone.js behind an own audio engine. Everything musical is pure TypeScript with no React or audio inside.

## 1. What the app is
A composition environment being rebuilt on Blender's architecture (vocabulary: data-block, users, make single user, node, node tree, operator, modifier, collection, workspace). The human composes with rhythm and pitch constructions (Schillinger-style interference, scale construction, JI and EDO tuning), tests them by ear, and wants to combine them into pieces. There are no saved projects to keep (baseline reset, 2026-11-23): no migrations, no backward compatibility.

## 2. Data that exists today

### 2.1 Packet (the payload of musical data)
```ts
DataPacket<T> { kind: 'value'|'list'|'tree'|'bank'|'events'|'layers'|'curve';
  domain: 'integer'|'rational'|'duration'|'onset'|'pitch'|'pitchClass'|'interval'|'note'|'boolean'|'symbol'|'text'|...;
  encoding?: 'midi-note'|'midicent'|'note-name'|'chromatic-12';
  role?: 'interOnset'|'pitchMaterial'|'pattern'|'parameter'|...;
  frame?: { topology: 'linear'|'cyclic'; unit: 'abstract'|'pulse'|'millisecond'|'beat'|'quarterNote'; extent; origin; grouping? };
  items: { id (stable); value: T; provenance[] (source node, source item id, transformation, params) }[];
  warnings: string[] }
```
Kind = structure, domain = meaning, frame = where it lives. Items keep stable ids and provenance through transforms. Pitch is stored as midicents (fractional allowed, W-44), optionally with `exact` identity (monzo or EDO step). Time is exact rationals in quarter notes (960 display ticks; bars.beats.ticks is a formatter, not storage). Amplitude is 0 to 127 (W-62; migration from 0 to 1 `velocity` pending).

### 2.2 Data-block (registry, built R0 to R3, W-59 to W-65)
One stored envelope for everything kept:
```ts
{ schemaVersion: 2, id, typeId (STORED, never inferred), name, note?, createdAt, origin?,
  payload: { kind:'packet', packet } | { kind:'record', data },   // packets also carry `lineage` (a version tree)
}
```
A **type def** is registered with one call: `id, label, payload kind, family ('pitch'|'time'|'placed'|'composite'|'generic'), channels (subset of onset, duration, pitch, amplitude, timbre), createBlank, preview, editorId, operators, audition {refuse?, build}, duplicate?, isEmpty?`; packet types carry `accepts(packet)`, record types carry `validate`, `refs(data)->{slot,ref}[]`, `mapRefs`. Nothing branches on a type id.
Registered now (all packets): Notes (`events|note`, has editor and operators), Pitch set, Pitch classes, Rhythm, Values, generic List, generic Bank. No record types yet (Collection was planned as R4).
- **References and users.** A `Ref` is `{id, version?}`. Users are COMPUTED by walking referencers, never stored (Blender's user count). Operations (pure, `dataBlockRefs.ts`): users, delete impact, unlink, make single user, remap users, unused, purge. All run through one undo-grouped apply helper (one operation = one undo step).
- **Conversions** are explicit pair-level (`registerConversion`), never automatic. The picker lists exact matches, then a separate "Reinterpret as" list.
- **Audition** (per type, pure): builds ONE cycle as a musical `PerformancePlan` (exact rational positions); looping is the control's job; listener settings (mode, base octave, offset, loop) are per viewer, never stored in the data-block. The transport swaps in tempo.
- **Desk** = the Blender File view: lists all data-blocks with users, filter Unused, Purge, Play, Make single user, Replace everywhere. Stored in IndexedDB. Undo history exists for desk and canvas.

### 2.3 Nodes and the canvas (the generators)
- A **node** is a pure function `(persisted state, picked inputs, context) -> published outputs` (W-45), run by a runtime outside its view with memoization (`runtime/evaluators/*`: interference, fractioning, pair composition, rhythm list/edit, pitch list, scale construction/evolution, arithmetic, householder, melodicization, swirling mists, Make source). Outputs are `DataPacket`s. Ports route outputs to inputs (one binding per port).
- The **canvas** (node tree) is a SINGLETON: node instances and routes live in browser localStorage, not in the registry. It is a playground: change parameters, listen, then **Send to desk** captures a node's output packet into a NEW data-block (type chosen once at capture time, `chooseTypeId`). After that the data-block has no link to the node or parameters that made it (`origin`/`lineage` only record provenance).
- **Make source** node: a canvas node that reads a desk data-block by reference (blank, missing and present states).
- Node packets are NOT yet all registry types: six node outputs became capturable only through the generic List and Bank types.

### 2.4 Other pieces
- **Operators** (one-shot actions on a data-block's items, change it and stay): transposition, x2, invert, affine, etc.; the **chord tool** is an edit-mode operator on Notes (click a pitch or an existing note, pick a chord from the project's pitch set, voicing rules, insert as ordinary notes).
- **Note editor** (piano roll) edits a Notes data-block (edit mode). **Stage**: dockable panel workspaces (split, tabs, layouts saved as data; modules receive a size).
- **Audio engine**: `PerformancePlan` (musical timebase of exact rationals, or seconds timebase for deliberate wall-clock auditions), loop, buses, instruments, global transport (tempo, meter, pulse, metronome, count-in).
- **Project settings**: tempo, meter, pitch set (the "key" for chord offers), sounds.

## 3. What does NOT exist
No Scene, no Object (a placement with transform and data pointer), no hierarchy or parenting, no modifier stack, no node tree as a data-block (canvas is a singleton), no evaluation of "an object over a time span" (nothing re-evaluates a stored data-block when its source changes), no Outliner or Properties editor, no timeline or arranger, no Collection type, no stable per-event ids ACROSS re-evaluation (items have ids within a packet), no selection masks, no overrides, no loop/stretch mapping of a pattern across a span (audition loops one cycle only).

## 4. Current workflow (what the human does)
1. Tune parameters in nodes on the canvas, listen, pick something good.
2. Send to desk: a fixed data-block.
3. Edit it by hand (note editor, operators, chord tool) or combine on the canvas via Make source.
4. Play from the desk card.
Limitation (the problem to solve): the canvas is a playground, a desk data-block cannot stay live to the node that created it, and nothing yet places data-blocks in time to build a piece.

## 5. Direction the human has chosen (not built)
Blender-faithful structure, in this order: (1) Object and Scene as registered record types (parent, time span, register span, one primary data-block slot, mapping Loop|Stretch|One-shot, modifier list; empty objects are silent), with Outliner and Properties panels in the Stage; (2) a pure memoized evaluation of an object into a `PerformancePlan`; (3) native modifiers (Transpose to pitch set, Harmonize via chord engine, Melodicize) plus Apply (bake to a Notes data-block); (4) node tree as a data-block and a Node Tree modifier (existing nodes unchanged, Group Input/Output interface); (5) arranger as a VIEW of objects, markers, grouping collections, masks over item ids. Confirmed rules: loop is the default mapping; a child's start is relative to its parent; deleting a used data-block leaves a BLANK slot (never falls back to another); empty objects play silent; a hand-edit of a live (modified) block asks to Apply first (no override layer initially). Leaning: mapping happens AFTER the node tree (tree outputs one cycle; the object loops or stretches it).

## 6. The human's working rules (a proposal must respect them)
- Nothing moves or resizes on any state change (fixed layout); pages fit the window, panels scroll inside.
- No tonal language in JI work (a:b:c, 1/(a:b:c), no major/minor triad or inversion words).
- Direct path first: any DAW-style task works with zero nodes; the node tree is the optional advanced layer.
- Behavior first: concrete scenario tables with examples where the options DIFFER, confirmed before building; thin slice for anything judged by eye or ear.
- American spelling. Plain language, exact button names.

## 7. Questions to answer when comparing
1. Which of the five steps in section 5 does the proposal reorder, merge or drop, and why?
2. Where does it put evaluation (what is the depsgraph equivalent), and what is cached and invalidated by what?
3. Does a node tree receive the object's time span, or does mapping happen after it? Show the clave example (3:2, 4 beats, in a 16-bar object).
4. Is hierarchy parent-child, collections, or both, and how does time inherit?
5. What stays a one-shot operator and what becomes a live modifier (chord insert vs Harmonize)?
6. How does the canvas become many node trees without losing the playground?
7. What does the proposal require that section 2 does not already provide?
