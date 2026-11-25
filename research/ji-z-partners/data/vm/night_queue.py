#!/usr/bin/env python3
"""night_queue.py (2026-11-25): the overnight enumeration queue without wasted runs.

Lessons from the 2026-11-24 night (PROGRESS "Overnight 7/8/9-note project"): wall-clock caps threw away
whole runs, "x15 per rung" guesses were wrong both ways, two chains on 16 cores slowed both, and the
wrapper printed success after crashes. So:
  - one enumeration at a time, nothing else heavy beside it;
  - each job is one (limit, q, note count);
  - forecast first: `zprod-rs --enum --count-only` gives the exact work (sets enumerated, hash slices
    included) in seconds; forecast = work / RATE (RATE calibrated on the VM against finished runs);
  - a job starts only if 1.5 x its forecast fits before --stop; a job marked pausable may start anyway;
  - no caps: at --stop the running job is killed and stays resumable (zprod-rs --resume, checkpoints
    in products.jsonl.progress after every batch slice); rerunning this script continues it;
  - success = exit 0 AND summary.csv in the run folder; anything else is logged as FAILED.
Restartable: finished jobs (summary.csv) are skipped, stopped ones resume.

usage: python3 night_queue.py --stop 2026-11-25T15:00Z [--rate 45e6] [--forecast-only]
log: ~/zruns/zprod/night_queue.out
"""
import argparse, datetime, os, re, signal, subprocess, sys, time

PR = [3, 5, 7, 11, 13, 17, 19, 23]
BASE = os.path.expanduser("~/zruns/zprod")
ZGEN = os.path.expanduser("~/zgen")
RS = os.environ.get("ZPROD_RS", os.path.join(ZGEN, "zprod-rs-bin14"))
MEMGB = os.environ.get("MEMGB", "16")
LOG = os.path.join(BASE, "night_queue.out")

# (limit, q, notes, pausable), in run order; see PROGRESS "Night queue (2026-11-25)"
JOBS = [
    (5, 177147, 7, False), (5, 177147, 8, False), (5, 177147, 9, False),
    (7, 2187, 8, False),
    (11, 729, 8, False),
    (17, 405, 7, False), (19, 405, 7, False),
    (7, 32805, 6, False), (11, 3645, 6, False), (19, 729, 6, False), (17, 1215, 6, False),
    # 02:40 Eastern, human: 6-8 notes matter most for composition ("run updated list"): the two ~6 h 9-note jobs
    # (13-limit q 405, 7-limit q 2,187; not started) move to a later night, replaced by 6-8-note jobs
    (13, 405, 8, False),
    (5, 295245, 6, False), (5, 295245, 7, False), (5, 295245, 8, False),
    (7, 59049, 6, False),
    (23, 405, 7, False),
    (17, 405, 8, False),
    (13, 2187, 6, False),
    (11, 6561, 6, False),
    (7, 3645, 8, False),
    (11, 2187, 7, False),
    (7, 19683, 7, True),
]
LATER = [(13, 405, 9), (7, 2187, 9)]  # 9-note jobs for a later night (forecasts 6.35 h, 6.15 h)


def log(msg):
    line = f"{datetime.datetime.now(datetime.timezone.utc):%H:%M}Z {msg}"
    print(line, flush=True)
    with open(LOG, "a") as fh:
        fh.write(line + "\n")


def tag(L, q, k):
    return f"n25_l{L}q{q}k{k}"


def cmd(L, q, k, out, extra):
    primes = [str(p) for p in PR if p <= L]
    # zprod_rs4.py = repo research/ji-z-partners/zprod_rs.py with --resume (the VM's zprod_rs.py is an old copy)
    return ["pypy3", os.path.join(ZGEN, "zprod_rs4.py"), "--fast", "--enumerate", "--zgen", os.path.join(ZGEN, "zgen_v4.py"),
            "--rs-bin", RS, "--primes", *primes, "--interval-odd", str(q), "--workers", "16", "--no-types",
            "--mem-gb", MEMGB, "--k", str(k), "--out", out, *extra]


