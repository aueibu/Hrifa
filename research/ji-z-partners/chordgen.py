#!/usr/bin/env python3
"""chordgen.py: constructive generator of chord-sum Z-pairs  P = A·U,  Q = A⁻¹·U  (THEORY_SMALL_FACTOR.md s. 6).

A, U: sets of pitch classes (vectors in the odd-prime lattice, one axis per odd prime), A⁻¹ = mirror of A
(every ratio r -> 1/r, written 1/(a:b:c) for A = a:b:c), A·U = product set. With D(X) = intervals of X
(a symmetric set containing 1):
  * the intervals of A·U are D(A)·D(U); D(A⁻¹) = D(A), so A·U and A⁻¹·U obey the SAME limit test;
  * a product lands twice exactly when D(A) and D(U) share an interval other than 1 (same for A⁻¹·U).
So: for each chord A (up to transposition and mirror), E_A = {d allowed : d·δ allowed for every δ in D(A),
d not in D(A)}, and every U containing 1 whose intervals all lie in E_A gives a valid pair. It is a
Z-pair unless Q is a transposition or mirror of P (always the case when A or U is mirror-symmetric).
"Allowed" = intervallic odd limit <= q, primes <= the limit.

Pairs are deduplicated by the family key (both members up to transposition, the pair up to a common
mirror). Sizes: |A| <= |U|, |A|·|U| <= --max-notes (with 2-note sets every pair is trivial, so k <= 16
gives 3x3, 3x4, 3x5, 4x4).

--check LIST_DIR (k*/families.jsonl) [--tsv chordsum_fs.tsv]: compare with a proven list: every
generated pair must be a proven family (else the list or the generator is wrong); every proven family
marked chord_sum=1 in the tsv must be generated (else the generator is incomplete).

usage: python3 chordgen.py --primes 3 5 7 11 13 17 19 --q 135 [--max-notes 16] [--workers 16]
           [--out pairs.jsonl] [--check DIR --tsv FILE]
"""
import argparse, collections, json, sys, time
from fractions import Fraction
from multiprocessing import Pool


def exps(n, primes):
    v = []
    for p in primes:
        e = 0
        while n % p == 0:
            n //= p
            e += 1
        v.append(e)
    return tuple(v) if n == 1 else None


def allowed_set(primes, q):
    """all nonzero lattice vectors whose ratio has odd limit <= q (numerator and denominator odd, coprime)"""
    from math import gcd
    E = set()
    for n in range(1, q + 1, 2):
        en = exps(n, primes)
        if en is None:
            continue
        for d in range(1, q + 1, 2):
            if gcd(n, d) != 1 or (n == 1 and d == 1):
                continue
            ed = exps(d, primes)
            if ed is None:
                continue
            E.add(tuple(a - b for a, b in zip(en, ed)))
    return E


def add(u, v): return tuple(a + b for a, b in zip(u, v))
def sub(u, v): return tuple(a - b for a, b in zip(u, v))
def neg(u): return tuple(-a for a in u)


def canon_T(S):
    return min(tuple(sorted(sub(s, r) for s in S)) for r in S)


def canon_TI(S):
    return min(canon_T(S), canon_T([neg(s) for s in S]))


def diffs(S):
    return {sub(x, y) for x in S for y in S if x != y}


def cliques(V, adj_ok, size, start=()):
    """all cliques of `size` (as sorted tuples) containing the zero vector, from vertex list V (sorted);
    adj_ok(x, y) tests an edge. Each clique once up to transposition (zero is its smallest element)."""
    out = []
    z = start
    def rec(cur, cand):
        if len(cur) == size:
            out.append(tuple(cur))
            return
        for i, v in enumerate(cand):
            rec(cur + [v], [w for w in cand[i + 1:] if adj_ok(v, w)])
    rec([z], [v for v in V if v > z])
    return out


G = {}


def init(E, sizes):
    G["E"] = E
    G["sizes"] = sizes


def work(A):
    E = G["E"]
    DA = diffs(A)
    EA = set(E)
    for d in DA:
        EA &= {sub(e, d) for e in E}
    EA -= DA
    z = tuple(0 for _ in A[0])
    V = sorted(v for v in EA if v > z)
    out = []
    for us in G["sizes"][len(A)]:
        for U in cliques(V, lambda x, y: sub(y, x) in EA, us, start=z):
            P = [add(a, u) for a in A for u in U]
            Q = [add(neg(a), u) for a in A for u in U]
            cP, cQ = canon_TI(P), canon_TI(Q)
            if cP == cQ:
                continue  # Q is a transposition or mirror of P
            # family = unordered pair of members, each up to transposition and mirror
            out.append((tuple(sorted((cP, cQ))), canon_TI(A), canon_TI(U)))
    return out


def iol_of(S, primes):
    best = 1
    for d in diffs(S):
        n = 1
        m = 1
        for p, e in zip(primes, d):
            if e > 0:
                n *= p ** e
            elif e < 0:
                m *= p ** -e
        best = max(best, n, m)
    return best


