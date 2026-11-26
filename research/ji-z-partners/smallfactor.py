#!/usr/bin/env python3
"""smallfactor.py: which Z-families have a 3-term flipped factor V? (idea #1 of OPTIMIZE_BRIEF.md;
see THEORY_SMALL_FACTOR.md). Plain CPython, no sympy, exact integer arithmetic.

For each family and each member Q other than the first (P), and for Q' = Q and Q' = inversion of Q:
look for V = 1 + s x^a + t x^b (s, t = +1 or -1; a < b lexicographically; P, Q' shifted so their
lowest point is 0) with P = U*V and Q' = U*V* (up to a monomial and sign; U any integer polynomial).

Why fixing a and s determines b: from P = U V, Q' = U V* we get Q' V = (unit) P V*. Comparing lowest
terms fixes the unit as t x^b, and the identity rearranges to
    x^b (Q' - P - s x^-a P) = t (P - Q' - s x^a Q'),
so b = (lowest point of the right side) - (lowest point of the left), t = ratio of their lowest
coefficients, and the identity is then checked term by term. A hit is confirmed by exact division
U = P / V (lexicographic long division) and by recomputing U V*.
Candidates for a: lattice points of conv(P - P) that are lexicographically positive (Newton
polytopes: V - V lies in conv(P - P), see zprod.gen_V).

usage: python smallfactor.py FAMILIES.jsonl [--k 6 7 ...] [--limit N]
prints one line per family (k, q, pattern found or NONE) to stdout and a summary to stderr."""
import argparse, collections, json, sys, time
from fractions import Fraction


def add(u, v): return tuple(x + y for x, y in zip(u, v))
def sub(u, v): return tuple(x - y for x, y in zip(u, v))
def neg(u): return tuple(-x for x in u)


def odd(n):
    while n % 2 == 0:
        n //= 2
    return n


def iol(f):
    return max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])


def shift0(S):
    m = min(S)
    return [sub(p, m) for p in S]


def hull_lattice_2d_or_box(D):
    """lattice points of conv(D) (exact, 2-D via half-planes; other dimensions: bounding box)"""
    dim = len(D[0])
    lo = [min(p[i] for p in D) for i in range(dim)]
    hi = [max(p[i] for p in D) for i in range(dim)]
    import itertools
    box = list(itertools.product(*[range(lo[i], hi[i] + 1) for i in range(dim)]))
    if dim != 2:
        return box
    pts = sorted(set(D))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0: lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0: upper.pop()
        upper.append(p)
    H = lower[:-1] + upper[:-1]
    if len(H) < 3:
        return [x for x in box if x in set(pts)] if len(H) < 2 else box
    return [x for x in box if all(cross(H[i], H[(i + 1) % len(H)], x) >= 0 for i in range(len(H)))]


def poly(S):
    return {p: 1 for p in S}


def shifted(F, v, c=1):
    return {add(p, v): c * x for p, x in F.items()}


def plus(*Fs):
    out = collections.defaultdict(int)
    for F in Fs:
        for p, x in F.items():
            out[p] += x
    return {p: x for p, x in out.items() if x}


def mul(A, B):
    out = collections.defaultdict(int)
    for p, x in A.items():
        for q, y in B.items():
            out[add(p, q)] += x * y
    return {p: x for p, x in out.items() if x}


def divide(P, V, bound):
    """exact quotient P / V in Z[x, x^-1] (lex long division) or None. bound = (lo, hi) box for U points"""
    R = dict(P)
    vmax = max(V)
    cv = V[vmax]
    U = {}
    lo, hi = bound
    while R:
        r = max(R)
        u = sub(r, vmax)
        if any(u[i] < lo[i] or u[i] > hi[i] for i in range(len(u))) or R[r] % cv:
            return None
        c = R[r] // cv
        U[u] = U.get(u, 0) + c
        for v, a in V.items():
            p = add(u, v)
            x = R.get(p, 0) - c * a
            if x:
                R[p] = x
            else:
                R.pop(p, None)
    return {p: x for p, x in U.items() if x}


def canon_poly(F):
    m = min(F)
    s = 1 if F[m] > 0 else -1
    return tuple(sorted((sub(p, m), s * x) for p, x in F.items()))


