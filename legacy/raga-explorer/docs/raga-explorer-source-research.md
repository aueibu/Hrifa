# Raga Explorer — Source Research Notes
*Compiled from the pages saved in "Raga Explorer Project" — Megalist (365+ Ragas), Tags & Classifiers, Glossary: Raga Jargon, and Thaat: Bhatkhande's Base Scales & Beyond — all from **ragajunglism.org**, the Hindustani Raga Index built by George Howlett. Also present: a `MasterListOfRagas.pdf` (a separate 1000+ raga cross-reference, noted briefly at the end — not yet mined), and a six-sheet **RAGATABLE [Public]** spreadsheet workbook — a public, openly-browsable resource he links from the site (not something pulled from behind the scenes) that appears to be the working dataset behind the site's analysis — covered in its own section below.*

---

## ⚠️ Read this part first: attribution and reuse

This is one person's independent scholarly project — original musicological analysis, prose, and a taxonomy he designed himself, not a public database or Wikipedia-style commons resource. Two things are worth being deliberate about before this material goes into anything built with AI assistance:

- **The site states outright that it is "ad-free, AI-free, & open-access."** That's a direct, stated preference about how the author wants his work used, and folding his analysis wholesale into an AI-assisted tool sits in tension with it, even though you downloaded these pages yourself for personal reference.
- **No Creative Commons or reuse license is posted anywhere on the pages** — no footer copyright statement either way, meaning it defaults to ordinary copyright. The raga *facts* (which notes a raga uses, its thaat, its vadi) aren't copyrightable, but his specific descriptive prose, his classification scheme, and his curation choices are his work.

Practical suggestion: it's fine to keep using this as *your own* reference while you design (that's what these notes are for), and the underlying swara-notation facts for well-known ragas are corroborated across many independent sources so they're safe to encode in your own words. But before pulling his descriptions, his specific tag taxonomy, or his 362-raga list wholesale into something published or shared, it's worth either reaching out to him directly (he's clearly reachable — there's a Feedback/Contact page and a Patreon) or re-deriving the underlying facts independently and writing your own descriptions, the way I did for the ~25 ragas already in the Explorer. I've extracted a structured dataset from the Megalist page (below) purely so *you* have it to work from — I'd hold off on shipping his prose or his exact taxonomy labels into a published version of the tool without his okay.

---

## What's in the files

