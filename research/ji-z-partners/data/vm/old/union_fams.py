"""Union of families.jsonl files by interval content; optional comparison with a reference file.
usage: python3 union_fams.py OUT.jsonl A.jsonl B.jsonl [...] [--ref R.jsonl]"""
import json, sys
args = sys.argv[1:]
ref = None
if "--ref" in args:
    i = args.index("--ref"); ref = args[i + 1]; args = args[:i] + args[i + 2:]
out, srcs = args[0], args[1:]
fams = {}
for s in srcs:
    for l in open(s):
        f = json.loads(l)
        key = tuple(sorted(f["interval_classes"]))
        if key not in fams:
            fams[key] = f
        else:
            have = {json.dumps(m["lattice"]) for m in fams[key]["members"]}
            for m in f["members"]:
                if json.dumps(m["lattice"]) not in have:
                    fams[key]["members"].append(m)
with open(out, "w") as fh:
    for i, f in enumerate(fams.values(), 1):
        f["family"] = i
        fh.write(json.dumps(f) + "\n")
print(f"union: {len(fams)} families -> {out}")
if ref:
    R = {tuple(sorted(json.loads(l)["interval_classes"])) for l in open(ref)}
    print(f"reference {len(R)}: in both {len(R & fams.keys())}, only in union {len(fams.keys() - R)}, "
          f"only in reference {len(R - fams.keys())}")
