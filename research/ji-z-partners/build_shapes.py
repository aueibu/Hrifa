#!/usr/bin/env python3
"""build_shapes.py: every Z-pair of given shapes, up to an intervallic odd limit q, at a prime limit (2026-11-25).

A shape (zgen type, uv_types.jsonl, or a family turned into a shape) is a pair P, Q of point sets in Z^r
(r = 1 or 2). A placement maps the shape's lattice into the prime lattice by a linear map L; L is fixed by the
images d1 (, d2) of r differences e1 (, e2) of P that form a basis (|det| = 1), so d1, d2 are themselves
intervals of the placed set. Every placement with d1, d2 allowed is tried; a placement is kept when every
interval inside L(P) and inside L(Q) is allowed (odd limit <= q, primes <= the limit), which also makes L
one-to-one on the points. Kept placements are merged into families (each member up to transposition and
mirror; the members unordered); a placement whose members coincide is not a Z-pair and is dropped.

Within a proven range the result must equal the proven list (fit_types.py: every proven 6-8-note family is a
placement of these shapes), which checks this code. Past the proven ranges the counts are lower bounds: a shape
not in the list could still appear.

Output (stdout): one JSON line per family: k, limit, q of the family, primes used, shape, both members (ratios).
Summary (stderr): families, and per prime the smallest family q using it.
usage: pypy3 build_shapes.py --shapes S.jsonl ... --k K --limit L --q Q [--workers W] > fams.jsonl
"""
import argparse, itertools, json, sys
from fractions import Fraction
from multiprocessing import Pool

PR = [3, 5, 7, 11, 13, 17, 19, 23]
BASE = 1 << 12          # digit base of the integer encoding of exponent vectors (|digit| < 2048)


def allowed(primes, q):
    """all nonzero exponent vectors whose interval odd limit max(num, den) <= q"""
    n = len(primes)

    def nums(i, cur):
        if i == n:
            yield cur, ()
            return
        v, e = cur, 0
        while v <= q:
            for r, es in nums(i + 1, v):
                yield r, (e,) + es
            v *= primes[i]
            e += 1
    halves = list(nums(0, 1))
    out = []
    for _, en in halves:
        for _, ed in halves:
            if all(a == 0 or b == 0 for a, b in zip(en, ed)):
                v = tuple(a - b for a, b in zip(en, ed))
                if any(v):
                    out.append(v)
    return out


def enc(v):
    s = 0
    for i, x in enumerate(v):
        s += x * BASE ** i
    return s


def dec(s, n):
    v = []
    for _ in range(n):
        d = s % BASE
        if d >= BASE // 2:
            d -= BASE
        v.append(d)
        s = (s - d) // BASE
    return tuple(v)


def canon(S):
    m = min(S)
    return tuple(sorted(tuple(a - b for a, b in zip(p, m)) for p in S))


def canon_any(S):
    return min(canon(S), canon([tuple(-x for x in p) for p in S]))


def odd_limit(v, primes):
    num = den = 1
    for p, e in zip(primes, v):
        if e > 0:
            num *= p ** e
        elif e < 0:
            den *= p ** -e
    return max(num, den)


def ratio(v, primes):
    r = Fraction(1)
    for p, e in zip(primes, v):
        r *= Fraction(p) ** e
    while r >= 2:
        r /= 2
    while r < 1:
        r *= 2
    return str(r)


