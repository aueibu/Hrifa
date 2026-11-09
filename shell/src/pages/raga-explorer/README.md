# Raga Explorer

A browse/visualize/listen applet over the raga-explorer project's `MASTERLIST-carnatic-ragas.csv` (6,229 ragas,
9,484 distinct scale variants). Route: `/raga-explorer`. Built in `shell/` (React + Vite + Mantine), not the legacy
static-applet system, per the user's explicit choice when this was scoped.

## What it does

- **Find a raga two ways**: click pitch classes on the filter ring (top-left) to require them, or search/filter the
  list below by name (any spelling — see "Search" below), chakra, melakarta, Vakra, or Bhashanga. The two combine:
  a text search and a pitch-class filter narrow the same list together.
- **See a raga's place in the system**: melakarta number/name, chakra (the standard 12-chakra grouping of the 72
  melakartas), and a "Parent scale" link to that melakarta's own row, itself playable the same way as any janya.
- **See the raga two ways**: a chromatic ring (Sa at 12 o'clock, the raga's own swaras filled in, Sa marked orange)
  and a Sa-to-upper-Sa "rung ladder" (13 fixed horizontal rungs, the aroha and avaroha each traced left-to-right as
  their own coloured path across the rungs — so a zig-zag reads as vakra, a skipped rung as a varjya/bhashanga note).
  Both stay live during playback: the currently-sounding note pulses on the ring and enlarges on the ladder.
- **Explore links**: sibling variants (same raga, another scale reading), scale twins (a different-named raga with
  an *identical* scale — a real, citable fact from the masterlist's `Scale Twin Group`, not a similarity guess),
  same name under another melakarta, a similar name judged NOT the same raga, and "also listed under other
  melakartas" (the masterlist's multi-parent groups). Every entry is a live link that re-centres the whole page on
  that raga. These all resolve real Raga ID references already stored in the masterlist's own cross-link columns
  (`Same Name Under Other Melas`, `Similar Names Not Merged`, `Multi-Parent Group`) — nothing here is re-derived or
  guessed at render time.
- **Full theory panel**: everything from the masterlist's theory columns (pitch-class set, purvanga/uttaranga,
  tritones, perfect-fifth "imperfections"/"detached" swaras, large gaps in melodic order AND in the raga's whole
  pitch gamut, the melodic mirror, the negative/complement scale), recomputed client-side by `theory.ts`, a
  hand-ported twin of `raga-explorer/scripts/raga_theory.py` — see that file's docstring for the underlying
  rationale, since it's identical here.
- **Preview by ear**: play (aroha then avaroha), loop, adjustable tempo/gap/volume, and a tanpura drone as a global
  toggle. The tanpura's notes are selectable (default Sa Pa) and the root pitch (which absolute frequency "Sa" is)
  is selectable from a dropdown of common tonics. The "root sargam" selector additionally lets any degree of the
  *current raga's own scale* sound as Sa (a simple transposition), separate from the tonic frequency itself.
  Playback uses plain Web Audio oscillators (see `audio.ts`) — no samples, no Tone.js dependency — with a
  lookahead scheduler so looping doesn't drift or pile up scheduled notes.

## Extras added beyond the request (implemented, not just noted)

The task asked for anything that would expand usability to be noted here **and implemented**. These are:

- **Settings persistence** (`settings.ts`, localStorage): tonic, root sargam, tempo/gap, tanpura on/off + its notes,
  both volumes, and the last-viewed raga all survive a reload. Why: without this, every session starts from
  scratch, which is friction for a tool meant for repeated educational use.
- **Shareable/bookmarkable raga links**: the selected raga is mirrored into the URL (`?raga=<variant id>`), restored
  on load. Why: lets a raga be linked directly (a lesson plan, a note to self) instead of only reachable by
  re-searching.
- **Alias-aware search**: the search box matches against `All Spellings` and `Alias Names`, not just the merged
  display name. Why: this dataset's whole reason for existing is that the same raga has many transliterations
  across sources; searching only the display spelling would make half the dataset unfindable by the "wrong" name.
- **Random raga button** (🎲): picks a uniformly random raga. Why: cheap, and a genuinely useful way to *discover*
  ragas rather than only look one up — the dataset is too large to browse start-to-end.
- **Playable parent melakarta**: a janya's detail panel links to and can preview its own parent scale. Why: hearing
  a janya against its parent is a basic and immediately useful comparison for someone learning the system.
- **Vakra/Bhashanga/chakra/melakarta filters** on the list, independent of the pitch-class ring. Why: these are
  exactly the categorical facts a student or researcher would want to narrow by, and they were already first-class
  columns in the masterlist.

## Data pipeline

`raga-explorer/scripts/export_raga_explorer_data.py` reads `MASTERLIST-carnatic-ragas.csv` and writes
`shell/public/raga-explorer/ragas.json` (~5 MB; fetched once at runtime via `data.ts`, not bundled into the JS —
see that file's comment for why). It keeps only what the applet needs: identity, mela, aroha/avaroha text, the
canonical semitone chain (`Aroha/Avaroha Semitones`, reused as-is rather than re-implementing
`canonical_chain.py`'s octave-placement search a second time in TypeScript), Vakra/Bhashanga, source
count/status, and the ID-based cross-link columns. Everything else (pitch-class set, tritones, mirror, negative,
gaps, ...) is computed client-side by `theory.ts` from that raw data, so it's never duplicated or allowed to drift
from a stale export.

**Regenerating the data** after any masterlist change:

```bash
cd raga-explorer
python scripts/export_raga_explorer_data.py
```

This just overwrites `shell/public/raga-explorer/ragas.json`; nothing else needs to change.

## Keeping `theory.ts` in sync with `raga_theory.py`

There is no code generation between them — `theory.ts` is a hand port. If `raga_theory.py` changes, mirror the
change in `theory.ts` by hand (the functions are named and shaped to match one-to-one). Both were cross-checked
against each other during development (Kanakāngi and Kalyani by hand, matching exactly).

## Known limitations / not attempted

- **No gamaka/ornamentation.** Playback is plain equal-tempered sine tones at the notated pitch; this dataset
  doesn't carry ornamentation data, and modelling it convincingly was out of scope for this build.
- **~5 MB data file, fetched once.** Fine for a personal/educational tool on a normal connection; a slower link
  would benefit from a loading-progress indicator or splitting the payload (not done here).
- **List rendering is capped at 250 rows** at a time (with a "+N more, narrow your search" note) rather than
  virtualized, to keep the initial build simple. Filtering is instant either way (a plain array filter over 6,229
  rows), only the DOM list itself is capped.
- **No raga-to-raga audio comparison (A/B) view.** Considered, cut for scope — the linked-ragas panel lets you
  jump to a twin/sibling and replay, but there's no side-by-side player.
