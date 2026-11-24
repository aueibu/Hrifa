#!/usr/bin/env python3
"""k6789_more.py: overnight 2026-11-24 follow-up queue, one enumeration at a time.

Human: "should the chains not share cores (serialization?) and should the 75 min cap stay?", then "lets do that
followed by a 7 note. If it speeds things up (but doesn't waste work time) you can also just expand the q values for 5
to 11 limit."

Waits for the k789_proofs.sh chain (tmux k789p) to end, then, one run at a time:
  A. retry every rung that chain capped at 75 min, alone, k 6 7 8 9, up to CAP s (2 h);
  B. 6-note-only pass, PASS_S s in total (1 h): each limit from the rung above its proven 6-note reach;
  C. 7-note-only pass, PASS_S s in total: the same for 7 notes;
  D. combined climb, k 6 7 8 9, one rung at a time per limit, round-robin, up to CAP s per run.
In B and C (runs of minutes) limits 5, 7 and 11 skip every other rung: a proof at q covers every q below it, so the
skipped rungs are not needed. D keeps single rungs (each rung costs 15-20x the one below; repeating the lower one is
cheap, a capped jump would waste hours). Reach is read from every chain's log, so nothing proven is redone. A limit
stops in a phase at its first capped, OOM-killed or failed run. No run starts after STOP_UTC; no run's cap reaches past
HARD_UTC.
usage: python3 k6789_more.py >> ~/zruns/zprod/k6789_more.out 2>&1
"""
import datetime, glob, os, re, signal, subprocess, time

Z = os.path.expanduser("~/zruns/zprod")
QS = [135, 243, 405, 729, 1215, 2187, 3645, 6561, 10935, 19683, 32805, 59049, 98415, 177147, 295245, 531441, 885735,
      1594323, 2657205, 4782969]
PR = {5: "3 5", 7: "3 5 7", 11: "3 5 7 11", 13: "3 5 7 11 13", 17: "3 5 7 11 13 17", 19: "3 5 7 11 13 17 19",
      23: "3 5 7 11 13 17 19 23"}
JUMP = {5, 7, 11}
CAP = int(os.environ.get("CAP", 7200))
PASS_S = int(os.environ.get("PASS_S", 3600))
PASS_RUN_CAP = int(os.environ.get("PASS_RUN_CAP", 1800))
STOP = os.environ.get("STOP_UTC", "15:30")
HARD = os.environ.get("HARD_UTC", "16:45")
# proofs from earlier sessions (7 notes only): en7_7q2187, en7_11q1215, en7_13q729
EARLIER = {7: {7: 2187, 11: 1215, 13: 729}}
KS_OF = {"k789": (7, 8, 9), "k6": (6,), "k6789": (6, 7, 8, 9), "k6only": (6,), "k7only": (7,)}


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def at(hhmm):
    h, m = map(int, hhmm.split(":"))
    return now().replace(hour=h, minute=m, second=0, microsecond=0)


def log(msg):
    print(f"{now():%H:%M} {msg}", flush=True)


def reach():
    """proven q per (k, limit): the largest finished run that included k, from every chain's .run files"""
    r = {k: dict(EARLIER.get(k, {})) for k in (6, 7, 8, 9)}
    for f in glob.glob(os.path.join(Z, "*.run")):
        m = re.match(r"(k789|k6|k6789|k6only|k7only)_l(\d+)q(\d+)\.run$", os.path.basename(f))
        if not m or "ENUM DONE" not in open(f, errors="replace").read():
            continue
        L, q = int(m.group(2)), int(m.group(3))
        for k in KS_OF[m.group(1)]:
            r[k][L] = max(r[k].get(L, 0), q)
    return r


def capped_rungs():
    out = {}
    for line in open(os.path.join(Z, "k789.out")):
        m = re.search(r"k789_l(\d+)q(\d+) (CAPPED|OOM|error)", line)
        if m:
            out[int(m.group(1))] = int(m.group(2))
    return out


