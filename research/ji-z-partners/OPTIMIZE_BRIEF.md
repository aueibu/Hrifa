# Brief: optimizing the JI Z-pair search (`zprod.py`)

For a model or person picking up the search optimization. Branch `ratio-rhythm-lib`. Read this, then the
files listed below, before changing anything.

## The problem
A JI pitch set (octave-equivalent) is a set of points in the prime lattice Z^n (exponents of 3, 5, 7, ...;
2 is dropped). Two sets are **Z-related** when they have the same multiset of intervals (differences of
points, up to sign) but neither is a transposition (translation) or inversion (negation) of the other.
Goal: list **all** Z-families of 6 to 16 notes in a given prime limit whose every internal interval has
odd limit <= q (the "intervallic odd limit", the principle the human chose; an interval 3^a 5^b 7^c has
odd limit max(product of its positive prime powers, product of its negative ones)). No pair exists below
6 notes.

## The math the search rests on
- **Factor law** (Rosenblatt & Seymour, "The Structure of Homometric Sets", SIAM J. Alg. Disc. Meth. 3,
  1982, Thms 2.3/2.4; PDF is with the human, not in the repo; `zfactor.py` docstring summarizes it):
  write a set as a polynomial P(x) = sum x^v. Two sets have the same interval content exactly when their
  polynomials are products of the same factors with some factors reversed (V*(x) = V(x^-1)), up to a
  monomial and sign. So every Z-pair is P = U*V, Q = U*V* with V not equal to its own reversal.
- **Newton polytopes** (Ostrowski): hull(U*V) = hull(U) + hull(V) (Minkowski sum). Hence for every
  direction f, width_f(V) <= width_f(P); and since every difference of two notes of P is an allowed
  interval, V - V and U - U lie in conv(D), D = allowed intervals (the odd <= q set, closed under negation).
- Lex-min of a product is the sum of the lex-mins, so fixing U's lowest point at 0 (coefficient 1,
  because V's lowest coefficient is +1 and P's is 1) builds each set once instead of at every position.

## What `zprod.py` does now (read the module docstring and `gen_V`, `search_U`)
1. Enumerate small signed factors V: shape "vp,vm" = vp plus terms (lowest at 0) and vm minus terms at
   lattice points inside the hull of the plus terms (minus terms must cancel). `--fast`: every difference
   of two plus points must be in conv(D).
2. For each V, a depth-first search over U (coefficients 0/1/2, optionally -1 with `--max-neg`) in
   lexicographic order of candidate points; a P or Q coefficient is checked as soon as its last
   contributor is decided (must be 0 or 1); with `--interval-odd q` every new P note is checked against
   all earlier notes (difference must be in D). `--fast`: U anchored at 0, candidates = lattice points of
   conv(D) that are lex >= 0, no gamut.
3. Keep P, Q with different canonical forms (translation/negation), group by interval content.
Runs in pypy3 with a multiprocessing pool fed in rolling chunks.

## Current performance (5-limit, q <= 729, all sizes 6-16)
- Before `--fast`: ~76 million factors for shapes 3,1 4,1 4,2 3,0 4,0 5,0; ~70 min on 14 cores.
- With `--fast`: ~188 thousand factors (counts per shape in PROGRESS.md / this session: 2,1: 22; 3,1:
  2,496; 3,2: 6,008; 4,1: 33,424; 4,2: 104,234; 3,0: 650; 4,0: 5,750; 5,0: 35,812); main pass about
  10 min on 2 cores. 7-limit q <= 243 with `--fast`: ~380 thousand factors (4,1: 52,212; 4,2: 62,468;
  5,0: 233,670). 7-limit q <= 729: shapes 4,x not counted yet (counting alone took > 5 min single-core).
- Sum-1 shapes (2,1 and 3,2) are run one note count at a time (an all-k run once found 0 of 22 seven-note
  families; cause not diagnosed, possibly the node budget).

## Known gaps (where results are incomplete)
- Families needing a factor shape that is not tried (5-term signed shapes 5,1 5,2 were left out for
  cost before `--fast`) or a -1 coefficient in U: 17 families missed at q <= 729 (3 of 1,155 at 12 notes,
  14 of 488 at 15), listed on the VM in `~/zruns/zprod/iol5_q729_compare.txt`.
