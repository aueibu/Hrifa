# M5 scenarios: descriptions for saved chords, presets and folders

DRAFT 2026-11-16, not yet confirmed by the human. Nothing is built. M5 changes STORED data, so the shapes below need the human's OK (decision row `H-26` when confirmed).

## What exists today
- **Shelf chords** (`chordshelf.v1`): each slot has a name (click it to rename in place; an automatic "Chord N" name is muted italic), a note count and a chord drawing. No description.
- **Presets** (`generators.v1`): a user preset has `{ id, name, folder, gen }`. The preset browser (the Presets popover) shows a tree: Built-in groups, My presets (folders come ONLY from the `folder` text of presets, e.g. `Pools/Seven`), Auto-saved. A row has Edit (pencil: name and folder) and Delete. A built-in preset has a read-only `info` text that shows in the browser's info line (under the list) when its row is active.
- **Folders** are not records: a folder exists only while some preset's `folder` text names it. An empty folder cannot exist; there is no create, rename or delete action. Built-in folders are a fixed code table.

## Proposed design (decisions D1 to D5 below)
- **Shelf chord description:** an optional text per slot, edited in place like the name (click the muted description line under the name; Enter or leaving keeps it, Escape cancels). Shown on the slot as a muted line (one line, cut with an ellipsis) and in full in the slot's tooltip.
- **Preset description:** an optional text per user preset, edited in the preset's Edit row (a new "Description" box under Name and Folder). Shown in the browser's info line when the row is active, the same place a built-in preset's `info` shows.
- **Folder records:** `generators.v1` gains `folders: [{ path, description }]`. A record gives a folder a description AND lets it exist while empty. Actions in the browser: **New folder** (name or path under My presets), edit a folder's description (pencil on the folder row, same Edit row), **delete a folder only when it is empty** (no presets, no subfolders). Built-in folders cannot be created, edited or deleted.
- **A folder implied only by presets** (no record) behaves exactly as today: it appears while a preset names it and disappears when the last one leaves.
- **Search** in the preset browser also matches descriptions (preset and folder).
- **Limits:** a description is plain text, one paragraph, trimmed, at most 300 characters (a longer paste is cut at 300 on save).

## Scenarios (the human's real cases to confirm)

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| 1 | Shelf slot "Chord 3" (4:5:6 on 3/2) | Click its description line, type `bright cadence chord`, Enter | The slot shows `bright cadence chord` under the name; its tooltip shows the full text; the name still says "Chord 3" (automatic, muted italic). Reload: still there. |
| 2 | Shelf data saved before M5 (no `description` anywhere) | Open the lab | Loads unchanged; every slot has an empty description line (a faint "Add a description" prompt on hover); nothing is rewritten until you edit one. |
| 3 | Shelf slot with a description | Clear the text, Enter | The description is removed (the stored slot has no `description` field again). |
| 4 | User preset `Seven-limit pool` in folder `Pools/Seven` | Pencil, Description `ratios up to 7 over 1/1`, save | The browser's info line shows that text when the row is active. Search `over 1/1` finds the preset. Reload: still there. |
| 5 | My presets has no folder `Drones` | New folder `Drones` | A folder row `Drones` appears under My presets with count 0 and survives a reload (a record, no preset needed). |
| 6 | Folder `Drones` | Pencil on the folder row, Description `pedal tones`, save | The info line shows `pedal tones` when the row is active. Search `pedal` finds the folder. |
| 7 | Save a preset with Folder `Drones` | Save | The preset sits inside `Drones`, the folder's count is 1. |
| 8 | `Drones` holding that preset | Try to delete the folder | Refused with a message ("Drones has 1 preset"); nothing changes. |
| 9 | Move the preset out of `Drones` (Edit, Folder changes) | Then delete `Drones` | Allowed; the folder row and its record are gone. |
| 10 | Folder `Pools/Seven` exists only because presets name it (no record) | Move its last preset out | The folder disappears (as today). |
| 11 | Folder `Pools/Seven` WITH a record (description set) | Move its last preset out | The folder stays, empty, with its description. |
| 12 | A built-in folder (for example the Built-in groups) | Look for New folder, pencil and delete on it | None offered: built-in folders are read-only. |
| 13 | `generators.v1` saved before M5 (no `folders`, no preset `description`) | Open the lab | Loads unchanged: folders come only from preset strings; no descriptions. |
| 14 | A stored folder record whose path is built-in or invalid (hand-edited data) | Open the lab | The record is dropped on load (sanitizing); the rest loads. |
| 15 | Description of 400 characters pasted | Save | Stored and shown cut at 300 characters. |

