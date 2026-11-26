#!/usr/bin/env python3
"""zprod.py: JI Z-families in a gamut, built directly as products P = U*V with a small flipped factor V.

Factor law (Rosenblatt & Seymour; see zfactor.py): a Z-partner of P = U*V is Q = U*V* (V reversed:
every exponent negated); reversing U instead gives an inversion of Q, so it is the same family. Every
5-limit family found so far has a small signed factor (plus terms and a few minus terms that cancel).

Search, for one gamut G:
  1. V: signed polynomials with vp plus terms (lowest point at 0) and vm minus terms, vectors with
     |coordinate| <= --vmax. Each minus term is a lattice point of the convex hull of the plus terms,
     not a vertex (a minus term must be cancelled; following the cancellations around U closes a cycle,
     so it is a rational average of plus terms). V must differ from its reversal (else Q = P).
  2. U: any integer polynomial (coefficients --ucoeffs; 2 = doubled note) such that P = U*V has 0/1
     coefficients on gamut points only, and Q = U*V* has 0/1 coefficients. Candidate points: u + v lies
     in the gamut's bounding box for every term v of V (Newton polytopes: hull(P) = hull(U) + hull(V)).
     Depth-first over candidates in lexicographic order: a coefficient of P or Q is final once its last
     possible contributor is decided, so bad coefficients prune at once. sum(U) = k / V(1).
  3. Keep pairs where some transposition or inversion of Q fits the gamut and Q is not a transposition
     or inversion of P; group by interval content (zgen fingerprint) into families.
Families with no factor of at most --max-terms terms are not found (compare with an exhaustive run).

--interval-odd q (the agreed principle: intervallic odd limit): the gamut is odd <= q (unless --odd says
otherwise) and every interval inside P must have odd limit <= q. Checked during the U search: each P note
that becomes final is tested against all earlier final notes. Q has the same intervals, so it fits too.

usage (pypy3, on the VM):
  pypy3 zprod.py --zgen ~/zgen/zgen_v4.py --primes 3 5 --odd 123 --k 10 --workers 8 --out DIR
writes DIR/k<k>/families.jsonl (zgen format; check with verify_families.py) and DIR/summary.csv
"""
import argparse, collections, csv, importlib.util, itertools, json, os, sys, time
from fractions import Fraction
from math import gcd
from multiprocessing import Pool

Z = None
_G = _GSET = _BOX = _ARGS = _DSET = _HD = None


