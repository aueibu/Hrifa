# Raga Explorer

A consolidated, cross-referenced Carnatic (and, going forward, Hindustani) raga
database built from multiple online sources, with a computed "Scale ID" layer
representing each raga's scale as a 12-bit pitch-class set.

## Layout

- `data/` — the master datasets.
  - `master-carnatic-raga-database.csv` — the central Carnatic raga database.
    One row per melakarta base scale or janya raga variant, with per-source
    Aroha/Avaroha columns (Repo, Musiclegato, Royal Carpet, Wikipedia, Nerur,
    Karnatic Tutor, Pravagam), an `Alternate Names` column, source-agreement
    counts, and a `Needs Review` column documenting every correction, merge,
    or ambiguity with a plain-language reason. This is the single file to
    work from - as of the Pravagam merge, sources disagreeing on a raga's
    swara sequence are split into separate numbered rows (`Kannada 1`,
    `Kannada 2`, ...) rather than forced into one row per name+mela; see
    "Multi-variant janya rows" below.
  - `ragas-with-scale-ids.csv` — the master database plus computed columns:
    `Aroha Bits (binary/int)`, `Avaroha Bits (binary/int)`, `Vakra`,
    `Raga Checksum`, `Scale Source Used`, `Scale ID Review`.
  - `royal-carpet-reverse-janya-list.csv` — standalone extraction of the
    karnatik.com "Royal Carpet: Expanded Reverse Raaga Janya List" source.
  - `wikipedia-janya-raga-list.csv` — standalone extraction of Wikipedia's
    "List of Janya ragas", parsed from the raw article HTML (not a web-fetch
    summary), covering all 72 melakartas with real swara data.
  - `nerur-carnatic-raga-list.csv` — standalone extraction of Kumaran
    Santhanam's "List of Carnatic Ragas" (nerur.com, v1.14; mirrored on
    carnatic.com), 72 melakartas + 212 janya entries. Already uses this
    project's own S/R1/G2/M1/... variety notation natively, so no re-notation
    was needed.
  - `nerur-raga-equivalencies.csv` — the handful of alternate-name equivalencies
    (e.g. `panthuvarALi = kAmavardhini`) noted in the Nerur list's own text,
    kept standalone since they're cross-reference info, not new raga rows.
  - `raw-sources/` — original downloaded source files kept for reproducibility
    (currently just the Nerur list's HTML; other sources' raw pages were not
    preserved alongside this repo, see Known gaps).
  - `extracted_megalist_ragas_clean.json`, `extracted_thaat_dartboard_clean.json`
    — early Hindustani-side extractions (Rāga Junglism megalist + thaat
    dartboard), not yet merged into a Hindustani master database.
