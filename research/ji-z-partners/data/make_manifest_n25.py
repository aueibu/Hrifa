#!/usr/bin/env python3
"""Build data/manifest_2026-11-25.json: one entry per run of the 2026-11-25 night queue (PROGRESS "Night queue").

Reads n25_runs_2026-11-25.tar.xz (repo data/proven/ and the bucket's archive_2026-11-25/). Run names:
n25_l<L>q<Q>k<K> (one limit, q and note count each). Status: "proven" when the folder has summary.csv (the queue
counts a job finished only with exit 0 and summary.csv); "paused" when it has only products.jsonl.progress (a
resumable run stopped at the noon stop or moved to a later night; resume with night_queue.py, VM folder kept).
Every proven list was checked with verify_families.py after the night: 0 bad families in all 31 lists.
usage: python make_manifest_n25.py ARCHIVE > manifest_2026-11-25.json
"""
import collections, csv, io, json, re, sys, tarfile

BUCKET = "gs://project-f5757a43-c874-4e0b-8f8-ji-zpairs/archive_2026-11-25/n25_runs_2026-11-25.tar.xz"
PRIMES = [3, 5, 7, 11, 13, 17, 19, 23]


def main():
    runs = collections.defaultdict(dict)
    with tarfile.open(sys.argv[1], "r:xz") as t:
        for m in t:
            mm = re.match(r"(n25_l(\d+)q(\d+)k(\d+))/(summary\.csv|products\.jsonl\.progress)$", m.name)
            if not mm or not m.isfile():
                continue
            r = runs[mm.group(1)]
            r.update(limit=int(mm.group(2)), q=int(mm.group(3)), k=int(mm.group(4)))
            text = t.extractfile(m).read().decode()
            if mm.group(5) == "summary.csv":
                row = next(csv.DictReader(io.StringIO(text)))
                r["families"] = int(row["families"])
            else:
                r["checkpointed_slices"] = sum(1 for line in text.splitlines() if line.startswith("S "))
    out = []
    for name, r in sorted(runs.items(), key=lambda kv: (kv[1]["limit"], kv[1]["k"], kv[1]["q"])):
        proven = "families" in r
        out.append({"name": name, "limit": r["limit"], "primes": [p for p in PRIMES if p <= r["limit"]], "q": r["q"],
                    "note_counts": str(r["k"]), "method": "enumeration", "status": "proven" if proven else "paused",
                    "families_per_size": {str(r["k"]): r["families"]} if proven else {},
                    "families": r.get("families"), "verified": "verify_families.py: 0 bad" if proven else None,
                    "checkpointed_slices": r.get("checkpointed_slices"), "archive": BUCKET,
                    "vm_path": f"~/zruns/zprod/{name}/"})
    json.dump({"created": "2026-11-25", "project": "night queue 2026-11-25 (6-8 notes mainly; PROGRESS 'Night queue')",
               "bucket": BUCKET.rsplit("/", 1)[0], "runs": out}, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
