# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: Timeline (`arcs/workbench`), APPROVED 2026-11-23 (human), committed a836990
- Current milestone: B0b (audit for stacked revisions); B0 done and confirmed 2026-11-23
- State: B0 confirmed by the human (W-52). B0b: a scout is auditing the page folder for legacy, dead and duplicated code and retired words; the result goes in `AUDIT.baseline.md`. No locks held.

## Where to look
- `ARC.md` (this arc). The previous arc and its decisions: `ARC.one-stage.md` (Integration decisions D4 meta lane, D5 pitch), `PROGRESS.one-stage.md`. Earlier archives: `ARC.chord-input.md`, `ARC.desk.md`, `ARC.clips.md`.
- The workbench `src/pages/composition-workbench/ARCHITECTURE.md`: "The desk", "Direction: rolling playback and arrangement".

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Draft (2026-11-18) | ARC.md drafted | none needed | The human, after the M7 questions: needs "somewhere for them to go", a timeline with tracks, then the meta lanes; the three kinds of tools (instruments, processors, operations) frame it. |
| Draft revised (2026-11-18) | ARC.md rewritten | none needed | The human corrected the first draft (a timeline of finished note clips): material of any kind goes on the timeline and combines there ("put a pitch set on the timeline or a block chord and then somehow associate it with a rhythm block ... have those two interact and create the realization"). New milestones: T0 scenarios (association by overlap, link or realize block), T1 data, T2 lanes and material blocks, T3 realizations (reusing the module evaluators), T4 playback, T5 bake, T6a sections, T6b pitch context. |
| Draft revised again (2026-11-23) | ARC.md updated | none needed | The human read the Blender manual (`RESEARCH.blender.md`, on main as bde20d1) and asked to fold it in and to rework the data systems and packets toward Blender's data-block model for extensibility; and to give the orchestrator more room ("I just steer"). New: Working agreement section; milestones B0 (data-block design), B1 (references and users), B2 (ClipSelector, desk user counts) before T0; T0 to T2 carry the NLA answers (extrapolation, crop and repeat on the block, tweak mode, lane mute/solo/lock) and markers. Stage/Inspector ideas routed to a later arc (BACKLOG). |
| C0 (2026-11-23) | context scan done | none needed | No other arc edits `composition-workbench` or the dock Stage (affine-focus and ratio-rhythm both forbid it; interval-placement is standalone; stage and structure are finished; LOCKS.md is empty). Consumers of the workbench: Scale Explorer imports `composition-workbench/audio/*` and `forteCatalog.ts` only (not the desk, not Snippet); `CompositionWorkbench.page.tsx` is the one outside user of the desk and of the Stage's `ScreensetTabs` and screenset store operations. Renames: B1a (Snippet and clip) stays inside the page folder plus the page entry file; B1b (module, patch) the same plus any Scale Explorer symbol that says module (scout checks); B1c (screenset to workspace) reaches the shared dock Stage (`components/Stage/dock`, `lib/stage`, `lib/stage/migrate.test.ts`): lock, `check:stage` and `check:hfl`. Relevant BACKLOG items: the derivation graph proposal (collections and derivation inputs share one shape, `RESEARCH.blender.md` section 3) and the unified roll with clips. |
| B0 (2026-11-23) | design written, awaiting steer | none needed | Scout facts: five separate identity systems; no cascade on delete (Make source shows missing); only the Notes type is registered (rhythm and pitch-set packets have no type); accepts logic duplicated; a possibly dead second module registry (`registry.ts`, PatchDocument). Design: one DataBlock envelope (id, type, name, data, lineage, origin), users computed from registered referencers, collections share a shape with the derivation proposal's inputs, nodes are not data-blocks, packets unchanged. |
| B0 confirmed (2026-11-23) | decisions recorded | none needed | S1 A; S2 to S6, S9, S10, S12 as recommended; S7 plus an open question on recoverability (BACKLOG); S8 plus a Reinterpret-as submenu; S11 reframed as the **direct path first** rule (zero nodes for any DAW task; per-type default audition; test "C major" to sound with no wiring); S13 A and B plus a Steps shaper type. New milestone B0b (audit) before the renames. W-52 logged. |

## Shared touches (locks taken)
None yet.

## Open questions for human
- Approve the revised `ARC.md` (milestones C0, T0 to T6b).

## Next action
**RESUME HERE (2026-11-23):** B0 confirmed. B0b: when the scout's audit arrives, write `arcs/workbench/AUDIT.baseline.md` (verdict per item), tell the human the removal list in plain language, delete the DEAD and LEGACY-READ code first (builder, one step per area, related tests only), then B1a (rename `Snippet` and clip words, `clipTypes.ts` to `dataBlockTypes.ts`), B1b (module to node), B1c (screenset to workspace, shared Stage: lock).
