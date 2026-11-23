# ARC: Live Series: drone and raga thinking on the harmonic series

**Status: APPROVED by the human 2026-11-23 with no changes** (every *(approval)* item below accepted as written:
workstream `live-series`, prefix `LIVESERIES`, the check command, the page move, M3–M5 in the order given).

## Goal

Grow the Live Series side study into the place where the human's drone and raga practice meets the
spectral-to-rhythm work. Human (2026-11-22): "What I want to get better at is marrying the drone and raga approach
from hindustani music with the spectral-to-rhythmic ideas we have been exploring. I think the groundwork is already
there with the ability to look at any series as having both a 1/1 within its own cycle, a 1/1 derived from
rerooting, and an imagined fundamental (possibly realized in auditory) by considering any cycle to be some part of a
harmonic series segment." The problem it answers, in the human's words: "It often ends up being a poor combination of
looping phrases that serve as the bed with contrived melodic forms. The harmonic motion is another issue as is the
rhythmic choices."

When done: one page where a set of notes shows the harmonic series it sits in and its fundamental, live, and that
fundamental can be heard (drone, pulse); the bed comes from the series instead of a loop (taraf); the large form comes
from revealing the field note by note (alap); and the rhythm comes from the same ratios (sam and tala). It stays a
standalone page until the human decides its home in the app (M6).

## Where it starts (the side study, 2026-11-22)

`shell/arcs/interval-placement/series/live-series.html` (moved to `shell/arcs/live-series/live-series.html` in Setup), version 5 at
https://claude.ai/artifact/Mdtwb8v22H9CpnzUFnXnMW, branch `interval-placement-live-series` (6f39a2b → 8e3b4ed,
pushed, not merged). Every human decision so far, in order (details in PROGRESS.md, "Log"):

1. Home: an Interval Placement side study (now superseded by this arc).
2. Tempered input: a **ladder of candidates**, simplest series first, each later rung more complex and closer,
   click to choose; exact ratios choose the exact series (common denominator and gcd).
3. Sound: a **drone raised by octaves** and the **fundamental as a pulse**, both only on a click.
4. View: **current state + trail** (step back, go to a step, replay).
5. The drone marked on the drawn series: a dashed purple line on its harmonic, a fainter one on its octave.
6. **Notes** and **Arpeggio** as on/off toggles that follow changes live.
7. **Drone octave** (default on) and **Drone bare sine** (default off) toggles.
8. **Notes bare sine**; the Harmonic Field Lab's reverb (Dry / Room / Hall, equal-power mix, lab limiter), no custom
   impulse loading.
9. **Drone style**: holds / pulses / pulses below hearing (default holds); rate = the fundamental moved by whole
   octaves into 1–2 strikes per second. The note-stream pulse is named **Note pulses**.

Confirmed scenario numbers (the smoke test checks all of them): 1/1 5/4 3/2 = 4:5:6 (fundamental 1/4) → +7/4 no move
→ +9/8 8:9:10:12 (1/8) → +6/5 20:24:25:30 (1/20, 13.08 Hz under C4 = 261.63 Hz); 12-EDO 0 4 7 = 4:5:6 within 15¢ but
30:38:45 within 10¢; 0 4 7 10 = 20:25:30:36 at 20¢; the required-interval default 0 3 8 13 19 = 10:12:16:21:30 at 20¢.

## Parameters

- Owned paths: `shell/arcs/live-series/` (the page, `smoke-series.cjs`, this ARC and PROGRESS). If M6 brings it into
  the app: the new page folder it creates there.
- Shared paths it may touch: `package.json` (setup only, under a lock: the `check:live-series` script);
  `shell/arcs/interval-placement/PROGRESS.md` (one pointer line on the side-study row: the work moved here);
  `DECISIONS.md` (this arc's rows), `BACKLOG.md` (this arc's items). Nothing in `src/` before M6.
- Check command *(approval)*: `corepack yarn check:live-series` = `node arcs/live-series/smoke-series.cjs
  arcs/live-series/live-series.html` (the jsdom smoke with a silent fake Web Audio; exit 0 = all checks pass and no
  script errors). Node 24 (portable copy at `C:\Users\apoor\tools\node-v24.18.1-win-x64`). In a worktree without
  `node_modules`, Yarn refuses to run scripts ("Couldn't find the node_modules state file"): run `npm run
  check:live-series` there with `NODE_PATH` set to the main checkout's `shell/node_modules`. When M6 adds app code, the
  script grows the usual tsc / format / lint / vitest steps.
