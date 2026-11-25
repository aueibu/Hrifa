# Raga Pravagam extraction — personal reference only

Source: *Raga Pravagam (Index to Carnatic Ragas)* by Dr. M. N. Dhandapani &
Smt. D. Pattammal, The Trinity Music Book Publishers, Chennai, 4th ed. 2007.
A commercially published, copyrighted 313-page compilation of ~5,000
Carnatic ragas pulled from dozens of historical bibliographic sources, each
entry with an Arohanam/Avarohanam and a source reference code.

**This file itself is for personal research use only** and should not be
shipped as-is. Per the copyright discussion when this was extracted: the
bare swara facts for well-known ragas are safe (they're corroborated across
the other, freely-licensed sources already in `data/`), but the book's
specific ~5,000-raga compilation, its selection/arrangement, and its
reference-code apparatus are the authors' own copyrighted editorial work.

**Update:** a facts-only subset (name, mela, aroha, avaroha - no Ref codes
or other book structure) has since been merged into
`data/master-carnatic-raga-database.csv` as a 7th source ("Pravagam") via
`scripts/merge_pravagam.py`. That merged subset is what ships; this file's
Ref codes, Confidence flags, and Raw Row Text remain personal-reference-only
and are not part of the shipped database.

## Files

- `raga-pravagam-full-extraction.csv` — structured extraction of the main
  "Mela Ragas and their Janyas" table (pages 64-277), one row per raga
  variant: Melakarta Number/Name, Raga Name, Variant #, Arohanam, Avarohanam,
  Ref (bibliography code), a `Confidence` flag, the raw row text, and the
  source page. 5,807 rows (~3,768 distinct raga names) across all 72
  melakartas.
- `raga-pravagam-raw-text-by-mela.txt` — the full raw text of the table,
  grouped by melakarta, as a fallback/cross-check for anything the
  structured parser got wrong.
- `raga-pravagam-bibliography.csv` — the book's Ref Code → source mapping
  (60 of ~63 entries; a couple of two-letter person-initials in the source
  text, e.g. "S." in "Thanjavur S. Kalyana Raman", occasionally get
  misread as a new ref-code line and split an entry - check against the PDF
  pages 312-313 directly if a specific code's source looks truncated or
  wrong).
- `raga-pravagam-synonyms.csv` — the book's raga-name-equivalence groups
  (338 items) from its two-column "Synonyms of Karnatak Ragas" section.
  The source's two-column layout occasionally merges into adjacent items,
  and roman-numeral chakra markers (II, III, V, ...) sometimes trail into
  an entry's text - treat this one as rougher than the main table.

## Extraction method & known limitations

Built with `scripts/extract_pravagam.py` using `pdfplumber`'s word-level
(x, y) positions rather than the PDF's raw text stream order, since the
source's text layer interleaves multi-line/wrapped table cells inconsistently.
Column assignment uses a content heuristic (name words contain lowercase
letters; arohanam/avarohanam/ref tokens are short all-uppercase runs) plus a
per-row largest-gap heuristic to split the remaining tokens into
Aroha | Avaroha | Ref.

This started out approximate: the automated column-split heuristic left
~13% of rows (754 of 5,807) flagged `low` confidence, mostly cases where a
raga's aroha/avaroha spilled across a wrapped print line. Every one of
those was subsequently checked by rendering the actual PDF page and
visually verifying the correct split (or, for straightforward single-line
cases, resolved with a stricter algorithmic re-check). Rows fixed this way
are marked `Confidence: high (visually verified)`; the original
high-confidence rows from the automated pass are marked plain `high`. A
handful of source-layout oddities were also cleaned up along the way: two
stacked-but-unnumbered variant rows (Bhibhasu, Thekkali) were split out
into their correct separate entries, and a few orphaned fragments caused by
parenthetical alt-names on their own print line were removed.
5,453 rows total, zero remaining low-confidence.

### Sa-boundary audit

A later pass checked every row against the rule that a proper Arohanam and
Avarohanam should start and end on Sa (with a documented exception: a
handful of ragas, mostly Punnaga-family, genuinely start on Nishada). 1,138
rows (21%) turned out to have a boundary swara misplaced by the original
column-split heuristic (which only scored the avarohanam's closing letter,
never the arohanam's or the avarohanam's opening one). 696 of those were
repaired automatically by re-splitting the saved `Raw Row Text` with a
stricter boundary check (`Confidence: high (sa-rule verified)`).

The remaining 423 were flagged (`Confidence: FLAGGED: sa-rule (...)`) and
reviewed row by row: 25 were genuine extraction defects (a wrapped
print line merged into the wrong column, a duplicated boundary letter from
an OCR artifact, or - in one case, Sama Vasantham - the source book itself
printing a blank Arohanam column, reconstructed from the printed swara run
as Aroha `S R G M P N S` / Avaroha `S N D P M G R S` / Ref `R`, the only
split of the 16 printed letters that lands both fields cleanly on Sa) and
were corrected by rendering the actual PDF page and reading the table
directly; those are marked
`Confidence: high (sa-rule verified via page image)`. 4 more were already
correct as extracted and just needed the flag cleared
(`high (sa-rule reviewed: verified accurate per page image)`). The
remaining 394 were confirmed to be legitimate: many Pravagam ragas simply
don't resolve to Sa at one or both ends of their aroha/avaroha (starting or
ending on Ni, Dha, Panchama, etc. is a real, if less common, Carnatic
convention) - these are marked
`high (sa-rule reviewed: non-Sa/Ni boundary confirmed accurate per source)`.
A small number of genuine same-field duplicate boundary swaras printed in
the book itself (e.g. an Arohanam ending "...S S") were still collapsed to
a single letter, per the project's own data-quality rule, even though that
diverges slightly from the book's literal typesetting.
Zero rows remain flagged; zero rows have a doubled or missing Sa (or its
documented exception) at either boundary.
