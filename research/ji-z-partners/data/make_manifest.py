#!/usr/bin/env python3
"""Build data/manifest.json: one entry per kept result list (D1 hub, decided 2026-11-23).

Reads the archive folder (proven/*.tar.xz, ladder/*.tar.xz, MD5SUMS), counts families per note count
from the files inside each archive, and adds what each run is (method, primes, q, status, tool).
usage: python make_manifest.py ARCHIVE_DIR > manifest.json
The archives live in gs://project-f5757a43-c874-4e0b-8f8-ji-zpairs/archive_2026-11-23/ (all) and, for the
proven lists, in research/ji-z-partners/data/proven/ (repo). The VM keeps the uncompressed originals in
~/zruns/zprod/<name>/ (never deleted)."""
import json, os, re, sys, tarfile

BUCKET = "gs://project-f5757a43-c874-4e0b-8f8-ji-zpairs/archive_2026-11-23"
L = {5: [3, 5], 7: [3, 5, 7], 11: [3, 5, 7, 11], 13: [3, 5, 7, 11, 13], 17: [3, 5, 7, 11, 13, 17],
     19: [3, 5, 7, 11, 13, 17, 19]}
BIN = {"bin9": "zprod-rs enumerator v2 (f89df52)", "bin11": "zprod-rs hybrid enumerator (cf55666)",
       "bin12": "zprod-rs, bitsets to 2,048 vertices (6de4de9)", "lad": "zprod-rs ladder via zprod_rs.py (bin11, recipe of run_ladder_fast.sh)"}
# name: (limit, q, sizes, method, status, tool, note)
RUNS = {
    "ev2_5q729": (5, 729, "6-16", "enumeration", "proven", "bin9", ""),
    "e5q2187_on": (5, 2187, "6-16", "enumeration", "proven", "bin12", ""),
    "e5q3645_on": (5, 3645, "6-16", "enumeration", "proven", "bin12", "the widened ladder misses 25 of these (signed cofactors)"),
    "ev2_7q243": (7, 243, "6-16", "enumeration", "proven", "bin9", ""),
    "e7q315_on": (7, 315, "6-16", "enumeration", "proven", "bin12", ""),
    "ev2_11q135": (11, 135, "6-16", "enumeration", "proven", "bin9", ""),
    "en13q135": (13, 135, "6-16", "enumeration", "proven", "bin9", ""),
    "en17q135": (17, 135, "6-16", "enumeration", "proven", "bin9", ""),
    "e19q135_on": (19, 135, "6-16", "enumeration", "proven", "bin12", ""),
    "en7_7q2187": (7, 2187, "7", "enumeration", "proven", "bin11", "7-note sets only"),
    "en7_11q1215": (11, 1215, "7", "enumeration", "proven", "bin11", "7-note sets only"),
    "en7_13q729": (13, 729, "7", "enumeration", "proven", "bin11", "7-note sets only; no family"),
    "l5q729_rs_v6": (5, 729, "6-16", "ladder", "equals proven ev2_5q729", "lad", ""),
    "l7q243_rs_v6": (7, 243, "6-16", "ladder", "equals proven ev2_7q243", "lad", ""),
    "l11q135_rs": (11, 135, "6-16", "ladder", "equals proven ev2_11q135", "lad", ""),
    "l13q135_rs": (13, 135, "6-16", "ladder", "equals proven en13q135", "lad", ""),
    "l17q135_rs": (17, 135, "6-16", "ladder", "equals proven en17q135", "lad", ""),
    "l19q135_on": (19, 135, "6-16", "ladder", "equals proven e19q135_on", "lad", ""),
    "l5q1215_on": (5, 1215, "6-16", "ladder", "fully checked (no budget stops, widened steps)", "lad", "inside proven e5q3645_on"),
    "l5q2187_on": (5, 2187, "6-16", "ladder", "equals proven e5q2187_on after widened steps", "lad", ""),
    "l5q3645_on": (5, 3645, "6-16", "ladder", "lower bound: 65,343 of the proven 65,348 (union includes the signed-U 4,0 / 5,0 / 4,1 test steps; the widened recipe alone gives 65,323)", "lad", ""),
    "l7q315_on": (7, 315, "6-16", "ladder", "equals proven e7q315_on", "lad", ""),
    "l7q405_on": (7, 405, "6-16", "ladder", "lower bound, fully checked (no budget stops, widened steps)", "lad", ""),
    "l7q729_on": (7, 729, "6-16", "ladder", "lower bound; 5,1/5,2 step stopped by hand, base steps not rerun without budget", "lad", ""),
    "l11q243_on": (11, 243, "6-16", "ladder", "lower bound, fully checked", "lad", ""),
    "l11q405_on": (11, 405, "6-16", "ladder", "lower bound; 5,1/5,2 step stopped by hand, budget stops remain", "lad", ""),
    "l13q243_on": (13, 243, "6-16", "ladder", "lower bound, fully checked except the 5,1/5,2 step", "lad", ""),
    "l17q243_on": (17, 243, "6-16", "ladder", "lower bound; 5,1/5,2 step stopped by hand, budget stops remain", "lad", ""),
}


def counts(path):
    per = {}
    with tarfile.open(path, "r:xz") as t:
        for m in t:
            mm = re.search(r"(?:/k(\d+)/families\.jsonl|/union_k(\d+)\.jsonl)$", m.name)
            if not mm or not m.isfile():
                continue
            k = int(mm.group(1) or mm.group(2))
            n = sum(1 for line in t.extractfile(m) if line.strip())
            if n:
                per[k] = per.get(k, 0) + n
    return dict(sorted(per.items()))


def main():
    root = sys.argv[1]
    md5 = {}
    for line in open(os.path.join(root, "MD5SUMS")):
        h, p = line.split(None, 1)
        md5[p.strip().lstrip("./")] = h
    out = []
    for sub in ("proven", "ladder"):
        for fn in sorted(os.listdir(os.path.join(root, sub))):
            name = fn[: -len(".tar.xz")]
            if name not in RUNS:
                continue
            lim, q, sizes, method, status, tool, note = RUNS[name]
            c = counts(os.path.join(root, sub, fn))
            e = {"name": name, "limit": lim, "primes": L[lim], "q": q, "note_counts": sizes, "method": method,
                 "status": status, "tool": BIN[tool], "families_per_size": c, "families": sum(c.values()),
                 "archive": f"{BUCKET}/{sub}/{fn}", "md5": md5.get(f"{sub}/{fn}", ""),
                 "vm_path": f"~/zruns/zprod/{name}/"}
            if sub == "proven":
                e["repo_archive"] = f"research/ji-z-partners/data/proven/{fn}"
            if note:
                e["note"] = note
            out.append(e)
    json.dump({"created": "2026-11-23", "bucket": BUCKET, "q": "intervallic odd limit: every interval's odd numerator and denominator <= q",
               "runs": out}, sys.stdout, indent=1, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
