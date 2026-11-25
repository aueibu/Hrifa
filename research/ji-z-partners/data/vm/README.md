# VM scripts

Current (2026-11-25):

- `night_queue.py`: the job runner. One enumeration at a time, each job forecast from an exact `--count-only` count, no time caps, resumable at the stop time. It runs as `~/zgen/night_queue.py` on the VM and logs to `~/zruns/zprod/night_queue.out`.

On the VM, `~/zgen` holds only the current files and a `README.txt`:

- `zprod-rs-bin14`, built from `../../zprod-rs/src/main.rs`
- `zprod_rs4.py`, which is `../../zprod_rs.py`
- `zgen_v4.py`
- `verify_families.py`
- `usesp.py`

`old/` holds every earlier script (the 2026-11-20 to 2026-11-24 chains, ladders, probes and wrappers). The VM copies are in `~/zgen/old/`. They are kept for the record. Don't run them: several point at superseded wrappers or binaries. For example, `enum_run.sh` calls a `zprod_rs.py` copy that has no `--enumerate`. PROGRESS entries before 2026-11-25 name them as `data/vm/<file>`; they now live in `data/vm/old/<file>`.
