# Handoff: JI Z-family database (zgen.py)

Branch `ccr-c1437645-6fhmnm`, folder `research/ji-z-partners/`. This file replaces the earlier chat context. Read it before doing anything.

## How the user works (important)

- **Heavy compute runs on the user's GCP VM** (`austin@instance-2`, `/home/austin`, 8 vCPU, pypy3), not in your session. You write and fix `zgen.py`, give exact commands, and read results the user pastes or uploads.
- **Don't run Python here unless asked.** "Do not run code" was said explicitly mid-session. Later it was relaxed to allow non-Python commands such as `tar`, `git` and `awk`. Writing code is fine; the user tests it on the VM.
- **Give complete commands, one per block.** The user pastes them, and two commands pasted on one line caused an error once.
- **Musical meaning matters.** Explain what results mean for listening and composing, not just the math. Be direct and brief, and state cost and runtime before suggesting a run.
- **Commit and push only finished files.** An unfinished `k6types.py` was committed once after the user said stop; don't repeat that.

## What the project is

JI Z-pairs: two pitch sets (octave-reduced ratios, as points in the prime-exponent lattice) with the **same multiset of intervals**, where neither is a transposition or inversion of the other. Background is in the user's "Ratio rhythm: timeline and canon" doc (Canon 6, level 1 = JI level). The original 5-limit cloud run, odd limit 123 and 1–16 notes, was validated and analysed in `ANALYSIS.md`. That file predates everything below.

**Key fact.** Read each set as a Laurent polynomial. Every family is P = U·V with partner Q = U*·V or U·V* (one factor mirrored), where both products have 0/1 coefficients. Two kinds:
- **Both factors plain note sets** ("chord on roots", A⊕B with partner A⊕(−B)). Sizes 9, 12, 15, 16 only. This is `zgen.py directsum`.
- **One factor has minus terms** ("cancellation"). Every family at 6, 7, 8, 10, 11, 13 and 14 notes. Handled by `zgen.py types` (enumerate cancellation patterns symbolically, giving geometric TYPES) and `zgen.py place` (lay each type into a gamut).

## zgen.py modes (pure Python, run under pypy3)

| mode | what it does |
|---|---|
| `exhaustive` | every k-subset of an odd-limit gamut; disk-backed (`--buckets`), resumable, exact class counts |
| `directsum` | chord-on-roots families directly (`--sizes 3x3 3x4 3x5 4x4`) |
| `types --shape a,b,c ...` | all cancellation types for U (a notes) × V (b plus terms incl. 0, c minus terms); pruned DFS. Since 2026-11-20 each shape × flip (U/V) search runs in its own process (`--workers`, default all cores but one): 2 searches per shape, so `13,2,1` uses 2 cores and `7,3,1 7,4,2 14,2,1` uses 6. Output is merged in fixed order and is identical to `--workers 1`. |
| `place --types FILE` | lay types into a gamut; `--allow-rank3` for 3-parameter types (slow in big gamuts) |
| `estimate`, `selftest` | cost estimate; regression test against the 5-limit odd-123 run |

The latest file's md5 is whatever is committed. The VM copy was verified at `04c007b3954ad06b7fe51079073fc9e3`, the commit "prune repeated equation systems".

## Results so far (6–8 notes)

✓ means an exhaustive search gave the same count. Unmarked entries are placements, which matched in every case that was checked.

| gamut | notes in gamut | 6 notes | 7 notes | 8 notes |
|---|---|---|---|---|
| 5-limit odd 123 | 35 | 7 ✓ | 8 ✓ | 10 ✓ |
| 7-limit odd 27 | 45 | 3 ✓ | 0 ✓ | – |
| 7-limit odd 63 | 79 | 19 ✓ | 2 | 7 |
| 7-limit odd 75 | 85 | 20* | 2* | 8 ✓ |
| 7-limit odd 123 | 99 | 26 | 22 | 20 |
| 11-limit odd 123 | 225 | 56 | 40 | 29 |

\* Exhaustive only (old `ji_zsets.py` run in `_Ideas/Rhythm-As-Pitch/run_7lim_odd75`); not yet placed.

