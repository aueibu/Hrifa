# Idea #1: is a small plus-only flipped factor always enough?

Question (OPTIMIZE_BRIEF.md, idea #1): does every Z-family have a factorization P = U*V, Q = U*V*
where V is plus-only with few terms (a 3-term chord) and U may have -1 coefficients?

**Answer: no, as stated (result type (b), with a proof).** A sharper conjecture that does match the
5-limit data is in section 3.

Notation: k = number of notes. P(1) = k (P has k terms, all coefficient 1). "Plus-only" = every
coefficient of V is positive.

## 1. Two facts (proofs, any prime limit, so 5-limit and 7-limit alike)

**Fact A (weight).** If V is plus-only, then V(1) divides k, and V(1) is at least 3.
Proof: P = U*V, so evaluating at x = 1 gives k = U(1)*V(1). V(1) > 0, so U(1) = k / V(1) is a whole
number. V(1) = 1 means V is a single term (a transposition). V(1) = 2 means V = 1 + x^a or 2x^a; then
V* is V times a monomial, so Q is a transposition of P, not a Z-partner.

**Fact B (corners).** Every corner point of V (a vertex of its convex hull) has coefficient +1 or -1;
the same holds for U. Proof: pick a direction in which that corner of V and some corner u of U are
the unique highest points. The highest point of P in that direction is then reached only once, with
coefficient U(u)*V(v), and it is a note of P, so the product is 1.

**Consequences.**
- A 3-term chord (coefficients 1, 1, 1) has V(1) = 3, so it is impossible whenever 3 does not divide k:
  every family with 7, 8, 10, 11, 13, 14 or 16 notes is a counterexample to "a 3-term chord always works".
- For prime k (7, 11, 13 notes), any plus-only flipped factor has V(1) = k, the whole weight of the set.
  So a plus-only V can never be small there; the small factor has to be the signed one (V(1) = 1,
  zprod shapes 2,1 and 3,2).
- In general the smallest possible plus-only weight is the smallest divisor of k that is 3 or more:
  3 for k = 6, 9, 12, 15; 4 for k = 8, 16; 5 for k = 10; 7 for k = 14; k itself for prime k.
- A 3-term plus-only V with a coefficient above 1 is possible only when its three points lie on one
  line (by Fact B the corners carry coefficient 1, so only a middle point can be larger).

## 2. What the exhaustive 5-limit catalog shows

Data: the exhaustive catalog `run_5lim_odd123/families.jsonl` (inside `G:\My Drive\zruns\results.tgz`,
30,065 families, notes odd <= 123). Test: `smallfactor.py` (exact; no sympy). For each family it looks
for V = 1 + s x^a + t x^b (s, t = +1 or -1) with P = U*V and Q (or its inversion) = U*V*, U any integer
polynomial, confirmed by exact division. Fixing a and s determines b from the identity
Q V = (monomial) P V*, so one pass over a is enough. `--terms m` does the same for m-term V.

**Intervallic odd limit q <= 729 (2,376 families, the set the brief's recipe covers):**

| smallest flipped factor | families | note counts | U needs |
|---|---|---|---|
| 3-term chord (shape 3,0) | 2,232 | 6, 9, 12, 15 | -1 coefficients: none 2,108; one 118; two 6 (all 6-note families need one) |
| 4 terms, shape 3,1 (V(1) = 2) | 82 | 8, 10, 12, 14, 16 | plus-only U, coefficients 0/1 |
| 4 terms, shape 4,0 | 39 | 12, 16 | plus-only U, coefficients 0/1 |
| 5-term chord (shape 5,0) | 23 | all 15 | U = 4 plus terms and 1 minus term |

No family in this range needs more than 5 terms. There are no 7-, 11- or 13-note families with q <= 729
in the catalog. Example of a family with no 3-term factor of either sign: catalog family 21
(8 notes, q = 243), V = 1 + x^(2,-2) - x^(2,-1) + x^(3,-1) in the catalog's lattice coordinates, with
U a plain 4-note set.

The 23 five-term cases also have the roles swapped: U itself is a 4,1 factor (its minus point is not a
corner, by Fact B) and the 5-term chord becomes a plain U. So they are reached by shape 4,1 with
U coefficients 0/1 as well.

**All q (whole catalog, 3-term test only):** every 6-note family has a 3-term chord. Every family with
7, 11 or 13 notes (82 in all) has only a signed 3-term factor (shape 2,1), never a chord, as Fact A
requires. 3,314 families have no 3-term factor of either sign (8 notes: 5, 10: 263, 12: 82, 14: 468,
15: 651, 16: 1,845). Only the 144 of them with q <= 729 were tested for 4 and 5 terms.

## 3. Sharper conjecture

**Conjecture S.** For 5-limit sets with intervallic odd limit q <= 729, every Z-family has a
factorization P = U*V, Q = U*V* in which V has at most 5 terms, all coefficients +1 or -1, using only
these shapes: 3,0 with U allowed up to two -1 coefficients, and 3,1, 4,0, 4,1 with U coefficients 0/1.

Status: true for all 2,376 families with q <= 729 in the catalog (section 2). Untested above q 729.
7-limit q <= 243 (2026-11-22, `data/vm/conj_s.sh` against the 6,233-family `--fast` ladder): as stated,
it misses one 16-note family (a plain 4-note chord times a 6-term factor with one -1). **Widened form
S'** (3,0 and 4,0 with U up to two -1; 3,1 and 4,1 with U 0/1) finds all 6,233. This is checked against
the ladder, not against an exhaustive 7-limit list (none exists at this q). 11-limit q <= 99
(2026-11-22): S' finds all 254 ladder families (9: 162, 12: 86, 15: 6).

Practical reading (for the brief, not yet run): the shape list 3,0 (signed U, `--max-neg 2`), 3,1, 4,0,
4,1 would drop 4,2, 5,0, 5,1 and 5,2 (4,2 and 5,0 alone are 140 thousand of the 188 thousand `--fast`
factors). That is
a prediction from the existence test, which allows any U; zprod's node budget and coefficient limits
still have to be checked by a real run.

## 4. Smallest experiments that would test it further (not run)

Local CPython, about 4 minutes in total if each note count is run separately (`--k 9`, `--k 12`, ...),
none over 2 minutes; on the VM in pypy3, under a minute:

```
python smallfactor.py FAMILIES.jsonl > sf3.txt
awk -F'\t' '$5=="NONE"{print $1}' sf3.txt > none3.txt
python smallfactor.py FAMILIES.jsonl --ids none3.txt --terms 4 > sf4.txt
grep NONE sf4.txt | cut -f1 > none4.txt
python smallfactor.py FAMILIES.jsonl --ids none4.txt --terms 5 --plus-only > sf5.txt
```

1. Above q 729: run this on the 5-limit catalog (FAMILIES = `run_5lim_odd123/families.jsonl`, or
   `~/zruns/zprod/exh5_all.jsonl` on the VM). Conjecture S fails above 729 if `sf5.txt` has any NONE
   line; then rerun step 5 without `--plus-only` (signed 5-term V, about 8 times slower).
2. 7-limit: the same commands on the 7-limit exhaustive family files on the VM (odd 27, 63, 75).
   In 3 dimensions `smallfactor.py` uses the bounding box instead of the exact hull for candidate
   points: still exact, just slower. Estimated time on the VM: a few minutes in pypy3.

## 5. Exact factor structure (2026-11-23): S' was asking the wrong question

`factor_struct.py` (sympy, any number of primes) factors member 0's polynomial P into irreducibles over
the integers and finds which factors are reversed in member 1 (Rosenblatt–Seymour), with no shape
assumption. Run on all nine proven lists (5-limit q ≤ 729 / 2,187 / 3,645, 7-limit q ≤ 243 / 315,
11-, 13-, 17-, 19-limit q ≤ 135; ~85,000 distinct families, the lists overlap) in under 2 minutes.
Every family reconstructs (U·V = P, U·V* = Q up to shift and sign). Tables: `tables/factor_struct/`.

1. **P is almost always a product of exactly two irreducible factors**: 100% at 11–19-limit q ≤ 135;
   98.4% at 5-limit q ≤ 3,645 (64,291 two, 1,052 three, 5 four); 99.8% at 7-limit q ≤ 315.
   With two factors the partner reverses one of them (reversing both = inverting the set).
2. **One factor is almost always a plain chord** (all coefficients 1): at 11–19-limit q ≤ 135 a
   3-note chord in 97–99% of families, else 4 or 5 notes. At 5- and 7-limit and higher q the
   plain-chord factor is sometimes the larger one (6–15 notes) and the other factor is small and signed.
3. **Only 7 distinct families have no plain-chord factor** (both factors signed), all 5-limit:
   13 notes q 3,645 (3 + 12 terms: a weight-1 2,1 factor and a 12-term factor with a coefficient 2),
   14 notes q 2,187 (4 + 11), 15 notes q 3,125 (7 + 7 twice, 4 + 12 with a −2), 16 notes q 3,125
   (6 + 6 twice). List: `tables/factor_struct/nochord.tsv`.
4. **Why S' broke:** S' fixed V as the small factor and limited U's coefficients. U is simply the other
   irreducible factor, whatever its signs; at higher q it has more −1 coefficients. The ladder's misses
   at 5-limit q 2,025–3,645 are mostly plain 3-, 4- or 5-note chords whose cofactor is signed.

**Reformulation (conjecture T):** for a JI Z-pair, P = A·B with A, B irreducible (rarely one more
factor), and the partner is A·B* (equivalently A*·B up to inversion). In almost every case one of A, B
is a plain chord of 3 to 5 notes. Questions this makes precise: (a) why so few irreducible factors?
(a generic 0/1 polynomial is irreducible; a Z-pair needs at least one non-self-reciprocal factor, and
two seems to be the economical case); (b) which chords A admit a B with A·B and A·B* both 0/1 (a
covering/tiling-type condition, checkable chord by chord); (c) the 7 exceptions as a separate family.
A generator built on this (choose a small chord A, solve for B) needs no limit on B's signs.

## 6. Plain form of T: almost every pair is a "chord sum" (2026-11-23 evening)

Notation as in the Harmonic Field Lab: a chord is written `a:b:c` (otonal) and its mirror
`1/(a:b:c)` (utonal). For a set A, A⁻¹ = {1/r : r in A} is its mirror; A·U = {a·u} is the product
set. U is "the second factor": any set of ratios, no order or other meaning.

`chordsum.py` (plain CPython, exact; 68 s on the 19-limit list) tests the plain form of T directly:
**P = A·U and Q = A⁻¹·U**, with A a small chord (coefficients all 1), U a plain set (coefficients
0/1) and no product a·u landing twice. The easy direction is standard (such pairs always share their
interval content); the data says the converse almost always holds. Call such a pair a **chord sum**.

Example (19-limit list, 9 notes, q 45; checked by multiplying out): A = 4:5:6 = {1, 5/4, 3/2},
A⁻¹ = 1/(4:5:6) = {1, 4/3, 8/5}, U = {1, 9/8, 7/4}. A·U = {1, 35/32, 9/8, 5/4, 21/16, 45/32, 3/2,
27/16, 7/4} (member 0 transposed by 16/9); A⁻¹·U = {1, 9/8, 7/6, 4/3, 7/5, 3/2, 8/5, 7/4, 9/5}
(member 1).

19-limit q <= 135 (proven list, 3,735 families): **3,718 (99.5%) are chord sums.**

| notes | chord sums | A, U | exceptions |
|---|---|---|---|
| 9 | 1,234 | 3-note chord, 3-note U (both factors are 3-note chords) | 7: 3-note chord, signed 5-term U |
| 12 | 1,547 | 3-note chord, 4-note U | 6: 3-note chord, signed 6-term U |
| 15 | 845 | 3-note chord, 5-note U | 2: 3-note chord, signed 7-term U |
| 16 | 92 | 4-note chord, 4-note U | none |
| 6 | 0 | | 1: 3-note chord, signed 4-term U |
| 10 | 0 | | 1: no 3- or 4-note chord factor |

Chord vocabulary (up to transposition and mirror): 587 chords; the top 8 cover half of all
(family, chord) hits, the top 82 cover 80%. 4:5:6 (same pitch classes as 3:4:5) alone is in 1,117
families; next 5:7:8, 6:7:10, 6:7:8, 9:10:12 (about 290 each). Distinct chords by highest prime:
5: 20, 7: 83, 11: 179, 13: 107, 17: 84, 19: 114.

Consequences: (a) a **constructive generator** (choose A, choose U, keep A·U and A⁻¹·U when no
product lands twice, they are not a transposition or mirror of each other, and they stay inside the q
limit) reaches 99.5% of this list without any search; (b) every catalog entry can be explained as
"A·U and A⁻¹·U" with A an `a:b:c` chord.

### 6.1 All nine proven lists (step 1, `chordsum_fs.py`, sympy, every grouping of the factors tried)

Run on the VM in about 90 s for all nine lists (`data/vm/cs_all.sh`; summaries and a q-band table in
`tables/chordsum/`). The 19-limit count agrees with `chordsum.py` (3,718).

| list | families | chord sums | share | (A, U) sizes 3x3 / 3x4 / 3x5 / 4x4 |
|---|---|---|---|---|
| 5-limit q <= 729 | 2,376 | 2,138 | 90.0% | 584 / 1,073 / 451 / 30 |
| 5-limit q <= 2,187 | 13,700 | 11,839 | 86.4% | 1,594 / 5,049 / 4,608 / 588 |
| 5-limit q <= 3,645 | 65,348 | 55,810 | 85.4% | 3,856 / 18,316 / 28,280 / 5,358 |
| 7-limit q <= 243 | 6,233 | 6,051 | 97.1% | 1,374 / 2,906 / 1,610 / 161 |
| 7-limit q <= 315 | 16,561 | 16,244 | 98.1% | 2,338 / 6,908 / 6,121 / 877 |
| 11-limit q <= 135 | 1,209 | 1,200 | 99.3% | 601 / 493 / 100 / 6 |
| 13-limit q <= 135 | 2,116 | 2,099 | 99.2% | 868 / 900 / 289 / 42 |
| 17-limit q <= 135 | 2,731 | 2,714 | 99.4% | 1,033 / 1,158 / 465 / 58 |
| 19-limit q <= 135 | 3,735 | 3,718 | 99.5% | 1,234 / 1,547 / 845 / 92 |

- **Chord sums occur only at 9, 12, 15 and 16 notes** (A and U of 3x3, 3x4, 3x5, 4x4). This is
  forced: a 2-note set is its own mirror (up to transposition), and a chord sum with a mirror-symmetric
  A or U is trivial (Q is P mirrored), so both factors need 3 or more notes, and k <= 16 leaves only
  these four products. Every 6-, 7-, 8-, 10-, 11-, 13- and 14-note family is something else.
- **The share falls with q at 5-limit** (q-band table: about 93% of the 9/12/15/16-note families up to
  q 729, 86-88% from q 730 to 3,645); at 7-limit it stays at 97-99% up to q 405; at 11- to 19-limit
  q <= 135 it is 99.3-99.6%.
- **What the other families are** (best valid split): mostly a 3-note chord whose cofactor has −1
  coefficients (5-limit q <= 3,645: 3,712 with a 7-term cofactor, 1,413 with 6 terms, 632 with 9 ...),
  then a small signed factor (V shape 3,1 or 4,1: weight 2 or 3) with a plain cofactor, which covers
  the 8-, 10- and 14-note families.
- **Chords A** (smallest `a:b:c` form up to transposition and mirror; 3:4:5 = 4:5:6 pitch classes):
  3:4:5 leads in every list; 5-limit q <= 3,645: 1,366 distinct (3:4:5, 5:6:9, 8:10:15, 5:8:9, 8:9:15
  ...); 7-limit q <= 315: 669 (3:4:5, 5:6:9, 6:7:9, 4:6:7, 4:5:7 ...); 19-limit q <= 135: 347
  (3:4:5 1,042, then 5:6:7, 4:5:7, 5:6:9, 4:6:7 at about 260-275 each; one best A per family).

### 6.2 Constructive generator (step 2, `chordgen.py`)

Two facts make generation direct. The intervals of A·U are the products D(A)·D(U), and D(A⁻¹) = D(A),
so A·U and A⁻¹·U pass the odd-limit test together. A product lands twice exactly when D(A) and D(U)
share an interval other than 1, again the same for both. So for each chord A (up to transposition and
mirror) let E_A = {d allowed : d·δ allowed for every δ in D(A), d not in D(A)}; every U containing 1
with all its intervals in E_A gives a valid pair, kept unless Q is a transposition or mirror of P.
Families are the unordered pair of members, each up to transposition and mirror.

**The generator lists every chord-sum family exactly**, so its output is a complete list of chord sums
(up to 16 notes) at any limit and q, and a lower bound for all Z-families. Check against all nine
proven lists (`data/vm/gen_check.sh`, `tables/chordsum/gen_check.out`): in every list the generated
families are exactly the families `chordsum_fs.py` marked (0 missed, 0 not in the list). Times
(Python, 16 workers): 11-limit q 135 5 s, 13-limit 18 s, 19-limit q 135 82 s (the enumeration proof
took 12,591 s), 5-limit q 3,645 53 s, 7-limit q 315 17 s.

**Against the highest ladder rungs** (`data/vm/gen_ladder.sh`, `tables/chordsum/gen_ladder.out`):

| rung | ladder families | chord sums generated | generation time | chord sums the ladder missed |
|---|---|---|---|---|
| 13-limit q <= 243 | 30,483 | 30,057 | 100 s | 0 |
| 17-limit q <= 243 | 47,044 | 46,460 | 349 s | 0 |
| 7-limit q <= 729 | 403,069 | 391,458 | 53 s | 0 |
| 11-limit q <= 405 | 283,162 | 280,969 | 101 s | **1** |

So at these rungs the chord sums are complete; anything the ladder still lacks is a leftover family
(6.3). The one miss (`tables/chordsum/gen_11q405.strays.jsonl`, checked independently: same interval
content, not a transposition or mirror): 9 notes, q 385, A = {1, 11/9, 4/3}, U = {1, 7/6, 35/18};
members {1, 7/6, 4/3, 11/9, 14/9, 35/27, 35/18, 77/54, 385/324} and {1, 7/6, 11/6, 11/9, 35/18,
77/54, 77/72, 385/216, 385/324}. 11-limit q <= 405 is therefore at least **283,163** families (that
rung had a capped widened step).

### 6.3 The leftover groups (families that are not chord sums)

`leftover_tab.py` (`tables/chordsum/leftover_groups.md`), from the best valid split P = V·U, Q = V*·U:

| list | leftover | G1 chord · signed U | G2 signed V · plain U | G3 both signed |
|---|---|---|---|---|
| 5-limit q <= 3,645 | 9,538 (14.6%) | 7,076 | 2,455 | 7 |
| 7-limit q <= 315 | 317 (1.9%) | 262 | 55 | 0 |
| 13- and 19-limit q <= 135 | 17 (the same 17) | 16 | 1 | 0 |

- G1: V is a 3-note chord (sometimes 4), U has −1 coefficients (5-limit: U of 7 terms 3,712, 6 terms
  1,413, 9 terms 632). All note counts, mostly 12 and 15.
- G2: V has one −1 (shapes 3,1 and 4,1), U plain: 5-limit 4,1 · 5 notes 1,038 (15 notes), 3,1 · 7
  notes 682 (14 notes), 3,1 · 8 or 5 notes; this is where all 8-, 10- and 14-note families live.
- G3: both signed: only the 7 families of section 5, item 3.
- No leftover at 13- to 19-limit q <= 135 uses 17 or 19.
- Working reading (hypothesis, not tested): both groups are products **with overlaps**. In a chord sum
  no product lands twice; in G1 (U = U+ − U−) P = A·U+ − A·U−, and in G2 (V = W − x^c, W plain)
  P = W·U − c·U: some products land twice and the doubled notes are removed. Overlaps need
  coincidences a·u = a'·u', which are common in the 2-D 5-limit lattice and rare with more primes:
  a candidate reason for 15% leftover at 5-limit, 2% at 7-limit, under 1% beyond.
- **Correction (6.4):** which factor is "flipped" is a free choice for these families (flipping the
  other one gives the mirror of Q), so G1/G2 above are better defined by size; 6.4 does that.

### 6.4 Holes and merges: what the leftover families are (`overlap.py`, all nine lists)

Every leftover split has one plain factor T and one signed factor S = S+ − S− (S+, S− plain). Then
P = T·S+ − T·S−: T stacked on every note of S+ (as a multiset), minus T placed on each note of S−.
Groups by size: **G1** = T is the smaller (a 3- to 5-note chord), **G2** = S is the smaller (one
or two minus notes). Results (`tables/chordsum/ov_*.sum`), the same for P and for Q in every family:

- **Always:** no note of the stack lands more than twice; every subtracted note lands on a note of the
  stack (never outside); no note is subtracted twice. 0 failures in every leftover family on all nine
  lists.
- **Hole (nearly all of G1):** the stack T·S+ has no doubled note, and T·S− (one whole copy of the
  chord, at a note not in S+) lies entirely inside it: every note of that copy is already spelled by
  other copies. P is the stack with a chord-shaped hole. All G1 families at 7- to 19-limit (7-limit
  q <= 315: 262 of 262; 13-, 17-, 19-limit q <= 135: 16 of 16), and 6,685 of 7,049 at 5-limit
  q <= 3,645. Commonest shapes (|T|, |S+|, |S−|): (3, 6, 1) 3,706, (3, 5, 1) 1,393, (3, 7, 2) 627.
- **Merge (nearly all of G2):** copies of a larger plain set T on a small S+ overlap; each doubled
  note meets one subtracted note and merges into one pitch (2 − 1 = 1), and the rest of the
  subtracted copy removes single notes (1 − 1 = 0). 5-limit q <= 3,645: about 2,280 of 2,473 G2
  families merge 1 to 3 notes; 7-limit q <= 315: 54 of 55. Commonest shapes (5, 4, 1) 1,038 (15
  notes: 5-note T on 4 plus notes and 1 minus), (7, 3, 1) 682 (14 notes), (8, 3, 1) 315, (5, 3, 1)
  304 (10 notes). This is where all 8-, 10- and 14-note families come from.
- **Neither (5-limit only):** 11 + 2 families at q <= 2,187 / 3,645 with both factors signed, and 5
  with a coefficient 2 in a factor (marked G1x/G2x).

Counts (G1 / G2 / other): 19-limit q <= 135 16 / 1 / 0 (the 10-note family, a merge); 7-limit
q <= 315 262 / 55 / 0; 5-limit q <= 729 128 / 110 / 0; q <= 2,187 1,199 / 660 / 2; q <= 3,645
7,049 / 2,473 / 16.

A useful fact for every generator below: if P = T·S is a 0/1 set, then Q = T·S* (or T*·S) is
automatically 0/1 too. Its coefficients are integers with sum T(1)S(1) = k and sum of squares equal to
the zero-lag autocorrelation of P, also k; an integer c with c² = c is 0 or 1.

### 6.5 Hole generator (`holegen.py`) and coverage

Hole: chord T (3 or 4 notes), set S+, one hole at the origin: P = T·S+ minus T, Q = T⁻¹·S+ minus T⁻¹.
Because T ⊂ T·S+, every note of T is a'·c with c in S+, so c is an interval of T: C = S+ ∩ D(T) is a
choice of T's own intervals whose stack covers T; the other notes r of S+ carry whole copies of T. The
search tries every covering C, then every r compatible with a fixed surviving note (complete; see the
script's docstring). The limit test is on the holed set only, so stacks whose full form breaks q are
found too.

**Exact on all nine proven lists** (`data/vm/hole_all.sh`, `tables/chordsum/hole_all.out`): the
generated families are exactly the hole families (one hole, 3- or 4-note chord) found by `overlap.py`,
0 missed, 0 not in the list; plus 4 / 15 / 40 families at 5-limit q <= 729 / 2,187 / 3,645 that
`overlap.py` had described by another split. 5-limit q 3,645: 5,880 families in 25 s; 19-limit q 135:
16 in 115 s.

**Coverage** (chord sums + one-hole families; `coverage.py`, `tables/chordsum/coverage.txt`):

| list | explained | left |
|---|---|---|
| 5-limit q <= 729 / 2,187 / 3,645 | 95.3% / 94.1% / 94.3% | 112 / 810 / 3,698 |
| 7-limit q <= 243 / 315 | 99.6% / 99.7% | 28 / 54 (all merges) |
| 11- to 19-limit q <= 135 | 99.9-99.97% | 1 each (the 10-note family, a merge) |

What is left: merges (G2: a small signed factor of 3 or 4 plus notes and one minus, on a 5- to 8-note
plain set: (5, 4, 1) 783 + 116, (7, 3, 1) 472 + 164, (5, 3, 1) 278, (8, 3, 1) 232 ... at 5-limit
q 3,645), holes with two or three holes ((3, 7, 2) 627, (3, 6, 2) 112, (3, 8, 3) 88), 5-note-chord
merges ((5, 5, 2) about 280), G2-shaped holes ((5, 4, 1) 139, (6, 3, 1) 38) and the 16 families of
6.4's last bullet. Next: a merge generator (choose the small signed factor, solve for the plain set),
and the hole generator widened to two or three holes and 5-note chords.

### 6.6 Merges, wider holes, and the residue: every proven family but 9 is built

**Merge generator = zprod-rs with a small signed factor and a plain second factor.** The Rust factor
search with `--shapes 3,1 4,1 4,2 --ucoeffs 0 1 --max-neg 0 --max-nodes 0` builds P = T·S, Q = T·S*
for a small S (3 or 4 plus points, 1 or 2 minus) and a plain T. With T plain, S's minus points must lie
inside the hull of its plus points (a minus corner would give a −1 corner of P), which is the rule the
search uses. Checked like the others (`merge_cmp.py`, `data/vm/merge_all.sh`,
`tables/chordsum/merge_all.out`): on all nine lists it builds every family that `overlap.py`
describes with such a small signed factor (5-limit q 3,645: 2,453 of 2,453, 17 s), 0 missed, nothing
outside the list.

**Wider constructions (5-limit; `data/vm/wide_all.sh`):** a plain 3-, 4- or 5-note chord times a factor
with up to 3 minus signs (`--shapes 3,0 4,0 5,0 --ucoeffs -1 0 1 --max-neg 3`: holes and merges with
several subtracted copies), and the weight-1 factors 2,1 / 3,2 times a plain set (the 7-, 11- and
13-note families). Then 3,0 with up to 4 minus signs at q 3,645.

**Coverage, union of all constructions, family by family** (`union_cov.py`,
`tables/chordsum/union_all.out`, `wide_all.out`):

| list | families | built | left |
|---|---|---|---|
| 7-, 11-, 13-, 17-, 19-limit (all seven lists) | 33,315 | 100% (chord sums, one hole, small signed factor) | 0 |
| 5-limit q <= 729 | 2,376 | 100% | 0 |
| 5-limit q <= 2,187 | 13,700 | 13,699 | 1 |
| 5-limit q <= 3,645 | 65,348 | 65,339 | 9 |

**The residue** (`tables/chordsum/residue_5q3645.jsonl`, members as ratios): 9 families, all 5-limit,
q 2,187 to 3,645, 13 to 16 notes: 5 whose two factors are both signed (G3) and 4 with a coefficient 2 in
a factor. They are the 7 no-plain-chord families of section 5 plus two 15-note families whose signed
factor has a coefficient 2. The q <= 2,187 one is the 14-note family among them.

**Summary of section 6.** Every Z-family in the nine proven lists except these 9 is P = T·S, Q = T·S*
(or T*·S) with T a plain set and S a small factor whose coefficients are +1 and at most four −1,
and in nearly all of them one of T, S is a 3- to 5-note chord:
- chord sum: both plain (85-99.5%);
- hole: plain chord, the other factor with minus notes, no doubled note, each minus note removes a whole
  chord copy that other copies already spell;
- merge: small signed factor, plain larger set; copies overlap, each doubled note becomes one pitch.
Each construction has an exact generator, checked against every proven list. Open: the residue as its
own family; why more limit (more primes) leaves less room for holes and merges; and a proof that the
constructions are complete, for which the lists are now the test bed.

### 6.7 The 9 residue families (`residue.py`, `tables/chordsum/residue_5q3645_factors.txt`)

Exact factorization: **all 9 are still exactly two irreducible factors, and the partner flips one of
them** (conjecture T's two-factor law holds for every proven family). Only "one factor is plain" fails.
Weights (F(1) of the two factors) multiply to k: 1·13, 2·7, 3·5 (x3), 1·15, 4·4 (x2).

| notes | family | factor terms | what fails |
|---|---|---|---|
| 13 | 2 | 3 + 12 | small weight-1 factor {1, −9/8, 27/16} times a set with one note counted twice (coefficient 2) |
| 15 | 19292 | 4 + 12 | weight-1 factor with a −2 times a set with three notes counted twice |
| 15 | 19520, 26954 | 3 + 10, 3 + 12 | plain 4:5:6 chord {1, 5/4, 3/2} times a signed factor with a coefficient 2 |
| 14 | 480 | 4 + 11 | both signed: {1, 9/8, 5/4, −3/2} and an 11-term factor with two −1 |
| 15 | 18591, 18592 | 7 + 7 | both signed, each 5 plus and 2 minus terms |
| 16 | 4363, 4374 | 6 + 6 | both signed, each 5 plus and 1 minus term |

So the residue is two kinds: (a) the same constructions with a note counted twice (a coefficient 2 in
one factor: 4 families), and (b) "balanced" pairs of two mid-sized signed factors (5 families). Both
need spread-out factors, hence large q: none below q 2,187; 1 at q <= 2,187, 9 at q <= 3,645.

Hunt for more (`resclass.py`, `data/vm/res_hunt.sh`): factor searches with the residue shapes (2,1 with
a doubled-note set; 3,0 with a signed factor containing a 2; 3,1, 5,1, 5,2 with signed second factors),
default node budget, 5-limit, then `resclass.py` keeps families with no plain × (+1/−1) split. At
q <= 3,645 it finds 7 of the 9 (misses two 15-note families with a coefficient ±2), so counts above are
lower bounds.
