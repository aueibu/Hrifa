# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: Timeline (`arcs/workbench`), APPROVED 2026-11-23 (human), committed a836990
- Current milestone: B0b removals (R1 to R4 in `AUDIT.baseline.md`), then B1a
- State: audit done and written (`AUDIT.baseline.md`): about 1,750 lines (4%) dead or legacy-read. Next: delegate removal steps 1 to 4 to builders; renames after. No locks held.

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
| B0b audit (2026-11-23) | `AUDIT.baseline.md` written | none needed | Findings: the patch chain (`registry.ts`, `evaluator.ts`, `persistence.ts`, `examples.ts`, `euclidean.ts`) runs a frozen demo patch nothing saves, with red error banners on the page; five dead files; about 450 lines of legacy read (desk and snapshot migrations, screenset seeding, `editorStage.ts`, mist migration, instance-key compat); `signalTypeFor` and `isReloading` duplicates; 153 history comments. Plan: removal steps 1 to 4, then renames. |

## Shared touches (locks taken)
None yet.

## Open questions for human
- Approve the revised `ARC.md` (milestones C0, T0 to T6b).

## Next action
**RESUME HERE (2026-11-23):** audit written. Delegate removal step 1 (R1 + R2) to a builder: brief = `AUDIT.baseline.md` R1/R2, confirm where live port acceptance lives before deleting `acceptsPacket`, update tests that import removed code, `check:fast` on touched files only, never the gate; then reviewer; orchestrator runs `check:workbench` once after steps 1 to 4 and commits path-scoped. Then B1a to B1c.
