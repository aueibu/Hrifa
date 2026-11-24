# Vocabulary: the workbench speaks Blender (2026-11-23)

**Decided by the human, 2026-11-23.** The workbench takes Blender's names for the things Blender already named. The reason, in the human's words: "what I am trying to eradicate here was my knowledge gap that caused me to name something too specific so then when an exception comes up we have to walk it back. Blender seems to have solved it from its baseline." A name is general when it describes the role a thing plays, not the first content it held (a "clip" was first notes, so it was wrong for a rhythm or a pitch set).

**Baseline reset (human, 2026-11-23).** There are no saved projects to keep ("this is literally a new baseline"). Storage names, stored operation strings, schema versions and the IndexedDB database name may change with the vocabulary, with no migration and no read-old-data path. Old browser data simply stops being read.

Sources: `RESEARCH.blender.md` (the manual pages) and the Blender manual's own terms.

## Terms

| Workbench term | What it is | Blender term | Replaces |
|---|---|---|---|
| **Data-block** | The stored thing: id, type, name, computed users, payload | Data-block (ID) | Snippet, clip, "material" |
| **Data-block type** | What kind it is (Notes, Rhythm, Pitch set, Chord, Collection, ...). The type name is what the user sees; there is no generic noun like "clip". | ID type (Mesh, Action, Collection) | clip type |
| **Packet** | The payload of a musical data-block: kind, domain, frame, items with provenance. Also what travels along a connection between nodes. | the type's own data / a socket value | (unchanged) |
| **Collection** | A named set of references with role names (rhythm, pitch set, voicing). References, never copies. | Collection | bundle |
| **Users** | The computed count of who references a data-block (never stored) | User count | (new) |
| **Make single user** | Give this one user its own copy (the user count is the button) | Make Single User | "make unique" |
| **Remap users** | Replace a data-block for all its users (count shown first) | Remap Users | "replace everywhere" |
| **Data-block menu / field** | The shared picker, filtered by what the input accepts; the select-only variant is the field | Data-block menu / Data ID field | ClipSelector |
| **The desk** | Where data-blocks are kept | (the Blender File view) | (unchanged, human: "Desk is good for now") |
| **Tool** | A direct, interactive instrument that makes material (the harmonic lab, the clip editor's tools); never a node | Tool | instrument |
| **Node** | A live processor on the canvas | Node | module (processor) |
| **Node tree** | The canvas: nodes and their connections | Node tree | patch, canvas wiring |
| **Operator** | A one-shot action on a selection, with options adjustable after running (x2, invert, affine) | Operator (Adjust Last Operation) | operation, clip action, transform |
| **Modifier** | A non-destructive step that follows its sources and can be applied (frozen) | Modifier (Apply) | candidate for "realization", see below |
| **Strip** | A placement of a data-block on a track in time: start, length, crop, repeat, scale, extrapolation, mute | NLA strip | timeline block |
| **Track** | A layer of strips with mute, solo and lock; strips on higher tracks combine with lower ones by a blend mode | NLA track | lane |
| **Channel** | One aspect over time (pitch, velocity, volume, tempo) inside a data-block, shown as a row | F-curve channel (Dope Sheet row) | (new) |
| **Marker** | A named point or span on the time ruler shared by every time view; may be bound to a pitch context | Marker | section (meta lane) |
| **Workspace** | A saved arrangement of panels | Workspace | screenset |
| **Kept words** | `instrument` in `audio/` is the sound source (a synth voice, not a tool); `processor` is the SpessaSynth library class; **velocity lane** is the shared piano roll's own part (`VelocityLane`, `velocityLane` preference keys). These are not renamed. | (none) | (kept, B1c, W-56) |
| **Tweak mode** | Edit a strip's data-block in place while the timeline shows where it sits | Tweak mode | (new) |
| **Bake** | Freeze a modifier's result into a data-block | Bake / Apply | (unchanged) |

## Decided in the same session (human, 2026-11-23)
- **Realization versus Modifier.** The data-block type the user sees is **Modifier**; **realize** is the verb ("realize this strip"). Prose may still say "a realization" for a modifier's result.
- **Make source** becomes a **data-block node** (a node that references a data-block); the exact code name is chosen in B1b.
- **Packet** and the **version tree** stay.
- **Track versus lane.** The human: in this realm they are two separate things. Track stays (a layer of strips). The second word is **channel** (Blender's name for one animated aspect over time); see "Aspects over time" below. "Lane" is retired as a general word.

## Open
- **The meta item.** How the project-level things (sections, pitch context, tempo, meter, density) are modeled. Proposal in "Aspects over time" below; decided in B0 and T0 (not code yet).

## Aspects over time: how Blender does a "track" with pitch + rhythm + volume
Blender keeps three jobs apart, and each has its own word:
1. **Storing several aspects together.** An **Action** holds many **F-curve channels** (one per animated property: x location, rotation, a material color), optionally grouped, and since 4.4 split by **slots** that name the subject each part animates. In the Dope Sheet each channel is a row. One data-block, many aspects, no combining yet.
2. **Layering.** An **NLA track** holds strips of actions; tracks stack, and each strip's blend mode (Replace, Combine, Add, Subtract, Multiply) and influence decide how it merges with the tracks below, **per property**. This is "combine volume from two layers", not "combine pitch with rhythm".
3. **Computing one thing from others.** **Drivers**, **modifiers** and **constraints** derive a value from other data and stay live. This is the nearest thing to "a pitch set and a rhythm interact and produce notes".

Mapped to the workbench (proposal, judgement):
- A **collection** is job 1 for material (roles: rhythm, pitch set, voicing). An **Action-like** data-block type with **channels** (pitch, velocity, volume, tempo as curves) is job 1 for time-varying aspects.
- **Tracks** hold strips and layer them with a blend mode per channel (job 2).
- A **modifier** realizes notes from a collection's roles (job 3); a baked modifier becomes a Notes data-block.
- **The meta item is not a special lane.** In Blender the scene's own settings (frame rate, active camera) are animated like anything else, and **markers** switch them (a bound camera marker). The workbench equivalent: the **project's own data-block** (tempo, meter, pitch context) has channels, shown as a top track, and **markers** switch the pitch context. Sections are markers; tempo, density and register are curve channels on that top track. No new concept: the same strip, channel and marker machinery pointed at the project.

## Rename rules (for the rename milestones, B1a to B1c)
- Rename symbols with the TypeScript compiler's rename (language server or ts-morph), never with text search: "module" also means ES module, CSS module and Vite module, "patch" also means a code patch, "lane" and "clip" appear in unrelated words and in the Stage's and PianoRoll's own APIs.
- Persisted names change with the symbols (baseline reset): IndexedDB database and store names, record fields, stored operation strings (`capture-snippet`, `duplicate-snippet`), localStorage keys with the old words, `schemaVersion` back to 1. Document the new names in `ARCHITECTURE.md`.
- UI text follows at the same time (labels, hints, help, tests that query them). American spelling.
- One term per step, one commit per step, related tests only while building, one gate at the end of each step.
- Anything under `src/components/` (Stage, PianoRoll) or another page that uses the old word is shared: a lock row, and its own check (`check:stage`, `check:hfl`, Scale Explorer's tests) before the commit.
