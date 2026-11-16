# Workbench steering notes for the lab port (scout report, to review at the end of the lab arc)

Written 2026-11-15 from a read-only scout run. The scout read the code and docs and ran nothing. Nothing here was acted on: the workbench arc is the human's to steer, and no workbench file was edited.

Status: **to review at the end of the harmonic-field-lab arc** (with the Final step and the BACKLOG triage). Decide which items to take into the workbench arc and record the chosen ones as `DECISIONS.md` W rows and `BACKLOG.md` items.

Scouted state of the workbench arc: `arcs/workbench/ARC.md` and `PROGRESS.md` show the "One Stage" arc with M4a committed and M4b next. Line numbers below come from reading, not from running code.

## Size of the lab (for reference, 2026-11-15, raw lines including blanks and comments)

| Part | Code | Tests |
|---|---|---|
| `src/lib/harmonic-field/` | 5,445 | 2,849 |
| `src/pages/harmonic-field-lab/` | 23,624 (components 11,589, state 8,676, audio 2,035, `texts.ts` 1,108) | 15,931 |
| CSS in the page | 4,233 | |
| For scale: `src/pages/composition-workbench/` | 39,083 | 25,580 |

Hubs worth splitting first when the seams are drawn: `state/labState.ts` (1,359), `audio/useLabAudio.ts` (998), `components/ChordsPanel.tsx` (767), `components/Send.tsx` (751).

## 1. Where the active workbench arc ends

Stable contracts after M9:
- the dock Stage (`src/components/Stage/dock/`, W-31 to W-38; `PanelMeta` with `home`, `multiple`, `keepMounted` at `src/lib/stage/registry.ts:26`);
- `useStageApi` (W-32);
- the page-level chord session and `ChordTarget` claims (W-39, `src/pages/composition-workbench/chordInput/chordSession.ts`);
- `WorkbenchSessions`;
- the clip editor session, `inputScope.ts`, panel commands `reveal` / `clearAnchor` / `focus` and a read-only selection chain (M4b, DESIGN 7.2 to 7.4, not built yet);
- a per-project screenset key under `hrifa.composition-workbench.`.

The desk, edit contract, packets, pitch, time and audio are not changed by any milestone.

Explicitly NOT planned: the drops system (a later arc), pop-out (M9, needs OK), new chord features, pitch/time/edit contract changes, PianoRoll changes beyond opt-in props, free windows, a left inspector on the kit, a microtonal roll (BACKLOG `[shared]` umbrella), audio-engine changes, lab changes. So the lab's three hard gaps (pitch, held audio, key scope) are outside this arc.

## 2. Seams and collisions

**Pitch.**
- The workbench stores midicents (W-1). The roll is 128 fixed rows (`src/components/PianoRoll/PianoRoll.tsx` around lines 369, 1425, 1843; W-3).
- `PitchSet { edo, pcs }` (`chordInput/pitchSet.ts:17`) is absolute pitch classes with no cents.
- The lab is monzo + cents relative to a mode root (H-1).
- Collision: rounding. `ChordAudition.tsx` sends `Math.round(note.pitchMidicents)` and `noteClipEdits.ts:131` rounds on insert, so a lab chord loses its cents on audition and insert.
- Plug-in: convert at the edge and keep `{m, c}` in an additive field.

**Audio.**
- `AudioEngine` (`composition-workbench/audio/types.ts:107-123`) plays fixed-length `PerformancePlan`s; `play()` returns a session with `stop()`. There are no held voices and no glide.
- The lab has its own Web Audio `VoiceEngine` (`harmonic-field-lab/audio/engine.ts`) with its own AudioContext created on first sound.
- Two engines mean two contexts, no shared volume or meters, and undecided ownership. Hold 1/4/5, glide and sweep have no workbench call.
- Possible route (unverified): an open-ended plan plus `session.stop()`. Per-source `stopSource` fits the lab's per-source previews.

**Keyboard.** Verified collisions:
- `v`: lab melody slot (`harmonic-field-lab/audio/keymap.ts:7`, window keydown in `useLabAudio.ts` about line 845) vs the workbench lane toggle (`NoteClipEditor.tsx:1321`).
- Digits: lab holds 0 to 5 (window bubble, guarded only by `isTyping` / `sendHasKey`) vs roll tools 1 to 7 (roll focus only, W-15).
- `[` `]`: lab shelf paging vs workbench softer/louder (`NoteClipEditor.tsx:941, 948`).
- `-` `=`: lab popup and stash vs `RollScrollbar.tsx:161-165` zoom.
- Alt+digit: lab tabs (about line 850) vs DockStage Alt+1..9 (W-35). Alt+Left/Right: workbench note navigation vs DockStage tab reorder (W-35).
- Space: workbench transport (`TransportBar.tsx` window keydown); no lab use found.
- Not found in workbench code: `,` `.` `q`..`p`. `c` is used only with Ctrl/Cmd (`NoteClipEditor.tsx:1209`).
- Workbench listeners are attribute-scoped (`data-note-editor-scope`, `data-chord-scope`, and the chord capture listener only while the picker is open). The lab's and `TransportBar`'s listeners are window-wide. A lab port needs key claims, not pointer position alone.

