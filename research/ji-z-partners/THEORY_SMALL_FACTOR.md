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
