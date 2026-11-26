#!/usr/bin/env python3
"""shapes_k.py (2026-11-26): the pattern (universal-type flat) of every known k-note family, counted.

A family (P, Q) satisfies a set E of interval equalities "interval u of P = s * interval v of Q". The smallest
flat of the typeflats arrangement containing it is F(E) (the intersection of those hyperplanes); its contained
edges are exactly E (any edge holding on F(E) holds at the family), and E has a perfect matching, so F(E) is a
type flat. Two families have the same pattern (up to relabeling notes, mirroring either set, swapping) exactly
when typeflats.Search.canon gives the same key: canon only reads which ordered intervals are equal, so it works on
the families' lattice vectors as they are. dim = dimension of F(E) (16 - rank of E for k 9); rank = rank of the
family's own interval vectors (<= dim).

A family with extra coincidences sits in a smaller flat than a generic family of the same maximal type, so this
counts "fine" patterns; which are images of which is a later step (type_integral / type_image on the reps).

Input: families.jsonl files (one family per line, members with "ratios"); members are read as odd-prime
exponent vectors (octave-equivalent). Families are deduplicated across files (members up to translation and
mirror). Each family's q = largest odd part of numerator or denominator over its interval classes.

usage: ~/tfenv/bin/python shapes_k.py K OUT_PREFIX FILE1 [FILE2 ...] [--workers N]
       writes OUT_PREFIX.classes.jsonl (one line per pattern: key, dim, count, min q, example, lists)
              OUT_PREFIX.fams.tsv      (one line per family: list, q, dim, rank, class index)
       summary to stdout: patterns by dim, and new patterns by q band
"""
import collections, json, multiprocessing as mp, os, sys
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from typeflats import Search  # noqa: E402

PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31]


def odd(n):
    n = abs(n)
    while n and n % 2 == 0:
        n //= 2
    return n


def vec(r):
    r = Fraction(r)
    n, d = r.numerator, r.denominator
    v = []
    for p in PRIMES:
        e = 0
        while n % p == 0:
            n //= p
            e += 1
        while d % p == 0:
            d //= p
            e -= 1
        v.append(e)
    if odd(n) != 1 or odd(d) != 1:
        raise ValueError(f"prime above 31 in {r}")
    return tuple(v)


def canon_tr(S):
    m = min(S)
    return tuple(sorted(tuple(a - b for a, b in zip(p, m)) for p in S))


def canon_any(S):
    return min(canon_tr(S), canon_tr([tuple(-x for x in p) for p in S]))


def rank(rows, ncol):
    """rank over Q of integer rows (fraction-free elimination)"""
    m = [list(r) for r in rows if any(r)]
    rk = 0
    for c in range(ncol):
        piv = next((i for i in range(rk, len(m)) if m[i][c]), None)
        if piv is None:
            continue
        m[rk], m[piv] = m[piv], m[rk]
        pr = m[rk]
        for i in range(len(m)):
            if i != rk and m[i][c]:
                f, g = m[i][c], pr[c]
                m[i] = [g * x - f * y for x, y in zip(m[i], pr)]
        rk += 1
    return rk


S = None


def init(k):
    global S
    S = Search(k)


def work(item):
    lst, P, Q, q = item
    k = S.k
    key = S.canon(P, Q)
    # edges contained: dP[u] = s * dQ[v]
    dP = [tuple(b - a for a, b in zip(P[i], P[j])) for i, j in S.pairs]
    dQ = [tuple(b - a for a, b in zip(Q[i], Q[j])) for i, j in S.pairs]
    idx = collections.defaultdict(list)
    for v, d in enumerate(dQ):
        idx[d].append((v, 1))
        idx[tuple(-x for x in d)].append((v, -1))
    forms = []
    for u, d in enumerate(dP):
        for v, s in idx.get(d, []):
            forms.append([int(x) for x in S.edge_form(u, v, s)])
    dim = S.n - rank(forms, S.n)
    rk = rank([tuple(a - b for a, b in zip(p, P[0])) for p in P[1:]] + [tuple(a - b for a, b in zip(p, Q[0])) for p in Q[1:]],
              len(P[0]))
    return key.hex(), dim, rk, lst, q, P, Q


