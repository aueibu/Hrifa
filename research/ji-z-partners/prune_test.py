#!/usr/bin/env python3
"""prune_test.py (2026-11-27): how much would "skip search nodes inside a known shape" save at k 9 (min-dim 2)?

Sound prune: if a node's flat F is inside a relabeled copy of a known type flat S (F's generic pair is a linear image
of S's, type_image.image(S, F)), every type flat below F lies inside S, so none is a new maximal shape; F's whole
subtree can be skipped. This counts, for the sampled good nodes of the stopped k 9 run (every 10,000,000th distinct
good flat, typeflats-rs --sample-out), the fraction that lies inside one of the 11 known maximal 9-note shapes
(shapes_catalog.json, k 9), by dimension. Only shapes of dimension >= the node's can contain it.

usage: python3 prune_test.py shapes_catalog.json k9samp.jsonl [LIMIT] > prune_test.txt
"""
import collections, json, sys, time
from fractions import Fraction as F
from multiprocessing import Pool

from type_image import image

SHAPES = None


def fr(S):
    return [tuple(F(x) for x in p) for p in S]


def inside(S, A):
    try:
        return image(S, A) is not None
    except ValueError:  # P side of S does not span: use Q as the spanning side
        return image((S[1], S[0]), A) is not None


def job(s):
    A = (fr(s["P"]), fr(s["Q"]))
    t = time.time()
    hits = [name for name, d, S in SHAPES if d >= s["dim"] and inside(S, A)]
    return s["dim"], hits, time.time() - t


def init(shapes):
    global SHAPES
    SHAPES = shapes


def main():
    shapes = [(s["name"], s["dim"], (fr(s["P"]), fr(s["Q"]))) for s in json.load(open(sys.argv[1])) if s["k"] == 9]
    samples = [json.loads(l) for l in open(sys.argv[2]) if l.strip()]
    if len(sys.argv) > 3:
        samples = samples[: int(sys.argv[3])]
    print(f"{len(shapes)} shapes {[n for n, _, _ in shapes]}, {len(samples)} samples", flush=True)
    by = collections.defaultdict(lambda: [0, 0, 0.0])
    which = collections.Counter()
    with Pool(48, initializer=init, initargs=(shapes,)) as pool:
        for d, hits, dt in pool.imap_unordered(job, samples, chunksize=4):
            by[d][0] += 1
            by[d][1] += bool(hits)
            by[d][2] += dt
            for h in hits:
                which[(d, h)] += 1
    tot = sum(v[0] for v in by.values())
    hit = sum(v[1] for v in by.values())
    for d in sorted(by):
        n, h, t = by[d]
        print(f"dim {d}: {n} samples, {h} inside a known shape ({100 * h / n:.1f}%), check time {t / n:.3f} s/sample")
    print(f"all: {tot} samples, {hit} inside a known shape ({100 * hit / tot:.1f}%)")
    for (d, h), c in sorted(which.items()):
        print(f"  dim {d} inside {h}: {c}")


if __name__ == "__main__":
    main()
