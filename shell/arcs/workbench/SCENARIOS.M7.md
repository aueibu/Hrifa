# M7 scenarios: pin modules, screenset polish and defaults

Draft 2026-11-18, for the human to confirm before anything is built (shell CLAUDE.md rule 7). Sources: ARC.md M7, DESIGN.one-stage.md 1.4, 5.4, 8.3, 9.2 (O1, O2), the M5 checkpoint (narrow footer), BACKLOG "DAW model for playback and view state" (before or with M7) and "Screenset tab menu: Reset".

What M7 adds: today the **Modules** tab shows one module at a time, the one you clicked on the canvas. M7 lets you **pin** a module so it gets its own tab you can put anywhere and keep on screen next to other modules (for example two Householder modules side by side). Plus the screenset strip fixes.

Already there (M3c, M5): the footer screenset tabs Canvas | Desk | Edit, "+" to add one, and Rename, Duplicate, Delete on the active one.

Setup used in every row: the **Canvas** screenset; on the canvas two Householder modules (**H1**, **H2**) and one Melodicization module (**M1**); H1 is selected so the Modules tab shows H1.

## A. Pinning (rows that do not depend on a choice)

| # | You do | You get |
| --- | --- | --- |
| A1 | On H1, choose **Pin** (in the Modules tab's header, the tab's context menu, and the Panels menu) | H1 gets its own tab "Householder H1" (the module's name as shown on the canvas). The Modules tab shows "H1 is pinned" with an **Unpin** button while H1 is the selected module. |
| A2 | Select H2 on the canvas, pin it too, put both tabs side by side | Both visible at once; editing H1 does not change H2; both keep publishing to whatever they feed (a downstream module updates whichever you edit). |
| A3 | Click inside the pinned H1 panel | H1 becomes the selected module (its setup controls appear in the inspector), as clicking it on the canvas does. |
| A4 | **Unpin** H1 (tab context menu, the panel header, or the Modules tab placeholder), or close its tab | H1's tab goes away; H1 is shown in the Modules tab again when selected. Nothing about H1's settings or outputs is lost. |
| A5 | Delete H1 from the canvas while it is pinned | Its tab disappears from every screenset. Undo brings the module back with its settings (as today), but not its pin: layout changes are not part of undo, so you pin it again. |
| A6 | Delete a screenset that has H1 pinned | Only the layout goes; H1 stays on the canvas with all its settings (a screenset never removes a module). |
| A7 | Reload the page | Pinned tabs come back where they were, per screenset. |

## B. Screenset strip (no choice; confirm)

| # | You do | You get |
| --- | --- | --- |
| B1 | Make the window narrow until the footer cannot fit every screenset tab | The footer shows only the active screenset's tab plus a **screensets menu** (a button listing all of them, the active one checked, plus "+ New", Rename, Duplicate, Delete, Reset). Widen again and all tabs come back. |
| B2 | Active screenset menu: **Reset** | A confirmation, then Canvas, Desk or Edit return to their shipped layout (a screenset you made returns to how it was when you created it). Pinned tabs in it are unpinned (the modules stay). |
| B3 | Default screensets | Stay Canvas, Desk, Edit (design O2); a "Harmonic" one waits for the lab panels. |

## C. Choices (the options give different results)

### Choice 1: pinning moves the module's view: what happens to things that are live in it?
Example: M1 (Melodicization) is playing its preview, its roll scrolled to bar 9, three notes selected. You pin M1.

| Option | After pinning | Cost |
| --- | --- | --- |
| **1a. Reload the view** | The preview stops, the roll scrolls back to the start, the selection is gone. Settings and outputs are kept (they live outside the view since R3). | Smallest; M7 ships soonest. |
| **1b. Never reload** (recommended) | It keeps playing, still at bar 9, notes still selected, just in its new tab. | Every module always lives in its own panel and the Modules tab shows the selected one's panel inside it; a new Stage feature ("show another panel's content") in the shared Stage (a lock). Medium. |
| **1c. DAW model first** | Same result as 1b, and also nothing resets when you switch modules or screensets anywhere | The BACKLOG "DAW model" milestone (playback engine and view state outside the views) before pinning. Largest. |

### Choice 2: is a pin per screenset or for all screensets?
Example: in Canvas you pin H1 into a docker on the right. Then you switch to the Desk screenset.

| Option | In Desk |
| --- | --- |
| **2a. Per screenset** (ARC scope says so; recommended) | H1 is not pinned in Desk: selecting it shows it in the Modules tab. Each screenset has its own pins. |
| **2b. Everywhere** | H1 is pinned in Desk too (placed in Desk's matching docker or the default one). |

### Choice 3: where does a newly pinned module go?
Example: in Canvas (Canvas on top; Detail with Modules and Clip editor bottom left; Tools bottom right), you pin H1.

| Option | Result |
| --- | --- |
| **3a. A new docker right of Detail** (recommended) | Detail splits: Modules on the left, "Householder H1" in a new docker to its right. Pin H2 and it goes to the right of H1. |
| **3b. Ask** | Pin opens the Send-to style list: an existing docker (as a tab) or a new docker left, right, above or below. |
| **3c. As a tab next to Modules** | "Householder H1" joins the Detail docker as a tab; you drag it where you want. |

### Choice 4: screenset templates across projects (design O1)
| Option | Result |
| --- | --- |
| **4a. Not now** (recommended; design says "after M7") | Copy a layout only by Duplicate inside a project. BACKLOG item. |
| **4b. In M7** | "Save as template" and "New from template" in the screensets menu; templates are per viewer and work in every project (pinned modules are stripped, since they belong to one project). |