## Decisions for the human (recommendation first)
- **D1 Where a shelf description is edited and shown.** Recommended: in place on the slot (click the muted line under the name), full text in the tooltip. Alternative: only in the tooltip and an edit popup (no extra line on the slot).
- **D2 Where a preset or folder description shows.** Recommended: the browser's existing info line (the same place built-in presets show theirs). Alternative: a second muted line under each row (the tree gets taller).
- **D3 What happens when a folder's last preset leaves.** Recommended: the folder stays only if it has a record (created with New folder, or given a description); a folder with no record disappears as today (scenarios 10 and 11). Alternative: every folder keeps its record forever once seen.
- **D4 Length and format.** Recommended: plain text, one paragraph, at most 300 characters. Alternative: allow line breaks and up to 1000 characters.
- **D5 Folder rename.** Not in M5's scope as written (no rename exists today). Say if you want Rename folder added now (it would rewrite the `folder` text of every preset inside and move the record), or logged in the backlog.

Storage (needs your OK, then `DECISIONS.md` `H-26`): `chordshelf.v1` slot gets optional `description` (written only when set, like `pattern` and `tail`); `generators.v1` user preset gets optional `description` and the file gets `folders: [{ path, description }]` (written only when non-empty). Old data loads unchanged; versions stay 1.

## Human answers (2026-11-16); where they differ from the proposal above, they win
- **D1 (shelf chord description), changed.**
  - **Card layout:** the description is the SECOND LINE of the card, right under the name. Everything else moves down one row: name, description, `4:5:6 on 3/2 · 3 notes` (the old subtitle), pitches, steps. The description is cut off with an ellipsis when it is too long. A card with no description shows no extra row (assumed; the human did not say; say if an empty reserved row is wanted).
  - **Buttons:** two rows of icons on the right: row 1 up, down; row 2 description (a notepad icon), copy (today's "Reload as a new tab" icon), trash. The select checkbox stays where it is today (assumed). Clicking the notepad edits the description (Enter or leaving keeps it, Escape cancels).
  - **Hover tooltip (always shows the description when there is one),** in this order: Title; description; `4:5:6 on 3/2 · 3 notes`; `Pitches:`; `Steps:`. This applies to the shelf card tooltip.
- **D2 (preset and folder description), changed.** Shown in the browser's info line when the row is active AND on a line under the breadcrumb of the loaded preset (the human clicks that line to edit it). A folder's description shows in the info line when its row is active.
- **D3 (empty folders), RESOLVED:** a folder you create with New folder stays until you delete it (human: "folder stay until I delete it"). A folder that exists only because presets name it (no record) still disappears when its last preset leaves, as today. A folder with a description also stays.
- **D4 (limits):** accepted: plain text, one paragraph, at most 300 characters.
- **D5 (folder rename):** YES, add Rename folder. Plain meaning: click Rename on a folder, type a new name; the presets stay inside it and nothing else changes. A preset keeps its OWN description; a folder keeps its OWN description; nothing is ever copied from a folder to its presets. (Inside the stored data each preset names its folder, so those names are updated; the human sees nothing of that.) A name that already exists as a folder is refused with a message.

## Later changes (human, 2026-11-16, after looking at M5b)
- **Rows 8 and 9 replaced:** a folder CAN be deleted while it holds presets or folders, after a confirmation under its row that names what goes (`Delete Pools/Seven, its 3 presets and 1 folder? Subsets stay under Auto-saved.`). Confirming removes the folder, its subfolders and every user preset inside it; the presets' subsets stay under Auto-saved, as for a single preset delete. An empty folder asks `Delete Drones?`. Built-in folders are never deletable.
- **Shelf card:** stacked the same way at every width (name, description, subtitle, pitches, steps).
- **Preset description under the breadcrumb:** up to 4 lines, then an ellipsis; its edit box grows up to 4 lines. The shelf description stays one line.
- **Folder dropdown:** no longer filters. The folder matching the typed text is on top (exact, then starts with, then contains), every other folder is listed below it.
- **Breadcrumb:** clicking the loaded user preset's name renames it in place.
- **Delete controls:** hover and keyboard focus turn them the danger color everywhere in the lab (one shared class); a dimmed delete stays gray.
- **Preset rename (H-28):** an empty name and a name already used in the same folder are refused with a reason; the same name in different folders is allowed (human: "sure same names in diff folders").
