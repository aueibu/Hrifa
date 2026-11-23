#!/usr/bin/env python3
"""chordsum.py: how many Z-families are a "chord sum" pair  P = A·U,  Q = A⁻¹·U ?

A = a chord with all coefficients 1 (3 notes; 4 notes for 16-note families), A⁻¹ = its mirror
(1/(a:b:c) for A = a:b:c), U = the second factor, a plain set (0/1 coefficients), A·U = the product
set with no product landing twice. This is conjecture T (THEORY_SMALL_FACTOR.md, section 5) in its
plain form; see section 6 for the results.

Exact, plain CPython, no sympy (uses smallfactor.three_term / m_term; candidates = P - P).
For each family reports the chord factors found, |U| and whether U is plain; summary: families by
(notes, #chords), the chord vocabulary (up to transposition and inversion) ranked by families, and
distinct chords by highest prime.

usage: python chordsum.py LIST_DIR [--top N]     (LIST_DIR holds k*/families.jsonl, e.g. an unpacked
       data/proven/*.tar.xz)                      ~33 s for 19-limit q <= 135 (3,735 families)
"""
import argparse, collections, glob, json, os, sys, time
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import smallfactor as sf


def ratio(v, primes):
    r = Fraction(1)
    for p, e in zip(primes, v):
        r *= Fraction(p) ** e
    while r >= 2:
        r /= 2
    while r < 1:
        r *= 2
    return r


def canon(pts):
    """chord up to transposition and inversion"""
    best = None
    for sgn in (1, -1):
        P = [tuple(sgn * x for x in p) for p in pts]
        for r in P:
            c = tuple(sorted(sf.sub(p, r) for p in P))
            if best is None or c < best:
                best = c
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("list_dir")
    ap.add_argument("--top", type=int, default=25)
    a = ap.parse_args()
    fams = [json.loads(l) for fn in sorted(glob.glob(os.path.join(a.list_dir, "k*", "families.jsonl")))
            for l in open(fn)]
    t0 = time.time()
    primes = None
    shape = collections.Counter()      # (k, #chord factors, |U|, U plain?)
    vocab = collections.Counter()
    byk = collections.defaultdict(collections.Counter)
    plain_sum = 0
    for f in fams:
        k = f["notes"]
        primes = f["primes"]
        mem = [[tuple(p) for p in m["lattice"]] for m in f["members"]]
        P = sf.shift0(mem[0])
        z = (0,) * len(P[0])
        cands = [c for c in sorted({sf.sub(x, y) for x in P for y in P}) if c > z]
        found = {}                     # canonical chord -> (|U|, U plain)
        for Q in (mem[1], [sf.neg(p) for p in mem[1]]):
            Q0 = sf.shift0(Q)
            if k % 3 == 0:
                for s, t, x, y, U in sf.three_term(P, Q0, cands):
                    if s == t == 1:
                        c = canon([z, x, y])
                        found[c] = max(found.get(c, (0, False)), (len(U), min(U.values()) > 0))
            elif k % 4 == 0:
                for V, U in sf.m_term(P, Q0, cands, 4, signs=(1,)):
                    c = canon(list(V))
                    found[c] = max(found.get(c, (0, False)), (len(U), min(U.values()) > 0))
        plain = [c for c, (_, ok) in found.items() if ok]
        if plain:
            plain_sum += 1
        u = max(found.values()) if found else (0, False)
        shape[(k, len(found), u[0], "plain U" if u[1] else ("signed U" if found else "no chord"))] += 1
        for c in plain:
            vocab[c] += 1
            byk[k][c] += 1
    print(f"{len(fams)} families, {time.time() - t0:.0f} s; chord-sum pairs (plain chord, plain U): "
          f"{plain_sum} ({plain_sum / max(1, len(fams)):.1%})")
    print("(notes, #chord factors, |U|, U):")
    for key, n in sorted(shape.items()):
        print(f"  {key}: {n}")
    print(f"distinct chords: {len(vocab)}")
    name = lambda c: "{" + ", ".join(str(ratio(p, primes)) for p in sorted(c, key=lambda p: ratio(p, primes))) + "}"
    for c, n in vocab.most_common(a.top):
        print(f"  {n:6d}  {name(c)}  by notes {dict((k, byk[k][c]) for k in sorted(byk) if byk[k][c])}")
    lim = collections.Counter()
    for c in vocab:
        lim[max([primes[i] for i in range(len(primes)) if any(p[i] for p in c)] or [1])] += 1
    print("distinct chords by highest prime:", dict(sorted(lim.items())))
    sizes = sorted(vocab.values(), reverse=True)
    tot = sum(sizes)
    for share in (0.5, 0.8, 0.95):
        s = 0
        for i, n in enumerate(sizes):
            s += n
            if s >= share * tot:
                print(f"{share:.0%} of (family, chord) hits come from the top {i + 1} chords")
                break


if __name__ == "__main__":
    main()
