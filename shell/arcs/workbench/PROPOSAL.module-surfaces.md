# Proposal: module surfaces (strip, full view, reference panels)

**Status: proposal, no decisions.** Written 2026-11-23 from the blender-research session (transcript
`~/.claude/projects/C--Data-Files-Projects-Hrifa--claude-worktrees-blender-research/83cdbab6-8bdf-4a1a-acb1-762b54bfe9ca.jsonl`,
2026-11-23 00:58 to 01:00 EST), where it was offered as this file but never written; the human asked for it to be
written down (live-series session, 2026-11-23). It is the target shape for every tool ported into the workbench
(Harmonic Field Lab, Interval Placement, Live Series, ...). It becomes an arc only through the normal workflow.

## The human's words

> "in UI design what is the best way to balance a 'all on one screen approach' with many different hot-swappable
> modules? I am thinking baout this in terms of the composition workbench as I look to port the harmonic lab,
> interval placement, etc. They all will share one design language via theming and components but I some have lots
> of controls and are a full page instrument in their own separate project. I am hoping to take inspiration from
> ableton/bitwig style native devices that can fit in a bar on the screen. I have given some though to the
> screensets (i don't want the user to have to create a screenset for each module) and I think that a function that
> opens the module in its full page view for full tinkering might be useful. I think that is easier than trying to
> plan a simple vs advanced mode on the small view. I also am thinking about panels that are reference ones like the
> modes panel or the interval pairs panel that can work as a reference always and is dynamic to the
> selection/project parameters. I want to balance giving the user lots of information, remaining flexible, and not
> creating an ugly situation for UI and usability. please advise"

Later the same session moved on to the Blender manual (`RESEARCH.blender.md`, `VOCABULARY.md`,
`DESIGN.data-blocks.md`).

## What already supports it (as read in that session)

The workbench runs on the dock Stage with per-project screensets and a module registry. The Stage gives each panel
only its size class; a panel is mounted once and keeps its state when it moves; module state lives in a runtime store
outside the panels (W-41). So this is mostly a design contract, not new plumbing: a strip and a full view are two
renderings of one module store and cannot drift apart.

Precedents: Ableton and Bitwig look dense but calm because every device has the same anatomy (one height, one header,
one control size; only the width varies). Bitwig's Grid and Polymer show a device-sized face in the chain and open
their full patch in the big editor area, not a new window and not a screenset.

## Recommendation: three kinds of surface, all reading one module state

### 1. The strip (the "device in a bar")
- **Fixed height, variable width.** One header for every module: name, on/bypass, **Expand**, menu. Below it at most
  about 8 controls and one small **glance** (a tiny output view: a mini ring, a pitch row, a short interval list).
- **Authored, not shrunk.** The full page is not made responsive down to strip size; each module picks its few strip
  parameters (Bitwig's remote controls: the device author chooses 8; further pages of 8 are optional).
- **Cheap path for ports:** the derivation-graph proposal has modules register operations with typed parameters. A
  `strip: true` flag on parameters lets the strip be generated with `InspectorKit` (fixed field sizes, `compact`
  density). Porting a module = register its operations, flag its strip parameters, reuse its page as the full view. A
  hand-designed strip only for modules that earn one.

### 2. The full view (the human's "open full page" idea, kept)
Preferred over a simple/advanced toggle: a two-mode strip means designing every module twice inside a small box.
- **Expand** opens the module's full view as a tab in the big `Detail` docker (as Bitwig opens the Grid). No
  screenset is created; the same mounted instance gets a big view.
- One temporary **Maximize** on any docker (double-click its strip, or a key, like Blender's Ctrl+Space) fills the
  window until pressed again; never saved into the screenset, so no screenset per module.
- Closing the full view returns `Detail` to the tab that was there before; nothing is promoted in its place (what is
  open stays open).

### 3. Reference panels ("lenses")
Modes, Interval Pairs, later a chord-ancestry view:
- **They read, they don't own:** project context (pitch set, `edo`) plus the selection; no musical state of their own.
- **Follow, with a pin.** They follow the selection by default; a pin freezes them for comparing. The header always
  says what drives them ("Following: clip *Ring A*, chord 3" or "Pinned: ...").
- **Empty selection = a quiet empty state;** never jumps to show something else.
- **They act through gestures:** click to audition, drag a result onto the canvas or a module (`useDragSource`,
  `useDropTarget` in `components/Sortable`).

```
┌ Canvas ───────────────────────────────────────┐┌ Modes (following: Ring A) 📌┐
│                                               ││  1/1 9/8 5/4 3/2 …         │
├ Detail: [Clip editor] [Interval Placement ⤢] ─┤│  ▸ mode 2  ▸ mode 3        │
│   (full view opens here as a tab)             │├ Interval pairs ────────────┤
├ Module chain ─────────────────────────────────┤│  …                         │
│┌Ring chords ⏻ ⤢ ☰┐┌Fit ⏻ ⤢ ☰─────┐┌Voicing ⏻ ⤢┐││                            │
││ mode ▾  bass ▾   ││ p ◯  frame ▾ ││ oct ▫▫▫▫   │││                            │
││ ░░ glance ░░     ││ ░░ glance ░░ ││ ░ glance ░ │││                            │
│└──────────────────┘└──────────────┘└────────────┘│└────────────────────────────┘
```

## Rules that keep it from getting ugly
1. One strip anatomy for every module.
2. Color only for meaning: marks get color, frames stay neutral; the selected module gets the single accent (THEMING.md).
3. More detail by place, not by mode: strip, then full view, then a hover tooltip for help. No toggles that change what a box shows.
4. A strip budget: about 8 controls plus 1 glance; the rest belongs in the full view.
5. A few general screensets (Canvas, Desk, Edit, maybe "Explore"); Expand and Maximize cover the per-module cases.

## Scrolling, pages and expand (the session's follow-up answer)
Pick by what the user is doing, not by how much content there is: one long list of similar items → **scroll** with a
sticky header and a filter; equal groups of controls in a fixed box → **pages** (Bitwig's remote-control pages); one
item's details without losing place → **inline expand**; the whole thing at once → **full view / Maximize**.
1. The window never scrolls; each docker scrolls its own content.
2. One scroll direction per surface; never nest two scroll areas that scroll the same way (2D surfaces own the wheel
   for pan and zoom only when they fill their docker).
3. Strips never scroll (the 8-control budget; at most 2 to 3 strip pages; the rest is in Expand).
4. The module chain scrolls sideways (Ableton's device chain); strips can fold to their header.
5. Reference panels scroll vertically and expand rows inline; when following, they scroll the matching item into view
   and highlight it, never reorder or swap contents.
6. Full views may scroll vertically, but the main visual (ring, roll) stays pinned while controls scroll beside it.
7. Big result lists (the Interval Placement catalog) use a virtualized scroll with group headers, a filter and
   "jump to"; no page numbers.
8. Scroll position, strip page and folded state live in module view state, not the DOM.

## One thing to watch
A maximized full view hides the reference panels; one fix is to let Maximize leave the reference column visible. To
try in the first pilot rather than decide now.

## Suggested pilot
Interval Placement: built standalone with port seams (PitchContext, Preview, Emit), so it is the cheapest place to
settle the strip contract and Expand before porting the Harmonic Field Lab. Live Series (`/live-series`, LIVESERIES-3)
is built from the start as a full view that can mount inside a host, so it can be a second pilot.