def ratio(v, primes):
    r = Fraction(1)
    for p, e in zip(primes, v):
        r *= Fraction(p) ** e
    while r >= 2:
        r /= 2
    while r < 1:
        r *= 2
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--primes", type=int, nargs="+", required=True)
    ap.add_argument("--q", type=int, required=True)
    ap.add_argument("--max-notes", type=int, default=16)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--out")
    ap.add_argument("--check")
    ap.add_argument("--tsv")
    ap.add_argument("--strays", help="with --check: write generated pairs missing from the list here")
    a = ap.parse_args()
    t0 = time.time()
    primes = a.primes
    E = allowed_set(primes, a.q)
    zero = tuple(0 for _ in primes)
    Vs = sorted(v for v in E if v > zero)
    # chord sizes and second-factor sizes: 3 <= |A| <= |U|, |A|·|U| <= max notes
    sizes = collections.defaultdict(list)
    for x in range(3, a.max_notes + 1):
        for y in range(x, a.max_notes // x + 1):
            sizes[x].append(y)
    sizes = {k: v for k, v in sizes.items() if v}
    chords = set()
    for x in sizes:
        for A in cliques(Vs, lambda p, r: sub(r, p) in E, x, start=zero):
            chords.add(canon_TI(A))
    chords = sorted(chords, key=lambda c: (len(c), c))
    print(f"# primes {primes} q {a.q}: {len(E)} allowed intervals, chords by size "
          f"{dict(collections.Counter(len(c) for c in chords))}, sizes {sizes}, {time.time() - t0:.0f} s",
          file=sys.stderr, flush=True)
    fams = {}
    with Pool(a.workers, initializer=init, initargs=(E, sizes)) as pool:
        for res in pool.imap_unordered(work, chords, chunksize=4):
            for key, A, U in res:
                if key not in fams or (len(A), A) < (len(fams[key][0]), fams[key][0]):
                    fams[key] = (A, U)
    print(f"# {len(fams)} families, {time.time() - t0:.0f} s", file=sys.stderr, flush=True)
    byk = collections.Counter(len(k[0]) for k in fams)
    shp = collections.Counter((len(A), len(U)) for A, U in fams.values())
    print("# by notes: " + ", ".join(f"{k}: {c}" for k, c in sorted(byk.items())), file=sys.stderr)
    print("# (A, U) sizes: " + ", ".join(f"{x}x{y}: {c}" for (x, y), c in sorted(shp.items())), file=sys.stderr)
    if a.out:
        with open(a.out, "w") as fo:
            for key, (A, U) in fams.items():
                P, Q = key
                fo.write(json.dumps({"k": len(P), "q": iol_of(P, primes),
                                     "A": [str(ratio(v, primes)) for v in A],
                                     "U": [str(ratio(v, primes)) for v in U],
                                     "members": [[str(ratio(v, primes)) for v in P],
                                                 [str(ratio(v, primes)) for v in Q]],
                                     "lattice": [P, Q]}) + "\n")
    if a.check:
        import glob, os
        member_fam = {}
        famq = {}
        files = glob.glob(os.path.join(a.check, "union_k*.jsonl")) or \
            glob.glob(os.path.join(a.check, "k*", "families.jsonl"))  # ladder rung or enumeration
        for fn in files:
            for line in open(fn):
                f = json.loads(line)
                assert f["primes"] == primes, (f["primes"], primes)
                fid = (f["notes"], f["family"])  # family numbers restart in each k folder
                for m in f["members"]:  # members are stored one by one, each up to transposition and mirror
                    member_fam[canon_TI([tuple(p) for p in m["lattice"]])] = fid
                famq[fid] = f["notes"]
        matched = set()
        stray = collections.Counter()
        fs = open(a.strays, "w") if a.strays else None
        for (P, Q), (A, U) in fams.items():
            fp, fq = member_fam.get(canon_TI(P)), member_fam.get(canon_TI(Q))
            if fp is not None and fp == fq:
                matched.add(fp)
            else:
                stray[len(P)] += 1
                if fs:
                    fs.write(json.dumps({"k": len(P), "q": iol_of(P, primes),
                                         "A": [str(ratio(v, primes)) for v in A],
                                         "U": [str(ratio(v, primes)) for v in U],
                                         "members": [[str(ratio(v, primes)) for v in S] for S in (P, Q)],
                                         "in_list": [fp is not None, fq is not None]}) + "\n")
        if fs:
            fs.close()
        print(f"# check {a.check}: {len(famq)} families in the list, {len(matched)} generated, "
              f"generated pairs not in the list: {dict(sorted(stray.items()))}", file=sys.stderr)
        if a.tsv:
            cs = set()
            for line in open(a.tsv):
                c = line.rstrip("\n").split("\t")
                if c[0] != "list" and c[6] == "1":
                    cs.add((int(c[2]), int(c[1])))
            miss = cs - matched
            extra = matched - cs
            print(f"# chord sums in tsv {len(cs)}; generated {len(cs & matched)}; missed {len(miss)} "
                  f"(by notes {dict(collections.Counter(famq[m] for m in miss))}); generated but not marked "
                  f"chord sum {len(extra)}", file=sys.stderr)
            if miss:
                print("# missed ids: " + " ".join(map(str, sorted(miss)[:30])), file=sys.stderr)


if __name__ == "__main__":
    main()
