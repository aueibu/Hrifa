# Proposal: harmonic nesting and the derivation graph

**Status: PROPOSAL 2026-11-21, not an arc.** Written from a chat session that built a listening mock-up. Nothing here is
approved; it becomes an arc only after the human picks it up (`shell/CLAUDE.md` rule 16). The workbench's own active draft
is the Timeline arc (`ARC.md`, awaiting approval); see "Overlap with the Timeline draft" below before choosing an order.

## Where this comes from

The human (2026-11-21), on the ring chord mock-up: "what is this musically? I have never seen or heard something like
this before. Its like harmonic nesting. Because at anytime I could pull a subset back out and retransform it or re-present
it in a new context. And this is before adding things like the hanging tones etc from the voicing applet!" Then: "that is
exactly the kind of ancestry I want to be able to move within and explore in the composition workbench."

The mock-up: `shell/arcs/interval-placement/crystal/ring-chord-modes.html` (one standalone page, no build step; published
privately at https://claude.ai/artifact/4wW8yqHJ7uFEsEZryTJeFt, whose catalog lives in that artifact's own database). It
grew out of the open question in `crystal/HANDOFF.md` ("fit" in pitch).

## What the mock-up does (the operations to codify)

Every operation takes pitch lists and returns a pitch list, so any output can be the next input. That closure is what makes
nesting possible.

| Operation | Inputs | Parameters | Output |
|---|---|---|---|
| Ring chords | a ring (pitch list) | mode: On its own pitch / On the 1/1 / Shape copied / Undertone; Ratios (multiply) or Harmonic numbers (add, on the ratio rhythm lab's linear ring); bass held on 1/1 or on the root | one chord per ring pitch |
| Voicing | chords | an octave move per voice position (root, 2nd, 3rd ...), same in every chord | revoiced chords |
| Slice | chords | count from top or bottom; a cyclic note pattern (`1+3` = several at once); a cyclic chord order; length (0 = until the patterns line up) | a melody (steps of one or more pitches) or one chord |
| Fit | a chord, a span (two pitches) | proportion p from -1 (string length) through 0 (cents) to +1 (frequency); frame: octave, outer notes, or any interval | the chord placed inside the span |
| Meta chord | a fit | none | fitted chord plus the span's two notes |
| Re-ring | any pitch list | none | that list as the next ring |
| Hanging tones (later) | a pitch set | Interval Placement's required and hanging intervals | the set with its hung tones |

Exact arithmetic matters: at p = +1 and -1 a fit returns exact ratios (29/24, 11/8), so nested results stay re-rootable.
In-between settings come out in cents. This lines up with W-44 (a note keeps its exact identity when it has one).

Worked numbers to reuse as scenario rows (all checked in the session): ring 1/1 9/8 3/2 11/6; chord 1/1 9/8 5/4 3/2 fitted
into 1/1 to 11/6 gives, frame Outer notes: Frequency 1, 29/24, 17/12, 11/6; Cents 0, 304.8, 577.5, 1049.4 c; String length
1, 33/28, 11/8, 11/6; frame Octave: Frequency 1, 53/48, 29/24, 17/12; Cents 0, 178.3, 337.8, 613.8 c.

## The contract this needs

The workbench already keeps a version tree per clip and one `derivedFrom` (workbench `ARCHITECTURE.md`, "Edit contract
and versions"). Nesting needs more, because one result can depend on several clips from different modules.

1. **Multi-input derivation.** A derived clip records `{ op, opVersion, params, inputs: [{ role, clip, version, pick }] }`.
   Inputs are named by role ("chord", "span") and pinned to a version; versions never change, so cycles cannot happen.
   `pick` records which notes were pulled out, so taking a subset is a recorded step, not a hand copy.
2. **Snapshot plus recipe.** The snapshot (the pitches as heard) is the truth; the recipe is how to rebuild it. Keep both.
   A pruned snapshot can be rebuilt while its recipe and inputs survive.
3. **Pin and flag, never auto-follow.** When an input clip gets a new version, the child keeps its pitches and shows a
   "source changed" badge with **Rebuild from latest**, which re-runs the recipe as a new version of the child (compare,
   keep either). This follows the workbench rule "do not silently reinterpret".
4. **A hand edit is a boundary.** A hand-edited version is marked hand-made; Rebuild stops there.
5. **One operation registry.** Each module publishes its transforms as registered operations: id, version, typed input
   roles, parameters, and a pure function. This is the module runtime's own shape (W-45: a pure function from state,
   picked inputs and context to outputs). Listening controls (preview octave, volume, tempo) are not parameters. A change to
   an operation's math bumps `opVersion`; old snapshots stay as they were.

## Set identity: finding connections without noise

Each pitch set gets keys when it is made; finding matches is a table lookup, not a comparison against everything.

| Tier | Key | When |
|---|---|---|
| Same pitches | sorted exact ratios | always |
| Same up to transposition | ratios over the lowest note | always |
| Same up to inversion | the lesser of the set and its mirror | always |
| Same interval content (Z-related) | sorted multiset of all pairwise intervals | always (a Z-pair = same interval key, different transposition key) |
| Subset or superset, near match (cents tolerance) | none: a search | only on request, one clip against the catalog |

Noise rules (the default filter): at least three notes; never report a clip's own ancestors or descendants; rank matches
reached by different operations or from different source rings first; show a count badge ("3 relatives"), opened on
demand; exact tiers first.

## What else has to be built (candidate milestones, in order)

0. **Scenarios first** (`shell/CLAUDE.md` rule 7): a table from the human's own case (a fit made from two clips, the span
   clip edited, the badge appears, Rebuild makes a new version), confirmed before code.
1. **Pitch-set packet with exact ratios.** Check what W-44's `exact` already gives a pitch set and what is missing for ratio
   lists, cents-only pitches and register (pitch classes vs pitches, the workbench's explicit conversion rule).
2. **The operations as a pure library** (for example `src/lib/ring-chords/`): port the mock-up's math with Node tests whose
   tables are the worked numbers above. No UI.
3. **The derivation record and the registry**: the `derivation` field beside `SnippetLineage`, its validator in
   `acceptsSnippets`, a `schemaVersion` bump, and the registry. A shared-contract change: `DECISIONS.md` row, lock on the
   desk paths.
4. **Stale badge and Rebuild.**
5. **Set keys and the relatives badge** (the always-on tiers only).
6. **The instrument**: ring chords, voicing, slice and fit as a workbench instrument (a direct tool, not a node) that emits
   clips carrying their derivation. Look changes go human first.
7. **The family-tree view**: clips as nodes, edges labeled with operation and role; audition and send any ancestor.
8. **Bring over the mock-up's catalog** from the artifact database (each entry stores the full settings).
9. **Hanging tones as an operation** through Interval Placement's PitchContext / Preview / Emit hand-off (warn the human
   before the hand-off contract step, as that arc's notes ask).

## Overlap with the Timeline draft

The Timeline draft says a realization "stays live (change a block and the notes follow)", and **baking** fixes a result.
Point 3 above (pin and flag) is the opposite default for derived clips. The two can coexist (live inside a realization on
the timeline, pinned for clips on the desk), but the human should choose this explicitly before either arc builds it.

## Open questions for the human

1. Live or pinned by default, and is the split above (live realizations, pinned desk clips) right?
2. Order: this before, after, or inside the Timeline arc?
3. Does the ring chord instrument live in the workbench, or as its own page that emits clips (like Interval Placement)?
4. Which tiers of set identity are worth showing on day one?