**Selection and focus.**
- Lab: `Tab.sel` field indices plus `hover`, `pin`, `chordPick` in `LabState`.
- Workbench: `NoteSelection {ids, range, kind}` (W-5); the chord host is the "open item" claim (W-39).
- The planned chain note, clip, project (DESIGN 7.4) has no pitch-set, chord or ratio leaf.
- Lab hover is a field index; workbench hover is a (pitch, onset) cell. Lab hover-preview needs its own channel.

**Layout.**
- The dock Stage takes any panel that declares home, multiple and keepMounted, so lab panels fit as panels.
- The lab keeps its pinned-column layout (`harmonic-field-lab/state/layout.ts`) until its arc ends (STAGE-19(3)).
- The dock has no drops yet; the lab's `-` popup is pointer-placed.

**Persistence.**
- Lab data (generators, chordshelf, composites) lives in `hrifa.harmonic-field-lab.*` localStorage. It is data, not prefs.
- `projects.ts:21` captures only the workbench prefix, so lab libraries would not travel with projects. W-10 covers prefs and project state, not libraries.
- `usePersistentState` records every change into undo unless the key is in `unrecordedStateKeys` (`usePersistentState.ts:118`), so a shelf stash would enter workbench undo unless exempted.

**Theme.** The lab maps meanings page-locally (H-2 to H-4): yellow means pin and also chord-error severity, orange means sharp but is labeled amber (no amber hue in `src/theme/markers.ts`). Roles only, no hex. Not blocking.

**Emit.**
- `ChordTarget.insert(ChordInsertRequest)` (`chordSession.ts:47-58`: chord, anchor, voicing, `notes: PlacedNote[]` midicents) is the one existing "host receives a chord" seam. It carries no cents or ratio.
- Pitch-set and composite emit: none.
- Desk capture (`composition-workbench/ARCHITECTURE.md`, "Capture") takes packets, so lab output becomes midicent events with the ratio lost.

## 3. Steering advice for the workbench arc

Cheap now:
1. M4b `inputScope`: make it a per-key owner registry, not pointer-only. `TransportBar` and future window listeners consult it. (Expensive later: every window listener must be found and changed.)
2. Audition sink: pass fractional midicents, not rounded ones. Leave packet rounding alone (W-1).
3. Add optional, additive fields before M5 freezes shapes: a read-only `pitchContext?()` on `ChordTarget` (edo, pitchSet, optional reference) and optional exact-pitch data (cents, optional ratio) on `PlacedNote`. Hosts ignore them. Record as a W row.
4. Make the planned selection chain a tagged union that can carry `pitch-set`, `chord` and `composite`, not `NoteSelection` baked in. (Expensive later.)
5. Decide the lab-data storage class now (project versus per-viewer library, and the undo rule) before M5 adds the screenset key. (Expensive later: key migration.)
6. Name a `HeldVoices` interface beside `AudioEngine` (unimplemented). Add no new fixed-length-only requirements to chord audition. (Expensive later: retrofitting into Tone scheduling.)
7. Reconcile listener order: DockStage registers window and document-capture keydowns (`DockStage.tsx:496, 771`). Settle the order before lab digits enter the Stage.

Expensive later (not for the current workbench arc):
8. Any lab-on-roll display needs the tunings arc first (BACKLOG). New code must not index rows by midi (`127 - midi`).
9. Two layout systems: decide the lab's end state now (STAGE-19(3)).

The current workbench direction makes a lab port harder in: one-shot audio, window-wide key listeners, the 128-row roll, and a selection chain that cannot carry a pitch set.

## 4. The three seams the lab plans (mapped to the workbench)

- **PitchContext** (read-only field, subset, root, frame): closest is `ChordTarget.pitchSet` plus `edo` (read-only per target) and the planned `WorkbenchSelection`. No field, subset, root or frame type exists.
- **Preview** (play, hold, stop by pitches): closest is `AudioEngine.play` and `stopSource` via `useModulePreview`, and `ChordAudition` with `chordSession.audition(notes, velocity)`. Play and stop by pitches exist, fixed length only. Hold and glide: none.
- **Emit** (chord, pitch set, composite out with cents and exact ratio): closest is `ChordTarget.insert(ChordInsertRequest)`. Pitch set and composite: none.

## Unverified by the scout

- Nothing was run.
- `ToneAudioEngine` was not read for fractional-pitch handling (the lab's C0 note says it is allowed).
- Not every workbench letter key was checked.
- The listener order between DockStage and the lab was not confirmed.
- Whether Space is used in the lab was not checked.

## What the lab side plans (from the discussion with the human, 2026-11-15)

Not decided yet; for the end-of-arc review:
- A short "seams" arc inside the lab after this arc's Final step: a coupling list for every panel (reads, emits, plays, shared signals), then three contracts (PitchContext, Preview, Emit) implemented by the lab's single provider with no visible change, and the cross-panel behaviors kept as a short list of signals (selection, armed chord, hover preview, stepper root).
- Voicing modes after that, as a pure function plus a small panel that only talks through Emit and Preview.
- A throwaway port of the least-coupled piece (chord shelf or voicing panel) to learn what the contracts miss.
