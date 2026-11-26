"""Check a zprod --interval-odd run against a reference catalog (e.g. the exhaustive 5-limit families).
Reference families are filtered to intervallic odd limit <= q (largest odd number in any interval of the
set); families are compared by interval content, and members per family by lattice point set.
usage: python3 iol_compare.py REF.jsonl Q RUN.jsonl [RUN2.jsonl ...]
prints, per note count: reference families with q <= Q, found, missing, extra (extra = not in the
reference: fine when the run's gamut is larger than the reference's)."""
import collections, json, sys
from fractions import Fraction


def odd(n):
    while n % 2 == 0:
        n //= 2
    return n


def iol(f):
    return max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])


def load(paths, q=None):
    out = {}
    for p in paths:
        for line in open(p):
            f = json.loads(line)
            if q is not None and iol(f) > q:
                continue
            key = tuple(sorted(f["interval_classes"]))
            mem = {json.dumps(sorted(m["lattice"])) for m in f["members"]}
            if key in out:
                out[key][1].update(mem)
            else:
                out[key] = (f["notes"], mem, f)
    return out


ref_path, q, runs = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
R = load([ref_path], q)
F = load(runs)
bad_q = [k for k, (_, _, f) in F.items() if iol(f) > q]
print(f"run families with an interval above q = {q}: {len(bad_q)} (must be 0)")
ks = sorted({n for n, _, _ in R.values()} | {n for n, _, _ in F.values()})
print("notes  ref(q)  found  missing  extra  member-count-differs")
for k in ks:
    r = {key for key, v in R.items() if v[0] == k}
    f = {key for key, v in F.items() if v[0] == k}
    diff = sum(1 for key in r & f if len(R[key][1]) != len(F[key][1]))
    print(f"{k:5d} {len(r):7d} {len(r & f):6d} {len(r - f):8d} {len(f - r):6d} {diff:8d}")
    for key in sorted(r - f)[:5]:
        print("   missing:", " ~ ".join(" ".join(m["ratios"]) for m in R[key][2]["members"]))