def forecast(L, q, k):
    """exact work from a count-only run (own folder, never the run's); None if it fails (e.g. the 2,048 ceiling)"""
    out = os.path.join(BASE, tag(L, q, k) + "_count")
    p = subprocess.run(cmd(L, q, k, out, ["--count-only"]), capture_output=True, text=True)
    m = re.search(rf"k={k}: (\d+) sets .*?, (\d+) batches \((\d+) big groups in hash mode, (\d+) extra slices\), work (\d+) sets",
                  p.stdout + p.stderr)
    if p.returncode != 0 or not m:
        tail = (p.stdout + p.stderr).strip().splitlines()[-3:]
        log(f"{tag(L, q, k)} count FAILED (exit {p.returncode}): {' | '.join(tail)}")
        return None
    return {"sets": int(m.group(1)), "batches": int(m.group(2)), "big": int(m.group(3)), "slices": int(m.group(4)),
            "work": int(m.group(5))}


def done(L, q, k):
    return os.path.exists(os.path.join(BASE, tag(L, q, k), "summary.csv"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stop", required=True, help="UTC, e.g. 2026-11-25T15:00Z")
    # calibration 2026-11-25 (count-only work vs the 2026-11-24 run times): 9 notes 77-105 M/s, 7 notes 91 M/s,
    # 6 notes 46 M/s; forecasts use the slow side
    ap.add_argument("--rate", type=float, default=75e6, help="sets enumerated per second, 7+ notes (calibrated)")
    ap.add_argument("--rate6", type=float, default=40e6, help="the same for 6 notes")
    ap.add_argument("--forecast-only", action="store_true")
    a = ap.parse_args()
    rate = lambda k: a.rate6 if k == 6 else a.rate
    stop = datetime.datetime.fromisoformat(a.stop.replace("Z", "+00:00")).timestamp()
    log(f"night queue start: stop {a.stop}, rate {a.rate:.3g}/s (6 notes {a.rate6:.3g}/s), bin {RS}, mem {MEMGB} GB")
    fc = {}
    for L, q, k, _ in JOBS:
        if done(L, q, k):
            log(f"{tag(L, q, k)} already finished (summary.csv)")
            continue
        f = forecast(L, q, k)
        fc[(L, q, k)] = f
        if f:
            log(f"{tag(L, q, k)} forecast: {f['sets'] / 1e9:.2f} G sets, work {f['work'] / 1e9:.2f} G, {f['batches']} batches, "
                f"{f['big']} big groups, {f['slices']} extra slices -> {f['work'] / rate(k) / 3600:.2f} h")
    if a.forecast_only:
        return
    for L, q, k, pausable in JOBS:
        t = tag(L, q, k)
        f = fc.get((L, q, k))
        if done(L, q, k) or f is None:
            continue
        est = f["work"] / rate(k)
        left = stop - time.time()
        if left < 300:
            log(f"stop time reached; {t} and later jobs not started")
            break
        if 1.5 * est > left and not pausable:
            log(f"{t} skipped: 1.5 x forecast {1.5 * est / 3600:.2f} h > {left / 3600:.2f} h left")
            continue
        out = os.path.join(BASE, t)
        resumed = os.path.exists(os.path.join(out, "products.jsonl.progress"))
        log(f"{t} start{' (resume)' if resumed else ''}: forecast {est / 3600:.2f} h, {left / 3600:.2f} h left")
        t0 = time.time()
        with open(out + ".out", "a") as fh:
            p = subprocess.Popen(cmd(L, q, k, out, ["--resume"]), stdout=fh, stderr=subprocess.STDOUT, start_new_session=True)
            while p.poll() is None:
                if time.time() >= stop:
                    os.killpg(p.pid, signal.SIGKILL)
                    p.wait()
                    log(f"{t} PAUSED at the stop time after {(time.time() - t0) / 3600:.2f} h (resumable: rerun this script)")
                    return
                time.sleep(20)
        el = time.time() - t0
        if p.returncode == 0 and done(L, q, k):
            summ = open(os.path.join(out, "summary.csv")).read().strip().splitlines()[1:]
            log(f"{t} OK in {el / 3600:.2f} h (forecast {est / 3600:.2f} h): {' | '.join(summ)}")
        else:
            log(f"{t} FAILED: exit {p.returncode}, summary.csv {'present' if done(L, q, k) else 'missing'}, "
                f"{el / 3600:.2f} h (check {out}.out and sudo dmesg for an OOM kill)")
    log("night queue end")


if __name__ == "__main__":
    main()
