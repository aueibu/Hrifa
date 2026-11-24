#!/usr/bin/env python3
"""k6789_more.py: overnight 2026-11-24 follow-up queue, one enumeration at a time (human: "should the chains not share
cores ... should the 75 min cap stay?").

Waits for the k789_proofs.sh chain (tmux k789p) to end, reads its log, then:
  1. retries every rung that chain capped at 75 min, alone, with up to CAP s (default 2 h);
  2. climbs every limit that is still going to the next q rung, round-robin.
Every run enumerates 6, 7, 8 and 9 notes together (enum_run.sh, bin12, 16 GB). A limit stops at its first capped,
OOM-killed or failed run. No run starts after STOP_UTC; a run's cap never reaches past HARD_UTC (the VM's scheduled
shutdown is later).
usage: python3 k6789_more.py >> ~/zruns/zprod/k6789_more.out 2>&1
"""
import datetime, os, re, signal, subprocess, sys, time

Z = os.path.expanduser("~/zruns/zprod")
QS = [135, 243, 405, 729, 1215, 2187, 3645, 6561, 10935, 19683, 32805, 59049, 98415, 177147]
PR = {5: "3 5", 7: "3 5 7", 11: "3 5 7 11", 13: "3 5 7 11 13", 17: "3 5 7 11 13 17", 19: "3 5 7 11 13 17 19",
      23: "3 5 7 11 13 17 19 23"}
CAP = int(os.environ.get("CAP", 7200))
STOP = os.environ.get("STOP_UTC", "15:30")
HARD = os.environ.get("HARD_UTC", "16:45")


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def at(hhmm):
    h, m = map(int, hhmm.split(":"))
    return now().replace(hour=h, minute=m, second=0, microsecond=0)


def log(msg):
    print(f"{now():%H:%M} {msg}", flush=True)


def chain_state():
    """last fully enumerated q and capped q per limit, from the k789 chain's log"""
    done, capped = {}, {}
    for line in open(os.path.join(Z, "k789.out")):
        m = re.search(r"k789_l(\d+)q(\d+) ENUM DONE", line)
        if m:
            done[int(m.group(1))] = max(done.get(int(m.group(1)), 0), int(m.group(2)))
        m = re.search(r"k789_l(\d+)q(\d+) (CAPPED|OOM|error)", line)
        if m:
            capped[int(m.group(1))] = int(m.group(2))
    return done, capped


def run(L, q):
    tag = f"k6789_l{L}q{q}"
    cap = min(CAP, int((at(HARD) - now()).total_seconds()))
    if cap < 600:
        return "late"
    env = dict(os.environ, ZPROD_RS=os.path.expanduser("~/zgen/zprod-rs-bin12"), MEMGB="16")
    log(f"{tag} start (cap {cap}s)")
    t = time.time()
    with open(os.path.join(Z, tag + ".run"), "w") as fh:
        p = subprocess.Popen(["bash", os.path.expanduser("~/zgen/enum_run.sh"), PR[L], str(q), tag, "none", "6 7 8 9"],
                             cwd=Z, env=env, stdout=fh, stderr=subprocess.STDOUT, start_new_session=True)
        while p.poll() is None:
            if time.time() - t > cap:
                os.killpg(p.pid, signal.SIGTERM)
                time.sleep(5)
                try:
                    os.killpg(p.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                log(f"{tag} CAPPED after {cap}s: limit {L} stops")
                return "capped"
            time.sleep(20)
    out = open(os.path.join(Z, tag + ".out"), errors="replace").read() if os.path.exists(os.path.join(Z, tag + ".out")) else ""
    if "exited with -9" in out:
        log(f"{tag} OOM-killed: limit {L} stops")
        return "failed"
    if re.search(r"error|panicked", out, re.I):
        log(f"{tag} error: {re.search(r'.*(error|panicked).*', out, re.I).group(0)[:160]}")
        return "failed"
    summary = " ".join(l.strip() for l in open(os.path.join(Z, tag + ".run")) if re.match(r"k\d+: enumeration|.*ENUM DONE", l))
    print(f"  {summary} ({int(time.time() - t)}s)", flush=True)
    return "done"


def main():
    log("waiting for the k789 chain (tmux k789p) to end")
    while subprocess.run(["tmux", "has-session", "-t", "k789p"], capture_output=True).returncode == 0:
        time.sleep(60)
    done, capped = chain_state()
    log(f"k789 chain ended; done {done}; capped {capped}")
    nextq = {}
    for L in PR:
        if L in capped:
            nextq[L] = capped[L]  # retry first, alone, with the longer cap
        else:
            last = done.get(L, 0)
            later = [q for q in QS if q > last]
            if later:
                nextq[L] = later[0]
    while nextq:
        for L in sorted(list(nextq)):
            if now() > at(STOP):
                log(f"stop time {STOP} reached")
                nextq.clear()
                break
            q = nextq[L]
            r = run(L, q)
            if r == "done":
                later = [x for x in QS if x > q]
                if later:
                    nextq[L] = later[0]
                else:
                    del nextq[L]
            else:
                del nextq[L]
    log("K6789 MORE DONE")


if __name__ == "__main__":
    main()
