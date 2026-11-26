# Every family has a kind (2026-11-26)

Each family in the nine proven lists is given exactly one kind, tested in this order: chord sum, hole, merge, wide, left over. "Found by" means a generator built the family and the family is in the list; the generators were checked against the lists in both directions (nothing built that is not in the list, `gen_check.out`). The counts come from `union_cov.py --classify` (`classify_all.sh`, VM, output `tables/chordsum/classify_all.out`, per-family files `class_<list>.tsv` on the VM).

## Definitions (a:b:c is a chord, 1/(a:b:c) its mirror, U a set of notes)

| Kind | Rule | Generator |
| --- | --- | --- |
| Chord sum | P = A·U and Q = A⁻¹·U, with A a 3- or 4-note chord and U a plain set (no minus signs). Every note of A is combined with every note of U. | `chordgen.py` |
| Hole | The same with one whole copy of the chord cut out of the product (one hole). | `holegen.py` |
| Merge | A small first factor with one minus sign (shapes 3,1 4,1 4,2: 3 or 4 plus-notes, 1 or 2 minus-notes) times a plain set; overlapping copies land on the same pitch and merge into one note. | zprod-rs `--shapes 3,1 4,1 4,2 --ucoeffs 0 1` |
| Wide | A 3-, 4- or 5-note chord times a factor with up to 3 minus signs (4 at 5-limit q 3,645), several holes or merges at once; and the small factors 2,1 and 3,2 times a plain set (the prime-size families: 7, 11, 13 notes). | zprod-rs `chordneg`, `chordneg4`, `s1` |
| Left over | None of the above found it. At 5-limit q ≤ 3,645 these are 9 families: both factors carry minus signs, or a note is counted twice (the paper's residue). | residue hunt |

## Table 1: families by kind in the nine proven lists

| List | Families | Chord sum | Hole | Merge | Wide | Left over |
| --- | --- | --- | --- | --- | --- | --- |
| 11-limit, q ≤ 135 | 1,209 | 1,200 | 8 | 1 | 0 | 0 |
| 13-limit, q ≤ 135 | 2,116 | 2,099 | 16 | 1 | 0 | 0 |
| 17-limit, q ≤ 135 | 2,731 | 2,714 | 16 | 1 | 0 | 0 |
| 19-limit, q ≤ 135 | 3,735 | 3,718 | 16 | 1 | 0 | 0 |
| 7-limit, q ≤ 243 | 6,233 | 6,051 | 154 | 28 | 0 | 0 |
| 7-limit, q ≤ 315 | 16,561 | 16,244 | 263 | 54 | 0 | 0 |
| 5-limit, q ≤ 729 | 2,376 | 2,138 | 130 | 103 | 5 | 0 |
| 5-limit, q ≤ 2,187 | 13,700 | 11,839 | 1,066 | 631 | 163 | 1 |
| 5-limit, q ≤ 3,645 | 65,348 | 55,810 | 5,880 | 2,404 | 1,245 | 9 |

The lists overlap (every list contains the lower ones of its limit), so the rows do not add up. Every row sums to its family count. Eight of the nine lists have no family left over except 1 at 5-limit q ≤ 2,187, which is one of the 9 left over at q ≤ 3,645 (0.014% of that list's 65,348 families).

## Table 2: kind by note count (5-limit, q ≤ 3,645)

| Kind | Notes |
| --- | --- |
| Chord sum | 9: 3,856; 12: 18,316; 15: 28,280; 16: 5,358 |
| Hole | 6: 8; 8: 10; 9: 196; 12: 1,554; 15: 3,706; 16: 406 |
| Merge | 10: 310; 12: 46; 14: 703; 15: 1,038; 16: 307 |
| Wide | 7: 4; 8: 2; 9: 8; 10: 6; 11: 3; 12: 144; 13: 2; 15: 1,060; 16: 16 |
| Left over | 13: 1; 14: 1; 15: 5; 16: 2 |

Chord sums only ever have 9, 12, 15 or 16 notes (3×3, 3×4, 3×5, 4×4). Merges are the main source of 10 and 14 notes (310 of 316 and 703 of 704). The sizes 7, 11 and 13 are all wide except one left-over family at 13 notes (weight 1 factors).

## Table 3: 6 to 8 notes are placements of a handful of shapes (exact builds, 23-limit, q ≤ 531,441)

| Notes | Shape | Families | Smallest q |
| --- | --- | --- | --- |
| 6 | type 1 | 6,043 | 125 |
| 7 | type 19 | 13,702 | 1,215 |
| 7 | type 1 on the line (1-D) | 1 | 531,441 |
| 8 | type 91 | 1,993 | 243 |
| 8 | type 94 | 7,821 | 2,187 |
| 8 | shape 8,3,2 (s1) | 639 | 19,683 |
| 8 | the new 2-D shape (c3) | 0 | above 531,440 |

## What this does and does not show

- It shows, family by family, that every family in these lists is built by a named rule, except 9 distinct families, all at 5-limit q ≤ 3,645.
- It does not prove that the kinds are all there is. The hunt for the residue found 63 families at 5-limit q ≤ 6,561, so the residue grows with q, and a new kind could appear further out.
- 6 to 8 notes are classified by the shapes in Table 3 (computer-assisted). The few 6- to 8-note families that also appear as holes or wide in Tables 1 and 2 only record that a generator builds them too.
- A family that two kinds both build is counted once, under the first kind in the order above.

Reproduce: `bash classify_all.sh` on the VM (needs the outputs of `cs_all.sh`, `hole_all.sh`, `merge_all.sh`, `wide_all.sh`).
