# SCENARIOS: Tracks and Collections (TK0)

Status: CONFIRMED by the human (2026-11-25): all scenarios as written, Q1 to Q8 all A, view A. One change: a child on another Track (or in the Outliner generally) shows an ICON for "child of <parent>"; clicking it selects the parent so Properties shows it (scenario 9, Q7). Nothing is built. Source: `DESIGN.scene-tracks-linking.md`, `DECISIONS.md` W-82, `ARC.md` "TK0 to TK2". Tests will come from the table in section 2 once confirmed, never from a case where the options coincide.

Words used here: **Collection** = group (mute, fold, nesting). **Track** = a named row in the Arranger that holds Objects. **Object** = one placement. The scene's root collection stays hidden, as today.

## 1. What exists today (so the differences are visible)

- A Collection lists its Objects and sub-Collections in `CollectionData.memberRefs` and has `mute`. The Arranger draws ONE lane per Collection (`scene/arrangerLanes.ts`); the Outliner shows Collections and Objects (`scene/outlinerRows.ts`).
- Objects of one Collection that overlap in time go to automatic sub-rows. The human can pin one with the stored `ObjectData.lane` number (W-78). A parent Object and its children overlap by design, so they land on different sub-rows.
- There is no Track record. "Piano with a right hand, a left hand and a pedal" can only be one Collection with sub-rows, or three Collections (which then wear the group hat too).

## 2. Scenario table (one project, one Piano)

The example scene is "Movement I". Piano has three Tracks, Strings has one.

| # | Start | Action | Today | With Tracks (recommended) |
| --- | --- | --- | --- | --- |
| 1 | Collection Piano, Track RH holds "Theme A" (bars 1 to 4) | Add a second Object "Theme A var" at bar 3 on RH | Lands on sub-row 2 of the Piano lane | Lands on RH. It overlaps "Theme A", so RH draws two sub-rows (automatic, nothing stored). LH and Pedal rows stay one row high |
| 2 | RH has "Theme A", LH has "Bass line" | Drag "Bass line" up to RH | Not possible: both are on the Piano lane | The Object moves to RH. Start time is unchanged. Its name, Data and modifiers are unchanged |
| 3 | Piano > LH has "Bass line" | Drag it to the Strings > Violin row | Moves it to the Strings lane | Same: it leaves Piano and joins Violin. Playback is now under Strings' mute |
| 4 | Piano > Pedal holds "Pedal hold" | Delete the Pedal Track | Not possible (no Tracks) | A summary asks first ("Delete Track Pedal and its 1 object?"). Yes: the Track and its Objects go. A child Object of a deleted parent stays in its world place (existing rule W-79). No: nothing changes |
| 5 | Piano has Tracks RH, LH, Pedal | Mute Piano | Mutes the Piano lane | Mutes all three Tracks' Objects. The Track rows show as silent, their own flags are untouched |
| 6 | Piano has Tracks RH, LH, Pedal | Mute only LH | Not possible | Only LH's Objects are silent. Piano and RH are unaffected. Un-muting Piano does not change LH's own flag |
| 7 | Collection Strings with ONE Track "Violin" | Look at the Arranger | One lane | One band (Collection) over one row (Track), or just the row if bands are off (see Q5) |
| 8 | Collection Piano holds a nested Collection "Ornaments" with Track "Trills" | Fold Piano | Hides its lanes | Hides all its Tracks and the nested Collection's Tracks. Unfold restores the previous fold state of Ornaments |
| 9 | Object "Chord stack" has parent "Theme A" (RH); "Chord stack" is on LH | Move "Theme A" 2 beats later | Parent must be in the same Collection to nest in the Outliner | The child follows (its start is relative to the parent, W-66). It stays on LH. The Outliner nests it under "Theme A" only when both are on the same Track (see Q7) |
| 10 | Select the Track RH | Look at Properties | n/a | See Q6: Collection tab shows a "Track" section when a Track is selected (recommended); no sixth tab |
| 11 | An old project: Collection "Piano" with 3 Objects, two pinned on sub-row 1 | Open it | Three Objects on sub-rows | One Track named "Piano" is created inside it. The Objects go onto it. The old `lane` number is dropped. Overlapping Objects draw as sub-rows automatically, in the order of their old `lane`, then start time |
| 12 | A Track with no Objects | Look at the Arranger | n/a | An empty row, one sub-row high, still named and selectable. It is not deleted by itself |

## 3. Open questions, each with an example where the options differ

**Q1. Does a Track mute, solo or lock?**
- A (recommended): mute and fold only, like a Collection. Scenario 6 works; nothing else new.
- B: mute, solo and lock. Example: with solo on LH while Piano is also muted, LH is silent under A-style rules (mute wins), but plays under "solo overrides mute". The human called Tracks "organization", so B adds a rule set nobody asked for.

**Q2. Are Tracks per Collection only?**
- A (recommended): a Track belongs to exactly one Collection. "RH" in Piano and "RH" in Strings are two Tracks.
- B: a Track can appear in two Collections. Example: dragging "RH" into Strings would also leave it in Piano, and muting Strings would half-mute Piano's RH. Nothing in the design asks for this.

