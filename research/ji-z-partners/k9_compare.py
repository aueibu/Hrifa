#!/usr/bin/env python3
"""k9_compare.py (2026-11-26): the typeflats-rs k 9 --min-dim 3 classes against each other and against the known
9-note patterns of shapes_k.py (step a).

1. images among the found classes (rational maps, type_image.image): a class that is an image of another one
   lies inside a relabeled copy of it, so it is not a new maximal shape;
2. for each found class, which step-(a) patterns (example families, tables/shapes9/k9.classes.jsonl) are its
   images, i.e. which known families it explains; a class with none occurs in no known 9-note family.

usage: python k9_compare.py types9.json tables/shapes9/k9.classes.jsonl
"""
import json, sys
from fractions import Fraction as F

from type_image import image


def gen(t):
    return [tuple(F(x) for x in p) for p in t["P"]], [tuple(F(x) for x in q) for q in t["Q"]]


def img(B, A):
    try:
        return image(B, A) is not None
    except ValueError:  # P side of B does not span: use Q as the spanning side
        return image((B[1], B[0]), A) is not None


def job(t):
    kind, a, b, B, A = t
    return kind, a, b, img(B, A)


def main():
    import multiprocessing as mp
    found = json.load(open(sys.argv[1]))["types"]
    G = [gen(t) for t in found]
    cl = [json.loads(l) for l in open(sys.argv[2])]
    print(f"{len(found)} found classes (dims {[t['dim'] for t in found]}), {len(cl)} step-(a) patterns", flush=True)
    ex = {c["idx"]: ([tuple(F(x) for x in p) for p in c["example"]["P"]], [tuple(F(x) for x in q) for q in c["example"]["Q"]]) for c in cl}
    jobs = [("cc", i, j, G[j], G[i]) for i in range(len(G)) for j in range(len(G)) if i != j]
    jobs += [("cp", c["idx"], j, G[j], ex[c["idx"]]) for j in range(len(G)) for c in cl]
    res = []
    with mp.Pool(60) as pool:
        for r in pool.imap_unordered(job, jobs):
            res.append(r)
    print("images among found classes:")
    for kind, i, j, ok in res:
        if kind == "cc" and ok:
            print(f"  found#{i} (dim {found[i]['dim']}) IS an image of found#{j} (dim {found[j]['dim']})")
    byidx = {c["idx"]: c for c in cl}
    print("step-(a) patterns explained by each found class:")
    for j in range(len(G)):
        hits = [byidx[a] for kind, a, b, ok in res if kind == "cp" and b == j and ok]
        same = [c for c in hits if c["dim"] == found[j]["dim"]]
        print(f"  found#{j} dim {found[j]['dim']}: {len(hits)} patterns, {sum(c['count'] for c in hits)} families; "
              f"same-dim pattern(s) {[('#%d' % c['idx'], c['minq']) for c in same]}; smallest q among them "
              f"{min((c['minq'] for c in hits), default=None)}", flush=True)
    print("COMPARE DONE", flush=True)


if __name__ == "__main__":
    main()