- `scripts/` — the pipeline, in roughly the order it was applied:
  1. `extract_royal_carpet.py` → `build_royal_carpet_csv2.py` — parse and
     structure the Royal Carpet source.
  2. `merge_royal_carpet_v2.py` — merge Royal Carpet into the master as a
     source, via melakarta-bucketed exact/fuzzy name matching with an
     ambiguity guard (near-tied fuzzy candidates are never auto-merged).
  3. `dedupe_exact.py`, `dedupe_rc_self_variants_v2.py`,
     `dedupe_checksum_pass.py` — successive dedup passes (exact-string,
     then structure-aware same-source variant consolidation, then a
     checksum-based normalized-name sweep).
  4. `fix_jingala.py`, `fix_repo_doubled_tonic_and_dedupe_notes.py` — targeted
     data-defect fixes (percent-encoding artifact; the repo source's doubled
     S/S' tonic notation in 32 melakarta rows) plus a `Needs Review` text
     dedup pass.
  5. `extract_wiki_html3.py` → `build_wikipedia_csv.py` — parse the raw
     Wikipedia article HTML's `{{svaraC}}` template `data-mw` JSON for exact
     ordered swara tokens (far higher fidelity than a web-fetch summary).
  6. `undo_lossy_wikipedia.py` — revert an earlier, lossy AI-summarized
     Wikipedia pass before re-merging properly.
  7. `merge_wikipedia.py` — merge the real Wikipedia extraction into the
     master as a 5th source.
  8. `dedupe_post_wikipedia.py`, `verify_wiki_merge.py` — post-merge
     diacritic-aware duplicate sweep and integrity verification (checksum
     collisions, mixed-vakra-group preservation, source-usage breakdown).
  9. `extract_nerur.py` → `merge_nerur.py` → `annotate_nerur_equivalencies.py`
     — parse the Nerur (Kumaran Santhanam) list from its raw HTML, merge it
     in as a 6th source with the same melakarta-bucketed exact/fuzzy matching
     and ambiguity guard used for Wikipedia, then fold its short
     raga-equivalencies list into `Needs Review` as informational
     cross-references (not auto-merged).
  10. `build_scale_ids.py` — the core reusable module: computes each raga's
     12-bit Aroha/Avaroha pitch-class sets (only Sa is fixed; all other 11
     chromatic pitch classes are independently present/absent per direction),
     a boolean `Vakra` (non-monotonic melodic movement) flag, and the
     `Raga Checksum` (aroha bits + avaroha bits + vakra flag, with melodic
     order appended when vakra) used as the canonical duplicate-detection key
     throughout the pipeline. Run this last, after any master-file change, to
     regenerate `ragas-with-scale-ids.csv`.
  11. `split_disagreement_variants.py` — one-time pass splitting janya rows
     where sources disagreed on the swara sequence into separate numbered
     rows (e.g. `Kannada 1`, `Kannada 2`) instead of one row plus a
     disagreement flag; see "Key design decisions" below. A backup of the
     pre-split file and a full log of every split are in `data/backups/`.
  12. `fix_pravagam_name_swara_glue.py` — one-time fix for a Pravagam
     extraction bug: 28 rows had zero whitespace in the source PDF between
     the raga's name and the first token of its own Arohanam, so the
     name-detection heuristic swallowed the opening swara letters into
     `Raga Name` and truncated that row's own aroha by the same amount
     (e.g. `SamanthaDeepakamSR` with Arohanam `G M P N S`, really
     `SamanthaDeepakam` with `S R G M P N S`). Sibling variant rows that
     only inherited the same name cosmetically (their own raw text is just
     a bare continuation number, no glued fragment) needed the name fixed
     but NOT the aroha. Run before `merge_pravagam.py` for a clean extract;
     was run after in this case and had to also patch the already-merged
     master rows, which the script's `fix_master()` step handles.
  13. `merge_pravagam.py` — merges `docs/raga-pravagam-full-extraction.csv`
     in as a 7th source, facts-only (name/mela/aroha/avaroha, no Ref codes or
     other Pravagam-specific editorial columns - see
     `docs/raga-pravagam-README.md`). Uses the same per-variant matching as
     the split above: agreement with an existing variant attaches Pravagam
     to that row; a same-name-and-mela pattern that matches nothing existing
     becomes a new numbered sibling variant; a name that exists only under a
     *different* mela becomes its own row (distinct scale identity, not a
     conflict); no name match at all becomes a brand-new raga entry. A
     backup of the pre-merge file is in `data/backups/`.
- `docs/` — supporting notes.
  - `raga-explorer-source-research.md` — source research notes.
  - `raga-pravagam-README.md` — extraction notes and copyright status for the
    Raga Pravagam source, now merged into the master database as described
    above.
  - `raga-pravagam-full-extraction.csv` — the full personal-reference
    extraction (with Ref codes, per-variant numbering, and confidence
    flags) that `merge_pravagam.py` reads from; not itself part of the
    shipped master database.
  - `raga-pravagam-vs-master-comparison.csv` — a point-in-time comparison
    report generated before the merge, superseded by the merge itself; kept
    for reference on what was new/agreeing/disagreeing/mela-mismatched.

## Key design decisions

- **Scale ID model**: only Sa is fixed. Every raga's aroha and avaroha are
  each independently represented as an 11-bit present/absent pattern over the
  other 11 chromatic pitch classes (semitone mapping: S=0, R1=1, R2/G1=2,
  R3/G2=3, G3=4, M1=5, M2=6, P=7, D1=8, D2/N1=9, D3/N2=10, N3=11). This is a
  pitch-class-set (Forte/set-theory style) representation, deliberately not
  collapsed under transposition/inversion since Sa is a fixed tonal anchor.
  Melakarta/thaat is a descriptive attribute on a raga, not a generator of the
  scale space. This model was arrived at after two earlier, narrower models
  (which assumed Sa+Pa always present, or one variety per svara-sthana slot)
  were disproven by real ragas in the data (e.g. Pa-less ragas, and ragas
  using two varieties of the same svara like Lalit).
- **Vakra**: a boolean flag (for now) rather than a full description of the
  zigzag pattern, with a fix for the octave-completion edge case (the closing
  return to upper Sa at the end of an ascending phrase, or the opening upper
  Sa at the start of a descending phrase, is not "backward" movement).
- **Raga Checksum**: `{aroha_bits}|{avaroha_bits}|{vakra Y/N}`, with
  `|A:{aroha melodic order}|D:{avaroha melodic order}` appended when vakra is
  true — used as the canonical key for finding true duplicates (same notes,
  same melodic shape) without merging away genuine melodic variants that
  happen to share a note set.
- **Multi-variant janya rows**: when sources genuinely disagree on a janya
  raga's swara sequence under the same melakarta, that's treated as evidence
  of real distinct variants rather than an error to average away or bury in
  a `Needs Review` footnote. Each distinct swara pattern becomes its own row,
  numbered per-mela-entry (`Kannada 1`, `Kannada 2`, ... `Kannada 16` for one
  particularly divergent Royal Carpet case), rather than forcing everything
  into a single row. Rules:
  - Grouping is by the *variety-tagged* pattern (R1 vs R2 vs R3 matters),
    normalized to ignore formatting noise (hyphens, apostrophes, spacing).
  - Karnatic Tutor carries no variety information (just "Ri", never R1/R2/R3),
    so it's folded into whichever existing variant matches on bare letters;
    if none match, it gets its own variant row rather than being discarded -
    but see the reliability caveat below.
  - Royal Carpet's previously-buried `Needs Review` footnotes ("lists an
    additional scale variant... not captured in the single field") are
    promoted into first-class variant rows instead of staying invisible text.
  - Every split row keeps `Sources Agreeing Count` accurate for just that
    variant, and rows supported by only one source are explicitly flagged in
    `Needs Review` as single-source and uncorroborated - a raga variant that
    shows up identically from 2+ independent sources means something;
    one that shows up from a single source only might just be that source's
    own inconsistency.
  - Reliability caveat: Karnatic Tutor disagrees with every other source on
    25% of the janya rows where it can be cross-checked at all (and is the
    *only* source for another 23%), and carries no variety info - treat its
    single-source variant rows with more skepticism than other sources'.
    Royal Carpet is also prone to internally inconsistent near-duplicate
    footnotes for the same raga (one raga generated 13 near-identical
    Royal-Carpet-only variants differing by a note or two) - these were
    deliberately left as separate rows rather than auto-collapsed, since
    they're each still marked single-source/uncorroborated.
- **Name matching across sources**: melakarta-bucketed, exact-then-fuzzy
  (`difflib.SequenceMatcher` ratio >= 0.87) with an ambiguity guard — if the
  top two fuzzy candidates are within 0.04 of each other and both >= 0.80,
  the row is kept separate and flagged for manual review rather than
  auto-merged. Name normalization is NFKD Unicode-aware (strips combining
  marks before stripping non-alphanumerics), which matters heavily here since
  Carnatic sources use inconsistent ASCII/IAST-diacritic transliteration
  conventions (capital letters often substitute for diacritics, e.g.
  "kApinArAyaNi" for "Kāpi Nārāyani").

## Known gaps / next steps

- The `scripts/` folder here starts from the Royal Carpet merge onward; the
  scripts that built the initial Repo and Musiclegato sources predate this
  repo and were not recovered when it was created.
- Two more Royal Carpet pages (Carnatic gamakas; Carnatic/Hindustani
  equivalent ragas) are downloaded but not yet extracted or merged.
- Hindustani raga data (megalist, thaat dartboard) is extracted but not yet
  merged into a master Hindustani database or cross-referenced with the
  Carnatic side.
- A 22-shruti representation is planned as an additional/alternative scale
  model, to sit alongside (not necessarily replace) the current 12-bit
  pitch-class-set model.