- Sound: the page never makes sound on load; every sound starts on a click. Claude never presses a sound control in
  a browser without asking (it plays on the human's machine). Sound is checked with the fake Web Audio in the smoke
  test; how it sounds is the human's call.
- Look: same look as the Interval Placement side pages (tokens and classes copied from
  `interval-placement/crystal/rhythm-crystal.html`); reuse lab values exactly when porting lab behavior (the reverb).
- Behavior first (shell rule 7): every new behavior starts as a scenario table of the human's own notes, with
  options shown on an example where they give different results; thin slice, then the human listens.
- DECISIONS prefix *(approval)*: `LIVESERIES`.
- Concurrency: path-scoped commits only (`git add <paths>`, `git commit -- <paths>`); the branch is merged into
  `main` only with the human's OK.

## Setup (after approval, before C0)

1. Bring the branch up to date with `origin/main` (it moved: 79c4a3e, other sessions' JI work).
2. `git mv shell/arcs/interval-placement/series/live-series.html shell/arcs/live-series/live-series.html`; add the
   pointer line to the Interval Placement side-study row.
3. Lock `package.json`, add `check:live-series`, run it green, commit (`arcs/live-series/`, `package.json`, the
   Interval Placement pointer), release the lock. Register `LIVESERIES-1` in `DECISIONS.md`.
4. Republish the page from its new path to the same artifact link.

## Preconditions

- `check:live-series` exists and is green before the first code milestone (template rule).

## Non-goals

- No app code (`src/`) before M6 decides the home.
- No changes to the Harmonic Field Lab or Interval Placement page code (lab behavior is copied by value, not
  imported).
- No new knobs beyond what a milestone's confirmed scenarios ask for (Interval Placement lesson: knobs replaced the
  model).
- No looping-phrase bed: the bed comes from the series.

## Milestones

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, every other arc's Status, `arcs/LOCKS.md`; note
  anything that touches pitch representation, audio or the Interval Placement and lab pages.
- Acceptance:
  - [x] PROGRESS.md notes the scan result (2026-11-23)
- Human checkpoint after: no

### M1: Listening pass on version 5
- Scope: the page as it is. The human listens; the orchestrator brings the open questions with examples where the
  options differ: drone sound and range; the Note pulses tempo rule (the busiest note at most 8 per second); the
  ladder's anchoring (lowest note exact, now, vs errors balanced across all notes: show a set where the two give a
  different fundamental); reverb defaults.
- Acceptance:
  - [x] Every answer written under "Checkpoint decisions" here
  - [x] Agreed changes made; `check:live-series` passes with new checks for them (82 checks, 2026-11-23)
