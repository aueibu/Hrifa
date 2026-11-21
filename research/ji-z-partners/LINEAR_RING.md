# Linear-ring Z-pairs among re-rooted modes

2026-11-21. Tools: `linring.py` (search, `harmonic`, `hdisk`, `report`, `rootcheck`, `pair`), `linring_analyze.py`. Tables: `tables/linring/`. Full family lists stay on the VM (`~/zruns/linring/`, about 100 MB) and in the local backup until the storage decision.

## 1. The question and the definitions

The canon (Canon 3 and Canon 6) reads a scale rooted on 1/1 as harmonics L to 2L of a virtual fundamental: L is the LCD, ratio r sits at slot rL − L, and the tatum is the fundamental's period. Re-rooting divides by a new root and octave-reduces, which gives each mode its own L. The question: which voicings share their difference tones with another voicing, and does that survive re-rooting?

Definitions agreed with the human:
- **Voicing**: a ratio set containing 1/1, on its own ring (L = exact LCD).
- **Linear-ring Z-pair**: same L, same multiset of *circular* slot distances, and not a rotation or reflection of each other on the ring (that would be the same rhythm). Circular distances are what make the canon's pair `1 10/9 9/8 89/72 3/2 7/4` ~ `1 9/8 89/72 5/4 3/2 29/18` (ring 72) match; plain distances do not.
- **Scale**: a set of pitch classes up to re-rooting, keyed by its odd-harmonic form. A pair is *within* (two rootings of one scale) or *cross* (two scales). Both were to be counted and listed separately.
- **Rooting table**: for every pair, all combinations of rootings (one mode of each scale, computed from every note, not limited to the gamut) that are again a linear-ring Z-pair.

Checks: `pair` reproduces the canon example exactly (ring 72; modes on 72, 80, 81, 89, 54, 63; a match only at the 1/1 rooting). Voicing counts equal the binomial counts (every voicing seen once). The disk-backed mode reproduces the in-memory counts exactly.

## 2. Two gamuts

**5-limit odd ≤ 123** (the D1 JI gamut, 35 ratios, 104 ring sizes, 5 to 10 notes, 77 million voicings): only **2 pairs**, both 6 notes, both only at the 1/1 rooting:
- ring 18: `1 10/9 4/3 25/18 3/2 5/3` ~ `1 4/3 25/18 3/2 5/3 16/9`
- ring 27: `1 10/9 32/27 4/3 40/27 5/3` ~ `1 4/3 40/27 5/3 16/9 50/27`

A prime-limit gamut puts few ratios on any one ring, so pairs (which need many onsets on one ring) are rare. The canon's own pair lives in the harmonic series (89, 29, 63 over 72), which led to the second gamut.

