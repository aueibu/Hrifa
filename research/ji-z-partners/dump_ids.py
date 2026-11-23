#!/usr/bin/env python3
"""dump_ids.py: write the families listed in an ids tsv (columns: notes, family, ...) from a list dir.

usage: python3 dump_ids.py LIST_DIR IDS_TSV > out.jsonl   (members as ratio strings, plus k, family, description)
"""
import json, os, sys

lst, ids = sys.argv[1:3]
want = {}
for line in open(ids):
    c = line.rstrip("\n").split("\t")
    want[(int(c[0]), int(c[1]))] = c[2] if len(c) > 2 else ""
for (k, fam), d in sorted(want.items()):
    for line in open(os.path.join(lst, f"k{k}", "families.jsonl")):
        f = json.loads(line)
        if f["family"] == fam:
            print(json.dumps({"k": k, "family": fam, "description": d,
                              "members": [m["ratios"] for m in f["members"]]}))
            break
