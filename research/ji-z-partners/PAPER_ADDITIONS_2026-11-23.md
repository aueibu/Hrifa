# Paper additions, 2026-11-23 (ready to paste)

For "Searching for Z-Related Sets in Just Intonation" (https://claude.ai/artifact/JCY2JBw5f6LghMGgRpsjPe, rev 26).
This session could read the doc but not edit it, so the additions are here. Each heading says where it goes.

---

## → Timeline: new subsection after Phase 13

### Phase 14 · Highest q for every limit, and where the factor recipe breaks (2026-11-23)

- **Shape census** on the five complete lists: every family has a flipped factor of at most 5 terms, all of the amended S' shapes; 3-term factors only up to q 75 in every limit, 4-term from about q 99, 5-term only at 7-limit above q 135 and 5-limit above q 405.
- **Faster enumerator** (hybrid, bin11): 17-limit q ≤ 135 in 1,065 s (v2 1,302 s), identical lists. Bitsets widened to 2,048 vertices (bin12), validated on 5-limit q 729 and 7-limit q 243.
- **Overnight push** (Rust ladder for reach, shape-free enumeration underneath as proof). Two corrections to the ladder were needed:
    1. **Node budget.** The ladder stops a factor's search after 2 million nodes. At q ≥ 243 these stops hid real families (11-limit q 243: 8; 13-limit q 243: 51; 7-limit q 405: 83). Every rung now reruns its stopped steps with no budget.
    2. **Signed U.** At 5-limit q 2,025–2,187 the enumeration found 6 families the ladder (no stops) missed: 5 are a plain 3-note chord flipped, with U needing three −1 coefficients (the recipe allowed two); 1 is a 3,1 factor with U needing two −1 (the recipe used plain U). At q 3,645 the widened ladder still missed 25: plain 4- and 5-note chords with U needing two or three −1.
- **Conclusion:** as q grows, the flipped factor V stays a small plain chord; what grows is the negative mass of U. The amended S' (plain U for 3,1 and 4,1; at most two −1 for 3,0 and 4,0) holds to 5-limit q ≈ 2,000 and fails above.

---

## → Results: new table after "All limits at q ≤ 135"

**Highest q reached (2026-11-23).** Proven = shape-free enumeration (with the ladder matching where both ran). Ladder = factor search with no node budget and widened signed-U steps: a lower bound, since above about q 2,000 (5-limit) the ladder misses families whose U needs more −1 coefficients.

| Limit | Proven complete to | Families (proven) | Ladder: fully checked | Families | Ladder: highest q | Families (lower bound) |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | q ≤ 3,645 | 65,348 | — | — | q ≤ 3,645 | (= proven) |
| 7 | q ≤ 315 | 16,561 | q ≤ 405 | 57,123 | q ≤ 729 | 403,069 |
| 11 | q ≤ 135 | 1,209 | q ≤ 243 | 15,479 | q ≤ 405 | 283,156 |
| 13 | q ≤ 135 | 2,116 | q ≤ 243 * | 30,483 | q ≤ 243 | 30,483 |
| 17 | q ≤ 135 | 2,731 | — | — | q ≤ 243 | 47,044 |

"Fully checked" = every ladder step rerun with no node budget and the widened signed-U steps added (* 13-limit: the 5,1/5,2 step still has 15,205 stopped factors). "Highest q" rungs ran on the 2026-11-23 deadline without those checks (5,1/5,2 step stopped by hand at 7-limit q 729, 11-limit q 405 and 17-limit q 243; budget-stopped factors not all rerun), so their counts are lower bounds twice over. No 7-, 11- or 13-note pair appears in any of these rungs except at 5-limit (above).

By size (ladder, lower bounds): 7-limit q ≤ 729 (with the widened signed-U steps, no budget; they added 4,435 families to the base ladder's 398,634): 6: 9, 8: 4, 9: 17,928, 10: 200, 12: 106,602, 14: 416, 15: 233,618, 16: 44,292. 11-limit q ≤ 405: 6: 6, 8: 2, 9: 19,357, 10: 56, 12: 89,258, 14: 67, 15: 149,864, 16: 24,546. 17-limit q ≤ 243 (with widened steps, budget on: +213): 6: 2, 8: 1, 9: 7,827, 10: 20, 12: 19,006, 14: 4, 15: 17,729, 16: 2,455. 13-limit q ≤ 243: 6: 2, 8: 1, 9: 5,847, 10: 19, 12: 13,166, 14: 4, 15: 10,247, 16: 1,197.

5-limit q ≤ 3,645 by size: 6: 8, 7: 4, 8: 12, 9: 4,060, 10: 316, 11: 3, 12: 20,060, 13: 3, 14: 704, 15: 34,089, 16: 6,089. **The first 11-note pair** appears at 5-limit q ≤ 2,187 (one family) and **the first 13-note pairs** at q ≤ 3,645 (three).

**7 notes.** Proven by enumeration: 7-limit q ≤ 2,187 has 5 families (q 1,215: the harmonic minor ~ harmonic major mode-4 pair; **q 1,701: a new 7-limit pair** `1 28/27 32/27 14/9 27/16 16/9 63/32` ~ `1 28/27 9/8 32/27 21/16 27/16 63/32`; three at q 2,187). 11-limit q ≤ 1,215: only the q 1,215 pair. 13-limit q ≤ 729: none.

---

## → Results: shape census (new paragraph + table)

**Smallest flipped factor (census).** For each family in the five complete lists, the smallest V found (3-term search first, then 4 and 5 terms). The shape follows the note count: 6, 9, 12 and 15 notes take a plain 3-note chord (3,0); 16 notes a plain 4-note chord (4,0); 8, 10 and 14 notes take 3,1.

| List | 3 terms | 4 terms | 5 terms | Share of 9-note sets in a pair |
| --- | --- | --- | --- | --- |
| 5-limit q ≤ 729 | 2,232 | 121 (4,0 39; 3,1 82) | 23 (4,1) | 8.1e-4 |
| 7-limit q ≤ 243 | 6,037 | 184 (4,0 166; 3,1 18) | 12 (4,1) | 9.2e-5 |
| 11-limit q ≤ 135 | 1,202 | 7 | 0 | 3.7e-5 |
| 13-limit q ≤ 135 | 2,073 | 43 | 0 | 1.6e-5 |
| 17-limit q ≤ 135 | 2,672 | 59 | 0 | 8.3e-6 |

(3,1 counted as 4 terms. By q band, every limit has only 3-term factors up to q 75.)

---

## → Limits and open questions: replace the S' bullet

- **Conjecture S' fails at high q.** The amended form holds in every range enumerated up to 5-limit q ≈ 2,000, 7-limit q 315 and 11/13/17-limit q 135, but at 5-limit q 2,025–3,645 there are families whose only small factors need U with three or more −1 coefficients (shapes 3,0, 4,0, 5,0) or signed U on 3,1. A bound that may survive: V is a plain chord of at most 5 notes (or 3,1 / 4,1) with U unrestricted in sign. Five families at 5-limit q 3,125–3,645 still lack even that (no ≤ 5-term factor found with U up to three −1); open.