**Harmonic series** (the human's choice): rings 24, 36, 48, 60, 72, 80, 81, 90, 96, 120; every harmonic from L to 2L whose largest prime factor is at most 89.

| ring L | 24 | 36 | 48 | 60 | 72 | 80 | 81 | 90 | 96 | 120 |
|---|---|---|---|---|---|---|---|---|---|---|
| harmonics in gamut | 24 | 36 | 48 | 54 | 62 | 67 | 68 | 73 | 77 | 92 |
| 5 notes: rhythm pairs | 30 | 46 | 100 | 145 | 225 | 293 | 0 | 413 | 357 | 568 |
| 6 notes | 285 | 947 | 2,004 | 3,919 | 6,010 | 7,087 | 2,097 | 10,294 | 12,612 | 22,476 |
| 7 notes | 780 | 2,900 | 8,022 | 14,001 | 26,663 | 25,516 | 9,366 | 49,322 | 56,996 | 107,014 |

A rhythm pair is a pair of rhythms on the ring; each rotation that puts an onset on 1/1 is another voicing (another scale), so one rhythm pair gives many voicing pairs: **52,610** at 5 notes, **1,740,868** at 6, **9,117,317** at 7 (1.27 billion 7-note voicings searched). The simplest pairs (lowest odd limit) are in §6.

## 3. Finding 1: no pair is ever two rootings of one scale

Zero *within* pairs at every size, and this is forced. A mode's ring size keeps the odd part of its root's harmonic number (canon, Canon 3, fingerprint fact 1). Two different notes of one scale have different odd parts, so two rootings of one scale never sit on the same ring, and a linear-ring pair needs the same ring. Every linear-ring pair joins two different scales.

## 4. Finding 2: a pair almost never survives re-rooting, and when it does it is a line pair

| notes | pairs | match at one rooting | at two | at three or more |
|---|---|---|---|---|
| 5 | 52,610 | 52,610 | 0 | 0 |
| 6 | 1,740,868 | 1,739,218 | 1,650 | 0 |
| 7 | 9,117,317 | 9,111,751 | 5,566 | 0 |

The canon's "specific to the root" holds for 99.9% of pairs. The exceptions have one cause:

**Line pairs.** Call two voicings a *line pair* if their plain (not circular) slot distances agree: a Z-pair on the integer line, the 1-D homometric sets of the canon (`{0, 1, 4, 10, 12, 17}`) and of Rosenblatt and Seymour. Then:
- *Theorem.* A line pair is a linear-ring pair at its 1/1 rooting and again at its top note, on the ring of size h_top. Proof: both sets contain 0 and have the same largest distance, so they share their top note t. Re-rooting at t sends each harmonic h to slot 2h − h_t on a ring of h_t slots, so every plain distance d becomes 2d, and circular distances on the new ring depend only on d. The re-rooted sets therefore still match, however wide the set is.
- *Data.* 6 notes: all 890 line pairs in the data match again at the shared top note, and the other 760 two-rooting pairs are line pairs seen from the top (re-rooted at their top note; their second rooting is back at the line pair). 7 notes: 3,050 + 2,512 the same way, plus **4 exceptions** (two rootings, neither a line pair). No pair matches at three rootings.

So the linear ring and the JI level meet exactly in the line pairs: 1-D homometric sets on the harmonic numbers, which the factor law covers (one variable).

## 5. Finding 3: what makes the pairs: blocks of notes moved by a fraction of the cycle

For each rhythm pair, take the alignment sharing the most onsets: A = X + D_A, B = X + D_B (X shared). Then test whether D_B is D_A translated by one ring element h (a **block shift**; its order is L / gcd(h, L)). Remaining pairs were tested at other alignments and as two blocks with two shifts.

| | 5 notes | 6 notes | 7 notes |
|---|---|---|---|
| rhythm pairs | 2,177 | 67,731 | 300,580 |
| one block, shift by **half the ring** | **2,016 (93%)** | **52,334 (77%)** | **192,835 (64%)** |
| one block, a third of the ring | 21 | 2,956 | 74,294 (25%) |
| one block, a quarter | 93 | 2,861 | 18,440 |
| one block, larger order (5 to 60) | 0 | ~150 | ~5,000 |
| one block, visible at a smaller overlap (3 notes moved) | 0 | 6,665 | 8,695 |
| two blocks, two shifts | 47 | 2,761 | 1,552 |
| reflection of the moved block | 0 | 4 | 0 |
| **unexplained** | 0 | 0 | **8** (all ring 48) |

**Why a half-ring shift keeps the difference tones.** With A = X + D and B = X + (D + L/2): distances inside X and inside D do not change (D moves as a block), and each cross distance d between X and D becomes L/2 − d. So A ~ B exactly when the X-to-D cross distances form a multiset symmetric about L/4. In the group ring of Z_L this is the statement that XD* + DX* is unchanged by the order-2 element; a shift of order m needs the corresponding condition for that element. This is the ring analogue of the JI factor law (part of the set multiplied by a group element), but with a torsion element, which the JI lattice does not have.

**What it means for the ratios.** A slot shift of h adds h/L to the ratio (wrapping at the octave): a half-ring shift adds 1/2 (5/4 → 7/4, 7/6 → 5/3, 4/3 → 11/6), a third adds 1/3, a quarter adds 1/4. Linear-ring partners are made by moving a few notes by a simple fraction of the cycle: an arithmetic move in the time domain, not a multiplicative one in pitch, which is why the JI factor law does not produce them and why 5-limit gamuts barely have any.

**Ring size.** Shifts need elements of that order: ring 81 (odd) has no half-ring shift and no 5-note pairs at all (the canon's ring sweep: 5 onsets need a ring divisible by 2 or 5); ring 80 (not divisible by 3) has no third-ring shifts; the third-ring share grows with note count (1% → 4% → 25%).

## 6. Simplest pairs (candidates for listening)

| notes | ring | mechanism | pair (odd limit) |
|---|---|---|---|
| 5 | 24 | half-ring, 1 note | `1 9/8 7/6 11/8 5/3` ~ `1 9/8 4/3 11/8 11/6` (11) |
| 5 | 24 | third-ring, 2 notes | `1 13/12 9/8 3/2 11/6` ~ `1 13/12 4/3 11/8 3/2` (13) |
| 6 | 60 | half-ring, 1 note | `1 7/6 7/5 8/5 5/3 7/4` ~ `1 7/6 5/4 7/5 8/5 5/3` (7): 7/4 ↔ 5/4 |
| 6 | 24 | line pair | `1 13/12 9/8 17/12 5/3 15/8` ~ `1 13/12 31/24 4/3 7/4 15/8` (31) |
| 7 | 60 | half-ring, 1 note | `1 7/6 7/5 3/2 8/5 5/3 7/4` ~ `1 7/6 5/4 7/5 3/2 8/5 5/3` (7): the 6-note pair plus 3/2 |
| 7 | 60 | half-ring, 1 note | `1 7/6 6/5 3/2 5/3 7/4 9/5` ~ `1 7/6 6/5 5/4 3/2 5/3 9/5` (9) |
| 7 | 36 | third-ring, 2 notes | `1 10/9 7/6 5/4 13/9 5/3 16/9` ~ `1 10/9 5/4 4/3 13/9 16/9 11/6` (13) |
| 7 | 60 | line pair | `1 16/15 13/12 23/20 6/5 7/5 17/12` ~ `1 13/12 6/5 4/3 27/20 7/5 17/12` (27) |

On ring 60 the 7/4 ↔ 5/4 swap keeps working as notes are added (3/2 sits on the half-ring point and is fixed by the shift).

## 7. Open

- The 8 unexplained 7-note pairs on ring 48 (not unit multiples, not one or two block shifts; listed in the session log, reproducible with `other_probe.py`), and the 4 two-rooting 7-note pairs that are not line pairs.
- A general statement of the block-shift condition for order m, and whether every linear-ring pair is a group-ring factor flip (the ring analogue of Rosenblatt and Seymour, direction (c) in PROGRESS.md).
- 8 notes and more; other prime limits; whether pairs at lower odd limits appear at larger rings.
- Listening to §6.