def main():
    args = sys.argv[1:]
    workers = os.cpu_count()
    if "--workers" in args:
        i = args.index("--workers")
        workers = int(args[i + 1])
        del args[i:i + 2]
    k, out, files = int(args[0]), args[1], args[2:]
    seen, items = set(), []
    nlines = 0
    for fn in files:
        lst = fn.rstrip("/").split("/")[-3] if fn.count("/") >= 2 else fn
        for line in open(fn):
            f = json.loads(line)
            if f.get("notes", len(f["members"][0]["ratios"])) != k:
                continue
            nlines += 1
            mem = [[vec(r) for r in m["ratios"]] for m in f["members"]]
            ident = tuple(sorted(canon_any(m) for m in mem))
            if ident in seen:
                continue
            seen.add(ident)
            q = max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])
            # every pair of members (a family of 3+ members gives several pairs)
            for a in range(len(mem)):
                for b in range(a + 1, len(mem)):
                    items.append((lst, mem[a], mem[b], q))
    print(f"{nlines} family lines read, {len(seen)} distinct families, {len(items)} member pairs", flush=True)
    classes = {}
    with mp.Pool(workers, initializer=init, initargs=(k,)) as pool, open(out + ".fams.tsv", "w") as ft:
        for key, dim, rk, lst, q, P, Q in pool.imap_unordered(work, items, chunksize=64):
            c = classes.get(key)
            if c is None:
                c = classes[key] = {"idx": len(classes), "key": key, "dim": dim, "count": 0, "minq": q,
                                    "example": {"q": q, "list": lst, "P": P, "Q": Q}, "lists": collections.Counter(),
                                    "ranks": collections.Counter()}
            c["count"] += 1
            c["lists"][lst] += 1
            c["ranks"][rk] += 1
            if q < c["minq"]:
                c["minq"] = q
                c["example"] = {"q": q, "list": lst, "P": P, "Q": Q}
            ft.write(f"{lst}\t{q}\t{dim}\t{rk}\t{c['idx']}\n")
    cl = sorted(classes.values(), key=lambda c: (-c["dim"], c["minq"], -c["count"]))
    with open(out + ".classes.jsonl", "w") as fc:
        for c in cl:
            c["lists"] = dict(c["lists"])
            c["ranks"] = dict(c["ranks"])
            fc.write(json.dumps(c) + "\n")
    print(f"{len(cl)} patterns")
    bydim = collections.Counter(c["dim"] for c in cl)
    famdim = collections.Counter()
    for c in cl:
        famdim[c["dim"]] += c["count"]
    for d in sorted(bydim, reverse=True):
        print(f"  dim {d}: {bydim[d]} patterns, {famdim[d]} member pairs")
    bands = [0, 27, 81, 135, 243, 405, 729, 1215, 2187, 3645, 6561, 10935, 19683, 32805, 59049, 98415, 177147, 10 ** 9]
    print("new patterns by q band (first q of the pattern), by dim:")
    for lo, hi in zip(bands, bands[1:]):
        sel = [c for c in cl if lo < c["minq"] <= hi]
        if sel:
            dc = collections.Counter(c["dim"] for c in sel)
            print(f"  q {lo + 1}-{hi}: {len(sel)} new ({', '.join(f'dim {d}: {dc[d]}' for d in sorted(dc, reverse=True))})")
    print("top dims, first 20 patterns:")
    for c in cl[:20]:
        print(f"  #{c['idx']} dim {c['dim']} count {c['count']} min q {c['minq']} ranks {c['ranks']} e.g. {c['example']['list']}")


if __name__ == "__main__":
    main()
