#!/usr/bin/env python3
"""zprod_rs.py: `zprod.py --fast --interval-odd q` with the factor generation and U search in Rust.

Same command line as zprod.py (the ladder scripts run it with ZPROD=zprod_rs.py). Runs the zprod-rs binary
(zprod-rs/src/main.rs: gen_V and search_U ported step for step, same node budget) for the raw products,
then groups them into families exactly as zprod.py does (_job and main) and writes the same files:
DIR/k<k>/families.jsonl, DIR/summary.csv, DIR/stopped_factors.jsonl, DIR/products.jsonl (raw).
The binary: --rs-bin, else $ZPROD_RS, else zprod-rs next to this script.
"""
import argparse, collections, csv, importlib.util, json, os, subprocess, sys, time


def load_zgen(path):
    spec = importlib.util.spec_from_file_location("zgen", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def write_families_fast(Z, run, fams, primes, Gsize):
    """as zprod.write_families_fast: zgen's families.jsonl format with null type fields"""
    with open(os.path.join(run.out, "families.jsonl"), "w") as fh:
        for i, (k, members, ex) in enumerate(fams, 1):
            fp = Z.fingerprint(members[0])
            rec = {"family": i, "notes": k, "primes": list(primes), "gamut_size": Gsize, "type": None,
                   "type_rank": None, "members": [Z.member_record(M, primes) for M in members],
                   "interval_classes": [str(min(Z.ratio(v, primes), 2 / Z.ratio(v, primes))) for v in fp],
                   "distinct_interval_classes": len(set(fp))}
            rec.update(ex)
            fh.write(json.dumps(rec) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zgen", required=True)
    ap.add_argument("--primes", type=int, nargs="+", required=True)
    ap.add_argument("--odd", type=int, default=0, help="ignored (no gamut with --fast)")
    ap.add_argument("--interval-odd", type=int, required=True)
    ap.add_argument("--fast", action="store_true", help="required (the only mode ported)")
    ap.add_argument("--k", type=int, nargs="+", required=True)
    ap.add_argument("--shapes", nargs="+", default=["2,1", "3,1", "3,2", "4,1", "4,2"])
    ap.add_argument("--vmax", type=int, default=0)
    ap.add_argument("--ucoeffs", type=int, nargs="+", default=[0, 1, 2])
    ap.add_argument("--max-neg", type=int, default=1)
    ap.add_argument("--max-nodes", type=int, default=2_000_000)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--count-only", action="store_true")
    ap.add_argument("--no-types", action="store_true")
    ap.add_argument("--hull-cache", default="", help="ignored (no hull computation)")
    ap.add_argument("--rs-bin", default="")
    ap.add_argument("--enumerate", action="store_true",
                    help="shape-free: every set whose pairwise differences are allowed, grouped by interval content")
    ap.add_argument("--mem-gb", type=float, default=6.0, help="with --enumerate: memory per pass (sets the pass count)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if not a.fast or a.vmax:
        ap.error("zprod_rs.py ports --fast only (and no --vmax)")
    Z = load_zgen(a.zgen)
    run = Z.Run(a.out)
    rs = a.rs_bin or os.environ.get("ZPROD_RS") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "zprod-rs")
    prod_path = os.path.join(a.out, "products.jsonl")
    cmd = [rs, "--primes", *map(str, a.primes), "--q", str(a.interval_odd), "--k", *map(str, a.k),
           "--shapes", *a.shapes, "--ucoeffs", *map(str, a.ucoeffs), "--max-neg", str(a.max_neg),
           "--max-nodes", str(a.max_nodes), "--threads", str(a.workers), "--out", prod_path]
    if a.count_only:
        cmd.append("--count-only")
    if a.enumerate:
        cmd += ["--enum", "--mem-gb", str(a.mem_gb)]
    t0 = time.time()
    p = subprocess.Popen(cmd, stderr=subprocess.PIPE, text=True)
    for line in p.stderr:
        run.say(line.rstrip())
    if p.wait() != 0:
        run.say(f"ERROR: zprod-rs exited with {p.returncode}")
        sys.exit(1)
    if a.count_only:
        return
    # group products into families exactly as zprod._job / main
    allf = collections.defaultdict(set)
    stopped = []
    with open(prod_path) as fh:
        for line in fh:
            rec = json.loads(line)
            if not rec["complete"]:
                stopped.append(rec["v"])
            for P, Q in rec["prods"]:
                cp, cq = Z.canon([tuple(x) for x in P]), Z.canon([tuple(x) for x in Q])
                if cp == cq:
                    continue
                fp = Z.fingerprint(cp)
                allf[(len(cp), fp)].update((cp, cq))
    if stopped:
        with open(os.path.join(a.out, "stopped_factors.jsonl"), "w") as fh:
            for V in stopped:
                fh.write(json.dumps(V) + "\n")
        run.say(f"WARNING: {len(stopped)} factors hit --max-nodes {a.max_nodes}; their U search is incomplete "
                f"(listed in stopped_factors.jsonl)")
    Gsize = len(Z.gamut(a.primes, a.odd or a.interval_odd))
    rows = []
    for k in a.k:
        fams = [(k, [list(m) for m in sorted(ms)], {"mechanism": "zprod U*V, V flipped"})
                for (kk, fp), ms in sorted(allf.items()) if kk == k and len(ms) >= 2]
        sub_run = Z.Run(os.path.join(a.out, f"k{k}"))
        if a.no_types:
            write_families_fast(Z, sub_run, fams, a.primes, Gsize)
        else:
            Z.write_families(sub_run, fams, a.primes, Gsize, {})
        sizes = collections.Counter(len(f[1]) for f in fams)
        rows.append({"k": k, "families": len(fams), "family_sizes": dict(sorted(sizes.items()))})
        run.say(f"k={k}: {len(fams)} families (members per family: {dict(sorted(sizes.items()))})")
    with open(os.path.join(a.out, "summary.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["k", "families", "family_sizes"])
        w.writeheader(); w.writerows(rows)
    run.say(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
