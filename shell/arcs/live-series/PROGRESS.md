# PROGRESS

Orchestrator updates after every milestone step. After a compaction or a /clear, resume from here, not from memory.

## Status
- Arc: Live Series: drone and raga thinking on the harmonic series (`arcs/live-series`)
- Current milestone: M1 (listening pass on version 5); Setup and C0 done 2026-11-23
- State: awaiting human (M1 is a sound checkpoint)

## Where the work is (read this first after a /clear)
- **Branch** `interval-placement-live-series` on `aueibu/Hrifa`, pushed, **not merged** into `main`. It already
  contains `origin/main` (79c4a3e) as of 2026-11-23.
- **Worktree** used so far: `C:\Data Files\Projects\Hrifa\.claude\worktrees\lexicon` (hand-made; `EnterWorktree(name)`
  fails on this Drive checkout, so `git worktree add` by hand, then `EnterWorktree(path)`). The worktree has no
  `node_modules`: pass the main checkout's jsdom to the smoke test.
- **Page**: `shell/arcs/live-series/live-series.html` (moved in Setup from
  `arcs/interval-placement/series/`), published at https://claude.ai/artifact/Mdtwb8v22H9CpnzUFnXnMW (version 5).
  Republish with `url` set to that link to keep it.
- **Gate**: `corepack yarn check:live-series` from `shell/` (Node 24). In this worktree Yarn refuses to run scripts
  (no install state): `NODE_PATH="C:/Data Files/Projects/Hrifa/shell/node_modules" npm run check:live-series`.
- **Smoke test**: `shell/arcs/live-series/smoke-series.cjs` (73 checks: the confirmed scenario numbers, every
  control, a silent fake Web Audio for drone, notes, arpeggio, reverb and drone styles). From `shell/`, with Node 24:
  `"C:/Users/apoor/tools/node-v24.18.1-win-x64/node.exe" arcs/live-series/smoke-series.cjs
  arcs/live-series/live-series.html "C:/Data Files/Projects/Hrifa/shell/node_modules/jsdom"`.
  Exit 0, "all checks passed", "no script errors" (last run 2026-11-23, via `check:live-series`).
- **Real-browser check**: headless Edge loads the page with no console errors (2026-11-22). Command pattern: `msedge
  --headless=new --disable-gpu --user-data-dir=<scratch> --enable-logging=stderr --virtual-time-budget=3000
  --dump-dom file:///<copy of the page>`.
- **Separate thread, not this arc**: the Hrifa world export and `LEXICON.md` live on branch `lexicon`
  (`_Ideas/Hrifa World/HANDOFF.md`). The lexicon's Hindustani bridge (section 4) records this arc's vocabulary.

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Origin (Interval Placement side study, 2026-11-22) | Human: "show what series a given subset/field sits in with its theoretical fundamental and then how it changes when notes are added or removed - live". Scenario table confirmed in chat; human chose home = Interval Placement side study, tempered input as a ladder of candidates, drone raised by octaves + fundamental as a pulse, current state + trail. Version 1 (6f39a2b). | jsdom smoke 25 checks | Ladder: each h ≤ 256 as the lowest note's harmonic number, every note rounded to its nearest harmonic, kept when its worst error beats every simpler h, two notes on one harmonic is not a fit, stops under 1¢. |
| v2 (b589abd) | Human: "show its position on the drawn series line too? maybe indicated with a dash line or color"; "the main notes be toggled on and off not momentary. For arpeggio - the same". Drone marked (dashed purple + fainter octave, axis widens below harmonic 1); Notes and Arpeggio toggles following changes live. | 40 checks | Human asked why the faint line: the drone's upper-octave sine was Claude's sound-design addition, never asked for. |
| v3 (7f0b6d1) | Human: "add the octave toggle so I can compare. and toggle for bare sine". Drone octave (default on), bare sine (default off), live, combinable. | 51 checks | |
| v4 (aa007e2) | Human: notes' wave? (it was triangle) "can we toggle bare sine there too? Can we use the reverb implement (minus custom loading) from the harmonic lab too?". Notes bare sine; lab reverb copied by value (`audio/reverb.ts`, `audio/engine.ts`: Room 0.9 s / Hall 2.8 s seeded noise, equal-power mix, Dry → preset starts at 0.3, 30 ms swap fade, Stop cuts the tail, lab limiter). | 63 checks | |
| v5 (8e3b4ed) | Human expected a drone that pulses when too low (offered at the start, built as note streams instead). Chose: drone style menu with all three (holds / pulses / pulses below hearing) and rate = fundamental moved by whole octaves into 1–2 per second (A = 1/1 6/5 5/4 3/2: 1.64/s; B = 4:5:6: 1.02/s with "pulses"). Pulse renamed Note pulses. | 73 checks; headless Edge no errors | Human: "looks cool"; later "all good" after briefly thinking the page was broken. |
| Draft (2026-11-23) | Human: "catch me up ... so that we can write its progress/arc and clear"; chose "its own arc" over a side-study handoff. ARC.md drafted; smoke test saved into the arc folder (jsdom path now optional). | smoke 73, green from the new path | Awaiting approval of the *(approval)* items in ARC.md. |
| Setup (2026-11-23) | Human approved ARC.md with no changes. Step 1: branch already contains `origin/main` (79c4a3e), nothing to merge. Step 2: page moved to `arcs/live-series/live-series.html` (no relative links to fix); Interval Placement side-study pointer updated. Step 3: `package.json` lock taken, `check:live-series` added, `LIVESERIES-1` registered in `DECISIONS.md`. | `check:live-series` green: 73 checks, no script errors | Lock taken in this worktree's `arcs/LOCKS.md` (the main checkout's table was empty; worktree isolation blocks writing there). Committed 75790d6, then the lock row removed. Step 4: the live artifact was read and is byte-identical to the moved page (only the publish wrapper differs), so no republish was needed; the next content change publishes from `arcs/live-series/live-series.html` (copy to the scratchpad first: the file has 2 hard links because of Google Drive) with `url` set to the same link. |
| M1 attempt 1 (2026-11-23) | Human answered the four questions (ARC.md "Checkpoint decisions" under M1). Built directly: ladder shares the error (`fitAt` + recentering with re-rounding, up to 4 passes; a rung counts only if its lowest harmonic stays h); Note pulses at most 4/s with a toggle to 8/s (button `pulseRate`, takes effect at the next sam); drone range default 55–110 Hz; reverb default Hall 30%. Not yet built: the low drone range (rule question open, see below). | `check:live-series` 80 checks, green | Re-rounding finds fits the lowest-note-exact rounding misses: C E G B♭ D at 15¢ is now 23:29:34:41:51 (±12.3¢, checked by hand). Publish to the artifact link failed twice (read-back HTTP 403, same time as the org spend limit); live page is still v5. |
| C0 (2026-11-23) | Context scan done (section "C0 scan result" below): no locks, no conflicts, no importers; overlaps noted (Harmonic ring backlog item, ratio-rhythm for M5, required-interval explorer location for M2). | no code change; gate last green at Setup | Read directly after the scan agent stopped on the org spend limit. |

