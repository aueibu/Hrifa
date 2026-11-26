#!/usr/bin/env python3
"""resclass.py: find the "residue" families in one or more factor-search run dirs.

Residue (THEORY_SMALL_FACTOR.md 6.6-6.7): a family with NO valid split P = T·S, Q = T·S* (or T*·S) in which
T is plain (all coefficients 1) and S has coefficients +1/-1 only, i.e. not a chord sum, hole or merge.
Every grouping of the irreducible factors is tried (as chordsum_fs.py). Families are deduplicated across
the run dirs by interval content.

usage: PYTHONPATH=~/pylib python3 resclass.py OUT.jsonl RUN_DIR [RUN_DIR ...]   (summary to stderr)
"""
import collections, glob, itertools, json, os, sys
from multiprocessing import Pool

from sympy import Poly, factor_list, symbols

from chordsum_fs import flip, iol, norm, to_poly


def classify(f):
    mem = [[tuple(p) for p in m["lattice"]] for m in f["members"]]
    d = len(mem[0][0])
    xs = symbols(f"x0:{d}")
    P = to_poly(mem[0], xs)
    _, fl = factor_list(P.as_expr(), *xs)
    facs = []
    for g, e in fl:
        facs += [Poly(g, *xs)] * e
    n = len(facs)
    one = Poly(1, *xs)
    for Qset in (mem[1], [tuple(-c for c in p) for p in mem[1]]):
        Q = to_poly(Qset, xs)
        nQ = (norm(Q, xs), norm(-Q, xs))
        for r in range(1, n + 1):
            for S in itertools.combinations(range(n), r):
                V, Vs, U = one, one, one
                for i in range(n):
                    if i in S:
                        V, Vs = V * facs[i], Vs * flip(facs[i], xs)
                    else:
                        U = U * facs[i]
                if norm(U * Vs, xs) not in nQ:
                    continue
                for A, B in ((U, V), (V, U), (-U, -V), (-V, -U)):
                    ca, cb = set(A.coeffs()), set(B.coeffs())
                    if ca == {1} and cb <= {1, -1}:
                        return None  # chord sum, hole or merge
    return {"k": f["notes"], "q": iol(f), "factors": [len(g.terms()) for g in facs],
            "coeffs": [sorted(set(int(c) for c in g.coeffs())) for g in facs],
            "members": [m["ratios"] for m in f["members"]] if "ratios" in f["members"][0] else
                       [m["lattice"] for m in f["members"]]}


def main():
    out, dirs = sys.argv[1], sys.argv[2:]
    seen, fams = set(), []
    for d in dirs:
        for fn in glob.glob(os.path.join(d, "k*", "families.jsonl")):
            for line in open(fn):
                f = json.loads(line)
                key = (f["notes"], tuple(sorted(f["interval_classes"])))
                if key not in seen:
                    seen.add(key)
                    fams.append(f)
    with Pool(16) as pool:
        res = [r for r in pool.map(classify, fams, chunksize=8) if r]
    with open(out, "w") as fo:
        for r in sorted(res, key=lambda r: (r["q"], r["k"])):
            fo.write(json.dumps(r) + "\n")
    by = collections.Counter((r["k"], r["q"]) for r in res)
    print(f"# {len(fams)} distinct families in {len(dirs)} runs; residue {len(res)}: "
          + ", ".join(f"{k} notes q {q}: {c}" for (k, q), c in sorted(by.items())), file=sys.stderr)


if __name__ == "__main__":
    main()