def three_term(P, Qp, cands):
    """all (s, t, a, b, U) with P = U V, Q' = U V* (V = 1 + s x^a + t x^b, a < b)"""
    Pp, Qd = poly(P), poly(Qp)
    hits = []
    dim = len(P[0])
    lo = [min(p[i] for p in P) - max(abs(c[i]) for c in cands) for i in range(dim)]
    hi = [max(p[i] for p in P) + max(abs(c[i]) for c in cands) for i in range(dim)]
    for a in cands:
        for s in (1, -1):
            L = plus(Qd, shifted(Pp, (0,) * dim, -1), shifted(Pp, neg(a), -s))
            R = plus(Pp, shifted(Qd, (0,) * dim, -1), shifted(Qd, a, -s))
            if not L or not R:
                continue
            lm, rm = min(L), min(R)
            b = sub(rm, lm)
            if not b > a:
                continue
            if R[rm] == L[lm]:
                t = 1
            elif R[rm] == -L[lm]:
                t = -1
            else:
                continue
            if len(L) != len(R) or any(R.get(add(p, b), 0) != t * x for p, x in L.items()):
                continue
            V = {(0,) * dim: 1, a: s, b: t}
            U = divide(Pp, V, (lo, hi))
            if U is None:
                continue
            Vs = {neg(p): x for p, x in V.items()}
            if canon_poly(mul(U, V)) != canon_poly(Pp) or canon_poly(mul(U, Vs)) != canon_poly(Qd):
                continue
            hits.append((s, t, a, b, U))
    return hits


def m_term(P, Qp, cands, m, signs=(1, -1)):
    """all V with m terms, coefficients +-1 (fixed points' signs from `signs`, last sign solved), with
    P = U V and Q' = U V*. Same identity as three_term: with V = 1 + sum s_i x^a_i + w x^c (a_i < c),
        x^c (Q' - P - sum s_i x^-a_i P) = w (P - Q' - sum s_i x^a_i Q').
    Yields (V, U)."""
    import itertools
    Pp, Qd = poly(P), poly(Qp)
    dim = len(P[0])
    z = (0,) * dim
    lo = [min(p[i] for p in P) - max(abs(c[i]) for c in cands) for i in range(dim)]
    hi = [max(p[i] for p in P) + max(abs(c[i]) for c in cands) for i in range(dim)]
    L0 = plus(Qd, shifted(Pp, z, -1))
    R0 = plus(Pp, shifted(Qd, z, -1))
    for pts in itertools.combinations(cands, m - 2):
        for ss in itertools.product(signs, repeat=m - 2):
            L = plus(L0, *[shifted(Pp, neg(a), -s) for a, s in zip(pts, ss)])
            R = plus(R0, *[shifted(Qd, a, -s) for a, s in zip(pts, ss)])
            if not L or not R:
                continue
            lm, rm = min(L), min(R)
            c = sub(rm, lm)
            if not c > pts[-1]:
                continue
            if R[rm] == L[lm]:
                w = 1
            elif R[rm] == -L[lm]:
                w = -1
            else:
                continue
            if len(signs) == 1 and w != signs[0]:
                continue
            if len(L) != len(R) or any(R.get(add(p, c), 0) != w * x for p, x in L.items()):
                continue
            V = {z: 1, c: w}
            for a, s in zip(pts, ss):
                V[a] = s
            U = divide(Pp, V, (lo, hi))
            if U is None:
                continue
            Vs = {neg(p): x for p, x in V.items()}
            if canon_poly(mul(U, V)) != canon_poly(Pp) or canon_poly(mul(U, Vs)) != canon_poly(Qd):
                continue
            yield V, U


