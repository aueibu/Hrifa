# Running zgen.py on the VM (pypy)

`zgen.py` is one self-contained pure-Python file with no numpy or sympy. Copy it to the VM and run it with pypy3.

```bash
pypy3 zgen.py selftest --workers 3          # ~1-2 min under pypy; must print SELFTEST PASSED
pypy3 zgen.py estimate --primes 3 5 7 --odd 27 --k 6 7 8 --workers 3 --mem-gb 12
```

`estimate` measures speed on the machine it runs on and suggests `--buckets` for your RAM. Under CPython in the dev container it measured ~45k subsets/s per core. pypy is typically 3–5× faster.

## How exhaustive mode uses disk

Each k runs in three passes:

1. **Pass 1** enumerates every subset but keeps exactly one representative per set class. It writes an 8-byte fingerprint hash per class into bucket files under `--workdir`, which defaults to `OUT/work`. Disk use is about 8 bytes × set classes.
2. **Pass 2** sorts each bucket and flags fingerprints that occur twice. RAM is about 24 bytes × classes/buckets per merge worker under pypy, so raise `--buckets` to lower it.
3. **Pass 3** recomputes the flagged fingerprints exactly and writes the families.

**Resume.** Re-running the same command with the same `--out` skips finished pass-1 jobs, and the counts stay exact. The self-test checks this. Bucket files are deleted after each k unless you pass `--keep-work`. Each k's families are also checkpointed to `OUT/families_k{k}.json`.

`estimate` prints minutes, disk and a `--buckets` value for your RAM. Its class counts come from a sample and run high, roughly 1.5× on the 5-limit test, so treat them as an upper bound.

### 7-limit, odd limit 123 (99 notes)

Estimated here with CPython at 7 workers. Expect pypy to be roughly 3–5× faster.

| k | subsets | CPython time | disk | buckets for 16 GB |
|---|---|---|---|---|
| 6 | 1.1·10⁹ | ~2.5 h | ~3 GB | 2 |
| 7 | 1.5·10¹⁰ | ~43 h | ~56 GB | 21 |
| 8 | 1.7·10¹¹ | ~800 h | ~840 GB | not practical |

## Suggested runs, in order

| # | command | what it answers | dev-container CPython estimate (3 workers) |
|---|---|---|---|
| 0 | `exhaustive --primes 3 5 7 --odd 123 --k 6 --buckets 2 --out run_7lim_odd123_k6` | the k = 6 geometry test at full depth | ~2.5 h CPython |
| 1 | `exhaustive --primes 3 5 7 --odd 27 --k 6 7 --out run_7lim_odd27_k67` | every 6- and 7-note 7-limit pair: does the single 6-note type still cover them all, or does 7 add new types? | ~2 + 15 min |
| 2 | `directsum --primes 3 5 7 --odd 27 --sizes 3x3 --out run_7lim_odd27_ds33` | all 7-limit chord-on-roots 9-note pairs | minutes |
| 3 | `exhaustive --primes 3 5 7 --odd 27 --k 8 --buckets 4 --out run_7lim_odd27_k8` | 8-note 7-limit pairs | ~3 h (less under pypy) |
| 4 | `exhaustive --primes 3 5 7 --odd 45 --k 6 --out run_7lim_odd45_k6` | 6-note pairs in a deeper 7-limit gamut | ~10 min |
| 5 | `directsum --primes 3 5 7 --odd 27 --sizes 3x4 --out run_7lim_odd27_ds34` | 12-note chord-on-roots pairs | check the shape-pair count in the log first; may take hours |

Each run writes `families.jsonl` (same schema as the earlier cloud run, plus `type`, `type_rank`, `mechanism`, and `A` and `B` for direct sums), `types.jsonl` (one shape per geometric type), `summary.csv` and `run.log`. Tar the run folders and send them back.

`type` groups families that are the same pattern under any change of lattice basis. The pattern can be the same along 3&5, 3&7, 5&7, or with commas as axes.