- Factors stopped at the per-factor node budget (`--max-nodes`, listed in `stopped_factors.jsonl`).
- No proof that bounded factor shapes reach every family; coverage is empirical (checked against the
  exhaustive catalog).

## Ideas not tried yet (ranked by my guess of payoff)
1. Use the 17 missed families to learn which shapes / U coefficients are needed, then add them now that
   `--fast` makes 5-term shapes cheap.
2. Port the U search (the hot loop, `search_U.rec`) to a compiled language (C, Rust, or Cython under
   CPython); pypy is the current speed.
3. Inversion symmetry: P and its inversion are both built (factor ~2).
4. Duplicate work across factors: one family is reached from several V (different factorizations of P);
   restrict V (e.g. irreducible, or a canonical choice among a product's factors) if that can be made exact.
5. Prune U earlier: check pairwise U - U in conv(D) for nonzero U points (exact); order candidates so P
   coefficients become final sooner.
6. Diagnose the sum-1-shape all-k failure.

## Validation oracles (any change must reproduce these exactly)
- `exh5_all.jsonl` on the VM (`~/zruns/zprod/`, also inside `G:\My Drive\zruns\results.tgz`): the exhaustive
  5-limit catalog, notes odd <= 123, 6-16 notes, 30,065 families. `data/vm/iol_compare.py REF Q RUN...`
  checks that every catalog family with intervallic odd limit <= Q is found and none has an interval > Q.
- Tonight's slow run `~/zruns/zprod/l5q729/` (gamut odd <= 729, no `--fast`): the fast run
  `~/zruns/zprod/l5q729_fast/` must match it family for family (compare with `data/vm/union_fams.py
  OUT A.jsonl --ref B.jsonl`).
- 7-limit exhaustive counts: odd 27: 6 notes 3, 7 notes 0; odd 63: 6 notes 19; odd 75: 20, 2, 8 (6/7/8).
- `data/vm/verify_families.py ZGEN families.jsonl`: every family's members really share interval content.
- Local smoke test (CPython, seconds): `python zprod.py --zgen zgen.py --primes 3 5 --interval-odd 125
  --fast --k 6 --workers 4 --no-types --out DIR` finds exactly one family:
  `1 9/8 5/4 27/20 36/25 48/25` ~ `1 27/25 9/8 36/25 8/5 15/8`.

## Files
- `research/ji-z-partners/zprod.py` (the search), `zgen.py` (helpers: `gamut`, `canon`, `fingerprint`,
  `Run`, `member_record`, file format), `zfactor.py` (partner of a given set by factoring; needs sympy).
- `research/ji-z-partners/data/vm/`: `run_l5q729.sh` (ladder runner), `run_iol5.sh`, `run_7lim.sh`,
  `iol_compare.py`, `interval_odd.py` (score families by q), `union_fams.py`, `verify_families.py`,
  `contain.py` (families containing a given chord).
- `shell/arcs/ratio-rhythm/PROGRESS.md`: sections "Product search zprod.py", "zprod in 7-limit",
  "7-limit odd <= 123 finished; intervallic odd limit in zprod" (history, numbers, decisions).

## Environment and working rules
- Heavy runs go on the human's GCP VM: `ssh gvm` (16 vCPU, 29 GB, Spot: can be preempted; restart with
  `gcloud compute instances start instance-20261120-235803 --zone us-central1-b`). pypy3 (with sympy) at
  `/usr/local/bin/pypy3`; scripts in `~/zgen/`, results in `~/zruns/zprod/`; run long jobs in tmux.
  Another session may use a few cores (tmux `ipcat`). Bash reads a running script from disk: never
  overwrite a script on the VM that a running job uses; copy under a new name.
- Local Windows machine: CPython only (about 100x slower than pypy here), no sympy; fine for smoke tests.
- The human wants plain language, one recommendation at a time, cost before any run over a few minutes,
  no new runs without asking, American spelling, times in Eastern time. Commit on `ratio-rhythm-lib`.
