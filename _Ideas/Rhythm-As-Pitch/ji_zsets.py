#!/usr/bin/env python3
"""
JI-level Z-relation search (homometric sets on the prime lattice).

A p-limit scale, up to octaves, is a set of points on the lattice of odd-prime
exponents (for 5-limit: powers of 3 and 5). Transposing the scale shifts the set;
inverting it (r -> 1/r) negates it. Two scales are Z-related when they have the
same multiset of interval classes (difference vectors up to sign) but are not
transpositions or inversions of each other.

The search is exhaustive over every set of k notes whose exponents span at most
--span in each prime, for k from --min-notes to --max-notes.

It runs in two passes and can be stopped and restarted at any time:
  1. enumerate: each set's interval-vector hash and canonical form go to shard
     files on disk (finished jobs are logged, so a restart skips them);
  2. collect: each shard is grouped by hash, collisions are verified exactly,
     and Z-families are written to families.jsonl and summary.csv.

Standard library only. Runs under CPython 3.9+; PyPy is several times faster.

Construction mode (--construct) does not search exhaustively. It builds
Z-pairs directly: for small sets A and B on the lattice, A+B (every note of A
moved by every note of B) and A-B always share their interval content
(Rosenblatt and Seymour). Each candidate is verified, duplicates are dropped,
and the simplest are kept, for every prime limit in --primes and every note
count in --notes. It finds many Z-pairs quickly but cannot prove a list complete.

EDO mode (--edo) searches equal divisions instead: every k-note subset of an
N-step ring, for N from --edo-min to --edo-max and k from 3 to N-1, grouped by
interval vector (circular step distances). Sets are named by their gaps, as in
the app (smallest rotation or reversal). Sizes above N/2 come from complements:
two sets are Z-related exactly when their complements are.

Gamut mode (--gamut-odd-limit q, or --gamut "ratios") searches every k-note
subset of a fixed JI gamut (all ratios within odd limit q, or the ratios you
give) and groups them by JI interval content. It finds every Z-pair whose
members both lie in the gamut; partners that need notes outside it are not
found. Large gamuts grow fast, so it estimates the work first and stops if it
is too big unless you add --force.

Examples
  python3 ji_zsets.py --edo --edo-min 5 --edo-max 31
  python3 ji_zsets.py --gamut-odd-limit 13 --min-notes 3 --max-notes 8
  python3 ji_zsets.py --test                      # should report 2 families
  python3 ji_zsets.py --construct --primes 3 5 7 11 13 17 19 --notes 6 8 9 12 --per 50
  python3 ji_zsets.py --primes 3 5 --span 5 --min-notes 4 --max-notes 7
  python3 ji_zsets.py --primes 3 5 7 --span 2 --max-notes 7 --workers 8
  python3 ji_zsets.py --collect-only --out results_3_5_span5   # redo pass 2 only
"""
import argparse
import hashlib
import itertools
import json
import math
import os
import sys
import time
from collections import defaultdict
from fractions import Fraction
from multiprocessing import Pool

# ----------------------------------------------------------------- geometry

def candidates(n, span):
    """Points strictly greater than the origin (lexicographically), first
    coordinate 0..span, the others -span..span. Every translation class of a
    set has exactly one representative whose lexicographic minimum is the
    origin, so sets are built as {origin} + (k-1) of these points."""
    zero = (0,) * n
    pts = [v for v in itertools.product(range(0, span + 1),
                                        *[range(-span, span + 1)] * (n - 1))
           if v > zero]
    return pts


def fits_span(S, span):
    n = len(S[0])
    for i in range(n):
        col = [v[i] for v in S]
        if max(col) - min(col) > span:
            return False
    return True


def normalize(S):
    """Translate so the lexicographic minimum sits at the origin; sort."""
    m = min(S)
    return tuple(sorted(tuple(a - b for a, b in zip(v, m)) for v in S))


def canonical(S):
    """Smallest of the normalized set and its negation (inversion)."""
    a = normalize(S)
    b = normalize([tuple(-x for x in v) for v in S])
    return a if a <= b else b


def sign_norm(d):
    for x in d:
        if x != 0:
            return d if x > 0 else tuple(-y for y in d)
    return d


def interval_key(S):
    diffs = []
    for i in range(len(S)):
        for j in range(i + 1, len(S)):
            diffs.append(sign_norm(tuple(a - b for a, b in zip(S[j], S[i]))))
    diffs.sort()
    return diffs


def key_hash(key):
    return hashlib.blake2b(repr(key).encode(), digest_size=8).hexdigest()


def set_str(S):
    return ";".join(",".join(map(str, v)) for v in S)


def parse_set(s):
    return tuple(tuple(int(x) for x in p.split(",")) for p in s.split(";"))

# ----------------------------------------------------------------- ratios

def octave_reduce(r):
    while r < 1:
        r *= 2
    while r >= 2:
        r /= 2
    return r


def ratio_of(v, primes):
    r = Fraction(1)
    for p, e in zip(primes, v):
        r *= Fraction(p) ** e
    return octave_reduce(r)


def interval_class(r):
    r = octave_reduce(r)
    s = octave_reduce(1 / r)
    return min(r, s)


def best_scale(S, primes):
    """Choose which note is 1/1 so the scale is as simple as possible
    (smallest total Tenney height), and return its ratios."""
    best = None
    for p in S:
        rs = sorted(ratio_of(tuple(a - b for a, b in zip(v, p)), primes) for v in S)
        cost = sum(math.log2(r.numerator * r.denominator) for r in rs)
        if best is None or cost < best[0]:
            best = (cost, rs)
    return best[1]

# ----------------------------------------------------------------- pass 1

_G = {}


def lower_priority():
    """Run below normal priority so the computer stays responsive."""
    try:
        if os.name == "nt":
            import ctypes
            BELOW_NORMAL = 0x00004000
            ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), BELOW_NORMAL)
        else:
            os.nice(10)
    except Exception:
        pass


