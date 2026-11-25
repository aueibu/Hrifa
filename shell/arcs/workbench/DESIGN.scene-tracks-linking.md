# Design Note: Scene, Collections, Tracks, Objects, and Linking

Consolidated from the 2026-11-25 design discussion for the workbench arc (`shell/arcs/workbench/`).

**Status (human, 2026-11-25): approved.** Recorded as `DECISIONS.md` W-82; planned as TK0 to TK2 in `ARC.md`. In section 3 a Track is an organizational row that holds Objects (no strips, no blend modes); `VOCABULARY.md` is updated to match. Scenarios, a consumer table and a static mock come before any code (TK0).

---

## 1. Properties Panel: Linked Object vs. Linked Data Picker

In Blender's Properties editor, both the **Object** tab and the **Data** tab show an ID selector at the top:
- **Object tab ("Choose object to be linked"):** Swaps which `Object` data-block sits in the active scene/collection slot (because in Blender, an `Object` is itself a shareable ID block that can belong to multiple scenes or collections).
- **Data tab ("Mesh data to be linked"):** Swaps which `Mesh` (or Curve/Light/etc.) data-block the current `Object` points to, keeping the `Object`'s placement, parent, and modifiers intact.

### Decision for Hrifa
- **The Object-tab "choose object to be linked" picker is redundant** and should stay omitted.
  - In Hrifa, an `Object` (`ObjectData` in `scene/sceneTypes.ts`) is **one placement** in time (`timeSpan`, `parentRef`, `mapping`, `modifiers`), not a slot shared across scenes. Swapping which `Object` you are inspecting is done by selecting a different block in the Outliner or Arranger; renaming it uses a plain `Name` text field (`ScenePanels.tsx`).
  - Even when two placements share musical material, they almost always need independent `Start`, `Duration`, or `Modifiers`—meaning they are **two separate `Object`s**, not one `Object` linked into two tracks.
- **The Data-tab picker (`Data` / `primaryDataRef`) is the non-redundant link picker** (already implemented as `DataBlockMenu` in `ScenePanels.tsx`). It lets multiple `Object` placements share one underlying musical `Data-block` (Notes, Rhythm, Pitch set, etc.) while keeping independent positions, lengths, and modifier stacks.

---

## 2. Keeping `Object -> Data-block` (No `Strip` Layer)

Dropping the `Strip` middle layer in **W-77** (reversing **W-75**) was the right call:
- Blender needs `Object -> NLA Track -> Strip -> Action` because a 3D `Object` (e.g., a character rig) has no inherent timeline until animated, and can blend multiple strips across NLA tracks.
- In a music arranger, the timeline block **is** the primary object you select, name, parent, and put modifiers on. Keeping `Strip` created two property levels and `{ objectId, stripId }` plumbing for a single block.
- **`Object -> Data-block`** is the clean 2-level model.

---

## 3. Separating `Collection` from `Track`

Currently (**W-77 / W-78**), `1 Collection = 1 Arranger lane`, and overlapping blocks on that lane use `ObjectData.lane` (sub-lanes). Because one instrument or part (e.g., Violin, Piano, Synth) often needs **multiple simultaneous lines** (chords under melody, left/right hand + pedal), `Collection` is wearing two hats: Blender group and timeline lane.

### Cleaner target hierarchy
Keep **Collection** and **Track** as separate concepts, while keeping **`Scene`** big (a movement or self-contained dramatic section of a piece, never an 8-bar loop):

```text
Project
  └─ Scene ("Movement I")                   ← Large movement / section (stays big)
       └─ Collection ("Strings" / "Piano")  ← Blender-style group / instrument bus (mute, fold, organize)
            └─ Track ("RH", "LH", "Pedal")  ← Horizontal timeline row in the Arranger
                 └─ Object                  ← Single block on a Track (Start, Duration, Parent, Modifiers, Mapping)
                      └─ Data-block         ← Shareable material (Notes, Rhythm, Pitch set, Node Tree)
```

- **Collections** stay true to Blender: pure groups/folders that can contain Tracks and/or nested Collections.
- **Tracks** are first-class timeline rows (replacing `1 Collection = 1 lane` and the anonymous `ObjectData.lane` sub-lanes).
- **Objects** still point directly to **Data-blocks** (no `Strip` layer).

---

## 4. How Reuse & Linking Work Across Scales

| What you want to reuse | Mechanism | What stays linked | What stays independent |
| --- | --- | --- | --- |
| **Raw musical material** (notes, rhythm, pitch set) across placements | **`Duplicate Linked`** + **`Data` picker** (`primaryDataRef`) | The `Data-block` payload | `Start`, `Duration`, `Track`, `Parent`, `Modifiers`, `Mapping` |
| **Live modifier / generator graph** across placements *(Geometry Nodes model)* | **`Node Tree` data-block** referenced by a modifier | The live `Node Tree` graph | Each `Object`'s `Start`, `Duration`, `Data` input, and per-object modifier params |
| **Multi-part material on 1 Track** | **`layers` Data-block** (already in `ARCHITECTURE.md` `DataPacket`) or `Node Tree` on one `Object` + `Duplicate Linked` | All simultaneous streams in the single `Data-block` | Placement and outer `Object` modifiers |
| **Multi-track + multi-object + timing + modifiers as one unit** (e.g., a 3-track Piano phrase at Bar 1 and Bar 17) | **Current (flat):** `Parent` + `Duplicate Linked` | Only each child's `Data` (and later `Node Tree`s) | Relative timing of the 3 children and per-object modifiers are copied, not linked |
| *(Optional future)* **True linked multi-track section/phrase stamp** | **`Collection Instance`** (or **`Pattern`/`Phrase`** data-block) + **Tweak Mode** (`VOCABULARY.md`) | All internal Tracks, Objects, relative timing, and modifiers | Outer `Start`, `Duration`, and outer modifiers on the instance |

### Recommendation for the arc
1. **Keep the `Data` picker only** in Object Properties (no Object-level "choose object to be linked" picker).
2. **Keep `Scene` big** (movements/sections) and **keep `Object -> Data-block`** (no `Strip`).
3. **Separate `Collection` (group) and `Track` (timeline row)** when ready to replace `ObjectData.lane` sub-lanes with real named Tracks per instrument/group.
4. **Defer `Collection Instance` / `Pattern` + Tweak Mode** until needed in actual composing—**shared `Data` + shared `Node Tree`** covers single-object and single-track reuse without adding nested timeline editing upfront.