def load_zgen(path):
    spec = importlib.util.spec_from_file_location("zgen", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def add(u, v): return tuple(a + b for a, b in zip(u, v))
def sub(u, v): return tuple(a - b for a, b in zip(u, v))
def neg(u): return tuple(-a for a in u)


# ----------------------------------------------------------------------------- convex hull membership
def _rank(vs):
    M = [list(map(Fraction, v)) for v in vs]
    r = 0
    n = len(M[0]) if M else 0
    for c in range(n):
        p = next((i for i in range(r, len(M)) if M[i][c] != 0), None)
        if p is None:
            continue
        M[r], M[p] = M[p], M[r]
        for i in range(len(M)):
            if i != r and M[i][c] != 0:
                f = M[i][c] / M[r][c]
                M[i] = [a - f * b for a, b in zip(M[i], M[r])]
        r += 1
    return r


def in_hull(x, pts):
    """is lattice point x in the convex hull of pts (small sets: LP-free test by barycentric search)?
    Uses: x in hull iff x is a convex combination of some affinely independent subset (Caratheodory)."""
    d = len(x)
    for r in range(1, min(len(pts), d + 1) + 1):
        for sub_pts in itertools.combinations(pts, r):
            lam = _bary(x, sub_pts)
            if lam is not None and all(l >= 0 for l in lam):
                return True
    return False


def _bary(x, pts):
    """solve x = sum l_i p_i, sum l_i = 1 exactly; None if no unique solution"""
    r = len(pts)
    d = len(x)
    # equations: d coordinates + 1 (sum)
    A = [[Fraction(p[i]) for p in pts] + [Fraction(x[i])] for i in range(d)] + [[Fraction(1)] * r + [Fraction(1)]]
    rows = len(A)
    piv = []
    rr = 0
    for c in range(r):
        p = next((i for i in range(rr, rows) if A[i][c] != 0), None)
        if p is None:
            return None
        A[rr], A[p] = A[p], A[rr]
        pv = A[rr][c]
        A[rr] = [a / pv for a in A[rr]]
        for i in range(rows):
            if i != rr and A[i][c] != 0:
                f = A[i][c]
                A[i] = [a - f * b for a, b in zip(A[i], A[rr])]
        piv.append(c)
        rr += 1
    for i in range(rr, rows):
        if A[i][r] != 0:
            return None
    return [A[i][r] for i in range(r)]


# ----------------------------------------------------------------------------- V enumeration
def lex_positive_box(bounds):
    """lexicographically positive vectors with |v_i| <= bounds[i]"""
    out = []
    for v in itertools.product(*[range(-b, b + 1) for b in bounds]):
        if v > (0,) * len(bounds):
            out.append(v)
    return out


def interior_points(plus):
    """lattice points in the convex hull of `plus` that are not plus points themselves"""
    dim = len(plus[0])
    lo = [min(p[i] for p in plus) for i in range(dim)]
    hi = [max(p[i] for p in plus) for i in range(dim)]
    ps = set(plus)
    out = []
    for x in itertools.product(*[range(lo[i], hi[i] + 1) for i in range(dim)]):
        if x not in ps and in_hull(x, plus):
            out.append(x)
    return out


def normalize(terms):
    """terms: dict point -> coeff. Shift so the lexicographically smallest point is 0; make it positive"""
    m = min(terms)
    sgn = 1 if terms[m] > 0 else -1
    return tuple(sorted((sub(p, m), sgn * c) for p, c in terms.items()))


def reversal(V):
    return normalize({neg(p): c for p, c in V})


def _det(M):
    n = len(M)
    if n == 1:
        return M[0][0]
    if n == 2:
        return M[0][0] * M[1][1] - M[0][1] * M[1][0]
    return sum((-1) ** j * M[0][j] * _det([row[:j] + row[j + 1:] for row in M[1:]]) for j in range(n))


def _facets(G):
    """facet inequalities n.x <= c of hull(G) for a full-dimensional G (from d-subsets of G: O(|G|^(d+1)))"""
    dim = len(G[0])
    facets = set()
    for S in itertools.combinations(G, dim):
        D = [sub(p, S[0]) for p in S[1:]]
        n = tuple((-1) ** j * _det([row[:j] + row[j + 1:] for row in D]) for j in range(dim))
        if not any(n):
            continue
        c = sum(a * b for a, b in zip(n, S[0]))
        vals = [sum(a * b for a, b in zip(n, p)) - c for p in G]
        if all(v <= 0 for v in vals):
            facets.add((n, c))
        elif all(v >= 0 for v in vals):
            facets.add((tuple(-a for a in n), -c))
    return facets


def hull_lattice_fast(G):
    """same result as hull_lattice, exact, without scanning all d-subsets of G: facets are found on a small
    set C of hull vertices (the lexicographically largest maximizer of each direction in {-2..2}^d is a
    vertex), then every point of G is tested against them; points outside join C and the loop repeats.
    When no point of G is outside, G lies in hull(C) and C is a subset of G, so hull(C) = hull(G)."""
    G = [tuple(p) for p in G]
    dim = len(G[0])
    if dim == 1:
        return hull_lattice(G)
    C = set()
    for d in itertools.product(range(-2, 3), repeat=dim):
        if any(d):
            C.add(max(G, key=lambda p: (sum(a * b for a, b in zip(d, p)), p)))
    if _rank([sub(p, G[0]) for p in G]) < dim:
        return hull_lattice(G)
    while True:
        C_list = sorted(C)
        if _rank([sub(p, C_list[0]) for p in C_list]) < dim:  # not full-dimensional yet: widen
            C |= set(G)
            continue
        facets = _facets(C_list)
        outside = set()
        for n, c in facets:
            worst = max(G, key=lambda p: (sum(a * b for a, b in zip(n, p)), p))
            if sum(a * b for a, b in zip(n, worst)) > c:
                outside.add(worst)  # the point furthest beyond a facet is a vertex of hull(G)
        if not outside:
            break
        C |= outside
    lo = [min(p[i] for p in G) for i in range(dim)]
    hi = [max(p[i] for p in G) for i in range(dim)]
    box = itertools.product(*[range(lo[i], hi[i] + 1) for i in range(dim)])
    return {x for x in box if all(sum(a * b for a, b in zip(n, x)) <= c for n, c in facets)}


def hull_lattice(G):
    """all lattice points of the convex hull of G (facets from d-subsets of G; exact integer arithmetic)"""
    dim = len(G[0])
    lo = [min(p[i] for p in G) for i in range(dim)]
    hi = [max(p[i] for p in G) for i in range(dim)]
    box = list(itertools.product(*[range(lo[i], hi[i] + 1) for i in range(dim)]))
    if dim == 1:
        return set(box)
    facets = set()
    for S in itertools.combinations(G, dim):
        D = [sub(p, S[0]) for p in S[1:]]
        # normal: cofactors of the (dim-1) x dim matrix D
        n = tuple((-1) ** j * _det([row[:j] + row[j + 1:] for row in D]) for j in range(dim))
        if not any(n):
            continue
        c = sum(a * b for a, b in zip(n, S[0]))
        vals = [sum(a * b for a, b in zip(n, p)) - c for p in G]
        if all(v <= 0 for v in vals):
            facets.add((n, c))
        elif all(v >= 0 for v in vals):
            facets.add((tuple(-a for a in n), -c))
    return {x for x in box if all(sum(a * b for a, b in zip(n, x)) <= c for n, c in facets)}


def gen_V(bounds, shapes, H, HD=None):
    """yield signed V (tuple of (point, coeff)), lowest point 0 with coeff +1, for each (vp, vm) shape.
    Only factors that fit inside the gamut's hull after some transposition: hull(P) = hull(U) + hull(V)
    lies in the gamut's hull, so a factor that cannot fit there never gives a product in the gamut.
    The fit is checked while the plus points are chosen (pruning early); minus points lie in the plus
    points' hull, so they fit wherever the plus points do.
    --fast (HD = lattice points of the hull of the allowed intervals): instead, every difference of two
    plus points must lie in HD. Exact: for any direction f, width_f(V) <= width_f(P) (Newton polytopes:
    hull(P) = hull(U) + hull(V)) <= max f over the allowed intervals, since every difference of two
    notes of P is an allowed interval; so V - V lies in the hull of the allowed intervals. Minus points
    lie in the plus points' hull, so their differences do too."""
    dim = len(bounds)
    zero = (0,) * dim
    if HD is not None:
        box = [v for v in lex_positive_box(bounds) if v in HD]
    else:
        box = lex_positive_box(bounds)
    Hs = set(H)

    def plus_sets(need, start, chosen, T):
        if need == 0:
            yield chosen
            return
        for j in range(start, len(box)):
            v = box[j]
            if HD is not None:
                if all(sub(v, w) in HD for w in chosen):
                    yield from plus_sets(need - 1, j + 1, chosen + [v], T)
                continue
            T2 = [t for t in T if add(t, v) in Hs]
            if T2:
                yield from plus_sets(need - 1, j + 1, chosen + [v], T2)

    # no duplicate check is needed: 0 is the lexicographically smallest plus point and every minus point
    # lies in the hull of the plus points (so is larger), so each V is generated once, already normalized
    for vp, vm in shapes:
        for rest in plus_sets(vp - 1, 0, [], list(Hs)):
            plus = [zero] + list(rest)
            if vm == 0:
                cands = [()]
            else:
                inner = interior_points(plus)
                if len(inner) < vm:
                    continue
                cands = itertools.combinations(inner, vm)
            for minus in cands:
                terms = {p: 1 for p in plus}
                for p in minus:
                    terms[p] = -1
                V = normalize(terms)
                R = reversal(V)
                if R == V or R == normalize({p: -c for p, c in V}):
                    continue
                yield V


# ----------------------------------------------------------------------------- U search for one V
def search_U(V, ks):
    """all U with P = U*V 0/1 on gamut points and Q = U*V* 0/1; returns list of (P points, Q points)"""
    Vs = reversal(V)
    vsum = sum(c for _, c in V)
    if vsum <= 0:
        return [], True
    targets = sorted({k // vsum for k in ks if k % vsum == 0})
    if not targets:
        return [], True
    usum_max = max(targets)
    dim = len(_G[0])
    fast = _HD is not None
    if fast:
        # --fast: U's lowest point is 0 (coefficient forced to 1 below), so P's lowest note is 0 and each set
        # is built once, not at every transposition (lex-min of a product = sum of the lex-mins; V's is 0
        # with coefficient +1 and P's lowest coefficient is 1). U - U lies in the hull of the allowed
        # intervals (same width argument as for V in gen_V), so every U point is in _HD.
        zero = (0,) * dim
        cand = sorted(u for u in _HD if u >= zero)
    else:
        lo, hi = _BOX
        # candidate U points: u + v inside the bounding box for every term v of V
        vlo = [min(p[i] for p, _ in V) for i in range(dim)]
        vhi = [max(p[i] for p, _ in V) for i in range(dim)]
        cand = [u for u in itertools.product(*[range(lo[i] - vlo[i], hi[i] - vhi[i] + 1) for i in range(dim)])]
        cand.sort()
    if not cand:
        return [], True
    idx = {u: i for i, u in enumerate(cand)}
    # when is each P / Q point final? after its last (largest-index) contributor is decided
    def finals(W):
        last = {}
        for i, u in enumerate(cand):
            for v, _ in W:
                p = add(u, v)
                last[p] = i
        out = [[] for _ in cand]
        for p, i in last.items():
            out[i].append(p)
        return out
    finP, finQ = finals(V), finals(Vs)
    P = collections.defaultdict(int)
    Q = collections.defaultdict(int)
    res = []
    ucoeffs = _ARGS.ucoeffs
    # with negative U coefficients the sum alone does not bound the search: cap the negative mass
    # (--max-neg) and so the positive mass (target + negative mass)
    max_neg = _ARGS.max_neg
    pos_max = usum_max + max_neg
    state = {"usum": 0, "pos": 0, "neg": 0, "nodes": 0}
    budget = _ARGS.max_nodes
    # --interval-odd: P points already final with coefficient 1, in order (a stack, trimmed on backtrack);
    # every new final P note must make an allowed interval (difference in _DSET) with each of them
    DS = _DSET
    notes = []

    class Budget(Exception):
        pass

    def rec(i):
        state["nodes"] += 1
        if budget and state["nodes"] > budget:
            raise Budget
        if i == len(cand):
            if state["usum"] in targets:
                Ps = [p for p, c in P.items() if c == 1]
                Qs = [q for q, c in Q.items() if c == 1]
                if Ps:
                    res.append((Ps, Qs))
            return
        u = cand[i]
        for c in ((1,) if fast and i == 0 else ucoeffs):
            if c > 0 and state["pos"] + c > pos_max:
                continue
            if c < 0 and state["neg"] - c > max_neg:
                continue
            if c:
                for v, a in V:
                    P[add(u, v)] += c * a
                for v, a in Vs:
                    Q[add(u, v)] += c * a
            ok = True
            nn = len(notes)
            for p in finP[i]:
                x = P[p]
                if x < 0 or x > 1 or (x == 1 and not fast and p not in _GSET):
                    ok = False
                    break
                if x == 1 and DS is not None:
                    for r in notes:
                        if sub(p, r) not in DS:
                            ok = False
                            break
                    if not ok:
                        break
                    notes.append(p)
            if ok:
                for q in finQ[i]:
                    x = Q[q]
                    if x < 0 or x > 1:
                        ok = False
                        break
            if ok:
                state["usum"] += c
                if c > 0:
                    state["pos"] += c
                else:
                    state["neg"] -= c
                rec(i + 1)
                state["usum"] -= c
                if c > 0:
                    state["pos"] -= c
                else:
                    state["neg"] += c
            del notes[nn:]
            if c:
                for v, a in V:
                    P[add(u, v)] -= c * a
                for v, a in Vs:
                    Q[add(u, v)] -= c * a

    try:
        rec(0)
    except Budget:
        return res, False          # search for this V stopped at the node budget: possibly incomplete
    return res, True


def _init(G, args, HD=None):
    global _G, _GSET, _BOX, _ARGS, Z, _DSET, _HD
    _G, _GSET, _ARGS, _HD = G, set(G), args, HD
    Z = load_zgen(args.zgen)
    # allowed intervals: the odd <= q gamut is closed under negation, so it is the set of differences
    # (lattice vectors) whose ratio has odd limit <= q
    _DSET = set(Z.gamut(args.primes, args.interval_odd)) if args.interval_odd else None
    dim = len(G[0])
    _BOX = ([min(p[i] for p in G) for i in range(dim)], [max(p[i] for p in G) for i in range(dim)])


def _job(V):
    found = collections.defaultdict(set)
    n = 0
    prods, complete = search_U(V, _ARGS.k)
    for P, Q in prods:
        n += 1
        cp, cq = Z.canon(P), Z.canon(Q)
        if cp == cq:
            continue
        if _HD is None and not (Z.fits(Q, _GSET, _G) or Z.fits([neg(q) for q in Q], _GSET, _G)):
            continue       # (--fast: no gamut; Q has P's intervals, so it meets the interval limit too)
        fp = Z.fingerprint(cp)
        found[(len(cp), fp)].update((cp, cq))
    return V, dict(found), n, complete


def write_families_fast(run, fams, primes, Gsize):
    """zgen's families.jsonl format without the type classification (gl_canon is very slow for wide
    3-D families); type fields are null. verify_families.py and union_fams.py do not need them."""
    with open(os.path.join(run.out, "families.jsonl"), "w") as fh:
        for i, (k, members, ex) in enumerate(fams, 1):
            fp = Z.fingerprint(members[0])
            rec = {"family": i, "notes": k, "primes": list(primes), "gamut_size": Gsize, "type": None,
                   "type_rank": None, "members": [Z.member_record(M, primes) for M in members],
                   "interval_classes": [str(min(Z.ratio(v, primes), 2 / Z.ratio(v, primes))) for v in fp],
                   "distinct_interval_classes": len(set(fp))}
            rec.update(ex)
            fh.write(json.dumps(rec) + "\n")


def _job_chunk(chunk):
    return [_job(V) for V in chunk]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zgen", required=True, help="path to zgen.py (helpers and output format)")
    ap.add_argument("--primes", type=int, nargs="+", required=True)
    ap.add_argument("--odd", type=int, default=0, help="gamut: notes of odd limit <= this (default: --interval-odd)")
    ap.add_argument("--interval-odd", type=int, default=0,
                    help="only sets whose every interval has odd limit <= q (pruned during the U search); "
                         "the partner has the same intervals, so it fits the odd <= q gamut too")
    ap.add_argument("--fast", action="store_true",
                    help="with --interval-odd: no gamut; factors V pruned by the allowed intervals' hull and U "
                         "anchored at 0, so each set is built once (exact; see gen_V and search_U)")
    ap.add_argument("--k", type=int, nargs="+", required=True)
    ap.add_argument("--shapes", nargs="+", default=["2,1", "3,1", "3,2", "4,1", "4,2"],
                    help="V shapes vp,vm (plus terms incl. the lowest, minus terms)")
    ap.add_argument("--vmax", type=int, default=0,
                    help="largest |coordinate| of a V vector (0 = the gamut's extent in each dimension)")
    ap.add_argument("--ucoeffs", type=int, nargs="+", default=[0, 1, 2])
    ap.add_argument("--max-neg", type=int, default=1, help="largest total of negative U coefficients (if -1 allowed)")
    ap.add_argument("--max-nodes", type=int, default=2_000_000,
                    help="search steps per factor V before it is stopped and reported (0 = no limit)")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--count-only", action="store_true", help="only count the factors V per shape, no search")
    ap.add_argument("--no-types", action="store_true", help="write families without the (slow) type classification")
    ap.add_argument("--hull-cache", default="",
                    help="with --fast: directory caching the allowed intervals' hull per (primes, q)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    global Z
    Z = load_zgen(a.zgen)
    run = Z.Run(a.out)
    if not a.odd:
        if not a.interval_odd:
            ap.error("give --odd or --interval-odd")
        a.odd = a.interval_odd
    G = Z.gamut(a.primes, a.odd)
    shapes = [tuple(int(x) for x in s.split(",")) for s in a.shapes]
    dim = len(G[0])
    extent = [max(p[i] for p in G) - min(p[i] for p in G) for i in range(dim)]
    bounds = extent if a.vmax <= 0 else [min(a.vmax, e) for e in extent]
    HD = None
    if a.fast:
        if not a.interval_odd:
            ap.error("--fast needs --interval-odd")
        D = Z.gamut(a.primes, a.interval_odd)          # allowed intervals (closed under negation)
        HD = None
        cache = None
        if a.hull_cache:   # hull_lattice is C(len(D), dim) facet candidates: minutes to an hour at 11-limit
            os.makedirs(a.hull_cache, exist_ok=True)
            cache = os.path.join(a.hull_cache, f"hd_p{'-'.join(map(str, a.primes))}_q{a.interval_odd}.json")
            if os.path.exists(cache):
                with open(cache) as fh:
                    c = json.load(fh)
                if sorted(map(tuple, c["D"])) == sorted(map(tuple, D)):
                    HD = {tuple(x) for x in c["HD"]}
                    run.say(f"--fast: allowed-interval hull loaded from {cache}")
        if HD is None:
            # No hull computation needed: D = the lattice points of the convex set
            # R = {x : sum_i log(p_i) max(x_i, 0) <= log q and sum_i log(p_i) max(-x_i, 0) <= log q}
            # (numerator and denominator odd parts <= q; both sides are convex in x). conv(D) lies in R, so
            # every lattice point of conv(D) is in D: hull_lattice(D) == D for any primes and q (checked
            # against the brute force and the cached hulls by data/vm/check_hull_eq.py).
            HD = {tuple(p) for p in D}
            if cache:
                tmp = f"{cache}.{os.getpid()}.tmp"
                with open(tmp, "w") as fh:
                    json.dump({"D": sorted(map(list, D)), "HD": sorted(map(list, HD))}, fh)
                os.replace(tmp, cache)
        bounds = [max(abs(p[i]) for p in D) for i in range(dim)]
        H = HD
        run.say(f"--fast: {len(D)} allowed intervals, {len(HD)} lattice points in their hull")
    else:
        H = hull_lattice(G)
    run.say(f"gamut {len(G)} notes ({a.primes}, odd <= {a.odd}), {len(H)} lattice points in its hull; k {a.k}; "
            f"V shapes {shapes}, |coord| <= {bounds}; U coefficients {a.ucoeffs}"
            + (f"; intervallic odd limit <= {a.interval_odd}" if a.interval_odd else ""))
    t0 = time.time()
    if a.count_only:
        for sh in shapes:
            t1 = time.time()
            c = sum(1 for _ in gen_V(bounds, [sh], H, HD))
            run.say(f"  shape {sh[0]},{sh[1]}: {c:,} factors V that fit the hull ({time.time() - t1:.0f}s)")
        return
    allf = collections.defaultdict(set)
    nprod = 0
    n = 0
    stopped = []
    # The pool is started before any factor is generated, and factors are fed in small chunks with a
    # bounded number in flight (rolling: a new chunk goes out as soon as one comes back), so the parent
    # never holds the full factor list and no worker waits for a slow factor elsewhere (a batch barrier
    # left 75% of the CPU idle in 3-D).
    done_q = collections.deque()
    with Pool(a.workers, initializer=_init, initargs=(G, a, HD)) as pool:
        gen = gen_V(bounds, shapes, H, HD)
        inflight = 0
        limit = a.workers * 4
        exhausted = False
        last_report = time.time()
        while True:
            while not exhausted and inflight < limit:
                chunk = list(itertools.islice(gen, 500))
                if not chunk:
                    exhausted = True
                    break
                pool.apply_async(_job_chunk, (chunk,), callback=done_q.append,
                                 error_callback=lambda e: done_q.append(e))
                inflight += 1
            if exhausted and inflight == 0:
                break
            if not done_q:
                time.sleep(0.02)
                continue
            item = done_q.popleft()
            if isinstance(item, BaseException):
                raise RuntimeError(f"a worker failed: {item!r}")      # never wait forever for a lost chunk
            for V, found, cnt, complete in item:
                n += 1
                nprod += cnt
                if not complete:
                    stopped.append(V)
                for key, members in found.items():
                    allf[key] |= members
            inflight -= 1
            if time.time() - last_report > 60:
                last_report = time.time()
                fams = sum(1 for (k, _), m in allf.items() if len(m) >= 2)
                run.say(f"  {n:,} factors, {nprod:,} products, {fams} families, "
                        f"{len(stopped)} factors stopped at the node budget, {time.time() - t0:.0f}s")
    run.say(f"{n:,} factors V searched")
    if stopped:
        with open(os.path.join(a.out, "stopped_factors.jsonl"), "w") as fh:
            for V in stopped:
                fh.write(json.dumps([[list(p), c] for p, c in V]) + "\n")
        run.say(f"WARNING: {len(stopped)} factors hit --max-nodes {a.max_nodes}; their U search is incomplete "
                f"(listed in stopped_factors.jsonl)")
    rows = []
    for k in a.k:
        fams = [(k, [list(m) for m in sorted(ms)], {"mechanism": "zprod U*V, V flipped"})
                for (kk, fp), ms in sorted(allf.items()) if kk == k and len(ms) >= 2]
        sub_run = Z.Run(os.path.join(a.out, f"k{k}"))
        if a.no_types:
            write_families_fast(sub_run, fams, a.primes, len(G))
        else:
            Z.write_families(sub_run, fams, a.primes, len(G), {})
        sizes = collections.Counter(len(f[1]) for f in fams)
        rows.append({"k": k, "families": len(fams), "family_sizes": dict(sorted(sizes.items()))})
        run.say(f"k={k}: {len(fams)} families (members per family: {dict(sorted(sizes.items()))})")
    with open(os.path.join(a.out, "summary.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["k", "families", "family_sizes"])
        w.writeheader(); w.writerows(rows)
    run.say(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