- Human checkpoint after: yes (sound)
- Checkpoint decisions (human, 2026-11-23, answering the four M1 questions):
  - Ladder anchoring: **B, the error is shared** across all notes (the fundamental moves so the worst error is as
    small as it can be for each rung) instead of the lowest note being exact. Example where they differ: C E G B♭
    (0 4 7 10, 20¢): now 20:25:30:36 at 13.08 Hz; with B 4:5:6:7 at 65.96 Hz (±16.6¢). Exact ratio sets unchanged.
  - Note pulses tempo: "b-toggle for both", read as a toggle between at most 4 per second (B, the default) and at
    most 8 per second (A, the old rule). C E G: cycle 1.96 s at 4/s, 0.98 s at 8/s. Confirmed by the human ("B - okay").
  - Drone sound: keep as is. Default range: "select 50-110 range by default", read as the existing "near 55–110 Hz".
    Add a lower range: "keep drone in 20 to 55 range too". Rule chosen: **A, the octave 27.5–55 Hz** (one below the
    55–110 option), over B (20–40 Hz) and C (the true fundamental when 20–55 Hz). JI example's end (F 13.08 Hz):
    52.3 Hz; 1/1 7/6 3/2 (F 43.6 Hz): 43.6 Hz.
  - Reverb default: **Hall at 30%** (was Dry).
  - Notes tuned to the series (human, 2026-11-23, after asking "the notes stay tuned to their tempered pitches?
    what??"): until now only the drone and the pulse counts followed the chosen rung; the notes played the typed
    pitch. Now held notes, Arpeggio, Replay and the pulse clicks sound at the chosen series' exact harmonics by
    default, with a toggle **Notes tuned to the series: on / off** to hear the typed pitches. A rung click retunes
    at once (a glide is the tonality-flux candidate for M3). Example where it differs: C E G B♭ at 4:5:6:7 sounds
    C +14.6¢, E +0.9¢, G +16.6¢, B♭ −16.6¢ from 12-EDO when tuned. Exact ratio input changes only when a non-exact
    rung is clicked.
  - Series list height (human, 2026-11-23): "keep the series results to like 7 long with a scroll bar for the
    others". The list shows 7 rungs and scrolls inside itself; the chosen rung stays in view when the list redraws.
  - Tuning readout (human, 2026-11-23: "any way to get a visual / readout for what changes with tune to series on /
    off"; approved the proposed table): under the facts in the Fundamental panel, one row per active note: typed
    pitch, tuned pitch (its harmonic), difference in cents with a small bar on a ±fit-limit scale, and beats (the Hz
    difference, about how fast the typed note wobbles against the series). The sounding column is highlighted and
    follows the toggle; a constant line notes that beats are faint with Drone bare sine on. Human, after the first
    look: "show the same layout ... even when the result is exact. REMEMBER NO JUMPING TEXT OR BOXES": the same
    table on an exact rung (0.0¢, beats none), fixed column widths, constant footnote, fixed-width "sounding" label. Example: C E G B♭ at 4:5:6:7: C +14.6¢ (about 2.2/s), E +0.9¢, G +16.6¢, B♭ −16.6¢.
  - Exact ratios on a simpler rung: kept as A (they retune; the human found the commas this exposes the interesting
    part, and asked for them to be shown). 1/1 5/4 3/2 6/5 on 15:18:19:23 moves them −19.0, −19.0, +3.9, +19.0¢.
  - Comma column (human: "the table should show the comma that it makes", "with a little text hint if that matches
    a well known / historic comma"): for ratio input, the exact ratio each note moves by against the lowest note,
    (k_i / k_0) / (typed_i / typed_0); "none" on the exact rung, "—" for tempered notes. Short name beside the ratio,
    full name and size in a tooltip, only for well-established commas (syntonic 81/80, Pythagorean, septimal 64/63,
    lesser and greater diesis, schisma, diaschisma, kleisma, septimal kleisma, septimal diesis 36/35, slendro diesis
    49/48, undecimal 33/32, rastma 243/242). Human after the look: "show a little hint like a small triangle ... if
    the user hovers they can see the historic name and notes. That makes better use of screen space": the name is
    not printed; a small triangle marks a named comma and hovering it shows the name and notes. Scenarios: 15:18:19:23 gives none, 76/75, 46/45 (unnamed); 1/1 16/9 as
    4:7 gives 63/64 septimal comma, as 5:9 gives 81/80 syntonic comma.
  - Page width (human: "the whole panel (and app) will need to be wider to show all this, thats fine"): page 1600 px,
    Fundamental panel 1.5x the Series panel; the table keeps fixed widths and scrolls sideways inside itself when narrow.
  - Hearing the beats (human: "for the beats readout is that beating compared to 1/1 or what? Is there a way we can
    let the user audition that? Was the intention for pulsing to carry that info? I feel like it hides it."): the
    column is each typed note against its own exact harmonic, not against 1/1; the drone sounds only some harmonics
    and the pulses carry rhythm, not mistuning. Chosen: **mode A now**, a latched **listen** toggle on each row
    playing the typed note and its exact harmonic as two sines (G at 4:5:6:7: 392.00 and 395.77 Hz, about 3.8 beats
    per second); several rows on = all their beats at once (the "reference harmonics" idea, opted into by hand). The
    pair follows rung and note changes live; Stop sound ends all. Column renamed "beats vs harmonic" (the longer name did not fit a fixed column).
    **Mode C to come in M4**: a tanpura-like drone that sounds the series' harmonics, so notes beat against the drone.
  - Two beat listings (human: "build both listings"), under the tuning table, for pairs among the rows whose listen
    is on; fixed boxes 6 rows tall that scroll, with a placeholder row below two rows on:
    - **Beats between the notes**: for notes at harmonics a and b (g = gcd), note 1's (b/g)th partial meets note 2's
      (a/g)th; typed beat = |(b/g)·f1 − (a/g)·f2|; tuned is always none (said once in the footnote); "rough" above
      15 per second; "too high to hear" past the 16th partial; a listen toggle plays the two meeting partials as
      sines. C E G B♭ at 4:5:6:7 typed: C–G 0.9, C–E 10.4, E–G 17.8, E–B♭ 23.4, C–B♭ 33.3, G–B♭ 53.0 per second.
    - **Rhythms between the beats**: both beat rates, the nearest ratio p:q (p, q ≤ 8, by closeness of a/b to p/q),
      and the line-up time 1 / |q·a − p·b|. Same chord: G 3.77 / B♭ 4.44 ≈ 6:7, every 3.9 s; C 2.22 / G 3.77 ≈ 3:5,
      every 4.5 s; C 2.22 / B♭ 4.44 ≈ 1:2, every 212 s. Rates more than 8 times apart show the plain ratio.
  - Series drawing width (human: "stretch the harmonic series graph to fit the whole width we have. better
    resolution available"): the drawing always fills its panel's width, empty or not, and is redrawn on a resize.
  - No jumping, the whole page (human: "IVE SAID IT MORE THAN 10 ... TIMES ITS THE WHOLE UI DESIGN PRINCIPLE"):
    fixed-width on/off words, Series list always 7 rows tall, the table always 6 rows tall (scrolls for more, drawn
    when empty), the facts keep their seven rows when empty, the drawings keep their height when empty, reserved
    lines for the example note, the Series note, the drone line and the Add error, varying text keeps its tallest
    height until a resize, tabular digits in buttons. Measured in headless Edge across 20 states: no box or button
    moves or resizes; only the two drawings' widths follow their content inside their own scroll boxes.

### M2: Collections in from the required-interval explorer
- Scope: bring a collection and its hung set in directly (paste or link), with hung tones marked, so the ur-chalan
  (neutral tones and their auxiliaries) can be heard against the fundamental.
- Acceptance:
  - [ ] Scenario table confirmed first (the explorer's default 0 3 8 13 19, hung A♭2 C♯3, and one more of the human's)
  - [ ] `check:live-series` passes with checks for the confirmed cases
- Human checkpoint after: yes

### M3: Alap: revealing the field
- Scope: a reveal order (notes added one at a time, or removed) played over time with the drone following, so the
  order of revealing is the harmonic progression; the trail is the form.
- Acceptance:
  - [ ] Scenarios confirmed (the human's reveal orders; which ones move the fundamental and by how much)
  - [ ] Thin slice; `check:live-series` passes
- Human checkpoint after: yes (sound)

- Early decisions (human, 2026-11-23, before M3 starts; "I like both of these"):
  - Shaded tones for **andolan**, rule B: a note's pitch as an exact harmonic in the rival ladder rungs (rungs 2–6
    from the current one). It decides which notes sway, which way and how far; notes every rung agrees on stay
    steady. Scenario: C E♭ A♭ D♭ G (0 3 8 13 19), rung 1 10:12:16:21:30: C −8 to +1¢ and G −8 to +1¢ steady,
    E♭ −15 to −21¢ (sways flat), A♭ −8 to −15¢, D♭ +10 to +19¢ (sways sharp).
  - Shaded tones for **meend** targets, rule A: the nearest unused harmonics of the current series (h−1, h+1),
    skipping listed notes and their octaves, halved to 2h±1 when too wide. Same scenario: C 9/10 −182, 11/10 +165;
    E♭ 11/12 −151, 13/12 +139 (halved 23/24 −74, 25/24 +71); A♭ 17/16 +105, 31/32 −55 (15 = G skipped); D♭ 22/21
    +81, 41/42 −42 (20 = C skipped); G 29/30 −59, 31/30 +57 (halved ±29).
  - Candidates, not yet confirmed: widen M3 to "two motions" (reveal with Sa fixed; re-root with notes fixed);
    tonality flux (Partch): on a re-root the notes glide to their exact harmonics in the new series. Same scenario:
    rung 1 → 2 moves only D♭, by 64/63 (27.3¢), into the new root; rung 2 → 3 moves E♭ by 81/80 (−21.5¢), D♭ by
    95/96 (−18.1¢), A♭ by 215/216 (−8.0¢); later rungs move voices by under 12¢. Andolan (rule B) is that flux
    hinted at and not taken.

### M4: Taraf: a bed from the series
- Scope: resonators tuned to the current series' harmonics that sound only when a played note excites them
  (sympathetic strings), replacing a looping bed.
- Acceptance:
  - [ ] Scenarios confirmed (which harmonics ring for which notes; tolerance)
  - [ ] Thin slice; `check:live-series` passes
- Human checkpoint after: yes (sound)

### M5: Sam and tala from the ratios
- Scope: the Note pulses cycle as a tala: sam where all streams meet, the cycle length from the fundamental, and how
  it relates to the pulsing drone (both are octaves of the fundamental).
- Acceptance:
  - [ ] Scenarios confirmed (cycle lengths for the human's sets; what marks sam)
  - [ ] Thin slice; `check:live-series` passes
- Human checkpoint after: yes (sound)

### M6: A home in the app (decision first)
- Scope: the human decides: its own page, a Workbench module, a panel of Interval Placement, or stays standalone. Any
  app code gets an ARC revision first (owned paths, seams, check script).
- Acceptance:
  - [ ] Decision recorded here and in `DECISIONS.md`
- Human checkpoint after: yes

*(approval)* M3–M5 order is open; the human may reorder or drop any of them.

## Stop-and-ask conditions
- A criterion can't be met after 2 attempts.
- A change is needed outside Owned or Shared paths, or to another arc's page code.
- A shared path needed is locked by another arc.
- Any decision about look, sound, or musical taste not settled in a milestone's confirmed scenarios.
- Any sound would need to be played to check something: ask first.

## Budget
Max 2 attempts per milestone; then stop and report. Standalone-page milestones are small enough for the orchestrator
to build directly (as the side study was); a builder + reviewer pair once a milestone touches app code.
