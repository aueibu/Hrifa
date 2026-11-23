# PROGRESS

Orchestrator updates after every milestone step. After a compaction or a /clear, resume from here, not from memory.

## Status
- Arc: Live Series: drone and raga thinking on the harmonic series (`arcs/live-series`)
- Current milestone: Draft (ARC.md awaiting the human's approval)
- State: awaiting human

## Where the work is (read this first after a /clear)
- **Branch** `interval-placement-live-series` on `aueibu/Hrifa`, pushed, **not merged** into `main`. `origin/main`
  has moved since the branch was cut (79c4a3e); Setup step 1 brings the branch up to date.
- **Worktree** used so far: `C:\Data Files\Projects\Hrifa\.claude\worktrees\lexicon` (hand-made; `EnterWorktree(name)`
  fails on this Drive checkout, so `git worktree add` by hand, then `EnterWorktree(path)`). The worktree has no
  `node_modules`: pass the main checkout's jsdom to the smoke test.
- **Page** (until Setup moves it): `shell/arcs/interval-placement/series/live-series.html`, published at
  https://claude.ai/artifact/Mdtwb8v22H9CpnzUFnXnMW (version 5). Republish from the same file path to keep the link.
- **Smoke test**: `shell/arcs/live-series/smoke-series.cjs` (73 checks: the confirmed scenario numbers, every
  control, a silent fake Web Audio for drone, notes, arpeggio, reverb and drone styles). From `shell/`, with Node 24:
  `"C:/Users/apoor/tools/node-v24.18.1-win-x64/node.exe" arcs/live-series/smoke-series.cjs
  arcs/interval-placement/series/live-series.html "C:/Data Files/Projects/Hrifa/shell/node_modules/jsdom"`.
  Exit 0, "all checks passed", "no script errors" (last run 2026-11-23).
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

## Shared touches (locks taken)
- None yet. Setup will take `package.json` (the `check:live-series` script).

## Open questions for human
- Approve ARC.md, including: the workstream name `live-series`; the DECISIONS prefix `LIVESERIES`; the check command
  (the smoke test via `check:live-series`); moving the page into `arcs/live-series/`; the order of M3–M5.
- When to merge the branch into `main` (it carries only the side study commits and this draft).
- Open from the side study (M1): drone sound and range, Note pulses tempo rule, ladder anchoring, reverb defaults.
- Bigger directions held for M2–M5: hung-set input from the required-interval explorer; alap as revealing the field;
  a taraf bed from the series; sam and tala from the ratios.

## Next action
Ask the human to approve ARC.md (with the *(approval)* items); on approval run Setup steps 1–4, then C0.