class Shape:
    def __init__(self, rec):
        self.id = str(rec["type"]); self.k = rec["k"]; self.r = rec["rank"]
        P = [tuple(p) for p in rec["P"]]; Q = [tuple(p) for p in rec["Q"]]
        r = self.r
        # basis differences e1 (, e2) of P with |det| = 1, then every point in those coordinates
        best = None
        for i0, i1, *rest in itertools.permutations(range(len(P)), r + 1):
            e1 = tuple(a - b for a, b in zip(P[i1], P[i0]))
            if r == 1:
                if abs(e1[0]) == 1:
                    best = (e1,); break
            else:
                e2 = tuple(a - b for a, b in zip(P[rest[0]], P[i0]))
                if abs(e1[0] * e2[1] - e1[1] * e2[0]) == 1:
                    best = (e1, e2); break
        if best is None:
            raise ValueError(f"shape {self.id}: no unimodular pair of differences")
        if r == 1:
            co = lambda p: (p[0] * best[0][0], 0)
        else:
            (a, b), (c, d) = best
            det = a * d - b * c
            co = lambda p: ((p[0] * d - p[1] * c) // det, (-p[0] * b + p[1] * a) // det)
        self.Pc = [co(p) for p in P]; self.Qc = [co(p) for p in Q]
        diffs = set()
        for S in (self.Pc, self.Qc):
            for x, y in itertools.combinations(S, 2):
                d = (x[0] - y[0], x[1] - y[1])
                if d[0] < 0 or (d[0] == 0 and d[1] < 0):
                    d = (-d[0], -d[1])          # intervals are checked up to sign (the allowed set is symmetric)
                diffs.add(d)
        self.diffs = sorted(diffs, key=lambda d: abs(d[0]) + abs(d[1]))   # small combinations first: early reject


G = {}


def init(shapes, Dlist, n, primes):
    G.update(shapes=shapes, D=Dlist, Dset=set(Dlist), n=n, primes=primes)


def work(task):
    si, chunk = task
    sh, D, Dset, n = G["shapes"][si], G["D"], G["Dset"], G["n"]
    found = {}
    for i in chunk:
        x = D[i]
        if x < 0:
            continue                             # L and -L give mirrored placements (the same family)
        for y in (D if sh.r == 2 else (0,)):
            ok = True
            for a, b in sh.diffs:
                if a * x + b * y not in Dset:
                    ok = False; break
            if not ok:
                continue
            A = [dec(a * x + b * y, n) for a, b in sh.Pc]
            B = [dec(a * x + b * y, n) for a, b in sh.Qc]
            cA, cB = canon_any(A), canon_any(B)
            if cA == cB:
                continue
            key = tuple(sorted([cA, cB]))
            if key not in found:
                found[key] = (A, B)
    return found


def lambda_free_work(task):
    return task[0], work(task)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shapes", nargs="+", required=True)
    ap.add_argument("--k", type=int, required=True)
    ap.add_argument("--limit", type=int, required=True)
    ap.add_argument("--q", type=int, required=True)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--only", nargs="*", default=None, help="use only these shape ids")
    a = ap.parse_args()
    primes = [p for p in PR if p <= a.limit]
    n = len(primes)
    vecs = allowed(primes, a.q)
    Dlist = [enc(v) for v in vecs]
    shapes = []
    for f in a.shapes:
        for line in open(f):
            rec = json.loads(line)
            if rec["k"] != a.k or rec["rank"] > 2 or (a.only is not None and str(rec["type"]) not in a.only):
                continue
            try:
                shapes.append(Shape(rec))
            except ValueError as e:
                print("skipped:", e, file=sys.stderr)
    fams = {}
    # one pool for all shapes (a pool per shape leaked pipes: "Too many open files" with ~100 shapes)
    chunks = [list(range(i, len(Dlist), a.workers * 4)) for i in range(a.workers * 4)]
    tasks = [(si, c) for si in range(len(shapes)) for c in chunks]
    pool = Pool(a.workers, initializer=init, initargs=(shapes, Dlist, n, primes))
    for found_si, found in pool.imap_unordered(lambda_free_work, tasks):
        for key, (A, B) in found.items():
            fams.setdefault(key, (shapes[found_si].id, A, B))
    pool.close(); pool.join()
    first = {}
    for key, (sid, A, B) in sorted(fams.items()):
        q = max(odd_limit(tuple(x - y for x, y in zip(p1, p2)), primes) for p1 in A for p2 in A)
        used = [p for i, p in enumerate(primes) if any(v[i] for v in A + B)]
        for p in used:
            first[p] = min(first.get(p, q + 1), q)
        print(json.dumps({"k": a.k, "limit": a.limit, "q": q, "primes_used": used, "shape": sid,
                          "members": [[ratio(v, primes) for v in sorted(A)], [ratio(v, primes) for v in sorted(B)]],
                          "key": [list(map(list, c)) for c in key]}))
    print(f"k={a.k} limit={a.limit} q<={a.q}: {len(vecs)} intervals, {len(shapes)} shapes, {len(fams)} families; "
          f"first q per prime: {dict(sorted(first.items()))}", file=sys.stderr)


if __name__ == "__main__":
    main()
