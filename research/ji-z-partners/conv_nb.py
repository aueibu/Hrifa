"""Turn zprod-rs families.jsonl files (k*/families.jsonl under a run folder) into extras-style lines for verify_strays.py.
usage: python conv_nb.py RUN_DIR OUT.jsonl"""
import sys, glob, json, os

n = 0
with open(sys.argv[2], "w") as fo:
    for fn in sorted(glob.glob(os.path.join(sys.argv[1], "k*", "families.jsonl"))):
        for line in open(fn):
            f = json.loads(line)
            fo.write(json.dumps({"k": f["notes"], "q": f.get("q") or f.get("interval_odd") or 0,
                                 "members": [m["ratios"] for m in f["members"]]}) + "\n")
            n += 1
print(n, "families ->", sys.argv[2])