def _init(n, span, k, shards, cands, low):
    if low:
        lower_priority()
    _G.update(n=n, span=span, k=k, shards=shards, cands=cands)


def run_job(i):
    """All sets whose smallest non-origin point is cands[i]."""
    n, span, k, shards, C = _G["n"], _G["span"], _G["k"], _G["shards"], _G["cands"]
    origin = (0,) * n
    first = C[i]
    out = defaultdict(list)
    count = 0
    for rest in itertools.combinations(C[i + 1:], k - 2):
        S = (origin, first) + rest
        if not fits_span(S, span):
            continue
        canon = canonical(S)
        if canon != normalize(S):
            continue                      # its inversion is the representative
        h = key_hash(interval_key(S))
        out[int(h, 16) % shards].append(f"{h}\t{set_str(canon)}\n")
        count += 1
    return i, count, dict(out)


def enumerate_k(args, n, k, outdir):
    kdir = os.path.join(outdir, f"k{k}")
    os.makedirs(kdir, exist_ok=True)
    done_path = os.path.join(kdir, "done_jobs.txt")
    done = set()
    if os.path.exists(done_path):
        with open(done_path) as fh:
            done = {int(x) for x in fh.read().split()}
    C = candidates(n, args.span)
    jobs = [i for i in range(len(C)) if i not in done and len(C) - i - 1 >= k - 2]
    if k == 2:
        jobs = [i for i in range(len(C)) if i not in done]
    total_jobs = len(done) + len(jobs)
    if not jobs:
        print(f"  k={k}: all {total_jobs} jobs already done")
        return
    print(f"  k={k}: {len(C)} candidate points, {len(jobs)} jobs to run "
          f"({len(done)} already done)", flush=True)
    t0 = time.time()
    handles = [open(os.path.join(kdir, f"shard_{s:03d}.tsv"), "a")
               for s in range(args.shards)]
    finished, sets_written = len(done), 0
    with Pool(args.workers, initializer=_init,
              initargs=(n, args.span, k, args.shards, C, not args.normal_priority)) as pool, \
            open(done_path, "a") as done_fh:
        for i, count, out in pool.imap_unordered(run_job, jobs):
            for s, lines in out.items():
                handles[s].writelines(lines)
            for h in handles:
                h.flush()
            done_fh.write(f"{i}\n")
            done_fh.flush()
            finished += 1
            sets_written += count
            if finished % max(1, total_jobs // 20) == 0 or finished == total_jobs:
                el = time.time() - t0
                print(f"    k={k}: {finished}/{total_jobs} jobs, "
                      f"{sets_written:,} set classes, {el/60:.1f} min", flush=True)
    for h in handles:
        h.close()

# ----------------------------------------------------------------- pass 2

def collect(args, n, primes, outdir):
    fam_path = os.path.join(outdir, "families.jsonl")
    summary = []
    n_fams = 0
    with open(fam_path, "w") as fam_fh:
        for k in range(args.min_notes, args.max_notes + 1):
            kdir = os.path.join(outdir, f"k{k}")
            if not os.path.isdir(kdir):
                continue
            classes, families = 0, 0
            for s in range(args.shards):
                path = os.path.join(kdir, f"shard_{s:03d}.tsv")
                if not os.path.exists(path):
                    continue
                groups = defaultdict(set)
                with open(path) as fh:
                    for line in fh:
                        h, c = line.rstrip("\n").split("\t")
                        groups[h].add(c)
                classes += sum(len(g) for g in groups.values())
                for h, members in groups.items():
                    if len(members) < 2:
                        continue
                    exact = defaultdict(list)          # guard against hash collisions
                    for c in members:
                        exact[repr(interval_key(parse_set(c)))].append(c)
                    for key, ms in exact.items():
                        if len(ms) < 2:
                            continue
                        families += 1
                        n_fams += 1
                        sets = [parse_set(c) for c in sorted(ms)]
                        scales = [best_scale(S, primes) for S in sets]
                        ics = sorted(
                            (str(interval_class(b / a)) for a, b in
                             itertools.combinations(scales[0], 2)),
                            key=lambda x: Fraction(x))
                        rec = {
                            "family": n_fams, "notes": k, "primes": primes,
                            "span": args.span,
                            "members": [{"lattice": [list(v) for v in S],
                                         "ratios": [str(r) for r in sc]}
                                        for S, sc in zip(sets, scales)],
                            "interval_classes": ics,
                            "distinct_interval_classes": len(set(ics)),
                        }
                        fam_fh.write(json.dumps(rec) + "\n")
            summary.append((k, classes, families))
            print(f"  k={k}: {classes:,} set classes, {families} Z-families", flush=True)
    with open(os.path.join(outdir, "summary.csv"), "w") as fh:
        fh.write("notes,set_classes,z_families,primes,span\n")
        for k, c, f in summary:
            fh.write(f"{k},{c},{f},{' '.join(map(str, primes))},{args.span}\n")
    return summary


# ----------------------------------------------------------------- construction

def tenney(rs):
    return sum(math.log2(r.numerator * r.denominator) for r in rs)


def construct_mode(args):
    import random
    rng = random.Random(args.seed)
    all_primes = args.primes
    outdir = args.out or "results_constructed"
    os.makedirs(outdir, exist_ok=True)
    fam_path = os.path.join(outdir, "families_constructed.jsonl")
    summary = []
    fam_no = 0
    with open(fam_path, "w") as fh:
        for li, P in enumerate(all_primes):
            primes = all_primes[:li + 1]
            n = len(primes)
            # widen the exponent range in low dimensions so there are enough points
            R = args.exp_range
            while (2 * R + 1) ** n - 1 < 3 * max(args.notes):
                R += 1
            for k in args.notes:
                splits = [(a, k // a) for a in range(3, k) if k % a == 0 and k // a >= 3 and a <= k // a]
                if not splits:
                    print(f"  {P}-limit, {k} notes: skipped; {k} isn't a product of two sizes of at least 3 "
                          "(a 2-note factor is symmetric, so A+B and A-B would be the same set)")
                    continue
                found = {}
                attempts = 0
                cap = args.per * args.tries
                while attempts < cap and len(found) < args.per * 4:
                    attempts += 1
                    a, b = rng.choice(splits)
                    if rng.random() < 0.5:
                        a, b = b, a
                    def pt():
                        # small exponents, mostly zero, so results stay simple
                        return tuple(rng.choice((0, 0, 0, 1, -1)) if R == 1 else
                                     rng.choice([0] * (2 * R) + list(range(-R, R + 1)))
                                     for _ in range(n))
                    zero = (0,) * n
                    A = {zero}
                    while len(A) < a:
                        A.add(pt())
                    B = {zero}
                    while len(B) < b:
                        B.add(pt())
                    S1 = {tuple(x + y for x, y in zip(u, v)) for u in A for v in B}
                    S2 = {tuple(x - y for x, y in zip(u, v)) for u in A for v in B}
                    if len(S1) != k or len(S2) != k:
                        continue                              # sums collided
                    S1, S2 = tuple(S1), tuple(S2)
                    if n and all(v[-1] == S1[0][-1] for v in S1):
                        continue                              # doesn't use the limit prime
                    c1, c2 = canonical(S1), canonical(S2)
                    if c1 == c2:
                        continue                              # just a transposition/inversion
                    if interval_key(S1) != interval_key(S2):
                        continue                              # never expected; kept as a guard
                    key = tuple(sorted((c1, c2)))
                    if key in found:
                        continue
                    sc1, sc2 = best_scale(c1, primes), best_scale(c2, primes)
                    found[key] = (tenney(sc1) + tenney(sc2), c1, c2, sc1, sc2, A, B)
                best = sorted(found.values(), key=lambda t: t[0])[:args.per]
                for cost, c1, c2, sc1, sc2, A, B in best:
                    fam_no += 1
                    ics = sorted((str(interval_class(y / x)) for x, y in itertools.combinations(sc1, 2)),
                                 key=lambda t: Fraction(t))
                    fh.write(json.dumps({
                        "family": fam_no, "notes": k, "prime_limit": P, "primes": primes,
                        "method": "A+B vs A-B",
                        "A": [str(ratio_of(v, primes)) for v in sorted(A)],
                        "B": [str(ratio_of(v, primes)) for v in sorted(B)],
                        "members": [{"lattice": [list(v) for v in c1], "ratios": [str(r) for r in sc1]},
                                    {"lattice": [list(v) for v in c2], "ratios": [str(r) for r in sc2]}],
                        "interval_classes": ics,
                        "distinct_interval_classes": len(set(ics)),
                        "complexity": round(cost, 2),
                    }) + "\n")
                summary.append((P, k, len(best), attempts))
                print(f"  {P}-limit, {k} notes: kept {len(best)} of {len(found)} distinct pairs "
                      f"({attempts:,} attempts)", flush=True)
    with open(os.path.join(outdir, "summary_constructed.csv"), "w") as fh:
        fh.write("prime_limit,notes,families_kept,attempts\n")
        for row in summary:
            fh.write(",".join(map(str, row)) + "\n")
    print(f"Done. Results in {fam_path} and {outdir}/summary_constructed.csv")


# ----------------------------------------------------------------- EDO mode

def edo_iv(gaps, N):
    pos = [0]
    for g in gaps[:-1]:
        pos.append(pos[-1] + g)
    iv = [0] * (N // 2 + 1)
    for i in range(len(pos)):
        for j in range(i + 1, len(pos)):
            d = pos[j] - pos[i]
            iv[min(d, N - d)] += 1
    return iv


def is_canon_gaps(g):
    """True if g is the smallest of all its rotations and reversed rotations."""
    k, m = len(g), g[0]
    for r in range(1, k):
        if g[r] == m and g[r:] + g[:r] < g:
            return False
    rg = g[::-1]
    for r in range(k):
        if rg[r] == m and rg[r:] + rg[:r] < g:
            return False
    return True


def edo_job(job):
    N, k, m, g1 = job
    shards = _G["shards"]
    out = defaultdict(list)
    count = 0
    gaps = [m, g1]

    def rec(remaining, slots):
        nonlocal count
        if slots == 1:
            if remaining >= m:
                g = tuple(gaps) + (remaining,)
                if is_canon_gaps(g):
                    iv = edo_iv(g, N)
                    h = key_hash(tuple(iv))
                    out[int(h, 16) % shards].append(f"{h}\t{' '.join(map(str, g))}\n")
                    count += 1
            return
        for x in range(m, remaining - m * (slots - 1) + 1):
            gaps.append(x)
            rec(remaining - x, slots - 1)
            gaps.pop()

    if k == 2:
        rec(N - m, 1)
    else:
        rec(N - m - g1, k - 2)
    return job, count, dict(out)


def _init_edo(shards, low):
    if low:
        lower_priority()
    _G["shards"] = shards


def gaps_to_slots(g):
    pos = [0]
    for x in g[:-1]:
        pos.append(pos[-1] + x)
    return pos


def slots_to_canon_gaps(S, N):
    S = sorted(S)
    g = [(S[(i + 1) % len(S)] - S[i]) % N or N for i in range(len(S))]
    best = None
    for seq in (g, g[::-1]):
        for r in range(len(seq)):
            t = tuple(seq[r:] + seq[:r])
            if best is None or t < best:
                best = t
    return best


def edo_mode(args):
    outdir = args.out or f"results_edo_{args.edo_min}_{args.edo_max}"
    os.makedirs(outdir, exist_ok=True)
    lo_k = max(2, args.min_notes)
    jobs_all = []
    for N in range(args.edo_min, args.edo_max + 1):
        for k in range(lo_k, N // 2 + 1):
            if k < 2:
                continue
            for m in range(1, N // k + 1):
                if k == 2:
                    jobs_all.append((N, k, m, 0))
                else:
                    for g1 in range(m, N - m * (k - 1) + 1):
                        jobs_all.append((N, k, m, g1))
    done_path = os.path.join(outdir, "done_jobs.txt")
    done = set()
    if os.path.exists(done_path):
        with open(done_path) as fh:
            done = {tuple(map(int, l.split())) for l in fh if l.strip()}
    jobs = [j for j in jobs_all if j not in done]
    print(f"Pass 1: rings {args.edo_min} to {args.edo_max}, up to half of each ring "
          f"(the rest come from complements); {len(jobs)} jobs to run, {len(done)} done", flush=True)
    t0 = time.time()
    handles = {}

    def handle(N, k, s):
        key = (N, k, s)
        if key not in handles:
            d = os.path.join(outdir, f"N{N}", f"k{k}")
            os.makedirs(d, exist_ok=True)
            handles[key] = open(os.path.join(d, f"shard_{s:03d}.tsv"), "a")
        return handles[key]

    if jobs:
        with Pool(args.workers, initializer=_init_edo,
                  initargs=(args.shards, not args.normal_priority)) as pool, \
                open(done_path, "a") as dfh:
            finished = 0
            for job, count, out in pool.imap_unordered(edo_job, jobs, chunksize=4):
                N, k = job[0], job[1]
                for s_, lines in out.items():
                    handle(N, k, s_).writelines(lines)
                for h in handles.values():
                    h.flush()
                dfh.write(" ".join(map(str, job)) + "\n")
                dfh.flush()
                finished += 1
                if finished % max(1, len(jobs) // 20) == 0 or finished == len(jobs):
                    print(f"    {finished}/{len(jobs)} jobs, {(time.time()-t0)/60:.1f} min", flush=True)
        for h in handles.values():
            h.close()

    print("Pass 2: grouping by interval vector", flush=True)
    fam_path = os.path.join(outdir, "edo_families.jsonl")
    rows = []
    fam_no = 0
    with open(fam_path, "w") as fh:
        for N in range(args.edo_min, args.edo_max + 1):
            per_k = {}
            for k in range(lo_k, N // 2 + 1):
                d = os.path.join(outdir, f"N{N}", f"k{k}")
                classes, fams = 0, []
                if os.path.isdir(d):
                    for name in sorted(os.listdir(d)):
                        groups = defaultdict(set)
                        with open(os.path.join(d, name)) as sh:
                            for line in sh:
                                h, g = line.rstrip("\n").split("\t")
                                groups[h].add(g)
                        classes += sum(len(v) for v in groups.values())
                        for h, ms in groups.items():
                            if len(ms) < 2:
                                continue
                            exact = defaultdict(list)
                            for g in ms:
                                gt = tuple(map(int, g.split()))
                                exact[tuple(edo_iv(gt, N))].append(gt)
                            for iv, gs in exact.items():
                                if len(gs) > 1:
                                    fams.append((iv, sorted(gs)))
                per_k[k] = (classes, fams)
            for k in range(lo_k, N):
                if k <= N // 2:
                    classes, fams = per_k.get(k, (0, []))
                    derived = False
                else:
                    classes, base = per_k.get(N - k, (0, []))
                    fams, derived = [], True
                    for iv, gs in base:
                        comp = [slots_to_canon_gaps(set(range(N)) - set(gaps_to_slots(g)), N) for g in gs]
                        comp = sorted(set(comp))
                        if len(comp) > 1:
                            fams.append((tuple(edo_iv(comp[0], N)), comp))
                    if N - k < lo_k:
                        continue
                for iv, gs in fams:
                    fam_no += 1
                    fh.write(json.dumps({
                        "family": fam_no, "edo": N, "notes": k,
                        "members": [{"name": "⟨" + " ".join(map(str, g)) + "⟩",
                                     "gaps": list(g), "slots": gaps_to_slots(g)} for g in gs],
                        "interval_vector": list(iv[1:]),
                        "from_complement": derived,
                    }) + "\n")
                rows.append((N, k, classes, len(fams), sum(len(g) for _, g in fams)))
            print(f"  {N}-EDO: " + ", ".join(f"{k}:{f}" for (n_, k, c, f, z) in rows if n_ == N and f), flush=True)
    with open(os.path.join(outdir, "summary_edo.csv"), "w") as fh:
        fh.write("edo,notes,set_classes,z_families,z_sets\n")
        for r in rows:
            fh.write(",".join(map(str, r)) + "\n")
    print(f"Done in {(time.time()-t0)/60:.1f} min. Results in {fam_path} and {outdir}/summary_edo.csv")
    return rows

# ----------------------------------------------------------------- gamut mode

def factor_vec(r, primes):
    v = []
    n, d = r.numerator, r.denominator
    for p in primes:
        e = 0
        while n % p == 0:
            n //= p
            e += 1
        while d % p == 0:
            d //= p
            e -= 1
        v.append(e)
    while n % 2 == 0:
        n //= 2
    while d % 2 == 0:
        d //= 2
    if n != 1 or d != 1:
        raise ValueError(f"{r} has a prime outside {primes}")
    return tuple(v)


def odd_primes_upto(q):
    return [p for p in range(3, q + 1, 2) if all(p % x for x in range(3, int(p ** 0.5) + 1, 2))]


def build_gamut(args):
    if args.gamut:
        rs = sorted({octave_reduce(Fraction(t)) for t in args.gamut.replace(",", " ").split()})
    else:
        q = args.gamut_odd_limit
        odds = range(1, q + 1, 2)
        rs = sorted({octave_reduce(Fraction(a, b)) for a in odds for b in odds})
    maxp = 3
    for r in rs:
        for x in (r.numerator, r.denominator):
            for p in range(3, x + 1, 2):
                if x % p == 0:
                    maxp = max(maxp, p)
    primes = args.gamut_primes or odd_primes_upto(maxp)
    keep = []
    for r in rs:
        try:
            keep.append((r, factor_vec(r, primes)))
        except ValueError:
            pass
    return keep, primes


# Fast gamut search.
#   Pass 1: every k-note subset of the gamut is visited once, building subsets
#           one note at a time. Two 48-bit fingerprints are updated as each note
#           is added: one for its interval content (which Z-partners share) and
#           one for its set class up to transposition and inversion (which
#           partners do not share). Each worker writes 12 bytes per subset to
#           its own shard files.
#   Pass 2: per shard, find interval fingerprints that occur with two or more
#           different class fingerprints: these are Z-relation candidates.
#   Pass 3: revisit every subset, and for the few whose interval fingerprint is
#           a candidate, compute the exact interval content and set class.
#   Final:  group the candidates exactly and write the Z-families.
# Fingerprints are random 64-bit values summed over pairs or points, so equal
# sets always match and different ones collide only with negligible chance;
# every reported family is verified exactly.

M64 = (1 << 64) - 1
M48 = (1 << 48) - 1
REC = 12


def h64(tag, obj):
    return int.from_bytes(hashlib.blake2b((tag + repr(obj)).encode(), digest_size=8).digest(), "little")


def gamut_tables(pts):
    g = len(pts)
    PR = [[0] * g for _ in range(g)]
    D = [[0] * g for _ in range(g)]
    for a in range(g):
        for b in range(g):
            if a == b:
                continue
            d = tuple(x - y for x, y in zip(pts[b], pts[a]))
            PR[a][b] = h64("iv", sign_norm(d))
            D[a][b] = h64("pt", d)
    R0 = h64("pt", tuple(0 for _ in pts[0]))
    return PR, D, R0


def gamut_jobs(g, k):
    p = 1 if k <= 3 else (2 if k <= 5 else 3)
    jobs = []
    for pre in itertools.combinations(range(g), p):
        if pre[-1] <= g - (k - p) - 1 or k == p:
            from math import comb
            jobs.append((comb(g - pre[-1] - 1, k - p), pre))
    jobs.sort(reverse=True)
    return [pre for _, pre in jobs]


def _init_fast(state):
    _G.clear()
    _G.update(state)
    if state.get("low"):
        lower_priority()
    _G["bufs"] = None
    _G["buffered"] = 0
    _G["pending"] = []
    from multiprocessing import util
    util.Finalize(None, _flush_worker, exitpriority=10)


def _flush_worker():
    """Write this worker's buffered records, then mark their jobs done.
    Jobs are only logged as done after their data is on disk, so an
    interrupted run simply redoes them."""
    bufs = _G.get("bufs")
    if not bufs and not _G.get("pending"):
        return
    d = _worker_dir()
    if bufs:
        for s_, buf in enumerate(bufs):
            if buf:
                with open(os.path.join(d, f"s{s_:05d}.bin"), "ab") as fh:
                    fh.write(buf)
                bufs[s_] = bytearray()
    if _G.get("pending"):
        with open(os.path.join(d, "done1.txt"), "a") as fh:
            fh.writelines(_G["pending"])
        _G["pending"] = []
    _G["buffered"] = 0


def _worker_dir():
    d = os.path.join(_G["kdir"], f"w{os.getpid()}")
    os.makedirs(d, exist_ok=True)
    return d


def fast_pass1_job(pre):
    k, g, PR, D, R0, S = _G["k"], _G["g"], _G["PR"], _G["D"], _G["R0"], _G["shards"]
    if _G["bufs"] is None:
        _G["bufs"] = [bytearray() for _ in range(S)]
    bufs = _G["bufs"]
    chosen = list(pre)
    f = pre[0]
    Df = D[f]
    hiv = 0
    for a in range(len(pre)):
        for b in range(a):
            hiv += PR[pre[a]][pre[b]]
    hA = R0 + sum(Df[x] for x in pre[1:])
    count = 0

    def leaf(h, hA_, last):
        nonlocal count
        hB = R0
        for j in chosen:
            hB += D[j][last]
        iv = h & M48
        a, b = hA_ & M64, hB & M64
        cls = (a if a < b else b) & M48
        bufs[iv % S].extend(iv.to_bytes(6, "little") + cls.to_bytes(6, "little"))
        count += 1

    def rec(start, h, ha):
        depth = len(chosen)
        need = k - depth
        if need == 1:
            for x in range(start, g):
                row = PR[x]
                hh = h
                for j in chosen:
                    hh += row[j]
                leaf(hh, ha + Df[x], x)
            return
        for x in range(start, g - need + 1):
            row = PR[x]
            hh = h
            for j in chosen:
                hh += row[j]
            chosen.append(x)
            rec(x + 1, hh, ha + Df[x])
            chosen.pop()

    if len(chosen) == k:
        last = chosen[-1]
        chosen.pop()
        leaf(hiv, hA, last)
    else:
        rec(pre[-1] + 1, hiv, hA)
    _G["pending"].append(" ".join(map(str, pre)) + f"\t{count}\n")
    _G["buffered"] += count * REC
    if _G["buffered"] >= _G.get("flush_bytes", 128 << 20):
        _flush_worker()
    return count


def fast_pass2_shard(s_):
    kdir = _G["kdir"]
    data = bytearray()
    for w in os.listdir(kdir):
        for name in (f"s{s_:05d}.bin", f"s{s_:04d}.bin"):   # current and earlier file names
            p = os.path.join(kdir, w, name)
            if w.startswith("w") and os.path.exists(p):
                with open(p, "rb") as fh:
                    b = fh.read()
                data.extend(b[: len(b) - len(b) % REC])
    try:
        import numpy as np
        raw = np.frombuffer(bytes(data), dtype=np.uint8).reshape(-1, REC)
        if raw.shape[0] == 0:
            return 0, []
        buf = np.zeros((raw.shape[0], 16), dtype=np.uint8)
        buf[:, 0:6] = raw[:, 0:6]
        buf[:, 8:14] = raw[:, 6:12]
        both = buf.view("<u8").reshape(-1, 2)
        iv, cls = both[:, 0], both[:, 1]
        order = np.lexsort((cls, iv))
        iv, cls = iv[order], cls[order]
        keep = np.ones(len(iv), dtype=bool)
        keep[1:] = (iv[1:] != iv[:-1]) | (cls[1:] != cls[:-1])
        iv = iv[keep]
        classes = int(len(iv))
        dup = iv[1:] == iv[:-1]
        cand = np.unique(iv[1:][dup])
        return classes, [int(x) for x in cand]
    except ImportError:
        first = {}
        cand = set()
        pairs = set()
        mv = memoryview(data)
        for o in range(0, len(mv), REC):
            iv = int.from_bytes(mv[o:o + 6], "little")
            cls = int.from_bytes(mv[o + 6:o + 12], "little")
            pairs.add((iv, cls))
            c0 = first.setdefault(iv, cls)
            if c0 != cls:
                cand.add(iv)
        return len(pairs), list(cand)


def fast_pass3_job(pre):
    k, g, PR, pts, cand = _G["k"], _G["g"], _G["PR"], _G["pts"], _G["cand"]
    chosen = list(pre)
    hiv = 0
    for a in range(len(pre)):
        for b in range(a):
            hiv += PR[pre[a]][pre[b]]
    hits = []

    def check(h, last):
        if (h & M48) in cand:
            S = [pts[i] for i in chosen] + ([pts[last]] if last is not None else [])
            hits.append(set_str(canonical(S)) + "\n")

    def rec(start, h):
        need = k - len(chosen)
        if need == 1:
            for x in range(start, g):
                row = PR[x]
                hh = h
                for j in chosen:
                    hh += row[j]
                check(hh, x)
            return
        for x in range(start, g - need + 1):
            row = PR[x]
            hh = h
            for j in chosen:
                hh += row[j]
            chosen.append(x)
            rec(x + 1, hh)
            chosen.pop()

    if len(chosen) == k:
        check(hiv, None)
    else:
        rec(pre[-1] + 1, hiv)
    d = _worker_dir()
    if hits:
        with open(os.path.join(d, "cand.tsv"), "a") as fh:
            fh.writelines(hits)
    with open(os.path.join(d, "done3.txt"), "a") as fh:
        fh.write(" ".join(map(str, pre)) + "\n")
    return len(hits)


def _read_done(kdir, name):
    done, total = set(), 0
    if os.path.isdir(kdir):
        for w in os.listdir(kdir):
            p = os.path.join(kdir, w, name)
            if w.startswith("w") and os.path.exists(p):
                with open(p) as fh:
                    for line in fh:
                        parts = line.rstrip("\n").split("\t")
                        if parts[0].strip():
                            done.add(tuple(int(x) for x in parts[0].split()))
                            if len(parts) > 1:
                                total += int(parts[1])
    return done, total


def _fmt_dur(sec):
    sec = max(0, int(sec))
    h, r = divmod(sec, 3600)
    m, s_ = divmod(r, 60)
    return f"{h}h {m:02d}m" if h else (f"{m}m {s_:02d}s" if m else f"{s_}s")


class Progress:
    """Prints progress by share of the actual work, with time remaining,
    every 2% of the work or at least once a minute."""

    def __init__(self, label, total_weight, n_items):
        self.label, self.total, self.n = label, max(1, total_weight), n_items
        self.done_w, self.done_n = 0, 0
        self.start = self.last = time.time()
        self.last_pct = 0.0

    def step(self, w=1):
        self.done_w += w
        self.done_n += 1
        now = time.time()
        pct = 100.0 * self.done_w / self.total
        if pct - self.last_pct >= 2 or now - self.last >= 60 or self.done_n == self.n:
            el = now - self.start
            eta = el * (self.total - self.done_w) / self.done_w if self.done_w else 0
            print(f"    {self.label}: {pct:5.1f}% of the work ({self.done_n:,}/{self.n:,}), "
                  f"{_fmt_dur(el)} elapsed, about {_fmt_dur(eta)} left", flush=True)
            self.last, self.last_pct = now, pct


def _run_pool(func, items, state, label, t0, workers, weights=None):
    n = len(items)
    if not n:
        return
    w = weights or {}
    prog = Progress(label, sum(w.get(it, 1) for it in items), n)
    pool = Pool(workers, initializer=_init_fast, initargs=(state,))
    try:
        # results come back in the order jobs finish; weight each finished job by its size
        for it, _ in pool.imap_unordered(_tagged, [(func, it) for it in items]):
            prog.step(w.get(it, 1))
        pool.close()      # let workers exit normally so they write their buffers
        pool.join()
    except BaseException:
        pool.terminate()
        raise


def _tagged(arg):
    func, it = arg
    return it, func(it)


def gamut_mode(args):
    from math import comb
    gamut, primes = build_gamut(args)
    gamut.sort(key=lambda rv: rv[1])          # lexicographic: first chosen = lowest point
    g = len(gamut)
    pts = [v for _, v in gamut]
    total = sum(comb(g, k) for k in range(args.min_notes, args.max_notes + 1))
    rate = 1500000 if sys.implementation.name == "pypy" else 400000
    est_h = 2 * total / (rate * args.workers) / 3600
    est_gb = total * REC / 1e9
    print(f"Gamut: {g} pitches, primes {primes}; {args.min_notes} to {args.max_notes} notes = "
          f"{total:,} subsets; very roughly {est_h:.1f} h on {args.workers} workers "
          f"({sys.implementation.name}) and {est_gb:.1f} GB of working files", flush=True)
    if est_h > 48 and not args.force:
        print("That is more than two days. Lower --max-notes, or add --force to run anyway.")
        for k in range(args.min_notes, args.max_notes + 1):
            t = sum(comb(g, j) for j in range(args.min_notes, k + 1))
            print(f"  up to {k} notes: {t:,} subsets, about {2*t/(rate*args.workers)/3600:.1f} h, {t*REC/1e9:.1f} GB")
        return
    outdir = args.out or (f"results_gamut_odd{args.gamut_odd_limit}" if not args.gamut else "results_gamut_custom")
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "gamut.txt"), "w") as fh:
        fh.write(" ".join(str(r) for r, _ in gamut) + "\n")
    PR, D, R0 = gamut_tables(pts)
    t0 = time.time()
    fam_path = os.path.join(outdir, "families.jsonl")
    rng_k = range(args.min_notes, args.max_notes + 1)
    kept_fams, kept_rows = [], []
    if os.path.exists(fam_path):            # keep results for sizes this run doesn't cover
        with open(fam_path) as fh:
            kept_fams = [l for l in fh if l.strip() and json.loads(l)["notes"] not in rng_k]
    sum_path = os.path.join(outdir, "summary.csv")
    if os.path.exists(sum_path):
        with open(sum_path) as fh:
            kept_rows = [l.strip().split(",") for l in fh.readlines()[1:] if l.strip()]
            kept_rows = [r for r in kept_rows if int(r[0]) not in rng_k]
    with open(fam_path, "w") as fh:
        fh.writelines(kept_fams)
    summary = []
    fam_no = max([json.loads(l)["family"] for l in kept_fams], default=0)
    for k in range(args.min_notes, args.max_notes + 1):
        kdir = os.path.join(outdir, f"k{k}")
        os.makedirs(kdir, exist_ok=True)
        jobs = gamut_jobs(g, k)
        sh_path = os.path.join(kdir, "shards.txt")
        if os.path.exists(sh_path):
            with open(sh_path) as fh:
                shards_k = int(fh.read().strip())
        else:
            shards_k = args.shards
            while comb(g, k) / shards_k > 4_000_000:      # keep each shard small enough for memory
                shards_k *= 2
            with open(sh_path, "w") as fh:
                fh.write(str(shards_k))
        state = dict(k=k, g=g, PR=PR, D=D, R0=R0, pts=pts, shards=shards_k, kdir=kdir,
                     low=not args.normal_priority, flush_bytes=int(args.flush_mb * (1 << 20)))
        done1, _ = _read_done(kdir, "done1.txt")
        todo = [j for j in jobs if j not in done1]
        if todo:
            import shutil
            need = comb(g, k) * REC * len(todo) / max(1, len(jobs))
            free = shutil.disk_usage(outdir).free
            if need > 0.95 * free and not args.force:
                print(f"  k={k} needs about {need/1e9:.0f} GB of working files but only "
                      f"{free/1e9:.0f} GB is free. Stopping; free up space, lower --max-notes, "
                      f"or add --force.", flush=True)
                break
        print(f"  k={k}: {comb(g, k):,} subsets in {len(jobs)} jobs ({len(jobs)-len(todo)} done)", flush=True)
        sizes = {pre: comb(g - pre[-1] - 1, k - len(pre)) for pre in jobs}
        _run_pool(fast_pass1_job, todo, state, f"k={k} pass 1", t0, args.workers, sizes)
        cand_path = os.path.join(kdir, "candidates.txt")
        if os.path.exists(cand_path):
            with open(cand_path) as fh:
                lines = fh.read().split()
            classes, cand = int(lines[0]), {int(x) for x in lines[1:]}
        else:
            # pass 2, one shard at a time; each finished shard is saved so it can resume
            p2dir = os.path.join(kdir, "pass2")
            os.makedirs(p2dir, exist_ok=True)
            classes, cand, todo2 = 0, set(), []
            for s_ in range(shards_k):
                p = os.path.join(p2dir, f"s{s_:05d}.txt")
                if os.path.exists(p):
                    with open(p) as fh:
                        vals = fh.read().split()
                    if vals:
                        classes += int(vals[0])
                        cand.update(int(x) for x in vals[1:])
                        continue
                todo2.append(s_)
            print(f"    k={k} pass 2: grouping {shards_k:,} shards ({shards_k-len(todo2):,} already done)", flush=True)
            prog = Progress(f"k={k} pass 2", len(todo2), len(todo2))
            pool = Pool(args.workers, initializer=_init_fast, initargs=(state,))
            try:
                for s_, (c, cs) in pool.imap_unordered(_tagged, [(fast_pass2_shard, x) for x in todo2]):
                    with open(os.path.join(p2dir, f"s{s_:05d}.tmp"), "w") as fh:
                        fh.write(f"{c}\n" + "\n".join(map(str, cs)) + "\n")
                    os.replace(os.path.join(p2dir, f"s{s_:05d}.tmp"), os.path.join(p2dir, f"s{s_:05d}.txt"))
                    classes += c
                    cand.update(cs)
                    prog.step(1)
                pool.close()
                pool.join()
            except BaseException:
                pool.terminate()
                raise
            with open(cand_path, "w") as fh:
                fh.write(f"{classes}\n" + "\n".join(map(str, cand)) + "\n")
        print(f"    k={k}: {classes:,} set classes, {len(cand)} candidate fingerprints", flush=True)
        members_by_key = defaultdict(set)
        if cand:
            state["cand"] = cand
            done3, _ = _read_done(kdir, "done3.txt")
            todo3 = [j for j in jobs if j not in done3]
            _run_pool(fast_pass3_job, todo3, state, f"k={k} pass 3", t0, args.workers, sizes)
            for w in os.listdir(kdir):
                p = os.path.join(kdir, w, "cand.tsv")
                if w.startswith("w") and os.path.exists(p):
                    with open(p) as fh:
                        for line in fh:
                            c = line.strip()
                            if c:
                                members_by_key[repr(interval_key(parse_set(c)))].add(c)
        fams = 0
        with open(fam_path, "a") as fam_fh:
            for key, ms in members_by_key.items():
                if len(ms) < 2:
                    continue
                fams += 1
                fam_no += 1
                sets = [parse_set(c) for c in sorted(ms)]
                scales = [best_scale(S_, primes) for S_ in sets]
                ics = sorted((str(interval_class(y / x)) for x, y in itertools.combinations(scales[0], 2)),
                             key=lambda t: Fraction(t))
                fam_fh.write(json.dumps({
                    "family": fam_no, "notes": k, "primes": primes, "gamut_size": g,
                    "members": [{"lattice": [list(v) for v in S_], "ratios": [str(r) for r in sc]}
                                for S_, sc in zip(sets, scales)],
                    "interval_classes": ics, "distinct_interval_classes": len(set(ics)),
                }) + "\n")
        summary.append((k, comb(g, k), classes, fams))
        print(f"  k={k}: {fams} Z-families", flush=True)
        if args.cleanup:
            for w in os.listdir(kdir):
                wd = os.path.join(kdir, w)
                if w.startswith("w") and os.path.isdir(wd):
                    for name in os.listdir(wd):
                        if name.endswith(".bin"):
                            os.remove(os.path.join(wd, name))
    rows = [list(map(str, r)) + [str(g)] for r in summary] + kept_rows
    rows.sort(key=lambda r: int(r[0]))
    with open(sum_path, "w") as fh:
        fh.write("notes,subsets,set_classes,z_families,gamut_size\n")
        for r in rows:
            fh.write(",".join(r) + "\n")
    print(f"Done in {(time.time()-t0)/60:.1f} min. Results in {fam_path} and {outdir}/summary.csv")


# ----------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--primes", type=int, nargs="+", default=[3, 5],
                    help="odd primes of the lattice (default: 3 5)")
    ap.add_argument("--span", type=int, default=4,
                    help="largest exponent range per prime within a set (default 4)")
    ap.add_argument("--min-notes", type=int, default=4)
    ap.add_argument("--max-notes", type=int, default=6)
    ap.add_argument("--workers", type=int, default=None,
                    help="number of worker processes (overrides --cpu-percent)")
    ap.add_argument("--cpu-percent", type=float, default=90,
                    help="share of CPU cores to use when --workers isn't given (default 90)")
    ap.add_argument("--normal-priority", action="store_true",
                    help="don't lower the process priority")
    ap.add_argument("--shards", type=int, default=64,
                    help="number of shard files per note count (more = less memory in pass 2)")
    ap.add_argument("--out", default=None, help="output directory")
    ap.add_argument("--collect-only", action="store_true", help="skip pass 1")
    ap.add_argument("--construct", action="store_true",
                    help="build Z-pairs as A+B vs A-B instead of searching exhaustively")
    ap.add_argument("--notes", type=int, nargs="+", default=[9, 12],
                    help="construction: note counts to build; each must be a product of two sizes of at least 3 (9, 12, 15, 16, ...)")
    ap.add_argument("--per", type=int, default=50,
                    help="construction: families to keep per prime limit and note count")
    ap.add_argument("--exp-range", type=int, default=1,
                    help="construction: largest exponent used in A and B (default 1)")
    ap.add_argument("--tries", type=int, default=400,
                    help="construction: attempts allowed per family wanted")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--edo", action="store_true", help="search equal divisions")
    ap.add_argument("--edo-min", type=int, default=5)
    ap.add_argument("--edo-max", type=int, default=31)
    ap.add_argument("--gamut-odd-limit", type=int, default=None,
                    help="search subsets of all ratios within this odd limit")
    ap.add_argument("--gamut", default=None, help='search subsets of these ratios, e.g. "1/1 9/8 5/4 ..."')
    ap.add_argument("--gamut-primes", type=int, nargs="+", default=None,
                    help="keep only gamut ratios built from these odd primes")
    ap.add_argument("--force", action="store_true", help="gamut mode: run even if the estimate is very large")
    ap.add_argument("--flush-mb", type=float, default=128,
                    help="gamut mode: memory each worker buffers before writing (default 128 MB)")
    ap.add_argument("--cleanup", action="store_true",
                    help="gamut mode: delete each note count's working files once its families are written")
    ap.add_argument("--test", action="store_true",
                    help="5-limit, span 4, 6 notes: should find exactly 2 families")
    args = ap.parse_args()
    cores = os.cpu_count() or 1
    if args.workers is None:
        args.workers = max(1, int(cores * args.cpu_percent / 100))
    args.workers = max(1, min(args.workers, cores))
    if not args.normal_priority:
        lower_priority()
    print(f"Using {args.workers} of {cores} CPU cores"
          f"{'' if args.normal_priority else ', at below-normal priority'}", flush=True)

    if args.edo:
        if args.min_notes == 4 and "--min-notes" not in sys.argv:
            args.min_notes = 3
        edo_mode(args)
        return
    if args.gamut_odd_limit or args.gamut:
        if "--shards" not in sys.argv:
            args.shards = 256
        if "--min-notes" not in sys.argv:
            args.min_notes = 3
        if "--max-notes" not in sys.argv:
            args.max_notes = 12
        gamut_mode(args)
        return
    if args.construct:
        print(f"Construction: prime limits {args.primes}, notes {args.notes}, keeping {args.per} each", flush=True)
        construct_mode(args)
        return
    if args.test:
        args.primes, args.span, args.min_notes, args.max_notes = [3, 5], 4, 6, 6
        args.out = args.out or "results_test"
    primes = args.primes
    n = len(primes)
    outdir = args.out or f"results_{'_'.join(map(str, primes))}_span{args.span}"
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "params.json"), "w") as fh:
        json.dump({"primes": primes, "span": args.span, "min_notes": args.min_notes,
                   "max_notes": args.max_notes, "shards": args.shards}, fh)

    t0 = time.time()
    if not args.collect_only:
        print(f"Pass 1: enumerating sets (primes {primes}, span {args.span}, "
              f"{args.min_notes}-{args.max_notes} notes, {args.workers} workers)", flush=True)
        for k in range(args.min_notes, args.max_notes + 1):
            enumerate_k(args, n, k, outdir)
    print("Pass 2: grouping by interval content", flush=True)
    summary = collect(args, n, primes, outdir)
    print(f"Done in {(time.time()-t0)/60:.1f} min. Results in {outdir}/families.jsonl "
          f"and {outdir}/summary.csv", flush=True)
    if args.test:
        fams = sum(f for _, _, f in summary)
        print("TEST", "PASSED" if fams == 2 else f"FAILED (found {fams}, expected 2)")


if __name__ == "__main__":
    main()
