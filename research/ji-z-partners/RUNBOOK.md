# Running zgen.py on the VM (pypy)

`zgen.py` is one self-contained pure-Python file with no numpy or sympy. Copy it to the VM and run it with pypy3.

```bash
pypy3 zgen.py selftest --workers 3          # ~1-2 min under pypy; must print SELFTEST PASSED
pypy3 zgen.py estimate --primes 3 5 7 --odd 27 --k 6 7 8 --workers 3 --mem-gb 12
```

`estimate` measures speed on the machine it runs on and suggests `--shards` for your RAM. Under CPython in the dev container it measured ~45k subsets/s per core. pypy is typically 3–5× faster.

## Suggested runs, in order

| # | command | what it answers | dev-container CPython estimate (3 workers) |
|---|---|---|---|
| 1 | `exhaustive --primes 3 5 7 --odd 27 --k 6 7 --out run_7lim_odd27_k67` | every 6- and 7-note 7-limit pair: does the single 6-note type still cover them all, or does 7 add new types? | ~2 + 15 min |
| 2 | `directsum --primes 3 5 7 --odd 27 --sizes 3x3 --out run_7lim_odd27_ds33` | all 7-limit chord-on-roots 9-note pairs | minutes |
| 3 | `exhaustive --primes 3 5 7 --odd 27 --k 8 --shards 2 --out run_7lim_odd27_k8` | 8-note 7-limit pairs | ~3 h (less under pypy) |
| 4 | `exhaustive --primes 3 5 7 --odd 45 --k 6 --out run_7lim_odd45_k6` | 6-note pairs in a deeper 7-limit gamut | ~10 min |
| 5 | `directsum --primes 3 5 7 --odd 27 --sizes 3x4 --out run_7lim_odd27_ds34` | 12-note chord-on-roots pairs | check the shape-pair count in the log first; may take hours |

Each run writes `families.jsonl` (same schema as the earlier cloud run, plus `type`, `type_rank`, `mechanism`, and `A` and `B` for direct sums), `types.jsonl` (one shape per geometric type), `summary.csv` and `run.log`. Tar the run folders and send them back.

`type` groups families that are the same pattern under any change of lattice basis. The pattern can be the same along 3&5, 3&7, 5&7, or with commas as axes.