**Placement vs exhaustive cost (7-limit odd 75, 8 notes, 2026-11-20, local PC, 12 threads, PyPy).** The exhaustive `ji_zsets.py` run needed over 306 min for pass 1 alone, plus passes 2 and 3, and left 129 GB of working files. `zgen.py types --shape 4,3,1 8,2,1` took 19 s (102 types), and `zgen.py place --primes 3 5 7 --odd 75 --allow-rank3 --workers 11` took 9 s. Both found the same 8 families (types 91: 5 and 92: 3), identical interval content family by family. That is at least a 650× speedup (28 s against 306+ min) with no scratch disk use.

Types: 6 notes, shape `3,3,1`, gives 2 types and only 1 geometric shape (the canon's 1-D {0,1,4,10,12,17} pair is that shape on a single axis). 7 notes, `7,2,1`, gives 24 types: 18 rank-1, plus rank-2 types 19, 20 and 21 occur in JI. 8 notes, `4,3,1` and `8,2,1`, gives 102 types: 91, 92, 95 and 96 occur in 5-limit.

Musical findings so far:
- prime substitution: the same shape exists along 3&5, 3&7 and 3&11;
- 7-note pairs need deep stacks of fifths (81); stacked 7s don't compensate (odd 63 has only 2);
- partners share 3 of 6 notes, and all 15 intervals are distinct at 6 notes;
- the "chord on roots" mirror is the main usable device at 9+ notes.

No listening tests yet.

## Next step in progress (commands were given; results not reported yet)

Factor shapes read off the 5-limit run (from `tables/factors.csv`):

| notes | shapes | expected placement count in 5-limit odd 123 |
|---|---|---|
| 11 | `11,2,1` | 25 (all) |
| 10 | `5,3,1 10,2,1 5,4,2` | 292 of 295 |
| 13 | `13,2,1` | 41 of 49 |
| 14 | `7,3,1 7,4,2 14,2,1` | 495 of 498 |

Commands, per size:

```
pypy3 zgen.py types --shape <shapes> --out uvN
pypy3 zgen.py place --primes 3 5 --odd 123 --types uvN/uv_types.jsonl --workers 7 --allow-rank3 --out place_5lim_odd123_kN
```

Then 7-limit and 11-limit odd 123 placements as for k = 6–8.

## Known gaps to build next

1. **U with a doubled note** (coefficient 2, then cancelled by a minus term): shapes like 8,2,1 at 9 notes, 9,2,1 at 10, and 11/12/13/14/15,2,1 at 12–16. That's 14 families missing across sizes 10–14. Needs `_Sym` and `_dfs` to allow a U coefficient of 2.
2. **Both factors signed:** 8 families in 5-limit across sizes 10, 14, 15 and 16.
3. **`_joint_basis_coords` returns None for rank > 3,** so such types are silently dropped. Rank-3 placement costs |intervals|³: fine at 5-limit (120 intervals), impossible at 11-limit (2,430). Needs pruning, for example placing the basis vectors one at a time and checking partial points against the interval set.
4. Large `types` searches (13,2,1 and 14,2,1) may be slow. If so, add the w-label symmetry group and memoize Q-stage checks.
5. `k6types.py` is a dead first attempt (it doesn't work); `zgen.py types` replaces it. Ask the user before deleting it.
6. `ANALYSIS.md` is out of date: it predates zgen and the results above. Update it when the database settles.

## Files

- `zgen.py`: the tool. `RUNBOOK.md` has older run notes (exhaustive and directsum).
- `zcore.py`, `validate.py`, `brute.py`, `analyze.py`, `factor.py`, `figures.py`, `edo.py` and `subgamut.py` are the analysis of the original 5-limit archive. `zcore.canon` is 2-D only; use `zgen.canon` for higher limits.
- `tables/factors.csv` and `tables/families.csv` exist only in the old container (gitignored, regenerable with `analyze.py` + `factor.py` from the original `results.tgz`).
- VM outputs, such as `place_*`, `run_*` and `uv*/`, live in `/home/austin` on the VM. None of them are in the repo.