def label(s, t, U):
    if s == 1 and t == 1:
        kind = "chord+"            # plus-only 3-term V (zprod shape 3,0)
    elif s == -1 and t == 1:
        kind = "2,1"               # signed V with V(1) = 1 (zprod shape 2,1)
    else:
        kind = f"s{s:+d}t{t:+d}"
    negs = -sum(x for x in U.values() if x < 0)
    return kind, negs, max(U.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("families")
    ap.add_argument("--k", type=int, nargs="*")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-q", type=int, default=0, help="only families with intervallic odd limit <= this")
    ap.add_argument("--ids", help="file with family numbers (first column) to test; others skipped")
    ap.add_argument("--terms", type=int, default=3, help="3 (default report) or m >= 4: m-term V search")
    ap.add_argument("--plus-only", action="store_true", help="with --terms m: only plus-only V")
    args = ap.parse_args()
    if args.terms > 3:
        return main_m(args)
    t0 = time.time()
    summary = collections.Counter()
    n = 0
    for line in open(args.families):
        f = json.loads(line)
        k = f["notes"]
        if args.k and k not in args.k:
            continue
        n += 1
        if args.limit and n > args.limit:
            break
        mem = [[tuple(p) for p in m["lattice"]] for m in f["members"]]
        P = shift0(mem[0])
        D = sorted({sub(x, y) for x in P for y in P})
        zero = (0,) * len(P[0])
        cands = sorted(c for c in hull_lattice_2d_or_box(D) if c > zero)
        best = []
        for j in range(1, len(mem)):
            found = set()
            for Q in (mem[j], [neg(p) for p in mem[j]]):
                for s, t, a, b, U in three_term(P, shift0(Q), cands):
                    found.add(label(s, t, U))
            best.append(found)
        # per family: kinds found for EVERY partner of member 0 (min over partners of the best option)
        kinds = set.intersection(*[{x[0] for x in fs} for fs in best]) if best else set()
        chord = [x for fs in best for x in fs if x[0] == "chord+"]
        minneg = min((x[1] for x in chord), default=None)
        q = iol(f)
        # per kind found for every partner: smallest negative mass of U and smallest top U coefficient
        stats = []
        for kind in sorted(kinds):
            xs = [x for fs in best for x in fs if x[0] == kind]
            stats.append(f"{kind}(U neg {min(x[1] for x in xs)}, U max {min(x[2] for x in xs)})")
        print(f"{f['family']}\tk={k}\tq={q}\tmembers={len(mem)}\t{' '.join(stats) or 'NONE'}")
        key = "chord+" if "chord+" in kinds else ("2,1" if "2,1" in kinds else ("other3" if kinds else "NONE"))
        summary[(k, key)] += 1
        if key == "chord+":
            summary[(k, f"chord_neg{minneg}")] += 1
    print(f"\n{n} families, {time.time() - t0:.1f} s", file=sys.stderr)
    for k in sorted({k for k, _ in summary}):
        print(f"k={k}: " + ", ".join(f"{key} {c}" for (kk, key), c in sorted(summary.items()) if kk == k),
              file=sys.stderr)


def main_m(args):
    """m-term search: per family, the first V found (any member partner, Q or its inversion)"""
    ids = None
    if args.ids:
        ids = {int(l.split()[0]) for l in open(args.ids) if l.strip()}
    signs = (1,) if args.plus_only else (1, -1)
    t0 = time.time()
    summary = collections.Counter()
    for line in open(args.families):
        f = json.loads(line)
        if ids is not None and f["family"] not in ids:
            continue
        if args.k and f["notes"] not in args.k:
            continue
        q = iol(f)
        if args.max_q and q > args.max_q:
            continue
        mem = [[tuple(p) for p in m["lattice"]] for m in f["members"]]
        P = shift0(mem[0])
        D = sorted({sub(x, y) for x in P for y in P})
        zero = (0,) * len(P[0])
        cands = sorted(c for c in hull_lattice_2d_or_box(D) if c > zero)
        hit = None
        t1 = time.time()
        for Q in (mem[1], [neg(p) for p in mem[1]]):
            for V, U in m_term(P, shift0(Q), cands, args.terms, signs):
                negs = -sum(x for x in U.values() if x < 0)
                if hit is None or negs < hit[2]:
                    hit = (V, U, negs)
            if hit and hit[2] == 0:
                break
        k = f["notes"]
        if hit:
            V, U, negs = hit
            vp = sum(1 for x in V.values() if x > 0)
            desc = f"V {vp},{len(V) - vp} {sorted(V.items())}  U: {len(U)} terms, neg mass {negs}, max {max(U.values())}"
            summary[(k, f"{vp},{len(V) - vp}")] += 1
        else:
            desc = "NONE"
            summary[(k, "NONE")] += 1
        print(f"{f['family']}\tk={k}\tq={q}\tcands={len(cands)}\t{time.time() - t1:.1f}s\t{desc}", flush=True)
    print(f"\n{time.time() - t0:.1f} s", file=sys.stderr)
    for k in sorted({k for k, _ in summary}):
        print(f"k={k}: " + ", ".join(f"{key} {c}" for (kk, key), c in sorted(summary.items()) if kk == k),
              file=sys.stderr)


if __name__ == "__main__":
    main()
