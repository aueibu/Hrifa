"""Independent brute-force recomputation of Z-families inside a gamut, for small k.

Enumerates every k-subset of the gamut, reduces it to a class (translation +
inversion), fingerprints it by its +/- difference multiset, and reports the
fingerprints that carry two or more classes. Prints a JSON summary per k and
writes brute_k{K}.jsonl with the exact families (canonical lattice sets).

usage: python3 brute.py RUN_DIR K [K ...]
"""
import sys, json, time, itertools
import numpy as np
from zcore import exps, canon, diffs

run = sys.argv[1]
ks = [int(x) for x in sys.argv[2:]]
G = sorted(exps(r) for r in open(f"{run}/gamut.txt").read().split())
P = np.array(G, dtype=np.int64)
# lexicographic code: valid because |b| differences stay far below 32
CODE = P[:, 0] * 64 + P[:, 1]
rng = np.random.default_rng(12345)
CHUNK = 1_000_000


def rows_hash(M, mult):
    return (M.astype(np.uint64) * mult[: M.shape[1]]).sum(axis=1)


def chunks(k):
    it = itertools.combinations(range(len(G)), k)
    while True:
        a = np.fromiter(itertools.chain.from_iterable(itertools.islice(it, CHUNK)), dtype=np.int16)
        if a.size == 0:
            return
        yield a.reshape(-1, k)


def featurise(idx, k, mult_c, mult_f):
    c = np.sort(CODE[idx], axis=1)
    t = c - c[:, :1]
    n = np.sort(-c, axis=1)
    n = n - n[:, :1]
    # pick lexicographically smaller of t and n, row by row
    neq = t != n
    first = np.argmax(neq, axis=1)
    r = np.arange(len(t))
    use_n = neq.any(axis=1) & (n[r, first] < t[r, first])
    canon_rows = np.where(use_n[:, None], n, t)
    iu, ju = np.triu_indices(k, 1)
    fp = np.sort(np.abs(c[:, ju] - c[:, iu]), axis=1)
    return rows_hash(canon_rows + 4096, mult_c), rows_hash(fp, mult_f)


for k in ks:
    t0 = time.time()
    m = k * (k - 1) // 2
    mult_c = rng.integers(1, 2**63, size=k, dtype=np.uint64) | np.uint64(1)
    mult_f = rng.integers(1, 2**63, size=m, dtype=np.uint64) | np.uint64(1)
    pairs = []
    for idx in chunks(k):
        hc, hf = featurise(idx, k, mult_c, mult_f)
        pairs.append(np.unique(np.stack([hf, hc], axis=1), axis=0))
    pairs = np.unique(np.concatenate(pairs), axis=0)
    n_classes = len(pairs)
    fps, counts = np.unique(pairs[:, 0], return_counts=True)
    zf = fps[counts >= 2]
    # second pass: exact recomputation for every subset whose fingerprint hash is flagged
    fam = {}
    for idx in chunks(k):
        hc, hf = featurise(idx, k, mult_c, mult_f)
        for row in idx[np.isin(hf, zf)]:
            S = [G[i] for i in row]
            fam.setdefault(diffs(S), set()).add(canon(S))
    fam = {d: v for d, v in fam.items() if len(v) >= 2}
    with open(f"brute_k{k}.jsonl", "w") as fh:
        for d, v in sorted(fam.items()):
            fh.write(json.dumps(sorted(v)) + "\n")
    sizes = {}
    for v in fam.values():
        sizes[len(v)] = sizes.get(len(v), 0) + 1
    print(json.dumps({"k": k, "set_classes": n_classes, "flagged_hashes": int(len(zf)),
                      "z_families": len(fam), "family_sizes": sizes,
                      "seconds": round(time.time() - t0, 1)}), flush=True)