## C0 scan result (2026-11-23, main checkout's coordination docs)
- **Locks**: none held by any arc (main checkout's `arcs/LOCKS.md` is empty).
- **Other arcs**: `interval-placement` at M2c (model reset 2026-11-20, catalog with the spacing, before any builder);
  `ratio-rhythm` at M1 on `main` (its live work is on the `ratio-rhythm-arc` / `ratio-rhythm-lib` branches: JI
  Z-relation enumeration); `affine-focus` awaiting the human at M3 + M4; `workbench` Timeline arc drafted, awaiting
  approval; `stage` and `structure` finished; `harmonic-field-lab` has no active arc. None touches this arc's paths.
- **Imports**: no `src/` file imports from `arcs/`; nothing reads the page, so moving it broke nothing.
- **DECISIONS**: main and this branch agree except for the new `LIVESERIES-1`. Contracts that matter only at M6 (app
  code): W-1 (pitch in midicents in packets), W-2 (time as quarter-note rationals), H-1 (the lab's monzo + cents in
  `src/lib/harmonic-field/`), INTERVALPLACEMENT-2 (a voicing is `{refHz, cents[]}`), RATIORHYTHM-1 (exact ratios and
  integer slots per cycle; seconds only at the audio edge). The page keeps cents + exact ratios + Hz, which matches
  H-1 / INTERVALPLACEMENT-2 in spirit; M6 picks one edge conversion.
- **Overlaps to reuse, not duplicate**:
  - BACKLOG `[interval-placement]` "Harmonic ring: a chord's span read as a harmonic series, with affine maps on it"
    (2026-11-21): same rule as this page's ladder (L = harmonic number of the lowest note, round every note to its
    nearest harmonic, the choice of L is the real decision; example 0 3 8 14 19 fits L = 5 at 35¢ or L = 22 at 14¢).
    Its home is open ("the required-intervals explorer or the Ratio rhythm lab"). Bring this to the human at M1
    (ladder anchoring) and M5 (the ring of harmonics L..top as a rhythm cycle is the tala question).
  - `ratio-rhythm` (LCD rings, integer slots per cycle) is the natural source for M5 (sam and tala); compare its names
    and formats before inventing any (memory: the canon is math facts only; check names with the lab).
  - The required-interval explorer for M2 lives in `arcs/interval-placement/required/` (`core.ts`, `required.ts`,
    `required-page.template.html`), owned by the interval-placement arc: read its collection and hung-set format,
    copy by value, never edit it.
- **Audio**: the lab's reverb is copied by value (Non-goals); no shared audio contract is touched before M6.

## Shared touches (locks taken)
- `package.json` (Setup, 2026-11-23: the `check:live-series` script); released after the setup commit.

## Open questions for human
- When to merge the branch into `main` (it carries only the side study commits and this draft).
- Open from the side study (M1): drone sound and range, Note pulses tempo rule, ladder anchoring, reverb defaults.
- Bigger directions held for M2–M5: hung-set input from the required-interval explorer; alap as revealing the field;
  a taraf bed from the series; sam and tala from the ratios.

## Next action
M1, waiting on the human: (1) the rule for the low drone range ("keep drone in 20 to 55 range too"): A = the octave
27.5–55 Hz, B = the octave 20–40 Hz, C = the true fundamental when it is 20–55 Hz, else the nearest octave inside
(examples: JI example's end F 13.08 Hz gives 52.3 / 26.2 / 26.2; 1/1 7/6 3/2 F 43.6 Hz gives 43.6 / 21.8 / 43.6);
(2) confirm "b-toggle for both" = 4/s default with a toggle to 8/s. Then build the range, rerun the gate, republish
v6 (copy to the scratchpad, `url` = the artifact link; retry the publish that failed with HTTP 403), and the human
listens (M1 human checkpoint). Never press a sound control in a browser without asking.
