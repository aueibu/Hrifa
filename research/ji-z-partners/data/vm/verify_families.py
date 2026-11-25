"""Check a zgen families.jsonl, and optionally compare it with another run (run on the VM with pypy3).

Usage: pypy3 verify_families.py /path/to/zgen.py A/families.jsonl [B/families.jsonl]

For every family in A (and B):
  - every pair of members has the same interval content (zgen.fingerprint), and
  - no two members are the same set up to transposition and inversion (zgen.canon).
Families are identified by their interval content (fingerprint), which is what a Z-family shares, so
two runs can be compared even when one stores pairs and the other larger families.
With B: prints the families only in A, only in B, and in both.
"""
import json, sys, importlib.util

spec = importlib.util.spec_from_file_location("zgen", sys.argv[1])
z = importlib.util.module_from_spec(spec)
sys.argv, args = ["zgen.py"], sys.argv[2:]
spec.loader.exec_module(z)


def load(path):
    fams, bad = {}, 0
    for line in open(path):
        rec = json.loads(line)
        sets = [[tuple(p) for p in m["lattice"]] for m in rec["members"]]
        fps = {z.fingerprint(s) for s in sets}
        cls = {z.canon(s) for s in sets}
        if len(fps) != 1 or len(cls) != len(sets):
            bad += 1
            print(f"  BAD family {rec['family']} in {path}: {len(fps)} interval contents, "
                  f"{len(cls)} distinct classes of {len(sets)} members")
            continue
        fp = fps.pop()
        fams.setdefault(fp, set()).update(cls)
    return fams, bad


A, badA = load(args[0])
print(f"{args[0]}: {len(A)} families by interval content, {badA} bad")
if len(args) > 1:
    B, badB = load(args[1])
    print(f"{args[1]}: {len(B)} families by interval content, {badB} bad")
    onlyA, onlyB = set(A) - set(B), set(B) - set(A)
    both = set(A) & set(B)
    diffmembers = sum(1 for fp in both if A[fp] != B[fp])
    print(f"in both: {len(both)} (of which {diffmembers} list different members); only in A: {len(onlyA)}; "
          f"only in B: {len(onlyB)}")
    for name, only, src in (("A", onlyA, A), ("B", onlyB, B)):
        for fp in sorted(only)[:10]:
            print(f"  only in {name}: {len(src[fp])} members, e.g. {sorted(src[fp])[0]}")