### 1. Megalist (365+ Ragas) — the big one
A single long page profiling **362 individually named ragas** (I filtered out ~11 nav/footer entries that weren't actual raga profiles). Each entry follows an exact, parseable pattern:

- **Name** (e.g. "Abheri Todi")
- **Permalink** to its own dedicated page (e.g. `ragajunglism.org/ragas/abheri-todi/`) — the megalist entry is a summary; the individual page presumably has more
- **Swara notation string**, e.g. `S-rR-gG-m-P-d-n-S` — his own compact notation for the full note-set, where a token like `rR` means "both the komal and shuddha version of that scale-degree are used"
- **A paragraph of musicological commentary** — comparisons to related ragas, historical/lineage notes, sourced claims (often citing named scholars like Rajan Parrikar, or books like *Tanarang* and Joep Bor's *Raga Guide*)
- **A citation line** — a performer name + decade, presumably the recording his notation/analysis is based on

I extracted all 362 into a clean structured file: **`extracted_megalist_ragas_clean.json`**, saved alongside the source pages in your project folder. Each record is `{name, url, swara, desc, citation}`. This is directly minable: the swara notation uses exactly the same 12-token alphabet (S r R g G m M P d D n N) as the Hindustani side of your Explorer, so it converts to absolute semitone sets with the same mapping you already built — no new logic needed, just a parser for tokens like `rR`/`gG`/`mM`/`dD`/`nN` (both variants present) that emits two semitones instead of one.

That's **14x** the ~25 Hindustani ragas currently in the Explorer, and it isn't confined to the 10 Bhatkhande thaats — most of these 362 will land on scales *outside* the 10 named thaats, which is exactly the gap you asked about last time.

### 2. Tags & Classifiers — a full taxonomy, independently built
This page defines a rich multi-axis classification system Howlett designed for the whole raga corpus, with per-tag raga counts. The categories, verbatim:

| Axis | Values |
|---|---|
| **Swaras** (note count) | 4 / 5 / 6 / 7 / 8 / 9 / 10+ |
| **Sapta** (jati) | Audav (5) · Shadav (6) · Sampurna (7) |
| **Poorvang** (lower tetrachord shape) | SRGM · SRG · SRM · SGM |
| **Uttarang** (upper tetrachord shape) | PDNS · PDS · PNS · DNS |
| **Varjit** (omitted note) | Re · Ga · Ma · Pa · Dha · Ni (plus specific-swara versions, e.g. "Varjit: 06 - Ma (tivra)") |
| **Double** (both variants used) | rR · gG · mM · dD · nN |
| **Thaat** | Bhatkhande's 10 (62 ragas) · **Sampurna 32** (86 ragas) · Enclosed (67) · Inexact (226) |
| **Symmetries** | Mirror · Rotation · Palindrome |
| **Chal** (character) | All-shuddha · All-komal · Ma-tivra |
| **Gaps/Clusters** | Anhemitonic · Hemitonic ("2-row") · Cohemitonic ("3-row") · Co-cohemitonic ("4-row") · Co-co-cohemitonic ("5-row") |
| **Aroha / Avroh jati** | Audav · Shadav · Sampurna (tracked separately for ascent vs. descent) |
| **Jati (symmetry of aroha vs avroh)** | Equilateral · Balanced · Avroh+1 · Avroh+2 |
| **Samay** (time of day) | Morning (106) · Afternoon (35) · Evening (102) · Night (142) |
| **Construction** | Jod (77, fusion of two ragas) · Mishra (12, mixed/borrowed-note) · Oddball (24) |
| **Origin** | Ancient · Carnatic (import) · Modern (composed, often with a named composer + year) |
| **Dominance** | Poorvang-focused (199) · Uttarang-focused (128) |
| **Prevalence** | Prachalit (common) · Aprachalit (rare, 247!) · A-list (top 25) |
| **Quirks** | Atritonal · Centred · Fragmented · Maximal · Self-shadowing · Komal Pa · Consecutive varjits · Pa-repeating |
| **Raganga** (melodic family — 13 of them) | Bhairav (35) · Bihag (16) · Bilawal (15) · Dhanashree (11) · Kafi (12) · Kalyan (30) · Kanada (23) · Kauns (21) · Khamaj (17) · Lalit (13) · Malhar (25) · Sarang (16) · Todi (30) |

**The big one for you: "Thaat: Sampurna 32" (86 ragas).** This is unpacked fully below — you added the companion article since my last pass, and it turns out to matter a lot for exactly the gap we discussed.

### 2.5. Thaat: Bhatkhande's Base Scales & Beyond — the 32-scale bridge

This is the article you just added, and it's the single most directly useful thing in the folder for the Explorer. Howlett takes the same problem we ran into — only 10 of the 72 combinatorial scales have a Hindustani name — and builds his own extension, which he calls a "dartboard" of **32 sampurna (7-note) scales**. I parsed all 32 profiles and cross-checked every one against your app's own melakarta generator: **all 32 matched exactly, with zero discrepancies** — his 10 canonical thaats and his 22 additional named scales land precisely on the melakarta numbers your generator already computes. That's a strong independent confirmation that both his scheme and your generator are internally consistent with each other and with the real melakarta system.

Concretely, this gives you **22 more named Hindustani scale-identities** beyond the 10 thaats — more than doubling your current `THAAT_TO_MELA`-style coverage from 10/72 to 32/72:

| Hindustani name | Swara set | Melakarta # | Melakarta name | Western mode | Built from (tetrachord bifurcation) |
|---|---|---|---|---|---|
| Latangi | S R G M P d N S | 63 | Latangi | Lydian ♭6 | Yaman + Bhairav |
| Madhuvanti | S R g M P D N S | 59 | Dharmavati | Lydian ♭3 | Madhuvanti + Bilawal |
| Madhu Multani | S r g M P D N S | 47 | Suvarnangi | Lydian ♭2♭3 | Todi + Bilawal |
| Simhendra Madhyamam | S R g M P d N S | 57 | Simhendramadhyamam | Hungarian Minor | Madhuvanti + Bhairav |
| Vachaspati | S R G M P D n S | 64 | Vachaspati | Lydian Dominant | Yaman + Kafi |
| Rampriya | S r G M P D n S | 52 | Ramapriya | Lydian ♭2♭7 | Marwa + Kafi |
| Rishabhapriya | S R G M P d n S | 62 | Rishabhapriya | Lydian ♭6♭7 | Yaman + Bhairavi |
| Namanarayani | S r G M P d n S | 50 | Namanarayani | Phrygian Dominant #4 | Marwa + Bhairavi |
| Hemavati | S R g M P D n S | 58 | Hemavati | Dorian #4 | Madhuvanti + Kafi |
| Chandni Todi | S r g M P D n S | 46 | Shadvidhamargini | Dorian ♭2#4 | Todi + Kafi |
| Shanmukhpriya | S R g M P d n S | 56 | Shanmukhapriya | Aeolian #4 | Madhuvanti + Bhairavi |
| Komal Ramkali | S r g M P d n S | 44 | Bhavapriya | Phrygian #4 | Todi + Bhairavi |
| Bhatiyari Bhairav | S r G m P D N S | 17 | Suryakantam | Ionian ♭2 | Bhairav + Bilawal |
| Nat Bhairav | S R G m P d N S | 27 | Sarasangi | Harmonic Major | Bilawal + Bhairav |
| Patdeep | S R g m P D N S | 23 | Gaurimanohari | Melodic Minor | Kafi + Bilawal |
| Kokilapriya | S r g m P D N S | 11 | Kokilapriya | Neapolitan Major | Bhairavi + Bilawal |
| Kirwani | S R g m P d N S | 21 | Kiravani | Harmonic Minor | Kafi + Bhairav |
| Ardhanarishvara | S r g m P d N S | 9 | Dhenuka | Phrygian ♮7 | Bhairavi + Bhairav |
| Ahir Bhairav *(as a full scale)* | S r G m P D n S | 16 | Chakravakam | Mixolydian ♭2 | Bhairav + Kafi |
| Charukeshi | S R G m P d n S | 26 | Charukesi | Mixolydian ♭6 | Bilawal + Bhairavi |
| Basant Mukhari | S r G m P d n S | 14 | Vakulabharanam | Phrygian Dominant | Bhairav + Bhairavi |
| Ahiri | S r g m P D n S | 10 | Natakapriya | Dorian ♭2 | Bhairavi + Kafi |

A few things worth flagging about how this maps onto what's already in the Explorer:

- **Ahir Bhairav and Charukeshi are on this list as full 7-note scales in their own right** — which is exactly the correction I'd already made to your data (Ahir Bhairav's true note-set matches Vakulābharaṇam, not a "borrowed note" version of Bhairav; Charukeshi already had no thaat match in your app, and this confirms it's a real, if fairly rare, Hindustani sampurna form too, worth un-flagging from "no Hindustani thaat" to "Hindustani name exists, just not one of Bhatkhande's original 10").
- **Every scale entry comes with populated "Exact" and "Enclosed" raga lists** — e.g. Kalyan's page lists *Yaman, Shuddha Kalyan* as exact matches and fourteen more (Bhupali, Deshkar, Hansadhwani, Hindol, Pahadi...) as enclosed subsets. This is, in effect, pre-curated raga-to-scale grouping for a big chunk of the corpus — far beyond hand-picking a few ragas per thaat as I did originally.
- **Each scale also carries a Western church-mode name** (Lydian, Mixolydian, Harmonic Minor, Neapolitan Major, etc.) — a third naming layer alongside Hindustani and Carnatic, free to add as another "also known as" badge with no new data-gathering needed (these are standard, uncopyrightable Western theory terms).
- **"Bifurcation"** — his term for which two of the 10 base thaats' lower/upper tetrachords combine to produce each of the 22 extra scales (e.g. Latangi = Yaman's lower half + Bhairav's upper half). This is a genuinely new relational concept: a scale can now be described not just by its own name, but as a "recipe" of two familiar ones.
- **The gap is smaller than we said last time, but still real.** With this article, named Hindustani coverage goes from 10/72 to 32/72 scales — but that still leaves **40 of the 72 melakartas with no known Hindustani sampurna raga**, per Howlett's own research (he explicitly went looking for ragas on the remaining scales and came up empty for those 40, as of his last update). That's a more precise version of the point I made previously, not a full resolution of it.

I saved the parsed version as **`extracted_thaat_dartboard_clean.json`** (32 records: `hindustani_name`, `swara`, `semitones`, `melakarta_num`/`melakarta_name`, `western_mode`, `bifurcation`, `exact_matches`, `enclosed_matches`) — same attribution caveat as the Megalist extraction applies to the "Exact"/"Enclosed" raga lists and his prose, but the scale identities, mode names, and semitone facts themselves are safe to use directly.

### 3. Glossary: Raga Jargon — 236 defined terms
A genuinely comprehensive glossary of Hindustani theory and performance-practice vocabulary — ornaments (meend, gamak, andolan, murki), song forms (dhrupad's four dhatus, khayal, thumri, tarana), tuning/rasa concepts, and — most relevant to you — a cluster of **structural/mathematical concepts that overlap strikingly with what you've already built**:

- **"Swara wheel"** — his term for representing a raga around a 12-point clock-face wheel with used notes filled in. This is, near enough, exactly your note-selection UI, independently arrived at.
- **"Pitch class"** — his term for the same octave-independent 0–11 semitone numbering you're already using as your data model's backbone.
- **"Generic swara" vs. "specific swara"** — his terms for exactly the Hindustani-letter (7-value) vs. semitone-position (12-value) distinction your `LABELS` array already encodes.
- **"Core form"** — the "official" note-set of a raga, deliberately excluding vivadi/mishra touches — i.e., exactly the `notes` field you store per raga, with the same judgment calls (what counts as "real" vs. "occasional/borrowed") that we ran into with Ahir Bhairav and Ramkali.
- **"Prakriti"** — ragas sharing an identical note-set (his examples: Bageshri & Bhimpalasi; Marwa & Puriya). This is precisely your "grouped by identical absolute note-set" mechanic — except he applies it *within* Hindustani too, not just across traditions. Worth generalizing your "Shared" badge logic so it also catches same-school prakriti twins, not only cross-school ones.
- **"Complement"** — raga pairs that share *only* Sa but together cover all 12 notes (his example: Khamaj + Gujari Todi = all 12 semitones). A genuinely new relationship you don't have yet, and cheap to compute from data you already have.
- **"Generator"** — ragas whose scale can be built by stacking one repeated interval from Sa (his example: Bhupali = four stacked perfect fourths/fifths). A fun, orthogonal way to explore the scale space.
- **"Mirror" / "Rotation" / "Palindrome" / "Reverse" / "Centred" / "Maximal" / "Anhemitonic"** — a whole vocabulary of *symmetry properties* of the swara-wheel shape (e.g. "Bhairav and Charukeshi have the same interval pattern read forwards and backwards"). All of these are pure functions of the semitone sets you already store — nothing new to source, just new derived badges.
- **"Murchana"** (Hindustani) / **"Graha bheda"** (the shared ancient concept, also named in Carnatic terms) — modal rotation: shifting which scale-degree is treated as Sa. His example: Bhupali's Re becomes the new Sa → produces Megh. This is a real structural relationship your 72-scale model could expose directly (rotate the selected note-set around the wheel and see which *other* named scale you land on) — and it's a third axis of "shared-ness" beyond your current Hindustani/Carnatic split: scales can be related by rotation even when nobody calls them by related names.
- **"Jod"** (fusion of two named ragas, e.g. Jaun Bhairav = Jaunpuri + Bhairav) and **"Mishra"** (borrowed-note, confirming the term I used when we discussed Ahir Bhairav) — useful vocabulary for tagging *how* a raga relates to its parent, beyond simple subset/superset.

### 4. RAGATABLE [Public] — a six-sheet spreadsheet workbook (the raw dataset)

You added this most recently, calling it "basically all of the data we need." It's a Google Sheets export (six separate HTML files, one per tab) and it's a different kind of source from everything above: instead of prose profiles, it's a fully computed, column-per-statistic dataset — it reads like the actual working spreadsheet Howlett uses to build the site and the dartboard article, not a public-facing writeup. I converted all six tabs to plain CSV (faithful, no interpretation) and they're sitting alongside this doc as `csv_export/*.csv`. Here's what's in each:

**`RAGATABLE.csv`** (372 ragas × 138 columns) — the main sheet, and the one that matters most. Same 372-ish raga population as the Megalist, but every raga now has a huge row of *derived* statistics instead of prose. The columns run in two large, mostly-parallel blocks (the second looks like a revised/reorganized pass over the same calculations — worth deciding which block you trust as canonical, or whether they're deliberately redundant checks on each other). Per raga it computes, among other things:

- **Swara Set** (same notation as Megalist) plus per-note boolean flags for all 12 tokens (S r R g G m M P d D n N), twice.
- **Poorvang / Uttarang** — the lower and upper tetrachord shapes, both as a "generic" 4-letter pattern (Prv.(G)/Utr.(G): S-R-G-M style) and a specific one — this is the tetrachord-bifurcation idea from the dartboard article, but computed per-raga rather than per-scale.
- **Pitch Classes / Intervals** — the exact same octave-independent 0–11 semitone list and successive-interval list your app's data model already uses natively. This is the single most directly reusable column: it's your `notes` array, already computed, for all 372 ragas.
- **Prakriti** — a numeric id grouping ragas that share an identical note-set (the same "shared note-set" concept from the Glossary, now with actual group IDs instead of just examples).
- **Doubled / Reversed / Mir.Loop / G.Mir / G.Pal / G.Rot** — the full symmetry-property vocabulary from the Glossary (mirror, palindrome, rotation), computed as boolean flags per raga instead of just described.
- **MUR / Murchana Set / Deg. / Uniq.** — murchana (modal rotation) already worked out per raga: which rotations of the note-set land on another named raga, and how many "unique" rotations exist.
- **Gaps / Cohe. / CoCo. / CCC.** — the hemitonic/cohemitonic/co-cohemitonic clustering categories from the Glossary's "Gaps/Clusters" axis, computed per raga.
- **Exact? / Encl.? / Th.#** — whether the raga is an *exact* match, an *enclosed* (subset) match, or neither, against a numbered thaat/scale — this is the same Exact/Enclosed relationship from the dartboard article, but appears to be pre-computed for the full 372-raga corpus rather than just the 32 dartboard scales, which is a big deal if so (worth verifying against a few known cases).
- **Jazz** — the Western scale-degree formula (e.g. `1-b2-2-b3-3-4-5-b6-b7-8`), a more precise cousin of the "Western mode name" column from the dartboard article.
- **Carnatic / C-Sa** — an explicit Carnatic-notation equivalent (R1/R2/G2/G3-style) and its Western letter-name spelling, for every raga — i.e., this sheet already does the cross-tradition "shared vs. localized" mapping your app is built around, at raga scale rather than just scale scale.
- **Imperfects / Detached** — lists of notes flagged as inconsistently used or ornamentally detached, a more granular version of the "vivadi/mishra" judgment calls we ran into with Ahir Bhairav.
- **Tanpura / Tan:M / Tan:Pa / Tan:P / Tan:m** — a recommended drone tuning (which pair of strings to tune the tanpura to) per raga — practical performance information with no equivalent anywhere else in this folder.

**`32 THAAT.csv`** (32 scales × 278 columns) — this is the dartboard article's 32 scales again, but as raw spreadsheet with the same statistical column set as RAGATABLE (per-note flags, CAT/Cong./Spc./Gen./Diff./Spec. counts) applied to the *scales themselves* rather than to individual ragas — i.e., the scale-level counterpart to the raga-level RAGATABLE sheet. Good cross-check source for validating whatever you build from the dartboard article.

**`CHECKS.csv`** (325 ragas × 12 columns) — this one is different in kind: it lists, per raga, an actual **melodic phrase string** ("MELODIES" — things like `mgRS\D, mgmDS, gRgmD, S\D S\m S\D...`, i.e. real ascending/descending movement patterns, not just a set of notes) alongside a **`Match?` boolean** and columns for characteristic notes actually used (`S.Char`/`M.Char`) versus the full claimed swara set (`S.All`/`M.All`). This looks like a data-quality/validation pass: does the raga's *claimed* note-set (from Swara Set) actually match the notes that show up in *real melodic phrases*? That's a genuinely different and valuable kind of fact — it's about how the raga is actually played, not just its abstract scale — and it's the closest thing in any of these sources to real melodic (aroha/avaroha-level) data rather than pure set theory.

**`Kaunsis.csv`** (68 rows × 277 columns) — a focused deep-dive on the Kauns raga family (Malkauns, Chandrakauns, and dozens of variants), same statistical column shape as the 32-scale sheet. A worked example of applying the whole RAGATABLE methodology to one raga family in detail.

**`MERUKHAND.csv`** (171 rows × 24 columns) — Amir Khan's merukhand permutation sequences: all the ways to order a small group of scale-degrees (e.g. the 24 permutations of Sa-Re-Ga-Ma, labeled M1 through M24+), given as both numeric (`n1..n4`), octave-aware (`o1..o4`), and letter (`s1..s4`, `q1..q4`) representations. This is combinatorial practice material (a khayal vocalist's permutation drills), not raga-identity data — a different category from everything else in the folder, more like an etude generator.

**`TETRACHORDS.csv`** (98 rows × 37 columns) — a systematic enumeration of every possible lower (Poorvang) and upper (Uttarang) tetrachord shape, each given a code like `R1-G1-M1` and a per-note presence grid across the same 12-token alphabet. This looks like the *building-block table* that both RAGATABLE's Poorvang/Uttarang columns and the dartboard article's "bifurcation" concept are assembled from — i.e., this is likely the literal lookup table Howlett used to generate the 22 extra dartboard scales by combining tetrachord pairs.

**How this folder relates to everything above:** RAGATABLE is best understood as the computational engine behind the Megalist and dartboard-article prose — the same underlying facts (swara sets, thaat matches, symmetry properties, Carnatic equivalents), but exhaustively pre-computed per-raga across the whole 372-raga corpus instead of described in a paragraph. Nearly every item on the "mining opportunities" list below (symmetry badges, murchana, complement-style relationships, Carnatic cross-mapping, prakriti grouping) already exists as a column here for the full corpus, computed by someone else, which is a very different starting position from computing them yourself from scratch. Since he links this table openly as part of the site rather than keeping it private, the attribution caveat above is more of an ordinary "it's still his analytical work, so re-derive or credit before publishing" note than a provenance concern — worth being cautious about treating the CSVs as ground truth rather than one person's method until you've spot-checked a handful of the more surprising-looking calculations (e.g. the Exact?/Encl. flags, or the Prakriti groupings) against the melakarta math you already trust, but nothing here needs a permission conversation the way republishing his curated prose lists might.

---

## Concrete mining opportunities, roughly prioritized

1. **Use RAGATABLE.csv as the primary raga dataset** — 372 ragas with pre-computed Pitch Classes, Carnatic equivalents, symmetry flags, murchana sets, and thaat-match status already worked out. This is now the highest-value, lowest-additional-effort item on this list, since the computation you'd otherwise do yourself (items 2–6 below) is largely already done here — the main remaining work is deciding which of the two parallel column blocks to trust, spot-checking a sample against your own melakarta math, and mapping the column names to your own data model.
2. **Fold the 32-scale dartboard into `SCALES`** (highest value, lowest risk among the prose-page sources — bare facts: names, semitone sets, mode names, melakarta cross-refs) — extends named Hindustani coverage from 10 to 32 of the 72 scales, each also picking up a Western-mode "also known as" for free. `32 THAAT.csv` gives you a spreadsheet-native cross-check on the same 32 scales.
3. **Add symmetry badges** (mirror / palindrome / rotation / anhemitonic / maximal / centred) — RAGATABLE already computes these per-raga (Doubled/Reversed/Mir.Loop/G.Mir/G.Pal/G.Rot); otherwise zero new data needed, pure derived computation on note-sets already in your app.
4. **Generalize "prakriti" grouping to same-school duplicates**, not just cross-school ones — RAGATABLE's `Prak.`/`Prakriti` columns already assign group IDs; otherwise a small code change to the existing grouping logic.
5. **Add a "Complement" pairing view** — for any locked scale, show its complementary scale(s) across all 12 notes.
6. **Add a murchana/rotation explorer** — RAGATABLE's `MUR`/`Murchana Set` columns already list, per raga, which rotation (if any) lands on another named raga; otherwise click "rotate" on a locked scale to shift Sa around the wheel and see what you land on.
7. **Add a "bifurcation" explainer** for the 22 extra dartboard scales — "this scale = Yaman's lower half + Bhairav's upper half" — `TETRACHORDS.csv` looks like the literal lookup table this is built from.
8. **Expand raga coverage using the extracted swara strings** (highest ceiling, but needs a license conversation first per the note above) — parse all 362 Megalist `swara` strings, or RAGATABLE's `Pitch Classes` column directly, into semitone sets, going from ~25 to ~350+ Hindustani raga entries. Same attribution care applies to reusing his Exact/Enclosed groupings, Carnatic-equivalent mappings, or Prakriti group IDs wholesale rather than recomputing them yourself.
9. **Glossary as in-app tooltips/help text** — the 236-term glossary is a great source for hover-definitions on jargon your UI already uses (vadi, samvadi, audava, jati, etc.) — but again, write your own short definitions rather than reusing his prose directly.
10. **Mine `CHECKS.csv` for real melodic phrase data** — the only source in this folder with actual movement patterns (aroha/avaroha-level phrases) rather than pure note-sets; could eventually support a "how is this actually played" view beyond the scale-math the app currently does.
11. **Open the `MasterListOfRagas.pdf`** (not yet mined) — a separate 1000+ name cross-reference with columns for alternate names, common names, similar Carnatic ragas, and explicit "excluded from database" reasoning (composed music, vague information, name-only). Useful later as a name-disambiguation and quality-control pass once the raga corpus grows past a couple hundred entries.

---

## Files saved alongside the source pages
- `extracted_megalist_ragas_clean.json` — 362 records: `{name, url, swara, desc, citation}`, ready to be parsed into semitone sets.
- `extracted_thaat_dartboard_clean.json` — 32 records: `{hindustani_name, swara, semitones, melakarta_num, melakarta_name, western_mode, bifurcation, exact_matches, enclosed_matches, is_bhatkhande_10}`, fully cross-checked against your app's melakarta generator with zero mismatches.
- `RAGATABLE [Public]/csv_export/RAGATABLE.csv` — 372 ragas × 138 columns, the main computed dataset (see section 4 above for the column breakdown).
- `RAGATABLE [Public]/csv_export/32 THAAT.csv` — the 32 dartboard scales as raw per-note statistics.
- `RAGATABLE [Public]/csv_export/CHECKS.csv` — 325 ragas with real melodic phrase strings and a swara-set match/validation flag.
- `RAGATABLE [Public]/csv_export/Kaunsis.csv` — 68-row deep-dive on the Kauns raga family.
- `RAGATABLE [Public]/csv_export/MERUKHAND.csv` — Amir Khan's 168 merukhand permutation sequences.
- `RAGATABLE [Public]/csv_export/TETRACHORDS.csv` — 98-row systematic tetrachord (Poorvang/Uttarang building-block) enumeration.
- This notes file.
- Not yet touched: `MasterListOfRagas.pdf` (1000+ name cross-reference — see item 11 above).