**Q3. May Objects overlap on one Track?**
- A (recommended): yes, drawn as automatic sub-rows. The stored `lane` goes away. Dragging "Theme A var" onto "Theme A" is allowed and makes two sub-rows.
- B: no overlap on one Track, drag clamps to a free slot (like an NLA track). Dragging "Theme A var" onto "Theme A" slides it after, or is refused. A chord stack cannot sit under its melody on one Track, so the human would need an extra Track for every overlap.

**Q4. How do old projects migrate?**
- A (recommended): one Track per Collection that holds Objects directly, named after the Collection (scenario 11). The Collection's Arranger lane becomes that Track.
- B: one Track per old sub-row ("Piano 1", "Piano 2"). Example: the old Piano with two sub-rows becomes two Tracks, which keeps today's look exactly but fills projects with names the human never chose.

**Q5. Does the Arranger draw a band for each Collection, or only Track rows?**
- A (recommended): a thin foldable band per Collection with its name and mute, Tracks indented below it (mock, view A).
- B: only Track rows, with the Collection name in the row's header after a divider (mock, view B). Example: Strings with one Track shows one row "Strings / Violin" in B, but a band plus a row in A. B saves height; A keeps Collection mute and fold reachable in the Arranger.

**Q6. What does Properties show for a selected Track?**
- A (recommended): the Collection tab gains a "Track" section (name, mute, object count) when a Track is selected; the tab count stays five.
- B: a sixth tab "Track". Example: selecting RH switches to the Track tab, selecting "Theme A" switches back to Object. The human said five tabs.

**Q7. May a parent and its child be on different Tracks?**
- A (recommended): yes. Parenting is timing only (W-66). Scenario 9. The Outliner nests the child under the parent only on the same Track, otherwise lists it under its own Track with a small "child of Theme A" tag.
- B: parent and child must share a Track. Moving a parent to another Track would drag its children along, or be refused.

**Q8. Where is membership stored?**
- A (recommended): `ObjectData.trackRef` is the one truth (as ARC.md says). A Track's contents are computed, like users are (W-68). An Object has exactly one Track, so it cannot be listed twice. Within a Track objects are ordered by start time.
- B: the Track lists its Objects in `memberRefs`, like a Collection today. Example: a hand-edited or imported project can list one Object in two Tracks; the Outliner and evaluator already have to guard against that for Collections.

## 4. Consumer check (every reader of the stored records)

Changed records: new `TrackData` (name, mute, owning Collection through membership in the Collection's `memberRefs`), `ObjectData.trackRef` added, `ObjectData.lane` removed, `CollectionData.memberRefs` may list Tracks and Collections but no longer Objects.

| Panel or op | Reads | Shows or does |
| --- | --- | --- |
| Outliner (`outlinerRows.ts`, `ScenePanels.tsx`) | Collection members, Track membership, Object `trackRef`, `parentRef` | New row kind `track` between Collection and Object (depth +1 for Objects). Mute, rename, delete, drag between Tracks. Nesting under a parent Object only on one Track (Q7) |
| Properties, Collection tab | Selected Collection or Track | Track section with name, mute, object count (Q6). Object tab: a "Track" read-out (a menu is not needed; move by drag) |
| Properties, Object tab | `trackRef` | Shows the Track name; no stored lane field to show |
| Arranger (`arrangerLanes.ts`, `ArrangerPanel.tsx`) | Tracks of each Collection, Objects of each Track | One row group per Track. Sub-rows from overlap only. Drag between Tracks and Collections, rename on the row header, fold from the band (Q5) |
| `subLanes.ts`, `arrangerDrop.ts`, `arrangerRelations.ts` | Stored `lane` today | Stop reading `lane`. Overlap order = start time then id. Drop target is a Track plus a time |
| Evaluator (`evaluateScene.ts`) | Collection `mute` chain, Object `mute` | Adds the Track's mute between them: Collection mute, Track mute, Object mute, in that order. An Object with no Track is Empty-placed under the Collection |
| Ops (`sceneOps.ts`) | Collections, Objects | New: add, rename, delete, reorder Track, move Object to Track, move Track to Collection, duplicate with Tracks. `moveToCollection` now means "to a Track" |
| Delete summary (`deleteSummary`, `deleteHierarchy`, `deleteSelected`) | Members | Counts Objects under a deleted Track or Collection; wording names Tracks |
| Desk and `dataBlockRefs.ts` | Refs and users | Track blocks are records (no desk card, W-68). A Track is not a user of any Data-block. `trackRef` is a structural ref, blanked on delete (never falls back) |
| Migration (`sceneMigration.ts`) | Old Collections, `lane` | Scenario 11 and Q4 |
| Project save and load | Whole stored list | Version bump with migration; old files open, new files do not open in an older build |
| Importing pages and libraries | `ObjectData`, `CollectionData` shape | To confirm in TK1a with one grep over `src/` for `memberRefs` and `ObjectData`: scale-explorer imports from this page, so any exported type change is a cross-arc change |
| Tests | `sceneTestHelpers.ts` and scene tests that build Collections with Objects directly | Helpers gain Tracks; tests from section 2 |

## 5. Decisions needed from the human

1. Confirm scenarios 1 to 12 as written (change any row that is wrong).
2. Q1 to Q8: say "all A" or name the ones that differ.
3. Look at `mock-tracks.html` and pick view A or B (Q5).
