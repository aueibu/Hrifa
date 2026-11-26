#!/usr/bin/env python3
"""Build data/manifest_2026-11-24.json: one entry per run of the overnight 6/7/8/9-note project (2026-11-24).

Reads the two archives of that night (k6789_proofs.tar.xz: shape-free enumerations; k6789_ladders.tar.xz: factor-search
ladders), one folder per run inside. Run names: k6_l<L>q<Q> (6 notes), k789_l<L>q<Q> (7, 8, 9), k6789_l<L>q<Q>
(6 to 9), k6only_l<L>q<Q> (6), k7only_l<L>q<Q> (7); ladders k6L_l<L>q<Q> (6), k789L_l<L>q<Q> (7, 8, 9).

Status of an enumeration run: "proven" only when its folder has summary.csv (the wrapper writes it at the end) and
its .out has no panic or OOM kill; otherwise "capped or failed" (a capped run was killed by the chain; a failed one
panicked: 19-limit q 1,215 is past the enumerator's 2,048-interval ceiling; zprod_rs.py still reports exit 0 then).
Ladder runs are lower bounds; steps without summary.csv hit their 45-min cap (their part is missing).
usage: python make_manifest_k6789.py ARCHIVE_DIR > manifest_2026-11-24.json
The archives: gs://project-f5757a43-c874-4e0b-8f8-ji-zpairs/archive_2026-11-24/ (both) and, for the proofs,
research/ji-z-partners/data/proven/k6789_proofs.tar.xz (repo). VM originals: ~/zruns/zprod/<name>/.
"""
import collections, json, os, re, sys, tarfile

BUCKET = "gs://project-f5757a43-c874-4e0b-8f8-ji-zpairs/archive_2026-11-24"
PRIMES = [3, 5, 7, 11, 13, 17, 19, 23]
KS = {"k6": "6", "k789": "7-9", "k6789": "6-9", "k6only": "6", "k7only": "7", "k6L": "6", "k789L": "7-9"}


def scan(path):
    runs = collections.defaultdict(lambda: {"files": set(), "per": {}, "out": ""})
    with tarfile.open(path, "r:xz") as t:
        for m in t:
            mm = re.match(r"((k6|k789|k6789|k6only|k7only|k6L|k789L)_l(\d+)q(\d+))(/.*|\.out|\.run)?$", m.name)
            if not mm:
                continue
            r = runs[mm.group(1)]
            rest = mm.group(5) or ""
            r["files"].add(rest)
            if m.isfile() and rest == ".out":
                r["out"] = t.extractfile(m).read().decode("utf-8", "replace")
            fm = re.match(r"/(?:k(\d+)/families\.jsonl|union_k(\d+)\.jsonl)$", rest)
            if fm and m.isfile():
                k = int(fm.group(1) or fm.group(2))
                r["per"][k] = sum(1 for line in t.extractfile(m) if line.strip())
    return runs


def main():
    d = sys.argv[1]
    md5 = dict(reversed(line.split()) for line in open(os.path.join(d, "MD5SUMS")) if line.strip())
    out = []
    for arc, method in (("k6789_proofs.tar.xz", "enumeration"), ("k6789_ladders.tar.xz", "ladder")):
        for name, r in sorted(scan(os.path.join(d, arc)).items(), key=lambda kv: (kv[0].split("_")[0], int(re.search(r"_l(\d+)", kv[0]).group(1)), int(re.search(r"q(\d+)$", kv[0]).group(1)))):
            pre, L, Q = re.match(r"(\w+?)_l(\d+)q(\d+)$", name).groups()
            L, Q = int(L), int(Q)
            if method == "enumeration":
                ok = "/summary.csv" in r["files"] and not re.search(r"panicked|exited with -9", r["out"])
                status = "proven" if ok else "capped or failed (not a proof)"
                note = ""
            else:
                status = "lower bound"
                missing = sorted(f.strip("/").split("/")[0] for f in r["files"]
                                 if re.fullmatch(r"/\w+", f) and f + "/summary.csv" not in r["files"])
                note = ("steps without a result (45-min cap): " + ", ".join(missing)) if missing else ""
            out.append({"name": name, "limit": L, "primes": [p for p in PRIMES if p <= L], "q": Q, "note_counts": KS[pre],
                        "method": method, "status": status, "families_per_size": {str(k): n for k, n in sorted(r["per"].items())},
                        "families": sum(r["per"].values()) if (method == "ladder" or status == "proven") else None,
                        "note": note, "archive": f"{BUCKET}/{arc}", "md5": md5[arc], "vm_path": f"~/zruns/zprod/{name}/"})
    json.dump({"created": "2026-11-24", "project": "6/7/8/9-note Z-pairs, limits 5..23 (PROGRESS: Overnight 7/8/9-note project)",
               "bucket": BUCKET, "runs": out}, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