def run(prefix, ks, L, q, cap):
    tag = f"{prefix}_l{L}q{q}"
    cap = min(cap, int((at(HARD) - now()).total_seconds()))
    if cap < 300:
        return "late"
    env = dict(os.environ, ZPROD_RS=os.path.expanduser("~/zgen/zprod-rs-bin12"), MEMGB="16")
    log(f"{tag} start (k {ks}, cap {cap}s)")
    t = time.time()
    with open(os.path.join(Z, tag + ".run"), "w") as fh:
        p = subprocess.Popen(["bash", os.path.expanduser("~/zgen/enum_run.sh"), PR[L], str(q), tag, "none", ks],
                             cwd=Z, env=env, stdout=fh, stderr=subprocess.STDOUT, start_new_session=True)
        while p.poll() is None:
            if time.time() - t > cap:
                os.killpg(p.pid, signal.SIGTERM)
                time.sleep(5)
                try:
                    os.killpg(p.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                log(f"{tag} CAPPED after {cap}s: limit {L} stops in this phase")
                return "capped"
            time.sleep(10)
    outp = os.path.join(Z, tag + ".out")
    out = open(outp, errors="replace").read() if os.path.exists(outp) else ""
    if "exited with -9" in out:
        log(f"{tag} OOM-killed: limit {L} stops in this phase")
        return "failed"
    if re.search(r"error|panicked", out, re.I):
        log(f"{tag} error: {re.search(r'.*(error|panicked).*', out, re.I).group(0)[:160]}")
        return "failed"
    summary = " ".join(l.strip() for l in open(os.path.join(Z, tag + ".run")) if re.match(r"k\d+: enumeration|.*ENUM DONE", l))
    print(f"  {summary} ({int(time.time() - t)}s)", flush=True)
    return "done"


def next_rung(q_done, L, jump):
    later = [q for q in QS if q > q_done]
    if not later:
        return None
    return later[1] if (jump and L in JUMP and len(later) > 1) else later[0]


def climb(prefix, ks, kkey, budget, run_cap, jump, skip=()):
    """round-robin over limits from each limit's proven reach for kkey; stops at the budget or STOP_UTC"""
    end = time.time() + budget
    r = reach()[kkey]
    nextq = {L: next_rung(r.get(L, 0), L, jump) for L in PR if L not in skip}
    nextq = {L: q for L, q in nextq.items() if q}
    log(f"phase {prefix}: k {ks}, budget {budget}s, start rungs {nextq}")
    while nextq:
        for L in sorted(list(nextq)):
            left = end - time.time()
            if now() > at(STOP) or left < 120:
                log(f"phase {prefix}: {'stop time' if now() > at(STOP) else 'budget'} reached")
                return
            q = nextq[L]
            res = run(prefix, ks, L, q, min(run_cap, int(left)))
            if res == "done":
                n = next_rung(q, L, jump)
                if n:
                    nextq[L] = n
                else:
                    del nextq[L]
            else:
                del nextq[L]
    log(f"phase {prefix}: every limit stopped")


def main():
    log("waiting for the k789 chain (tmux k789p) to end")
    while subprocess.run(["tmux", "has-session", "-t", "k789p"], capture_output=True).returncode == 0:
        time.sleep(60)
    capped = capped_rungs()
    log(f"k789 chain ended; capped {capped}; reach {reach()}")
    failed = set()
    for L, q in sorted(capped.items()):  # A
        if now() > at(STOP):
            break
        if run("k6789", "6 7 8 9", L, q, CAP) != "done":
            failed.add(L)
    climb("k6only", "6", 6, PASS_S, PASS_RUN_CAP, True)  # B
    climb("k7only", "7", 7, PASS_S, PASS_RUN_CAP, True)  # C
    climb("k6789", "6 7 8 9", 9, 10 ** 9, CAP, False, skip=failed)  # D
    log(f"K6789 MORE DONE; reach {reach()}")


if __name__ == "__main__":
    main()
