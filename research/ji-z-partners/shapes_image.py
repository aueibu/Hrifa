#!/usr/bin/env python3
"""shapes_image.py (2026-11-26): which fine patterns from shapes_k.py lie inside bigger ones.

For each pattern (OUT.classes.jsonl line) the flat F(E) is rebuilt from its example family's interval equalities
(null space of the edge forms in the typeflats coordinates p_1.., q_1..); its basis gives the generic pair
(note i = its coordinate column, a vector in Q^dim). Pattern A lies inside pattern B (up to relabeling, mirror,
swap) exactly when A's example family is a linear image of B's generic pair (type_image.image): then every
equality of B holds for A, so F(E_A) sits in a relabeled F(E_B). Patterns that lie inside no other pattern are
the maximal shapes among the known families (a lower bound on the k-note catalogue).

usage: ~/tfenv/bin/python shapes_image.py K OUT.classes.jsonl [--workers N] > OUT.image.txt
"""
import json, multiprocessing as mp, os, sys
from fractions import Fraction as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from typeflats import Search, rref_rows  # noqa: E402
from type_image import image  # noqa: E402

K = int(sys.argv[1])
S = Search(K)


def nullspace(forms, n):
    """basis of {x in Q^n : f . x = 0 for all forms}"""
    R = rref_rows([[F(x) for x in f] for f in forms]) if forms else ()
    piv = []
    for r in R:
        piv.append(next(c for c, x in enumerate(r) if x != 0))
    free = [c for c in range(n) if c not in piv]
    basis = []
    for fc in free:
        v = [F(0)] * n
        v[fc] = F(1)
        for r, pc in zip(R, piv):
            v[pc] = -r[fc] / r[pc]
        basis.append(v)
    return basis


def generic(P, Q):
    dP = [tuple(b - a for a, b in zip(P[i], P[j])) for i, j in S.pairs]
    dQ = [tuple(b - a for a, b in zip(Q[i], Q[j])) for i, j in S.pairs]
    forms = []
    for u, d in enumerate(dP):
        for v, e in enumerate(dQ):
            for s in (1, -1):
                if d == tuple(s * x for x in e):
                    forms.append(S.edge_form(u, v, s))
    B = nullspace(forms, S.n)
    return [S.point(B, 0, i) for i in range(K)], [S.point(B, 1, i) for i in range(K)], len(B)


def test(job):
    a, b, A, GB = job
    try:
        return a, b, image(GB, A) is not None
    except ValueError:  # P side alone does not span the flat: use Q as the spanning side
        return a, b, image((GB[1], GB[0]), A) is not None


def main():
    workers = int(sys.argv[sys.argv.index("--workers") + 1]) if "--workers" in sys.argv else os.cpu_count()
    cl = [json.loads(l) for l in open(sys.argv[2])]
    gen, ex = {}, {}
    for c in cl:
        P = [tuple(p) for p in c["example"]["P"]]
        Q = [tuple(q) for q in c["example"]["Q"]]
        ex[c["idx"]] = ([tuple(F(x) for x in p) for p in P], [tuple(F(x) for x in q) for q in Q])
        gP, gQ, d = generic(P, Q)
        assert d == c["dim"], (c["idx"], d, c["dim"])
        gen[c["idx"]] = (gP, gQ)
    dim = {c["idx"]: c["dim"] for c in cl}
    jobs = [(a, b, ex[a], gen[b]) for a in dim for b in dim if dim[b] > dim[a]]
    inside = {a: [] for a in dim}
    with mp.Pool(workers) as pool:
        for a, b, ok in pool.imap_unordered(test, jobs, chunksize=1):
            if ok:
                inside[a].append(b)
    maximal = [c for c in cl if not inside[c["idx"]]]
    print(f"{len(cl)} patterns, {len(jobs)} tests; {len(maximal)} lie inside no other pattern (maximal):")
    for c in maximal:
        print(f"  #{c['idx']} dim {c['dim']} count {c['count']} min q {c['minq']} e.g. {c['example']['list']} "
              f"P {c['example']['P']} Q {c['example']['Q']}")
    print("inside relations (pattern: patterns it lies inside):")
    for c in cl:
        if inside[c["idx"]]:
            print(f"  #{c['idx']} dim {c['dim']} min q {c['minq']} count {c['count']}: inside {sorted(inside[c['idx']])}")


if __name__ == "__main__":
    main()
