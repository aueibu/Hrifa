# Raga Pravagam review: decision log

Working document: `raga lists/CLEAN-raga-pravagam-list.csv`. Every row now carries a
`Decision / Finding Notes` column (last column) that records what was checked and
changed for that row. This file records the decisions that apply to the whole book, the
deleted rows (which no longer have a row to hold a note), and the audit files.

Work done 2026-09-18 and 2026-09-19.

## Note tags used in the column

Each entry looks like `[date] TAG: text`, separated by ` | `.

| Tag | Meaning |
|---|---|
| SWARA CORRECTION | Aroha and/or avaroha corrected against the English page image (blind read) |
| REF CORRECTION | Source ref changed against the English page image |
| VAKRA | Vakra recalculated after a scale change |
| MADHYAMA | Book note about a Prati Madhyama; encoded M1 M2 ascending, M2 M1 descending |
| DOUBLED SWARA | Doubled letter kept as printed (see decisions below) |
| HYPHEN NOTATION | Book prints phrase hyphens; hyphens dropped, letters kept |
| NAME CLEANED / ITEM RENUMBERED | Name or item number fixed (text from a neighbouring line had been absorbed) |
| STRUCTURAL FIX / ROW ADDED / ROW COMPLETED | Row-level repairs (see the row's own note) |
| FINDING | Something learned about the entry that did not change a value |
| REVIEWED | Row was marked reviewed by the user |
| SWARA DIGITS | Bare letters given the parent melakarta's digits and the scale respaced (letters unchanged) |
| TAMIL | Scale changed to the Tamil edition's reading |
| TAMIL CHECK | Result of the cross-check against the Tamil edition (see below) |

## Global decisions

1. **The English page image is the reference for the first pass.** Every row that has a
   page reference was compared against the page image (blind transcription, then
   compared). Where a blind read and the sheet differed, the row was re-read at higher
   zoom before deciding who was wrong.
2. **Stay faithful to the book.** Doubled swara letters (for example `S S`, `M M`, `G G`)
   are kept as printed, including mid-sequence tonics. Earlier data-quality rules that
   collapsed a doubled tonic no longer apply.
3. **Madhyama.** Only where the book prints a note about a changed Madhyama
   (Subhasri, Maya Lalith, Rohini, Suryalalith, Sankara Lalith, Priyasri) the two `M`s
   are `M1 M2` ascending and `M2 M1` descending. Other doubled `M` letters are left as
   printed.
4. **Hyphen notation** in the book becomes plain letters, in book order (Anandhi,
   Anandh Kalyani, Nand, Malkali).
5. **Variant digits (shuddha/komal)** are the parent melakarta's own default for each of
   R/G/M/D/N, since the book prints bare letters. As of 2026-09-19 every R/G/M/D/N in
   the sheet carries a digit: the 57 rows that held bare letters (44 compact strings such
   as `SDSNSRGMP`, 13 spaced cells with a bare letter) were filled from the parent
   melakarta, and every scale is now one space between swaras (`S R1 G2 M1 P S`). The
   only digits that differ from the parent default are the 12 `M1`/`M2` swaras on the six
   Madhyama-note rows (decision 3). Letters and order were not touched. Because the digits
   are defaults, not readings, the letters remain the reliable part of a scale.
6. **Row structure.** Missing variants and entries were added as their own rows, a
   concatenated row was split (Bhibhasu, Thekkali), and headings parsed as ragas were
   removed.
7. **Derived columns** (`Vakra`, the `Flag:` columns) were recalculated after changes
   using rules that reproduce the original values on unchanged data. The "split point
   uncertain" phrase was removed from `Notes` because every row was checked against a
   page image. **Vakra (2026-09-21): defined by `scripts/sargam_intervals.py`.** `Yes` means the pitch
   zigzags: in signed semitones, any aroha step falls or any avaroha step rises. Start and end
   notes do not matter. Direction comes from the degree difference wrapped to -3..+3 and
   the size from the pitch classes; octave markers (`S'` upper, `N,` or a leading `'` lower,
   `S=` middle) override the inference, and a marker later in a phrase can fix the octave of
   an unmarked first note. The Vakra column uses Carnatic notation with `close=True` (in a
   plain one-octave Sa..Sa' scale the closing Sa is the upper Sa) and `sa_conventions=True`
   (two conventions the user approved 2026-09-21: a leap away from the opening Sa goes in the
   scale's direction, so `S P` opening an aroha is +7 and `S M` opening an avaroha is -7; an
   unmarked Sa in the middle of a scale keeps the nearest reading, so `M S` in an aroha is a
   return to the lower Sa and a turn). Six scales the module cannot settle are decided by the
   user's rulings in `raga lists/vakra-rulings.csv` (master `Vakra Reliable = ruled`). The earlier letter-based
   rule (written 2026-09-19) is superseded; it agreed on all but 13 rows. Where the module
   itself says its answer is not reliable, the existing value is kept and the master database
   carries `Vakra Reliable = no` plus the triggering steps. A `Yes` is reliable when at least one
   triggering step is unambiguous (each step is judged on its own); a `No` is reliable because
   no step turns back; only a `Yes` whose every trigger is a 4th/5th that cannot be told apart
   is unreliable. A failed +/-12 sum is a warning, not a reliability failure, and the enharmonic
   guard (an exact pitch move) is not an ambiguity. The user's rulings
   on Sarva Mangala, Guha Priya, Modhakam and Bhudha Manohari 1 and 2 (all `Yes`) are
   reproduced by the module.
8. **The English edition is the only reference for scales (decision 2026-09-19).** The
   Tamil edition was used as a second reading, and 57 scales plus Nand's avaroha were
   briefly changed to the Tamil reading, then all reverted. The publication record
   (below) shows the English scan is the newer edition (4th, 2007, Revised & Enlarged)
   against the Tamil 3rd (2005), and the two editions seem to have been launched together
   in 1984 with the English revised first each time, so the Tamil is not established as
   the original and differences may be real revisions. The Tamil comparison is kept only
   as notes. **One exception (decision 2026-09-19):** where the English prints an invalid
   character in place of a swara, the Tamil edition's reading is used for that entry. A
   scan of every scale column in the English pages found exactly one such entry, Nand
   (an `H`); every other scale in the sheet uses valid swara letters only.

## Tamil edition cross-check (2026-09-19)

Source: `raga_pravagam-tamil-full.pdf`. The scale columns decode from its text layer;
names do not. Entries were paired with English rows by melakarta, scale similarity, the
first letter of the name and the source number.

- **Tier A (4,534 rows):** scale matches the Tamil exactly. Note: "Scale matches the
  Tamil edition exactly".
- **Tier B (645 rows):** differs by 1 to 5 swaras, the same raga by name initial and
  source number. The English reading is kept for all of them:
  - 57 rows: another source in the master database matches the Tamil reading and none
    matches the English. These were changed to the Tamil reading and then **reverted**
    (see decision 8). Their notes record the Tamil reading;
    `pravagam-tamil-changes-applied.csv` lists all of them.
  - 192 rows: an independent source and/or internal consistency favours the English.
  - 36 rows: only the Tamil reading is internally consistent
    (`pravagam-tamil-consistency-only.csv`).
  - 15 rows: the evidence signals conflict.
  - 345 rows: no independent evidence either way.
- **Tier C (321 rows):** something did not line up (name initial or source number
  disagrees, differs by 6+ swaras, or no partner found). These need a name check.
  Their notes say so.
- Nand (English item 75 / Tamil item 50): the English aroha contains an `H`, which is not
  a swara (the Tamil prints a period there). Under the invalid-swara exception the Tamil
  entry is used, so the Tamil avaroha, which has one extra `D`, stands. This is the only
  scale in the sheet that follows the Tamil.

**Note-format fix (2026-09-19).** The `TAMIL CHECK` notes on the 645 tier-B rows printed
the Tamil page and item run together (`p6217` for page 62, item 17). 588 notes were
corrected to `p62 item 17`; the other 57 already read correctly. 19 of those Tamil
entries have no readable item number and now say so. Only the note column changed
(backup: `CLEAN-raga-pravagam-list.backup-before-note-format-fix.csv`).

## Melodic survey and Tamil candidates (2026-09-19)

Read-only analysis of the English scales as they stand in the sheet. Nothing in the
scale columns was changed. Two files in `raga lists/`:

- `pravagam-melodic-survey.csv`: every row with a scale (5,456), tagged with where the
  aroha and avaroha start and end, top and bottom mismatches, jati, and structure tags.
- `pravagam-strangeness-tamil-candidates.csv`: the 46 rows where the English scale has
  an oddity that the Tamil reading does not (35 confirmed pairs, 11 unconfirmed pairs).
  Blank `Winner` column for the review.

Rules used (letters only, so unaffected by the pending digit pass):

- **Jump**: two adjacent notes four or more swara steps apart in the direction the
  scale travels, for example S to P or R to D. If a scale has an S in the middle
  (an octave crossing) every pair touching an S is skipped, because the octave is not
  printed.
- **Not ending / not starting on S**: aroha or avaroha whose first or last note is not S.
- **Avaroha starting on low S**: avaroha begins on S and the next note rises.
- The Tamil can only help where the two editions differ. 360 of the 468 rows with an
  oddity are identical in the Tamil, so both editions print the same thing.

## Chayalaka entries (2026-09-19)

Two English entries print "Chayalaka Raga" in place of a scale: Aparupam (p159, item 9,
with the line "NATTAKURINJI, HARIKAMBOJI, KAMAS CHAYA") and Indhu Kesari (p236, item 30,
no ragas named). Both keep blank aroha/avaroha on purpose and carry a `FINDING` note plus a
line in `Notes`. Read as "shade" ragas with no scale of their own, defined by the ragas
named; that reading is an interpretation, not book text. A search of the whole English PDF
(all 313 pages) found no other occurrence.

## Other CLEAN lists: scale format and Vakra (2026-09-19)

Applied to `CLEAN-carnatic-pasted-dataset`, `-musiclegato-carnatic-raga`, `-nerur-carnatic-raga`,
`-raga-of-the-week-repo`, `-royal-carpet-janya` and `-wikipedia-janya-raga`. Backups are
`*.backup-before-vakra-format.csv`; every change is in `other-sources-scale-format-and-vakra-changelog.csv`.

- **Format:** one space between swaras; a trailing `'` is the upper octave (`S'`) and a
  leading `'` is the lower octave (Wikipedia's Beethovanapriya, `'G2 'P 'N3 S ...`); both
  are kept and read as octave anchors by the Vakra rule. Duplicate tonics written
  `S S'` / `S' S` (raga-of-the-week, 32 rows) were collapsed to `S'`.
- **Bare swara letters** were given digits from, in order: the row's known parent melakarta;
  the same swara carrying a digit elsewhere in the row; the one digit shared by every
  melakarta compatible with the row's digits; the same raga (same name and swara sequence)
  in another list. Where none of these gave evidence they were left bare: 6 rows in pasted
  (royal-carpet's 45 were later filled from their real parents, see below). Musiclegato's Dhawithiya+panchamam still has an invalid `M3`.
- **Vakra** was recomputed with the final rule. Changes: pasted 14 (7 `No` to `Yes`,
  6 `Needs Review` to `Yes`, 1 to `No`), musiclegato 8, nerur 6, raga-of-the-week 9,
  royal-carpet 173 (114 `Yes` to `No`, 59 `Needs Review` filled in),
  wikipedia 21. Every Vakra value now agrees with the rule.

## Master database (2026-09-20)

`raga lists/ALL-SOURCE-ROWS-carnatic-raga-database.csv`, built by `scripts/build_master_from_clean.py`
from the seven CLEAN lists. It is stacked, not merged: one row per source row (18,428 after the
Royal Carpet additions below),
every original column kept, nothing dropped. Merging duplicate ragas across sources is the
next stage. The older merged file in `data/` and the one under `OLD DO NOT USE` were not
touched.

Raga and variant identity columns were added later (see the section below). Added columns: `Master ID`, `Source List`, `Source Row` (the row number in that CLEAN file),
`Melakarta Number` (1 to 72 or blank) beside `Melakarta Number (as listed)`, `Variant Tag`
(the `(Raga n)` number), `Name Key` (lower-case ASCII letters, a first-pass match key only),
and notation-free scale columns: `Aroha/Avaroha Semitones` (absolute semitones, octave
included, placed by the Vakra rule), pitch set as 12-bit binary and decimal (Sa first, same
definition as the old master; identical on all 2,951 rows that exist in both), `Note Order`,
and `Scale Check` (`ok`, `no scale printed`, `digit-less swara`, `invalid swara token`).

## Royal Carpet: parent melakarta restored from the source page (2026-09-20)

The source page (`Royal Carpet_ Expanded Reverse Raaga Janya List.html`) lists every janya
under its melakarta's block, so the block is the parent. The CLEAN list had replaced that
with a guess from the scale (blank for 1,611 rows, and "not a stated parent" in the
notes). `scripts/fix_royal_carpet_parent.py` puts the page's parent back: CLEAN rows are
matched to the page rows in their original order (7,380 of 7,387 directly, 3 by hand), so
a raga listed under several melakartas gets the right parent on each row. 1,610 blank parents
were filled and 10 wrong ones corrected. Every janya now has a parent (all 72 used).

Redone because they depended on it: the 45 bare swara letters (given the parent's variant),
Bhashanga (a swara whose variant is not the parent's; this rule matches the existing
Bhashanga on all 2,697 rows of musiclegato, nerur, wikipedia and raga-of-the-week that have
one): 7,377 `No`, 15 `Yes`, 45 `Needs Review` (bare letters that were filled), and the
notes. Four rows the earlier cleaning had turned into ragas named "S" (with the opening S
missing from the aroha) are restored as unnamed variant scales of melakarta 19. Backup:
`CLEAN-royal-carpet-janya-list.backup-before-parent-restore.csv`; per-row values before and
after: `royal-carpet-parent-changelog.csv`. The master database was rebuilt; only 7 rows
(pasted list) now lack a melakarta number.

## Royal Carpet: one melakarta row per mela, missing janyas added (2026-09-20)

Decision: the database holds one row per melakarta, with alternate names and the source
noted, not several versions of the parent. `scripts/fix_royal_carpet_melas_and_missing_janyas.py`:

- **Melakarta rows.** The 54 melakarta rows (mela 19 five times, 65 four times, 29 melas
  absent) and three janya rows that were really the page's alternate-name lines for melas
  19, 23 and 26 (`jhankaarabhramari`, `gowrivElaavaLi`, `tarangini`) were replaced by
  exactly 72 rows, one per mela, from the page's primary names and scales. Each row's
  notes give the alternate name(s) the page lists for that melakarta and say how many
  unnamed variant scales the page also lists (not kept). An alternate name that the page
  also lists as a janya line under the same mela (`manOranjani`, `nabhOmaNi`, `kumbhini`,
  `vamshavati`) stays a janya.
- **Janyas added back (31).** Page janya lines the earlier cleaning had dropped because of
  their notation: seven ragas with a marked Madhyama (`shubhashrI`, `mAyAlalit`, `rOhiNi`,
  `sUryalalit`, `shankaralalit`, `priyashrI` and `behAgdEshikam`; the first six are the ragas
  Pravagam notes as using a changed Madhyama), ragas with `*` marks
  (`shivapriyA`, `dEshyakhamAs`, `behAg`, `yamunA`), hyphenated names (`mA-amala` and
  similar), `dharmavati` (bare D N), two extra `kalyANi` variants under 65, and others.
  A `*` is read as an anya (foreign) swara and kept without the star; an apostrophe on M is
  the other Madhyama (M1' as M2, M2' as M1); the page has no legend for either, and the
  reading is stated in each row's notes with the printed scale. The one apostrophe on N
  (`svarAStra`, N2') is kept as N2 with a note. 41 page lines that only repeat their own
  melakarta's scale were not added.
- Result: 72 melakarta rows and 7,411 janya rows (7,483). The 7,380 rows already present
  are unchanged. Backup: `CLEAN-royal-carpet-janya-list.backup-before-melas-and-janyas.csv`;
  what was removed and added: `royal-carpet-melas-and-janyas-changelog.csv`.

## Vakra switched to the sargam_intervals module (2026-09-21)

`scripts/apply_vakra_module.py` set the Vakra column of all seven CLEAN lists from the
module. Backups: `*.backup-before-vakra-module.csv`; changes:
`vakra-module-switch-changelog.csv`. Six rows changed:

- Hindusthani Todi (raga-of-the-week and Wikipedia), `Yes` to `No`: the mandra `N3 R1` at the
  start is a plain climb.
- Royal Carpet `shubhashrI`, `mAyAlalit`, `sUryalalit`, `priyashrI`, `No` to `Yes`: the page prints
  the second Madhyama first (`M2 M1`), which falls a semitone in the aroha (and `M1 M2` rises in
  the avaroha for the last two). Pravagam prints `M1 M2` ascending for the same ragas, so it
  is unchanged.

The first version of the reliability flag was too strict (291 rows); it was tightened the same day
(see the definition above), which left 25 rows marked `Vakra Reliable = no`: Pravagam 7, Royal Carpet 8,
Wikipedia 4, raga-of-the-week 4, pasted 2 (Wikipedia's Navaroj briefly moved to `Yes` on a
`G1 -> R3` rise; that was a transcription error, see below). The 25 fall into three groups: an unmarked Sa in
the middle of an aroha after M (14 rows, all `Yes`, the pattern ruled on Sarva Mangala, Guha Priya,
Modhakam and Bhudha Manohari), a leap away from the opening Sa of an aroha or avaroha (5 rows,
all `No`: Kallola in two lists, Sowmya Manohari, saumyamanOhari, ratnabhUSaNi), and six rows of
four ragas that need a musical call (Sathvamanjari, Suraranjani, Gandarvam, Vakulasree).

The master's semitone columns now come from the same module, and it has two new columns:
`Vakra Reliable` and `Vakra Trigger Steps`. `fix_royal_carpet_parent.py` and
`fix_royal_carpet_melas_and_missing_janyas.py` call the module too.

### Vakra items resolved (2026-09-21)

The 25 unreliable rows were closed on the user's decisions. Group 1 (an unmarked Sa in the middle of an
aroha after Ma is a return to the lower Sa) and Group 2 (a leap away from the opening Sa goes in the
scale's direction) are the two `sa_conventions`, which made 19 rows reliable with their existing
values. Group 3 rulings: Sathvamanjari `Yes` (`M1 -> N2` in the avaroha is a rise), Suraranjani
`Yes` (`P -> R2` in the aroha is a turn), Gandarvam (Pravagam Raga 4, p209) `Yes` (`D3 -> R1` is read
as a rise in the descent; it was `No`), recorded in `vakra-rulings.csv` and applied to every list
that has the same scale. Vakulasree (pasted) was `Yes` and is now `No`: `N2 -> M2` is a leap up,
so its aroha now carries octave marks (`S R1 G1 M2 D2 N2 M2' P' N2' S''`, the closing Sa is the
second Sa up) and the module reads it as a straight climb. Backups:
`*.backup-before-vakra-rulings.csv` (pasted, Pravagam). Result: every scale with a readable scale
has a Vakra value (18,411 reliable, 5 ruled, 12 with no scale); the Vakra column matches the
master's semitone columns on every row that is not ruled.

Follow-up, found when the raga tables were built: the one variant whose rows disagreed on Vakra was Vakulasree
(mela 40). The user's `No` ruling had only reached the pasted row; the identical scale in Royal Carpet
(`vakuLashrI`) and Pravagam (`Vahulasri`) still read `Yes`, because `close=True` treats a plain Sa..Sa' scale as one
octave and so reads `N2 -> M2` as a fall. Both rows were added to `vakra-rulings.csv` as `No` (backups:
`*.backup-before-vakulasree-ruling.csv`), and no variant now has rows that disagree on Vakra. The assumption behind
`close=True` (a plain Sa..Sa' scale stays within one octave) cannot detect other ragas that continue past Ni into the
next octave; this cross-source check found only this one.

### Wikipedia Navaroj: wrong digits corrected (2026-09-21)

The Wikipedia list printed Navaroj's avaroha as `M1 G1 R3 S N2 D2 P`. `G1`, `R3` and `N2` are not
swaras of its parent (melakarta 29), were not marked as anya swaras, and Nerur and Royal Carpet
give `M1 G3 R2 S N3 D2 P`, so the digits were corrected (backup:
`CLEAN-wikipedia-janya-raga-list.backup-before-navaroj-fix.csv`); Vakra and Bhashanga are both `No`.
Principle: a digit that is not the parent's is an anya swara only if the source marks it or the
raga is known to use it; otherwise it is a transcription error.

The same kind of row exists elsewhere: 265 rows (Wikipedia 99, raga-of-the-week 68, musiclegato 42,
Royal Carpet 27, Nerur 22, Pravagam 6 (the Madhyama-note ragas), pasted 1) carry a swara outside
their parent. Only 14 are contradicted by an independent digit-bearing source (Nerur,
musiclegato, Royal Carpet) that no source backs, and some of those are genuine anya ragas (Bhairavi
and Manji with D2), so they were not changed automatically. Pravagam and the pasted list carry only
default digits, so they do not count as evidence. The next stage, grouping the same raga across
sources, is where source agreement on each swara can settle these.

## Duplicate candidates across sources (2026-09-21)

`scripts/find_duplicate_candidates.py` explored two ways of finding likely duplicates (its output files were removed
once the result was folded into the master, below; the script's `fold` and `signature` helpers are still used).

- **Name group**: same melakarta and same name with spelling folded (`Karmukhavati` = `Karmukhavathi` =
  `kArmukhavati`). 3,949 groups span 2+ sources; exact spelling alone finds only 2,784.
- **Scale group**: same pitch-set binary and note orders (aroha and avaroha), any name or mela. 4,205 groups span
  2+ sources. Short scales are shared by many unrelated ragas (the largest group has 39 rows and 24 names), so this
  finds synonyms and twins, not identity by itself.
- Inside one mela, 1,995 of 7,471 scales carry 2+ names. In 1,016 a single source lists the names separately
  (that source treats them as different ragas); in 979 each source uses one name (spelling variants or aliases).

## Raga and variant identity in the master (2026-09-21)

`scripts/build_raga_tables.py` (run after `build_master_from_clean.py`; safe to re-run, the result is identical) adds raga
and variant identity to `ALL-SOURCE-ROWS-carnatic-raga-database.csv` itself: one file, one row per source row, 18,428 rows, sorted
so each raga's rows sit together (raga, then variant, then source). Master IDs and every original cell are unchanged.

- **Raga ID / Raga Name (Merged)**: 6,412 ragas (72 melakartas, 6,340 janyas). A raga is a name inside a parent
  melakarta. Other raga columns: all spellings, alias names, sources and source count, row and variant counts, the parent
  melakarta's Raga ID, similar names that were not merged, and the same name under other melas (a raga can have several
  parents; each parent is its own raga).
- **Variant ID**: 9,639 variants, one per distinct scale of a raga (aroha and avaroha pitch-set binary and note
  orders). Different scales stay separate variants; 5,149 are confirmed by 2+ sources. Variant Sources, Variant Source
  Count, Variant Rows and Variant Confirmed By 2+ Sources describe each one. Scale Twin Group and Ragas Sharing This
  Scale link variants of different ragas that share a scale in one mela (1,369 groups).

Merge rules (approved by the user): names in the same mela merge only on evidence other than the scale, namely a
source stating an alias (Pravagam's `Rasali (Karjavali)`, Nerur's equivalences), spelling 0.92 or more alike, or 0.86 or
more alike with a shared scale. A merge never happens if any single source lists both names as separate entries
(479 merges were vetoed). Scale alone never merges anything. 910 name groups merged (905 on spelling, 5 on an
alias), and 1,171 ragas carry a similar-name link to a raga that was not merged. The raga-pravagam-synonyms file was
not used: it is raw book text with no mela.

The user wanted everything in one file, so there are no separate raga, variant or link tables.

Known limits: Pravagam names that absorbed swara letters (`Raja Manjari GR GM GS R`) appear as spellings; 7 melakartas
carry a second variant that only the pasted list gives (for example a vakra Kalyani avaroha); 7 pasted rows have no
parent melakarta and form ragas with a blank melakarta number.

## Merged raga document (2026-09-21)

`scripts/build_merged_ragas.py` builds `raga lists/MASTERLIST-carnatic-ragas.csv` from the master: one row per raga variant
(raga plus scale), 9,639 rows covering all 18,428 master rows (the `Master IDs` column lists them, so nothing is lost). Each
source's own name, aroha, avaroha and row number sit in per-source columns (Pravagam, Musiclegato, Nerur, Wikipedia, Raga of
the Week, Royal Carpet, Pasted) beside the merged values; if a source has several rows in a variant they are joined with
` || `. Other columns: merged name, aroha and avaroha (taken from the best digit-bearing source), Vakra and its basis
(pitch rule, or ruled by the user), merged Bhashanga (`Conflict` if sources give both Yes and No), Status, how the names
matched (same name, spelling or alias), all spellings, scale twin group, similar names not merged, the same name under other
melas, and the Pravagam page and item. Status: 5,149 confirmed by 2+ sources (2,070 by 3+, 493 by 5+), 4,473 single source,
17 repeated within one source. It is rebuilt from the master by running the script (after `build_raga_tables.py`).

The 4,473 single-source variants are explained by `Single-Source Reason`: A. extra variant of a raga that 2+ sources
list (2,244), B1. only source but a similar name exists, a possible missed merge (406), B2. the same name is listed under
another mela (228), B3. another raga in the mela has the same scale (608), B4. unique, nothing similar anywhere (987; 933
Royal Carpet). For the case-A rows `Nearest Other-Source Variant`, `Swara Distance` and `Difference Detail` give the closest
version another source lists and how many swara edits away it is (aroha plus avaroha, octave ignored): 1,252 are one swara
away (528 a swara added, 466 left out, 258 changed), 551 two, 441 three or more. A one-swara difference is either a slip or a
genuine near-variant, so the distance ranks the rows for checking and nothing was folded together automatically. B1 and B2
(634 rows) are the ones where a merge decision could still change the count of ragas.

## B1 and B2 single-source rows resolved (2026-09-21)

**B1 (only source for the raga, but a similar name exists).** One more merge evidence was added: a similar
name (0.86 or more alike) whose closest scales are within 2 swaras of each other, with no veto. I applied it without asking, then
listed all 52 merges with their spellings compared after folding vowel variants (`au`/`ow`/`ou`, `ai`/`ei`/`ey`); the user
reviewed them on 2026-09-21 and accepted all 52 as variants of one raga. It merged 52 more ragas (labelled
`similar name and a near scale` in `Names Merged On`), taking the master from 6,412 ragas and 9,639 variants to 6,357 ragas and
9,629 variants. 317 B1 variants remain and are kept separate by the rules: in 295 a source lists both names as separate entries
(the veto), in 30 the scales are 3 or more swaras apart (8 of these also have the veto). Each one's `Resolution` names the raga
it was kept apart from and why.

**B2 (same name under another mela).** The same name with the same scale under different melas is one raga with several parents:
73 Multi-Parent Groups (150 ragas), shown by `Multi-Parent Group` and `Also Listed Under Melas` in the master and the merged
document (Raga IDs stay one per parent). Of the 228 B2 variants, 25 are the same raga under a second parent and 203 have a
different scale under the other mela, so they are treated as different ragas that share a name; the `Resolution` column says which.
Nothing was merged across parents.

Counts after this step: 5,156 variants confirmed by 2+ sources, 4,456 single source (A 2,316, B1 317, B2 228, B3 608, B4 987), 17
repeated inside one source.

### How cross-source variants are shown (2026-09-21)

The merged document shows every variant of a raga as its own row (same raga, different notes) and adds `Variant Origin` and
`Other Variants Of This Raga`. Origin is `Same-source variant` (a source lists this version and the others together, like
Pravagam's `Raga 1`, `Raga 2`), `Cross-source variant` (the sources give different notes, so the grouping comes from the name
match, not from any source), `Mixed`, or `Only variant`. The 52 near-scale merges (156 variants) are additionally marked
`(names merged on a similar name and a near scale)`. The other-variants text lists each sibling with its sources and how its notes
differ, for example `R05592-V2 [Pasted] differs by 2: aroha +N1; avaroha M2->R2`.

## The 987 unique (B4) rows, checked (2026-09-21)

Royal Carpet supplies 933 of the 987 (12.6% of its variants); the rest are Pravagam 26, pasted 16, Wikipedia 11, Musiclegato 1.
Scales are ordinary (5 to 8 notes, 93% non-vakra). Closeness of scale to another source's variant was not evidence (the
names were unlike). Re-scoring names with vowel folds (`au`/`ow`/`ou`, `ai`/`ei`/`ey`) and voicing folds (`k`/`g`, `t`/`d`,
`p`/`b`, `c`/`j`, `s`/`z`, `zh`/`l`) found about 10 real pairs, for example `saumyamanOhari` and `SowmyaManohari`.

- **Name folds**: `fold_more` in `build_raga_tables.py` is used for the 0.86 tiers only. A pair that reaches 0.86 only through the
  folds still needs a shared or near scale, so the folds alone never merge two names. The folds apply database-wide: the master went
  from 6,357 ragas and 9,629 variants to 6,233 and 9,500. 188 name pairs inside merged ragas connect only through the folds (169
  with identical scale, the rest within 2 swaras or reached through a chain).
- **Cross-mela test.** A raga can legitimately sit under more than one mela when its swaras fit both: 74% of janya scales fit exactly
  one mela, 26% fit two or more (3,471 fit 2 or 3, 991 fit 4 to 9, 39 fit 10 or more). Of the 73 Multi-Parent Groups (same name and
  scale under different melas), 41 fit every mela they are listed under and 32 fit only some (the other listing needs an anya swara
  or is a source parent error). So a cross-mela link is founded only when the scale fits the mela.
- **Pasted rows with no mela (7).** Four were given a parent melakarta because the same name is listed under it by other sources and
  the scale is within 2 swaras of that raga's closest version: Ilakanti 39 (identical letters to Royal Carpet and Pravagam), Simhvachandana
  51 (identical), Saravathi 25 (1 swara), Narireethigoula 20 (2 swaras). Each row's notes say the mela was inferred; digits were not
  filled in. Pathi (3 swaras from `Padi`, mela 15), Ganavaradhi and Sakalabhiravi stay without a mela. Backup:
  `CLEAN-carnatic-pasted-dataset-list.backup-before-mela-inference.csv`.
- **Unique Check** column in the merged document (B4 rows): "no similar name in this mela or under another mela" for 942 of 950,
  and for the other 8 a note that the same name is under another mela with a different scale and whether this scale fits that mela
  (7 do not, so they are not the same raga under a second parent).

Counts after this step: 5,212 variants confirmed by 2+ sources, 4,271 single source (A 2,326, B1 372, B2 202, B3 421, B4 950), 17
repeated inside one source.

## Swap rows corrected, Sindhu Bhairavi moved, Bhashanga filled (2026-09-21)

**Are the contradicted swaras errors or real bhashanga?** Of the 265 rows that carry a swara outside their parent, 26
are contradicted by 2+ other sources that use the parent's variant for the same raga. They split by pattern:

- The row uses both variants of the swara (Kapi N3 up and N2 down, Behag M2 in the avaroha, Khamaj, Yamuna Kalyani,
  Shyam Kalyan, Brindavani {Hindustani}, and a few less clear ones): a real anya swara. 12 rows, **left unchanged**.
- The row uses only the off-parent variant, in every place, while other sources agree with the parent: a digit slip.
  14 rows (Nerur 4, Wikipedia 2, Musiclegato 2, Raga of the Week 1, Royal Carpet 6). **Corrected outright**: each
  off-parent digit was replaced with the parent's (Lalitha D2 to D1, Gaurikriya D3 to D2, Madhuvanti N2 to N3, ...). Each
  row's Notes records the original aroha and avaroha; `bhashanga-swap-fix-changelog.csv` lists them. Bhashanga went
  `Yes` to `No` on all 14; Vakra did not change on any.

**Nerur `sindhu bhairavi`** was under melakarta 10 (nAtakapriya). Its scale R2 G2 M1 P D1 N2 is naTabhairavi's, so the
parent is now 20 (the R1 in the avaroha is its anya swara, so Bhashanga stays `Yes`). The other sources' Sindhubhairavi rows
(under 10, with D2) are different scales and are untouched.

**Bhashanga fill.** The swara rule (any swara whose variant is not the parent's) agrees with the source-stated Bhashanga on
all 2,985 rows of Musiclegato, Nerur, Wikipedia and Raga of the Week. It was **not** used to label Pravagam and pasted
rows `No`: their digits are the parent's defaults (bare letters were filled from the parent), so a scale with no off-parent swara
proves nothing about them. Only a visibly off-parent swara counts, which gave `Yes` on 6 Pravagam rows (Subhasri, MayaLalith,
Rohini, Suryalalith, Sankara Lalith, Priyasri, all the book's Madhyama-note ragas). The user checked the text: each of
the six carries a notation that both Ma are used, so `Yes` is confirmed and closed for all six (Priyasri included). Every other Pravagam row (5,452) and
pasted row (2,450) stays `Unknown` in its own list; the merged document fills it from any source that states it for the
same variant.

**Marking.** A new `Bhashanga Basis` column (master and merged) says where each Yes/No came from: `stated by source`
(only the 50 Wikipedia rows whose page prints an anya swara note: see the next section) or `derived from swaras` (everything else);
blank when the value is Unknown or Needs Review. Checked 2026-09-21: the Nerur text, the Raga of the Week CSV and the Musiclegato pages
do not state Bhashanga anywhere, so their values are derived too.

**Musiclegato `Dhawithiya+panchamam`** had an invalid `M3` in its avaroha (`R3 M3 G3`). There is no M3; parent
melakarta 69 has M2, so it is now `M2` (user's decision). Its Bhashanga `Yes` came only from that M3, so it is now `No`; Vakra stays
`Yes` (R3 to M2 is a rise in the avaroha). The row's Notes keeps the original. Backup:
`CLEAN-musiclegato-carnatic-raga-list.backup-before-m3-fix.csv`. This row now matches an existing variant, so the master
has 6,234 ragas and 9,489 variants.

**Rows with no printed scale (5).** Two stay blank by design: the Chayalaka ragas Aparupam (Raga 1) and Indhu Kesari (Raga 1),
which have no scale of their own. Three pasted rows had the whole scale in one column (user approved 2026-09-21):
Navarasa and Nigamanasa were split at their doubled `S' S'` into aroha and avaroha (the opening `S'` read as `S`;
Navarasa now equals Royal Carpet's scale); Vakra stays `Yes` on both. Sudhdhakalanidhi (mela 63) was **removed**: it is
Pravagam's Suddhakalanidhi (Raga 2), aroha and avaroha run together plus a stray `S`, and the raga already has 6
variants in Royal Carpet and Pravagam. Backup: `CLEAN-carnatic-pasted-dataset-list.backup-before-blank-scale-fix.csv`;
`blank-scale-fix-changelog.csv`.

**Parent mela or digit slip?** For 8 of the 14 corrected rows the original digits fit a plain janya of another mela that
other sources also list the raga under. For 5 the listed mela has far more support (kept). For 3 the two readings are about
equally supported: Royal Carpet rItigauLa (22 vs 20), Wikipedia Ganavaridhi (35 vs 34), Raga of the Week Udayaravichandrika (9 vs
8/10/20/22). Under the printed mela the original scale needs an anya swara; under the alternative it is a pure janya. Decision
(user, 2026-09-21): keep the corrections, and note the alternative mela in each row's Notes. Both scale versions already exist
in other sources under their own melas, so the row only confirms one of two existing variants.

**Pasted rows with no mela (3).** Sakalabhiravi is Salagabhairavi (its swara letters match Nerur, Musiclegato, Wikipedia,
Raga of the Week and Royal Carpet under mela 22): given mela 22 (Kharaharapriya), digits not filled, reason in Notes (user
decision). Ganavaradhi is Ganavaridhi (same swara sequence as the sources under 34 and 35, which differ only in N2/N3);
the pasted row has no digits to choose. Pathi has no match. Both rows were then **removed** (user decision, 2026-09-21; backup
`CLEAN-carnatic-pasted-dataset-list.backup-before-remove-no-mela.csv`, rows recorded in `blank-scale-fix-changelog.csv`), so every row
in the database now has a melakarta. Backups: `*.backup-before-mela-notes.csv`.

**Digits for the four inferred-mela pasted rows** (Narireethigoula 20, Sakalabhiravi 22, Saravathi 25, Simhvachandana 51): with a parent
now known, their bare swara letters were given that mela's own variants (user decision, 2026-09-21). Bhashanga stays
`Needs Review` (default digits cannot confirm anya swaras); Vakra did not change on any. No row in the master has a digit-less
swara now. Backup: `CLEAN-carnatic-pasted-dataset-list.backup-before-digit-fill.csv`.

Backups: `*.backup-before-swap-fix-and-derived-bhashanga.csv` for all seven CLEAN lists. Script:
`scripts/fix_swap_rows_and_derive_bhashanga.py` (dry run by default; `--write`). After the rebuild the master has
6,234 ragas and 9,490 variants before the M3 fix (was 6,233 and 9,500: the corrected rows now join their raga's confirmed variants and the
moved Sindhu Bhairavi is a raga of its own under 20).

## Wikipedia anya swara notes applied (2026-09-21)

The Wikipedia "List of Janya ragas" page prints `(Anya swara* : ...)` beside **50 rows**. The earlier extraction kept only the
scales, and the Wikipedia Bhashanga column had been filled by the swara rule, not taken from the page (68 of its 97 `Yes` rows had
no note on the page). The live page was saved as `data/raw-sources/wikipedia-list-of-janya-ragas-2026-09-21.html` and applied
by `scripts/apply_wikipedia_anya_swara.py` (per-row detail: `wikipedia-anya-swara-changelog.csv`; backup:
`CLEAN-wikipedia-janya-raga-list.backup-before-anya-swara.csv`). User decision: do all of it.

- **Bhashanga = Yes on all 50 annotated rows**, with the stated anya swaras in Notes. 29 were already `Yes`; 21 were `No`. In 16 of those
  21 the anya swara is not in the printed scale (Asaveri prints only R1 but states R2), so the rule could not see it.
- **Atana restored.** This session's digit correction had replaced its stated anya swaras G2 and N2 with G3 and N3. That was wrong:
  the page states them. The original scale is back (`S R2 M1 P N2 S'` / `S' N2 D2 P M1 G2 M1 R2 S`), Bhashanga `Yes`.
- **Navaroj keeps N2 and `Yes`** (user decision: the page states N2 as its anya swara). G1 and R3 stay corrected to G3 and R2.
  Avaroha now `M1 G3 R2 S N2 D2 P`; Vakra `No`.
- **Six scales that had been cut short were restored from the page**: Bhimsen, Bhakthirasa, Rudra Panchami, Sri Tyagaraja, Amritha
  Kalyani, Kedar (Kedar was `S` / `S' N3 D2 P M2 P`; the page's `*M1 (G3)` is read as M1 and G3).
- **Not touched:** Ahiri's note names a swara in words as well as `R2 G2 / G3 D2 N3`. (The multi-phrase rows are handled in the next section.)
- The `Bhashanga Basis` for Wikipedia is now `stated by source` on the 50 annotated rows and `derived from swaras` on the rest.
- The 14 swap-row corrections above therefore stand for 12 rows; Atana and Wikipedia's Ganavaridhi (next section) were the exceptions.

## Wikipedia variants: 33 rows added (2026-09-21)

On the Wikipedia page a raga can carry several scales in one row: each cell holds several spans separated by line breaks, and aroha
number i goes with avaroha number i. The first extraction read only the first span, so 34 variants of 17 ragas were missing. They are
variants of the raga, like the several rows Pravagam gives one raga (user decision: the page clearly lists them). `scripts/add_wikipedia_variants.py`
appends one row per variant (same name and melakarta, its own scale) at the end of `CLEAN-wikipedia-janya-raga-list.csv`, so no
existing row number changed; each new row's Notes says "VARIANT i of n". Backup `CLEAN-wikipedia-janya-raga-list.backup-before-variants.csv`;
per-row detail in `wikipedia-variants-changelog.csv`.

- **The 17 ragas:** Kalkada, Jhankarabhramari (6 variants), Poornalalita (5), Poornashadjam, Huseni, Gowrivelavali, Velavali (6), Tarangini,
  Dwaithachintamani, Nattai Kurinji (3), Rageshree (3), Shyama, Arabhi, Ganavaridhi, Hamsanadam, Hameer Kalyani (5), Saranga (3).
  Kalkada has 2 arohas and 1 avaroha, so both arohas take that avaroha. Rageshree's second variant is identical to its first and was not added.
  33 rows were added (Wikipedia now has 1,014 rows).
- **Anya swara notes are about the raga**, so every variant of Huseni, Rageshree, Hameer Kalyani and Saranga is Bhashanga `Yes` (basis
  `stated by source`). The other new rows get the swara rule. Rageshree's third variant carries the stated N3.
- **Ganavaridhi:** the page prints the N2 scale and the N3 scale as two variants of the raga under melakarta 35. The N2 scale was put back on
  the first row (this session's N3 "correction" would now duplicate the second variant); it is a Bhashanga `Yes` by the rule. So that
  correction stands for 12 of the original 14 rows.
- **Two bare `G` letters** (Jhankarabhramari variant 5, Hameer Kalyani variant 3) were given the parent's G2 and G3 (noted in the rows).
- After the rebuild the master has 18,458 rows, 6,232 ragas and 9,499 variants; every scale check is `ok` except the 2 Chayalaka rows.

## Nerur, Raga of the Week and Musiclegato checked against their sources (2026-09-21)

- **Nerur** (`data/raw-sources/nerur-carnatic-raga-list.html`): 212 janya lines, 212 janya rows; no variant or row is missing and the text has no
  anya notes. The only scale differences are this session's own edits (Lalitha, Gantha, Sindhu Bhairavi's mela, bare letters filled).
- **Raga of the Week** (`raga lists/OLD DO NOT USE/raga-of-the-week-repo-list.csv`, the repo's flat CSV, no page): 881 rows in and 881 out; the
  33 scale differences are the collapsed `S S'` duplicates (decided earlier) and Udayaravichandrika (this session's correction).
- **Musiclegato** (the saved index page `musiclegato-Carnatic Raga Scale ... .html`; each link carries the raga's scale in its `rpt=`): 768
  ragas on the page, 767 in the list. No variants are hidden (one `aroha/avaroha` per raga; Kalkada is the exception, with two arohas).
  Fixed by `scripts/fix_musiclegato_from_page.py` (user decision: do all; per-row detail `musiclegato-page-fix-changelog.csv`; backup
  `CLEAN-musiclegato-carnatic-raga-list.backup-before-page-fix.csv`; the page is saved as
  `data/raw-sources/musiclegato-carnatic-ragas-index-2026-09-21.html`):
  - **Shivashakti** (melakarta 10) was missing: added (`S G2 M1 D2 S` / `S N2 D2 M1 G2 S`).
  - **Rasali and VanaVali** moved from 22 to 4, where the page lists them (their scales are 4's; Bhashanga `Yes` to `No`). **Bhanumati**
    is listed under 4 on the page but its scale (`G2 R2` in the avaroha) fits 22, so it **stays under 22** (user decision; noted in the row).
  - **Kalkada** is now two variants (the page's two arohas with its one avaroha).
  - **Page split restored on 13 rows** where the page separates aroha and avaroha with `/` and the list had split the same swaras elsewhere:
    Poorna Panchamam (its doubled `D2 D2` is gone), Indughantarava, Darbar, Kapijingala, Jinjothi, Chenjuruthi, Sindhu Suruti, ShankaraMohana,
    Shokavarali (Vakra `Yes` to `No`), Gomati, Puriya Dhanashree, Garigadya. Where the page has no `/`, the list's split is the source's own
    ambiguity and was left alone.
  - Jingala's name was stored URL-encoded as `Jinga%e1%b8%b7a`; decoded to `Jingaḷa` (user decision; backup `CLEAN-musiclegato-carnatic-raga-list.backup-before-jingala-name.csv`). No other list has an encoded name.
  - After the rebuild: 18,460 rows, 6,230 ragas, 9,485 variants; every scale check is `ok` except the 2 Chayalaka rows.
- None of the three states Bhashanga, so the `Bhashanga Basis` for them is now `derived from swaras`.

## File names and the pitch columns (2026-09-21)

**Names (user decision).** The merged file, one row per variant with the sources merged, is **the masterlist**:
`raga lists/MASTERLIST-carnatic-ragas.csv` (built by `scripts/build_merged_ragas.py`; formerly `MERGED-carnatic-ragas.csv`).
The stacked file, every source row once with its raga and variant ids, is now
`raga lists/ALL-SOURCE-ROWS-carnatic-raga-database.csv` (formerly `MASTER-carnatic-raga-database.csv`). In the sections above,
"the master" / "master database" means the all-source-rows file and "merged document" means the masterlist.

**Pitch columns on the masterlist.** `Aroha/Avaroha Pitch Binary`, `Pitch Decimal` and `Note Order` (the melodic sequence as degree numbers
within the scale's own pitch set) come from the all-source-rows file (the variant's representative row); they are pitch classes, so octave
marks do not touch them, and every variant's values agree across all its rows.

**The semitone chain is canonical, not a source's own (user decision, 2026-09-21).** The all-source-rows file keeps each row's chain as its
source marked the octaves, and those disagree: an explicit `S'` overrides the notes around it and can force a +14 step (Chayabhouli's aroha
ends `... N2 S'` after a lower-octave phrase; Bhujagamani reads N2 to G3 as +6 in one row and -6 in another). 71 variants had rows with
different chains (55 a whole-scale octave shift, 19 with different steps). `scripts/canonical_chain.py` (11 tests in
`scripts/test_canonical_chain.py`) builds one chain per variant from the swaras alone, ignoring every octave mark:

- the cheapest path over the octave of each note: a step costs its size, +0.5 against the direction of the part (a tie-break, such as the
  +6 / -6 of N2 to G3), +3 per semitone beyond 7, and no step is larger than 11;
- a scale that opens and closes on Sa is closed to one octave (aroha 0 to 12, avaroha 12 to 0); other scales sit as near the middle octave as the
  steps allow (a scale opening on the lower Ni reads N -2, S 0; `R1 M1 P D1 N3 S` reads 1 5 7 8 11 12); the avaroha starts where the aroha ended;
- the user-approved convention: a leap away from the opening Sa goes in the direction of the part (`S P` up in an aroha, `S' M` down in an avaroha);
- the default reading is replaced only when it needs a step larger than 8 or disagrees with the recorded Vakra: then the open reading, or the
  reading with each part's direction forced, is used if it does better.

Result: 9,482 variants have a chain (the two Chayalaka variants have none); the largest step anywhere is 8 (no +14; no step above 8);
`Aroha Steps` / `Avaroha Steps` are the signed steps between neighbouring notes. 9,452 variants use the default reading. `Chain Note` says
when another was used: 30 variants are not closed to one octave because the source text does not span one (for example Janatodi's avaroha
is written as its aroha; Dhunibhinnashadjam and Mohananata likewise), and Hamsanadam's variant 6 reads Vakra `No` from the chain while `Yes` is recorded (its avaroha is marked `S'` at the end, which the chain
ignores). That was the only disagreement between the chain and the recorded Vakra until Vakulasree (below).

## Vakulasree: the leap is down, not up (2026-09-22)

The user asked to see Vakulasree's chain and spotted the error: the forced reading (above) read N2 to M2 as a leap up to a new, higher Ma,
because the earlier ruling (2026-09-21) said so and the chain avoided a fall to match it. The user confirmed it is a leap **down**, back to
the Ma already used earlier in the phrase (position 6, not 18): `S(0) R1(1) G1(2) M2(6) D2(9) N2(10) M2(6) P(7) N2(10) S(12)`, a step of -4.
By the Vakra rule itself, that fall in the aroha makes the raga Vakra **Yes**, not No: "follow the established rules" (user).

- **Vakra changed to Yes** on the pasted Vakulasree row, Pravagam's Vahulasri and Royal Carpet's vakuLashrI (Vakra Basis stays "ruled by the
  user"). Backups: `CLEAN-*-list.backup-before-vakulasree-fix.csv` for the three lists.
- **The octave marks added to the pasted row's aroha on 2026-09-21** (`M2' P' N2' S''`, based on the leap-up reading) are undone; the aroha is
  back to `S R1 G1 M2 D2 N2 M2 P N2 S'` with only the closing Sa marked, which is what the corrected chain reads without any forcing.
- **`vakra-rulings.csv`** updated: `vakulashri` and `vahulasri` now rule Yes, and a `vakulasree` entry was added (matching the pasted row's
  corrected aroha) so a rebuild finds the ruling by lookup rather than needing a hand edit.
- With the ruling now Yes, the natural nearest-step reading already produces the fall, so `canonical_chain.py` no longer needs to force this
  variant; its `Chain Note` is blank. `test_canonical_chain.py`'s Vakulasree test was rewritten to check the corrected direction, and the
  forced-reading test now uses a synthetic case, since Vakulasree no longer demonstrates forcing.
- The masterlist and all-source-rows files were rebuilt. Hamsanadam's variant 6 remains the only chain/Vakra disagreement.


## Hamsanadam: the closing mark was a typo, not real (2026-09-22)

The user pushed back on treating this as deliberate: why would one raga out of 6,000+ be the exception? Checked against every other
source: Royal Carpet (4 rows), Pravagam (3) and the pasted list (2) all end Hamsanadam's avaroha on a plain `S`; so does this Wikipedia
row's own sibling variant in the same table cell. Only this one row closed on `Ṡ` (upper Sa). That is a typo, the same kind as Navaroj's
bad digits, not a real marked ending. Corrected: avaroha `S N3 D3 P M2 R2 S'` to `S N3 D3 P M2 R2 S`; Vakra `Yes` to `No`, matching the
canonical chain. Backup `CLEAN-wikipedia-janya-raga-list.backup-before-hamsanadam-fix.csv`. The chain and the recorded Vakra now agree on
every one of the 9,482 variants that have a chain.

## Publication record (checked 2026-09-19)

- English (the scan used): 4th edition, Feb 2007, "Revised & Enlarged"; earlier editions
  Dec 1984, Oct 1991, Jun 2002. Tamil scan: 3rd edition, Oct 2005; earlier edition Dec
  1994 (the first Tamil edition is not dated on its copyright page).
- The English foreword (first-edition text) says the work "is now being published both in
  English and Tamil", so the two were probably launched together; each English revision
  was followed by a Tamil one about three years later.
- The English preface to the second edition says the book was "completely corrected and
  revised". The English 2007 scan may therefore contain corrections that the 2005 Tamil
  lacks, so a difference between them is not automatically a Tamil-side correction.
- Sri (melakarta 22) and Sunadapriya (melakarta 57) were checked against the Tamil
  edition; see their notes.

**Caution recorded during the analysis:** the English is not always the longer or
shorter reading (it has the extra swara in 413 differences, the Tamil in 296, and 151
are substitutions), and the independent-source votes leaned English (144 vs 62). Both
editions appear to carry typesetting slips.

## Rows deleted from the sheet

| Former row | Page | What it was | Why removed |
|---|---|---|---|
| `(unknown) (Raga 9)`, aroha `R1`, avaroha `M2` | p238 | A chakra heading (`BRAHMA - SHA`) parsed as a raga | Not a raga |
| `(unknown) (Raga 10)`, aroha `D1`, avaroha `S` | p240 | A chakra heading (`DESI - PA`) parsed as a raga | Not a raga |
| `NavaneethaPancha am (Raga 2)`, aroha `S G2 M1 D3 P D3 N3 S`, avaroha `S N3 D3 P M1 G2 S`, ref P | p149 | An extra variant of item 19 | p149 prints only `S G M D P D N S / S N P M R S / AE` for item 19 and no other page has this scale |

## Audit files in `raga lists/`

- `CLEAN-raga-pravagam-list.backup-before-*.csv`: a snapshot of the sheet before each
  stage (madhyama, foldin, newrows, structural, flags, hyphen, nand-tamil, tamil57,
  decision-notes, note-format-fix, chayalaka, digits, vakra-definition, vakra-confirm, vakra-format, parent-restore, melas-and-janyas, vakra-module, vakra-reliability, navaroj-fix, vakra-rulings, vakulasree-ruling). Diffing consecutive snapshots reproduces every change.
- `pravagam-changelog.csv`, `pravagam-structural-changelog.csv`,
  `pravagam-tamil-changes-applied.csv`: per-row before/after for the fold-in, the
  structural fixes and the 57 Tamil changes.
- `pravagam-tamil-crosscheck.csv`, `pravagam-tamil-consistency-only.csv`: the Tamil
  comparison rows that are not in tier A, and the 36 consistency-only rows.
- `pravagam-melodic-survey.csv`, `pravagam-strangeness-tamil-candidates.csv`: the melodic
  survey and the Tamil-candidate list (see above).
- `pravagam-vision-corrections.csv`, `pravagam-reviewed-rows-check.csv`,
  `pravagam-doubled-letters.csv`, `pravagam-structural-findings.csv`: earlier review
  files. Their row numbers pre-date later row inserts and deletes, so treat them as
  superseded by the changelogs.

## Bhashanga conflicts: a stated Yes beats a derived No (2026-09-22)

Starting a data-analysis pass over `MASTERLIST-carnatic-ragas.csv` turned up 11 raga
variants whose merged `Bhashanga` read `Conflict`. In every one, Wikipedia's page states
Bhashanga outright (`Bhashanga Basis = stated by source`, its own anya-swara note) while
every other source's row computed `No` from its own printed scale (`derived from swaras`)
simply not happening to show the extra note. That is an absence of evidence in one
printed scale, not evidence against a raga the source explicitly names as bhashanga — and
all 11 are textbook bhashanga ragas: Asāveri, Punnagavarali, Āhiri, Kamās, Behāg,
Bilahari, Devagāndhāri, Neelāmbari, Madhumālti, Chenjurutti, Hindustāni Kāpi (one of its
four variants).

Fixed in `merged_bhashanga()`/`merged_basis()` in `scripts/build_merged_ragas.py`: a
stated Yes/No now wins a conflict against a derived value (two stated values that
disagree would still conflict, and so would a derived Yes against a derived No — both
read from real pitch content, just contradictory). No aroha, avaroha, semitone, or other
pitch-content column changed anywhere; only `Bhashanga (Merged)` and `Bhashanga Basis`
were affected, on 21 rows total (10 flipped `Conflict` -> `Yes`; the Hindustāni Kāpi
variant that had two Wikipedia-adjacent rows conflicting resolved the same way; 11 more
rows that were already `Yes` got a cleaner basis label, `stated by source` alone instead
of the misleading `stated by source + derived from swaras`). Verified by diffing the
masterlist against `MASTERLIST-carnatic-ragas.backup-before-bhashanga-conflict-resolution.csv`.

Also checked in the same pass: the 47 `Needs Review` Bhashanga rows are not a bug. Each
one's scale originally had a bare swara letter (no digit), filled to the parent
melakarta's own default earlier in sanitization; running the swara rule on a
default-filled scale can only ever read "no off-parent swara," which would be manufactured
evidence, not real evidence. `Needs Review` stays the honest label. The 2 blank-scale
rows (`Aparoopam`/mela 28, `Indhu Kesari`/mela 53) are the Pravagam Chayalaka rows kept
deliberately with no scale (see the Chayalaka section above) — also correct as-is.
